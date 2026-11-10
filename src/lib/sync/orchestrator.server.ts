/**
 * Implementação server-side (Worker) das dependências do núcleo de sync.
 * Somente servidor: usa a chave de serviço e os tokens do Runrun.it.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SLICE,
  mapPeople,
  mapProject,
  mapTasks,
  runSlice,
  type ClaimedItem,
  type RunHandle,
  type SliceResult,
  type SyncDeps,
  type SyncType,
} from "./core";

const RR_BASE = "https://runrun.it/api/v1.0";

type Env = { url: string; serviceKey: string; rrApp: string; rrUser: string };

export function readSyncEnv(): Env {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rrApp = process.env.RUNRUNIT_APP_TOKEN;
  const rrUser = process.env.RUNRUNIT_USER_TOKEN;
  const missing = [
    !url && "SUPABASE_URL",
    !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !rrApp && "RUNRUNIT_APP_TOKEN",
    !rrUser && "RUNRUNIT_USER_TOKEN",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Configuração ausente no servidor: ${missing.join(", ")}`);
  return { url: url!, serviceKey: serviceKey!, rrApp: rrApp!, rrUser: rrUser! };
}

export function adminClient(env: Env): SupabaseClient {
  return createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function rr(env: Env, path: string) {
  const r = await fetch(`${RR_BASE}${path}`, {
    headers: { "App-Key": env.rrApp, "User-Token": env.rrUser, "Content-Type": "application/json" },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Runrun.it HTTP ${r.status}${r.status === 429 ? " (limite de requisições)" : ""}: ${body.slice(0, 300)}`);
  }
  return r.json();
}

export function buildDeps(env: Env, db: SupabaseClient): SyncDeps {
  const h = (run: RunHandle) => ({ p_run_id: run.runId, p_token: run.token });
  return {
    now: () => Date.now(),
    async claimNext(run) {
      const d = await rpc<null | { item_id: string; claim_id: string; runrunit_project_id: number; attempts: number }>(
        db, "sync_claim_next", h(run));
      return d ? { itemId: `${d.item_id}|${d.claim_id}`, projectId: Number(d.runrunit_project_id), attempts: d.attempts } : null;
    },
    heartbeat: (run) => rpc(db, "sync_heartbeat", h(run)),
    async fetchProject(projectId) {
      const p = await rr(env, `/projects/${projectId}`);
      const project = mapProject(p);
      if (!project.is_open) return { project, tasks: [], people: [] };
      const tasks = await rr(env, `/tasks?project_id=${projectId}`);
      const list = Array.isArray(tasks) ? tasks : [];
      return { project, tasks: mapTasks(list), people: mapPeople(list) };
    },
    async persistProject(run, item, payload) {
      const [itemId, claimId] = item.itemId.split("|");
      await rpc(db, "sync_persist_project", {
        ...h(run), p_item_id: itemId, p_claim_id: claimId,
        p_project: payload.project, p_tasks: payload.tasks, p_people: payload.people,
      });
    },
    async calcEstimates(run, projectId) {
      // Função oficial existente (idempotente por projeto). Verifica a posse
      // da trava imediatamente antes; ver limitação documentada no AGENTS.md.
      await rpc(db, "sync_heartbeat", h(run));
      const resp = await fetch(`${env.url}/functions/v1/calculate-dashboard-project-estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.serviceKey}`, apikey: env.serviceKey },
        body: JSON.stringify({ runrunit_project_id: projectId }),
      });
      const data = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!resp.ok || data?.success === false) throw new Error(`Estimativas: ${data?.error ?? `HTTP ${resp.status}`}`);
    },
    async completeItem(run, item: ClaimedItem) {
      const [itemId, claimId] = item.itemId.split("|");
      await rpc(db, "sync_complete_item", { ...h(run), p_item_id: itemId, p_claim_id: claimId });
    },
    async recordFailure(run, item, error) {
      const [itemId, claimId] = item.itemId.split("|");
      await rpc(db, "sync_record_failure", { ...h(run), p_item_id: itemId, p_claim_id: claimId, p_error: error });
    },
    async finalize(run) {
      const d = await rpc<{ done: boolean; status?: string; busy?: number; wait_seconds?: number }>(db, "sync_finalize", h(run));
      return d.done ? { done: true, status: d.status ?? "completed" } : { done: false, busy: d.busy ?? 0, waitSeconds: d.wait_seconds ?? 0 };
    },
  };
}

/** Processa uma fatia mantendo heartbeat a cada 15s enquanto trabalha. */
export async function processSlice(env: Env, run: RunHandle): Promise<SliceResult> {
  const db = adminClient(env);
  const deps = buildDeps(env, db);
  const timer = setInterval(() => void deps.heartbeat(run).catch(() => undefined), 15_000);
  try {
    return await runSlice(deps, run, DEFAULT_SLICE);
  } finally {
    clearInterval(timer);
  }
}

export type AcquireResult =
  | { acquired: true; run_id: string; fencing_token: number }
  | { acquired: false; reason: string; message: string; run_id?: string };

export async function acquire(env: Env, type: SyncType, lockedBy: string, ids: number[] | null, userId: string | null) {
  return rpc<AcquireResult>(adminClient(env), "sync_acquire_lock", {
    p_sync_type: type, p_locked_by: lockedBy, p_project_ids: ids, p_created_by: userId,
  });
}

/**
 * Watchdog: recupera execução sem heartbeat (nova execução filha, token novo)
 * e devolve a execução ativa que precisa de continuidade, se houver.
 */
export async function watchdog(env: Env): Promise<RunHandle | null> {
  const db = adminClient(env);
  await rpc(db, "sync_recover_stale", {});
  const cur = await rpc<null | { run_id: string; fencing_token: number; heartbeat_age_seconds: number }>(db, "sync_current_run", {});
  // Heartbeat recente = há um worker ativo; não inicia outro em paralelo.
  if (!cur || cur.heartbeat_age_seconds < 40) return null;
  return { runId: cur.run_id, token: Number(cur.fencing_token) };
}

export async function failRun(env: Env, run: RunHandle, error: string) {
  await rpc(adminClient(env), "sync_fail_run", { p_run_id: run.runId, p_token: run.token, p_error: error }).catch(() => undefined);
}

/**
 * Encadeamento server-side (melhor esforço): dispara a próxima fatia sem
 * aguardar. A garantia de continuidade é o watchdog agendado (1/min).
 */
export async function chainNext(origin: string, secret: string, run: RunHandle) {
  try {
    await Promise.race([
      fetch(`${origin}/api/public/sync-orchestrator`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-sync-secret": secret },
        body: JSON.stringify({ action: "continue", run_id: run.runId, fencing_token: run.token }),
      }),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* watchdog assume */
  }
}
