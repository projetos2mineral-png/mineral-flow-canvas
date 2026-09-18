import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  GripVertical,
  Building2,
  FolderTree,
  Users,
  Clock,
  UserCircle2,
  MessageSquare,
  Send,
  ShieldCheck,
  AlertTriangle,
  GripHorizontal,
  CalendarDays,
  Search,
  ChevronLeft,
  ChevronRight,
  ListChecks,
} from "lucide-react";
import {
  fetchDashboardProjects,
  fetchLanes,
  fetchCards,
  fetchDashboardUsers,
  createLane,
  updateLane,
  deleteLane,
  upsertCard,
  bulkUpdateCardPositions,
  STATUSES,
  STATUS_LABEL,
  STATUS_CARD_CLASS,
  STATUS_DOT_CLASS,
  normalizeStatus,
  findLaneByTitle as findLaneByTitleLib,
  type DashboardProject,
  type Lane,
  type ProjectCardRow,
  type CardStatus,
  type DashboardUser,
} from "@/lib/dashboard";
import {
  fetchReviews,
  createReview,
  updateReview,
  type ReviewRow,
} from "@/lib/dashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DensityCycleButton, useKanbanDensity } from "@/components/dashboard/KanbanDensity";


import { useCurrentDashboardUser } from "@/lib/auth";
import {
  ensureDefaultMonthlyLanes,
  dedupeMonthlyLanes,
  isMonthlyLaneTitle,
  estimateSourceLabel,
  monthlyTitleToDateISO,
} from "@/lib/dashboard";

import { Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { sumLaneEstimatedHours, formatHoursCompact, isOverCapacity, getCapacityExcess } from "@/lib/kanban-capacity";
import { fetchUserCapacity, upsertUserCapacity, type UserCapacity } from "@/lib/user-capacity";


import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


import { supabase } from "@/integrations/supabase/client";
import { fetchManualDemands } from "@/lib/manual-demands";
import { buildDemandBoardCards, type DemandBoardCard } from "@/lib/dashboard-demands";
import { DemandCardView } from "@/components/dashboard/DemandCardView";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Central de Planejamento" },
      {
        name: "description",
        content: "Central de Planejamento — Kanban interno de acompanhamento dos projetos abertos no Runrun.it.",
      },
    ],
  }),
  component: DashboardPage,
});

const UNASSIGNED = "Sem responsável";

/**
 * Gera rótulos compactos para responsáveis.
 * - Usa primeiro nome quando não há ambiguidade.
 * - Quando há colisão de primeiro nome, adiciona inicial do segundo nome (Camila → Camila P.)
 *   e, se ainda colidir, usa segundo nome completo e assim por diante.
 * - Mantém nome completo em tooltip.
 */
function getCompactAssigneeDisplayNames(assignees: string[]): Map<string, string> {
  const result = new Map<string, string>();
  type Item = { original: string; tokens: string[] };
  const items: Item[] = assignees.map((a) => ({
    original: a,
    tokens: a.trim().split(/\s+/).filter(Boolean),
  }));

  // UNASSIGNED fica com rótulo completo — não entra no agrupamento por primeiro nome
  const toGroup: Item[] = [];
  for (const it of items) {
    if (it.original === UNASSIGNED) {
      result.set(it.original, it.original);
    } else {
      toGroup.push(it);
    }
  }

  const groups = new Map<string, Item[]>();
  for (const it of toGroup) {
    const key = (it.tokens[0] ?? "").toLowerCase();
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }

  for (const [, group] of groups) {
    if (group.length === 1) {
      const it = group[0];
      result.set(it.original, it.tokens[0] ?? it.original);
      continue;
    }
    // Candidatos progressivos por nível de desambiguação
    const candidateLists = new Map<string, string[]>();
    for (const it of group) {
      const t = it.tokens;
      const cands: string[] = [];
      cands.push(t[0] ?? "");
      if (t.length >= 2) {
        cands.push(`${t[0]} ${t[1].charAt(0).toUpperCase()}.`);
        cands.push(`${t[0]} ${t[1]}`);
        if (t.length >= 3) {
          cands.push(`${t[0]} ${t[1]} ${t[2].charAt(0).toUpperCase()}.`);
          cands.push(`${t[0]} ${t[1]} ${t[2]}`);
        }
        cands.push(it.original);
      } else {
        cands.push(it.original);
      }
      candidateLists.set(it.original, cands);
    }
    for (const it of group) {
      const cands = candidateLists.get(it.original)!;
      let picked = it.original;
      for (let lvl = 0; lvl < cands.length; lvl++) {
        const cand = cands[lvl];
        let collisions = 0;
        for (const other of group) {
          const otherCands = candidateLists.get(other.original)!;
          const otherCand = otherCands[lvl] ?? otherCands[otherCands.length - 1];
          if (otherCand === cand) collisions++;
        }
        if (collisions === 1) {
          picked = cand;
          break;
        }
      }
      result.set(it.original, picked);
    }
  }

  return result;
}

