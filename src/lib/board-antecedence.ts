import { supabase } from "@/integrations/supabase/client";

/**
 * Configuração de antecedência por quadro (responsável).
 * Cada quadro possui uma regra geral de antecedência em dias para
 * posicionamento dos cards: data_posicionamento = desired_delivery_date - antecedence_days
 */

export interface BoardAntecedence {
  assignee_name: string;
  antecedence_days: number;
  updated_at?: string;
}

/**
 * Calcula a data de posicionamento subtraindo a antecedência da data desejada.
 * Usa UTC para evitar deslocamento de fuso.
 * Retorna string ISO YYYY-MM-DD ou null se entrada inválida.
 */
export function calculatePositioningDate(desiredDate: string, antecedenceDays: number): string | null {
  if (!desiredDate) return null;
  const days = Math.max(0, Math.floor(Number(antecedenceDays) || 0));
  if (days === 0) {
    // Retorna apenas a parte YYYY-MM-DD
    return desiredDate.length > 10 ? desiredDate.slice(0, 10) : desiredDate;
  }
  // Trabalha em UTC para evitar problemas de fuso
  const base = desiredDate.length <= 10 ? `${desiredDate}T00:00:00Z` : desiredDate;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Busca a antecedência configurada para um quadro específico.
 * Retorna 0 se não houver configuração (comportamento padrão).
 */
export async function fetchBoardAntecedence(assigneeName: string): Promise<number> {
  const name = assigneeName?.trim();
  if (!name) return 0;
  try {
    const { data, error } = await (supabase as any)
      .from("dashboard_board_settings")
      .select("antecedence_days")
      .eq("assignee_name", name)
      .maybeSingle();
    if (error) {
      // Se a tabela não existir ou outro erro, fallback para 0
      // Tenta localStorage como fallback temporário
      try {
        const local = typeof window !== "undefined" ? window.localStorage.getItem(`board_antecedence:${name}`) : null;
        if (local !== null) {
          const v = parseInt(local, 10);
          if (!isNaN(v) && v >= 0) return v;
        }
      } catch {}
      console.warn("fetchBoardAntecedence fallback to 0 due to error:", error);
      return 0;
    }
    if (!data) return 0;
    const v = Number((data as any).antecedence_days);
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.floor(v);
  } catch (e) {
    console.warn("fetchBoardAntecedence error:", e);
    try {
      const local = typeof window !== "undefined" ? window.localStorage.getItem(`board_antecedence:${name}`) : null;
      if (local !== null) {
        const v = parseInt(local, 10);
        if (!isNaN(v) && v >= 0) return v;
      }
    } catch {}
    return 0;
  }
}

/**
 * Salva ou atualiza a antecedência de um quadro.
 */
export async function upsertBoardAntecedence(assigneeName: string, days: number): Promise<void> {
  const name = assigneeName?.trim();
  if (!name) throw new Error("Assignee name required");
  const antecedence_days = Math.max(0, Math.floor(Number(days) || 0));

  // Tenta persistir no Supabase
  let supabaseSuccess = false;
  try {
    const { error } = await (supabase as any)
      .from("dashboard_board_settings")
      .upsert(
        {
          assignee_name: name,
          antecedence_days,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignee_name" }
      );
    if (!error) supabaseSuccess = true;
    else throw error;
  } catch (e) {
    console.warn("upsertBoardAntecedence supabase failed, fallback to localStorage:", e);
  }

  // Sempre persiste em localStorage como cache/fallback
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`board_antecedence:${name}`, String(antecedence_days));
    }
  } catch {}

  if (!supabaseSuccess) {
    // Se a tabela não existir, ainda considera sucesso via localStorage
    // Mas verifica se o erro foi por tabela inexistente para não lançar falso erro
    // Para compatibilidade, não lança erro se localStorage funcionou
    return;
  }
}

/**
 * Busca todas as configurações de antecedência (útil para cache).
 */
export async function fetchAllBoardAntecedences(): Promise<Map<string, number>> {
  try {
    const { data, error } = await (supabase as any)
      .from("dashboard_board_settings")
      .select("assignee_name,antecedence_days");
    if (error) throw error;
    const map = new Map<string, number>();
    for (const row of (data ?? []) as BoardAntecedence[]) {
      const v = Number(row.antecedence_days);
      if (Number.isFinite(v) && v >= 0) map.set(row.assignee_name, Math.floor(v));
    }
    return map;
  } catch (e) {
    console.warn("fetchAllBoardAntecedences error, fallback to localStorage scan:", e);
    const map = new Map<string, number>();
    try {
      if (typeof window !== "undefined") {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key?.startsWith("board_antecedence:")) {
            const name = key.slice("board_antecedence:".length);
            const v = parseInt(window.localStorage.getItem(key) ?? "0", 10);
            if (!isNaN(v) && v >= 0) map.set(name, Math.floor(v));
          }
        }
      }
    } catch {}
    return map;
  }
}
