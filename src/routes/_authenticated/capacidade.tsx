import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { RequireLevel } from "@/components/RequireLevel";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchCards, fetchDashboardProjects, fetchDashboardUsers, fetchLanes } from "@/lib/dashboard";
import { fetchManualDemands, resolveAssigneeName } from "@/lib/manual-demands";
import {
  buildCapacityRows,
  collectMonths,
  fetchAllCapacities,
  formatHours,
  CAPACITY_STATUS_CLASS,
  CAPACITY_STATUS_LABEL,
  type CapacityRow,
} from "@/lib/capacity-overview";
import { monthlyLaneTitle } from "@/lib/dashboard";
import {
  aggregateWorkedHours,
  fetchDailyWorkedHours,
  fetchWorkedHoursImports,
  type WorkedHoursImportRow,
} from "@/lib/worked-hours";
import { monthTitleToRange } from "@/lib/worked-hours/period";
import { importWorkedHoursNow } from "@/lib/worked-hours/import.functions";

export const Route = createFileRoute("/_authenticated/capacidade")({
  head: () => ({
    meta: [
      { title: "Capacidade da equipe · Central de Planejamento" },
      {
        name: "description",
        content:
          "Compare horas disponíveis e horas planejadas por colaborador e acompanhe a ocupação da equipe.",
      },
      { property: "og:title", content: "Capacidade da equipe · Central de Planejamento" },
      {
        property: "og:description",
        content:
          "Compare horas disponíveis e horas planejadas por colaborador e acompanhe a ocupação da equipe.",
      },
    ],
  }),
  component: () => (
    <RequireLevel allow={["lider", "administrador"]}>
      <CapacityPage />
    </RequireLevel>
  ),
});

const ALL = "__all__";

