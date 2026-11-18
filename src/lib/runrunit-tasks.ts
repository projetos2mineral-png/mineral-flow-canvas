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
}

export type RunrunitTaskStatusTone = "done" | "active" | "neutral";

const TASK_COLUMNS =
  "id,runrunit_task_id,runrunit_project_id,title,status,board_stage_name,desired_date,close_date,responsible_name,task_type,team_name,last_synced_at";

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