type DashboardCard = {
  key: string;
  runrunit_project_id: number;
  assignee_name: string;
  project: DashboardProject;
  card: ProjectCardRow | null;
  lane_id: string | null;
  status: CardStatus;
  position: number;
  internal_note: string | null;
  review_status: string | null;
  review_requested_by: string | null;
  review_requested_to: string | null;
  correction_note: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

function DashboardPage() {
  const qc = useQueryClient();
  const { level } = useCurrentDashboardUser();
  const readOnly = (level ?? "").toLowerCase() === "comum";
  const isAdmin = (level ?? "").toLowerCase() === "administrador";

  const projectsQ = useQuery({
    queryKey: ["dashboard", "projects"],
    queryFn: fetchDashboardProjects,
    staleTime: 30_000,
  });
  const lanesQ = useQuery({
    queryKey: ["dashboard", "lanes"],
    queryFn: fetchLanes,
    staleTime: 30_000,
  });
  const cardsQ = useQuery({
    queryKey: ["dashboard", "cards"],
    queryFn: fetchCards,
    staleTime: 30_000,
  });
  const usersQ = useQuery({
    queryKey: ["dashboard", "users"],
    queryFn: fetchDashboardUsers,
    staleTime: 60_000,
  });
  const reviewsQ = useQuery({
    queryKey: ["dashboard", "reviews"],
    queryFn: fetchReviews,
    staleTime: 30_000,
  });
  // Demandas Avulsas: cards derivados em tempo real (nada é gravado como card).
  const demandsQ = useQuery({
    queryKey: ["manual-demands"],
    queryFn: fetchManualDemands,
    staleTime: 30_000,
  });

  // Current logged-in user's display name (from dashboard_users)
  const [currentUserName, setCurrentUserName] = useState<string>("");
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) return;
      const match = (usersQ.data ?? []).find((u) => u.email === email);
      setCurrentUserName(match?.name ?? email.split("@")[0]);
    })();
  }, [usersQ.data]);

  const projects = projectsQ.data ?? [];
  const lanes = lanesQ.data ?? [];
  const cards = cardsQ.data ?? [];
  const users = usersQ.data ?? [];
  const reviews = reviewsQ.data ?? [];

  // Cards de Demandas Avulsas visíveis, já resolvidos por responsável e mês.
  const demandCards = useMemo(
    () => buildDemandBoardCards(demandsQ.data ?? [], users),
    [demandsQ.data, users]
  );

  const assignees = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) set.add(p.assignee_name ?? UNASSIGNED);
    for (const d of demandCards) set.add(d.assigneeName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [projects, demandCards]);

  const [activeAssignee, setActiveAssignee] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Posição vertical da barra de controles flutuante (reposicionável)
  const [controlsBottom, setControlsBottom] = useState(12);
  const controlsRef = useRef<HTMLDivElement>(null);
  const controlsDragRef = useRef<{ startY: number; startBottom: number } | null>(null);

  // Densidade global do Kanban (controlada na barra flutuante inferior)
  const { density, setDensity, vars: densityVars } = useKanbanDensity();

  // Nomes compactos + contadores por responsável (para a barra inferior)
  const assigneeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assignees) {
      const ids = new Set(
        projects
          .filter((p) => (p.assignee_name ?? UNASSIGNED) === a)
          .map((p) => p.runrunit_project_id)
      );
      m[a] = ids.size;
    }
    return m;
  }, [assignees, projects]);

  const compactNames = useMemo(
    () => getCompactAssigneeDisplayNames(assignees),
    [assignees]
  );

  // ---- Controle de rolagem horizontal do seletor de responsáveis (barra inferior) ----
  const assigneeScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateAssigneeEdges = useCallback(() => {
    const el = assigneeScrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    const el = assigneeScrollRef.current;
    if (!el) return;
    const update = () => updateAssigneeEdges();
    // Agendamento em próximo frame para garantir layout concluído
    const raf = requestAnimationFrame(update);
    const t = window.setTimeout(update, 80);
    const onScroll = () => updateAssigneeEdges();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const child = el.firstElementChild as HTMLElement | null;
    if (child) ro.observe(child);
    // Observa TabsList interno se existir (mudança de conteúdo altera scrollWidth)
    const tabsList = el.querySelector("[role='tablist']") as HTMLElement | null;
    if (tabsList) ro.observe(tabsList);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, [updateAssigneeEdges, assignees.length, compactNames]);

  // Rolagem horizontal com roda / touchpad sem prejudicar scroll vertical do Kanban
  useEffect(() => {
    const el = assigneeScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      // Converte roda vertical em rolagem horizontal quando sobre o seletor
      e.preventDefault();
      el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Mantém o responsável ativo sempre visível / centralizado
  useEffect(() => {
    const el = assigneeScrollRef.current;
    if (!el || !activeAssignee) return;
    const esc = typeof CSS !== "undefined" && (CSS as unknown as { escape?: (s: string) => string }).escape
      ? (CSS as unknown as { escape: (s: string) => string }).escape!(activeAssignee)
      : activeAssignee.replace(/[^a-zA-Z0-9]/g, "\\$&");
    const target = el.querySelector<HTMLElement>(`[data-assignee-chip="${esc}"]`);
    if (!target) return;
    const left = target.offsetLeft - el.clientWidth / 2 + target.offsetWidth / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    // Atualiza estado das setas após centralizar
    window.setTimeout(() => updateAssigneeEdges(), 300);
  }, [activeAssignee, assignees.length, updateAssigneeEdges]);

  const nudgeAssignee = useCallback(
    (dir: -1 | 1) => {
      const el = assigneeScrollRef.current;
      if (!el) return;
      const amount = Math.max(180, el.clientWidth * 0.65);
      el.scrollBy({ left: dir * amount, behavior: "smooth" });
      // Garante atualização das setas mesmo se scroll suave não disparar imediatamente
      window.setTimeout(() => updateAssigneeEdges(), 350);
    },
    [updateAssigneeEdges]
  );

  const handleControlsPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      try {
        (target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      controlsDragRef.current = { startY: e.clientY, startBottom: controlsBottom };
      const onMove = (ev: PointerEvent) => {
        const drag = controlsDragRef.current;
        if (!drag) return;
        const deltaY = ev.clientY - drag.startY;
        const barH = controlsRef.current?.offsetHeight ?? 56;
        const minBottom = 12;
        const maxBottom = Math.max(minBottom, window.innerHeight - barH - 12);
        const next = Math.min(maxBottom, Math.max(minBottom, drag.startBottom - deltaY));
        setControlsBottom(next);
      };
      const onUp = (ev: PointerEvent) => {
        controlsDragRef.current = null;
        try {
          (target as HTMLElement).releasePointerCapture?.(ev.pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [controlsBottom]
  );

  // Restaura o último responsável aberto do localStorage (persistência
  // entre trocas de aba/página). Só cai no primeiro alfabético como
  // último recurso.
  useEffect(() => {
    if (assignees.length === 0) return;
    if (activeAssignee && assignees.includes(activeAssignee)) return;
    let saved: string | null = null;
    try {
      saved = typeof window !== "undefined"
        ? window.localStorage.getItem("last_dashboard_assignee")
        : null;
    } catch {
      /* ignore */
    }
    if (saved && assignees.includes(saved)) {
      setActiveAssignee(saved);
    } else {
      setActiveAssignee(assignees[0]);
    }
  }, [assignees, activeAssignee]);

  useEffect(() => {
    if (!activeAssignee) return;
    try {
      window.localStorage.setItem("last_dashboard_assignee", activeAssignee);
    } catch {
      /* ignore */
    }
  }, [activeAssignee]);

  const loading = projectsQ.isLoading || lanesQ.isLoading || cardsQ.isLoading;
  const error = projectsQ.error || lanesQ.error || cardsQ.error;

  // Ao aparecer um responsável pela primeira vez no Dashboard, criar filas
  // mensais padrão (Julho/2026 … Dezembro/2026) automaticamente. Não roda
  // para usuários somente-leitura para evitar escrever no banco sem permissão.
  useEffect(() => {
    if (readOnly) return;
    if (assignees.length === 0) return;
    (async () => {
      let anyCreated = false;
      // Primeiro, consolida duplicatas eventualmente existentes.
      try {
        const cleaned = await dedupeMonthlyLanes(lanes);
        if (cleaned) anyCreated = true;
      } catch {
        /* ignore */
      }
      for (const a of assignees) {
        if (a === UNASSIGNED) continue;
        try {
          const c = await ensureDefaultMonthlyLanes(a, lanes);
          if (c) anyCreated = true;
        } catch {
          /* silencioso — segue para os próximos */
        }
      }
      if (anyCreated) {
        qc.invalidateQueries({ queryKey: ["dashboard", "lanes"] });
        qc.invalidateQueries({ queryKey: ["dashboard", "cards"] });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignees.join("|"), readOnly]);

  // Reviewer choices: prefer dashboard_users.name (active), else assignees
  const reviewerOptions = useMemo(() => {
    const fromUsers = users.filter((u) => u.is_active !== false).map((u) => u.name);
    const fromAssignees = assignees.filter((a) => a !== UNASSIGNED);
    const set = new Set<string>([...fromUsers, ...fromAssignees]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [users, assignees]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {readOnly && (
        <div className="px-6 py-3 border-b border-border bg-card/40">
          <div className="inline-flex items-center gap-2 text-xs rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            Modo somente leitura — você não tem permissão para editar filas ou cards.
          </div>
        </div>
      )}

      {error && (
        <div className="p-6 text-sm text-destructive">
          Erro ao carregar dashboard: {(error as Error).message}
        </div>
      )}

      {loading && (
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      )}

      {!loading && assignees.length === 0 && (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Nenhum projeto marcado para exibição.{" "}
          <span className="underline">Selecione projetos</span> na página
          “Selecionar Projetos” para começar.
        </div>
      )}

      {!loading && assignees.length > 0 && (
        <Tabs
          value={activeAssignee}
          onValueChange={setActiveAssignee}
          className="flex-1 flex flex-col min-h-0 relative pb-[84px]"
          style={densityVars as React.CSSProperties}
        >
          {assignees.map((a) => (
            <TabsContent
              key={a}
              value={a}
              className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
            >
              <AssigneeBoard
                assignee={a}
                projects={projects.filter((p) => (p.assignee_name ?? UNASSIGNED) === a)}
                lanes={lanes.filter((l) => l.assignee_name === a)}
                cards={cards.filter((c) => c.assignee_name === a)}
                reviews={reviews.filter((r) => r.reviewer_name === a && r.review_status === "aguardando revisão")}
                demandCards={demandCards.filter((d) => d.assigneeName === a)}
                allLanes={lanes}
                reviewerOptions={reviewerOptions}
                currentUserName={currentUserName}
                qc={qc}
                readOnly={readOnly}
                isAdmin={isAdmin}
                isActive={a === activeAssignee}
                search={search}
                densityVars={densityVars}
              />
            </TabsContent>
          ))}
          {/* Painel flutuante inferior — [ Busca ] | [ < responsáveis > ] | [ modo ] */}
          <div
            ref={controlsRef}
            className="pointer-events-none fixed left-1/2 z-50 flex w-full -translate-x-1/2 justify-center px-3 sm:px-4"
            style={{ bottom: controlsBottom }}
          >
            <div className="pointer-events-auto flex w-full max-w-[min(96vw,1180px)] items-center gap-1.5 sm:gap-2 rounded-full border border-border/40 bg-card/95 px-2 sm:px-2.5 py-1.5 shadow-lg backdrop-blur-md">
              {/* Handle discreto para reposicionamento vertical */}
              <div
                role="button"
                aria-label="Arraste para reposicionar a barra"
                title="Arraste para reposicionar"
                onPointerDown={handleControlsPointerDown}
                className="shrink-0 flex items-center justify-center h-7 w-6 rounded-full hover:bg-accent/60 cursor-grab active:cursor-grabbing touch-none select-none text-muted-foreground/40 hover:text-muted-foreground/70"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </div>
              <div className="h-5 w-px shrink-0 bg-border/30 hidden sm:block" aria-hidden="true" />
              {/* Busca — compacta, placeholder completo em tooltip */}
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por título, processo, OS, cliente ou responsável"
                  title="Buscar por título, processo, OS, cliente ou responsável"
                  className="h-7 w-[128px] sm:w-[168px] lg:w-[195px] pl-7 pr-7 text-[13px] bg-background border-border/60 focus-visible:ring-1 rounded-full placeholder:text-muted-foreground/70 placeholder:truncate"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    aria-label="Limpar busca"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="h-5 w-px shrink-0 bg-border/30 hidden sm:block" aria-hidden="true" />

              {/* Seletor de responsáveis — área ampliada, setas funcionais e sincronizadas */}
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <button
                  type="button"
                  aria-label="Responsáveis anteriores"
                  onClick={() => nudgeAssignee(-1)}
                  disabled={!canScrollLeft}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/40 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-25 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="relative min-w-0 flex-1">
                  {canScrollLeft && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-card via-card/80 to-transparent" />
                  )}
                  {canScrollRight && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-card via-card/80 to-transparent" />
                  )}
                  <div
                    ref={assigneeScrollRef}
                    className="overflow-x-auto overflow-y-hidden [scrollbar-width:thin] [-ms-overflow-style:auto] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/60 [&::-webkit-scrollbar-track]:bg-transparent py-0.5"
                  >
                    <TabsList className="flex h-auto w-max items-center gap-1 bg-transparent p-0">
                      {assignees.map((a) => {
                        const count = assigneeCounts[a] ?? 0;
                        const short = compactNames.get(a) ?? a;
                        return (
                          <TabsTrigger
                            key={a}
                            value={a}
                            title={a}
                            data-assignee-chip={a}
                            className="group flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border/60 bg-background px-2.5 text-[11px] font-medium leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=active]:border-primary/20 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                          >
                            <span className="max-w-[110px] truncate">{short}</span>
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] leading-none text-muted-foreground group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground">
                              {count}
                            </span>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Próximos responsáveis"
                  onClick={() => nudgeAssignee(1)}
                  disabled={!canScrollRight}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/40 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-25 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="h-5 w-px shrink-0 bg-border/30 hidden sm:block" aria-hidden="true" />

              {/* Modo visual — botão único cíclico, minimalista */}
              <div className="shrink-0">
                <DensityCycleButton value={density} onChange={setDensity} />
              </div>
            </div>
          </div>
        </Tabs>
      )}
    </div>
  );
}

function AssigneeBoard({
  assignee,
  projects,
  lanes,
  cards,
  reviews,
  demandCards = [],
  allLanes,
  reviewerOptions,
  currentUserName,
  qc,
  readOnly = false,
  isAdmin = false,
  isActive = true,
  search = "",
  densityVars,
}: {
  assignee: string;
  projects: DashboardProject[];
  lanes: Lane[];
  cards: ProjectCardRow[];
  reviews: ReviewRow[];
  demandCards?: DemandBoardCard[];
  allLanes: Lane[];
  reviewerOptions: string[];
  currentUserName: string;
  qc: ReturnType<typeof useQueryClient>;
  readOnly?: boolean;
  isAdmin?: boolean;
  isActive?: boolean;
  search?: string;
  densityVars?: React.CSSProperties;
}) {
  const projectMap = useMemo(() => {
    const m = new Map<number, DashboardProject>();
    for (const p of projects) {
      if (!m.has(p.runrunit_project_id)) m.set(p.runrunit_project_id, p);
    }
    return m;
  }, [projects]);

  const cardByProject = useMemo(() => {
    const m = new Map<number, ProjectCardRow>();
    for (const c of cards) m.set(c.runrunit_project_id, c);
    return m;
  }, [cards]);

  // Project name lookup for review demands (which may reference projects not in this assignee's set)
  const projectNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of projects) m.set(p.runrunit_project_id, p.project_name);
    return m;
  }, [projects]);

  const UNASSIGNED_LANE = "__unassigned__";
  const normalizedSearch = (search ?? "").trim().toLowerCase();

  const lanesSorted = useMemo(
    () => [...lanes].sort((a, b) => a.position - b.position),
    [lanes]
  );

  // Local lane order (for optimistic horizontal drag)
  const [localLanes, setLocalLanes] = useState<Lane[]>(lanesSorted);
  useEffect(() => setLocalLanes(lanesSorted), [lanesSorted]);

  // Reviews grouped by lane (reviewer's lane). If lane_id is null or not in this assignee's lanes, send to unassigned.
  const reviewsByLane = useMemo(() => {
    const m = new Map<string, ReviewRow[]>();
    m.set(UNASSIGNED_LANE, []);
    for (const l of localLanes) m.set(l.id, []);
    for (const r of reviews) {
      if (normalizedSearch) {
        const projectName = projectNameById.get(r.runrunit_project_id) ?? "";
        const haystack = [projectName, r.original_assignee_name, r.reviewer_name, r.requested_by_name, String(r.runrunit_project_id)].join(" ").toLowerCase();
        if (!haystack.includes(normalizedSearch)) continue;
      }
      const key = r.lane_id && m.has(r.lane_id) ? r.lane_id : UNASSIGNED_LANE;
      m.get(key)!.push(r);
    }
    return m;
  }, [reviews, localLanes, normalizedSearch, projectNameById]);

  // Demandas Avulsas agrupadas pela fila mensal derivada de `desired_date`.
  // Sem fila correspondente, o card cai em "Sem fila" (nunca some).
  const demandsByLane = useMemo(() => {
    const m = new Map<string, DemandBoardCard[]>();
    m.set(UNASSIGNED_LANE, []);
    for (const l of localLanes) m.set(l.id, []);
    const laneIdByTitle = new Map(
      localLanes.map((l) => [l.title.trim().toLowerCase(), l.id])
    );
    for (const d of demandCards) {
      if (normalizedSearch) {
        const haystack = [
          d.demand.name,
          d.demand.client_name ?? "",
          d.assigneeName,
          ...d.people.map((p) => p.name),
          d.demand.desired_date,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) continue;
      }
      const laneId = laneIdByTitle.get(d.laneTitle.trim().toLowerCase());
      m.get(laneId && m.has(laneId) ? laneId : UNASSIGNED_LANE)!.push(d);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) =>
        a.demand.desired_date === b.demand.desired_date
          ? a.demand.name.localeCompare(b.demand.name, "pt-BR")
          : a.demand.desired_date < b.demand.desired_date
            ? -1
            : 1
      );
    }
    return m;
  }, [demandCards, localLanes, normalizedSearch]);


  const hydrated: DashboardCard[] = useMemo(() => {
    const out: DashboardCard[] = [];
    for (const p of projectMap.values()) {
      const c = cardByProject.get(p.runrunit_project_id) ?? null;
      out.push({
        key: `${p.runrunit_project_id}`,
        runrunit_project_id: p.runrunit_project_id,
        assignee_name: assignee,
        project: p,
        card: c,
        lane_id: c?.lane_id ?? null,
        status: normalizeStatus(c?.status),
        position: c?.position ?? 0,
        internal_note: c?.internal_note ?? null,
        review_status: c?.review_status ?? null,
        review_requested_by: c?.review_requested_by ?? null,
        review_requested_to: c?.review_requested_to ?? null,
        correction_note: c?.correction_note ?? null,
        updated_by: c?.updated_by ?? null,
        updated_at: c?.updated_at ?? null,
      });
    }
    return out;
  }, [projectMap, cardByProject, assignee]);

  const [items, setItems] = useState<DashboardCard[]>(hydrated);
  useEffect(() => setItems(hydrated), [hydrated]);

  const grouped = useMemo(() => {
    const m = new Map<string, DashboardCard[]>();
    m.set(UNASSIGNED_LANE, []);
    for (const l of localLanes) m.set(l.id, []);
    for (const it of items) {
      if (normalizedSearch) {
        const p = it.project;
        const haystack = [
          p.project_name,
          p.client_name ?? "",
          p.project_group_name ?? "",
          p.assignee_name ?? "",
          p.team_name ?? "",
          String(p.runrunit_project_id),
          it.status,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) continue;
      }
      const key = it.lane_id && m.has(it.lane_id) ? it.lane_id : UNASSIGNED_LANE;
      m.get(key)!.push(it);
    }
    // Ordenação automática por "Data de entrega desejada" (desired_delivery_date)
    // para TODAS as filas, da mais próxima para a mais distante.
    // Cards com posição manual (manually_positioned) mantêm exatamente a
    // posição onde foram soltos e prevalecem sobre a ordenação automática.
    for (const [laneId, arr] of m) {
      const manual = arr.filter((c) => c.card?.manually_positioned === true);
      const auto = arr.filter((c) => c.card?.manually_positioned !== true);
      manual.sort((a, b) => a.position - b.position);
      auto.sort((a, b) => {
        const da = a.project.desired_delivery_date ?? "9999-12-31";
        const db = b.project.desired_delivery_date ?? "9999-12-31";
        if (da !== db) return da < db ? -1 : 1;
        return a.project.project_name.localeCompare(
          b.project.project_name,
          "pt-BR"
        );
      });
      m.set(laneId, [...manual, ...auto]);
    }
    return m;
  }, [items, localLanes, normalizedSearch]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeCard = activeId ? items.find((i) => i.key === activeId) ?? null : null;

  // ---- Persistência + barra horizontal flutuante do Kanban (sincronizada) ----
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const kanbanProxyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [kanbanContentWidth, setKanbanContentWidth] = useState(0);
  const kanbanSyncingRef = useRef(false);
  const scrollStorageKey = `dashboard:scroll:${assignee}`;

  // Mede largura real das colunas para a barra proxy flutuante
  useEffect(() => {
    if (!innerRef.current) return;
    const el = innerRef.current;
    const update = () => setKanbanContentWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Observa também filhos — mudança de lanes/cards altera largura
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [lanes.length, cards.length, reviews.length, demandCards?.length]);

  // Restaura scroll salvo quando a aba fica ativa (sincroniza também a proxy)
  useLayoutEffect(() => {
    if (!isActive) return;
    try {
      const raw = localStorage.getItem(scrollStorageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { x?: number; y?: number; winY?: number };
        if (mainScrollRef.current) {
          if (typeof saved.x === "number") mainScrollRef.current.scrollLeft = saved.x;
          if (typeof saved.y === "number") mainScrollRef.current.scrollTop = saved.y;
        }
        if (kanbanProxyRef.current && typeof saved.x === "number") {
          kanbanProxyRef.current.scrollLeft = saved.x;
        }
        if (typeof saved.winY === "number") {
          window.scrollTo({ top: saved.winY });
        }
      }
    } catch {
      /* ignore */
    }
  }, [isActive, scrollStorageKey, kanbanContentWidth]);

  // Salva posição vertical da página também
  useEffect(() => {
    if (!isActive) return;
    const save = () => {
      const el = mainScrollRef.current;
      try {
        localStorage.setItem(
          scrollStorageKey,
          JSON.stringify({
            x: el?.scrollLeft ?? 0,
            y: el?.scrollTop ?? 0,
            winY: window.scrollY,
          })
        );
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [isActive, scrollStorageKey]);

  const onMainScroll = () => {
    if (kanbanSyncingRef.current) return;
    kanbanSyncingRef.current = true;
    const el = mainScrollRef.current;
    const proxy = kanbanProxyRef.current;
    if (el && proxy) {
      const elMax = Math.max(1, el.scrollWidth - el.clientWidth);
      const proxyMax = Math.max(1, proxy.scrollWidth - proxy.clientWidth);
      // Sincroniza proporcionalmente — evita descompasso quando larguras visíveis diferem
      proxy.scrollLeft = (el.scrollLeft / elMax) * proxyMax;
    }
    if (el) {
      try {
        localStorage.setItem(
          scrollStorageKey,
          JSON.stringify({ x: el.scrollLeft, y: el.scrollTop, winY: window.scrollY })
        );
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(() => {
      kanbanSyncingRef.current = false;
    });
  };

  const onKanbanProxyScroll = () => {
    if (kanbanSyncingRef.current) return;
    kanbanSyncingRef.current = true;
    const el = mainScrollRef.current;
    const proxy = kanbanProxyRef.current;
    if (el && proxy) {
      const elMax = Math.max(1, el.scrollWidth - el.clientWidth);
      const proxyMax = Math.max(1, proxy.scrollWidth - proxy.clientWidth);
      el.scrollLeft = (proxy.scrollLeft / proxyMax) * elMax;
      try {
        localStorage.setItem(
          scrollStorageKey,
          JSON.stringify({ x: el.scrollLeft, y: el.scrollTop, winY: window.scrollY })
        );
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(() => {
      kanbanSyncingRef.current = false;
    });
  };
  // ---- fim persistência / proxy ----

  // Modal states
  const [openCard, setOpenCard] = useState<DashboardCard | null>(null);
  const [reviewCard, setReviewCard] = useState<DashboardCard | null>(null);
  const [correctionReview, setCorrectionReview] = useState<ReviewRow | null>(null);

  const findContainer = (id: string): string | null => {
    if (id.startsWith("lane:")) return id.slice(5);
    if (id.startsWith("laneItem:")) return null;
    const it = items.find((i) => i.key === id);
    if (!it) return null;
    return it.lane_id && grouped.has(it.lane_id) ? it.lane_id : UNASSIGNED_LANE;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id);
    if (activeKey.startsWith("laneItem:")) return; // handled in onDragEnd
    // Mantém preview visual mínimo; a lógica de preservação exata de posição
    // e de prevalência manual é resolvida integralmente no onDragEnd
    // usando a ordem exibida (manual primeiro + data). Não mutamos lane aqui
    // para que findContainer/toIdx no onDragEnd reflitam a posição visual
    // exata onde o card foi solto.
    const fromLane = findContainer(String(active.id));
    const toLane = findContainer(String(over.id));
    if (!fromLane || !toLane || fromLane === toLane) return;
    // Sem mutação otimista de lane_id aqui — evita inconsistência entre
    // ordem exibida (agrupada por data) e índices de drop.
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);

    // Horizontal lane reorder
    if (activeKey.startsWith("laneItem:")) {
      if (!overKey.startsWith("laneItem:")) return;
      const fromId = activeKey.slice("laneItem:".length);
      const toId = overKey.slice("laneItem:".length);
      const fromIdx = localLanes.findIndex((l) => l.id === fromId);
      const toIdx = localLanes.findIndex((l) => l.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      const next = arrayMove(localLanes, fromIdx, toIdx);
      setLocalLanes(next);
      try {
        for (let i = 0; i < next.length; i++) {
          if (next[i].position !== i) {
            await updateLane(next[i].id, { position: i });
          }
        }
        qc.invalidateQueries({ queryKey: ["dashboard", "lanes"] });
      } catch (err) {
        toast.error("Falha ao reordenar filas: " + (err as Error).message);
        qc.invalidateQueries({ queryKey: ["dashboard", "lanes"] });
      }
      return;
    }

    const toLane = findContainer(overKey);
    if (!toLane) return;

    const activeCard = items.find((i) => i.key === activeKey);
    if (!activeCard) return;

    const fromLane = activeCard.lane_id && grouped.has(activeCard.lane_id) ? activeCard.lane_id : UNASSIGNED_LANE;

    // Ordem exibida da fila destino (manual prevalece + auto por data) — é exatamente o que o usuário vê
    const destDisplayed = grouped.get(toLane) ?? [];

    let toIdx: number;
    if (overKey.startsWith("lane:")) {
      toIdx = destDisplayed.length;
    } else {
      toIdx = destDisplayed.findIndex((c) => c.key === overKey);
      if (toIdx === -1) {
        // Over pode ser card da mesma fila ou de outra; se não encontrado, anexa ao final
        toIdx = destDisplayed.length;
      }
    }

    let reordered: DashboardCard[];
    if (fromLane === toLane) {
      const fromIdx = destDisplayed.findIndex((c) => c.key === activeKey);
      if (fromIdx === -1 || fromIdx === toIdx) return;
      reordered = arrayMove(destDisplayed, fromIdx, toIdx);
    } else {
      // Entre filas: insere na posição visual exata onde foi solto
      reordered = [...destDisplayed.slice(0, toIdx), activeCard, ...destDisplayed.slice(toIdx)];
    }

    const updates: { id: string | null; runrunit_project_id: number; lane_id: string | null; position: number; updated_by?: string | null }[] = [];
    reordered.forEach((it, idx) => {
      const lane_id = toLane === UNASSIGNED_LANE ? null : toLane;
      // Preserva exatamente onde foi solto: atualiza posição sequencial conforme ordem visual.
      // bulkUpdate marcará como manually_positioned=true, garantindo prevalência manual.
      if (it.position !== idx || it.lane_id !== lane_id || it.card == null || it.key === activeKey) {
        updates.push({
          id: it.card?.id ?? null,
          runrunit_project_id: it.runrunit_project_id,
          lane_id,
          position: idx,
          updated_by: currentUserName,
        });
      }
    });

    setItems((prev) =>
      prev.map((it) => {
        const u = updates.find((u) => u.runrunit_project_id === it.runrunit_project_id);
        if (!u) return it;
        // Atualiza otimisticamente também o flag manual para que a ordenação
        // agrupada (manual primeiro) reflita imediatamente a posição exata solta
        const nextCard = it.card
          ? { ...it.card, manually_positioned: true as const, position: u.position }
          : it.card;
        // Para cards ainda sem linha no banco (card==null), criamos um stub manual
        const stubCard = !it.card
          ? ({ manually_positioned: true, position: u.position } as unknown as ProjectCardRow)
          : nextCard;
        return { ...it, lane_id: u.lane_id, position: u.position, card: stubCard as ProjectCardRow };
      })
    );

    try {
      const existing = updates.filter((u) => u.id) as {
        id: string;
        lane_id: string | null;
        position: number;
        updated_by?: string | null;
      }[];
      if (existing.length) await bulkUpdateCardPositions(existing);
      const newOnes = updates.filter((u) => !u.id);
      for (const u of newOnes) {
        await upsertCard({
          runrunit_project_id: u.runrunit_project_id,
          assignee_name: assignee,
          lane_id: u.lane_id,
          position: u.position,
          manually_positioned: true,
          updated_by: currentUserName,
        });
      }
      qc.invalidateQueries({ queryKey: ["dashboard", "cards"] });
    } catch (err) {
      toast.error("Falha ao mover: " + (err as Error).message);
      qc.invalidateQueries({ queryKey: ["dashboard", "cards"] });
    }
  };

  const handleAddLane = async () => {
    const title = window.prompt("Nome da nova fila:", "Nova Fila");
    if (!title) return;
    try {
      await createLane(assignee, title, lanesSorted.length);
      qc.invalidateQueries({ queryKey: ["dashboard", "lanes"] });
      toast.success("Fila criada");
    } catch (e) {
      toast.error("Falha ao criar fila: " + (e as Error).message);
    }
  };

  const handleStatusChange = async (it: DashboardCard, status: CardStatus) => {
    // Quando o status vira "concluído", tenta mover para a fila "Concluídos"
    // do quadro do responsável (se existir). Caso contrário mantém a fila atual.
    let targetLaneId: string | null | undefined = undefined;
    if (status === "concluído") {
      const lane = findLaneByTitleLib(allLanes, assignee, ["Concluídos", "Concluidos"]);
      if (lane) targetLaneId = lane.id;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.key === it.key
          ? { ...i, status, lane_id: targetLaneId !== undefined ? targetLaneId : i.lane_id }
          : i
      )
    );
    try {
      await upsertCard({
        runrunit_project_id: it.runrunit_project_id,
        assignee_name: assignee,
        status,
        updated_by: currentUserName,
        ...(targetLaneId !== undefined ? { lane_id: targetLaneId } : {}),
      });
      qc.invalidateQueries({ queryKey: ["dashboard", "cards"] });
    } catch (e) {
      toast.error("Falha ao atualizar status: " + (e as Error).message);
    }
  };

  const handleSaveNote = async (it: DashboardCard, note: string) => {
    try {
      await upsertCard({
        runrunit_project_id: it.runrunit_project_id,
        assignee_name: assignee,
        internal_note: note,
        updated_by: currentUserName,
      });
      toast.success("Observação salva");
      qc.invalidateQueries({ queryKey: ["dashboard", "cards"] });
    } catch (e) {
      toast.error("Falha ao salvar observação: " + (e as Error).message);
    }
  };

  // Find lane by title (case-insensitive) for an assignee
  const findLaneByTitle = (assigneeName: string, titles: string[]): Lane | null =>
    findLaneByTitleLib(allLanes, assigneeName, titles);

  const handleSendForReview = async (it: DashboardCard, reviewer: string) => {
    try {
      // Ensure original card exists so we have source_card_id
      const sourceCard = await upsertCard({
        runrunit_project_id: it.runrunit_project_id,
        assignee_name: assignee,
        status: "em revisão",
        review_status: "aguardando revisão",
        review_requested_to: reviewer,
        review_requested_by: currentUserName || assignee,
        correction_note: null,
        updated_by: currentUserName,
      });
      // Place review demand in reviewer's "Para revisar" lane if it exists
      const targetLane = findLaneByTitle(reviewer, ["Para revisar", "Para Revisar"]);
      await createReview({
        runrunit_project_id: it.runrunit_project_id,
        source_card_id: sourceCard.id,
        original_assignee_name: assignee,
        reviewer_name: reviewer,
        requested_by_name: currentUserName || assignee,
        lane_id: targetLane?.id ?? null,
        position: 0,
      });
      toast.success(`Enviado para revisão de ${reviewer}`);
      qc.invalidateQueries({ queryKey: ["dashboard", "cards"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "reviews"] });
    } catch (e) {
      toast.error("Falha ao enviar para revisão: " + (e as Error).message);
    }
  };

  const handleApproveReview = async (r: ReviewRow) => {
    try {
      const concluidoLane = findLaneByTitle(r.original_assignee_name, ["Concluídos", "Concluidos"]);
      await updateReview(r.id, {
        review_status: "aprovado",
        finished_at: new Date().toISOString(),
      });
      await upsertCard({
        runrunit_project_id: r.runrunit_project_id,
        assignee_name: r.original_assignee_name,
        status: "concluído",
        review_status: "aprovado",
        review_requested_to: null,
        correction_note: null,
        lane_id: concluidoLane?.id ?? undefined,
        updated_by: currentUserName,
      });
      toast.success("Card aprovado");
      qc.invalidateQueries({ queryKey: ["dashboard", "cards"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "reviews"] });
    } catch (e) {
      toast.error("Falha ao aprovar: " + (e as Error).message);
    }
  };

  const handleRequestCorrectionReview = async (r: ReviewRow, note: string) => {
    try {
      const corrigirLane = findLaneByTitle(r.original_assignee_name, ["A corrigir", "A Corrigir"]);
      await updateReview(r.id, {
        review_status: "correção solicitada",
        correction_note: note,
        finished_at: new Date().toISOString(),
      });
      await upsertCard({
        runrunit_project_id: r.runrunit_project_id,
        assignee_name: r.original_assignee_name,
        status: "em correção",
        review_status: "correção solicitada",
        review_requested_to: null,
        correction_note: note,
        lane_id: corrigirLane?.id ?? undefined,
        updated_by: currentUserName,
      });
      toast.success("Correção solicitada");
      qc.invalidateQueries({ queryKey: ["dashboard", "cards"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "reviews"] });
    } catch (e) {
      toast.error("Falha ao solicitar correção: " + (e as Error).message);
    }
  };

  // Usa vars repassadas pelo DashboardPage (fonte única de verdade para densidade)
  const effectiveDensityVars = densityVars ?? undefined;

  return (
    <>
      <div
        className={readOnly ? "contents [&_*]:!cursor-default" : "contents"}
        style={effectiveDensityVars}
      >
      {/* Barra horizontal compacta — topo do Kanban, fixed fora do container vertical, proxy da rolagem horizontal real */}
      {isActive && kanbanContentWidth > 0 && (
        <div
          ref={kanbanProxyRef}
          onScroll={onKanbanProxyScroll}
          className="fixed top-[3.5rem] left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] max-w-[1600px] overflow-x-auto overflow-y-hidden border border-border/20 bg-background/95 backdrop-blur-sm rounded-full shadow-sm [scrollbar-width:thin] [&::-webkit-scrollbar]:h-[6px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/60 [&::-webkit-scrollbar-track]:bg-transparent"
          aria-label="Rolagem horizontal do Kanban"
        >
          <div style={{ width: kanbanContentWidth, height: 1 }} aria-hidden="true" />
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={readOnly ? undefined : onDragStart}
        onDragOver={readOnly ? undefined : onDragOver}
        onDragEnd={readOnly ? undefined : onDragEnd}
        autoScroll={{
          threshold: { x: 0.18, y: 0.15 },
          acceleration: 8,
          interval: 5,
        }}
      >
        <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
          <div
            ref={mainScrollRef}
            onScroll={onMainScroll}
            className={`flex-1 min-h-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${readOnly ? "[&_button]:pointer-events-none" : ""}`}
          >
            <div
              ref={innerRef}
              className="flex h-full min-w-max"
              style={{ gap: "var(--kb-gap)", padding: "var(--kb-pad)" }}
            >

            <LaneColumn
              key="__unassigned__"
              laneId="__unassigned__"
              title="Sem fila"
              cards={grouped.get("__unassigned__") ?? []}
              reviews={reviewsByLane.get("__unassigned__") ?? []}
              demands={demandsByLane.get("__unassigned__") ?? []}
              projectNameById={projectNameById}
              onApproveReview={handleApproveReview}
              onRequestCorrectionReview={(r) => setCorrectionReview(r)}
              onStatusChange={handleStatusChange}
              onOpenCard={setOpenCard}
              isUnassigned
              assigneeName={assignee}
              isAdmin={isAdmin}
            />

            <SortableContext
              id="lanes-horizontal"
              items={localLanes.map((l) => `laneItem:${l.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              {localLanes.map((lane) => (
                <SortableLaneColumn
                  key={lane.id}
                  lane={lane}
                  cards={grouped.get(lane.id) ?? []}
                  reviews={reviewsByLane.get(lane.id) ?? []}
                  demands={demandsByLane.get(lane.id) ?? []}
                  projectNameById={projectNameById}
                  onApproveReview={handleApproveReview}
                  onRequestCorrectionReview={(r) => setCorrectionReview(r)}
                  onStatusChange={handleStatusChange}
                  onOpenCard={setOpenCard}
                  isAdmin={isAdmin}
                  onRename={async (newTitle) => {
                    try {
                      await updateLane(lane.id, { title: newTitle });
                      qc.invalidateQueries({ queryKey: ["dashboard", "lanes"] });
                    } catch (e) {
                      toast.error("Falha ao renomear: " + (e as Error).message);
                    }
                  }}
                  onDelete={async () => {
                    if (!window.confirm(`Excluir a fila "${lane.title}"?`)) return;
                    try {
                      await deleteLane(lane.id);
                      qc.invalidateQueries({ queryKey: ["dashboard", "lanes"] });
                      qc.invalidateQueries({ queryKey: ["dashboard", "cards"] });
                      toast.success("Fila excluída");
                    } catch (e) {
                      toast.error("Falha ao excluir: " + (e as Error).message);
                    }
                  }}
                />
              ))}
            </SortableContext>
            {!readOnly && (
              <button
                onClick={handleAddLane}
                style={{ width: "var(--kb-col)" }}
                className="shrink-0 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-2 text-sm h-12"

              >
                <Plus className="h-4 w-4" /> Adicionar fila
              </button>
            )}
          </div>
        </div>
        </div>

        <DragOverlay>
          {activeCard ? (
            <ProjectCardView card={activeCard} onStatusChange={() => {}} onOpenCard={() => {}} dragging isAdmin={isAdmin} />
          ) : null}
        </DragOverlay>
      </DndContext>
      </div>

      {/* Card details modal */}
      <CardDetailsDialog
        card={openCard}
        onClose={() => setOpenCard(null)}
        onSaveNote={handleSaveNote}
        onSendForReview={(c) => {
          setOpenCard(null);
          setReviewCard(c);
        }}
      />

      <SendForReviewDialog
        card={reviewCard}
        onClose={() => setReviewCard(null)}
        reviewerOptions={reviewerOptions.filter((r) => r !== assignee)}
        onConfirm={(c, reviewer) => {
          handleSendForReview(c, reviewer);
          setReviewCard(null);
        }}
      />

      <RequestCorrectionDialog
        review={correctionReview}
        onClose={() => setCorrectionReview(null)}
        onConfirm={(r, note) => {
          handleRequestCorrectionReview(r, note);
          setCorrectionReview(null);
        }}
      />
    </>
  );
}

function LaneColumn({
  lane,
  laneId,
  title,
  cards,
  reviews,
  demands = [],
  projectNameById,
  onApproveReview,
  onRequestCorrectionReview,
  onRename,
  onDelete,
  onStatusChange,
  onOpenCard,
  isUnassigned,
  dragHandleProps,
  laneSetNodeRef,
  laneStyle,
  isLaneDragging,
  assigneeName,
  isAdmin = false,
}: {
  lane?: Lane;
  laneId: string;
  title: string;
  cards: DashboardCard[];
  reviews: ReviewRow[];
  demands?: DemandBoardCard[];
  projectNameById: Map<number, string>;
  onApproveReview: (r: ReviewRow) => void;
  onRequestCorrectionReview: (r: ReviewRow) => void;
  onRename?: (next: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
  isUnassigned?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement> & { ref?: (el: HTMLElement | null) => void };
  laneSetNodeRef?: (el: HTMLElement | null) => void;
  laneStyle?: React.CSSProperties;
  isLaneDragging?: boolean;
  assigneeName: string;
  isAdmin?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);
  void lane;

  const qc = useQueryClient();

  const isMonthly = isMonthlyLaneTitle(title);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [isCapacityDialogOpen, setIsCapacityDialogOpen] = useState(false);
  const [capacityDraft, setCapacityDraft] = useState("");

  useEffect(() => {
    if (!isMonthly || !assigneeName) {
      setCapacity(null);
      return;
    }
    const isoMonth = monthlyTitleToDateISO(title);
    if (!isoMonth) return;
    fetchUserCapacity(assigneeName, isoMonth).then((data) => {
      setCapacity(data?.capacity_hours ?? null);
    });
  }, [isMonthly, assigneeName, title]);


  // Horas planejadas da coluna — recalculadas sempre que os cards mudam,
  // portanto atualizam em tempo real ao mover cards entre colunas.
  // Demandas Avulsas somam apenas as horas INDIVIDUAIS do responsável desta
  // fila — as horas nunca são divididas entre as pessoas da demanda.
  const plannedHours = useMemo(
    () =>
      sumLaneEstimatedHours(cards) +
      demands.reduce((acc, d) => acc + (Number(d.ownHours) || 0), 0),
    [cards, demands]
  );

  const capacitySummary = useMemo(() => ({
    plannedHours,
    capacityHours: capacity
  }), [plannedHours, capacity]);

  const overCapacity = isOverCapacity(capacitySummary);
  const excess = getCapacityExcess(capacitySummary);

  const handleSaveCapacity = async () => {
    const hours = parseFloat(capacityDraft);
    if (isNaN(hours)) {
      toast.error("Por favor, insira um número válido.");
      return;
    }
    try {
      const isoMonth = monthlyTitleToDateISO(title);
      if (!isoMonth) throw new Error("Título de fila inválido para capacidade");
      await upsertUserCapacity(assigneeName, isoMonth, hours);
      setCapacity(hours);
      setIsCapacityDialogOpen(false);
      toast.success("Capacidade atualizada!");
      qc.invalidateQueries({ queryKey: ["dashboard", "user_capacity", assigneeName, isoMonth] });
    } catch (err) {
      toast.error("Erro ao salvar capacidade.");
    }

  };



  return (
    <div
      ref={laneSetNodeRef}
      style={{ width: "var(--kb-col)", ...laneStyle }}
      className={cn(
        "relative shrink-0 flex flex-col rounded-[10px] bg-muted/30 border border-border/60 max-h-full",
        isLaneDragging && "opacity-50"
      )}
    >
      <div
        style={{ paddingTop: "var(--kb-head-py)", paddingBottom: "var(--kb-head-py)" }}
        className="px-2.5 flex shrink-0 flex-col justify-center border-b border-border/50 bg-card rounded-t-lg min-h-[44px] gap-0.5 py-1"
      >
        {editing && onRename ? (
          <div className="flex items-center gap-1.5 w-full">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRename(draft.trim() || title);
                  setEditing(false);
                }
                if (e.key === "Escape") {
                  setDraft(title);
                  setEditing(false);
                }
              }}
            />
            <button
              className="p-1 text-emerald-600 hover:bg-accent rounded"
              onClick={() => {
                onRename(draft.trim() || title);
                setEditing(false);
              }}
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              className="p-1 text-muted-foreground hover:bg-accent rounded"
              onClick={() => {
                setDraft(title);
                setEditing(false);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex w-full flex-row items-center justify-between gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex min-w-0 flex-1 items-center gap-1.5 cursor-pointer rounded-md px-1 -mx-1 transition-colors hover:bg-muted/20"
                      onClick={() => {
                        setCapacityDraft(capacity?.toString() ?? "0");
                        setIsCapacityDialogOpen(true);
                      }}
                    >
                      {dragHandleProps && (
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground/15 hover:text-muted-foreground/35 transition-colors p-0 h-auto bg-transparent border-none cursor-grab active:cursor-grabbing"
                          {...dragHandleProps}
                        >
                          <GripHorizontal className="h-3 w-3" />
                        </button>
                      )}
                      <h3 className="text-[12px] font-medium tracking-widest leading-none truncate uppercase text-foreground/75">
                        {isMonthly ? title.toUpperCase() : title}
                      </h3>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs bg-neutral-900 text-white border-neutral-800">
                    <p>Cartões: {cards.length}</p>
                    {!isMonthly && !isUnassigned && <p className="text-[10px] opacity-70 mt-1">Clique para configurar</p>}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isAdmin && isMonthly && (plannedHours > 0 || capacity != null) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "shrink-0 whitespace-nowrap tabular-nums tracking-wide cursor-default select-none font-normal leading-none text-[7px]",
                          overCapacity
                            ? "text-red-600 dark:text-red-400"
                            : "text-muted-foreground/55"
                        )}
                      >
                        {capacity != null ? formatHoursCompact(capacity) : "—"} / {formatHoursCompact(plannedHours)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="text-xs bg-neutral-900 text-white border-neutral-800"
                    >
                      <p>Capacidade: {capacity != null ? formatHoursCompact(capacity) : "—"}</p>
                      <p>Planejado: {formatHoursCompact(plannedHours)}</p>
                      {overCapacity && (
                        <p>Excedente: {formatHoursCompact(excess)}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Dialog open={isCapacityDialogOpen} onOpenChange={setIsCapacityDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Configurações da Fila</DialogTitle>
                  <DialogDescription>
                    {isAdmin && isMonthly
                      ? `Ajuste o título ou a capacidade para ${assigneeName}.`
                      : "Ajuste o título da fila."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm font-medium">Título</label>
                    <Input 
                      value={draft} 
                      onChange={(e) => setDraft(e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                  {isAdmin && isMonthly && (
                    <div className="grid grid-cols-4 items-center gap-4">
                      <label className="text-right text-sm font-medium">Capacidade (h)</label>
                      <Input 
                        type="number"
                        step="0.5"
                        value={capacityDraft} 
                        onChange={(e) => setCapacityDraft(e.target.value)}
                        className="col-span-3" 
                      />
                    </div>
                  )}
                </div>
                <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
                  {!isUnassigned && onDelete && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        onDelete();
                        setIsCapacityDialogOpen(false);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir Fila
                    </Button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <Button variant="outline" onClick={() => setIsCapacityDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={async () => {
                      if (draft.trim() !== title && onRename) {
                        await onRename(draft.trim());
                      }
                      if (isAdmin && isMonthly) {
                        await handleSaveCapacity();
                      } else {
                        setIsCapacityDialogOpen(false);
                      }
                    }}>Salvar</Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>


      <SortableContext
        id={`lane:${laneId}`}
        items={cards.map((c) => c.key)}
        strategy={verticalListSortingStrategy}
      >
        <DroppableLaneBody
          laneId={laneId}
          cards={cards}
          reviews={reviews}
          demands={demands}
          projectNameById={projectNameById}
          onApproveReview={onApproveReview}
          onRequestCorrectionReview={onRequestCorrectionReview}
          onStatusChange={onStatusChange}
          onOpenCard={onOpenCard}
          isAdmin={isAdmin}
        />
      </SortableContext>
    </div>
  );
}

function SortableLaneColumn(props: {
  lane: Lane;
  cards: DashboardCard[];
  reviews: ReviewRow[];
  demands?: DemandBoardCard[];
  projectNameById: Map<number, string>;
  onApproveReview: (r: ReviewRow) => void;
  onRequestCorrectionReview: (r: ReviewRow) => void;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
  onRename: (next: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  isAdmin?: boolean;
}) {
  const { lane } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `laneItem:${lane.id}` });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <LaneColumn
      lane={lane}
      laneId={lane.id}
      title={lane.title}
      cards={props.cards}
      reviews={props.reviews}
      demands={props.demands}
      projectNameById={props.projectNameById}
      onApproveReview={props.onApproveReview}
      onRequestCorrectionReview={props.onRequestCorrectionReview}
      onStatusChange={props.onStatusChange}
      onOpenCard={props.onOpenCard}
      onRename={props.onRename}
      onDelete={props.onDelete}
      laneSetNodeRef={setNodeRef}
      laneStyle={style}
      isLaneDragging={isDragging}
      assigneeName={lane.assignee_name}
      isAdmin={props.isAdmin}
      dragHandleProps={{
        ref: setActivatorNodeRef as unknown as (el: HTMLElement | null) => void,
        ...attributes,
        ...(listeners as React.HTMLAttributes<HTMLButtonElement>),
      }}
    />
  );
}


function DroppableLaneBody({
  laneId,
  cards,
  reviews,
  demands = [],
  projectNameById,
  onApproveReview,
  onRequestCorrectionReview,
  onStatusChange,
  onOpenCard,
  isAdmin = false,
}: {
  laneId: string;
  cards: DashboardCard[];
  reviews: ReviewRow[];
  demands?: DemandBoardCard[];
  projectNameById: Map<number, string>;
  onApproveReview: (r: ReviewRow) => void;
  onRequestCorrectionReview: (r: ReviewRow) => void;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
  isAdmin?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${laneId}` });
  return (
    <div
      ref={setNodeRef}
      style={{ padding: "var(--kb-card-gap)", gap: "var(--kb-card-gap)" }}
      className={cn(
        "flex-1 flex flex-col overflow-y-auto min-h-[100px] transition-colors",
        isOver && "bg-primary/5"
      )}
    >

      {reviews.map((r) => (
        <ReviewItemView
          key={`rev:${r.id}`}
          review={r}
          projectName={projectNameById.get(r.runrunit_project_id) ?? `Projeto #${r.runrunit_project_id}`}
          onApprove={() => onApproveReview(r)}
          onRequestCorrection={() => onRequestCorrectionReview(r)}
        />
      ))}
      {cards.map((c) => (
        <SortableCard
          key={c.key}
          card={c}
          onStatusChange={onStatusChange}
          onOpenCard={onOpenCard}
          isAdmin={isAdmin}
        />
      ))}
      {demands.map((d) => (
        <DemandCardView key={d.key} card={d} />
      ))}
      {cards.length === 0 && reviews.length === 0 && demands.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-6">
          Arraste cards para cá
        </div>
      )}
    </div>
  );
}

function SortableCard({
  card,
  onStatusChange,
  onOpenCard,
  isAdmin = false,
}: {
  card: DashboardCard;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
  isAdmin?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ProjectCardView card={card} onStatusChange={onStatusChange} onOpenCard={onOpenCard} isAdmin={isAdmin} />
    </div>
  );
}

function ProjectCardView({
  card,
  onStatusChange,
  onOpenCard,
  dragging,
  isAdmin = false,
}: {
  card: DashboardCard;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
  dragging?: boolean;
  isAdmin?: boolean;
}) {
  const p = card.project;
  const hasNote = !!(card.internal_note && card.internal_note.trim());
  const totalTasks = card.card?.total_tasks ?? null;
  const rawHours = card.card?.total_estimated_hours ?? null;
  const estimatedHours =
    rawHours == null ? null : Number(rawHours) % 1 === 0 ? Number(rawHours) : Number(rawHours).toFixed(1);
  const sourceLabel = estimateSourceLabel(card.card?.calculation_details ?? null);
  // Selectable statuses exclude "em revisão" (only set by send-for-review action)
  const selectableStatuses = STATUSES.filter((s) => s !== "em revisão");
  return (
    <div
      style={{ padding: "var(--kb-card-pad)" }}
      className={cn(
        "rounded-[8px] border border-border/60 shadow-sm flex flex-col justify-between bg-card",
        isAdmin ? "min-h-[158px]" : "min-h-[158px] h-[158px]",
        STATUS_CARD_CLASS[card.status],
        dragging ? "shadow-md" : ""
      )}
    >
      <div className="flex items-start gap-2 flex-1 min-h-0">
        <GripVertical className="h-3 w-3 mt-1 text-muted-foreground/25 shrink-0" />
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <button
            onClick={() => onOpenCard(card)}
            className="w-full text-left font-semibold text-[13px] leading-[1.3] tracking-[-0.015em] line-clamp-3 break-words [overflow-wrap:anywhere] hover:text-primary transition-colors cursor-pointer"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {p.project_name}
          </button>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground/80">
              <Building2 className="h-3 w-3 shrink-0 opacity-60" />
              <span className="truncate font-normal">{p.client_name ?? "Sem cliente"}</span>
            </div>
            {p.desired_delivery_date && (
              <div className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground/70">
                <CalendarDays className="h-3 w-3 shrink-0 opacity-50" />
                <span className="font-mono tabular-nums tracking-tight">
                  {new Date(
                    (p.desired_delivery_date as string).length <= 10
                      ? `${p.desired_delivery_date}T00:00:00Z`
                      : (p.desired_delivery_date as string)
                  ).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                </span>
              </div>
            )}
          </div>
          {/* Linha visível diretamente na frente do card — apenas para ADMINISTRADOR */}
          {isAdmin && (
            <div className="flex items-center gap-3.5 text-[11px] leading-4 text-muted-foreground/60">
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-3 w-3 shrink-0 opacity-60" />
                <span className="tabular-nums">
                  {totalTasks != null ? `${totalTasks}` : "—"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0 opacity-60" />
                <span className="tabular-nums">
                  {rawHours != null ? formatHoursCompact(Number(rawHours)) : "—"}
                </span>
              </span>
            </div>
          )}
          {card.review_status && card.review_status !== "não enviado" && (
            <div className="text-[10px] leading-3 text-muted-foreground/60 truncate">
              {card.review_status === "aguardando revisão" &&
                `Revisão: ${card.review_requested_to ?? "—"}`}
              {card.review_status === "correção solicitada" && "Correção solicitada"}
              {card.review_status === "aprovado" && "Aprovado"}
            </div>
          )}
        </div>
      </div>
      <div
        className="mt-3 flex flex-col"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Select value={card.status} onValueChange={(v) => onStatusChange(card, v as CardStatus)}>
          <SelectTrigger className="h-6 text-[10px] leading-none px-2 py-0 bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/30 hover:text-foreground/80 data-[state=open]:bg-muted/30 focus:ring-0 focus:ring-offset-0 shadow-none">
            <SelectValue>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full opacity-70", STATUS_DOT_CLASS[card.status])} />
                {STATUS_LABEL[card.status]}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {selectableStatuses.map((s) => (
              <SelectItem key={s} value={s} className="text-[11px]">
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[s])} />
                  {STATUS_LABEL[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-foreground/80">
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function CardDetailsDialog({
  card,
  onClose,
  onSaveNote,
  onSendForReview,
}: {
  card: DashboardCard | null;
  onClose: () => void;
  onSaveNote: (c: DashboardCard, note: string) => Promise<void>;
  onSendForReview: (c: DashboardCard) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => {
    setNote(card?.internal_note ?? "");
  }, [card]);

  if (!card) return null;
  const p = card.project;
  const isAwaitingReview = card.review_status === "aguardando revisão";

  const formattedDelivery = p.desired_delivery_date
    ? new Date(
        (p.desired_delivery_date as string).length <= 10
          ? `${p.desired_delivery_date}T00:00:00Z`
          : (p.desired_delivery_date as string)
      ).toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : null;

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[680px] p-0 gap-0 overflow-hidden">
        {/* Cabeçalho — título e identificação */}
        <DialogHeader className="px-6 pt-6 pb-4 space-y-3 text-left border-b border-border/60 bg-card">
          <DialogTitle className="text-[18px] font-semibold leading-snug tracking-tight pr-6">
            {p.project_name}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              <Building2 className="h-3 w-3" />
              {p.client_name ?? "Sem cliente"}
            </span>
            {p.project_group_name && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <FolderTree className="h-3 w-3" />
                {p.project_group_name}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium bg-background">
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[card.status])} />
              {STATUS_LABEL[card.status]}
            </span>
          </div>
          <DialogDescription className="text-xs leading-relaxed">
            Dados do Runrun.it são somente leitura. Observações e revisões são internas.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            {/* Prazos — destaque */}
            {formattedDelivery && (
              <div className="rounded-lg border border-primary/20 bg-primary/[0.04] dark:bg-primary/10 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Prazo
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Entrega desejada</div>
                    <div className="text-[15px] font-semibold tracking-tight font-mono tabular-nums">
                      {formattedDelivery}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Runrun.it</div>
                  </div>
                  {p.last_synced_at && (
                    <div className="text-right">
                      <div className="text-[11px] text-muted-foreground">Última sincronização</div>
                      <div className="text-xs font-mono tabular-nums text-muted-foreground">
                        {new Date(p.last_synced_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Informações agrupadas — metadados secundários */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Projeto</div>
                <div className="space-y-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Cliente</span>
                    <span className="text-sm text-foreground/80 truncate">{p.client_name ?? "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Grupo</span>
                    <span className="text-sm text-foreground/80 truncate">{p.project_group_name ?? "—"}</span>
                  </div>
                  {card.card?.calculation_details ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-muted-foreground">Origem da estimativa</span>
                      <span className="text-xs text-foreground/70 leading-snug">
                        {estimateSourceLabel(card.card.calculation_details as any) || "—"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Responsáveis</div>
                <div className="space-y-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Responsável</span>
                    <span className="inline-flex items-center gap-1.5 text-sm text-foreground/80">
                      <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground/60" />
                      {p.assignee_name ?? "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Time</span>
                    <span className="inline-flex items-center gap-1.5 text-sm text-foreground/80">
                      <Users className="h-3 w-3 text-muted-foreground/60" />
                      {p.team_name ?? "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Status</span>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[card.status])} />
                      {STATUS_LABEL[card.status]}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {card.correction_note && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3.5 dark:bg-[#3A2208] dark:border-orange-900/50">
                <div className="text-xs font-semibold text-orange-800 dark:text-orange-200 mb-1.5 inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Correção solicitada
                </div>
                <div className="text-sm leading-relaxed text-orange-900 dark:text-orange-100 whitespace-pre-wrap">
                  {card.correction_note}
                </div>
              </div>
            )}

            {/* Observações */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Observações internas</h4>
                <span className="text-[11px] text-muted-foreground">· visível apenas internamente</span>
              </div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anote algo sobre este projeto…"
                rows={4}
                className="resize-none"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => onSaveNote(card, note)}>
                  Salvar observação
                </Button>
              </div>
            </div>

            {/* Sincronização / alteração — discreto */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-[11px] leading-none text-muted-foreground/70 font-mono tabular-nums">
              <span>
                Sincronizado: {p.last_synced_at ? new Date(p.last_synced_at).toLocaleString("pt-BR") : "—"}
              </span>
              {card.updated_at ? (
                <span>
                  Alterado {card.updated_by ? `por ${card.updated_by}` : ""} ·{" "}
                  {new Date(card.updated_at).toLocaleString("pt-BR")}
                </span>
              ) : (
                <span>Sem alterações internas</span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 bg-muted/20 border-t border-border/60 flex-row justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={() => onSendForReview(card)} disabled={isAwaitingReview}>
            <Send className="h-4 w-4" /> {isAwaitingReview ? "Aguardando revisão" : "Enviar para revisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 pb-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right text-foreground/90 truncate">{value}</span>
    </div>
  );
}

function ReviewItemView({
  review,
  projectName,
  onApprove,
  onRequestCorrection,
}: {
  review: ReviewRow;
  projectName: string;
  onApprove: () => void;
  onRequestCorrection: () => void;
}) {
  return (
    <div className="rounded-lg border-2 border-purple-400 bg-purple-50 p-3 shadow-sm dark:bg-[#2E1A47] dark:border-purple-800 text-foreground">
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldCheck className="h-3.5 w-3.5 text-purple-700 dark:text-purple-300" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-300">
          Revisão recebida
        </span>
      </div>
      <div className="font-semibold text-sm leading-snug line-clamp-3 text-foreground">
        {projectName}
      </div>
      <div className="mt-2 space-y-1 text-xs text-foreground/80">
        <Row icon={<UserCircle2 className="h-3.5 w-3.5" />}>
          Responsável: {review.original_assignee_name}
        </Row>
        <Row icon={<Send className="h-3.5 w-3.5" />}>
          Solicitado por: {review.requested_by_name}
        </Row>
        <Row icon={<ShieldCheck className="h-3.5 w-3.5" />}>
          Revisor: {review.reviewer_name}
        </Row>
        <Row icon={<Clock className="h-3.5 w-3.5" />}>
          Status: {review.review_status}
        </Row>
      </div>
      <div className="mt-3 pt-2 border-t border-purple-200 dark:border-purple-900 flex gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs flex-1 bg-white dark:bg-black/30 dark:border-white/15 dark:text-neutral-100 dark:hover:bg-black/50" onClick={onRequestCorrection}>
          <AlertTriangle className="h-3 w-3 mr-1" /> Correção
        </Button>
        <Button size="sm" className="h-7 text-xs flex-1" onClick={onApprove}>
          <ShieldCheck className="h-3 w-3 mr-1" /> Aprovar
        </Button>
      </div>
    </div>
  );
}

function SendForReviewDialog({
  card,
  onClose,
  reviewerOptions,
  onConfirm,
}: {
  card: DashboardCard | null;
  onClose: () => void;
  reviewerOptions: string[];
  onConfirm: (c: DashboardCard, reviewer: string) => void;
}) {
  const [reviewer, setReviewer] = useState<string>("");
  useEffect(() => {
    setReviewer("");
  }, [card]);
  if (!card) return null;

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar para revisão</DialogTitle>
          <DialogDescription>
            Escolha o revisor para o card “{card.project.project_name}”.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Revisor</label>
          <Select value={reviewer} onValueChange={setReviewer}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um revisor…" />
            </SelectTrigger>
            <SelectContent>
              {reviewerOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!reviewer} onClick={() => onConfirm(card, reviewer)}>
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestCorrectionDialog({
  review,
  onClose,
  onConfirm,
}: {
  review: ReviewRow | null;
  onClose: () => void;
  onConfirm: (r: ReviewRow, note: string) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => {
    setNote("");
  }, [review]);
  if (!review) return null;
  return (
    <Dialog open={!!review} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar correção</DialogTitle>
          <DialogDescription>
            Descreva o motivo da correção para o projeto.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          placeholder="Explique o que precisa ser ajustado…"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!note.trim()} onClick={() => onConfirm(review, note.trim())}>
            Confirmar correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}