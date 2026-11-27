/**
 * Modelo de checklist do serviço DIEF (Matriz Cliente × Mês).
 *
 * Aplicado por regra (nome da demanda contém "DIEF"): nenhuma migration é
 * necessária. Os clientes ficam em `checklist_items` da linha do responsável
 * e as marcações em `checklist_selections`, com chave composta estável:
 *
 *   <cliente normalizado>::mes:<01..12>   ex.: "agisa::mes:03"
 *
 * Assim cada responsável mantém a sua própria matriz, sem interferir nos demais.
 */

export const DIEF_MONTHS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

/** Prefixo legado (checklist mensal de linha única), preservado para leitura. */
export const MONTH_PREFIX = "mes:";
/** Separador da chave composta Cliente × Mês. */
export const CLIENT_MONTH_SEPARATOR = "::mes:";

/** Chave normalizada de um cliente: sem espaços nas pontas, minúsculas. */
export function clientKey(client: string): string {
  return client.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

/** Chave persistida de um mês de um cliente, ex.: "agisa::mes:03". */
export function clientMonthKey(client: string, month: number): string {
  return `${clientKey(client)}${CLIENT_MONTH_SEPARATOR}${String(month).padStart(2, "0")}`;
}

/** Prefixo de todas as marcações de um cliente. */
export function clientMonthPrefix(client: string): string {
  return `${clientKey(client)}${CLIENT_MONTH_SEPARATOR}`;
}

/** true somente para demandas do serviço DIEF (palavra inteira, sem diferenciar maiúsculas). */
export function isDiefDemand(name: string | null | undefined): boolean {
  return /(^|[^\p{L}\p{N}])dief([^\p{L}\p{N}]|$)/iu.test(name ?? "");
}

/** Meses (1–12) marcados para UM cliente. */
export function checkedMonthsForClient(selections: readonly string[], client: string): Set<number> {
  const prefix = clientMonthPrefix(client);
  const out = new Set<number>();
  for (const selection of selections) {
    if (!selection.startsWith(prefix)) continue;
    const n = Number(selection.slice(prefix.length));
    if (Number.isInteger(n) && n >= 1 && n <= 12) out.add(n);
  }
  return out;
}

/** Total de meses cumpridos na matriz inteira. */
export function totalCheckedMonths(
  selections: readonly string[],
  clients: readonly string[],
): number {
  return clients.reduce((sum, client) => sum + checkedMonthsForClient(selections, client).size, 0);
}

/**
 * Alterna um mês de um cliente preservando todas as outras marcações
 * (outros clientes, itens genéricos e chaves legadas).
 */
export function toggleClientMonth(
  selections: readonly string[],
  client: string,
  month: number,
  on: boolean,
): string[] {
  const key = clientMonthKey(client, month);
  const rest = selections.filter((selection) => selection !== key);
  return on ? [...rest, key] : rest;
}

/** Renomeia um cliente migrando TODAS as suas chaves `::mes:XX`. */
export function renameClientInSelections(
  selections: readonly string[],
  from: string,
  to: string,
): string[] {
  const oldPrefix = clientMonthPrefix(from);
  const newPrefix = clientMonthPrefix(to);
  return selections.map((selection) =>
    selection.startsWith(oldPrefix)
      ? `${newPrefix}${selection.slice(oldPrefix.length)}`
      : selection,
  );
}

/** Remove um cliente e todas as suas marcações, sem tocar nos demais. */
export function removeClientFromSelections(
  selections: readonly string[],
  client: string,
): string[] {
  const prefix = clientMonthPrefix(client);
  return selections.filter((selection) => !selection.startsWith(prefix));
}

/* -------------------------------------------------------------------------- */
/* Legado: formato `mes:XX` do checklist mensal de linha única.               */
/* Mantido para não descartar marcações já gravadas em produção.              */
/* -------------------------------------------------------------------------- */

/** Chave legada de um mês (1–12), ex.: "mes:03". */
export function monthKey(month: number): string {
  return `${MONTH_PREFIX}${String(month).padStart(2, "0")}`;
}

/** Meses marcados no formato legado. */
export function checkedMonths(selections: readonly string[]): Set<number> {
  const out = new Set<number>();
  for (const selection of selections) {
    if (!selection.startsWith(MONTH_PREFIX)) continue;
    const n = Number(selection.slice(MONTH_PREFIX.length));
    if (Number.isInteger(n) && n >= 1 && n <= 12) out.add(n);
  }
  return out;
}

/** Alterna um mês legado preservando todas as outras marcações. */
export function toggleMonth(selections: readonly string[], month: number, on: boolean): string[] {
  const key = monthKey(month);
  const rest = selections.filter((selection) => selection !== key);
  return on ? [...rest, key] : rest;
}
