import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const RR_BASE = "https://runrun.it/api/v1.0";
const PAGE_SIZE = 100;
const SUPABASE_PAGE_SIZE = 1000;
const MAX_RUNRUNIT_PAGES = 100;

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Vary: "x-diagnostic-secret",
    },
  });
}

// Compare without an early exit on the first differing character.
function secretsMatch(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  let difference = provided.length ^ expected.length;
  const length = Math.max(provided.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(/,(?=\s*<)/)) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (!match) continue;
    const next = new URL(match[1], RR_BASE);
    if (next.origin !== "https://runrun.it" || !next.pathname.startsWith("/api/v1.0/users")) {
      throw new Error("Invalid pagination link");
    }
    return next.toString();
  }
  return null;
}

async function fetchAllRunrunUsers(appKey: string, userToken: string) {
  const users: Record<string, unknown>[] = [];
  let url: string | null = `${RR_BASE}/users?limit=${PAGE_SIZE}&page=1`;
  let pages = 0;

  while (url) {
    pages += 1;
    if (pages > MAX_RUNRUNIT_PAGES) throw new Error("Pagination limit exceeded");

    const response: Response = await fetch(url, {
      headers: {
        "App-Key": appKey,
        "User-Token": userToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) throw new Error(`Runrun.it request failed: ${response.status}`);

    const payload: unknown = await response.json();
    const pageUsers = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as { users?: unknown[] }).users)
        ? (payload as { users: unknown[] }).users
        : null;
    if (!pageUsers) throw new Error("Unexpected Runrun.it response format");

    users.push(...pageUsers.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === "object",
    ));
    url = nextPageUrl(response.headers.get("Link"));
  }

  return { users, pages };
}

async function fetchAllCapacityNames(db: ReturnType<typeof createClient>) {
  const names = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await db
      .from("dashboard_user_capacity")
      .select("user_name")
      .not("user_name", "is", null)
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) throw new Error("Capacity query failed");

    const rows = data ?? [];
    for (const row of rows) {
      const name = String(row.user_name ?? "").trim();
      if (name) names.add(name);
    }
    if (rows.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Diagnóstico temporário e somente leitura:
 * compara usuários do Runrun.it com responsáveis cadastrados em
 * dashboard_user_capacity. Não grava nem altera dados.
 *
 * Proteção: segredo dedicado DIAGNOSTIC_SECRET no header
 * x-diagnostic-secret. Não reutiliza o segredo do orquestrador.
 */
export const Route = createFileRoute("/api/public/diagnostico-usuarios-runrunit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!secretsMatch(request.headers.get("x-diagnostic-secret"), process.env.DIAGNOSTIC_SECRET)) {
          return jsonResponse({ error: "unauthorized" }, 401);
        }

        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.DB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        const appKey = process.env.RUNRUNIT_APP_TOKEN;
        const userToken = process.env.RUNRUNIT_USER_TOKEN;
        if (!url || !serviceKey || !appKey || !userToken) {
          console.error("diagnostico-usuarios-runrunit: server configuration incomplete");
          return jsonResponse({ error: "server_configuration_missing" }, 500);
        }

        try {
          const db = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const [capacityNames, runrunResult] = await Promise.all([
            fetchAllCapacityNames(db),
            fetchAllRunrunUsers(appKey, userToken),
          ]);

          const users = runrunResult.users
            .map((item) => ({
              id: typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : "",
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

          return jsonResponse({
            read_only: true,
            source: "Runrun.it GET /api/v1.0/users",
            capacity_source: "dashboard_user_capacity.user_name",
            pagination: {
              runrunit_pages: runrunResult.pages,
              runrunit_page_size: PAGE_SIZE,
              supabase_page_size: SUPABASE_PAGE_SIZE,
            },
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
          console.error(
            "diagnostico-usuarios-runrunit: diagnostic failed",
            error instanceof Error ? error.message : "unknown error",
          );
          return jsonResponse({ error: "diagnostic_failed" }, 500);
        }
      },
    },
  },
});
