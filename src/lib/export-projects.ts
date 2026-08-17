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
export function exportProjectsToExcel(
  projects: RunrunitProject[],
  people: ProjectPerson[]
): void {
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
