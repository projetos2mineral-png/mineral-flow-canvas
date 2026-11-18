import * as XLSX from "xlsx";

/**
 * Exportação do Planejamento Semanal.
 *
 * Independente da exportação mensal (`export-projects.ts`): recebe os cards
 * já agrupados na mesma ordem exibida na tela e apenas converte para planilha.
 * Não consulta banco, não altera alocações e não reordena por data/nome.
 */

export const WEEKLY_EXPORT_HEADERS = [
  "Semana de alocação",
  "Data de entrega desejada",
  "Nome do projeto",
  "Cliente",
  "Observação",
] as const;

export interface WeeklyExportCard {
  key?: string | null;
  runrunit_project_id?: number | null;
  project: {
    project_name: string | null;
    client_name: string | null;
    desired_delivery_date: string | null;
  };
  internal_note?: string | null;
  card?: { internal_note?: string | null } | null;
}

export interface WeeklyExportDemand {
  key?: string | null;
  assigneeName?: string | null;
  demand: {
    id?: string | null;
    name: string | null;
    client_name?: string | null;
    desired_date: string | null;
    description?: string | null;
  };
}

export interface WeeklyExportBucket {
  /** Identificação da semana exatamente como aparece na tela (ou "Backlog"). */
  label: string;
  cards: readonly WeeklyExportCard[];
  demands?: readonly WeeklyExportDemand[];
}

const formatDate = (value: string | null): string => {
  if (!value) return "";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
};

/** Preserva o texto original; observações vazias viram célula vazia. */
function noteValue(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.trim()) return "";
  return value;
}

function projectKey(c: WeeklyExportCard): string | null {
  if (c.runrunit_project_id != null) return `project:${c.runrunit_project_id}`;
  if (c.key) return `key:${c.key}`;
  return null;
}

function demandKey(d: WeeklyExportDemand): string {
  if (d.key) return `demand:${d.key}`;
  return `demand:${d.demand.id ?? d.demand.name ?? ""}:${d.assigneeName ?? ""}`;
}

/**
 * Linhas do relatório semanal.
 * A ordem é rigorosamente a dos buckets e dos cards/demandas dentro de cada
 * bucket, sem nenhuma ordenação adicional. Registros repetidos são omitidos.
 */
export function buildWeeklyExportRows(buckets: readonly WeeklyExportBucket[]): string[][] {
  const rows: string[][] = [[...WEEKLY_EXPORT_HEADERS]];
  const seen = new Set<string>();

  for (const bucket of buckets) {
    for (const card of bucket.cards) {
      const key = projectKey(card);
      if (key != null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      rows.push([
        bucket.label,
        formatDate(card.project.desired_delivery_date),
        card.project.project_name ?? "",
        card.project.client_name ?? "",
        noteValue(card.internal_note ?? card.card?.internal_note),
      ]);
    }

    for (const demand of bucket.demands ?? []) {
      const key = demandKey(demand);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([
        bucket.label,
        formatDate(demand.demand.desired_date),
        demand.demand.name ?? "",
        demand.demand.client_name ?? "",
        noteValue(demand.demand.description),
      ]);
    }
  }

  return rows;
}

/** Nome do arquivo independente do relatório mensal. */
export function weeklyExportFileName(assigneeName: string, monthTitle: string): string {
  const safe = `${assigneeName} ${monthTitle}`
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `planejamento-semanal_${safe || "Fila"}.xlsx`;
}

/**
 * Baixa o relatório .xlsx do Planejamento Semanal.
 * Retorna a quantidade de cards exportados (projetos + demandas).
 */
export function exportWeeklyPlanToExcel(
  assigneeName: string,
  monthTitle: string,
  buckets: readonly WeeklyExportBucket[],
): number {
  const rows = buildWeeklyExportRows(buckets);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 32 }, { wch: 24 }, { wch: 50 }, { wch: 30 }, { wch: 60 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Planejamento semanal");
  XLSX.writeFile(book, weeklyExportFileName(assigneeName, monthTitle));
  return rows.length - 1;
}
