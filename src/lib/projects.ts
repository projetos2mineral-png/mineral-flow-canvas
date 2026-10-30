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

// ---------- Alocação automática em filas mensais (regra única) ----------

export type AllocationReason =
  | "alocar" // card sem fila (ou inexistente) com destino válido
  | "ja_alocado" // card já está em uma fila: preservado (inclui posições manuais)
  | "manual_sem_fila" // card em "Sem fila" posicionado manualmente: preservado
  | "sem_data"
  | "projeto_encerrado"
  | "sem_responsavel"
  | "sem_fila_mensal";

export type AllocationOutcome = {
  runrunit_project_id: number;
  assignee_name: string | null;
  desired_delivery_date: string | null;
  antecedence_days: number;
  target_lane_title: string | null;
  target_lane_id: string | null;
  reason: AllocationReason;
  /** true quando a gravação foi feita (somente fora do modo prévia). */
  applied: boolean;
  error?: string;
};

export const ALLOCATION_REASON_LABEL: Record<AllocationReason, string> = {
  alocar: "Elegível",
  ja_alocado: "Já está em uma fila",
  manual_sem_fila: "Sem fila (manual)",
  sem_data: "Sem data desejada",
  projeto_encerrado: "Projeto encerrado",
  sem_responsavel: "Sem responsável",
  sem_fila_mensal: "Fila do mês não existe no quadro",
};

/** Título "Mês/AAAA" de destino, aplicando a antecedência do quadro. */
export function targetLaneTitleFor(desired: string, antecedenceDays: number): string | null {
  const ante = Number.isFinite(antecedenceDays) && antecedenceDays >= 0 ? Math.floor(antecedenceDays) : 0;
  const pos = calculatePositioningDate(desired, ante) ?? desired;
  return monthlyLaneTitle(pos) || null;
}

/**
 * Decisão pura (sem I/O) para um card. Regra:
 * - card com `lane_id` definido → preservado, seja manual ou automático;
 * - card em "Sem fila" posicionado manualmente → preservado;
 * - card sem fila (`lane_id = null`) ou inexistente → aloca se a fila do mês
 *   existir no quadro.
 */
export function decideCardAllocation(input: {
  existingLaneId: string | null | undefined;
  cardExists: boolean;
  targetLaneId: string | null;
  manuallyPositioned: boolean | null | undefined;
}): AllocationReason {
  if (input.cardExists && input.existingLaneId) return "ja_alocado";
  if (input.cardExists && input.manuallyPositioned === true) return "manual_sem_fila";
  if (!input.targetLaneId) return "sem_fila_mensal";
  return "alocar";
}

/**
 * Posiciona o card de cada responsável do projeto na fila mensal
 * (data_posicionamento = desired_delivery_date - antecedence_days).
 * Nunca cria filas e nunca move cards que já estão em uma fila ou que foram
 * posicionados manualmente em "Sem fila".
 * Com `dryRun: true` apenas calcula (prévia), sem gravar nada.
 */
