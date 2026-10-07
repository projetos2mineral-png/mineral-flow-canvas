import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function jsonResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ success:false, error:"Secrets ausentes" },500);
  const supabase=createClient(supabaseUrl,serviceRoleKey);
  try {
    const pageSize = 1000;
    const tasks = [];
    let pagesProcessed = 0;
    for (let start = 0; ; start += pageSize) {
      const {data:taskPage,error:tasksError}=await supabase.from("runrunit_tasks").select("runrunit_task_id,runrunit_project_id,title,responsible_name,task_type").not("runrunit_project_id","is",null).order("runrunit_task_id",{ascending:true}).range(start,start+pageSize-1);
      if(tasksError)return jsonResponse({success:false,error:"Erro buscando tarefas",details:tasksError},500);
      const pageTasks = taskPage ?? [];
      pagesProcessed++;
      tasks.push(...pageTasks);
      if (pageTasks.length === 0 || pageTasks.length < pageSize) break;
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
    for(const task of tasks??[]){if(!task.responsible_name||!task.task_type)continue;let estimativa=null;let fonte=null;const chave=`${task.responsible_name}|${task.task_type}`;if(mapaResponsavel.has(chave)){estimativa=mapaResponsavel.get(chave);fonte="responsavel_tipo"}if(!estimativa&&mapaTipo.has(task.task_type)){estimativa=mapaTipo.get(task.task_type);fonte="tipo_geral"}if(!estimativa)continue;const chaveProjeto=`${task.runrunit_project_id}|${task.responsible_name}`;if(!projetos.has(chaveProjeto))projetos.set(chaveProjeto,{runrunit_project_id:task.runrunit_project_id,assignee_name:task.responsible_name,total_tasks:0,total_estimated_hours:0,calculation_details:[]});const registro=projetos.get(chaveProjeto);registro.total_tasks++;registro.total_estimated_hours+=Number(estimativa.mediana_horas??0);registro.calculation_details.push({task_id:task.runrunit_task_id,task_title:task.title,tipo:task.task_type,estimated_hours:Number(estimativa.mediana_horas),origem:fonte,confianca:estimativa.nivel_confianca})}
    const registros=Array.from(projetos.values()).map(item=>({...item,total_estimated_hours:Number(item.total_estimated_hours.toFixed(2)),updated_at:new Date().toISOString()}));
    const {error:deleteError}=await supabase.from("dashboard_project_estimates").delete().not("id","is",null);if(deleteError)return jsonResponse({success:false,error:"Erro limpando estimativas antigas",details:deleteError},500);
    if(registros.length){const {error:insertError}=await supabase.from("dashboard_project_estimates").insert(registros);if(insertError)return jsonResponse({success:false,error:"Erro inserindo estimativas",details:insertError},500)}
    return jsonResponse({success:true,tarefas_processadas:tasks.length,paginas_processadas:pagesProcessed,regras_carregadas:estimativas.length,paginas_regras_processadas:rulePagesProcessed,estimativas_geradas:registros.length,total_horas_estimadas:registros.reduce((a,i)=>a+i.total_estimated_hours,0)});
  } catch(error){return jsonResponse({success:false,error:error instanceof Error?error.message:String(error)},500)}
});
