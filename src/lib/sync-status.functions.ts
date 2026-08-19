
import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const updateSyncStatus = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { name: string; source: string } }) => {
    const { error } = await supabase
      .from("dashboard_sync_status")
      .upsert({
        sync_name: data.name,
        last_run_at: new Date().toISOString(),
        sync_source: data.source
      }, { onConflict: 'sync_name' });
    
    if (error) throw error;
    return { success: true };
  });
