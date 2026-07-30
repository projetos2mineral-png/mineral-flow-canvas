import type { ReactNode } from "react";
import { useCurrentDashboardUser, type AccessLevel } from "@/lib/auth";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

/**
 * Gate para renderizar conteúdo apenas para determinados níveis de acesso.
 * Se o usuário não estiver autorizado, mostra mensagem padrão em pt-BR e
 * um link de retorno ao Dashboard.
 */
export function RequireLevel({
  allow,
  children,
}: {
  allow: AccessLevel[];
  children: ReactNode;
}) {
  const { level, loading } = useCurrentDashboardUser();
  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!allow.includes(level)) {
    return (
      <div className="p-10 max-w-md mx-auto text-center space-y-3">
        <ShieldAlert className="h-10 w-10 mx-auto text-primary" />
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar esta página.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Voltar ao Dashboard
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}