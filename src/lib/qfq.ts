import { supabase } from "@/integrations/supabase/client";

export type QfqAtividade = {
  id: number | string;
  nome: string;
  grupo: string | null;
  tempo_esperado_horas: string | number | null;
  complexidade: string | null;
  categoria: string | null;
  software: string | null;
  tipo: string | null;
  ordem: number | null;
  ativo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type QfqColaborador = {
  id: number | string;
  nome: string;
  ordem: number | null;
  ativo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type QfqMatrizRow = {
  id: string;
  atividade_id: string;
  colaborador_id: string;
  nivel: string | null; // W, K, Y, X, Z
  created_at: string | null;
  updated_at: string | null;
};

export async function fetchQfqAtividades(): Promise<QfqAtividade[]> {
  const { data, error } = await (supabase as any)
    .from("qfq_atividades")
    .select("id,nome,grupo,tempo_esperado_horas,complexidade,categoria,software,tipo,ordem,ativo,created_at,updated_at")
    .order("ordem", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });
  if (error) throw error;
  // Filtra apenas ativos quando campo existir (mantém compatibilidade)
  const rows = (data ?? []) as QfqAtividade[];
  return rows.filter((r) => r.ativo !== false);
}

export async function fetchQfqColaboradores(): Promise<QfqColaborador[]> {
  const { data, error } = await (supabase as any)
    .from("qfq_colaboradores")
    .select("id,nome,ordem,ativo,created_at,updated_at")
    .order("ordem", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as QfqColaborador[];
  return rows.filter((r) => r.ativo !== false);
}

export async function fetchQfqMatriz(): Promise<QfqMatrizRow[]> {
  const pageSize = 1000;
  const all: QfqMatrizRow[] = [];
  let from = 0;
  for (let i = 0; i < 50; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase as any)
      .from("qfq_matriz")
      .select("id,atividade_id,colaborador_id,nivel,created_at,updated_at")
      .range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as QfqMatrizRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function upsertQfqMatrizNivel(
  atividade_id: string | number,
  colaborador_id: string | number,
  nivel: string | null
): Promise<void> {
  const cleanNivel = nivel ? nivel.toString().trim().toUpperCase() : null;
  // Se limpar, remove o registro para manter matriz esparsa
  if (!cleanNivel) {
    const { error } = await (supabase as any)
      .from("qfq_matriz")
      .delete()
      .eq("atividade_id", atividade_id)
      .eq("colaborador_id", colaborador_id);
    if (error) throw error;
    return;
  }
  // Tenta upsert direto (requer unique em atividade_id+colaborador_id)
  const { error: upsertError } = await (supabase as any)
    .from("qfq_matriz")
    .upsert(
      { atividade_id, colaborador_id, nivel: cleanNivel },
      { onConflict: "atividade_id,colaborador_id" }
    );
  if (!upsertError) return;
  // Fallback: busca existente e faz update/insert manual (caso onConflict não exista)
  const { data: existing, error: selErr } = await (supabase as any)
    .from("qfq_matriz")
    .select("id")
    .eq("atividade_id", atividade_id)
    .eq("colaborador_id", colaborador_id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing?.id) {
    const { error } = await (supabase as any)
      .from("qfq_matriz")
      .update({ nivel: cleanNivel, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any)
      .from("qfq_matriz")
      .insert({ atividade_id, colaborador_id, nivel: cleanNivel });
    if (error) throw error;
  }
}
