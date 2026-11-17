import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint de agendamento da importação de horas trabalhadas.
 * Chamado somente pelo pg_cron (ver supabase/sql/worked_hours_cron_schedule.sql)
 * e protegido pelo mesmo segredo do orquestrador de sincronização.
 *
 * NÃO é executado no carregamento do app durante o desenvolvimento.
 */
export const Route = createFileRoute("/api/public/worked-hours-orchestrator")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SYNC_CRON_SECRET;
        if (!secret || request.headers.get("x-sync-secret") !== secret) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        let body: { action?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }

        if (body.action !== "daily" && body.action !== "run") {
          return Response.json({ error: "ação inválida" }, { status: 400 });
        }

        try {
          const { runWorkedHoursImport } = await import("@/lib/worked-hours/import.server");
          const result = await runWorkedHoursImport({ triggerSource: "scheduled" });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("worked-hours-orchestrator:", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
