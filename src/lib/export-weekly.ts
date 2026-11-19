import * as XLSX from "xlsx";
import { classificationLabel, type ClassificationFlags } from "./export-projects";

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
  "Classificação",
  "Observação",
] as const;

export interface WeeklyExportCard extends ClassificationFlags {
  key?: string | null;
  runrunit_project_id?: number | null;
  project: {
    project_name: string | null;
    client_name: string | null;
    desired_delivery_date: string | null;
  };
  internal_note?: string | null;
  card?:
    | (ClassificationFlags & {
        internal_note?: string | null;
      })
    | null;
}

export interface WeeklyExportDemand extends ClassificationFlags {
  key?: string | null;
  assigneeName?: string | null;
  /** Classificação já formatada, quando a origem disponibilizar uma. */
  classification?: string | null;
  demand: {
    id?: string | null;
    name: string | null;
    client_name?: string | null;
    desired_date: string | null;
    description?: string | null;
    classification?: string | null;
    is_tec?: boolean | null;
    is_geo?: boolean | null;
    is_rev?: boolean | null;
    is_campo?: boolean | null;
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

/** Classificação do projeto/card; vazio quando nenhuma sigla está ativa. */
function cardClassification(card: WeeklyExportCard): string {
  return classificationLabel({
    is_tec: card.is_tec ?? card.card?.is_tec,
    is_geo: card.is_geo ?? card.card?.is_geo,
    is_rev: card.is_rev ?? card.card?.is_rev,
    is_campo: card.is_campo ?? card.card?.is_campo,
  });
}

/** Usa a classificação explícita da demanda quando existir; senão, as siglas. */
function demandClassification(demand: WeeklyExportDemand): string {
  const explicit = demand.classification ?? demand.demand.classification;
  if (typeof explicit === "string" && explicit.trim()) return explicit;
  return classificationLabel({
    is_tec: demand.is_tec ?? demand.demand.is_tec,
    is_geo: demand.is_geo ?? demand.demand.is_geo,
    is_rev: demand.is_rev ?? demand.demand.is_rev,
    is_campo: demand.is_campo ?? demand.demand.is_campo,
  });
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
        cardClassification(card),
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
        demandClassification(demand),
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
  sheet["!cols"] = [{ wch: 32 }, { wch: 24 }, { wch: 50 }, { wch: 30 }, { wch: 18 }, { wch: 60 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Planejamento semanal");
  XLSX.writeFile(book, weeklyExportFileName(assigneeName, monthTitle));
  return rows.length - 1;
}
