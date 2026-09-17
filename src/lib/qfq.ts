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
