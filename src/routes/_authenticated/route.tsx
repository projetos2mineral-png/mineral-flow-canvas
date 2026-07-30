import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LoadingScreen } from "@/components/LoadingScreen";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });
      return { user: data.user };
    } catch (e: any) {
      if (e?.isRedirect) throw e;
      throw redirect({ to: "/auth" });
    }
  },
  pendingComponent: () => <LoadingScreen label="Verificando acesso…" />,
  component: () => <Outlet />,
});