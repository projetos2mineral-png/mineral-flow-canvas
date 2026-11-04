import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { fetchDashboardProjects, fetchLanes } from "@/lib/dashboard";
import { fetchHiddenAssignees, isAssigneeHidden, setAssigneeHidden } from "@/lib/board-visibility";

/** Lista os responsáveis com Kanban e permite ocultar/exibir no Painel Geral. */
export function KanbanAssigneesVisibility() {
  const qc = useQueryClient();
  const projectsQ = useQuery({ queryKey: ["dashboard", "projects"], queryFn: fetchDashboardProjects, staleTime: 30_000 });
  const lanesQ = useQuery({ queryKey: ["dashboard", "lanes"], queryFn: fetchLanes, staleTime: 30_000 });
  const hiddenQ = useQuery({ queryKey: ["dashboard", "hidden-assignees"], queryFn: fetchHiddenAssignees, staleTime: 0 });

  const names = useMemo(() => {
    const set = new Set<string>();
    for (const p of projectsQ.data ?? []) {
      const n = p.assignee_name?.trim();
      if (n) set.add(n);
    }
    for (const l of lanesQ.data ?? []) {
      const n = l.assignee_name?.trim();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [projectsQ.data, lanesQ.data]);

  const hidden = hiddenQ.data ?? new Set<string>();

  const toggle = async (name: string, visible: boolean) => {
    try {
      await setAssigneeHidden(name, !visible);
      await qc.invalidateQueries({ queryKey: ["dashboard", "hidden-assignees"] });
      toast.success(visible ? `${name} exibido no Painel` : `${name} ocultado do Painel`);
    } catch (e) {
      toast.error("Falha ao salvar: " + (e as Error).message);
    }
  };

  const loading = projectsQ.isLoading || lanesQ.isLoading || hiddenQ.isLoading;

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Responsáveis no Kanban</h2>
        <p className="text-sm text-muted-foreground">
          Escolha quais responsáveis aparecem no Painel Geral. Ocultar não apaga nenhum card.
        </p>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {names.map((n) => {
            const visible = !isAssigneeHidden(n, hidden);
            return (
              <label key={n} className="flex items-center justify-between gap-4 px-4 py-2 cursor-pointer">
                <span className={visible ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{n}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{visible ? "Exibido" : "Oculto"}</span>
                  <Switch checked={visible} onCheckedChange={(v) => toggle(n, v)} aria-label={`Exibir ${n}`} />
                </span>
              </label>
            );
          })}
          {names.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum responsável encontrado.</div>
          )}
        </div>
      )}
    </section>
  );
}
