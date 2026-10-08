import { arrayMove } from "@dnd-kit/sortable";

/**
 * Planejamento Semanal — lógica PURA de um movimento (drag & drop).
 *
 * Não persiste nada: recebe o estado exibido (6 buckets: 0 = Backlog,
 * 1..5 = Semanas) e devolve as operações a executar com as funções já
 * existentes de `src/lib/weekly-plan.ts`:
 *
 *  - `bulkUpdates` → `bulkUpdateWeeklyPositions` (linhas já existentes);
 *  - `upserts`     → `upsertWeeklyPlacement` / `moveToBacklog` (linha
 *    inexistente ou a do card arrastado, pela identidade natural
 *    runrunit_project_id + assignee_name + reference_month).
 *
 * Regras de ordem (esquerda = maior prioridade):
 *  - Cards COM linha em `dashboard_weekly_plan` ordenam por `position`;
 *  - cards SEM linha (Backlog natural) vêm depois, na ordem do Kanban;
 *  - por isso, todo card sem linha que fique ANTES de um card com linha na
 *    ordem-alvo precisa ganhar linha — senão a ordem exibida não
 *    sobreviveria a um reload. É o que `lastRowIdx` garante.
 *
 * Nenhuma operação toca em `dashboard_project_cards` (lane_id, position,
 * manually_positioned) — esta dimensão é independente do Kanban mensal.
 */

export type WeeklyMoveCard = { key: string; runrunit_project_id: number };

export type WeeklyMoveEntry = {
  id: string;
  week_number: number | null;
  position: number;
};

export type WeeklyMovePlan = {
  bulkUpdates: { id: string; week_number: number | null; position: number }[];
  upserts: { projectId: number; week: number | null; position: number }[];
};

/** 0 = Backlog; 1..5 = Semana 1..5 */
export const WEEKLY_BACKLOG_BUCKET = 0;

export function planWeeklyMove(args: {
  /** Listas na ordem exibida; índice = bucket (0=Backlog, 1..5). */
  buckets: WeeklyMoveCard[][];
  /** Estado atual das linhas de `dashboard_weekly_plan` por projeto. */
  entryByProject: Map<number, WeeklyMoveEntry>;
  /** `key` do card arrastado. */
  activeKey: string;
  /** `key` do card sob o cursor ou `wrow:<bucket>` (corpo de uma linha). */
  overId: string;
}): WeeklyMovePlan | null {
  const { buckets, entryByProject, activeKey, overId } = args;

  const overRowBucket = overId.startsWith("wrow:") ? Number(overId.slice(5)) : null;

  const bucketOfCard = (key: string): number | null => {
    for (const list of buckets) {
      const c = list.find((x) => x.key === key);
      if (c) {
        const e = entryByProject.get(c.runrunit_project_id);
        return e ? (e.week_number ?? WEEKLY_BACKLOG_BUCKET) : WEEKLY_BACKLOG_BUCKET;
      }
    }
    return null;
  };

  const srcBucket = bucketOfCard(activeKey);
  if (srcBucket === null) return null;

  const destBucket = overRowBucket !== null ? overRowBucket : bucketOfCard(overId);
  if (destBucket === null || destBucket < 0 || destBucket >= buckets.length) return null;

  const srcList = buckets[srcBucket];
  const destList = buckets[destBucket];
  const fromIdx = srcList.findIndex((c) => c.key === activeKey);
  if (fromIdx === -1) return null;
  const activeCard = srcList[fromIdx];

  // Drop no corpo da linha → anexa ao final; drop em outro card → posição dele
  let toIdx: number;
  if (overRowBucket !== null) {
    toIdx = destList.length;
  } else {
    toIdx = destList.findIndex((c) => c.key === overId);
    if (toIdx === -1) toIdx = destList.length;
  }

  let target: WeeklyMoveCard[];
  if (srcBucket === destBucket) {
    if (fromIdx === toIdx) return null;
    target = arrayMove(destList, fromIdx, toIdx);
  } else {
    target = [...destList.slice(0, toIdx), activeCard, ...destList.slice(toIdx)];
  }

  // Mesmo bucket e ordem final idêntica à atual → nada mudou, nada a
  // persistir. Entre buckets diferentes sempre há mudança (a semana do
  // card difere), então a comparação só faz sentido dentro do mesmo bucket.
  if (
    srcBucket === destBucket &&
    target.length === srcList.length &&
    target.every((c, i) => c.key === srcList[i]?.key)
  ) {
    return null;
  }

  const destWeek: number | null = destBucket === WEEKLY_BACKLOG_BUCKET ? null : destBucket;
  const srcWeek: number | null = srcBucket === WEEKLY_BACKLOG_BUCKET ? null : srcBucket;

  const plan: WeeklyMovePlan = { bulkUpdates: [], upserts: [] };

  // Último índice do destino que terá linha (existentes + o card arrastado,
  // que SEMPRE ganha linha). Cards sem linha antes dele também precisam de
  // linha para a ordem exibida sobreviver ao reload.
  let lastRowIdx = -1;
  target.forEach((c, i) => {
    if (c.key === activeKey || entryByProject.has(c.runrunit_project_id)) lastRowIdx = i;
  });

  target.forEach((c, i) => {
    const entry = entryByProject.get(c.runrunit_project_id);
    const needsChange = !entry || entry.week_number !== destWeek || entry.position !== i;
    if (!needsChange) return;
    if (c.key === activeKey) {
      // Card arrastado: sempre via upsertWeeklyPlacement / moveToBacklog
      plan.upserts.push({ projectId: c.runrunit_project_id, week: destWeek, position: i });
    } else if (entry && !entry.id.startsWith("tmp:")) {
      plan.bulkUpdates.push({ id: entry.id, week_number: destWeek, position: i });
    } else if (entry || i < lastRowIdx) {
      plan.upserts.push({ projectId: c.runrunit_project_id, week: destWeek, position: i });
    }
  });

  // Origem (quando diferente do destino): reindexa apenas quem JÁ tem linha.
  // Quem não tem linha permanece depois das linhas, na mesma ordem relativa.
  if (srcBucket !== destBucket) {
    const srcAfter = srcList.filter((c) => c.key !== activeKey);
    srcAfter.forEach((c, i) => {
      const entry = entryByProject.get(c.runrunit_project_id);
      if (!entry) return;
      if (entry.week_number === srcWeek && entry.position === i) return;
      if (entry.id.startsWith("tmp:")) {
        plan.upserts.push({ projectId: c.runrunit_project_id, week: srcWeek, position: i });
      } else {
        plan.bulkUpdates.push({ id: entry.id, week_number: srcWeek, position: i });
      }
    });
  }

  if (!plan.bulkUpdates.length && !plan.upserts.length) return null;
  return plan;
}
