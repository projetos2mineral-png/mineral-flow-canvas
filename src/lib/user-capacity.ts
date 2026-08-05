import { supabase } from "@/integrations/supabase/client";
import { LaneHoursSource } from "./kanban-capacity";

export interface UserCapacity {
  id: string;
  user_name: string;
  reference_month: string;
  capacity_hours: number;
}

/**
 * Busca a capacidade de um responsável para um mês específico.
 */
export async function fetchUserCapacity(userName: string, referenceMonth: string): Promise<UserCapacity | null> {
  const { data, error } = await (supabase as any)
    .from("dashboard_user_capacity")
    .select("*")
    .eq("user_name", userName)
    .eq("reference_month", referenceMonth)
    .maybeSingle();

  if (error) {
    console.error("Error fetching capacity:", error);
    return null;
  }
  return data as UserCapacity;
}

/**
 * Salva ou atualiza a capacidade de um responsável.
 */
export async function upsertUserCapacity(userName: string, referenceMonth: string, hours: number) {
  const { error } = await (supabase as any)
    .from("dashboard_user_capacity")
    .upsert(
      { 
        user_name: userName, 
        reference_month: referenceMonth, 
        capacity_hours: hours,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_name,reference_month" }
    );

  if (error) throw error;
}

/**
 * Busca todas as capacidades de um responsável.
 */
export async function fetchAllUserCapacities(userName: string): Promise<UserCapacity[]> {
  const { data, error } = await (supabase as any)
    .from("dashboard_user_capacity")
    .select("*")
    .eq("user_name", userName);

  if (error) {
    console.error("Error fetching all capacities:", error);
    return [];
  }
  return (data as any[])?.map(d => d as UserCapacity) ?? [];
}

