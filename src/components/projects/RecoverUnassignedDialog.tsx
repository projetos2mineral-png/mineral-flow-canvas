import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ALLOCATION_REASON_LABEL,
  allocateManyProjects,
  fetchProjectsWithUnassignedCards,
  type AllocationOutcome,
} from "@/lib/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface RecoverUnassignedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = "idle" | "loading" | "preview" | "applying" | "done";

const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

/**
 * Recuperação de cards em "Sem fila": gera uma prévia (sem gravar nada) usando
 * a mesma regra de alocação do "Atualizar projeto" e só grava após confirmação.
 */
export function RecoverUnassignedDialog({ open, onOpenChange }: RecoverUnassignedDialogProps) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<AllocationOutcome[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Cards já em fila não interessam aqui (são preservados de qualquer forma).
  const visible = rows.filter((r) => r.reason !== "ja_alocado" || r.applied);
  const eligibleIds = [...new Set(rows.filter((r) => r.reason === "alocar").map((r) => r.runrunit_project_id))];

  const loadPreview = async () => {
    setPhase("loading");
    setError(null);
    try {
      const ids = await fetchProjectsWithUnassignedCards();
      setRows(await allocateManyProjects(ids, { dryRun: true }));
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  };

  const apply = async () => {
    setPhase("applying");
    const res = await allocateManyProjects(eligibleIds);
    setRows(res);
    setPhase("done");
    const ok = res.filter((r) => r.applied).length;
    const failed = res.filter((r) => r.error).length;
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    if (failed) toast.error(`${ok} card(s) alocado(s), ${failed} com erro.`);
    else toast.success(`${ok} card(s) alocado(s) na fila do mês.`);
  };

  const handleOpenChange = (next: boolean) => {
    if (phase === "loading" || phase === "applying") return;
    if (!next) {
      setPhase("idle");
      setRows([]);
    }
    onOpenChange(next);
  };

  const eligibleCount = rows.filter((r) => r.reason === "alocar").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Recuperar cards em "Sem fila"</DialogTitle>
          <DialogDescription>
            Mostra para qual fila mensal cada card iria, considerando a antecedência do quadro. Nada é
            gravado até você confirmar. Cards que já estão em uma fila não são alterados.
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <div className="space-y-2">
            {error && <p className="text-sm text-destructive">Falha ao gerar prévia: {error}</p>}
            <Button onClick={loadPreview}>Gerar prévia</Button>
          </div>
        )}
        {(phase === "loading" || phase === "applying") && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            {phase === "loading" ? "Calculando destinos…" : "Gravando alocações…"}
          </p>
        )}

        {(phase === "preview" || phase === "done") && (
          <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Projeto (ID)</th>
                  <th className="p-2">Responsável</th>
                  <th className="p-2">Data desejada</th>
                  <th className="p-2">Antecedência</th>
                  <th className="p-2">Fila de destino</th>
                  <th className="p-2">{phase === "done" ? "Resultado" : "Situação"}</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      Nenhum card em "Sem fila" encontrado.
                    </td>
                  </tr>
                )}
                {visible.map((r) => (
                  <tr key={`${r.runrunit_project_id}-${r.assignee_name ?? "-"}`} className="border-t border-border">
                    <td className="p-2 tabular-nums">{r.runrunit_project_id}</td>
                    <td className="p-2">{r.assignee_name ?? "—"}</td>
                    <td className="p-2">{fmtDate(r.desired_delivery_date)}</td>
                    <td className="p-2">{r.antecedence_days} dia(s)</td>
                    <td className="p-2">{r.target_lane_title ?? "—"}</td>
                    <td
                      className={cn(
                        "p-2",
                        r.error ? "text-destructive" : r.reason === "alocar" || r.applied ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {r.error
                        ? `Erro: ${r.error}`
                        : phase === "done" && r.applied
                          ? "Alocado"
                          : ALLOCATION_REASON_LABEL[r.reason]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          {phase === "preview" && (
            <Button onClick={apply} disabled={eligibleCount === 0}>
              Confirmar e alocar {eligibleCount} card(s)
            </Button>
          )}
          {phase === "done" && <Button onClick={() => handleOpenChange(false)}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
