import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { invokeSyncSingleProject, allocateProjectToMonthlyLanes } from "@/lib/projects";

/**
 * Store singleton (fora do ciclo de vida do React) do processamento em lote
 * "Atualizar selecionados".
 *
 * Por ser um módulo JS — e não um componente — o processamento e o estado
 * continuam existindo enquanto o usuário navega entre módulos da SPA.
 * Somente recarregar a página/fechar a aba interrompe (aceito nesta etapa).
 *
 * O fluxo por projeto é EXATAMENTE o do botão individual "Atualizar projeto":
 *   invokeSyncSingleProject(id) -> allocateProjectToMonthlyLanes(id)
 * com lotes de até 30 projetos e concorrência de 3 simultâneos.
 */
export type BatchUpdateError = { id: number; error: string };

export type BatchUpdateState = {
  status: "idle" | "running" | "done";
  total: number;
  done: number;
  failed: number;
  errors: BatchUpdateError[];
  activeIds: number[];
  hidden: boolean;
};

const initialState: BatchUpdateState = {
  status: "idle",
  total: 0,
  done: 0,
  failed: 0,
  errors: [],
  activeIds: [],
  hidden: false,
};

let state: BatchUpdateState = initialState;
const listeners = new Set<() => void>();

function setState(patch: Partial<BatchUpdateState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function replaceState(next: BatchUpdateState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeBatchUpdate(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBatchUpdateSnapshot() {
  return state;
}

export function useBatchUpdate(): BatchUpdateState {
  return useSyncExternalStore(subscribeBatchUpdate, getBatchUpdateSnapshot, getBatchUpdateSnapshot);
}

/** Oculta o indicador SEM cancelar o processamento. */
export function hideBatchUpdateIndicator() {
  if (state.status !== "idle") setState({ hidden: true });
}

export function showBatchUpdateIndicator() {
  setState({ hidden: false });
}

/** Descarta o estado concluído (indicador some). */
export function dismissBatchUpdate() {
  if (state.status === "done") replaceState(initialState);
}

/** Tooltip/title padrão para ações bloqueadas durante o lote. */
export const BATCH_BLOCKED_TITLE = "Indisponível durante uma atualização em massa.";

/** Mensagem única exibida quando o usuário tenta uma ação conflitante. */
const CONFLICT_MESSAGE = "Outra atualização está em andamento.";

export function isBatchUpdateRunning(): boolean {
  return state.status === "running";
}

/**
 * Proteção de concorrência: aborta a ação (avisando o usuário) enquanto um
 * lote "Atualizar selecionados" está em execução. Retorna true se BLOQUEADO.
 * Sem progresso na mensagem — o indicador global já exibe o andamento.
 */
export function guardBatchConflict(): boolean {
  if (state.status === "running") {
    toast.error(CONFLICT_MESSAGE);
    return true;
  }
  return false;
}

const BATCH_SIZE = 30;
const CONCURRENCY = 3;

/**
 * Processa os projetos selecionados em lotes (30) com concorrência
 * controlada (3 simultâneos). Um erro em um projeto não interrompe os demais.
 * Ao final: invalida as queries e exibe o resumo (mesmo comportamento do
 * processamento que vivia na página).
 */
export async function startBatchUpdate(ids: number[], queryClient: QueryClient): Promise<void> {
  if (ids.length === 0) return;
  if (guardBatchConflict()) return; // impede segunda execução simultânea

  replaceState({
    status: "running",
    total: ids.length,
    done: 0,
    failed: 0,
    errors: [],
    activeIds: [],
    hidden: false,
  });

  const results: Array<{ id: number; ok: boolean; error?: string }> = [];

  try {
    for (let b = 0; b < ids.length; b += BATCH_SIZE) {
      const batch = ids.slice(b, b + BATCH_SIZE);
      const chunks: number[][] = [];
      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        chunks.push(batch.slice(i, i + CONCURRENCY));
      }
      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (id) => {
            setState({ activeIds: [...state.activeIds, id] });
            try {
              await invokeSyncSingleProject(id);
              await allocateProjectToMonthlyLanes(id);
              results.push({ id, ok: true });
            } catch (e) {
              const err = e instanceof Error ? e.message : String(e);
              results.push({ id, ok: false, error: err });
              setState({
                errors: [...state.errors, { id, error: err }],
                failed: state.failed + 1,
              });
            } finally {
              setState({
                activeIds: state.activeIds.filter((x) => x !== id),
                done: state.done + 1,
              });
            }
          }),
        );
      }
    }

    const success = results.filter((r) => r.ok).length;
    const failed = results.length - success;

    // Refresh apenas ao final (nunca por projeto).
    queryClient.invalidateQueries({ queryKey: ["runrunit_projects"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });

    if (failed === 0) {
      toast.success(`Atualização concluída: ${success} de ${results.length} projetos atualizados.`);
    } else {
      const desc = results
        .filter((r) => !r.ok)
        .slice(0, 20)
        .map((r) => `${r.id}: ${r.error}`)
        .join("; ");
      toast.error(`${success} atualizados, ${failed} falharam.`, {
        description: desc,
        duration: 8000,
      });
    }

    setState({
      status: "done",
      done: results.length,
      activeIds: [],
      hidden: false,
    });
  } catch (e) {
    // Falha inesperada fora do tratamento individual: encerra sem travar
    // o indicador em "running".
    console.error("startBatchUpdate error:", e);
    setState({ status: "done", activeIds: [], hidden: false });
    toast.error("Processamento interrompido: " + (e instanceof Error ? e.message : String(e)));
  }
}
