import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startManualSync } from "@/lib/sync/sync.functions";

/**
 * Estado global das sincronizações, agora ESPELHO do servidor.
 *
 * O processamento roda no servidor (trava compartilhada + fencing token no
 * banco). Este store apenas consulta a trava/execução atual e expõe o mesmo
 * contrato que os botões e o indicador já usavam. Fechar o navegador não
 * interrompe nada: o servidor continua e o watchdog retoma se necessário.
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
  /** Execução em andamento no servidor (qualquer origem). */
  runId: string | null;
  lockType: string | null;
  lockedBy: string | null;
};

const initialState: BatchUpdateState = {
  status: "idle",
  total: 0,
  done: 0,
  failed: 0,
  errors: [],
  activeIds: [],
  hidden: false,
  runId: null,
  lockType: null,
  lockedBy: null,
};

let state: BatchUpdateState = initialState;
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let queryClientRef: QueryClient | null = null;
/** Execução de lote iniciada nesta aba: ao terminar mostramos o resumo. */
let watchedRunId: string | null = null;

function emit() {
  for (const l of listeners) l();
}
function setState(patch: Partial<BatchUpdateState>) {
  state = { ...state, ...patch };
  emit();
}

export function subscribeBatchUpdate(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) schedulePoll(0);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };
}

export function getBatchUpdateSnapshot() {
  return state;
}
const serverSnapshot = () => initialState;

export function useBatchUpdate(): BatchUpdateState {
  return useSyncExternalStore(subscribeBatchUpdate, getBatchUpdateSnapshot, serverSnapshot);
}

export function hideBatchUpdateIndicator() {
  if (state.status !== "idle") setState({ hidden: true });
}
export function showBatchUpdateIndicator() {
  setState({ hidden: false });
}
export function dismissBatchUpdate() {
  if (state.status === "done") setState({ ...initialState });
}

export const BATCH_BLOCKED_TITLE = "Indisponível: há uma sincronização em andamento.";

function lockMessage(): string {
  if (state.lockType === "automatic") return "Sincronização automática diária em andamento. Aguarde o término.";
  return "Outra sincronização está em andamento. Aguarde o término.";
}

export function isBatchUpdateRunning(): boolean {
  return state.status === "running";
}

/** Bloqueio imediato na interface; a decisão final é sempre da trava no banco. */
export function guardBatchConflict(): boolean {
  if (state.status === "running") {
    toast.error(lockMessage());
    return true;
  }
  return false;
}

type LockRow = { is_locked: boolean; current_run_id: string | null; lock_type: string | null; locked_by: string | null };
type RunRow = { id: string; status: string; total_projects: number; success_count: number; failed_count: number };

function schedulePoll(ms: number) {
  if (pollTimer) clearTimeout(pollTimer);
  if (typeof window === "undefined") return;
  pollTimer = setTimeout(() => void poll(), ms);
}

async function fetchRunSummary(runId: string) {
  const [{ data: run }, { data: items }] = await Promise.all([
    (supabase as any)
      .from("dashboard_sync_runs")
      .select("id,status,total_projects,success_count,failed_count")
      .eq("id", runId)
      .maybeSingle(),
    (supabase as any)
      .from("dashboard_sync_run_items")
      .select("runrunit_project_id,status,error_message,attempts")
      .eq("run_id", runId)
      .in("status", ["processing", "failed"]),
  ]);
  const rows = (items ?? []) as { runrunit_project_id: number; status: string; error_message: string | null; attempts: number }[];
  return {
    run: run as RunRow | null,
    activeIds: rows.filter((r) => r.status === "processing").map((r) => Number(r.runrunit_project_id)),
    errors: rows
      .filter((r) => r.status === "failed" && r.attempts >= 3)
      .map((r) => ({ id: Number(r.runrunit_project_id), error: r.error_message ?? "Falha" })),
  };
}