export async function allocateProjectToMonthlyLanes(
  runrunit_project_id: number,
  opts: { dryRun?: boolean } = {},
): Promise<AllocationOutcome[]> {
  const base = {
    runrunit_project_id,
    assignee_name: null,
    desired_delivery_date: null,
    antecedence_days: 0,
    target_lane_title: null,
    target_lane_id: null,
    applied: false,
  };
  const { data: proj, error: projErr } = await (supabase as any)
    .from("runrunit_projects")
    .select("desired_delivery_date,is_open")
    .eq("runrunit_project_id", runrunit_project_id)
    .maybeSingle();
  if (projErr) throw projErr;

  // Responsáveis: `runrunit_project_people` pode estar vazia em produção, por
  // isso unimos com os cards existentes e a view do painel (fonte real).
  const names = new Set<string>();
  const addNames = (rows: unknown) => {
    for (const r of (rows ?? []) as { assignee_name: string | null }[]) {
      const n = r.assignee_name?.trim();
      if (n) names.add(n);
    }
  };
  const [peopleRes, cardsRes, viewRes] = await Promise.all([
    (supabase as any).from("runrunit_project_people").select("assignee_name").eq("runrunit_project_id", runrunit_project_id),
    (supabase as any).from("dashboard_project_cards").select("assignee_name").eq("runrunit_project_id", runrunit_project_id),
    (supabase as any)
      .from("v_dashboard_projects")
      .select("assignee_name,desired_delivery_date,is_open")
      .eq("runrunit_project_id", runrunit_project_id),
  ]);
  if (peopleRes.error && cardsRes.error && viewRes.error) throw peopleRes.error;
  addNames(peopleRes.data);
  addNames(cardsRes.data);
  addNames(viewRes.data);
  const viewRow = ((viewRes.data ?? []) as { desired_delivery_date: string | null; is_open: boolean | null }[])[0];

  const desired = (proj?.desired_delivery_date as string | null) ?? viewRow?.desired_delivery_date ?? null;
  if (!desired) return [{ ...base, reason: "sem_data" }];
  const isOpen = proj ? proj.is_open : viewRow?.is_open;
  if (isOpen === false) return [{ ...base, desired_delivery_date: desired, reason: "projeto_encerrado" }];

  const assignees = Array.from(names);
  if (assignees.length === 0) return [{ ...base, desired_delivery_date: desired, reason: "sem_responsavel" }];

  const outcomes: AllocationOutcome[] = [];
  for (const assignee of assignees) {
    let antecedence = 0;
    try {
      antecedence = await fetchBoardAntecedence(assignee);
    } catch {
      antecedence = 0;
    }
    const laneTitle = targetLaneTitleFor(desired, antecedence);

    const { data: lanes, error: lanesErr } = await (supabase as any)
      .from("dashboard_lanes")
      .select("id,title")
      .eq("assignee_name", assignee);
    if (lanesErr) throw lanesErr;
    const lane = laneTitle
      ? ((lanes ?? []) as { id: string; title: string }[]).find(
          (l) => l.title.trim().toLowerCase() === laneTitle.toLowerCase(),
        )
      : undefined;

    const { data: existing, error: exErr } = await (supabase as any)
      .from("dashboard_project_cards")
      .select("id,lane_id,manually_positioned")
      .eq("runrunit_project_id", runrunit_project_id)
      .eq("assignee_name", assignee)
      .maybeSingle();
    if (exErr) throw exErr;

    // A fila gravada só vale se pertencer ao quadro DESTE responsável;
    // fila de outro quadro ou excluída = card órfão (aparece em "Sem fila").
    const ownLaneIds = new Set(((lanes ?? []) as { id: string }[]).map((l) => l.id));
    const rawLaneId: string | null = existing?.lane_id ?? null;
    const validLaneId = rawLaneId && ownLaneIds.has(rawLaneId) ? rawLaneId : null;
    const reason = decideCardAllocation({
      cardExists: !!existing,
      existingLaneId: validLaneId,
      targetLaneId: lane?.id ?? null,
      manuallyPositioned: existing?.manually_positioned === true,
    });
    const outcome: AllocationOutcome = {
      runrunit_project_id,
      assignee_name: assignee,
      desired_delivery_date: desired,
      antecedence_days: antecedence,
      target_lane_title: laneTitle,
      target_lane_id: lane?.id ?? null,
      reason,
      applied: false,
    };
    outcomes.push(outcome);
    if (reason !== "alocar" || opts.dryRun || !lane) continue;

    try {
      if (existing) {
        // Filtro pelo lane_id lido torna a gravação idempotente e evita
        // sobrescrever um card que outra pessoa alocou nesse intervalo.
        let q = (supabase as any)
          .from("dashboard_project_cards")
          .update({ lane_id: lane.id, manually_positioned: false, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        q = rawLaneId ? q.eq("lane_id", rawLaneId) : q.is("lane_id", null);
        const { data, error } = await q.select("id,lane_id");
        if (error) throw error;
        outcome.applied = Array.isArray(data) && data.length > 0 && data[0].lane_id === lane.id;
        if (!outcome.applied) outcome.reason = "ja_alocado";
      } else {
        const { error } = await (supabase as any).from("dashboard_project_cards").insert({
          runrunit_project_id,
          assignee_name: assignee,
          lane_id: lane.id,
          status: "a iniciar",
          position: 0,
          review_status: "não enviado",
          manually_positioned: false,
        });
        if (error) throw error;
        outcome.applied = true;
      }
    } catch (e) {
      outcome.error = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    }
  }
  return outcomes;
}

/** Card está em "Sem fila" no quadro do seu responsável (sem fila ou fila de outro quadro/excluída). */
export function isCardOrphan(
  card: { assignee_name: string | null; lane_id: string | null },
  laneOwner: Map<string, string>,
): boolean {
  if (!card.lane_id) return true;
  const owner = laneOwner.get(card.lane_id);
  return !owner || owner.trim() !== (card.assignee_name ?? "").trim();
}

/** IDs de projetos abertos e exibidos com ao menos um card em "Sem fila" (avaliado por responsável). */
export async function fetchProjectsWithUnassignedCards(): Promise<number[]> {
  const ids = new Set<number>();
  const pageSize = 1000;
  const laneOwner = new Map<string, string>();
  for (let from = 0; from < 50 * pageSize; from += pageSize) {
    const { data, error } = await (supabase as any)
      .from("dashboard_lanes")
      .select("id,assignee_name")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; assignee_name: string }[];
    rows.forEach((l) => laneOwner.set(l.id, l.assignee_name));
    if (rows.length < pageSize) break;
  }
  for (let from = 0; from < 50 * pageSize; from += pageSize) {
    const { data, error } = await (supabase as any)
      .from("dashboard_project_cards")
      .select("runrunit_project_id,assignee_name,lane_id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as { runrunit_project_id: number; assignee_name: string | null; lane_id: string | null }[];
    rows.forEach((r) => {
      if (isCardOrphan(r, laneOwner)) ids.add(r.runrunit_project_id);
    });
    if (rows.length < pageSize) break;
  }
  const all = [...ids];
  const open: number[] = [];
  for (let i = 0; i < all.length; i += 150) {
    const { data, error } = await (supabase as any)
      .from("runrunit_projects")
      .select("runrunit_project_id")
      .in("runrunit_project_id", all.slice(i, i + 150))
      .eq("is_open", true)
      .eq("is_tracking_enabled", true);
    if (error) throw error;
    for (const r of (data ?? []) as { runrunit_project_id: number }[]) open.push(r.runrunit_project_id);
  }
  return open;
}

/** Executa a alocação (prévia ou gravação) para vários projetos, 3 por vez. */
export async function allocateManyProjects(
  ids: number[],
  opts: { dryRun?: boolean } = {},
): Promise<AllocationOutcome[]> {
  const out: AllocationOutcome[] = [];
  for (let i = 0; i < ids.length; i += 3) {
    const part = await Promise.all(
      ids.slice(i, i + 3).map(async (id) => {
        try {
          return await allocateProjectToMonthlyLanes(id, opts);
        } catch (e) {
          return [
            {
              runrunit_project_id: id,
              assignee_name: null,
              desired_delivery_date: null,
              antecedence_days: 0,
              target_lane_title: null,
              target_lane_id: null,
              reason: "sem_fila_mensal" as AllocationReason,
              applied: false,
              error: e instanceof Error ? e.message : String(e),
            },
          ];
        }
      }),
    );
    part.forEach((p) => out.push(...p));
  }
  return out;
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

  // Sanitiza antecedência
  const ante = Number.isFinite(antecedence) && antecedence >= 0 ? Math.floor(antecedence) : 0;
  let moved = 0;
  for (const card of toProcess) {
    const desired = desiredMap.get(card.runrunit_project_id);
    if (!desired) continue;
    let positioningDate: string | null = null;
    try {
      positioningDate = calculatePositioningDate(desired, ante);
    } catch {
      positioningDate = null;
    }
    const dateToUse = positioningDate ?? desired;
    let laneTitle: string | null = null;
    try {
      laneTitle = monthlyLaneTitle(dateToUse);
    } catch {
      laneTitle = null;
    }
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

/**
 * Fluxo único de "Atualizar projeto" (individual e em lote): sincroniza com o
 * Runrun.it e, mesmo se a sincronização falhar, tenta alocar com os dados
 * locais já gravados. Erros de sincronização e de alocação são separados.
 */
export async function syncAndAllocateProject(id: number): Promise<{
  syncError: string | null;
  allocationError: string | null;
  outcomes: AllocationOutcome[];
}> {
  let syncError: string | null = null;
  try {
    await invokeSyncSingleProject(id);
  } catch (e) {
    syncError = e instanceof Error ? e.message : String(e);
  }
  try {
    const outcomes = await allocateProjectToMonthlyLanes(id);
    const failed = outcomes.find((o) => o.error);
    return { syncError, allocationError: failed?.error ?? null, outcomes };
  } catch (e) {
    return { syncError, allocationError: e instanceof Error ? e.message : String(e), outcomes: [] };
  }
}
