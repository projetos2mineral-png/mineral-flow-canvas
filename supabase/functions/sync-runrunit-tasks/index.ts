// Supabase Edge Function: sync-runrunit-tasks
// Sincroniza tarefas em lote e, APÓS processar, recalcula estimativas
// apenas para os projetos processados, invocando a função oficial
// calculate-dashboard-project-estimates (única fonte de verdade).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const BASE = "https://runrun.it/api/v1.0";
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
const hdr = (a: string, u: string) => ({ "App-Key": a, "User-Token": u, "Content-Type": "application/json" });
async function rr(path: string, a: string, u: string, page = 1) {
  const r = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}page=${page}&per_page=100`, { headers: hdr(a, u) });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null, body: r.ok ? null : await r.text() };
}
function projectIdsFromTasks(tasks: any[]) {
  const set = new Set<number>();
  for (const t of tasks) {
    const pid = t.project_id ?? t.project?.id;
    if (typeof pid === "number") set.add(pid);
  }
  return [...set];
}
async function invokeOfficialEstimateCalcScope(url: string, key: string, ids: number[]) {
  if (!ids.length) return { rows: 0, hours: 0 };
  const resp = await fetch(`${url}/functions/v1/calculate-dashboard-project-estimates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "apikey": key },
    body: JSON.stringify({ runrunit_project_ids: ids }),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.success === false) throw new Error(data?.error ?? `HTTP ${resp.status}`);
  return { rows: Number(data.estimativas_geradas ?? 0), hours: Number(data.total_horas_estimadas ?? 0) };
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const a = Deno.env.get("RUNRUNIT_APP_TOKEN"), u = Deno.env.get("RUNRUNIT_USER_TOKEN"), url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!a || !u || !url || !key) return json({ error: "Secrets ausentes" }, 500);
  const s = createClient(url, key), now = new Date().toISOString();
  const all: any[] = [], processedProjectIds = new Set<number>();
  for (let page = 1; page <= 10; page++) {
    const res = await rr("/tasks", a, u, page);
    if (!res.ok) return json({ error: "Erro ao buscar tarefas", status: res.status, body: res.body }, 500);
    const list = Array.isArray(res.data) ? res.data : [];
    all.push(...list);
    if (list.length < 100) break;
  }
  const map = new Map<number, any>();
  for (const t of all) map.set(t.id, t);
  if (map.size) {
    const rows = [...map.values()].map((t: any) => ({
      runrunit_task_id: t.id,
      runrunit_project_id: t.project_id ?? t.project?.id ?? null,
      title: t.title ?? "Sem título",
      responsible_name: t.responsible_name ?? null,
      team_name: t.team_name ?? null,
      task_type: t.type_name ?? null,
      status: t.is_closed ? "closed" : "open",
      board_stage_name: t.board_stage_name ?? null,
      desired_date: t.desired_date ?? null,
      close_date: t.close_date ?? null,
      raw_data: t,
      last_synced_at: now,
    }));
    const { error } = await s.from("runrunit_tasks").upsert(rows, { onConflict: "runrunit_task_id" });
    if (error) return json({ error }, 500);
    for (const r of rows) if (r.runrunit_project_id) processedProjectIds.add(r.runrunit_project_id);
  }
  const projectIds = projectIdsFromTasks([...map.values()]);
  if (projectIds.length) await s.from("runrunit_projects").update({ last_synced_at: now }).in("runrunit_project_id", projectIds);
  let estimates = { rows: 0, hours: 0 };
  const ids = [...processedProjectIds];
  try {
    estimates = await invokeOfficialEstimateCalcScope(url, key, ids);
  } catch (e) {
    return json({
      success: false,
      error: "Tarefas sincronizadas, mas erro ao calcular estimativas",
      details: e instanceof Error ? e.message : String(e),
      tasks_processed: map.size,
      projects_updated: projectIds.length,
      estimate_error: true,
    }, 207);
  }
  return json({
    success: true,
    tasks_processed: map.size,
    projects_updated: projectIds.length,
    estimates_generated: estimates.rows,
    total_estimated_hours: estimates.hours,
  });
});