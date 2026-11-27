/**
 * Modelo de checklist mensal do serviço DIEF.
 *
 * O modelo é aplicado por regra (nome da demanda contém "DIEF"), portanto vale
 * automaticamente para cards existentes e futuros sem gravar nada no banco.
 * As marcações ficam em `checklist_selections` da linha de CADA responsável,
 * com o prefixo `mes:` para nunca colidir com itens do checklist genérico.
 */
export const DIEF_MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

export const MONTH_PREFIX = "mes:";

/** Chave persistida de um mês (1–12), ex.: "mes:03". */
export function monthKey(month: number): string {
  return `${MONTH_PREFIX}${String(month).padStart(2, "0")}`;
}

/** true somente para demandas do serviço DIEF (palavra inteira, sem diferenciar maiúsculas). */
export function isDiefDemand(name: string | null | undefined): boolean {
  return /(^|[^\p{L}\p{N}])dief([^\p{L}\p{N}]|$)/iu.test(name ?? "");
}

/** Meses marcados (1–12) a partir das marcações do responsável. */
export function checkedMonths(selections: readonly string[]): Set<number> {
  const out = new Set<number>();
  for (const s of selections) {
    if (!s.startsWith(MONTH_PREFIX)) continue;
    const n = Number(s.slice(MONTH_PREFIX.length));
    if (Number.isInteger(n) && n >= 1 && n <= 12) out.add(n);
  }
  return out;
}

/**
 * Alterna um mês preservando todas as outras marcações (inclusive itens
 * genéricos antigos), para nunca apagar dados existentes.
 */
export function toggleMonth(selections: readonly string[], month: number, on: boolean): string[] {
  const key = monthKey(month);
  const rest = selections.filter((s) => s !== key);
  return on ? [...rest, key] : rest;
}
