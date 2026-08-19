import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, RefreshCw, Sparkles, Loader2, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Download, FileSpreadsheet, Calendar, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAllRunrunitProjects,
  fetchAllProjectPeople,
  setProjectTracking,
  setProjectsTrackingBulk,
  ignoreNewCandidate,
  ignoreAllNewCandidates,
  invokeSyncSingleProject,
  invokeDiscoverProjects,
  invokeSyncVisibleProjects,
  allocateProjectToMonthlyLanes,
  reallocateAllTrackedProjects,
  type RunrunitProject,
} from "@/lib/projects";
import { exportProjectsToExcel } from "@/lib/export-projects";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RequireLevel } from "@/components/RequireLevel";
import { HierarchicalDateFilter } from "@/components/ui/hierarchical-date-filter";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/selecionar-projetos")({
  head: () => ({
    meta: [
      { title: "Selecionar Projetos · Runrun.it" },
      {
        name: "description",
        content: "Escolha quais projetos importados do Runrun.it aparecem no dashboard interno.",
      },
    ],
  }),
  component: () => (
    <RequireLevel allow={["administrador"]}>
      <SelecionarProjetosPage />
    </RequireLevel>
  ),
});

const ALL = "__all__";

type Situation = "all" | "tracked" | "untracked" | "new";

const SITUATION_LABEL: Record<Situation, string> = {
  all: "Todos disponíveis",
  tracked: "Apenas exibidos no dashboard",
  untracked: "Apenas não exibidos",
  new: "Novos projetos encontrados",
};

