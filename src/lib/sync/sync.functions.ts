import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StartSyncInput = { type: "manual_batch" | "manual_single"; ids: number[] };
export type StartSyncResult =
  | { started: false; reason: string; message: string }
  | {
      started: true;
      runId: string;
      /** Só para manual_single: resultado já processado no servidor. */
      single?: { ok: boolean; error: string | null };
    };

/**
 * Ponto único usado pelos botões existentes. Adquire a trava compartilhada
 * de forma atômica no banco; o processamento roda no servidor.
 */
export const startManualSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: StartSyncInput): StartSyncInput => {
    if (data?.type !== "manual_batch" && data?.type !== "manual_single") throw new Error("Tipo inválido");
    const ids = Array.from(new Set((data.ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0)));
    if (ids.length === 0) throw new Error("Informe ao menos um projeto");
    if (ids.length > 2000) throw new Error("Muitos projetos de uma vez");
    if (data.type === "manual_single" && ids.length !== 1) throw new Error("Atualização individual aceita um projeto");
    return { type: data.type, ids };
  })
  .handler(async ({ data, context }): Promise<StartSyncResult> => {
    const { acquire, chainNext, processSlice, readSyncEnv, adminClient } = await import("./orchestrator.server");
    const env = readSyncEnv();
    const who = String((context.claims as { email?: string }).email ?? context.userId);
    const r = await acquire(env, data.type, who, data.ids, context.userId);
    if (!r.acquired) return { started: false, reason: r.reason, message: r.message };
    const run = { runId: r.run_id, token: Number(r.fencing_token) };

    if (data.type === "manual_single") {
      // Um projeto: processa já, no servidor, e devolve o resultado ao botão.
      await processSlice(env, run);
      const { data: item } = await adminClient(env)
        .from("dashboard_sync_run_items")
        .select("status,error_message")
        .eq("run_id", run.runId)
        .maybeSingle();
      const ok = item?.status === "completed";
      return { started: true, runId: run.runId, single: { ok, error: ok ? null : (item?.error_message ?? "Falha") } };
    }

    // Lote: dispara a primeira fatia no servidor e retorna. Fechar o
    // navegador não interrompe: o encadeamento e o watchdog continuam.
    const secret = process.env.SYNC_CRON_SECRET;
    if (secret) await chainNext(new URL(getRequest().url).origin, secret, run);
    return { started: true, runId: run.runId };
  });
