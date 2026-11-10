import { createFileRoute } from "@tanstack/react-router";
import { acquire, chainNext, failRun, processSlice, readSyncEnv, watchdog } from "@/lib/sync/orchestrator.server";

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
        const origin = new URL(request.url).origin;
        try {
          const env = readSyncEnv();
          let run: { runId: string; token: number } | null = null;
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
          if (!res.lockLost && res.finalize && !res.finalize.done) await chainNext(origin, secret, run);
          return Response.json({ ok: true, run_id: run.runId, ...res });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("sync-orchestrator:", msg);
          if (body.run_id && body.fencing_token) {
            try {
              const env = readSyncEnv();
              if (msg.startsWith("Configuração ausente")) await failRun(env, { runId: body.run_id, token: Number(body.fencing_token) }, msg);
            } catch { /* sem env */ }
          }
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
