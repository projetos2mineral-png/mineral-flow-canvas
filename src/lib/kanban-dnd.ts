import { closestCorners, pointerWithin, type CollisionDetection } from "@dnd-kit/core";

/** Prefixo dos itens arrastáveis que representam colunas (filas) inteiras. */
export const LANE_ITEM_PREFIX = "laneItem:";
/** Prefixo da área droppable do corpo de cada fila. */
export const LANE_BODY_PREFIX = "lane:";

export const isLaneItemId = (id: string): boolean => id.startsWith(LANE_ITEM_PREFIX);

/**
 * Resolve o id da fila destino para um "over" durante o arraste de um CARD.
 * `laneItem:` só é aceito aqui porque o chamador garante que o item ativo é um card;
 * no arraste de colunas esse id representa a coluna arrastável e não um destino de card.
 */
export function resolveCardDropLane(
  overId: string,
  laneOfCard: (cardKey: string) => string | null,
): string | null {
  if (overId.startsWith(LANE_BODY_PREFIX)) return overId.slice(LANE_BODY_PREFIX.length);
  if (overId.startsWith(LANE_ITEM_PREFIX)) return overId.slice(LANE_ITEM_PREFIX.length);
  return laneOfCard(overId);
}

/** Indica se o "over" é a própria fila (corpo ou coluna), e não um card específico. */
export const isLaneLevelTarget = (overId: string): boolean =>
  overId.startsWith(LANE_BODY_PREFIX) || overId.startsWith(LANE_ITEM_PREFIX);

/** Id da fila (SortableContext `lane:<id>`) a que um card droppable pertence. */
function containerLaneBodyId(container: { data: { current?: unknown } }): string | null {
  const data = container.data.current as { sortable?: { containerId?: unknown } } | undefined;
  const id = data?.sortable?.containerId;
  return typeof id === "string" && id.startsWith(LANE_BODY_PREFIX) ? id : null;
}

/**
 * Colisão contextual:
 * - Arraste de coluna: considera somente `laneItem:*` (reordenação horizontal intacta).
 * - Arraste de card, em ordem de prioridade:
 *   1. card sob o ponteiro, desde que o ponteiro também esteja dentro da área VISÍVEL
 *      do corpo da fila desse card (descarta cards ocultos pela rolagem de outra fila,
 *      ex.: a longa lista "Sem fila");
 *   2. corpo da fila sob o ponteiro (área vazia, rodapé, espaço de rolagem);
 *   3. coluna inteira sob o ponteiro (cabeçalho e bordas);
 *   4. nada → o arraste é cancelado. Nunca escolhemos "o mais próximo", pois isso
 *      podia resolver para um card de "Sem fila" e gravar `lane_id = null` por engano.
 * O próprio card arrastado nunca é candidato.
 */
export const kanbanCollisionDetection: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  const all = args.droppableContainers;

  if (isLaneItemId(activeId)) {
    return closestCorners({
      ...args,
      droppableContainers: all.filter((c) => isLaneItemId(String(c.id))),
    });
  }

  const candidates = all.filter((c) => String(c.id) !== activeId);
  const bodies = candidates.filter((c) => String(c.id).startsWith(LANE_BODY_PREFIX));
  const columns = candidates.filter((c) => isLaneItemId(String(c.id)));
  const cards = candidates.filter(
    (c) => !isLaneItemId(String(c.id)) && !String(c.id).startsWith(LANE_BODY_PREFIX),
  );

  const bodyHits = pointerWithin({ ...args, droppableContainers: bodies });
  const visibleBodies = new Set(bodyHits.map((h) => String(h.id)));

  if (visibleBodies.size > 0) {
    const cardHits = pointerWithin({
      ...args,
      droppableContainers: cards.filter((c) => {
        const body = containerLaneBodyId(c);
        return body != null && visibleBodies.has(body);
      }),
    });
    if (cardHits.length > 0) return [cardHits[0]];
    return [bodyHits[0]];
  }

  const columnHits = pointerWithin({ ...args, droppableContainers: columns });
  if (columnHits.length > 0) return [columnHits[0]];

  return [];
};

