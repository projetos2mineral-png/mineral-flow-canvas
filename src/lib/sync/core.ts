/**
 * Núcleo puro (sem I/O direto) da sincronização resiliente.
 * Toda a garantia de concorrência/fencing mora no banco (RPCs sync_*);
 * aqui fica apenas a orquestração de uma "fatia" de trabalho, injetando as
 * dependências — o que permite testar o fluxo com um banco falso.
 */

export type SyncType = "automatic" | "manual_batch" | "manual_single";
export const SYNC_TYPES: readonly SyncType[] = ["automatic", "manual_batch", "manual_single"] as const;
export const MAX_ATTEMPTS = 3;

export type RunHandle = { runId: string; token: number };
export type ClaimedItem = { itemId: string; projectId: number; attempts: number };

/** Dados prontos para gravar, já mapeados do Runrun.it (mesmo formato da função individual). */
export type ProjectPayload = {
  project: Record<string, unknown> & { runrunit_project_id: number; is_open: boolean };
  tasks: Record<string, unknown>[];
  people: Record<string, unknown>[];
};

export type FinalizeResult = { done: true; status: string } | { done: false; busy: number; waitSeconds: number };

export interface SyncDeps {
  claimNext(run: RunHandle): Promise<ClaimedItem | null>;
  heartbeat(run: RunHandle): Promise<void>;
  fetchProject(projectId: number): Promise<ProjectPayload>;
  /** Transação única no banco (fencing + projeto + tarefas + pessoas + cards). */
  persistProject(run: RunHandle, item: ClaimedItem, payload: ProjectPayload): Promise<void>;
  /** Recalcula estimativas do projeto (idempotente por projeto). */
  calcEstimates(run: RunHandle, projectId: number): Promise<void>;
  completeItem(run: RunHandle, item: ClaimedItem): Promise<void>;
  /** Operação separada da transação desfeita, também cercada pelo token. */
  recordFailure(run: RunHandle, item: ClaimedItem, error: string): Promise<void>;
  finalize(run: RunHandle): Promise<FinalizeResult>;
  now(): number;
}

export type SliceOptions = { maxItems: number; maxMillis: number; concurrency: number };
export const DEFAULT_SLICE: SliceOptions = { maxItems: 15, maxMillis: 35_000, concurrency: 2 };

export type SliceResult = {
  processed: number;
  succeeded: number;
  failed: number;
  lockLost: boolean;
  finalize: FinalizeResult | null;
};

export function isLockLost(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return msg.includes("LOCK_LOST");
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  const m = (e as { message?: string })?.message;
  return m ? String(m) : String(e);
}

/**
 * Processa uma fatia limitada (itens e tempo) e devolve se ainda há trabalho.
 * - Falha de um projeto não interrompe os demais.
 * - LOCK_LOST interrompe imediatamente este worker (execução antiga).
 */
export async function runSlice(deps: SyncDeps, run: RunHandle, opts: SliceOptions = DEFAULT_SLICE): Promise<SliceResult> {
  const started = deps.now();
  const res: SliceResult = { processed: 0, succeeded: 0, failed: 0, lockLost: false, finalize: null };
  let taken = 0;

  const worker = async () => {
    while (!res.lockLost && taken < opts.maxItems && deps.now() - started < opts.maxMillis) {
      let item: ClaimedItem | null;
      try {
        item = await deps.claimNext(run);
      } catch (e) {
        if (isLockLost(e)) res.lockLost = true;
        else throw e;
        return;
      }
      if (!item) return;
      taken++;
      try {
        const payload = await deps.fetchProject(item.projectId);
        await deps.persistProject(run, item, payload);
        if (payload.project.is_open) await deps.calcEstimates(run, item.projectId);
        await deps.completeItem(run, item);
        res.succeeded++;
      } catch (e) {
        if (isLockLost(e)) {
          res.lockLost = true;
          return;
        }
        try {
          await deps.recordFailure(run, item, errorText(e));
        } catch (e2) {
          if (isLockLost(e2)) {
            res.lockLost = true;
            return;
          }
          throw e2;
        }
        res.failed++;
      } finally {
        res.processed++;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  if (!res.lockLost) {
    try {
      res.finalize = await deps.finalize(run);
    } catch (e) {
      if (isLockLost(e)) res.lockLost = true;
      else throw e;
    }
  }
  return res;
}

// ---------- Mapeamento Runrun.it (idêntico à função individual existente) ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapProject(p: any): ProjectPayload["project"] {
  return {
    runrunit_project_id: Number(p.id),
    name: p.name ?? p.title ?? `Projeto ${p.id}`,
    client_name: p.client_name ?? p.client?.name ?? null,
    project_group_name: p.project_group_name ?? p.group_name ?? p.project_group?.name ?? null,
    project_sub_group_name: p.project_sub_group_name ?? p.sub_group_name ?? p.project_sub_group?.name ?? null,
    status: p.is_closed === true ? "closed" : "open",
    is_open: p.is_closed !== true,
    raw_data: p,
    desired_delivery_date: typeof p.desired_date === "string" ? p.desired_date.slice(0, 10) : null,
    created_at_runrunit: p.created_at ?? null,
    updated_at_runrunit: p.updated_at ?? null,
  };
}

export function mapTasks(tasks: any[]): Record<string, unknown>[] {
  return tasks.map((t) => ({
    runrunit_task_id: t.id,
    title: t.title ?? "Sem título",
    responsible_name: t.responsible_name ?? null,
    team_name: t.team_name ?? null,
    task_type: t.type_name ?? null,
    status: t.is_closed ? "closed" : "open",
    board_stage_name: t.board_stage_name ?? null,
    desired_date: t.desired_date ?? null,
    close_date: t.close_date ?? null,
    raw_data: t,
  }));
}

export function mapPeople(tasks: any[]): Record<string, unknown>[] {
  const m = new Map<string, Record<string, unknown>>();
  for (const t of tasks) {
    for (const a of Array.isArray(t.assignments) ? t.assignments : []) {
      const aid = a.assignee_id ?? null, an = a.assignee_name ?? null, tid = a.team_id ?? null, tn = a.team_name ?? null;
      if (!aid && !an && !tid && !tn) continue;
      m.set(`${aid ?? an}-${tid ?? tn}`, { assignee_id: aid, assignee_name: an, team_id: tid, team_name: tn });
    }
  }
  return [...m.values()];
}
/* eslint-enable @typescript-eslint/no-explicit-any */
