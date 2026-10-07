// Supabase Edge Function: sync-runrunit-single-project
// Sincroniza um projeto + tarefas + alocações com o Runrun.it.
// O CÁLCULO de estimativas NÃO é replicado aqui: após o sync, invoca a
// função oficial calculate-dashboard-project-estimates (única fonte de
// verdade da regra baseada em raw_data.assignments[]), com escopo no projeto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const BASE = "https://runrun.it/api/v1.0";
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
const hdr = (a: string, u: string) => ({ "App-Key": a, "User-Token": u, "Content-Type": "application/json" });
async function rr(path: string, a: string, u: string) {
  const r = await fetch(`${BASE}${path}`, { headers: hdr(a, u) });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null, body: r.ok ? null : await r.text() };
}
function tasksRows(id: number, tasks: any[], now: string) {
  return tasks.map(t => ({
    runrunit_task_id: t.id,
    runrunit_project_id: id,
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
}
function peopleRows(id: number, tasks: any[], now: string) {
  const m = new Map<string, any>();
  for (const t of tasks) {
    for (const a of (Array.isArray(t.assignments) ? t.assignments : [])) {
      const aid = a.assignee_id ?? null, an = a.assignee_name ?? null, tid = a.team_id ?? null, tn = a.team_name ?? null;
      if (!aid && !an && !tid && !tn) continue;
      m.set(`${id}-${aid ?? an}-${tid ?? tn}`, {
        runrunit_project_id: id,
        assignee_id: aid,
        assignee_name: an,
        team_id: tid,
        team_name: tn,
        source: "task_assignment",
        last_synced_at: now,
      });
    }
  }
  return [...m.values()];
}
async function invokeOfficialEstimateCalc(url: string, key: string, runrunit_project_id: number) {
  const resp = await fetch(`${url}/functions/v1/calculate-dashboard-project-estimates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "apikey": key },
    body: JSON.stringify({ runrunit_project_id }),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.success === false) throw new Error(data?.error ?? `HTTP ${resp.status}`);
  return { rows: Number(data.estimativas_geradas ?? 0), hours: Number(data.total_horas_estimadas ?? 0) };
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const body = await req.json().catch(() => ({}));
  const id = Number((body as any).runrunit_project_id);
  if (!id) return json({ error: "Informe runrunit_project_id" }, 400);
  const a = Deno.env.get("RUNRUNIT_APP_TOKEN"), u = Deno.env.get("RUNRUNIT_USER_TOKEN"), url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!a || !u || !url || !key) return json({ error: "Secrets ausentes" }, 500);
  const s = createClient(url, key), now = new Date().toISOString();
  const pr = await rr(`/projects/${id}`, a, u);
  if (!pr.ok) return json({ success: false, error: "Erro ao buscar projeto no Runrun.it", status: pr.status, body: pr.body }, pr.status === 429 ? 429 : 500);
  const p = pr.data;
  const project = {
    runrunit_project_id: p.id,
    name: p.name ?? p.title ?? `Projeto ${p.id}`,
    client_name: p.client_name ?? p.client?.name ?? null,
    project_group_name: p.project_group_name ?? p.group_name ?? p.project_group?.name ?? null,
    project_sub_group_name: p.project_sub_group_name ?? p.sub_group_name ?? p.project_sub_group?.name ?? null,
    status: p.is_closed === true ? "closed" : "open",
    is_open: p.is_closed !== true,
    raw_data: p,
    desired_delivery_date: typeof p.desired_date === "string" ? p.desired_date.slice(0, 10) : null,
    created_at_runrunit: p.created_at ?? null,
    updated_at_runrunit: p.updated_at ?? null,
    last_synced_at: now,
    last_project_detail_synced_at: now,
  };
  const { error: pe } = await s.from("runrunit_projects").upsert(project, { onConflict: "runrunit_project_id" });
  if (pe) return json({ success: false, error: pe.message }, 500);
  if (!project.is_open) {
    await s.from("runrunit_projects").update({ is_tracking_enabled: false, is_new_candidate: false }).eq("runrunit_project_id", id);
    await s.from("dashboard_project_estimates").delete().eq("runrunit_project_id", id);
    return json({ success: true, project_id: id, is_open: false, tasks_saved: 0, people_inserted: 0 });
  }
  const tr = await rr(`/tasks?project_id=${id}`, a, u);
  if (!tr.ok) return json({ success: false, error: "Erro ao buscar tarefas no Runrun.it", status: tr.status, body: tr.body }, tr.status === 429 ? 429 : 500);
  const tasks = Array.isArray(tr.data) ? tr.data : [], rows = tasksRows(id, tasks, now);
  if (rows.length) {
    const { error: e } = await s.from("runrunit_tasks").upsert(rows, { onConflict: "runrunit_task_id" });
    if (e) return json({ success: false, error: e.message }, 500);
  }
  const people = peopleRows(id, tasks, now);
  const { error: de } = await s.from("runrunit_project_people").delete().eq("runrunit_project_id", id);
  if (de) return json({ success: false, error: de.message }, 500);
  if (people.length) {
    const { error: e } = await s.from("runrunit_project_people").insert(people);
    if (e) return json({ success: false, error: e.message }, 500);
  }
  await s.from("runrunit_projects").update({
    is_tracking_enabled: true,
    is_new_candidate: false,
    last_project_detail_synced_at: now,
    last_people_synced_at: now,
    last_synced_at: now,
  }).eq("runrunit_project_id", id);
  let estimates = { rows: 0, hours: 0 };
  try {
    estimates = await invokeOfficialEstimateCalc(url, key, id);
  } catch (e) {
    return json({
      success: false,
      error: "Tarefas sincronizadas, mas erro ao calcular estimativas",
      details: e instanceof Error ? e.message : String(e),
      project_id: id,
      tasks_read: tasks.length,
      tasks_saved: rows.length,
    }, 207);
  }
  return json({
    success: true,
    mode: "single_project",
    project_id: id,
    tasks_read: tasks.length,
    tasks_saved: rows.length,
    people_inserted: people.length,
    estimates_generated: estimates.rows,
    total_estimated_hours: estimates.hours,
  });
});