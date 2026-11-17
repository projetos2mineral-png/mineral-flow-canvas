import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WorkedHoursImportActionResult =
  | {
      ok: true;
      importId: string;
      status: "completed" | "completed_with_warnings";
      periodStart: string;
      periodEnd: string;
      includesPreviousMonth: boolean;
      rowsReceived: number;
      rowsUpserted: number;
      rowsChanged: number;
      rowsWithoutUser: number;
      rowsWithoutMapping: number;
    }
  | { ok: false; error: string };

/**
 * Disparo manual (lider/admin) da importação de horas.
 * Não é chamado automaticamente em nenhum carregamento de tela.
 */
export const importWorkedHoursNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkedHoursImportActionResult> => {
    try {
      const { readWorkedHoursEnv, runWorkedHoursImport } = await import("./import.server");
      const { createClient } = await import("@supabase/supabase-js");
      const env = readWorkedHoursEnv();
      const db = createClient(env.url, env.serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      });

      const { data: me, error } = await db
        .from("dashboard_users")
        .select("access_level")
        .eq("auth_user_id", context.userId)
        .maybeSingle();
      if (error) throw new Error(`Não foi possível validar o acesso: ${error.message}`);

      const level = (me as { access_level?: string } | null)?.access_level;
      if (level !== "lider" && level !== "administrador") {
        return { ok: false, error: "Apenas líderes e administradores podem importar horas." };
      }

      const result = await runWorkedHoursImport({ triggerSource: "manual" });
      return { ok: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  });
