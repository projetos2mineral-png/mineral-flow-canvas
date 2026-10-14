import {
  closestCorners,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";

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

/**
 * Colisão contextual:
 * - Arraste de coluna: considera somente `laneItem:*` (reordenação horizontal intacta).
 * - Arraste de card: ignora `laneItem:*` como alvo preferencial, priorizando cards e
 *   corpos de fila sob o ponteiro; se nada estiver sob o ponteiro (ex.: cabeçalho),
 *   cai para a coluna sob o ponteiro e, por fim, para o mais próximo.
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

  const inner = all.filter((c) => !isLaneItemId(String(c.id)));
  const pointerInner = pointerWithin({ ...args, droppableContainers: inner });
  if (pointerInner.length > 0) {
    // Prefere um card sob o ponteiro em vez do corpo da fila, para posicionamento exato.
    const card = pointerInner.find((c) => !String(c.id).startsWith(LANE_BODY_PREFIX));
    return card ? [card] : [pointerInner[0]];
  }

  const pointerLane = pointerWithin({
    ...args,
    droppableContainers: all.filter((c) => isLaneItemId(String(c.id))),
  });
  if (pointerLane.length > 0) return [pointerLane[0]];

  return closestCorners({ ...args, droppableContainers: inner });
};