function CapacityPage() {
  const [month, setMonth] = useState<string>(ALL);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const users = useQuery({ queryKey: ["dashboard", "users"], queryFn: fetchDashboardUsers });
  const projects = useQuery({ queryKey: ["dashboard", "projects"], queryFn: fetchDashboardProjects });
  const lanes = useQuery({ queryKey: ["dashboard", "lanes"], queryFn: fetchLanes });
  const cards = useQuery({ queryKey: ["dashboard", "cards"], queryFn: () => fetchCards() });
  const demands = useQuery({ queryKey: ["manual-demands"], queryFn: fetchManualDemands });
  const capacities = useQuery({ queryKey: ["dashboard", "capacities"], queryFn: fetchAllCapacities });

  const workedRange = useMemo(
    () => (month === ALL ? undefined : (monthTitleToRange(month) ?? undefined)),
    [month],
  );
  const worked = useQuery({
    queryKey: ["dashboard", "worked-hours", month],
    queryFn: () => fetchDailyWorkedHours(workedRange),
  });
  const workedImports = useQuery({
    queryKey: ["dashboard", "worked-hours-imports"],
    queryFn: () => fetchWorkedHoursImports(5),
  });
  const queryClient = useQueryClient();
  const importMutation = useMutation({
    mutationFn: () => importWorkedHoursNow(),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Horas importadas: ${result.rowsUpserted} dia(s) atualizado(s), ${result.rowsChanged} alteração(ões).`,
      );
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "worked-hours"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "worked-hours-imports"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao importar horas.");
    },
  });

  const workedByUser = useMemo(
    () => aggregateWorkedHours(worked.data ?? []),
    [worked.data],
  );

  const loading =
    projects.isLoading || users.isLoading || lanes.isLoading || cards.isLoading || demands.isLoading || capacities.isLoading;
  const error = projects.error || users.error || lanes.error || cards.error || demands.error || capacities.error;

  const people = useMemo(() => {
    const set = new Set<string>();

    // 1. Responsáveis cadastrados em projetos (v_dashboard_projects)
    for (const p of projects.data ?? []) {
      const name = p.assignee_name?.trim();
      if (name && name !== "Sem responsável") {
        set.add(name);
      }
    }

    // 2. Responsáveis cadastrados em cards com estimativas (dashboard_cards_with_estimates)
    for (const c of cards.data ?? []) {
      const name = c.assignee_name?.trim();
      if (name && name !== "Sem responsável") {
        set.add(name);
      }
    }

    // 3. Responsáveis cadastrados em demandas avulsas ativas
    const nameById = new Map((users.data ?? []).map((u) => [u.id, u.name]));
    for (const demand of demands.data ?? []) {
      if (demand.status !== "Ativa") continue;
      for (const a of demand.assignees ?? []) {
        const name = resolveAssigneeName(a, nameById)?.trim();
        if (name && name !== "Sem responsável") {
          set.add(name);
        }
      }
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [projects.data, cards.data, demands.data, users.data]);

  const months = useMemo(() => {
    const demandMonths = (demands.data ?? [])
      .map((d) => (d.desired_date ? monthlyLaneTitle(d.desired_date) : ""))
      .filter(Boolean);
    return collectMonths(lanes.data ?? [], capacities.data ?? [], demandMonths);
  }, [lanes.data, capacities.data, demands.data]);

  const rows = useMemo<CapacityRow[]>(() => {
    if (loading || error) return [];
    const all = buildCapacityRows({
      responsibles: people,
      users: users.data ?? [],
      lanes: lanes.data ?? [],
      cards: cards.data ?? [],
      demands: demands.data ?? [],
      capacities: capacities.data ?? [],
      workedHours: workedByUser,
      months: month === ALL ? [] : [month],
    });
    if (selectedPeople.length === 0) return all;
    return all.filter((r) => selectedPeople.includes(r.userName));
  }, [loading, error, people, users.data, lanes.data, cards.data, demands.data, capacities.data, workedByUser, month, selectedPeople]);

  if (loading) return <LoadingScreen label="Carregando capacidade…" />;

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        Não foi possível carregar os dados de capacidade. Tente atualizar a página.
      </div>
    );
  }

  const togglePerson = (name: string) => {
    setSelectedPeople((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const selectAll = () => setSelectedPeople([...people]);
  const clearAll = () => setSelectedPeople([]);

  const allSelected = selectedPeople.length === people.length;
  const noneSelected = selectedPeople.length === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Período</span>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Todos os meses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os meses</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Colaborador</span>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-[260px] justify-between"
              >
                <span className="truncate">
                  {noneSelected
                    ? "Todos os colaboradores"
                    : allSelected
                    ? "Todos os colaboradores"
                    : `${selectedPeople.length} selecionado(s)`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-0">
              <Command>
                <CommandInput placeholder="Buscar colaborador…" />
                <CommandList>
                  <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem onSelect={selectAll} className="cursor-pointer">
                      <Checkbox checked={allSelected} className="mr-2" />
                      <span className="flex-1">Selecionar todos</span>
                    </CommandItem>
                    {people.map((p) => {
                      const checked = selectedPeople.includes(p);
                      return (
                        <CommandItem
                          key={p}
                          onSelect={() => togglePerson(p)}
                          className="cursor-pointer"
                        >
                          <Checkbox checked={checked} className="mr-2" />
                          <span className="flex-1 truncate">{p}</span>
                          {checked && <Check className="h-4 w-4" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
                <div className="flex items-center justify-between border-t p-2">
                  <Button variant="ghost" size="sm" onClick={clearAll} disabled={noneSelected}>
                    Limpar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                    Fechar
                  </Button>
                </div>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {!noneSelected && (
          <div className="flex flex-wrap items-center gap-1 pb-0.5">
            {selectedPeople.map((p) => (
              <Badge key={p} variant="secondary" className="gap-1 pl-2 pr-1">
                <span className="max-w-[120px] truncate">{p}</span>
                <button
                  type="button"
                  onClick={() => togglePerson(p)}
                  className="rounded-full p-0.5 hover:bg-secondary-foreground/10"
                  aria-label={`Remover ${p}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto shrink-0"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", importMutation.isPending && "animate-spin")} />
          {importMutation.isPending ? "Importando…" : "Importar horas agora"}
        </Button>
      </div>

      <p
        className="-mt-4 truncate text-xs text-muted-foreground"
        title={formatLastImport(workedImports.data?.[0])}
      >
        {formatLastImport(workedImports.data?.[0])}
      </p>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Colaborador</th>
                <th className="px-4 py-2 text-right font-medium">Disponíveis</th>
                <th className="px-4 py-2 text-right font-medium">Planejadas</th>
                <th className="px-4 py-2 text-right font-medium">Trabalhadas</th>
                <th className="px-4 py-2 text-left font-medium w-[220px]">Ocupação</th>
                <th className="px-4 py-2 text-left font-medium">Indicador</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum colaborador para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.userName} className="border-t border-border">
                    <td className="px-4 py-2 font-medium text-foreground">{r.userName}</td>
                    <td className="px-4 py-2 text-right">
                      {r.availableHours > 0 ? formatHours(r.availableHours) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">{formatHours(r.estimatedHours)}</td>
                    <td className="px-4 py-2 text-right">
                      {r.workedDays > 0 ? (
                        formatHours(r.workedHours)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {r.occupancy === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(100, r.occupancy)} className="h-2 flex-1" />
                          <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">
                            {r.occupancy.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                          CAPACITY_STATUS_CLASS[r.status]
                        )}
                      >
                        {CAPACITY_STATUS_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Horas disponíveis vêm da capacidade mensal cadastrada nas filas da Central de Planejamento. Horas
        planejadas somam os projetos do Runrun.it posicionados em filas mensais e as horas individuais das
        demandas avulsas. Horas trabalhadas são importadas do relatório de horas do Runrun.it e não alteram
        a capacidade nem as horas planejadas.
      </p>
    </div>
  );
}

function formatLastImport(row: WorkedHoursImportRow | undefined): string {
  if (!row) return "Nenhuma importação realizada";
  const ref = row.finished_at ?? row.started_at;
  let when = "—";
  if (ref) {
    const d = new Date(ref);
    when = `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const parts = [`Última atualização: ${when}`, `${row.rows_upserted} registros importados`];
  if (row.rows_without_mapping > 0) parts.push(`${row.rows_without_mapping} sem vínculo`);
  if (row.status === "completed_with_warnings") parts.push("com avisos");
  return parts.join(" · ");
}
