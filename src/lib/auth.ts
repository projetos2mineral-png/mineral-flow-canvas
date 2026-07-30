import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ---------- Access levels (RBAC) ----------
export type AccessLevel = "comum" | "lider" | "administrador";

export type CurrentDashboardUser = {
  id: string;
  email: string;
  name: string;
  access_level: AccessLevel;
  auth_user_id: string;
};

export function useCurrentDashboardUser() {
  const { user, loading: authLoading } = useAuthSession();
  const [me, setMe] = useState<CurrentDashboardUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setMe(null);
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("dashboard_users")
        .select("id,email,name,access_level,auth_user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setMe({
          id: data.id,
          email: data.email,
          name: data.name,
          access_level: (data.access_level as AccessLevel) ?? "comum",
          auth_user_id: data.auth_user_id,
        });
      } else {
        setMe({
          id: "",
          email: user.email ?? "",
          name: user.email?.split("@")[0] ?? "usuário",
          access_level: "comum",
          auth_user_id: user.id,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const level: AccessLevel = me?.access_level ?? "comum";
  const canManageUsers = level === "administrador";
  const canSelectProjects = level === "administrador";
  const canUseCalendar = level === "lider" || level === "administrador";
  const canEditDashboard = level === "lider" || level === "administrador";

  return {
    me,
    level,
    loading: authLoading || loading,
    canManageUsers,
    canSelectProjects,
    canUseCalendar,
    canEditDashboard,
  };
}