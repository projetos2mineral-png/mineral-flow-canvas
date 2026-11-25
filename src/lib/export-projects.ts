import * as XLSX from "xlsx";
import type { ProjectPerson, RunrunitProject } from "@/lib/projects";

const formatDate = (value: string | null): string => {
  if (!value) return "";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
};

const fileStamp = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * Gera e baixa um .xlsx com os projetos já carregados na tela.
 * Não realiza nenhuma nova consulta a APIs externas.
 */
export function exportProjectsToExcel(projects: RunrunitProject[], people: ProjectPerson[]): void {
  const peopleByProject = new Map<number, string[]>();
  for (const person of people) {
    const name = person.assignee_name?.trim();
    if (!name) continue;
    const list = peopleByProject.get(person.runrunit_project_id) ?? [];
    if (!list.includes(name)) list.push(name);
    peopleByProject.set(person.runrunit_project_id, list);
  }

  const rows = projects.map((p) => ({
    "Nome do projeto": p.name ?? "",
    Cliente: p.client_name ?? "",
    Grupo: p.project_group_name ?? "",
    Subgrupo: p.project_sub_group_name ?? "",
    "Data de entrega desejada": formatDate(p.desired_delivery_date),
    "Responsáveis vinculados": (peopleByProject.get(p.runrunit_project_id) ?? [])
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .join(", "),
    "Status atual": p.is_tracking_enabled
      ? "Exibido no Kanban"
      : p.is_new_candidate
        ? "Novo candidato"
        : "Não exibido",
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 46 },
    { wch: 26 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 40 },
    { wch: 20 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Projetos");
  XLSX.writeFile(book, `projetos_kanban_${fileStamp()}.xlsx`);
}

export const LANE_EXPORT_HEADERS = [
  "Nome do projeto",
  "Cliente",
  "Data de entrega desejada",
  "Classificação",
  "Observação",
] as const;

export interface LaneExportCard {
  /** Identidade estável do projeto, usada apenas para evitar duplicidades. */
  runrunit_project_id?: number | null;
  key?: string | null;
  project: {
    project_name: string | null;
    client_name: string | null;
    desired_delivery_date: string | null;
  };
  is_tec?: boolean | null;
  is_geo?: boolean | null;
  is_rev?: boolean | null;
  is_campo?: boolean | null;
  internal_note?: string | null;
  /** Cards do Kanban guardam as etiquetas no registro aninhado. */
  card?: {
    is_tec?: boolean | null;
    is_geo?: boolean | null;
    is_rev?: boolean | null;
    is_campo?: boolean | null;
    internal_note?: string | null;
  } | null;
}

/** Card de Demanda Avulsa já resolvido para o responsável/fila exportados. */
export interface LaneExportDemand {
  /** Chave estável do card (demanda + responsável), usada contra duplicidades. */
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

/** Preserva o texto original; observações vazias viram célula vazia. */
function noteValue(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.trim()) return "";
  return value;
}

function projectCardKey(c: LaneExportCard): string | null {
  if (c.runrunit_project_id != null) return `project:${c.runrunit_project_id}`;
  if (c.key) return `key:${c.key}`;
  return null;
}

function demandCardKey(d: LaneExportDemand): string {
  if (d.key) return `demand:${d.key}`;
  return `demand:${d.demand.id ?? d.demand.name ?? ""}:${d.assigneeName ?? ""}`;
}

function uniqueBy<T>(items: readonly T[], keyFn: (item: T) => string | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (key != null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(item);
  }
  return out;
}

/** Campos de classificação compartilhados entre os relatórios. */
export type ClassificationFlags = {
  is_tec?: boolean | null;
  is_geo?: boolean | null;
  is_rev?: boolean | null;
  is_campo?: boolean | null;
};

/** Siglas ativas (TEC, GEO, REV, CAM) separadas por vírgula, ou vazio. */
export function classificationLabel(flags: ClassificationFlags): string {
  return [
    flags.is_tec ? "TEC" : null,
    flags.is_geo ? "GEO" : null,
    flags.is_rev ? "REV" : null,
    flags.is_campo ? "CAM" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Siglas ativas (TEC, GEO, REV, CAM) separadas por vírgula, ou vazio. */
export function laneCardClassification(c: LaneExportCard): string {
  return classificationLabel({
    is_tec: c.is_tec ?? c.card?.is_tec,
    is_geo: c.is_geo ?? c.card?.is_geo,
    is_rev: c.is_rev ?? c.card?.is_rev,
    is_campo: c.is_campo ?? c.card?.is_campo,
  });
}

/** Linhas da planilha da fila (exportado para teste). */
export function buildLaneExportRows(
  cards: readonly LaneExportCard[],
  demands: readonly LaneExportDemand[] = [],
): string[][] {
  const projectRows = uniqueBy(cards, projectCardKey).map((c) => [
    c.project.project_name ?? "",
    c.project.client_name ?? "",
    formatDate(c.project.desired_delivery_date),
    laneCardClassification(c),
    noteValue(c.internal_note ?? c.card?.internal_note),
  ]);

  const demandRows = uniqueBy(demands, demandCardKey).map((d) => [
    d.demand.name ?? "",
    d.demand.client_name ?? "",
    formatDate(d.demand.desired_date),
    "Demanda avulsa",
    noteValue(d.demand.description),
  ]);

  const rows: string[][] = [[...LANE_EXPORT_HEADERS], ...projectRows];
  if (demandRows.length > 0) {
    // Seção separada: demandas avulsas nunca se misturam à sequência mensal.
    rows.push([]);
    rows.push(["Demandas avulsas"]);
    rows.push(...demandRows);
  }
  return rows;
}

/** Nome do arquivo a partir do título da fila: "Outubro/2026" -> "Outubro-2026.xlsx". */
export function laneExportFileName(title: string): string {
  const safe =
    title
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ") || "Fila";
  return `${safe}.xlsx`;
}

/** Baixa um .xlsx com os cards da fila; somente leitura, não altera dados. */
export function exportLaneCardsToExcel(
  title: string,
  cards: readonly LaneExportCard[],
  demands: readonly LaneExportDemand[] = [],
): void {
  const sheet = XLSX.utils.aoa_to_sheet(buildLaneExportRows(cards, demands));
  sheet["!cols"] = [{ wch: 50 }, { wch: 30 }, { wch: 24 }, { wch: 16 }, { wch: 60 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Fila");
  XLSX.writeFile(book, laneExportFileName(title));
}

export const CALENDAR_EXPORT_HEADERS = [
  "Nome do projeto/card",
  "Cliente",
  "Grupo",
  "Data desejada",
  "Data manual",
] as const;

export interface CalendarExportCard {
  project_name: string | null;
  client_name: string | null;
  project_group_name: string | null;
  desired_delivery_date?: string | null;
  planning_date: string | null;
}

/** "YYYY-MM-DD..." -> "dd/mm/aaaa" sem conversão de fuso; vazio quando ausente. */
export function isoToBrDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Linhas da planilha do Calendário, preservando a ordem recebida. */
export function buildCalendarExportRows(cards: readonly CalendarExportCard[]): string[][] {
  return [
    [...CALENDAR_EXPORT_HEADERS],
    ...cards.map((c) => [
      c.project_name ?? "",
      c.client_name ?? "",
      c.project_group_name ?? "",
      isoToBrDate(c.desired_delivery_date),
      isoToBrDate(c.planning_date),
    ]),
  ];
}

/** Baixa um .xlsx com os cards visíveis do Calendário; somente leitura. */
export function exportCalendarCardsToExcel(fileLabel: string, cards: readonly CalendarExportCard[]): void {
  const sheet = XLSX.utils.aoa_to_sheet(buildCalendarExportRows(cards));
  sheet["!cols"] = [{ wch: 50 }, { wch: 30 }, { wch: 24 }, { wch: 16 }, { wch: 16 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Calendário");
  XLSX.writeFile(book, laneExportFileName(`Calendario ${fileLabel}`));
}
