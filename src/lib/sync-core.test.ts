import { describe, expect, it } from "vitest";
import {
  manualSingleNeedsFailure,
  mapProject,
  mapTasks,
  runSlice,
  shouldChainNow,
  type ClaimedItem,
  type RunHandle,
  type SyncDeps,
  MAX_ATTEMPTS,
} from "@/lib/sync/core";

/**
 * Banco falso que reproduz a semântica das RPCs: trava com fencing token,
 * reserva por item, limite de tentativas e backoff. Os mesmos cenários são
 * verificados contra Postgres real em supabase/tests/sync_rpc.test.sql.
 */
type Item = { id: string; pid: number; status: "pending" | "processing" | "completed" | "failed"; attempts: number; next: number };

function makeDb(pids: number[], opts: { failPids?: number[]; persistFailPids?: number[] } = {}) {
  let clock = 0;
  const lock = { locked: true, runId: "r1", token: 1 };
  const items: Item[] = pids.map((pid) => ({ id: `i${pid}`, pid, status: "pending", attempts: 0, next: 0 }));
  const projectWrites: Record<number, number> = {};
  const fence = (run: RunHandle) => {
    if (!lock.locked || lock.runId !== run.runId || lock.token !== run.token) throw new Error("LOCK_LOST");
  };
  const deps: SyncDeps = {
    now: () => clock,
    async claimNext(run) {
      fence(run);
      const it = items.find(
        (i) =>
          ((i.status === "pending" || i.status === "failed") && i.attempts < MAX_ATTEMPTS) &&
          i.next <= clock,
      );
      if (!it) return null;
      it.status = "processing";
      it.attempts++;
      return { itemId: it.id, projectId: it.pid, attempts: it.attempts };
    },
    async heartbeat(run) { fence(run); },
    async fetchProject(pid) {
      clock += 1000;
      if (opts.failPids?.includes(pid)) throw new Error(`Runrun.it HTTP 404 no projeto ${pid}`);
      return { project: { runrunit_project_id: pid, is_open: true }, tasks: [], people: [] };
    },
    async persistProject(run, item) {
      fence(run); // validação e gravação na mesma operação (transação no banco real)
      if (opts.persistFailPids?.includes(item.projectId)) throw new Error("rollback");
      projectWrites[item.projectId] = (projectWrites[item.projectId] ?? 0) + 1;
    },
    async calcEstimates(run) { fence(run); },
    async completeItem(run, item: ClaimedItem) {
      fence(run);
      const it = items.find((i) => i.id === item.itemId)!;
      it.status = "completed";
    },
    async recordFailure(run, item) {
      fence(run);
      const it = items.find((i) => i.id === item.itemId)!;
      it.status = "failed";
      it.next = clock + (it.attempts <= 1 ? 30_000 : 120_000);
    },
    async finalize(run) {
      fence(run);
      const pending = items.filter((i) => i.status === "pending").length;
      const processing = items.filter((i) => i.status === "processing").length;
      const waiting = items.filter((i) => i.status === "failed" && i.attempts < MAX_ATTEMPTS).length;
      if (pending || processing || waiting) {
        return { done: false, busy: pending + processing, pending, processing, waiting, waitSeconds: 0 };
      }
      lock.locked = false;
      return { done: true, status: items.some((i) => i.status === "failed") ? "completed_with_errors" : "completed" };
    },
  };
  return {
    deps, items, lock, projectWrites,
    advance: (ms: number) => { clock += ms; },
  };
}

const RUN: RunHandle = { runId: "r1", token: 1 };
const SLICE = { maxItems: 15, maxMillis: 35_000, concurrency: 2 };

