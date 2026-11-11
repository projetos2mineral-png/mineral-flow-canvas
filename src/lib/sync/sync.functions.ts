import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { manualSingleNeedsFailure } from "./core";
import { fetchWithTimeout } from "./http";

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
 * Descoberta de projetos. A edge function antiga continua existindo, mas só
 * aceita a service role; a interface chama este server function autenticado e
 * com verificação de administrador.
 */
export const discoverProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: level, error: levelError } = await context.supabase.rpc("current_access_level");
    if (levelError) throw new Error(`Não foi possível validar o acesso: ${levelError.message}`);
    if (level !== "administrador") throw new Error("Apenas administradores podem buscar novos projetos");

    const { readSyncEnv } = await import("./orchestrator.server");
    const env = readSyncEnv();
    const resp = await fetchWithTimeout(
      `${env.url}/functions/v1/sync-runrunit-discover-projects`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.serviceKey}`,
          apikey: env.serviceKey,
        },
        body: JSON.stringify({ source: "Manual" }),
      },
      120_000,
      "descoberta de projetos",
    );
    const data = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!resp.ok || data?.success === false) throw new Error(data?.error ?? `Descoberta respondeu HTTP ${resp.status}`);
    return data;
  });

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
    // A checagem da UI é apenas conveniência; a autorização real precisa
    // acontecer no servidor, inclusive para chamadas diretas à server function.
    const { data: level, error: levelError } = await context.supabase.rpc("current_access_level");
    if (levelError) throw new Error(`Não foi possível validar o acesso: ${levelError.message}`);
    if (level !== "administrador") throw new Error("Apenas administradores podem iniciar sincronizações");

    const { acquire, chainNext, failRun, processSlice, readSyncEnv, adminClient, isTransientChainError } =
      await import("./orchestrator.server");
    const env = readSyncEnv();
    const secret = process.env.SYNC_CRON_SECRET;

    // O lote depende do encadeamento HTTP. Sem o segredo, não criamos uma
    // execução que ficaria presa até o watchdog.
    if (data.type === "manual_batch" && !secret) {
      return {
        started: false,
        reason: "config",
        message: "SYNC_CRON_SECRET não configurado; a atualização em lote não pode ser iniciada.",
      };
    }
    if (data.type === "manual_batch" && !env.appOrigin) {
      return {
        started: false,
        reason: "config",
        message: "APP_BASE_URL não configurada; a atualização em lote não pode ser iniciada.",
      };
    }

    const who = String((context.claims as { email?: string }).email ?? context.userId);
    const r = await acquire(env, data.type, who, data.ids, context.userId);
    if (!r.acquired) return { started: false, reason: r.reason, message: r.message };
    const run = { runId: r.run_id, token: Number(r.fencing_token) };

    if (data.type === "manual_single") {
      // Um projeto: processa já, no servidor, e devolve o resultado ao botão.
      try {
        const result = await processSlice(env, run);
        if (result.lockLost) {
          return {
            started: true,
            runId: run.runId,
            single: { ok: false, error: "A execução perdeu a trava para outra sincronização." },
          };
        }
        if (manualSingleNeedsFailure(result)) {
          await failRun(env, run, "A sincronização individual não foi concluída.");
        }
        const { data: item } = await adminClient(env)
          .from("dashboard_sync_run_items")
          .select("status,error_message")
          .eq("run_id", run.runId)
          .maybeSingle();
        const ok = item?.status === "completed";
        return {
          started: true,
          runId: run.runId,
          single: { ok, error: ok ? null : (item?.error_message ?? "Falha") },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await failRun(env, run, msg);
        throw e;
      }
    }

    // Lote: dispara a primeira fatia no servidor e retorna. Fechar o
    // navegador não interrompe: o encadeamento e o watchdog continuam.
    // Falha transitória deixa a execução viva; o watchdog retoma.
    try {
      await chainNext(env, secret!, run);
    } catch (e) {
      if (isTransientChainError(e)) return { started: true, runId: run.runId };
      const msg = e instanceof Error ? e.message : String(e);
      await failRun(env, run, msg);
      return { started: false, reason: "chain_failed", message: msg };
    }
    return { started: true, runId: run.runId };
  });
