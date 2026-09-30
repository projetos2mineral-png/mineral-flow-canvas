// Supabase Edge Function: sync-runrunit-discover-projects
// Objetivo: descobrir/atualizar TODOS os projetos do Runrun.it
// em uma única execução, usando paginação interna em lotes.
// Não busca tarefas/alocações.
//
// Regra importante:
// desired_delivery_date no Supabase usa SOMENTE project.desired_date
// do Runrun.it.
// NÃO usa estimated_delivery_date, due_date, deadline ou outros campos.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SyncControl = {
  job_name: string;
  last_offset: number;
  batch_size: number;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function asDateOnly(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;

  const datePart = value.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return null;
  }

  return datePart;
}

function pickDesiredDeliveryDate(project: any): string | null {
  // REGRA OFICIAL:
  // Usar somente o campo desired_date do Runrun.it.
  // Não usar estimated_delivery_date, due_date, deadline etc.
  return asDateOnly(project?.desired_date);
}

function isProjectOpen(project: any): boolean {
  return project?.is_closed === false;
}


const RUNRUNIT_MAX_ATTEMPTS = 2;
const RUNRUNIT_REQUEST_TIMEOUT_MS = 20000;
const RUNRUNIT_RETRY_DELAYS_MS = [750, 1500];

function isRetryableRunrunStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