describe("sincronização resiliente", () => {
  it("T1: processa 40 projetos em várias fatias limitadas até concluir", async () => {
    const db = makeDb(Array.from({ length: 40 }, (_, i) => i + 1));
    const slices: number[] = [];
    let last;
    do {
      last = await runSlice(db.deps, RUN, SLICE);
      slices.push(last.processed);
    } while (last.finalize && !last.finalize.done);
    expect(slices.every((n) => n <= 15)).toBe(true);
    expect(slices.length).toBe(3);
    expect(db.items.every((i) => i.status === "completed")).toBe(true);
    expect(last.finalize).toEqual({ done: true, status: "completed" });
    expect(db.lock.locked).toBe(false);
    // Cada projeto gravado exatamente uma vez (sem duplicação entre fatias).
    expect(Object.values(db.projectWrites).every((n) => n === 1)).toBe(true);
  });

  it("T3: fechamento do navegador não interrompe — fatias seguem só com chamadas do servidor", async () => {
    // Nenhuma dependência do núcleo usa o navegador: o estado vive no banco e
    // cada nova fatia parte apenas de (run_id, token), como no watchdog.
    const db = makeDb([1, 2, 3, 4, 5]);
    const first = await runSlice(db.deps, RUN, { ...SLICE, maxItems: 2 });
    expect(first.finalize?.done).toBe(false);
    // "navegador fechado": nova invocação independente do servidor continua
    const handle: RunHandle = JSON.parse(JSON.stringify(RUN));
    let r = first;
    while (r.finalize && !r.finalize.done) r = await runSlice(db.deps, handle, { ...SLICE, maxItems: 2 });
    expect(db.items.filter((i) => i.status === "completed")).toHaveLength(5);
  });

  it("T5: worker antigo para ao perder a trava e não grava dados", async () => {
    const db = makeDb([1, 2, 3, 4]);
    const orig = db.deps.fetchProject;
    db.deps.fetchProject = async (pid) => {
      const p = await orig(pid);
      if (pid === 2) { db.lock.runId = "r2"; db.lock.token = 2; } // watchdog transferiu a trava
      return p;
    };
    const r = await runSlice(db.deps, RUN, { ...SLICE, concurrency: 1 });
    expect(r.lockLost).toBe(true);
    expect(db.projectWrites[2]).toBeUndefined();
    expect(db.projectWrites[3]).toBeUndefined();
    expect(r.finalize).toBeNull();
  });

  it("T6: falha individual não impede os demais e termina como completed_with_errors", async () => {
    const db = makeDb([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { failPids: [4] });
    let r;
    do {
      r = await runSlice(db.deps, RUN, SLICE);
      db.advance(200_000); // passa o backoff
    } while (r.finalize && !r.finalize.done);
    expect(db.items.filter((i) => i.status === "completed")).toHaveLength(9);
    const bad = db.items.find((i) => i.pid === 4)!;
    expect(bad.status).toBe("failed");
    expect(bad.attempts).toBe(3);
    expect(r.finalize).toEqual({ done: true, status: "completed_with_errors" });
  });

  it("limite: no máximo 3 tentativas, com backoff entre elas", async () => {
    const db = makeDb([7], { persistFailPids: [7] });
    await runSlice(db.deps, RUN, SLICE);
    expect(db.items[0]).toMatchObject({ status: "failed", attempts: 1 });
    const again = await runSlice(db.deps, RUN, SLICE); // ainda em backoff
    expect(again.processed).toBe(0);
    db.advance(30_000);
    await runSlice(db.deps, RUN, SLICE);
    db.advance(120_000);
    const last = await runSlice(db.deps, RUN, SLICE);
    expect(db.items[0].attempts).toBe(3);
    db.advance(10_000_000);
    const after = await runSlice(db.deps, RUN, SLICE);
    expect(after.processed).toBe(0);
    expect(last.finalize?.done).toBe(true);
  });

  it("CLAIM_LOST não conta como falha do projeto nem chama recordFailure", async () => {
    const db = makeDb([1]);
    let failures = 0;
    db.deps.persistProject = async () => {
      throw new Error("CLAIM_LOST: item reservado por outro worker");
    };
    const recordFailure = db.deps.recordFailure;
    db.deps.recordFailure = async (...args) => {
      failures++;
      return recordFailure(...args);
    };
    const r = await runSlice(db.deps, RUN, SLICE);
    expect(failures).toBe(0);
    expect(r.failed).toBe(0);
    expect(db.items[0].status).toBe("processing");
  });

  it("só encadeia com trabalho pendente e nenhum worker processando", () => {
    expect(
      shouldChainNow({ done: false, busy: 2, pending: 2, processing: 0, waiting: 0, waitSeconds: 0 }),
    ).toBe(true);
    expect(
      shouldChainNow({ done: false, busy: 1, pending: 0, processing: 0, waiting: 1, waitSeconds: 30 }),
    ).toBe(false);
    expect(
      shouldChainNow({ done: false, busy: 1, pending: 0, processing: 1, waiting: 0, waitSeconds: 0 }),
    ).toBe(false);
    expect(shouldChainNow({ done: true, status: "completed" })).toBe(false);
    expect(shouldChainNow(null)).toBe(false);
  });

  it("manual single só libera a trava quando não há worker processando", () => {
    const base = { processed: 1, succeeded: 0, failed: 0, lockLost: false };
    expect(manualSingleNeedsFailure({ ...base, finalize: null })).toBe(true);
    expect(
      manualSingleNeedsFailure({
        ...base,
        finalize: { done: false, busy: 1, pending: 0, processing: 1, waiting: 0, waitSeconds: 0 },
      }),
    ).toBe(false);
    expect(
      manualSingleNeedsFailure({
        ...base,
        finalize: { done: false, busy: 1, pending: 1, processing: 0, waiting: 0, waitSeconds: 0 },
      }),
    ).toBe(true);
    expect(
      manualSingleNeedsFailure({
        ...base,
        finalize: { done: false, busy: 1, pending: 0, processing: 1, waiting: 0, waitSeconds: 0 },
        lockLost: true,
      }),
    ).toBe(false);
  });

  it("mapTasks deduplica ids e mapProject não grava data vazia", () => {
    expect(mapTasks([{ id: 1, title: "a" }, { id: 1, title: "b" }])).toEqual([
      expect.objectContaining({ runrunit_task_id: 1, title: "b" }),
    ]);
    expect(mapProject({ id: 1, desired_date: "" }).desired_delivery_date).toBeNull();
  });
});
