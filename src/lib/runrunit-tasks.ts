import { supabase } from "@/integrations/supabase/client";

/**
 * Tarefas do Runrun.it já sincronizadas em `runrunit_tasks`.
 *
 * Somente leitura: nenhuma chamada à API do Runrun.it é feita aqui.
 * O vínculo com o card é sempre `runrunit_project_id`.
 */

export interface RunrunitTaskRow {
  id: string;
  runrunit_task_id: number;
  runrunit_project_id: number;
  title: string;
  status: string | null;
  board_stage_name: string | null;
  desired_date: string | null;
  close_date: string | null;
  responsible_name: string | null;
  task_type: string | null;
  team_name: string | null;
  last_synced_at: string | null;
  raw_data?: unknown;
}

export type RunrunitTaskStatusTone = "done" | "active" | "neutral";

export type RunrunitTaskAssignee = {
  /** ID oficial do usuário no Runrun.it. */
  id: string;
  name: string;
};

const TASK_COLUMNS =
  "id,runrunit_task_id,runrunit_project_id,title,status,board_stage_name,desired_date,close_date,responsible_name,task_type,team_name,last_synced_at,raw_data";

type RawAssignment = {
  id: string | null;
  name: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function asId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asText(value);
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

/** Extrai as atribuições de `raw_data.assignments`, usando apenas IDs oficiais. */
function taskAssignments(task: Pick<RunrunitTaskRow, "raw_data">): RawAssignment[] {
  let raw = task.raw_data;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const assignments = asRecord(raw)?.assignments;
  if (!Array.isArray(assignments)) return [];
  const result: RawAssignment[] = [];
  for (const entry of assignments) {
    const assignment = asRecord(entry);
    if (!assignment) continue;
    const assignee = asRecord(assignment.assignee);
    result.push({
      id: asId(assignment.assignee_id ?? assignee?.id),
      name: asText(assignment.assignee_name ?? assignee?.name),
    });
  }
  return result;
}

/** IDs oficiais dos responsáveis atribuídos à tarefa (aceita múltiplos). */
export function runrunitTaskAssigneeIds(task: Pick<RunrunitTaskRow, "raw_data">): string[] {
  const ids = new Set<string>();
  for (const assignment of taskAssignments(task)) {
    if (assignment.id) ids.add(assignment.id);
  }
  return [...ids];
}

/** Responsáveis únicos encontrados nas atribuições das tarefas, ordenados por nome. */
export function collectRunrunitTaskAssignees(
  tasks: readonly Pick<RunrunitTaskRow, "raw_data">[],
): RunrunitTaskAssignee[] {
  const byId = new Map<string, RunrunitTaskAssignee>();
  for (const task of tasks) {
    for (const assignment of taskAssignments(task)) {
      if (!assignment.id) continue;
      const existing = byId.get(assignment.id);
      byId.set(assignment.id, {
        id: assignment.id,
        name: existing?.name ?? assignment.name ?? `Usuário ${assignment.id}`,
      });
    }
  }
  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );
}

/**
 * Filtra por ID oficial. `null`/`undefined` mantém todas as tarefas.
 * Tarefas sem responsável ficam de fora quando há um responsável selecionado.
 */
export function filterRunrunitTasksByAssignee<T extends Pick<RunrunitTaskRow, "raw_data">>(
  tasks: readonly T[],
  assigneeId: string | null | undefined,
): T[] {
  if (assigneeId == null) return [...tasks];
  return tasks.filter((task) => runrunitTaskAssigneeIds(task).includes(assigneeId));
}

/**
 * Resolve o ID oficial do responsável do card a partir do nome exibido.
 * O nome é usado apenas para localizar o ID; todo o filtro compara IDs.
 */
export function resolveRunrunitAssigneeId(
  tasks: readonly Pick<RunrunitTaskRow, "raw_data">[],
  assigneeName: string | null | undefined,
): string | null {
  const target = normalizeName(assigneeName);
  if (!target) return null;
  const ids = new Set<string>();
  for (const task of tasks) {
    for (const assignment of taskAssignments(task)) {
      if (assignment.id && normalizeName(assignment.name) === target) ids.add(assignment.id);
    }
  }
  return ids.size === 1 ? [...ids][0] : null;
}

type RunrunitProjectPersonRow = {
  assignee_id: string | number | null;
  assignee_name: string | null;
};

/**
 * Busca o ID oficial do responsável do card em `runrunit_project_people`
 * (fonte já sincronizada, sem chamadas à API do Runrun.it).
 */
export async function fetchRunrunitProjectAssigneeId(
  projectId: number,
  assigneeName: string | null | undefined,
): Promise<string | null> {
  const target = normalizeName(assigneeName);
  if (!Number.isFinite(projectId) || projectId <= 0 || !target) return null;
  const { data, error } = await supabase
    .from("runrunit_project_people")
    .select("assignee_id,assignee_name")
    .eq("runrunit_project_id", projectId);
  if (error) throw error;
  const ids = new Set<string>();
  for (const row of (data ?? []) as RunrunitProjectPersonRow[]) {
    const id = asId(row.assignee_id);
    if (id && normalizeName(row.assignee_name) === target) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

/** Ordem consistente: título em pt-BR e, em empate, id da tarefa. */
export function sortRunrunitTasks(tasks: readonly RunrunitTaskRow[]): RunrunitTaskRow[] {
  return [...tasks].sort((a, b) => {
    const byTitle = (a.title ?? "").localeCompare(b.title ?? "", "pt-BR", {
      sensitivity: "base",
    });
    if (byTitle !== 0) return byTitle;
    return a.runrunit_task_id - b.runrunit_task_id;
  });
}

/** Etapa quando disponível; senão, tradução compacta do status. */
export function runrunitTaskStatusLabel(task: RunrunitTaskRow): string {
  const stage = task.board_stage_name?.trim();
  if (stage) return stage;
  const status = task.status?.trim();
  if (!status) return "Sem status";
  const normalized = status.toLowerCase();
  if (normalized === "closed") return "Concluída";
  if (normalized === "open") return "Aberta";
  return status;
}

/** Tom suave para o badge, considerando status e etapa do registro. */
export function runrunitTaskStatusTone(task: RunrunitTaskRow): RunrunitTaskStatusTone {
  const text = `${task.status ?? ""} ${task.board_stage_name ?? ""}`.toLowerCase();
  if (/(closed|done|conclu|finaliz|aprovad|entreg|arquivad)/.test(text)) return "done";
  if (/(open|doing|andamento|progress|execu|revis|an[aá]lise|em curso)/.test(text)) return "active";
  return "neutral";
}

/** Busca somente as tarefas do projeto informado, já ordenadas. */
export async function fetchRunrunitTasksByProject(projectId: number): Promise<RunrunitTaskRow[]> {
  if (!Number.isFinite(projectId) || projectId <= 0) return [];
  const { data, error } = await supabase
    .from("runrunit_tasks")
    .select(TASK_COLUMNS)
    .eq("runrunit_project_id", projectId);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as RunrunitTaskRow[]).filter(
    (task) => task.runrunit_project_id === projectId,
  );
  return sortRunrunitTasks(rows);
}
