import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
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
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  CalendarDays,
  FileText,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  fetchPlanningProjects,
  upsertPlanning,
  clearPlanningDate,
  planningEffectiveDate,
  PLANNING_STATUSES,
  PLANNING_STATUS_LABEL,
  PLANNING_STATUS_CLASS,
  PLANNING_STATUS_DOT,
  normalizePlanningStatus,
  type PlanningProject,
  type PlanningStatus,
} from "@/lib/dashboard";
import { RequireLevel } from "@/components/RequireLevel";

export const Route = createFileRoute("/_authenticated/planejamento")({
  head: () => ({
    meta: [
      { title: "Calendário · Projetos Runrun.it" },
      { name: "description", content: "Calendário mensal de projetos." },
    ],
  }),
  component: () => (
    <RequireLevel allow={["lider", "administrador"]}>
      <PlanningPage />
    </RequireLevel>
  ),
});

type ViewMode = "semana" | "mes" | "ano";

// Local-date helpers (avoid TZ issues)
function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function PlanningPage() {
  const qc = useQueryClient();
  const planningQ = useQuery({
    queryKey: ["planning", "projects"],
    queryFn: fetchPlanningProjects,
    staleTime: 30_000,
  });

  const all = planningQ.data ?? [];

  // Filters
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [view, setView] = useState<ViewMode>("mes");
  const [cursor, setCursor] = useState<Date>(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });

  const groups = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) if (p.project_group_name) s.add(p.project_group_name);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((p) => {
      if (q && !p.project_name.toLowerCase().includes(q)) return false;
      if (groupFilter !== "__all__" && (p.project_group_name ?? "") !== groupFilter) return false;
      if (statusFilter !== "__all__" && normalizePlanningStatus(p.planning_status) !== statusFilter) return false;
      return true;
    });
  }, [all, search, groupFilter, statusFilter]);

  // Index planned items by date
  const byDate = useMemo(() => {
    const m = new Map<string, PlanningProject[]>();
    for (const p of filtered) {
      const eff = planningEffectiveDate(p);
      if (!eff) continue;
      const key = eff.length > 10 ? eff.slice(0, 10) : eff;
      const list = m.get(key) ?? [];
      list.push(p);
      m.set(key, list);
    }
    for (const [, list] of m) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return m;
  }, [filtered]);

  const unscheduled = useMemo(
    () => filtered.filter((p) => !planningEffectiveDate(p)),
    [filtered]
  );

  const [openProject, setOpenProject] = useState<PlanningProject | null>(null);
  const [dayListDate, setDayListDate] = useState<string | null>(null);

  const moveTo = async (project: PlanningProject, dateISO: string | null) => {
    try {
      await upsertPlanning({
        planning_id: project.planning_id ?? undefined,
        runrunit_project_id: project.runrunit_project_id,
        planning_date: dateISO,
        position: 0,
      });
      qc.invalidateQueries({ queryKey: ["planning", "projects"] });
    } catch (e) {
      toast.error("Falha ao mover: " + (e as Error).message);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card/40 flex items-center gap-3 flex-wrap">
        <CalendarDays className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Calendário</h1>
        <span className="text-sm text-muted-foreground">
          {filtered.length} projetos
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar projeto…"
              className="pl-8 h-9 w-56"
            />
          </div>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue placeholder="Grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os grupos</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os status</SelectItem>
              {PLANNING_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{PLANNING_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* View switch + nav */}
      <div className="px-6 py-2 border-b border-border bg-card/30 flex items-center gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="mes">Mês</TabsTrigger>
            <TabsTrigger value="ano">Ano</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1 ml-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => {
              if (view === "semana") setCursor(addDays(cursor, -7));
              else if (view === "mes") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
              else setCursor(new Date(cursor.getFullYear() - 1, 0, 1));
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => {
            const t = new Date();
            t.setHours(0, 0, 0, 0);
            setCursor(t);
          }}>Hoje</Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => {
              if (view === "semana") setCursor(addDays(cursor, 7));
              else if (view === "mes") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
              else setCursor(new Date(cursor.getFullYear() + 1, 0, 1));
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-sm font-medium">
          {view === "ano"
            ? cursor.getFullYear()
            : view === "mes"
            ? `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`
            : (() => {
                const s = startOfWeek(cursor);
                const e = addDays(s, 6);
                return `${s.getDate()} ${MONTH_NAMES[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${MONTH_NAMES[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
              })()}
        </div>
        {unscheduled.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {unscheduled.length} sem data
          </span>
        )}
      </div>

      {planningQ.isLoading && (
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      )}
      {planningQ.error && (
        <div className="p-6 text-sm text-destructive">
          Erro: {(planningQ.error as Error).message}
        </div>
      )}

      {!planningQ.isLoading && (
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-h-0 overflow-auto">
            {view === "semana" && (
              <WeekView cursor={cursor} byDate={byDate} onOpen={setOpenProject} onMove={moveTo} />
            )}
            {view === "mes" && (
              <MonthView
                cursor={cursor}
                byDate={byDate}
                onOpen={setOpenProject}
                onMove={moveTo}
                onOpenDay={(iso) => setDayListDate(iso)}
              />
            )}
            {view === "ano" && (
              <YearView
                cursor={cursor}
                byDate={byDate}
                onOpenDay={(iso) => setDayListDate(iso)}
                onOpenMonth={(month) => {
                  setCursor(new Date(cursor.getFullYear(), month, 1));
                  setView("mes");
                }}
              />
            )}
          </div>
          {/* Unscheduled panel */}
          {(view === "semana" || view === "mes") && (
            <UnscheduledPanel
              items={unscheduled}
              onOpen={setOpenProject}
              onMove={moveTo}
            />
          )}
        </div>
      )}

      <ProjectModal
        project={openProject}
        onClose={() => setOpenProject(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["planning", "projects"] })}
      />
      <DayListDialog
        dateISO={dayListDate}
        items={dayListDate ? (byDate.get(dayListDate) ?? []) : []}
        onClose={() => setDayListDate(null)}
        onOpen={(p) => {
          setDayListDate(null);
          setOpenProject(p);
        }}
      />
    </div>
  );
}

// ---------- Drag wrapper ----------
function DragShell({
  children,
  onDropProject,
  items,
}: {
  children: React.ReactNode;
  onDropProject: (projectId: number, dateISO: string | null) => void;
  items: PlanningProject[];
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeProject = useMemo(
    () => (activeId ? items.find((p) => p.runrunit_project_id === activeId) ?? null : null),
    [activeId, items]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(Number(String(e.active.id).replace("p:", "")))}
      onDragEnd={(e: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = e;
        if (!over) return;
        const overId = String(over.id);
        if (!overId.startsWith("d:") && overId !== "d:none") return;
        const dateISO = overId === "d:none" ? null : overId.slice(2);
        const projectId = Number(String(active.id).replace("p:", ""));
        onDropProject(projectId, dateISO);
      }}
    >
      {children}
      <DragOverlay>
        {activeProject ? <CompactCard project={activeProject} onClick={() => {}} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

// ---------- Week view ----------
function WeekView({
  cursor,
  byDate,
  onOpen,
  onMove,
}: {
  cursor: Date;
  byDate: Map<string, PlanningProject[]>;
  onOpen: (p: PlanningProject) => void;
  onMove: (p: PlanningProject, dateISO: string | null) => void;
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const allItems = useMemo(() => {
    const arr: PlanningProject[] = [];
    for (const d of days) {
      const iso = toISODate(d);
      arr.push(...(byDate.get(iso) ?? []));
    }
    return arr;
  }, [byDate, cursor]);

  return (
    <DragShell
      items={allItems}
      onDropProject={(id, dateISO) => {
        const proj = allItems.find((p) => p.runrunit_project_id === id);
        if (proj) onMove(proj, dateISO);
      }}
    >
      <div className="grid grid-cols-7 gap-2 p-4 min-h-full">
        {days.map((d) => {
          const iso = toISODate(d);
          const items = byDate.get(iso) ?? [];
          return (
            <DayCell key={iso} dateISO={iso} className="min-h-[60vh]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground">
                    {WEEKDAYS_SHORT[d.getDay()]}
                  </div>
                  <div className={cn("text-lg font-semibold", sameDate(d, new Date()) && "text-primary")}>
                    {d.getDate()}
                  </div>
                </div>
                <Badge variant="outline" className="h-5">{items.length}</Badge>
              </div>
              <SortableContext items={items.map((p) => `p:${p.runrunit_project_id}`)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {items.map((p) => (
                    <DraggableCard key={p.runrunit_project_id} project={p} onClick={() => onOpen(p)} />
                  ))}
                </div>
              </SortableContext>
            </DayCell>
          );
        })}
      </div>
    </DragShell>
  );
}

// ---------- Month view ----------
function MonthView({
  cursor,
  byDate,
  onOpen,
  onMove,
  onOpenDay,
}: {
  cursor: Date;
  byDate: Map<string, PlanningProject[]>;
  onOpen: (p: PlanningProject) => void;
  onMove: (p: PlanningProject, dateISO: string | null) => void;
  onOpenDay: (iso: string) => void;
}) {
  const first = startOfMonth(cursor);
  const gridStart = startOfWeek(first);
  const last = endOfMonth(cursor);
  const totalDays = Math.ceil((Math.floor((last.getTime() - gridStart.getTime()) / 86400000) + 1) / 7) * 7;
  const cells = Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  const allItems = useMemo(() => {
    const arr: PlanningProject[] = [];
    for (const d of cells) {
      arr.push(...(byDate.get(toISODate(d)) ?? []));
    }
    return arr;
  }, [byDate, cursor]);

  const MAX_PER_DAY = 3;

  return (
    <DragShell
      items={allItems}
      onDropProject={(id, dateISO) => {
        const proj = allItems.find((p) => p.runrunit_project_id === id);
        if (proj) onMove(proj, dateISO);
      }}
    >
      <div className="p-4">
        <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="bg-card text-[11px] uppercase tracking-wide text-muted-foreground px-2 py-1.5 text-center">
              {w}
            </div>
          ))}
          {cells.map((d) => {
            const iso = toISODate(d);
            const items = byDate.get(iso) ?? [];
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = sameDate(d, today);
            const visible = items.slice(0, MAX_PER_DAY);
            const extra = items.length - visible.length;
            return (
              <DayCell
                key={iso}
                dateISO={iso}
                className={cn(
                  "bg-card min-h-[120px] p-1.5",
                  !inMonth && "bg-muted/40 text-muted-foreground"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isToday && "bg-primary text-primary-foreground rounded-full px-1.5"
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {items.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{items.length}</span>
                  )}
                </div>
                <SortableContext items={visible.map((p) => `p:${p.runrunit_project_id}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {visible.map((p) => (
                      <DraggableCard key={p.runrunit_project_id} project={p} onClick={() => onOpen(p)} compact />
                    ))}
                  </div>
                </SortableContext>
                {extra > 0 && (
                  <button
                    onClick={() => onOpenDay(iso)}
                    className="mt-1 text-[10px] text-primary hover:underline"
                  >
                    +{extra} projetos
                  </button>
                )}
              </DayCell>
            );
          })}
        </div>
      </div>
    </DragShell>
  );
}

// ---------- Year view ----------
function YearView({
  cursor,
  byDate,
  onOpenDay,
  onOpenMonth,
}: {
  cursor: Date;
  byDate: Map<string, PlanningProject[]>;
  onOpenDay: (iso: string) => void;
  onOpenMonth: (month: number) => void;
}) {
  const year = cursor.getFullYear();

  return (
    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {Array.from({ length: 12 }, (_, m) => {
        const first = new Date(year, m, 1);
        const last = new Date(year, m + 1, 0);
        const gridStart = startOfWeek(first);
        const total = Math.ceil((Math.floor((last.getTime() - gridStart.getTime()) / 86400000) + 1) / 7) * 7;
        const cells = Array.from({ length: total }, (_, i) => addDays(gridStart, i));
        let monthCount = 0;
        for (let d = 1; d <= last.getDate(); d++) {
          monthCount += (byDate.get(toISODate(new Date(year, m, d))) ?? []).length;
        }
        return (
          <div key={m} className="rounded-md border border-border bg-card p-2">
            <button
              onClick={() => onOpenMonth(m)}
              className="w-full flex items-center justify-between mb-1.5 px-1 hover:text-primary transition-colors"
            >
              <span className="text-sm font-semibold">{MONTH_NAMES[m]}</span>
              <Badge variant="secondary" className="h-5 text-[10px]">{monthCount}</Badge>
            </button>
            <div className="grid grid-cols-7 gap-px text-center text-[9px] text-muted-foreground mb-0.5">
              {WEEKDAYS_SHORT.map((w) => <div key={w}>{w[0]}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {cells.map((d) => {
                const iso = toISODate(d);
                const inMonth = d.getMonth() === m;
                const count = (byDate.get(iso) ?? []).length;
                return (
                  <button
                    key={iso}
                    disabled={!inMonth || count === 0}
                    onClick={() => onOpenDay(iso)}
                    className={cn(
                      "aspect-square text-[10px] rounded flex items-center justify-center relative",
                      !inMonth && "text-muted-foreground/40",
                      inMonth && count > 0 && "bg-primary/15 text-primary font-semibold hover:bg-primary/25",
                      inMonth && count === 0 && "text-foreground/70"
                    )}
                    title={count > 0 ? `${count} projeto(s)` : ""}
                  >
                    {d.getDate()}
                    {count > 0 && (
                      <span className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Day cell (droppable) ----------
function DayCell({
  dateISO,
  children,
  className,
}: {
  dateISO: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `d:${dateISO}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md border border-border bg-card transition-colors",
        isOver && "ring-2 ring-primary/60",
        className
      )}
    >
      {children}
    </div>
  );
}

// ---------- Card ----------
function CompactCard({
  project,
  onClick,
  compact,
  dragging,
}: {
  project: PlanningProject;
  onClick: () => void;
  compact?: boolean;
  dragging?: boolean;
}) {
  const status = normalizePlanningStatus(project.planning_status);
  const hasDetail = !!(project.detail && project.detail.trim());
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1 cursor-pointer hover:shadow-sm transition-shadow",
        PLANNING_STATUS_CLASS[status],
        dragging && "shadow-lg opacity-90",
        compact ? "text-[10.5px] leading-tight" : "text-xs"
      )}
      title={project.project_name}
    >
      <div className="flex items-center gap-1">
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", PLANNING_STATUS_DOT[status])} />
        <span className="font-medium truncate flex-1">{project.project_name}</span>
        {hasDetail && <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />}
      </div>
    </div>
  );
}

function DraggableCard({
  project,
  onClick,
  compact,
}: {
  project: PlanningProject;
  onClick: () => void;
  compact?: boolean;
}) {
  const id = `p:${project.runrunit_project_id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CompactCard project={project} onClick={onClick} compact={compact} />
    </div>
  );
}

// ---------- Unscheduled panel ----------
function UnscheduledPanel({
  items,
  onOpen,
  onMove,
}: {
  items: PlanningProject[];
  onOpen: (p: PlanningProject) => void;
  onMove: (p: PlanningProject, dateISO: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "d:none" });
  return (
    <aside className="w-64 shrink-0 border-l border-border bg-card/30 flex flex-col">
      <div className="px-3 py-2 border-b border-border">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Sem data</div>
        <div className="text-[11px] text-muted-foreground">Arraste para um dia</div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto p-2 space-y-1.5 transition-colors",
          isOver && "bg-primary/10"
        )}
      >
        {items.length === 0 && (
          <div className="text-center text-[11px] text-muted-foreground py-6">
            Tudo planejado
          </div>
        )}
        {items.map((p) => (
          <DraggableCard key={p.runrunit_project_id} project={p} onClick={() => onOpen(p)} compact />
        ))}
      </div>
    </aside>
  );
}

// ---------- Project modal ----------
function ProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: PlanningProject | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dateStr, setDateStr] = useState<string>("");
  const [status, setStatus] = useState<PlanningStatus>("em andamento");
  const [detail, setDetail] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project) return;
    setDateStr(project.planning_date ?? "");
    setStatus(normalizePlanningStatus(project.planning_status));
    setDetail(project.detail ?? "");
  }, [project]);

  if (!project) return null;

  const save = async () => {
    setSaving(true);
    try {
      await upsertPlanning({
        planning_id: project.planning_id ?? undefined,
        runrunit_project_id: project.runrunit_project_id,
        planning_date: dateStr || null,
        planning_status: status,
        detail: detail || null,
      });
      toast.success("Planejamento salvo");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Falha ao salvar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const useRunrunDate = async () => {
    if (!project.planning_id) {
      setDateStr("");
      toast.info("Este projeto ainda não tem data manual salva.");
      return;
    }
    setSaving(true);
    try {
      await clearPlanningDate(project.planning_id);
      toast.success("Voltou a usar a data do Runrun.it");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Falha: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="leading-snug">{project.project_name}</DialogTitle>
          <DialogDescription>
            Dados do Runrun.it são somente leitura. A data, status e detalhes são internos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <ReadRow label="Cliente" value={project.client_name ?? "—"} />
          <ReadRow label="Grupo" value={project.project_group_name ?? "—"} />
          <ReadRow
            label="Data desejada (Runrun.it)"
            value={
              project.desired_delivery_date
                ? new Date(
                    (project.desired_delivery_date as string).length <= 10
                      ? `${project.desired_delivery_date}T00:00:00Z`
                      : (project.desired_delivery_date as string)
                  ).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                : "—"
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Data manual (opcional)
              </label>
              <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as PlanningStatus)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANNING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", PLANNING_STATUS_DOT[s])} />
                        {PLANNING_STATUS_LABEL[s]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Detalhes</label>
            <Textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={4}
              placeholder="Detalhes internos do planejamento…"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="mr-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={useRunrunDate}
            disabled={saving}
            title="Descartar data manual e voltar a seguir a data desejada do Runrun.it"
          >
            Usar data do Runrun.it
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Salvar</Button>
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

function DayListDialog({
  dateISO,
  items,
  onClose,
  onOpen,
}: {
  dateISO: string | null;
  items: PlanningProject[];
  onClose: () => void;
  onOpen: (p: PlanningProject) => void;
}) {
  if (!dateISO) return null;
  const d = parseISO(dateISO);
  return (
    <Dialog open={!!dateISO} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {d.getDate()} de {MONTH_NAMES[d.getMonth()]} de {d.getFullYear()}
          </DialogTitle>
          <DialogDescription>{items.length} projeto(s) planejado(s)</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto space-y-1.5">
          {items.map((p) => (
            <CompactCard key={p.runrunit_project_id} project={p} onClick={() => onOpen(p)} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}