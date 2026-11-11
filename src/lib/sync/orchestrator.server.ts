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
import { fetchWithTimeout } from "./http";
import { shouldStartMissedDaily, utcStartOfDay } from "./schedule";

const RR_BASE = "https://runrun.it/api/v1.0";
const RR_TIMEOUT_MS = 20_000;
const ESTIMATE_TIMEOUT_MS = 60_000;
const CHAIN_WAIT_MS = 1_500;
const TASKS_PER_PAGE = 100;
const MAX_TASK_PAGES = 100;
const CANONICAL_APP_ORIGIN = "https://mineral-flow-canvas.lovable.app";

type Env = { url: string; serviceKey: string; rrApp: string; rrUser: string; appOrigin: string | null };

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "[::1]") return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

/**
 * Origem canônica do próprio app usada pelo encadeamento HTTP. Nunca deriva
 * do Host/X-Forwarded-Host da requisição, para que o segredo do cron não possa
 * ser redirecionado por cabeçalhos do cliente. APP_BASE_URL permite trocar o
 * domínio sem alterar código; o valor é validado antes de receber o segredo.
 */
function validateAppOrigin(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("APP_BASE_URL inválida: informe apenas a origem canônica do app");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("APP_BASE_URL inválida: use apenas protocolo, host e porta (sem caminho, query ou credenciais)");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("APP_BASE_URL inválida: use http ou https");
  }
  if (parsed.protocol === "http:" && !isPrivateHost(parsed.hostname)) {
    throw new Error("APP_BASE_URL inválida: http só é permitido para host local/privado");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("APP_BASE_URL inválida: produção exige https");
  }
  if (process.env.NODE_ENV === "production" && isPrivateHost(parsed.hostname)) {
    throw new Error("APP_BASE_URL inválida: host privado não é permitido em produção");
  }
  return parsed.origin;
}

