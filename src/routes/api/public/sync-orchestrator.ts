import { createFileRoute } from "@tanstack/react-router";
import { shouldChainNow } from "@/lib/sync/core";
import {
  acquire,
  chainNext,
  failRun,
  isTransientChainError,
  processSlice,
  readSyncEnv,
  watchdog,
} from "@/lib/sync/orchestrator.server";

/**
 * Endpoint chamado apenas pelo agendador do banco (pg_cron) e pelo próprio
 * servidor (encadeamento). Exige o segredo compartilhado SYNC_CRON_SECRET.
 *  - action "daily":    inicia a sincronização automática (06:00 Cuiabá).
 *  - action "watchdog": retoma execuções sem heartbeat / continua fatias.
 *  - action "continue": processa a próxima fatia de uma execução.
 */
export const Route = createFileRoute("/api/public/sync-orchestrator")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SYNC_CRON_SECRET;
        if (!secret || request.headers.get("x-sync-secret") !== secret) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        let body: { action?: string; run_id?: string; fencing_token?: number };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }
        let env: ReturnType<typeof readSyncEnv> | null = null;
        let run: { runId: string; token: number } | null = null;
        try {
          env = readSyncEnv();
          if (body.action === "daily") {
            const r = await acquire(env, "automatic", "agendamento 06:00 (Cuiabá)", null, null);
            if (!r.acquired) return Response.json({ started: false, reason: r.reason, message: r.message });
            run = { runId: r.run_id, token: Number(r.fencing_token) };
          } else if (body.action === "watchdog") {
            run = await watchdog(env);
            if (!run) return Response.json({ ok: true, idle: true });
          } else if (body.action === "continue" && body.run_id && Number.isFinite(Number(body.fencing_token))) {
            run = { runId: body.run_id, token: Number(body.fencing_token) };
          } else {
            return Response.json({ error: "ação inválida" }, { status: 400 });
          }
          const res = await processSlice(env, run);
          if (!res.lockLost && shouldChainNow(res.finalize)) {
            if (!env.appOrigin) {
              return Response.json({
                ok: true,
                run_id: run.runId,
                ...res,
                chained: false,
                recovery: "watchdog",
                reason: "APP_BASE_URL não configurada",
              });
            }
            try {
              await chainNext(env, secret, run);
            } catch (e) {
              const chainMsg = e instanceof Error ? e.message : String(e);
              if (isTransientChainError(e)) {
                return Response.json({
                  ok: true,
                  run_id: run.runId,
                  ...res,
                  chained: false,
                  recovery: "watchdog",
                });
              }
              await failRun(env, run, chainMsg);
              return Response.json({ ok: false, error: chainMsg, run_id: run.runId }, { status: 502 });
            }
          }
          return Response.json({ ok: true, run_id: run.runId, ...res });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("sync-orchestrator:", msg);
          if (env && run && !msg.includes("LOCK_LOST") && !isTransientChainError(e)) {
            await failRun(env, run, msg);
          }
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
