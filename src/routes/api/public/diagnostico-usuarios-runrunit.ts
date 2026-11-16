import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const RR_BASE = "https://runrun.it/api/v1.0";

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Diagnóstico temporário e somente leitura:
 * compara os usuários retornados pelo Runrun.it com os responsáveis
 * cadastrados em dashboard_user_capacity. Não grava nem altera dados.
 *
 * Proteção: header x-diagnostic-secret usando o segredo já existente
 * SYNC_CRON_SECRET. Não retorna e-mails, telefones ou outros dados pessoais.
 */
export const Route = createFileRoute("/api/public/diagnostico-usuarios-runrunit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.SYNC_CRON_SECRET;
        if (!secret || request.headers.get("x-diagnostic-secret") !== secret) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.DB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        const appKey = process.env.RUNRUNIT_APP_TOKEN;
        const userToken = process.env.RUNRUNIT_USER_TOKEN;
        const missing = [
          !url && "SUPABASE_URL",
          !serviceKey && "DB_SERVICE_ROLE_KEY",
          !appKey && "RUNRUNIT_APP_TOKEN",
          !userToken && "RUNRUNIT_USER_TOKEN",
        ].filter(Boolean);

        if (missing.length) {
          return Response.json(
            { error: "server_configuration_missing", missing },
            { status: 500 },
          );
        }

        try {
          const db = createClient(url!, serviceKey!, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const [{ data: capacityRows, error: capacityError }, usersResponse] = await Promise.all([
            db.from("dashboard_user_capacity").select("user_name").not("user_name", "is", null),
            fetch(`${RR_BASE}/users`, {
              headers: {
                "App-Key": appKey!,
                "User-Token": userToken!,
                "Content-Type": "application/json",
              },
            }),
          ]);

          if (capacityError) throw new Error(`Capacity query: ${capacityError.message}`);
          if (!usersResponse.ok) {
            const detail = await usersResponse.text().catch(() => "");
            throw new Error(`Runrun.it HTTP ${usersResponse.status}: ${detail.slice(0, 250)}`);
          }

          const payload: unknown = await usersResponse.json();
          const rawUsers = Array.isArray(payload)
            ? payload
            : payload && typeof payload === "object" && Array.isArray((payload as { users?: unknown[] }).users)
              ? (payload as { users: unknown[] }).users
              : null;

          if (!rawUsers) {
            throw new Error("Formato inesperado na resposta de GET /users.");
          }

          const capacityNames = [...new Set(
            (capacityRows ?? [])
              .map((row) => String(row.user_name ?? "").trim())
              .filter(Boolean),
          )].sort((a, b) => a.localeCompare(b, "pt-BR"));

          const users = rawUsers
            .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
            .map((item) => ({
              id: typeof item.id === "string" ? item.id : String(item.id ?? ""),
              name: typeof item.name === "string" ? item.name.trim() : "",
            }))
            .filter((user) => user.id && user.name)
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

          const capacityByNormalizedName = new Map(
            capacityNames.map((name) => [normalizeName(name), name]),
          );

          const exactMatches = users
            .map((user) => ({
              capacity_name: capacityByNormalizedName.get(normalizeName(user.name)) ?? null,
              runrunit_id: user.id,
              runrunit_name: user.name,
            }))
            .filter((match) => match.capacity_name !== null);

          const matchedCapacity = new Set(exactMatches.map((match) => match.capacity_name));
          const unmatchedCapacity = capacityNames.filter((name) => !matchedCapacity.has(name));

          return Response.json({
            read_only: true,
            source: "Runrun.it GET /api/v1.0/users",
            capacity_source: "dashboard_user_capacity.user_name",
            totals: {
              runrunit_users: users.length,
              capacity_responsibles: capacityNames.length,
              exact_matches: exactMatches.length,
              unmatched_capacity_names: unmatchedCapacity.length,
            },
            users,
            exact_matches: exactMatches,
            unmatched_capacity_names: unmatchedCapacity,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("diagnostico-usuarios-runrunit:", message);
          return Response.json({ error: "diagnostic_failed", message }, { status: 500 });
        }
      },
    },
  },
});