async function poll() {
  pollTimer = null;
  try {
    const { data: lock } = await (supabase as any)
      .from("dashboard_sync_lock")
      .select("is_locked,current_run_id,lock_type,locked_by")
      .eq("id", 1)
      .maybeSingle();
    const l = lock as LockRow | null;
    if (l?.is_locked && l.current_run_id) {
      const s = await fetchRunSummary(l.current_run_id);
      setState({
        status: "running",
        runId: l.current_run_id,
        lockType: l.lock_type,
        lockedBy: l.locked_by,
        total: s.run?.total_projects ?? 0,
        done: (s.run?.success_count ?? 0) + (s.run?.failed_count ?? 0),
        failed: s.run?.failed_count ?? 0,
        errors: s.errors,
        activeIds: s.activeIds,
      });
      // Retomadas do watchdog criam execução filha: acompanha a mais nova.
      if (watchedRunId && watchedRunId !== l.current_run_id && l.lock_type === "manual_batch") watchedRunId = l.current_run_id;
    } else if (state.status === "running") {
      await onRunFinished();
    }
  } catch (e) {
    console.error("Falha ao consultar a sincronização:", e);
  } finally {
    if (listeners.size > 0) schedulePoll(state.status === "running" ? 3000 : 20000);
  }
}

async function onRunFinished() {
  const finishedId = state.runId;
  const mine = watchedRunId && finishedId === watchedRunId;
  watchedRunId = null;
  queryClientRef?.invalidateQueries({ queryKey: ["runrunit_projects"] });
  queryClientRef?.invalidateQueries({ queryKey: ["dashboard"] });
  queryClientRef?.invalidateQueries({ queryKey: ["dashboard_sync_runs"] });
  if (!finishedId || !mine) {
    setState({ ...initialState });
    return;
  }
  const s = await fetchRunSummary(finishedId);
  const ok = s.run?.success_count ?? 0;
  const failed = s.run?.failed_count ?? 0;
  if (failed === 0) toast.success(`Atualização concluída: ${ok} de ${s.run?.total_projects ?? ok} projetos atualizados.`);
  else
    toast.error(`${ok} atualizados, ${failed} falharam.`, {
      description: s.errors.slice(0, 20).map((e) => `${e.id}: ${e.error}`).join("; "),
      duration: 8000,
    });
  setState({ status: "done", activeIds: [], done: ok + failed, failed, errors: s.errors, hidden: false, lockType: null, lockedBy: null });
}

/** Força uma consulta imediata (ex.: após iniciar uma execução). */
export function refreshSyncState(qc?: QueryClient) {
  if (qc) queryClientRef = qc;
  schedulePoll(0);
}

/** "Atualizar selecionados": inicia o lote NO SERVIDOR com a trava compartilhada. */
export async function startBatchUpdate(ids: number[], queryClient: QueryClient): Promise<void> {
  if (ids.length === 0) return;
  if (guardBatchConflict()) return;
  queryClientRef = queryClient;
  try {
    const r = await startManualSync({ data: { type: "manual_batch", ids } });
    if (!r.started) {
      toast.error(r.message);
      refreshSyncState();
      return;
    }
    watchedRunId = r.runId;
    setState({ status: "running", runId: r.runId, lockType: "manual_batch", total: ids.length, done: 0, failed: 0, errors: [], hidden: false });
    toast.info("Atualização iniciada no servidor. Você pode fechar esta página; o processamento continua.");
    refreshSyncState();
  } catch (e) {
    toast.error("Não foi possível iniciar a atualização: " + (e instanceof Error ? e.message : String(e)));
  }
}

/**
 * Sincronização de UM projeto pelos botões existentes (refresh da linha,
 * exibir projeto, importar por ID). Também adquire a trava atomicamente.
 * Retorna null se a trava estava ocupada (mensagem já exibida).
 */
export async function runSingleSync(
  id: number,
  queryClient: QueryClient,
): Promise<{ ok: boolean; error: string | null } | null> {
  if (guardBatchConflict()) return null;
  queryClientRef = queryClient;
  setState({ status: "running", activeIds: [id], lockType: "manual_single", total: 1, done: 0, hidden: true });
  try {
    const r = await startManualSync({ data: { type: "manual_single", ids: [id] } });
    if (!r.started) {
      toast.error(r.message);
      return null;
    }
    return r.single ?? { ok: false, error: "Sem resultado" };
  } finally {
    setState({ status: "idle", activeIds: [], hidden: false });
    queryClient.invalidateQueries({ queryKey: ["runrunit_projects"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_sync_runs"] });
    refreshSyncState();
  }
}
