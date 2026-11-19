import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const eq = vi.fn();
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { eq, select, from };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import {
  collectRunrunitTaskAssignees,
  fetchRunrunitProjectAssigneeId,
  fetchRunrunitTasksByProject,
  filterRunrunitTasksByAssignee,
  resolveRunrunitAssigneeId,
  runrunitTaskAssigneeIds,
  runrunitTaskStatusLabel,
  runrunitTaskStatusTone,
  sortRunrunitTasks,
  type RunrunitTaskRow,
} from "./runrunit-tasks";

const task = (overrides: Partial<RunrunitTaskRow>): RunrunitTaskRow => ({
  id: "t0",
  runrunit_task_id: 1,
  runrunit_project_id: 10,
  title: "Tarefa",
  status: "open",
  board_stage_name: null,
  desired_date: null,
  close_date: null,
  responsible_name: null,
  task_type: null,
  team_name: null,
  last_synced_at: null,
  ...overrides,
});

const withAssignments = (
  assignments: { assignee_id: string | number; assignee_name: string | null }[],
): Pick<RunrunitTaskRow, "raw_data"> => ({
  raw_data: { assignments },
});

describe("tarefas do Runrun.it", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ordena por título em pt-BR e desempata pelo id", () => {
    const rows = sortRunrunitTasks([
      task({ id: "b", runrunit_task_id: 2, title: "Beta" }),
      task({ id: "a2", runrunit_task_id: 4, title: "Alfa" }),
      task({ id: "a1", runrunit_task_id: 3, title: "Alfa" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a1", "a2", "b"]);
  });

  it("mostra a etapa quando disponível e traduz o status como fallback", () => {
    expect(runrunitTaskStatusLabel(task({ board_stage_name: "Em andamento" }))).toBe(
      "Em andamento",
    );
    expect(runrunitTaskStatusLabel(task({ status: "open" }))).toBe("Aberta");
    expect(runrunitTaskStatusLabel(task({ status: "closed" }))).toBe("Concluída");
    expect(runrunitTaskStatusLabel(task({ status: null }))).toBe("Sem status");
  });

  it("classifica os tons de status de forma consistente", () => {
    expect(runrunitTaskStatusTone(task({ status: "closed" }))).toBe("done");
    expect(runrunitTaskStatusTone(task({ board_stage_name: "Concluída" }))).toBe("done");
    expect(runrunitTaskStatusTone(task({ status: "open" }))).toBe("active");
    expect(runrunitTaskStatusTone(task({ board_stage_name: "Em andamento" }))).toBe("active");
    expect(runrunitTaskStatusTone(task({ status: null, board_stage_name: null }))).toBe("neutral");
  });

  it("busca apenas as tarefas do projeto informado", async () => {
    mocks.eq.mockResolvedValue({
      data: [
        task({ id: "own", runrunit_project_id: 10 }),
        task({ id: "other", runrunit_project_id: 99 }),
      ],
      error: null,
    });
    const rows = await fetchRunrunitTasksByProject(10);
    expect(mocks.from).toHaveBeenCalledWith("runrunit_tasks");
    expect(mocks.eq).toHaveBeenCalledWith("runrunit_project_id", 10);
    expect(rows.map((r) => r.id)).toEqual(["own"]);
  });

  it("trata projeto sem tarefas vinculadas", async () => {
    mocks.eq.mockResolvedValue({ data: [], error: null });
    await expect(fetchRunrunitTasksByProject(10)).resolves.toEqual([]);
  });

  it("propaga erro da consulta", async () => {
    mocks.eq.mockResolvedValue({ data: null, error: new Error("falha") });
    await expect(fetchRunrunitTasksByProject(10)).rejects.toThrow("falha");
  });

  it("não consulta o banco para id inválido", async () => {
    await expect(fetchRunrunitTasksByProject(0)).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("extrai os IDs oficiais de tarefas com múltiplos responsáveis", () => {
    const raw = withAssignments([
      { assignee_id: 101, assignee_name: "Ana" },
      { assignee_id: "202", assignee_name: "Bruno" },
      { assignee_id: "", assignee_name: "Sem ID" },
    ]);
    expect(runrunitTaskAssigneeIds(raw)).toEqual(["101", "202"]);
  });

  it("monta as opções únicas de responsáveis encontrados nas tarefas", () => {
    const tasks = [
      task({ id: "a", ...withAssignments([{ assignee_id: 101, assignee_name: "Ana" }]) }),
      task({ id: "b", ...withAssignments([{ assignee_id: "101", assignee_name: "Ana" }]) }),
      task({
        id: "c",
        ...withAssignments([
          { assignee_id: "202", assignee_name: "Bruno" },
          { assignee_id: "303", assignee_name: "Carla" },
        ]),
      }),
    ];
    expect(collectRunrunitTaskAssignees(tasks)).toEqual([
      { id: "101", name: "Ana" },
      { id: "202", name: "Bruno" },
      { id: "303", name: "Carla" },
    ]);
  });

  it("filtra por ID oficial e considera qualquer atribuição da tarefa", () => {
    const tasks = [
      task({ id: "ana", ...withAssignments([{ assignee_id: "101", assignee_name: "Ana" }]) }),
      task({ id: "bruno", ...withAssignments([{ assignee_id: "202", assignee_name: "Bruno" }]) }),
      task({
        id: "ambos",
        ...withAssignments([
          { assignee_id: "101", assignee_name: "Ana" },
          { assignee_id: "202", assignee_name: "Bruno" },
        ]),
      }),
      task({ id: "sem" }),
    ];
    expect(filterRunrunitTasksByAssignee(tasks, "101").map((r) => r.id)).toEqual(["ana", "ambos"]);
    expect(filterRunrunitTasksByAssignee(tasks, "202").map((r) => r.id)).toEqual([
      "bruno",
      "ambos",
    ]);
    expect(filterRunrunitTasksByAssignee(tasks, null).map((r) => r.id)).toEqual([
      "ana",
      "bruno",
      "ambos",
      "sem",
    ]);
  });

  it("não usa o nome como critério de filtragem e trata tarefas sem responsável", () => {
    const tasks = [
      task({
        id: "mesmo-nome-outro-id",
        ...withAssignments([{ assignee_id: "999", assignee_name: "Ana" }]),
      }),
      task({ id: "sem" }),
    ];
    expect(filterRunrunitTasksByAssignee(tasks, "101")).toEqual([]);
    expect(filterRunrunitTasksByAssignee(tasks, "999").map((r) => r.id)).toEqual([
      "mesmo-nome-outro-id",
    ]);
  });

  it("resolve o ID do responsável do card pelo nome exibido", () => {
    const tasks = [
      task({ ...withAssignments([{ assignee_id: "101", assignee_name: "Ana Souza" }]) }),
      task({ ...withAssignments([{ assignee_id: "202", assignee_name: "Bruno" }]) }),
    ];
    expect(resolveRunrunitAssigneeId(tasks, "  ana   souza ")).toBe("101");
    expect(resolveRunrunitAssigneeId(tasks, "Inexistente")).toBeNull();
    expect(resolveRunrunitAssigneeId(tasks, "")).toBeNull();
  });

  it("busca o ID oficial do responsável do card nas pessoas do projeto", async () => {
    mocks.eq.mockResolvedValue({
      data: [
        { assignee_id: 101, assignee_name: "Ana Souza" },
        { assignee_id: "202", assignee_name: "Bruno" },
      ],
      error: null,
    });
    await expect(fetchRunrunitProjectAssigneeId(10, " ana  souza ")).resolves.toBe("101");
    expect(mocks.from).toHaveBeenCalledWith("runrunit_project_people");
    expect(mocks.eq).toHaveBeenCalledWith("runrunit_project_id", 10);
    await expect(fetchRunrunitProjectAssigneeId(10, "")).resolves.toBeNull();
  });
});
