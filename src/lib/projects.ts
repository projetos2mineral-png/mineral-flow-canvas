import { supabase } from "@/integrations/supabase/client";
import { monthlyLaneTitle } from "@/lib/dashboard";
import { fetchBoardAntecedence, calculatePositioningDate } from "@/lib/board-antecedence";

export type ProjectPerson = {
  runrunit_project_id: number;
  project_name: string;
  client_name: string | null;
  project_group_name: string | null;
  project_sub_group_name: string | null;
  created_at_runrunit: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  team_id: number | null;
  team_name: string | null;
  last_synced_at: string | null;
};

export async function fetchAllProjectPeople(): Promise<ProjectPerson[]> {
  const pageSize = 1000;
  const all: ProjectPerson[] = [];
  let from = 0;
  // hard cap to avoid runaway loops
  for (let i = 0; i < 50; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase as any)
      .from("v_project_people")
      .select("*")
      .order("project_name", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as ProjectPerson[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export type RunrunitProject = {
  runrunit_project_id: number;
  name: string;
  client_name: string | null;
  project_group_name: string | null;
  project_sub_group_name: string | null;
  is_open: boolean | null;
  is_tracking_enabled: boolean | null;
  is_new_candidate: boolean | null;
  discovered_at: string | null;
  status: string | null;
  last_synced_at: string | null;
  created_at_runrunit: string | null;
  desired_delivery_date: string | null;
};

export async function fetchAllRunrunitProjects(
  opts: { ascending?: boolean } = {}
): Promise<RunrunitProject[]> {
  const ascending = opts.ascending !== false;
  const pageSize = 1000;
  const all: RunrunitProject[] = [];
  let from = 0;
  for (let i = 0; i < 50; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase as any)
      .from("runrunit_projects")
      .select(
        "runrunit_project_id,name,client_name,project_group_name,project_sub_group_name,is_open,is_tracking_enabled,is_new_candidate,discovered_at,status,last_synced_at,created_at_runrunit,desired_delivery_date"
      )
      .eq("is_open", true)
      .not("desired_delivery_date", "is", null)
      .order("desired_delivery_date", { ascending })
      .order("name", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as RunrunitProject[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function setProjectTracking(
  runrunitProjectId: number,
  isTracking: boolean
) {
  const patch: Record<string, unknown> = { is_tracking_enabled: isTracking };
  if (isTracking) patch.is_new_candidate = false;
  const { error } = await (supabase as any)
    .from("runrunit_projects")
    .update(patch)
    .eq("runrunit_project_id", runrunitProjectId);
  if (error) throw error;
}

export async function setProjectsTrackingBulk(
  ids: number[],
  isTracking: boolean
) {
  if (ids.length === 0) return;
  const patch: Record<string, unknown> = { is_tracking_enabled: isTracking };
  if (isTracking) patch.is_new_candidate = false;
  const { error } = await (supabase as any)
    .from("runrunit_projects")
    .update(patch)
    .in("runrunit_project_id", ids);
  if (error) throw error;
}

export async function ignoreNewCandidate(runrunitProjectId: number) {
  const { error } = await (supabase as any)
    .from("runrunit_projects")
    .update({ is_new_candidate: false })
    .eq("runrunit_project_id", runrunitProjectId);
  if (error) throw error;
}

export async function ignoreAllNewCandidates() {
  const { error } = await (supabase as any)
    .from("runrunit_projects")
    .update({ is_new_candidate: false })
    .eq("is_new_candidate", true);
  if (error) throw error;
}

// ---------- Edge function invocations ----------
/**
 * Extrai a mensagem real de erro retornada pela Edge Function.
 * O `FunctionsHttpError` do supabase-js encapsula a resposta HTTP; o corpo
 * (JSON com { error } ou texto) contém a causa real do problema.
 */
async function extractFunctionError(error: unknown, fnName: string): Promise<Error> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyErr = error as any;
  let detail = anyErr?.message ?? String(error);
  try {
    const ctx = anyErr?.context;
    if (ctx && typeof ctx.text === "function") {
      const raw = await ctx.text();
      if (raw) {
        try {
          const j = JSON.parse(raw);
          detail = j?.error || j?.message || raw;
        } catch {
          detail = raw;
        }
      }
    }
  } catch {
    /* ignore */
  }
  const err = new Error(`[${fnName}] ${detail}`);
  console.error(`Edge function ${fnName} falhou:`, error, "→", detail);
  return err;
}

export async function invokeSyncSingleProject(runrunit_project_id: number) {
  const { data, error } = await supabase.functions.invoke("sync-runrunit-single-project", {
    body: { runrunit_project_id },
  });
  if (error) throw await extractFunctionError(error, "sync-runrunit-single-project");
  return data;
}

export async function invokeDiscoverProjects(source: "Manual" | "Automática" = "Automática") {
  const { data, error } = await supabase.functions.invoke("sync-runrunit-discover-projects", {
    body: { source },
  });
  if (error) throw await extractFunctionError(error, "sync-runrunit-discover-projects");
  return data;
}

export async function invokeSyncTasks() {
  const { data, error } = await supabase.functions.invoke("sync-runrunit-tasks", {
    body: {},
  });
  if (error) throw await extractFunctionError(error, "sync-runrunit-tasks");
  return data;
}

export async function invokeSyncVisibleProjects(limit = 100) {
  const { data, error } = await supabase.functions.invoke(
    "sync-runrunit-visible-projects",
    { body: { limit } }
  );
  if (error) throw await extractFunctionError(error, "sync-runrunit-visible-projects");
  return data;
}

/**
 * Após a sincronização de um projeto, posiciona o card de cada responsável na
 * fila do mês correspondente (Mês/AAAA) considerando a antecedência do quadro:
 * data_posicionamento = desired_delivery_date - antecedence_days.
 * Somente quando o card ainda não existe ou ainda não tem fila definida.
 * Não cria filas automaticamente; se a fila não existir no quadro do responsável,
 * o card permanece "Sem fila".
 */
export async function allocateProjectToMonthlyLanes(runrunit_project_id: number) {
  const { data: proj, error: projErr } = await (supabase as any)
    .from("runrunit_projects")
    .select("desired_delivery_date,is_open")
    .eq("runrunit_project_id", runrunit_project_id)
    .maybeSingle();
  if (projErr) throw projErr;
  if (!proj?.desired_delivery_date) return;
  if (proj.is_open === false) return;

  const { data: people, error: peopleErr } = await (supabase as any)
    .from("runrunit_project_people")
    .select("assignee_name")
    .eq("runrunit_project_id", runrunit_project_id);
  if (peopleErr) throw peopleErr;

  const assignees = Array.from(
    new Set(
      ((people ?? []) as { assignee_name: string | null }[])
        .map((p) => p.assignee_name)
        .filter((n): n is string => !!n && n.trim().length > 0)
    )
  );

  for (const assignee of assignees) {
    // Aplica antecedência do quadro para cálculo da data de posicionamento
    let antecedence = 0;
    try {
      antecedence = await fetchBoardAntecedence(assignee);
    } catch {
      antecedence = 0;
    }
    const positioningDate =
      calculatePositioningDate(proj.desired_delivery_date as string, antecedence) ??
      (proj.desired_delivery_date as string);
    const laneTitle = monthlyLaneTitle(positioningDate);
    if (!laneTitle) continue;

    const { data: lanes } = await (supabase as any)
      .from("dashboard_lanes")
      .select("id,title")
      .eq("assignee_name", assignee);
    const lane = ((lanes ?? []) as { id: string; title: string }[]).find(
      (l) => l.title.trim().toLowerCase() === laneTitle.toLowerCase()
    );
    if (!lane) continue;

    const { data: existing } = await (supabase as any)
      .from("dashboard_project_cards")
      .select("id,lane_id,manually_positioned")
      .eq("runrunit_project_id", runrunit_project_id)
      .eq("assignee_name", assignee)
      .maybeSingle();

    // Preserva organização manual: só realoca se o card nunca foi movido pelo
    // usuário. Se `manually_positioned` for true, mantém a fila atual.
    if (existing && existing.manually_positioned === true) continue;

    if (existing) {
      await (supabase as any)
        .from("dashboard_project_cards")
        .update({ lane_id: lane.id, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await (supabase as any).from("dashboard_project_cards").insert({
        runrunit_project_id,
        assignee_name: assignee,
        lane_id: lane.id,
        status: "a iniciar",
        position: 0,
        review_status: "não enviado",
        manually_positioned: false,
      });
    }
  }
}

/**
 * Realoca todos os cards de um quadro específico com base na antecedência configurada.
 * Usado quando a antecedência do quadro é alterada.
 * Respeita cards com manually_positioned = true (não move).
 */
export async function reallocateBoardCardsForAntecedence(assigneeName: string): Promise<number> {
  const name = assigneeName?.trim();
  if (!name) return 0;
  let antecedence = 0;
  try {
    antecedence = await fetchBoardAntecedence(name);
  } catch {
    antecedence = 0;
  }

  // Busca lanes do quadro para resolver título -> id
  const { data: lanes } = await (supabase as any)
    .from("dashboard_lanes")
    .select("id,title")
    .eq("assignee_name", name);
  const laneMap = new Map<string, string>();
  for (const l of (lanes ?? []) as { id: string; title: string }[]) {
    laneMap.set(l.title.trim().toLowerCase(), l.id);
  }

  // Busca cards do quadro que não são manualmente posicionados
  const { data: cards, error: cardsErr } = await (supabase as any)
    .from("dashboard_project_cards")
    .select("id,runrunit_project_id,manually_positioned,lane_id")
    .eq("assignee_name", name);
  if (cardsErr) throw cardsErr;
  const toProcess = ((cards ?? []) as { id: string; runrunit_project_id: number; manually_positioned: boolean | null; lane_id: string | null }[]).filter(
    (c) => c.manually_positioned !== true
  );
  if (toProcess.length === 0) return 0;

  // Busca datas desejadas dos projetos correspondentes
  const ids = toProcess.map((c) => c.runrunit_project_id);
  // Busca em lotes de 500 para evitar limite de URL
  const desiredMap = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: projs } = await (supabase as any)
      .from("runrunit_projects")
      .select("runrunit_project_id,desired_delivery_date")
      .in("runrunit_project_id", chunk);
    for (const p of (projs ?? []) as { runrunit_project_id: number; desired_delivery_date: string | null }[]) {
      if (p.desired_delivery_date) desiredMap.set(p.runrunit_project_id, p.desired_delivery_date);
    }
  }

  let moved = 0;
  for (const card of toProcess) {
    const desired = desiredMap.get(card.runrunit_project_id);
    if (!desired) continue;
    const positioningDate = calculatePositioningDate(desired, antecedence) ?? desired;
    const laneTitle = monthlyLaneTitle(positioningDate);
    if (!laneTitle) continue;
    const targetLaneId = laneMap.get(laneTitle.toLowerCase());
    // Se a fila de destino não existir, mantém onde está (ou poderia ir para Sem fila = null,
    // mas preservamos para não perder cards quando a fila ainda não foi criada)
    if (!targetLaneId) continue;
    if (card.lane_id === targetLaneId) continue;
    const { error } = await (supabase as any)
      .from("dashboard_project_cards")
      .update({ lane_id: targetLaneId, updated_at: new Date().toISOString() })
      .eq("id", card.id);
    if (!error) moved++;
  }
  return moved;
}

/**
 * Após uma sincronização em massa (`sync-runrunit-tasks`), re-executa a
 * alocação para todos os projetos exibidos e abertos, respeitando cards
 * marcados como `manually_positioned = true`.
 */
export async function reallocateAllTrackedProjects() {
  const { data, error } = await (supabase as any)
    .from("runrunit_projects")
    .select("runrunit_project_id")
    .eq("is_open", true)
    .eq("is_tracking_enabled", true)
    .not("desired_delivery_date", "is", null);
  if (error) throw error;
  const ids = ((data ?? []) as { runrunit_project_id: number }[]).map((r) => r.runrunit_project_id);
  for (const id of ids) {
    try {
      await allocateProjectToMonthlyLanes(id);
    } catch {
      // ignora falhas individuais para não interromper o lote
    }
  }
}

// ---------- Limpar projetos encerrados ----------
/**
 * Conta TODOS os projetos encerrados no Runrun.it (is_open = false),
 * independentemente de estarem marcados para exibição. Usa o status real
 * do projeto (is_open), não apenas o campo de exibição.
 */
export async function countClosedTrackedProjects(): Promise<number> {
  const pageSize = 1000;
  let total = 0;
  let from = 0;
  for (let i = 0; i < 50; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase as any)
      .from("runrunit_projects")
      .select("runrunit_project_id")
      .eq("is_open", false)
      .range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as { runrunit_project_id: number }[];
    total += rows.length;
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return total;
}

/**
 * Remove da visualização ativa todos os projetos encerrados no Runrun.it
 * (is_open = false), independentemente de estarem marcados para exibição.
 * - Remove da lista "Selecionar Projetos" (que filtra is_open=true) e do Painel
 *   (que filtra is_open !== false e is_tracking_enabled)
 * - Não exclui registros do Supabase e não altera histórico/dados: apenas
 *   garante que encerrados não apareçam na visualização ativa, mantendo
 *   todos os campos históricos intactos. Para os que ainda estavam com
 *   is_tracking_enabled=true, desmarca a exibição; para os já desmarcados,
 *   apenas confirma que permanecem fora da visualização.
 * - Não altera projetos abertos (is_open = true).
 * Retorna quantos projetos encerrados foram identificados/removidos da visualização.
 */
export async function clearClosedTrackedProjects(): Promise<number> {
  // Identifica TODOS os encerrados pelo status real (is_open = false)
  const pageSize = 1000;
  const allClosedIds: number[] = [];
  const trackedIds: number[] = [];
  let from = 0;
  for (let i = 0; i < 50; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase as any)
      .from("runrunit_projects")
      .select("runrunit_project_id,is_tracking_enabled")
      .eq("is_open", false)
      .range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as { runrunit_project_id: number; is_tracking_enabled: boolean | null }[];
    for (const r of rows) {
      allClosedIds.push(r.runrunit_project_id);
      if (r.is_tracking_enabled) trackedIds.push(r.runrunit_project_id);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  if (allClosedIds.length === 0) return 0;

  // Apenas os que ainda estavam marcados para exibição precisam ter o flag
  // de visualização desativado; os demais já estão fora da visualização mas
  // contam para a mensagem de confirmação. Não alteramos nenhum outro campo
  // histórico (nome, datas, cliente, etc.).
  if (trackedIds.length > 0) {
    for (let i = 0; i < trackedIds.length; i += 500) {
      const chunk = trackedIds.slice(i, i + 500);
      const { error } = await (supabase as any)
        .from("runrunit_projects")
        .update({ is_tracking_enabled: false, is_new_candidate: false })
        .in("runrunit_project_id", chunk);
      if (error) throw error;
    }
  }

  // Retorna total de encerrados identificados (para mensagem correta),
  // independentemente de já estarem desmarcados. Isso reflete quantos serão
  // removidos/confirmados fora da lista Selecionar Projetos e do Painel.
  return allClosedIds.length;
}