// ---------------------------------------------------------------------------
// Resolução explícita do destino de um CARD solto.
// Diferencia "Sem fila" intencional de destino indeterminado: nunca convertemos
// silenciosamente um alvo desconhecido em "Sem fila".
// ---------------------------------------------------------------------------

export type CardDropTarget =
  | { kind: "lane"; laneId: string; atEnd: boolean; overCardKey: string | null }
  | { kind: "unassigned"; atEnd: boolean; overCardKey: string | null }
  | { kind: "invalid"; reason: "self" | "unknown-lane" | "unknown-card" };

export interface DropContext {
  /** Identificador interno usado para a coluna "Sem fila". */
  unassignedId: string;
  /** Indica se a fila existe no quadro atual. */
  laneExists: (laneId: string) => boolean;
  /** Fila exibida de um card (ou `unassignedId`); `null` se o card não está no quadro. */
  laneOfCard: (cardKey: string) => string | null;
}

export function resolveCardDropTarget(
  overId: string,
  activeId: string,
  ctx: DropContext,
): CardDropTarget {
  if (overId === activeId) return { kind: "invalid", reason: "self" };
  const laneLevel = isLaneLevelTarget(overId);
  const laneId = laneLevel
    ? overId.slice(
        overId.startsWith(LANE_BODY_PREFIX) ? LANE_BODY_PREFIX.length : LANE_ITEM_PREFIX.length,
      )
    : ctx.laneOfCard(overId);
  if (laneId == null) return { kind: "invalid", reason: "unknown-card" };
  const overCardKey = laneLevel ? null : overId;
  if (laneId === ctx.unassignedId) return { kind: "unassigned", atEnd: laneLevel, overCardKey };
  if (!ctx.laneExists(laneId)) return { kind: "invalid", reason: "unknown-lane" };
  return { kind: "lane", laneId, atEnd: laneLevel, overCardKey };
}

export interface MovableCard {
  key: string;
  position: number;
  lane_id: string | null;
  /** Possui linha física gravada no banco. */
  hasRow: boolean;
}

export interface CardMovePlan<T extends MovableCard> {
  /** Valor a gravar em `lane_id` (null = "Sem fila"). */
  laneValue: string | null;
  /** Cards cuja fila/posição precisa ser gravada; o card arrastado vem primeiro. */
  changes: { item: T; position: number }[];
}

/**
 * Calcula a nova ordem da fila destino e quais cards precisam ser gravados.
 * Retorna `null` quando não há mudança (mesma fila e mesma posição).
 */
export function planCardMove<T extends MovableCard>(args: {
  dest: T[];
  active: T;
  fromLaneId: string;
  target: Exclude<CardDropTarget, { kind: "invalid" }>;
  unassignedId: string;
}): CardMovePlan<T> | null {
  const { dest, active, fromLaneId, target, unassignedId } = args;
  const toLaneId = target.kind === "lane" ? target.laneId : unassignedId;
  const laneValue = target.kind === "lane" ? target.laneId : null;

  let toIdx =
    target.atEnd || !target.overCardKey
      ? dest.length
      : dest.findIndex((c) => c.key === target.overCardKey);
  if (toIdx < 0) toIdx = dest.length;

  let order: T[];
  if (fromLaneId === toLaneId) {
    const fromIdx = dest.findIndex((c) => c.key === active.key);
    if (fromIdx < 0) return null;
    const clamped = Math.min(toIdx, dest.length - 1);
    if (fromIdx === clamped) return null;
    order = [...dest];
    order.splice(fromIdx, 1);
    order.splice(clamped, 0, active);
  } else {
    const rest = dest.filter((c) => c.key !== active.key);
    const idx = Math.min(toIdx, rest.length);
    order = [...rest.slice(0, idx), active, ...rest.slice(idx)];
  }

  const changes: { item: T; position: number }[] = [];
  order.forEach((item, position) => {
    if (
      item.key === active.key ||
      !item.hasRow ||
      item.position !== position ||
      item.lane_id !== laneValue
    ) {
      changes.push({ item, position });
    }
  });
  changes.sort((a, b) => (a.item.key === active.key ? -1 : b.item.key === active.key ? 1 : 0));
  return { laneValue, changes };
}
