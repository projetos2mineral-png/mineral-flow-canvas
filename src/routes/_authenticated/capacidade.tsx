import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

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
import { cn } from "@/lib/utils";
import { fetchCards, fetchDashboardUsers, fetchLanes } from "@/lib/dashboard";
import { fetchManualDemands } from "@/lib/manual-demands";
import {
  buildCapacityRows,
  collectMonths,
  fetchAllCapacities,
  formatHours,
  summarizeCapacity,
  CAPACITY_STATUS_CLASS,
  CAPACITY_STATUS_LABEL,
  type CapacityRow,
} from "@/lib/capacity-overview";
import { monthlyLaneTitle } from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/capacidade")({
  head: () => ({
    meta: [
      { title: "Capacidade da equipe · Central de Projetos" },
      {
        name: "description",
        content:
          "Compare horas disponíveis e horas estimadas por colaborador e acompanhe a ocupação da equipe.",
      },
      { property: "og:title", content: "Capacidade da equipe · Central de Projetos" },
      {
        property: "og:description",
        content:
          "Compare horas disponíveis e horas estimadas por colaborador e acompanhe a ocupação da equipe.",
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
  const [person, setPerson] = useState<string>(ALL);

  const users = useQuery({ queryKey: ["dashboard", "users"], queryFn: fetchDashboardUsers });
  const lanes = useQuery({ queryKey: ["dashboard", "lanes"], queryFn: fetchLanes });
  const cards = useQuery({ queryKey: ["dashboard", "cards"], queryFn: fetchCards });
  const demands = useQuery({ queryKey: ["manual-demands"], queryFn: fetchManualDemands });
  const capacities = useQuery({ queryKey: ["dashboard", "capacities"], queryFn: fetchAllCapacities });

  const loading =
    users.isLoading || lanes.isLoading || cards.isLoading || demands.isLoading || capacities.isLoading;
  const error = users.error || lanes.error || cards.error || demands.error || capacities.error;

  const months = useMemo(() => {
    const demandMonths = (demands.data ?? [])
      .map((d) => (d.desired_date ? monthlyLaneTitle(d.desired_date) : ""))
      .filter(Boolean);
    return collectMonths(lanes.data ?? [], capacities.data ?? [], demandMonths);
  }, [lanes.data, capacities.data, demands.data]);

  const rows = useMemo<CapacityRow[]>(() => {
    if (loading || error) return [];
    const all = buildCapacityRows({
      users: users.data ?? [],
      lanes: lanes.data ?? [],
      cards: cards.data ?? [],
      demands: demands.data ?? [],
      capacities: capacities.data ?? [],
      months: month === ALL ? [] : [month],
    });
    return person === ALL ? all : all.filter((r) => r.userName === person);
  }, [loading, error, users.data, lanes.data, cards.data, demands.data, capacities.data, month, person]);

  const totals = useMemo(() => summarizeCapacity(rows), [rows]);

  if (loading) return <LoadingScreen label="Carregando capacidade…" />;

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        Não foi possível carregar os dados de capacidade. Tente atualizar a página.
      </div>
    );
  }

  const people = (users.data ?? []).filter((u) => u.is_active !== false).map((u) => u.name);

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
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {people.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Horas disponíveis" value={formatHours(totals.availableHours)} />
        <SummaryCard label="Horas estimadas" value={formatHours(totals.estimatedHours)} />
        <SummaryCard
          label="Saldo"
          value={formatHours(totals.balance)}
          tone={totals.balance < 0 ? "negative" : "positive"}
        />
        <SummaryCard
          label="Ocupação da equipe"
          value={totals.occupancy === null ? "—" : `${totals.occupancy.toFixed(0)}%`}
          hint={`${totals.overloaded} sobrecarregado(s) · ${totals.adequate} adequado(s) · ${totals.low} com folga`}
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Colaborador</th>
                <th className="px-4 py-2 text-right font-medium">Disponíveis</th>
                <th className="px-4 py-2 text-right font-medium">Estimadas</th>
                <th className="px-4 py-2 text-right font-medium">Projetos</th>
                <th className="px-4 py-2 text-right font-medium">Demandas</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
                <th className="px-4 py-2 text-left font-medium w-[220px]">Ocupação</th>
                <th className="px-4 py-2 text-left font-medium">Indicador</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
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
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {formatHours(r.projectHours)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {formatHours(r.demandHours)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right",
                        r.balance !== null && r.balance < 0 && "text-red-600 font-medium"
                      )}
                    >
                      {r.balance === null ? "—" : formatHours(r.balance)}
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
        Horas disponíveis vêm da capacidade mensal cadastrada nas filas do Painel Geral. Horas estimadas
        somam os projetos do Runrun.it posicionados em filas mensais e as horas individuais das demandas
        avulsas.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold text-foreground",
          tone === "negative" && "text-red-600"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
