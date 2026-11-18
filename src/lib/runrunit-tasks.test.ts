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
  fetchRunrunitTasksByProject,
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
});
