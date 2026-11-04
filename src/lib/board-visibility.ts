import { supabase } from "@/integrations/supabase/client";
import { normalizeAssigneeName } from "@/lib/dashboard";

/**
 * Visibilidade dos quadros (responsáveis) no Painel Geral.
 * Guardada em dashboard_board_settings.is_hidden (compartilhada entre usuários).
 */
export async function fetchHiddenAssignees(): Promise<Set<string>> {
  const { data, error } = await (supabase as any)
    .from("dashboard_board_settings")
    .select("assignee_name,is_hidden")
    .eq("is_hidden", true);
  if (error) {
    console.warn("fetchHiddenAssignees failed:", error);
    return new Set();
  }
  return new Set(
    ((data ?? []) as { assignee_name: string }[]).map((r) => normalizeAssigneeName(r.assignee_name)),
  );
}

export function isAssigneeHidden(name: string, hidden: Set<string>): boolean {
  return hidden.has(normalizeAssigneeName(name));
}

export async function setAssigneeHidden(name: string, hidden: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from("dashboard_board_settings")
    .upsert(
      { assignee_name: name.trim(), is_hidden: hidden, updated_at: new Date().toISOString() },
      { onConflict: "assignee_name" },
    );
  if (error) throw error;
}
