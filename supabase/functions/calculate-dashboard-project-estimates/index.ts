import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function jsonResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
Deno.serve(async (req) => {
  let scopeIds: number[] | null = null;
  try {
    // Escopo OPCIONAL: quando informado, a mesma regra de cálculo é aplicada
    // somente aos projetos listados (tarefas, cards e delete+insert restritos).
    // Sem body/escopo, o comportamento é idêntico ao original: rebuild total.
    const body = await req.json().catch(() => ({}));
    const many = Array.isArray((body as any)?.runrunit_project_ids)
      ? ((body as any).runrunit_project_ids as unknown[]).map(Number).filter((n) => Number.isFinite(n))
      : [];
    const single = Number((body as any)?.runrunit_project_id);
    if (many.length) scopeIds = many;
    else if (Number.isFinite(single) && single > 0) scopeIds = [single];
  } catch { scopeIds = null; }
  const supabaseUrl = Deno.env.get("SUPABASE_URL"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ success:false, error:"Secrets ausentes" },500);
  const supabase=createClient(supabaseUrl,serviceRoleKey);
  try {
    const pageSize = 1000;
    const tasks = [];
    let pagesProcessed = 0;
    for (let start = 0; ; start += pageSize) {
      const taskQuery = supabase.from("runrunit_tasks").select("runrunit_task_id,runrunit_project_id,title,responsible_name,task_type,raw_data").not("runrunit_project_id","is",null);
      if (scopeIds) taskQuery.in("runrunit_project_id", scopeIds);
      const {data:taskPage,error:tasksError}=await taskQuery.order("runrunit_task_id",{ascending:true}).range(start,start+pageSize-1);
      if(tasksError)return jsonResponse({success:false,error:"Erro buscando tarefas",details:tasksError},500);
      const pageTasks = taskPage ?? [];
      pagesProcessed++;
      tasks.push(...pageTasks);
      if (pageTasks.length === 0 || pageTasks.length < pageSize) break;
    }
    const cardKeys = new Set();
    for (let start = 0; ; start += pageSize) {
      const cardQuery = supabase.from("dashboard_project_cards").select("runrunit_project_id,assignee_name");
      if (scopeIds) cardQuery.in("runrunit_project_id", scopeIds);
      const {data:cardPage,error:cardsError}=await cardQuery.order("runrunit_project_id",{ascending:true}).order("assignee_name",{ascending:true}).range(start,start+pageSize-1);
      if(cardsError)return jsonResponse({success:false,error:"Erro buscando cards",details:cardsError},500);
      const pageCards = cardPage ?? [];
      for (const card of pageCards) cardKeys.add(`${card.runrunit_project_id}|${card.assignee_name}`);
      if (pageCards.length === 0 || pageCards.length < pageSize) break;
    }
    const estimativas = [];
    let rulePagesProcessed = 0;
    for (let start = 0; ; start += pageSize) {
      const {data:rulesPage,error:estimativasError}=await supabase.from("runrunit_estimativas_tarefas").select("responsavel_id,responsavel_nome,tipo_tarefa,mediana_horas,origem_estimativa,nivel_confianca").order("responsavel_id",{ascending:true}).order("tipo_tarefa",{ascending:true}).range(start,start+pageSize-1);
      if(estimativasError)return jsonResponse({success:false,error:"Erro buscando estimativas",details:estimativasError},500);
      const pageRules = rulesPage ?? [];
      rulePagesProcessed++;
      estimativas.push(...pageRules);
      if (pageRules.length === 0 || pageRules.length < pageSize) break;
    }
    const mapaResponsavel=new Map(); const mapaTipo=new Map();
    for(const item of estimativas??[]){if(item.origem_estimativa==="responsavel_tipo")mapaResponsavel.set(`${item.responsavel_nome}|${item.tipo_tarefa}`,item);if(item.origem_estimativa==="tipo_geral")mapaTipo.set(item.tipo_tarefa,item)}
    const projetos=new Map();
    for (const task of tasks ?? []) {
      if (!task.task_type) continue;
      const assignments: any[] = Array.isArray(task.raw_data?.assignments) ? task.raw_data.assignments : [];
      if (assignments.length === 0) continue;
      const totalAssignmentSeconds = assignments.reduce(
        (total, assignment) => total + (Number(assignment.current_estimate_seconds) || 0),
        0
      );
      for (const assignment of assignments) {
        const assigneeName = assignment.assignee_name;
        if (!assigneeName || !cardKeys.has(`${task.runrunit_project_id}|${assigneeName}`)) continue;
        const specificKey = `${assigneeName}|${task.task_type}`;
        let estimate = null;
        let source = null;
        if (mapaResponsavel.has(specificKey)) {
          estimate = mapaResponsavel.get(specificKey);
          source = "responsavel_tipo";
        }
        if (!estimate && mapaTipo.has(task.task_type)) {
          estimate = mapaTipo.get(task.task_type);
          source = "tipo_geral";
        }
        if (!estimate) continue;
        const assignmentSeconds = Number(assignment.current_estimate_seconds) || 0;
        const weight = assignments.length === 1
          ? 1
          : totalAssignmentSeconds > 0
            ? assignmentSeconds / totalAssignmentSeconds
            : null;
        if (weight == null || weight <= 0) continue;
        const allocatedHours = Number(estimate.mediana_horas ?? 0) * weight;
        const groupKey = `${task.runrunit_project_id}|${assigneeName}`;
        if (!projetos.has(groupKey)) {
          projetos.set(groupKey, {
            runrunit_project_id: task.runrunit_project_id,
            assignee_name: assigneeName,
            total_tasks: 0,
            total_estimated_hours: 0,
            calculation_details: [],
            task_ids: new Set(),
          });
        }
        const record = projetos.get(groupKey);
        if (!record.task_ids.has(task.runrunit_task_id)) {
          record.task_ids.add(task.runrunit_task_id);
          record.total_tasks++;
        }
        record.total_estimated_hours += allocatedHours;
        record.calculation_details.push({
          task_id: task.runrunit_task_id,
          task_title: task.title,
          tipo: task.task_type,
          estimated_hours: allocatedHours,
          origem: source,
          confianca: estimate.nivel_confianca,
        });
      }
    }
    const registros=Array.from(projetos.values()).map(({task_ids,...item})=>({...item,total_estimated_hours:Number(item.total_estimated_hours.toFixed(2)),updated_at:new Date().toISOString()}));
    const deleteQuery = supabase.from("dashboard_project_estimates").delete();
    const {error:deleteError}=scopeIds ? await deleteQuery.in("runrunit_project_id", scopeIds) : await deleteQuery.not("id","is",null);if(deleteError)return jsonResponse({success:false,error:"Erro limpando estimativas antigas",details:deleteError},500);
    if(registros.length){const {error:insertError}=await supabase.from("dashboard_project_estimates").insert(registros);if(insertError)return jsonResponse({success:false,error:"Erro inserindo estimativas",details:insertError},500)}
    return jsonResponse({success:true,tarefas_processadas:tasks.length,paginas_processadas:pagesProcessed,regras_carregadas:estimativas.length,paginas_regras_processadas:rulePagesProcessed,estimativas_geradas:registros.length,total_horas_estimadas:registros.reduce((a,i)=>a+i.total_estimated_hours,0)});
  } catch(error){return jsonResponse({success:false,error:error instanceof Error?error.message:String(error)},500)}
});
