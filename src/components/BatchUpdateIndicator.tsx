import { useEffect } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  dismissBatchUpdate,
  hideBatchUpdateIndicator,
  showBatchUpdateIndicator,
  useBatchUpdate,
} from "@/lib/batch-update-store";

/**
 * Indicador global de progresso do "Atualizar selecionados".
 * Montado em RootComponent (nunca desmonta na navegação entre módulos).
 *
 * - X: apenas oculta o balão; NÃO cancela o processamento.
 * - Quando oculto e ainda executando, um pill discreto permite reexibir.
 * - Ao concluir, mostra o resumo e desaparece após alguns segundos
 *   (mesmo padrão de UX dos toasts do projeto).
 */
export function BatchUpdateIndicator() {
  const s = useBatchUpdate();

  // Auto-dismiss do estado concluído.
  useEffect(() => {
    if (s.status !== "done") return;
    const t = setTimeout(() => dismissBatchUpdate(), 8000);
    return () => clearTimeout(t);
  }, [s.status]);

  if (s.status === "idle") return null;

  // Oculto mas ainda processando: pill para reabrir.
  if (s.hidden && s.status === "running") {
    return (
      <button
        type="button"
        onClick={showBatchUpdateIndicator}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-md hover:text-foreground transition-colors"
        title="Mostrar progresso da atualização"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Atualizando {s.done} de {s.total}
      </button>
    );
  }

  const pct = s.total > 0 ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
  const isDone = s.status === "done";

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <span className="mt-0.5">
          {isDone ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600/15">
              <Check className="h-4 w-4 text-green-600" />
            </span>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {isDone ? "Atualização concluída" : "Atualizando projetos"}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {s.done} de {s.total}
            {!isDone && ` · ${pct}%`}
            {isDone && s.failed > 0 && ` — ${s.failed} falharam`}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={hideBatchUpdateIndicator}
          title={isDone ? "Fechar" : "Ocultar (o processamento continua)"}
          aria-label={isDone ? "Fechar" : "Ocultar indicador"}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {!isDone && (
        <>
          <Progress value={pct} className="mt-3 h-1.5" />
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>Concluídos: {s.done - s.failed}</span>
            <span className={s.failed > 0 ? "text-destructive" : undefined}>
              Falhas: {s.failed}
            </span>
          </div>
        </>
      )}

      {isDone && s.failed > 0 && (
        <div className="mt-2 max-h-24 overflow-y-auto text-[11px] text-muted-foreground">
          {s.errors.slice(0, 20).map((e) => (
            <div key={e.id} className="truncate">
              {e.id}: {e.error}
            </div>
          ))}
        </div>
      )}

      {isDone && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-7 w-full text-xs"
          onClick={dismissBatchUpdate}
        >
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Fechar
        </Button>
      )}
    </div>
  );
}