function resolveAppOrigin(): string | null {
  const raw = process.env.APP_BASE_URL?.trim();
  if (raw) return validateAppOrigin(raw);
  // Em produção o domínio canônico é conhecido; em desenvolvimento exigimos
  // APP_BASE_URL para nunca enviar o segredo local para o domínio de produção.
  return process.env.NODE_ENV === "production" ? validateAppOrigin(CANONICAL_APP_ORIGIN) : null;
}

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
  return {
    url: url!,
    serviceKey: serviceKey!,
    rrApp: rrApp!,
    rrUser: rrUser!,
    appOrigin: resolveAppOrigin(),
  };
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
  const r = await fetchWithTimeout(
    `${RR_BASE}${path}`,
    { headers: { "App-Key": env.rrApp, "User-Token": env.rrUser, "Content-Type": "application/json" } },
    RR_TIMEOUT_MS,
    "Runrun.it",
  );
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Runrun.it HTTP ${r.status}${r.status === 429 ? " (limite de requisições)" : ""}: ${body.slice(0, 300)}`);
  }
  return r.json();
}

async function fetchProjectTasks(env: Env, projectId: number): Promise<unknown[]> {
  const all: unknown[] = [];
  const seen = new Set<number>();
  for (let page = 1; page <= MAX_TASK_PAGES + 1; page++) {
    const data = await rr(env, `/tasks?project_id=${projectId}&page=${page}&per_page=${TASKS_PER_PAGE}`);
    if (!Array.isArray(data)) {
      throw new Error(`Runrun.it retornou paginação inválida para o projeto ${projectId}`);
    }
    // Só consideramos a listagem completa depois de uma página vazia. Uma
    // página curta não prova o fim: a API pode ignorar per_page e continuar.
    if (data.length === 0) return all;
    if (page > MAX_TASK_PAGES) {
      throw new Error(`Runrun.it retornou mais de ${MAX_TASK_PAGES * TASKS_PER_PAGE} tarefas para o projeto ${projectId}`);
    }
    if (data.length > TASKS_PER_PAGE) {
      throw new Error(`Runrun.it retornou página maior que ${TASKS_PER_PAGE} para o projeto ${projectId}`);
    }
    for (const task of data) {
      const id = Number((task as { id?: unknown } | null)?.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`Runrun.it retornou tarefa sem id válido no projeto ${projectId}`);
      }
      if (seen.has(id)) {
        throw new Error(`Runrun.it repetiu a tarefa ${id} na paginação do projeto ${projectId}`);
      }
      seen.add(id);
      all.push(task);
    }
  }
  throw new Error(`Runrun.it retornou mais de ${MAX_TASK_PAGES * TASKS_PER_PAGE} tarefas para o projeto ${projectId}`);
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
      const list = await fetchProjectTasks(env, projectId);
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
      // A função de estimativas valida o fencing novamente antes de gravar.
      await rpc(db, "sync_heartbeat", h(run));
      const resp = await fetchWithTimeout(
        `${env.url}/functions/v1/calculate-dashboard-project-estimates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.serviceKey}`, apikey: env.serviceKey },
          body: JSON.stringify({ runrunit_project_id: projectId, run_id: run.runId, fencing_token: run.token }),
        },
        ESTIMATE_TIMEOUT_MS,
        "estimativas",
      );
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
      const d = await rpc<{
        done: boolean;
        status?: string;
        busy?: number;
        pending?: number;
        processing?: number;
        waiting?: number;
        wait_seconds?: number;
      }>(db, "sync_finalize", h(run));
      return d.done
        ? { done: true, status: d.status ?? "completed" }
        : {
            done: false,
            busy: d.busy ?? 0,
            pending: d.pending ?? 0,
            processing: d.processing ?? 0,
            waiting: d.waiting ?? 0,
            waitSeconds: d.wait_seconds ?? 0,
          };
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

async function hasAutomaticRunToday(db: SupabaseClient, now: Date): Promise<boolean> {
  const { data, error } = await db
    .from("dashboard_sync_runs")
    .select("id")
    .eq("sync_type", "automatic")
    .gte("started_at", utcStartOfDay(now).toISOString())
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Watchdog: recupera execução sem heartbeat (nova execução filha, token novo)
 * e devolve a execução ativa que precisa de continuidade, se houver.
 * Também inicia o diário atrasado quando o cron das 10:00 encontrou a trava
 * ocupada e nenhuma execução automática foi criada naquele dia UTC.
 */
export async function watchdog(env: Env): Promise<RunHandle | null> {
  const db = adminClient(env);
  const recovered = await rpc<null | { recovered?: boolean; run_id?: string; fencing_token?: number }>(
    db,
    "sync_recover_stale",
    {},
  );
  if (recovered?.recovered && recovered.run_id && recovered.fencing_token !== undefined) {
    return { runId: recovered.run_id, token: Number(recovered.fencing_token) };
  }
  const cur = await rpc<null | { run_id: string; fencing_token: number; heartbeat_age_seconds: number }>(db, "sync_current_run", {});
  if (!cur) {
    const now = new Date();
    if (shouldStartMissedDaily(now, await hasAutomaticRunToday(db, now))) {
      const r = await acquire(env, "automatic", "watchdog (diário atrasado)", null, null);
      if (r.acquired) return { runId: r.run_id, token: Number(r.fencing_token) };
    }
    return null;
  }
  // Heartbeat recente = há um worker ativo; não inicia outro em paralelo.
  if (cur.heartbeat_age_seconds < 40) return null;
  return { runId: cur.run_id, token: Number(cur.fencing_token) };
}

export async function failRun(env: Env, run: RunHandle, error: string) {
  await rpc(adminClient(env), "sync_fail_run", { p_run_id: run.runId, p_token: run.token, p_error: error }).catch(() => undefined);
}

export class ChainDispatchError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ChainDispatchError";
  }
}

export function isTransientChainError(e: unknown): boolean {
  return e instanceof ChainDispatchError && e.transient;
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 ||
    status === 504;
}

/**
 * Encadeamento server-side: dispara a próxima fatia usando sempre a origem
 * canônica do app (nunca a origem da requisição). Falhas transitórias deixam a
 * execução viva para o watchdog; falhas permanentes (ex.: 401) liberam a trava.
 * Se a fatia ainda estiver processando além do prazo de espera, considera que o
 * request foi despachado e deixa a continuidade para o watchdog.
 */
export async function chainNext(env: Env, secret: string, run: RunHandle) {
  if (!env.appOrigin) {
    throw new ChainDispatchError(
      "APP_BASE_URL não configurada; o encadeamento HTTP não pode ser iniciado",
      false,
    );
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = fetch(`${env.appOrigin}/api/public/sync-orchestrator`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sync-secret": secret },
    body: JSON.stringify({ action: "continue", run_id: run.runId, fencing_token: run.token }),
  });
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CHAIN_WAIT_MS);
  });
  try {
    const response = await Promise.race([request, timeout]);
    if (response && !response.ok) {
      let body: { ok?: boolean; recovery?: string } | null = null;
      try {
        body = (await response.json()) as { ok?: boolean; recovery?: string };
      } catch {
        body = null;
      }
      const transient = body?.recovery === "watchdog" ||
        (isTransientHttpStatus(response.status) && body?.ok !== false);
      throw new ChainDispatchError(
        `Encadeamento respondeu HTTP ${response.status}`,
        transient,
        response.status,
      );
    }
  } catch (e) {
    void request.catch(() => undefined);
    if (e instanceof ChainDispatchError) throw e;
    throw new ChainDispatchError(
      `Falha transitória no encadeamento: ${e instanceof Error ? e.message : String(e)}`,
      true,
    );
  } finally {
    if (timer) clearTimeout(timer);
    void request.catch(() => undefined);
  }
}