async function fetchRunrunProjectsPage(
  url: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string; attempts: number; headers: Headers }> {
  let lastStatus = 0;
  let lastText = "";

  for (let attempt = 1; attempt <= RUNRUNIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        RUNRUNIT_REQUEST_TIMEOUT_MS,
      );

      let response: Response;

      try {
        response = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const text = await response.text();
      lastStatus = response.status;
      lastText = text;

      if (response.ok) {
        return { ok: true, status: response.status, text, attempts: attempt, headers: response.headers };
      }

      if (
        !isRetryableRunrunStatus(response.status) ||
        attempt === RUNRUNIT_MAX_ATTEMPTS
      ) {
        return { ok: false, status: response.status, text, attempts: attempt, headers: response.headers };
      }

      const retryAfter = Number(response.headers.get("Retry-After"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : RUNRUNIT_RETRY_DELAYS_MS[attempt - 1] ?? 1500;

      console.warn(
        `Runrun.it respondeu ${response.status} em tentativa ${attempt}/${RUNRUNIT_MAX_ATTEMPTS}. Retentando em ${delayMs}ms.`,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      if (attempt === RUNRUNIT_MAX_ATTEMPTS) {
        console.error(
          `Falha de rede ao consultar Runrun.it após ${attempt} tentativas.`,
          error,
        );

        return {
          ok: false,
          status: 0,
          text: error instanceof Error ? error.message : String(error),
          attempts: attempt,
          headers: new Headers(),
        };
      }

      const delayMs = RUNRUNIT_RETRY_DELAYS_MS[attempt - 1] ?? 1500;

      const reason = error instanceof DOMException && error.name === "AbortError"
        ? `timeout após ${RUNRUNIT_REQUEST_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);

      console.warn(
        `Falha ao consultar Runrun.it na tentativa ${attempt}/${RUNRUNIT_MAX_ATTEMPTS}: ${reason}. Retentando em ${delayMs}ms.`,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    ok: false,
    status: lastStatus,
    text: lastText,
    attempts: RUNRUNIT_MAX_ATTEMPTS,
    headers: new Headers(),
  };
}

function toProjectRow(project: any, existing?: any) {
  const open = isProjectOpen(project);
  const desiredDeliveryDate = pickDesiredDeliveryDate(project);
  const isNew = !existing;

  return {
    runrunit_project_id: Number(project.id),
    name: project.name ?? "Sem nome",
    client_name: project.client_name ?? null,
    project_group_name: project.project_group_name ?? null,
    project_sub_group_name: project.project_sub_group_name ?? null,
    status: open ? "open" : "closed",
    is_open: open,

    // Se o projeto fechou no Runrun.it, tira do dashboard.
    // Se continua aberto, preserva a seleção já existente.
    is_tracking_enabled: open
      ? (existing?.is_tracking_enabled ?? false)
      : false,

    // Só marca como novo candidato quando for realmente novo no banco,
    // estiver aberto e tiver desired_date preenchido.
    is_new_candidate: open
      ? (
          isNew && desiredDeliveryDate !== null
            ? true
            : existing?.is_new_candidate ?? false
        )
      : false,

    desired_delivery_date: desiredDeliveryDate,
    raw_data: project,
    created_at_runrunit: project.created_at ?? null,
    updated_at_runrunit: project.updated_at ?? null,
    last_synced_at: new Date().toISOString(),
    last_project_detail_synced_at: new Date().toISOString(),
    discovered_at: existing?.discovered_at ?? new Date().toISOString(),

    // Só registra o fechamento quando o projeto estiver fechado.
    // Preserva uma data de fechamento já existente.
    closed_detected_at: open
      ? existing?.closed_detected_at ?? null
      : existing?.closed_detected_at ?? new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          error: "Método não permitido. Use POST.",
        },
        405,
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const RUNRUNIT_APP_TOKEN = Deno.env.get("RUNRUNIT_APP_TOKEN");
    const RUNRUNIT_USER_TOKEN = Deno.env.get("RUNRUNIT_USER_TOKEN");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        {
          success: false,
          error: "Secrets do Supabase ausentes.",
        },
        500,
      );
    }

    if (!RUNRUNIT_APP_TOKEN || !RUNRUNIT_USER_TOKEN) {
      return jsonResponse(
        {
          success: false,
          error: "Tokens do Runrun.it ausentes.",
        },
        500,
      );
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
        },
      },
    );

    const jobName = "discover_projects";

    // Tamanho padrão de cada página.
    // Limitado a 100 para evitar respostas muito grandes.
    const batchSize = 100;

    // Garante que o controle exista.
    await supabase
      .from("sync_control")
      .upsert(
        {
          job_name: jobName,
          last_offset: 0,
          batch_size: batchSize,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "job_name",
          ignoreDuplicates: true,
        },
      );

    let offset = 0;
    let nextUrl: string | null = null;

    let totalProjectsChecked = 0;
    let totalNewProjectsFound = 0;
    let totalUpdatedOpenProjects = 0;
    let totalUpsertedProjects = 0;
    let totalOpenProjectsFound = 0;
    let totalOpenWithDesiredDateFound = 0;
    let totalClosedProjectsFound = 0;

    let batchesProcessed = 0;
    let totalRunrunAttempts = 0;
    let totalRunrunRequestMs = 0;
    let lastRunrunStatus = 0;

    while (true) {
      const url = nextUrl ??
        `https://runrun.it/api/v1.0/projects?filter_id=open&limit=${batchSize}&offset=0`;

      console.log(
        `Consultando Runrun.it: offset=${offset}, batch_size=${batchSize}`,
      );

      const runrunStartedAt = Date.now();

      const runrunResult = await fetchRunrunProjectsPage(url, {
        "Version": "HTTP/1.0",
        "App-Key": RUNRUNIT_APP_TOKEN,
        "User-Token": RUNRUNIT_USER_TOKEN,
        "Content-Type": "application/json",
      });

      const runrunRequestMs = Date.now() - runrunStartedAt;
      totalRunrunAttempts += runrunResult.attempts;
      totalRunrunRequestMs += runrunRequestMs;
      lastRunrunStatus = runrunResult.status;

      console.log(
        `Runrun.it resposta: offset=${offset}, status=${runrunResult.status}, tentativas=${runrunResult.attempts}, duração=${runrunRequestMs}ms`,
      );

      if (!runrunResult.ok) {
        return jsonResponse(
          {
            success: false,
            error: runrunResult.status === 0
              ? `Falha de rede/timeout ao consultar projetos no Runrun.it (offset ${offset}, ${runrunResult.attempts} tentativas).`
              : `Runrun.it respondeu HTTP ${runrunResult.status} no offset ${offset} após ${runrunResult.attempts} tentativa(s).`,
            status: runrunResult.status || undefined,
            attempts: runrunResult.attempts,
            offset_failed: offset,
            batches_processed: batchesProcessed,
            projects_processed_before_error: totalProjectsChecked,
            body_preview: runrunResult.text.slice(0, 1000),
            total_runrun_attempts: totalRunrunAttempts,
            total_runrun_request_ms: totalRunrunRequestMs,
          },
          502,
        );
      }

      const responseText = runrunResult.text;
      let projects: any[];

      try {
        projects = JSON.parse(responseText);
      } catch (_e) {
        return jsonResponse(
          {
            success: false,
            error: "Resposta do Runrun.it não é JSON válido.",
            attempts: runrunResult.attempts,
            offset_failed: offset,
            batches_processed: batchesProcessed,
            projects_processed_before_error: totalProjectsChecked,
            body_preview: responseText.slice(0, 1000),
          },
          502,
        );
      }

      if (!Array.isArray(projects)) {
        return jsonResponse(
          {
            success: false,
            error:
              "Resposta inesperada do Runrun.it. Esperado array de projetos.",
            offset_failed: offset,
            batches_processed: batchesProcessed,
            projects_processed_before_error: totalProjectsChecked,
            body_preview: responseText.slice(0, 1000),
          },
          502,
        );
      }

      // Nenhum projeto retornado = fim da paginação.
      if (projects.length === 0) {
        console.log(
          `Fim da descoberta. Nenhum projeto em offset=${offset}.`,
        );

        break;
      }

      // O Runrun.it normalmente retorna até 100.
      // Mesmo assim, limitamos localmente ao batchSize.
      const projectsBatch = projects.slice(0, batchSize);

      batchesProcessed += 1;
      totalProjectsChecked += projectsBatch.length;

      console.log(
        `Lote ${batchesProcessed}: ${projectsBatch.length} projetos em offset=${offset}`,
      );

      const ids = projectsBatch
        .map((p) => Number(p.id))
        .filter((id) => Number.isFinite(id));

      let existingById = new Map<number, any>();

      if (ids.length > 0) {
        const { data: existingRows, error: existingError } =
          await supabase
            .from("runrunit_projects")
            .select(
              "runrunit_project_id,is_tracking_enabled,is_new_candidate,discovered_at,closed_detected_at",
            )
            .in("runrunit_project_id", ids);

        if (existingError) {
          return jsonResponse(
            {
              success: false,
              error: "Erro ao consultar projetos existentes.",
              details: existingError,
              offset_failed: offset,
              batches_processed: batchesProcessed,
              projects_processed_before_error: totalProjectsChecked,
            },
            500,
          );
        }

        existingById = new Map(
          (existingRows ?? []).map((row: any) => [
            Number(row.runrunit_project_id),
            row,
          ]),
        );
      }

      const rows = projectsBatch.map((project) => {
        const id = Number(project.id);
        const existing = existingById.get(id);

        return toProjectRow(project, existing);
      });

      let batchNewProjectsFound = 0;
      let batchUpdatedOpenProjects = 0;
      let batchOpenProjectsFound = 0;
      let batchOpenWithDesiredDateFound = 0;
      let batchClosedProjectsFound = 0;

      for (const row of rows) {
        if (row.is_open) {
          batchOpenProjectsFound += 1;

          if (row.desired_delivery_date !== null) {
            batchOpenWithDesiredDateFound += 1;
          }
        } else {
          batchClosedProjectsFound += 1;
        }

        const existed = existingById.has(
          Number(row.runrunit_project_id),
        );

        if (
          !existed &&
          row.is_open &&
          row.desired_delivery_date !== null
        ) {
          batchNewProjectsFound += 1;
        }

        if (existed && row.is_open) {
          batchUpdatedOpenProjects += 1;
        }
      }

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("runrunit_projects")
          .upsert(rows, {
            onConflict: "runrunit_project_id",
          });

        if (upsertError) {
          return jsonResponse(
            {
              success: false,
              error: "Erro ao salvar projetos no Supabase.",
              details: upsertError,
              offset_failed: offset,
              batches_processed: batchesProcessed,
              projects_processed_before_error: totalProjectsChecked,
            },
            500,
          );
        }
      }

      totalUpsertedProjects += rows.length;
      totalNewProjectsFound += batchNewProjectsFound;
      totalUpdatedOpenProjects += batchUpdatedOpenProjects;
      totalOpenProjectsFound += batchOpenProjectsFound;
      totalOpenWithDesiredDateFound +=
        batchOpenWithDesiredDateFound;
      totalClosedProjectsFound += batchClosedProjectsFound;

      // Paginação oficial do Runrun.it usando o header Link: rel="next".
      const nextLink = runrunResult.headers.get("Link")
        ?.match(/<([^>]+)>;\s*rel="next"/i)?.[1] ?? null;

      nextUrl = nextLink
        ? new URL(nextLink, "https://runrun.it").toString()
        : null;

      if (!nextUrl) {
        console.log(
          `Fim da descoberta. Não há header Link com rel="next" após lote ${batchesProcessed}.`,
        );
        break;
      }

      console.log(`Próxima página pelo Link: ${nextUrl}`);
      offset += projectsBatch.length;
    }

    const finishedAt = new Date().toISOString();

    // sync_control agora serve como controle da execução,
    // e não como mecanismo para continuar a paginação.
    const { error: updateControlError } = await supabase
      .from("sync_control")
      .update({
        last_offset: 0,
        batch_size: batchSize,
        last_run_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("job_name", jobName);

    if (updateControlError) {
      console.error(
        "Erro ao atualizar sync_control:",
        updateControlError,
      );

      // Os projetos já foram sincronizados.
      // Não transformamos isso em falha da descoberta.
    }

    await supabase
      .from("dashboard_sync_status")
      .upsert(
        {
          sync_name: "discover_projects",
          last_run_at: finishedAt,
          last_result: {
            mode: "full_discover",
            projects_checked: totalProjectsChecked,
            new_projects_found: totalNewProjectsFound,
            updated_open_projects: totalUpdatedOpenProjects,
            upserted_projects: totalUpsertedProjects,
            open_projects_found: totalOpenProjectsFound,
            open_with_desired_date_found:
              totalOpenWithDesiredDateFound,
            closed_projects_found: totalClosedProjectsFound,
            batches_processed: batchesProcessed,
            reached_end: true,
            total_runrun_attempts: totalRunrunAttempts,
            total_runrun_request_ms: totalRunrunRequestMs,
            last_runrun_status: lastRunrunStatus,
          },
          updated_at: finishedAt,
        },
        {
          onConflict: "sync_name",
        },
      );

    return jsonResponse({
      success: true,
      mode: "full_discover",
      message:
        "Descoberta completa de projetos executada. " +
        "Não sincroniza tarefas/alocações.",

      rule:
        "desired_delivery_date usa somente desired_date do Runrun.it; " +
        "estimated_delivery_date é ignorado.",

      batch_size: batchSize,
      batches_processed: batchesProcessed,

      projects_processed: totalProjectsChecked,
      new_projects: totalNewProjectsFound,
      updated_projects: totalUpdatedOpenProjects,
      upserted_projects: totalUpsertedProjects,

      open_projects_found: totalOpenProjectsFound,
      open_with_desired_date_found:
        totalOpenWithDesiredDateFound,
      closed_projects_found: totalClosedProjectsFound,

      reached_end: true,
      final_offset: offset,

      runrun: {
        total_attempts: totalRunrunAttempts,
        total_request_ms: totalRunrunRequestMs,
        last_status: lastRunrunStatus,
      },

      errors: [],
    });
  } catch (error) {
    console.error(
      "sync-runrunit-discover-projects error",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
});