function SelecionarProjetosPage() {
  const qc = useQueryClient();
  const [sortAsc, setSortAsc] = useState(true);
  const { data, isLoading, error } = useQuery({
    queryKey: ["runrunit_projects", sortAsc ? "asc" : "desc"],
    queryFn: () => fetchAllRunrunitProjects({ ascending: sortAsc }),
    staleTime: 60_000,
  });
  const { data: peopleData } = useQuery({
    queryKey: ["runrunit_project_people"],
    queryFn: fetchAllProjectPeople,
    staleTime: 60_000,
  });

  const [search, setSearch] = useState("");
  const [client, setClient] = useState<string>(ALL);
  const [group, setGroup] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [situation, setSituation] = useState<Situation>("all");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [newPeriod, setNewPeriod] = useState<"7" | "30" | "all">("7");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [ignoreAllLoading, setIgnoreAllLoading] = useState(false);
  const [importId, setImportId] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  const { data: syncStatus } = useQuery({
    queryKey: ["dashboard_sync_status", "discover_projects"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dashboard_sync_status")
        .select("last_run_at")
        .eq("sync_name", "discover_projects")
        .maybeSingle();
      if (error) throw error;
      return data as { last_run_at: string | null } | null;
    },
  });

  const handleImportSingle = async () => {
    const idNum = Number(importId.trim());
    if (!Number.isFinite(idNum) || idNum <= 0) {
      toast.error("Informe um ID numérico válido do projeto no Runrun.it");
      return;
    }
    setImportLoading(true);
    try {
      await invokeSyncSingleProject(idNum);
      toast.success(`Projeto ${idNum} sincronizado`);
      setImportId("");
      qc.invalidateQueries({ queryKey: ["runrunit_projects", sortAsc ? "asc" : "desc"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setIsImportModalOpen(false);
    } catch (e) {
      console.error("handleImportSingle error:", e);
      toast.error("Falha ao importar projeto: " + (e as Error).message);
    } finally {
      setImportLoading(false);
    }
  };

  // Regra base da tela: somente projetos abertos no Runrun.it e com data
  // desejada preenchida. A consulta já filtra no Supabase; mantemos a
  // defesa em JS por segurança.
  const rows = (data ?? []).filter(
    (r) => r.is_open === true && !!r.desired_delivery_date
  );

  const uniqueSorted = (key: keyof RunrunitProject) =>
    Array.from(
      new Set(rows.map((r) => (r[key] as string | null) ?? "").filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const clients = useMemo(() => uniqueSorted("client_name"), [rows]);
  const groups = useMemo(() => uniqueSorted("project_group_name"), [rows]);
  const availableDates = useMemo(() => uniqueSorted("desired_delivery_date"), [rows]);

  const newCandidates = useMemo(
    () => rows.filter((r) => r.is_new_candidate === true && !r.is_tracking_enabled),
    [rows]
  );

  const newCandidatesFiltered = useMemo(() => {
    const base = newCandidates;
    let cutoff: number | null = null;
    if (newPeriod === "7") cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    else if (newPeriod === "30") cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const filteredList = base.filter((r) => {
      if (cutoff === null) return true;
      const t = r.created_at_runrunit ? new Date(r.created_at_runrunit).getTime() : 0;
      return t >= cutoff;
    });
    return filteredList.sort((a, b) => {
      const ta = a.created_at_runrunit ? new Date(a.created_at_runrunit).getTime() : 0;
      const tb = b.created_at_runrunit ? new Date(b.created_at_runrunit).getTime() : 0;
      return tb - ta;
    });
  }, [newCandidates, newPeriod]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return rows.filter((r) => {
      if (situation === "tracked" && !r.is_tracking_enabled) return false;
      if (situation === "untracked" && r.is_tracking_enabled) return false;
      if (situation === "new") {
        if (r.is_tracking_enabled) return false;
        if (!r.is_new_candidate) return false;
      }
      if (client !== ALL && r.client_name !== client) return false;
      if (group !== ALL && r.project_group_name !== group) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (fromTs || toTs) {
        const t = r.created_at_runrunit ? new Date(r.created_at_runrunit).getTime() : null;
        if (!t) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      if (selectedDates.size > 0) {
        if (!r.desired_delivery_date || !selectedDates.has(r.desired_delivery_date)) return false;
      }
      return true;
    });
  }, [rows, search, client, group, dateFrom, dateTo, situation, selectedDates]);

  const trackedCount = useMemo(
    () => rows.filter((r) => r.is_tracking_enabled).length,
    [rows]
  );

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.runrunit_project_id));

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of filtered) {
        if (checked) next.add(p.runrunit_project_id);
        else next.delete(p.runrunit_project_id);
      }
      return next;
    });
  };

  const handleExportExcel = () => {
    try {
      if (filtered.length === 0) {
        toast.info("Nenhum projeto para exportar com os filtros atuais");
        return;
      }
      exportProjectsToExcel(filtered, peopleData ?? []);
      toast.success(`${filtered.length} projeto(s) exportado(s)`);
    } catch (e) {
      console.error("handleExportExcel error:", e);
      toast.error("Falha ao exportar Excel: " + (e as Error).message);
    }
  };

  const toggleOne = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const markBusy = (id: number, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggle = async (project: RunrunitProject, next: boolean) => {
    qc.setQueryData<RunrunitProject[]>(["runrunit_projects", sortAsc ? "asc" : "desc"], (prev) =>
      (prev ?? []).map((p) =>
        p.runrunit_project_id === project.runrunit_project_id
          ? { ...p, is_tracking_enabled: next, is_new_candidate: next ? false : p.is_new_candidate }
          : p
      )
    );
    markBusy(project.runrunit_project_id, true);
    try {
      await setProjectTracking(project.runrunit_project_id, next);
      if (next) {
        try {
          await invokeSyncSingleProject(project.runrunit_project_id);
          await allocateProjectToMonthlyLanes(project.runrunit_project_id);
        } catch (e) {
          console.error("invokeSyncSingleProject (toggle) error:", e);
          toast.error("Sincronização do projeto falhou: " + (e as Error).message);
        }
        toast.success("Projeto exibido no dashboard");
      } else {
        toast.success("Projeto removido do dashboard");
      }
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["runrunit_projects", sortAsc ? "asc" : "desc"] });
    } catch (e) {
      qc.setQueryData<RunrunitProject[]>(["runrunit_projects", sortAsc ? "asc" : "desc"], (prev) =>
        (prev ?? []).map((p) =>
          p.runrunit_project_id === project.runrunit_project_id
            ? { ...p, is_tracking_enabled: !next }
            : p
        )
      );
      toast.error("Falha ao atualizar: " + (e as Error).message);
    } finally {
      markBusy(project.runrunit_project_id, false);
    }
  };

  const bulkSet = async (value: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    // 1. Atualização imediata do cache visual (Optimistic)
    qc.setQueryData<RunrunitProject[]>(["runrunit_projects", sortAsc ? "asc" : "desc"], (prev) =>
      (prev ?? []).map((p) =>
        ids.includes(p.runrunit_project_id)
          ? { ...p, is_tracking_enabled: value, is_new_candidate: value ? false : p.is_new_candidate }
          : p
      )
    );

    try {
      // 2. Persistência no banco (Bulk Update)
      await setProjectsTrackingBulk(ids, value);
      
      // Se for ativação, processa sincronização
      if (value) {
        // Marcamos como ocupados para feedback visual individual se necessário
        // Mas a ação em massa segue em background para não travar a UI
        ids.forEach(id => markBusy(id, true));

        // Processamento assíncrono das sincronizações para não bloquear
        const processSync = async () => {
          let failures: number[] = [];
          
          // Controle de concorrência: 3 por vez para não sobrecarregar
          const concurrency = 3;
          const chunks: number[][] = [];
          for (let i = 0; i < ids.length; i += concurrency) {
            chunks.push(ids.slice(i, i + concurrency));
          }

          for (const chunk of chunks) {
            await Promise.all(
              chunk.map(async (id) => {
                try {
                  await invokeSyncSingleProject(id);
                  await allocateProjectToMonthlyLanes(id);
                } catch (e) {
                  console.error(`Falha na sincronização do projeto ${id}:`, e);
                  failures.push(id);
                } finally {
                  markBusy(id, false);
                }
              })
            );
          }
          
          // Invalidação final para garantir consistência
          qc.invalidateQueries({ queryKey: ["runrunit_projects", sortAsc ? "asc" : "desc"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          
          const successCount = ids.length - failures.length;
          if (failures.length > 0) {
            toast.error(
              `${successCount} projetos exibidos com sucesso. ${failures.length} apresentaram erro na sincronização.`,
              {
                description: `IDs com erro: ${failures.join(", ")}`,
                duration: 6000,
              }
            );
          } else {
            toast.success(`${ids.length} projetos exibidos e sincronizados com sucesso.`);
          }
        };

        processSync(); // Executa em background
        toast.success(`${ids.length} projeto(s) sendo ativados e sincronizados...`);
      } else {
        toast.success(`${ids.length} projeto(s) removido(s) do dashboard`);
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["runrunit_projects", sortAsc ? "asc" : "desc"] });
      }
      
      setSelected(new Set());
    } catch (e) {
      // Reverter cache em caso de erro crítico no bulk update
      qc.invalidateQueries({ queryKey: ["runrunit_projects", sortAsc ? "asc" : "desc"] });
      toast.error("Falha na ação em massa: " + (e as Error).message);
    }
  };

  const handleEnableFromCandidate = async (project: RunrunitProject) => {
    markBusy(project.runrunit_project_id, true);
    try {
      await setProjectTracking(project.runrunit_project_id, true);
      try {
        await invokeSyncSingleProject(project.runrunit_project_id);
        await allocateProjectToMonthlyLanes(project.runrunit_project_id);
      } catch (e) {
        console.error("invokeSyncSingleProject (candidate) error:", e);
        toast.error("Sincronização do projeto falhou: " + (e as Error).message);
      }
      toast.success("Projeto exibido no dashboard");
      qc.invalidateQueries({ queryKey: ["runrunit_projects", sortAsc ? "asc" : "desc"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error("Falha ao exibir projeto: " + (e as Error).message);
    } finally {
      markBusy(project.runrunit_project_id, false);
    }
  };

  const handleIgnoreCandidate = async (project: RunrunitProject) => {
    markBusy(project.runrunit_project_id, true);
    try {
      await ignoreNewCandidate(project.runrunit_project_id);
      qc.setQueryData<RunrunitProject[]>(["runrunit_projects", sortAsc ? "asc" : "desc"], (prev) =>
        (prev ?? []).map((p) =>
          p.runrunit_project_id === project.runrunit_project_id
            ? { ...p, is_new_candidate: false }
            : p
        )
      );
      toast.success("Projeto ignorado");
    } catch (e) {
      toast.error("Falha ao ignorar: " + (e as Error).message);
    } finally {
      markBusy(project.runrunit_project_id, false);
    }
  };

  const handleIgnoreAllNew = async () => {
    if (newCandidates.length === 0) return;
    
    const confirmed = window.confirm(
      `Marcar todos os ${newCandidates.length} novos projetos como vistos?\n\nOs projetos continuarão disponíveis na lista, mas deixarão de aparecer como novos.`
    );
    
    if (!confirmed) return;

    setIgnoreAllLoading(true);
    try {
      const count = newCandidates.length;
      await ignoreAllNewCandidates();
      qc.invalidateQueries({ queryKey: ["runrunit_projects", sortAsc ? "asc" : "desc"] });
      toast.success(`${count} projetos marcados como vistos.`);
    } catch (e) {
      toast.error("Falha ao marcar como vistos: " + (e as Error).message);
    } finally {
      setIgnoreAllLoading(false);
    }
  };

  const handleDiscover = async () => {
    setDiscoverLoading(true);
    try {
      await invokeDiscoverProjects();
      toast.success("Verificação de novos projetos concluída");
      qc.invalidateQueries({ queryKey: ["runrunit_projects", sortAsc ? "asc" : "desc"] });
      qc.invalidateQueries({ queryKey: ["dashboard_sync_status"] });
    } catch (e) {
      console.error("handleDiscover error:", e);
      toast.error("Falha ao verificar novos projetos: " + (e as Error).message);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleSyncSingleRow = async (project: RunrunitProject) => {
    markBusy(project.runrunit_project_id, true);
    try {
      await invokeSyncSingleProject(project.runrunit_project_id);
      await allocateProjectToMonthlyLanes(project.runrunit_project_id);
      
      toast.success(`Projeto "${project.name}" sincronizado`);
      
      // Atualiza o estado local para refletir a nova data de sincronização e outros dados
      qc.invalidateQueries({ queryKey: ["runrunit_projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      console.error("handleSyncSingleRow error:", e);
      toast.error(`Falha ao sincronizar projeto: ${(e as Error).message}`);
    } finally {
      markBusy(project.runrunit_project_id, false);
    }
  };


  const limparFiltros = () => {
    setClient(ALL);
    setGroup(ALL);
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSituation("all");
    setSelectedDates(new Set());
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Selecionar Projetos</h1>
          <div className="flex flex-col space-y-0.5">
            <span className="text-sm font-medium">
              {rows.length} {rows.length === 1 ? "projeto disponível" : "projetos disponíveis"}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{newCandidates.length} novos</span>
              <span className="text-[10px] opacity-30">•</span>
              <span>{trackedCount} no dashboard</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    onClick={handleDiscover}
                    disabled={discoverLoading}
                    className="h-9 px-4 shadow-sm"
                  >
                    {discoverLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Buscar novos projetos
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    Busca projetos abertos e com data desejada no Runrun.it.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setIsImportModalOpen(true)}>
                  <Download className="mr-2 h-4 w-4" />
                  <span>Importar projeto por ID</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <span className="text-[10px] text-muted-foreground/70 pr-1">
            Última busca geral: {syncStatus?.last_run_at 
              ? new Date(syncStatus.last_run_at).toLocaleString("pt-BR", {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }).replace(',', ' às') 
              : "ainda não realizada"}
          </span>
        </div>
      </div>

      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Importar projeto por ID</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                ID do projeto no Runrun.it
              </label>
              <div className="flex gap-2">
                <Input
                  value={importId}
                  onChange={(e) => setImportId(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ex.: 123456"
                  className="flex-1"
                  inputMode="numeric"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && importId && !importLoading && handleImportSingle()}
                />
                <Button 
                  onClick={handleImportSingle} 
                  disabled={importLoading || !importId}
                >
                  {importLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Importar"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Útil para projetos específicos que não foram encontrados na busca automática.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {newCandidates.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg hover:bg-accent/40 transition-colors cursor-pointer group" onClick={() => setNewOpen((v) => !v)}>
            <div className="flex items-center gap-2">
              {newOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Novos projetos encontrados</span>
              <Badge variant="secondary" className="ml-1">{newCandidates.length}</Badge>
            </div>
            {newOpen && newCandidates.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleIgnoreAllNew();
                }}
                disabled={ignoreAllLoading}
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground font-normal"
              >
                {ignoreAllLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Marcar todos como vistos
              </Button>
            )}
          </div>
          {newOpen && (
            <div className="border-t border-border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-muted-foreground">Período:</label>
                <Select value={newPeriod} onValueChange={(v) => setNewPeriod(v as "7" | "30" | "all")}>
                  <SelectTrigger className="w-[180px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="all">Todos os novos</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {newCandidatesFiltered.length} exibido(s)
                </span>
              </div>
              {newCandidatesFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Nenhum projeto novo no período selecionado.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border bg-background">
                  {newCandidatesFiltered.map((p) => (
                    <li
                      key={p.runrunit_project_id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {(p.client_name ?? "—")} · {(p.project_group_name ?? "—")} ·{" "}
                          {p.created_at_runrunit
                            ? new Date(p.created_at_runrunit).toLocaleDateString("pt-BR")
                            : "—"}
                        </div>
                      </div>
                      <div className="inline-flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          disabled={busyIds.has(p.runrunit_project_id)}
                          onClick={() => handleEnableFromCandidate(p)}
                        >
                          {busyIds.has(p.runrunit_project_id) && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          Exibir no Dashboard
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyIds.has(p.runrunit_project_id)}
                          onClick={() => handleIgnoreCandidate(p)}
                        >
                          Ignorar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pelo nome do projeto…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Situação</label>
          <Select value={situation} onValueChange={(v) => setSituation(v as Situation)}>
            <SelectTrigger className="w-[240px] h-9">
              <SelectValue>{SITUATION_LABEL[situation]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SITUATION_LABEL) as Situation[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SITUATION_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FilterSelect label="Cliente" value={client} onChange={setClient} options={clients} />
        <FilterSelect label="Grupo" value={group} onChange={setGroup} options={groups} />
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Criado de</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-[160px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">até</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-[160px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Data desejada</label>
          <HierarchicalDateFilter 
            dates={availableDates}
            selectedDates={selectedDates}
            onChange={setSelectedDates}
          />
        </div>
        <div className="flex items-end h-9">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={filtered.length === 0}
            title="Exportar projetos filtrados para Excel"
            className="h-9"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
        {(client !== ALL || group !== ALL || search || dateFrom || dateTo || situation !== "all" || selectedDates.size > 0) && (
          <button
            onClick={limparFiltros}
            className="text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-accent/50 p-3">
          <span className="text-sm font-medium">
            {selected.size} projeto(s) selecionado(s)
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => bulkSet(true)}>
              Exibir selecionados no Dashboard
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkSet(false)}>
              Remover selecionados do Dashboard
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive">
          Erro ao carregar projetos: {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(v) => toggleSelectAllVisible(!!v)}
                  aria-label="Selecionar todos visíveis"
                />
              </TableHead>
              <TableHead>Nome do Projeto</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => setSortAsc((v) => !v)}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  title={sortAsc ? "Mais antiga primeiro" : "Mais recente primeiro"}
                >
                  Data desejada
                  {sortAsc ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                </button>
              </TableHead>
              <TableHead>Última atualização</TableHead>
              <TableHead className="text-right">Exibir no Dashboard</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  Carregando projetos…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  Nenhum projeto encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((p) => (
              <TableRow key={p.runrunit_project_id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(p.runrunit_project_id)}
                    onCheckedChange={(v) => toggleOne(p.runrunit_project_id, !!v)}
                    aria-label={`Selecionar ${p.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.client_name ?? "—"}</TableCell>
                <TableCell>{p.project_group_name ?? "—"}</TableCell>
                <TableCell>
                  {p.is_tracking_enabled ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      Exibido
                    </Badge>
                  ) : p.is_new_candidate ? (
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                      Novo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Não exibido
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.created_at_runrunit
                    ? new Date(p.created_at_runrunit).toLocaleDateString("pt-BR")
                    : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {p.desired_delivery_date
                    ? new Date(
                        (p.desired_delivery_date as string).length <= 10
                          ? `${p.desired_delivery_date}T00:00:00Z`
                          : (p.desired_delivery_date as string)
                      ).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                    : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.last_synced_at
                    ? new Date(p.last_synced_at).toLocaleString("pt-BR")
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3 justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={busyIds.has(p.runrunit_project_id)}
                      onClick={() => handleSyncSingleRow(p)}
                      title="Atualizar projeto"
                    >
                      {busyIds.has(p.runrunit_project_id) ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <RefreshCw className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Switch
                      checked={!!p.is_tracking_enabled}
                      onCheckedChange={(v) => toggle(p, v)}
                      disabled={busyIds.has(p.runrunit_project_id)}
                      aria-label="Exibir no Dashboard"
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[200px] h-9">
          <SelectValue placeholder={label}>
            <span className="truncate">{value === ALL ? "Todos" : value}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}