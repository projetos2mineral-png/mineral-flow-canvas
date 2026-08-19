import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

import { Toaster } from "@/components/ui/sonner";
import { LayoutDashboard, ListChecks, LogOut, CalendarDays, Moon, Sun, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession, signOut, useCurrentDashboardUser } from "@/lib/auth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DB Projetos · Mineral Geologia" },
      { name: "description", content: "Dashboard interno de projetos da Mineral Geologia, integrado ao Runrun.it." },
      { name: "author", content: "Mineral Geologia" },
      { property: "og:title", content: "DB Projetos · Mineral Geologia" },
      { property: "og:description", content: "Dashboard interno de projetos da Mineral Geologia, integrado ao Runrun.it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "DB Projetos · Mineral Geologia" },
      { name: "twitter:description", content: "Dashboard interno de projetos da Mineral Geologia, integrado ao Runrun.it." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e137ad61-3135-4ad2-a9f7-6f5a0aeec0aa/id-preview-ad2fca49--2f348948-8e8e-4f98-813e-aec9ed877e76.lovable.app-1783022251795.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e137ad61-3135-4ad2-a9f7-6f5a0aeec0aa/id-preview-ad2fca49--2f348948-8e8e-4f98-813e-aec9ed877e76.lovable.app-1783022251795.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const { user } = useAuthSession();
  const { me, level, canUseCalendar, canSelectProjects, canManageUsers } = useCurrentDashboardUser();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Bom dia";
    if (hour >= 12 && hour < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  const displayName = me?.name || "usuário";


  // Avoid any server/client branch until hydration is complete so the first
  // client render always matches the SSR output.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Badge de novos usuários (só faz sentido para administradores).
  const { data: latestUserAt } = useQuery({
    queryKey: ["dashboard", "users", "latest_created_at"],
    enabled: canManageUsers,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dashboard_users")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return (data?.created_at as string | null) ?? null;
    },
  });
  const [lastSeenUsersAt, setLastSeenUsersAt] = useState<number>(0);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("last_seen_users_at");
      setLastSeenUsersAt(raw ? Number(raw) : 0);
    } catch {
      /* ignore */
    }
  }, [path]);
  const hasNewUsers = Boolean(
    canManageUsers &&
      latestUserAt &&
      new Date(latestUserAt).getTime() > lastSeenUsersAt
  );

  // Theme toggle (light/dark). Persists in localStorage.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = (localStorage.getItem("theme") as "light" | "dark" | null) ?? "light";
    setTheme(stored);
    document.documentElement.classList.toggle("dark", stored === "dark");
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
    }
  };

  // Invalidate everything on auth changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const isAuthRoute = path.startsWith("/auth") || path.startsWith("/reset-password");
  if (mounted && isAuthRoute) {
    return (
      <>
        <div className="fixed top-3 right-3 z-30">
          <button
            onClick={toggleTheme}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-card border border-border text-foreground hover:bg-accent transition-colors"
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Claro" : "Escuro"}
          </button>
        </div>
        <Outlet />
      </>
    );
  }

  const navItems: {
    to: string;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: boolean;
  }[] = [
    { to: "/dashboard", label: "Painel Geral", icon: LayoutDashboard },
  ];
  if (canUseCalendar) {
    navItems.push({ to: "/planejamento", label: "Calendário", icon: CalendarDays });
  }
  if (canSelectProjects) {
    navItems.push({ to: "/selecionar-projetos", label: "Selecionar Projetos", icon: ListChecks });
  }
  if (canManageUsers) {
    navItems.push({
      to: "/gerenciar-usuarios",
      label: "Gerenciar Usuários",
      icon: UsersRound,
      badge: hasNewUsers,
    });
  }
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center gap-6 px-6 h-14">
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active =
                path === item.to ||
                (item.to === "/dashboard" && path === "/") ||
                (item.to === "/planejamento" && path.startsWith("/calendario"));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {item.badge ? (
                    <span
                      className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none"
                      title="Há usuários novos"
                      aria-label="Há usuários novos"
                    >
                      !
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              aria-label="Alternar tema"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {user && (
              <TooltipProvider>
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground cursor-default hover:text-foreground transition-colors">
                        {greeting}, <span className="capitalize">{displayName}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="bg-neutral-900 text-white border-none shadow-md">
                      <p>Email: {user.email}</p>
                    </TooltipContent>
                  </Tooltip>
                  <button
                    onClick={async () => {
                      await signOut();
                      router.navigate({ to: "/auth" });
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Sair"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </button>
                </div>
              </TooltipProvider>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
