import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { RequireLevel } from "@/components/RequireLevel";
import { DemandDialog } from "@/components/demands/DemandDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { fetchDashboardUsers } from "@/lib/dashboard";
import {
  DEMAND_STATUSES,
  createManualDemand,
  deleteManualDemand,
  fetchManualDemands,
  formatHoursHHMM,
  isClientNameSupported,
  setDemandDashboardVisibility,
  totalEstimatedHours,
  updateManualDemand,
  type DemandStatus,
  type ManualDemand,
  type ManualDemandInput,
} from "@/lib/manual-demands";

export const Route = createFileRoute("/_authenticated/demandas-avulsas")({
  head: () => ({
    meta: [
      { title: "Demandas Avulsas · Mineral Geologia" },
      {
        name: "description",
        content:
          "Cadastro de demandas manuais, sem vínculo com o Runrun.it, com responsáveis e estimativas individuais.",
      },
      { property: "og:title", content: "Demandas Avulsas · Mineral Geologia" },
      {
        property: "og:description",
        content: "Cadastro de demandas manuais com responsáveis e estimativas individuais.",
      },
    ],
  }),
  component: () => (
    <RequireLevel allow={["lider", "administrador"]}>
      <DemandasAvulsasPage />
    </RequireLevel>
  ),
});

const ALL = "__all__";

/** Nomes de clientes existentes, derivados dos projetos Runrun.it. */
async function fetchClientNames(): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from("runrunit_projects")
    .select("client_name")
    .not("client_name", "is", null)
    .limit(5000);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of (data ?? []) as { client_name: string | null }[]) {
    if (row.client_name) set.add(row.client_name);
  }
  return [...set];
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

const STATUS_CLASS: Record<DemandStatus, string> = {
  Ativa: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  Concluída: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  Cancelada: "bg-muted text-muted-foreground hover:bg-muted",
};

function DemandasAvulsasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [client, setClient] = useState<string>(ALL);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManualDemand | null>(null);

  const { data: demands, isLoading, error } = useQuery({
    queryKey: ["manual-demands"],
    queryFn: fetchManualDemands,
    staleTime: 15_000,
  });

  const { data: users } = useQuery({
    queryKey: ["dashboard", "users"],
    queryFn: fetchDashboardUsers,
    staleTime: 60_000,
  });

  const { data: clientNames } = useQuery({
    queryKey: ["runrunit", "client-names"],
    queryFn: fetchClientNames,
    staleTime: 5 * 60_000,
  });

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users ?? []) map.set(u.id, u.name);
    return map;
  }, [users]);

  const rows = demands ?? [];

  const clientOptions = useMemo(() => {
    const set = new Set<string>(clientNames ?? []);
    for (const d of rows) if (d.client_name) set.add(d.client_name);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [clientNames, rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((d) => {
      if (status !== ALL && d.status !== status) return false;
      if (client !== ALL && (d.client_name ?? "") !== client) return false;
      if (!term) return true;
      return (
        d.name.toLowerCase().includes(term) ||
        (d.client_name ?? "").toLowerCase().includes(term) ||
        (d.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, status, client]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["manual-demands"] });

  const saveMutation = useMutation({
    mutationFn: async (input: ManualDemandInput) => {
      if (editing) return updateManualDemand(editing.id, input);
      return createManualDemand(input);
    },
    onSuccess: () => {
      toast.success(editing ? "Demanda atualizada." : "Demanda criada.");
      setDialogOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteManualDemand(id),
    onSuccess: () => {
      toast.success("Demanda excluída.");
      setDialogOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(`Não foi possível excluir: ${e.message}`),
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) =>
      setDemandDashboardVisibility(id, visible),
    onSuccess: invalidate,
    onError: (e: Error) => {
      toast.error(`Não foi possível atualizar a visibilidade: ${e.message}`);
      invalidate();
    },
  });

  const handleDelete = () => {
    if (!editing) return;
    if (!window.confirm(`Excluir a demanda "${editing.name}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    deleteMutation.mutate(editing.id);
  };

  const hasFilters = search || status !== ALL || client !== ALL;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">Demandas Avulsas</h1>
          <p className="text-sm text-muted-foreground">
            Demandas manuais, sem vínculo com o Runrun.it.
          </p>
        </div>
        <Button
          className="ml-auto"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Nova demanda
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pelo nome da demanda…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {DEMAND_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Cliente</label>
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {clientOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setStatus(ALL);
              setClient(ALL);
            }}
            className="text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-destructive">
          Erro ao carregar demandas: {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Demanda</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Data desejada</TableHead>
              <TableHead>Responsáveis</TableHead>
              <TableHead>Estimativa total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Exibir na Central de Planejamento</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  Carregando demandas…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  Nenhuma demanda encontrada.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>{d.client_name ?? "—"}</TableCell>
                <TableCell>{formatDate(d.desired_date)}</TableCell>
                <TableCell className="max-w-[280px]">
                  <span className="text-sm text-muted-foreground">
                    {d.assignees.length === 0
                      ? "—"
                      : d.assignees
                          .map(
                            (a) =>
                              `${userNameById.get(a.user_id) ?? "Desconhecido"} (${formatHoursHHMM(
                                a.estimated_hours
                              )})`
                          )
                          .join(", ")}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatHoursHHMM(totalEstimatedHours(d.assignees))}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_CLASS[d.status] ?? ""}>{d.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={d.is_visible_on_dashboard}
                    onCheckedChange={(v) => visibilityMutation.mutate({ id: d.id, visible: v })}
                    aria-label={`Exibir ${d.name} na Central de Planejamento`}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Configurações da demanda"
                    onClick={() => {
                      setEditing(d);
                      setDialogOpen(true);
                    }}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DemandDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        demand={editing}
        users={users ?? []}
        clients={clientOptions}
        clientEnabled={isClientNameSupported()}
        saving={saveMutation.isPending}
        deleting={deleteMutation.isPending}
        onSubmit={(input) => saveMutation.mutate(input)}
        onDelete={handleDelete}
      />
    </div>
  );
}
