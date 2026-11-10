import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Painel discreto com a última sincronização (automática ou manual).
 * Lê o histórico salvo no banco: sobrevive a recarregar a página.
 */
type RunRow = {
  id: string;
  sync_type: "automatic" | "manual_batch" | "manual_single";
  status: "running" | "completed" | "completed_with_errors" | "abandoned" | "failed";
  total_projects: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
  started_at: string;
  finished_at: string | null;
  parent_run_id: string | null;
  error_message: string | null;
};

type ItemRow = { runrunit_project_id: number; project_name: string | null; status: string; attempts: number; error_message: string | null };

const TYPE_LABEL: Record<RunRow["sync_type"], string> = {
  automatic: "Automática",
  manual_batch: "Manual (lote)",
  manual_single: "Manual (projeto)",
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(r: Pick<RunRow, "status" | "success_count" | "failed_count">, hasProcessing: boolean): string {
  if (r.status === "running") return r.success_count + r.failed_count === 0 && !hasProcessing ? "Aguardando" : "Em andamento";
  if (r.status === "completed") return "Concluída";
  if (r.status === "completed_with_errors") return "Concluída com falhas";
  if (r.status === "abandoned") return "Interrompida (retomada)";
  return "Falhou";
}

export function SyncRunPanel() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["dashboard_sync_runs", "latest"],
    queryFn: async () => {
      const { data: run, error } = await (supabase as any)
        .from("dashboard_sync_runs")
        .select("id,sync_type,status,total_projects,success_count,failed_count,pending_count,started_at,finished_at,parent_run_id,error_message")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!run) return null;
      const { data: items } = await (supabase as any)
        .from("dashboard_sync_run_items")
        .select("runrunit_project_id,project_name,status,attempts,error_message")
        .eq("run_id", run.id)
        .in("status", ["processing", "failed"]);
      return { run: run as RunRow, items: (items ?? []) as ItemRow[] };
    },
    refetchInterval: (q) => (q.state.data?.run.status === "running" ? 4000 : 30000),
    staleTime: 0,
  });

  if (!data) return null;
  const { run, items } = data;
  const hasProcessing = items.some((i) => i.status === "processing");
  const processed = run.success_count + run.failed_count;
  const pct = run.total_projects > 0 ? Math.round((processed / run.total_projects) * 100) : 0;
  const running = run.status === "running";
  const failures = items.filter((i) => i.status === "failed");

  return (
    <div className="w-full max-w-md rounded-md border border-border bg-card px-3 py-2 text-xs" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />}
        <span className="font-medium">Sincronização {TYPE_LABEL[run.sync_type]}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            run.status === "completed" && "bg-primary/10 text-primary",
            run.status === "completed_with_errors" && "bg-destructive/10 text-destructive",
            (run.status === "failed" || run.status === "abandoned") && "bg-destructive/10 text-destructive",
            running && "bg-muted text-muted-foreground",
          )}
        >
          {statusLabel(run, hasProcessing)}
        </span>
        <Button variant="link" size="sm" className="ml-auto h-auto p-0 text-xs" onClick={() => setOpen(true)}>
          Ver detalhes
        </Button>
      </div>
      <Progress value={pct} className="mt-1.5 h-1" aria-label={`${pct}% concluído`} />
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums text-muted-foreground">
        <span>{processed}/{run.total_projects} ({pct}%)</span>
        <span>Sucesso: {run.success_count}</span>
        <span className={run.failed_count > 0 ? "text-destructive" : undefined}>Falhas: {run.failed_count}</span>
        <span>Pendentes: {run.pending_count}</span>
        <span>Início: {fmt(run.started_at)}</span>
        {run.finished_at && <span>Término: {fmt(run.finished_at)}</span>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da sincronização</DialogTitle>
            <DialogDescription>
              {TYPE_LABEL[run.sync_type]} · início {fmt(run.started_at)}
              {run.finished_at ? ` · término ${fmt(run.finished_at)}` : ""}
              {run.parent_run_id ? " · retomada de execução interrompida" : ""}
            </DialogDescription>
          </DialogHeader>
          {run.error_message && <p className="text-sm text-destructive">{run.error_message}</p>}
          {failures.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum projeto com falha nesta execução.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">Projeto</th>
                    <th className="py-1 pr-2">Tentativas</th>
                    <th className="py-1">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((f) => (
                    <tr key={f.runrunit_project_id} className="border-t border-border align-top">
                      <td className="py-1 pr-2">
                        <div className="font-medium">{f.project_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{f.runrunit_project_id}</div>
                      </td>
                      <td className="py-1 pr-2 tabular-nums">
                        {f.attempts}/3{f.attempts < 3 && running ? " (nova tentativa agendada)" : ""}
                      </td>
                      <td className="py-1 break-words text-xs">{f.error_message ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
