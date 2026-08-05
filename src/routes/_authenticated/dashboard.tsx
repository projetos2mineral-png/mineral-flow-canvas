import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, useLayoutEffect } from "react";
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
import { AssigneeFilterBar } from "@/components/dashboard/AssigneeFilterBar";
import { DensityControl, useKanbanDensity } from "@/components/dashboard/KanbanDensity";


import { useCurrentDashboardUser } from "@/lib/auth";
import {
  ensureDefaultMonthlyLanes,
  dedupeMonthlyLanes,
  isMonthlyLaneTitle,
  estimateSourceLabel,
} from "@/lib/dashboard";
import { Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Projetos Runrun.it" },
      {
        name: "description",
        content: "Kanban interno de acompanhamento dos projetos abertos no Runrun.it.",
      },
    ],
  }),
  component: DashboardPage,
});

const UNASSIGNED = "Sem responsável";

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
  const readOnly = level === "comum";

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

  const assignees = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) set.add(p.assignee_name ?? UNASSIGNED);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [projects]);

  const [activeAssignee, setActiveAssignee] = useState<string>("");

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
          className="flex-1 flex flex-col min-h-0"
        >
          <AssigneeFilterBar
            assignees={assignees}
            counts={Object.fromEntries(
              assignees.map((a) => [
                a,
                new Set(
                  projects
                    .filter((p) => (p.assignee_name ?? UNASSIGNED) === a)
                    .map((p) => p.runrunit_project_id)
                ).size,
              ])
            )}
            value={activeAssignee}
          />




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
                allLanes={lanes}
                reviewerOptions={reviewerOptions}
                currentUserName={currentUserName}
                qc={qc}
                readOnly={readOnly}
                isActive={a === activeAssignee}
              />
            </TabsContent>
          ))}
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
  allLanes,
  reviewerOptions,
  currentUserName,
  qc,
  readOnly = false,
  isActive = true,
}: {
  assignee: string;
  projects: DashboardProject[];
  lanes: Lane[];
  cards: ProjectCardRow[];
  reviews: ReviewRow[];
  allLanes: Lane[];
  reviewerOptions: string[];
  currentUserName: string;
  qc: ReturnType<typeof useQueryClient>;
  readOnly?: boolean;
  isActive?: boolean;
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
      const key = r.lane_id && m.has(r.lane_id) ? r.lane_id : UNASSIGNED_LANE;
      m.get(key)!.push(r);
    }
    return m;
  }, [reviews, localLanes]);

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
      const key = it.lane_id && m.has(it.lane_id) ? it.lane_id : UNASSIGNED_LANE;
      m.get(key)!.push(it);
    }
    // Nas filas mensais (título "Mês/AAAA"): cards manualmente posicionados
    // vêm primeiro (na ordem salva); os demais são ordenados por
    // desired_delivery_date crescente e desempate por nome do projeto.
    // Nas outras filas, ordena apenas por position.
    const laneById = new Map(localLanes.map((l) => [l.id, l]));
    for (const [laneId, arr] of m) {
      const lane = laneById.get(laneId);
      const monthly = lane ? isMonthlyLaneTitle(lane.title) : false;
      if (!monthly) {
        arr.sort((a, b) => a.position - b.position);
        continue;
      }
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
  }, [items, localLanes]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeCard = activeId ? items.find((i) => i.key === activeId) ?? null : null;

  // ---- Scroll persistence + top scrollbar sync ----
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const syncingRef = useRef(false);
  const scrollStorageKey = `dashboard:scroll:${assignee}`;

  // Track content width for the top proxy scrollbar
  useEffect(() => {
    if (!innerRef.current) return;
    const el = innerRef.current;
    const update = () => setContentWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Restore saved scroll (horizontal and vertical) when tab becomes active
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
        if (topScrollRef.current && typeof saved.x === "number") {
          topScrollRef.current.scrollLeft = saved.x;
        }
        if (typeof saved.winY === "number") {
          window.scrollTo({ top: saved.winY });
        }
      }
    } catch {
      /* ignore */
    }
  }, [isActive, scrollStorageKey, contentWidth]);

  // Save on window scroll too (vertical page position)
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

  const persistScroll = (x: number, y: number) => {
    try {
      localStorage.setItem(
        scrollStorageKey,
        JSON.stringify({ x, y, winY: window.scrollY })
      );
    } catch {
      /* ignore */
    }
  };

  const onTopScroll = () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (mainScrollRef.current && topScrollRef.current) {
      mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
      persistScroll(topScrollRef.current.scrollLeft, mainScrollRef.current.scrollTop);
    }
    // release next frame
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  const onMainScroll = () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (mainScrollRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
      persistScroll(mainScrollRef.current.scrollLeft, mainScrollRef.current.scrollTop);
    }
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };
  // ---- end scroll persistence ----

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
    const fromLane = findContainer(String(active.id));
    const toLane = findContainer(String(over.id));
    if (!fromLane || !toLane || fromLane === toLane) return;
    setItems((prev) =>
      prev.map((it) =>
        it.key === String(active.id)
          ? { ...it, lane_id: toLane === UNASSIGNED_LANE ? null : toLane }
          : it
      )
    );
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

    const next = [...items];
    const inLane = next
      .filter((i) => (toLane === UNASSIGNED_LANE ? !i.lane_id : i.lane_id === toLane))
      .sort((a, b) => a.position - b.position);

    const fromIdx = inLane.findIndex((i) => i.key === activeKey);
    let toIdx = inLane.findIndex((i) => i.key === overKey);
    if (toIdx === -1) toIdx = inLane.length - 1;

    let reordered = inLane;
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      reordered = arrayMove(inLane, fromIdx, toIdx);
    }

    const updates: { id: string | null; runrunit_project_id: number; lane_id: string | null; position: number; updated_by?: string | null }[] = [];
    reordered.forEach((it, idx) => {
      const lane_id = toLane === UNASSIGNED_LANE ? null : toLane;
      if (it.position !== idx || it.lane_id !== lane_id || it.card == null) {
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
        return { ...it, lane_id: u.lane_id, position: u.position };
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

  const { density, setDensity, vars: densityVars } = useKanbanDensity();


  return (
    <>
      <div
        className={readOnly ? "contents [&_*]:!cursor-default" : "contents"}
        style={densityVars}
      >
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
        {/* Controle de densidade — afeta somente o Kanban */}
        <div className="flex justify-end px-4 pt-2">
          <DensityControl value={density} onChange={setDensity} />
        </div>
        {/* Top proxy scrollbar synced with the main Kanban scroll */}
        <div
          ref={topScrollRef}
          onScroll={onTopScroll}
          className="overflow-x-auto overflow-y-hidden px-4 pt-2"
          aria-hidden="true"
        >
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
        <div
          ref={mainScrollRef}
          onScroll={onMainScroll}
          className={`flex-1 min-h-0 overflow-x-auto ${readOnly ? "[&_button]:pointer-events-none" : ""}`}
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
              projectNameById={projectNameById}
              onApproveReview={handleApproveReview}
              onRequestCorrectionReview={(r) => setCorrectionReview(r)}
              onStatusChange={handleStatusChange}
              onOpenCard={setOpenCard}
              isUnassigned
              assigneeName={assignee}
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
                  projectNameById={projectNameById}
                  onApproveReview={handleApproveReview}
                  onRequestCorrectionReview={(r) => setCorrectionReview(r)}
                  onStatusChange={handleStatusChange}
                  onOpenCard={setOpenCard}
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

        <DragOverlay>
          {activeCard ? (
            <ProjectCardView card={activeCard} onStatusChange={() => {}} onOpenCard={() => {}} dragging />
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
}: {
  lane?: Lane;
  laneId: string;
  title: string;
  cards: DashboardCard[];
  reviews: ReviewRow[];
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
    fetchUserCapacity(assigneeName, title).then((data) => {
      setCapacity(data?.capacity_hours ?? null);
    });
  }, [isMonthly, assigneeName, title]);

  // Horas planejadas da coluna — recalculadas sempre que os cards mudam,
  // portanto atualizam em tempo real ao mover cards entre colunas.
  const plannedHours = useMemo(() => sumLaneEstimatedHours(cards), [cards]);

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
      await upsertUserCapacity(assigneeName, title, hours);
      setCapacity(hours);
      setIsCapacityDialogOpen(false);
      toast.success("Capacidade atualizada!");
      qc.invalidateQueries({ queryKey: ["dashboard", "user_capacity", assigneeName, title] });
    } catch (err) {
      toast.error("Erro ao salvar capacidade.");
    }
  };



  return (
    <div
      ref={laneSetNodeRef}
      style={{ width: "var(--kb-col)", ...laneStyle }}
      className={cn(
        "shrink-0 flex flex-col rounded-lg bg-muted/40 border border-border max-h-full",
        isLaneDragging && "opacity-50"
      )}
    >
      <div
        style={{ paddingTop: "var(--kb-head-py)", paddingBottom: "var(--kb-head-py)" }}
        className="px-2.5 flex items-center gap-1.5 border-b border-border bg-card rounded-t-lg"
      >

        {dragHandleProps && !editing && (
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-grab active:cursor-grabbing"
            title="Mover fila"
            aria-label="Mover fila"
            {...dragHandleProps}
          >
            <GripHorizontal className="h-4 w-4" />
          </button>
        )}
        {editing && onRename ? (
          <>
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
          </>
        ) : (
          <>
            <h3 
              className={cn(
                "text-sm font-semibold truncate",
                isMonthly && "cursor-pointer hover:underline"
              )}
              onClick={() => {
                if (isMonthly) {
                  setCapacityDraft(capacity?.toString() ?? "0");
                  setIsCapacityDialogOpen(true);
                }
              }}
            >
              {title}
            </h3>
            {plannedHours > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-medium tabular-nums",
                        overCapacity ? "text-red-500 font-bold" : "text-muted-foreground"
                      )}
                    >
                      {formatHoursCompact(plannedHours)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs space-y-1">
                    <p>Capacidade mensal: {capacity !== null ? formatHoursCompact(capacity) : "Não definida"}</p>
                    <p>Planejado: {formatHoursCompact(plannedHours)}</p>
                    {overCapacity && <p className="text-red-500 font-semibold">Excesso: +{formatHoursCompact(excess)}</p>}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <span className="flex-1" />



            <Badge variant="outline" className="h-5">
              {cards.length}
            </Badge>
            {!isUnassigned && onRename && (
              <button
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
                onClick={() => setEditing(true)}
                title="Renomear"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {!isUnassigned && onDelete && (
              <button
                className="p-1 text-muted-foreground hover:text-destructive hover:bg-accent rounded"
                onClick={onDelete}
                title="Excluir fila"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <Dialog open={isCapacityDialogOpen} onOpenChange={setIsCapacityDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Capacidade Mensal</DialogTitle>
                  <DialogDescription>
                    Configure a capacidade de horas para {assigneeName} em {title}.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm font-medium">Responsável</label>
                    <Input value={assigneeName} readOnly className="col-span-3 bg-muted" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm font-medium">Mês</label>
                    <Input value={title} readOnly className="col-span-3 bg-muted" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm font-medium">Capacidade (h)</label>
                    <Input 
                      type="number"
                      step="0.5"
                      value={capacityDraft} 
                      onChange={(e) => setCapacityDraft(e.target.value)}
                      className="col-span-3" 
                      autoFocus
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCapacityDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSaveCapacity}>Salvar</Button>
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
          projectNameById={projectNameById}
          onApproveReview={onApproveReview}
          onRequestCorrectionReview={onRequestCorrectionReview}
          onStatusChange={onStatusChange}
          onOpenCard={onOpenCard}
        />
      </SortableContext>
    </div>
  );
}

function SortableLaneColumn(props: {
  lane: Lane;
  cards: DashboardCard[];
  reviews: ReviewRow[];
  projectNameById: Map<number, string>;
  onApproveReview: (r: ReviewRow) => void;
  onRequestCorrectionReview: (r: ReviewRow) => void;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
  onRename: (next: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
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
  projectNameById,
  onApproveReview,
  onRequestCorrectionReview,
  onStatusChange,
  onOpenCard,
}: {
  laneId: string;
  cards: DashboardCard[];
  reviews: ReviewRow[];
  projectNameById: Map<number, string>;
  onApproveReview: (r: ReviewRow) => void;
  onRequestCorrectionReview: (r: ReviewRow) => void;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
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
        />
      ))}
      {cards.length === 0 && reviews.length === 0 && (
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
}: {
  card: DashboardCard;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
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
      <ProjectCardView card={card} onStatusChange={onStatusChange} onOpenCard={onOpenCard} />
    </div>
  );
}

function ProjectCardView({
  card,
  onStatusChange,
  onOpenCard,
  dragging,
}: {
  card: DashboardCard;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
  dragging?: boolean;
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
        "rounded-lg border shadow-sm transition-shadow text-foreground",
        STATUS_CARD_CLASS[card.status],
        dragging ? "shadow-lg" : "hover:shadow"
      )}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/40 shrink-0" />
        <div className="min-w-0 flex-1">
          <button
            onClick={() => onOpenCard(card)}
            className="w-full text-left font-semibold text-[12px] leading-snug line-clamp-2 mb-1 hover:text-primary transition-colors cursor-pointer"
          >
            {p.project_name}
          </button>

          <div className="space-y-0.5 text-[11px]">
            <Row icon={<Building2 className="h-3 w-3" />}>{p.client_name ?? "Sem cliente"}</Row>
          </div>
          {(totalTasks != null || estimatedHours != null) && (
            <div className="mt-1 space-y-0 text-[10px] text-foreground/70">
              <div className="flex flex-wrap items-center gap-x-2">
                {totalTasks != null && <span>📌 {totalTasks}</span>}
                {estimatedHours != null && <span>⏱ {estimatedHours}h</span>}
              </div>
            </div>
          )}
          {card.review_status && card.review_status !== "não enviado" && (
            <div className="mt-1 text-[10px] text-foreground/70 italic truncate">
              {card.review_status === "aguardando revisão" &&
                `Revisão: ${card.review_requested_to ?? "—"}`}
              {card.review_status === "correção solicitada" && "Correção solicitada"}
              {card.review_status === "aprovado" && "Aprovado"}
            </div>
          )}
        </div>
      </div>
      <div
        className="mt-2 pt-1.5 border-t border-black/5 dark:border-white/10 flex flex-col gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Select value={card.status} onValueChange={(v) => onStatusChange(card, v as CardStatus)}>
          <SelectTrigger className="h-7 text-[11px] px-2 bg-white/50 dark:bg-black/20 dark:border-white/10 dark:text-neutral-200">
            <SelectValue>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[card.status])} />
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

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="leading-snug">{p.project_name}</DialogTitle>
          <DialogDescription>
            Dados do Runrun.it são somente leitura. Observações e revisões são internas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <ReadRow label="Cliente" value={p.client_name ?? "—"} />
          <ReadRow label="Grupo" value={p.project_group_name ?? "—"} />
          <ReadRow label="Responsável" value={p.assignee_name ?? "—"} />
          <ReadRow label="Time" value={p.team_name ?? "—"} />
          {card.card?.calculation_details ? (
            <ReadRow label="Origem da estimativa" value={estimateSourceLabel(card.card.calculation_details as any) || "—"} />
          ) : null}
          <ReadRow
            label="Última sincronização"
            value={p.last_synced_at ? new Date(p.last_synced_at).toLocaleString("pt-BR") : "—"}
          />
          <ReadRow label="Status" value={STATUS_LABEL[card.status]} />
          {card.updated_at && (
            <div className="pt-2 mt-2 border-t border-border/50">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Última alteração</label>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-foreground/80">{card.updated_by || "Sistema"}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(card.updated_at).toLocaleString("pt-BR")}
                </span>
              </div>
            </div>
          )}
          {p.desired_delivery_date && (
            <ReadRow
              label="Entrega desejada (Runrun.it)"
              value={new Date(
                (p.desired_delivery_date as string).length <= 10
                  ? `${p.desired_delivery_date}T00:00:00Z`
                  : (p.desired_delivery_date as string)
              ).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
            />
          )}

          {card.correction_note && (
            <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-xs dark:bg-[#3A2208] dark:border-orange-900/70">
              <div className="font-semibold text-orange-800 dark:text-orange-200 mb-1 inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Correção solicitada
              </div>
              <div className="text-orange-900 dark:text-orange-100 whitespace-pre-wrap">{card.correction_note}</div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Observações internas</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anote algo sobre este projeto…"
              rows={4}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => onSaveNote(card, note)}>
                Salvar observação
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
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