import { useCallback, useEffect, useState } from "react";

/**
 * Orientação das filas do Kanban mensal — apenas DISPOSIÇÃO VISUAL.
 * Nenhum dado, vínculo ou regra de negócio muda com a orientação.
 *
 * "Vertical"  → disposição atual (colunas lado a lado).
 * "Horizontal" → cada fila vira uma raia horizontal, com cards lado a lado.
 */
export const KANBAN_ORIENTATIONS = ["vertical", "horizontal"] as const;
export type KanbanOrientation = (typeof KANBAN_ORIENTATIONS)[number];

export const KANBAN_ORIENTATION_LABEL: Record<KanbanOrientation, string> = {
  vertical: "Vertical",
  horizontal: "Horizontal",
};

const STORAGE_KEY = "kanban:orientation";

function isKanbanOrientation(v: unknown): v is KanbanOrientation {
  return typeof v === "string" && (KANBAN_ORIENTATIONS as readonly string[]).includes(v);
}

/**
 * Preferência visual persistida em localStorage (mesmo mecanismo da
 * densidade do Kanban). Leitura feita após a montagem para evitar
 * divergência de hidratação no SSR.
 */
export function useKanbanOrientation() {
  const [orientation, setOrientationState] = useState<KanbanOrientation>("vertical");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isKanbanOrientation(saved)) setOrientationState(saved);
    } catch {
      /* localStorage indisponível — mantém o padrão */
    }
  }, []);

  const setOrientation = useCallback((next: KanbanOrientation) => {
    setOrientationState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { orientation, setOrientation };
}
