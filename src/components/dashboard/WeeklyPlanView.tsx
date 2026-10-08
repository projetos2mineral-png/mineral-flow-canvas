import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  DragOverlay,
  useDroppable,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  fetchWeeklyPlan,
  upsertWeeklyPlacement,
  moveToBacklog,
  bulkUpdateWeeklyPositions,
  type WeeklyPlanRow,
} from "@/lib/weekly-plan";
import { computeMonthWeeks } from "@/lib/weekly-weeks";
import { planWeeklyMove } from "@/lib/weekly-move";
import { monthlyTitleToDateISO, type CardStatus } from "@/lib/dashboard";
import { ProjectCardView } from "@/components/dashboard/ProjectCardView";
import { cn } from "@/lib/utils";
import type { DashboardCard } from "@/routes/_authenticated/dashboard";

/**
 * Planejamento Semanal — visualização com drag & drop.
 *
 * Layout horizontal e compacto: Backlog + exatamente 5 semanas (segunda a
 * sexta, restritas ao mês selecionado). Sem capacidade semanal e sem
 * distribuição automática por data: cards sem registro em
 * `dashboard_weekly_plan` aparecem no Backlog.
 *
 * Dimensões de persistência:
 *  - Mover/reordenar → SOMENTE `dashboard_weekly_plan` (nunca toca em
 *    `dashboard_project_cards`, `lane_id`, `position` ou
 *    `manually_positioned` do Kanban mensal);
 *  - Status → mesmo `handleStatusChange` do Kanban mensal (via
 *    `CardStatusSelect`), alterando o status real do card.
 *
 * Identidade de uma colocação semanal: runrunit_project_id +
 * assignee_name + reference_month. `week_number = null` (ou ausência de
 * linha) = Backlog.
 */

/** 0 = Backlog; 1..5 = Semana 1..5 */
const BUCKET_BACKLOG = 0;

const rowIdForBucket = (bucket: number) => `wrow:${bucket}`;

/**
 * Linhas são largas e baixas: `closestCorners` acaba preferindo cards
 * próximo ao ponteiro em vez da linha que o contém (drops nas semanas
 * 1-3 eram roubados por cards do Backlog). `pointerWithin` resolve a
 * linha sob o ponteiro; o fallback cobre os gaps entre linhas.
 */
const weeklyCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  return collisions.length > 0 ? collisions : closestCenter(args);
};

function WeeklySortableCard({
  card,
  onOpenCard,
  onStatusChange,
  disabled = false,
  isAdmin = false,
}: {
  card: DashboardCard;
  onOpenCard?: (c: DashboardCard) => void;
  onStatusChange?: (c: DashboardCard, s: CardStatus) => void;
  disabled?: boolean;
  isAdmin?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.key,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="shrink-0 w-[var(--kb-col,260px)]"
    >
      <ProjectCardView
        card={card}
        onStatusChange={onStatusChange ?? (() => {})}
        onOpenCard={onOpenCard ?? (() => {})}
        disabled={disabled}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function WeeklyRow({
  bucket,
  title,
  subtitle,
  variant = "week",
  cards,
  onOpenCard,
  onStatusChange,
  disabled = false,
  isAdmin = false,
  isCurrentWeek = false,
  emptyLabel,
}: {
  bucket: number;
  title: string;
  subtitle?: string | null;
  variant?: "backlog" | "week";
  cards: DashboardCard[];
  onOpenCard?: (c: DashboardCard) => void;
  onStatusChange?: (c: DashboardCard, s: CardStatus) => void;
  disabled?: boolean;
  isAdmin?: boolean;
  isCurrentWeek?: boolean;
  emptyLabel?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: rowIdForBucket(bucket) });
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-2 rounded-lg bg-muted/40",
        variant === "backlog" && "border border-dashed border-border/70",
        isCurrentWeek && "border border-red-600/50",
      )}
    >
      <div className="w-[124px] shrink-0 pt-1">
        <div
          className={cn(
            "text-[11px] font-medium uppercase tracking-wider leading-none",
            variant === "backlog" ? "text-foreground/70" : "text-muted-foreground/80",
          )}
        >
          {title}
        </div>
        {subtitle && (
          <div className="mt-1 text-[10px] leading-none text-muted-foreground/60 font-mono tabular-nums">
            {subtitle}
          </div>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-w-0 overflow-x-auto [scrollbar-width:thin] rounded-md transition-colors",
          isOver && "bg-primary/5",
        )}
      >
        <SortableContext items={cards.map((c) => c.key)} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-2 pb-0.5 min-h-[70px] items-start">
            {cards.length > 0 ? (
              cards.map((c) => (
                <WeeklySortableCard
                  key={c.key}
                  card={c}
                  onOpenCard={onOpenCard}
                  onStatusChange={onStatusChange}
                  disabled={disabled}
                  isAdmin={isAdmin}
                />
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground/45 pt-6">{emptyLabel ?? ""}</span>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export function WeeklyPlanView({
  open,
  onClose,
  assigneeName,
  monthTitle,
  cards,
  onOpenCard,
  onStatusChange,
  readOnly = false,
  isAdmin = false,
}: {
  open: boolean;
  onClose: () => void;
  assigneeName: string;
  monthTitle: string;
  cards: DashboardCard[];
  onOpenCard?: (c: DashboardCard) => void;
  onStatusChange?: (c: DashboardCard, s: CardStatus) => void;
  readOnly?: boolean;
  isAdmin?: boolean;
}) {
  const referenceMonth = monthlyTitleToDateISO(monthTitle);
  const qc = useQueryClient();

  const weeks = useMemo(() => {
    if (!referenceMonth) return [];
    const [y, m] = referenceMonth.split("-").map(Number);
    return computeMonthWeeks(y, m - 1);
  }, [referenceMonth]);

  /**
   * Semana destacada: a que contém a data local de hoje. `null` quando o
   * mês selecionado não inclui a data atual → nenhum destaque.
   */
  const currentWeekBucket = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const idx = weeks.findIndex((w) => today >= w.start && today <= w.end);
    return idx >= 0 ? idx + 1 : null;
  }, [weeks]);

  // Ausência de registro = Backlog. Nenhuma distribuição por data.
  const { data: rows } = useQuery({
    queryKey: ["weekly-plan", assigneeName, referenceMonth],
    queryFn: () => fetchWeeklyPlan(assigneeName, referenceMonth as string),
    enabled: open && !!referenceMonth,
  });

  // Estado otimista: aplicado no drop, descartado quando o servidor responde
  // (refetch após invalidateQueries) ou quando um drop falha.
  const [localRows, setLocalRows] = useState<WeeklyPlanRow[] | null>(null);
  useEffect(() => setLocalRows(null), [rows]);
  const effectiveRows = useMemo(() => localRows ?? rows ?? [], [localRows, rows]);

  const entryByProject = useMemo(() => {
    const m = new Map<number, WeeklyPlanRow>();
    for (const r of effectiveRows) m.set(r.runrunit_project_id, r);
    return m;
  }, [effectiveRows]);

  /** Listas exibidas: índice = bucket (0=Backlog, 1..5). */
  const buckets = useMemo(() => {
    const out: DashboardCard[][] = [[], [], [], [], [], []];
    for (const c of cards) {
      const e = entryByProject.get(c.runrunit_project_id);
      const b = e ? (e.week_number ?? BUCKET_BACKLOG) : BUCKET_BACKLOG;
      out[b].push(c);
    }
    // Com registro → ordena por `position` (esquerda = maior prioridade);
    // sem registro → mantém a ordem do Kanban (sort estável).
    for (const list of out) {
      list.sort((a, b) => {
        const ea = entryByProject.get(a.runrunit_project_id);
        const eb = entryByProject.get(b.runrunit_project_id);
        const ka = ea ? 0 : 1;
        const kb = eb ? 0 : 1;
        if (ka !== kb) return ka - kb;
        if (ea && eb) return ea.position - eb.position;
        return 0;
      });
    }
    return out;
  }, [cards, entryByProject]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeCard = activeKey ? (cards.find((c) => c.key === activeKey) ?? null) : null;

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["weekly-plan", assigneeName, referenceMonth] });

  const onDragStart = (e: DragStartEvent) => setActiveKey(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveKey(null);
    if (readOnly) return;
    const { active, over } = e;
    if (!over || !referenceMonth) return;

    const activeKeyStr = String(active.id);
    const overId = String(over.id);
    if (!cards.some((c) => c.key === activeKeyStr)) return;

    // Lógica pura da movimentação (ordem + operações) em src/lib/weekly-move.ts
    const plan = planWeeklyMove({ buckets, entryByProject, activeKey: activeKeyStr, overId });
    if (!plan) return;
    const { bulkUpdates, upserts } = plan;

    // ---- UI imediata (otimista) ----
    const nextRows: WeeklyPlanRow[] = effectiveRows.map((r) => {
      const b = bulkUpdates.find((u) => u.id === r.id);
      return b ? { ...r, week_number: b.week_number, position: b.position } : r;
    });
    for (const u of upserts) {
      const tmp: WeeklyPlanRow = {
        id: `tmp:${u.projectId}`,
        runrunit_project_id: u.projectId,
        assignee_name: assigneeName,
        reference_month: referenceMonth,
        week_number: u.week,
        position: u.position,
        created_at: null,
        updated_at: null,
      };
      const idx = nextRows.findIndex(
        (r) => r.runrunit_project_id === u.projectId && r.id.startsWith("tmp:"),
      );
      if (idx >= 0) nextRows[idx] = tmp;
      else nextRows.push(tmp);
    }
    setLocalRows(nextRows);

    // ---- Persistência (SOMENTE dashboard_weekly_plan) ----
    try {
      if (bulkUpdates.length) await bulkUpdateWeeklyPositions(bulkUpdates);
      for (const u of upserts) {
        if (u.week === null) {
          await moveToBacklog({
            runrunitProjectId: u.projectId,
            assigneeName,
            referenceMonth,
            position: u.position,
          });
        } else {
          await upsertWeeklyPlacement({
            runrunitProjectId: u.projectId,
            assigneeName,
            referenceMonth,
            weekNumber: u.week,
            position: u.position,
          });
        }
      }
      invalidate();
    } catch (err) {
      // Reverte o otimista e volta ao estado do servidor
      setLocalRows(null);
      invalidate();
      toast.error("Falha ao atualizar planejamento semanal: " + (err as Error).message);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[96vw] max-w-[1650px] h-[92vh] gap-0 p-0 overflow-hidden flex flex-col">
        <DndContext
          sensors={sensors}
          collisionDetection={weeklyCollisionDetection}
          onDragStart={readOnly ? undefined : onDragStart}
          onDragEnd={readOnly ? undefined : onDragEnd}
        >
          <DialogHeader className="px-4 pt-3 pb-3 border-b border-border/60 bg-card text-left">
            <div className="flex items-center gap-3 pr-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Voltar ao Kanban
              </Button>
              <DialogTitle className="text-[13px] font-medium tracking-wide leading-none">
                <span className="text-foreground/85">{assigneeName}</span>
                <span className="mx-1.5 text-muted-foreground/50">—</span>
                <span className="text-foreground/80">{monthTitle}</span>
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
            <WeeklyRow
              bucket={BUCKET_BACKLOG}
              title="Backlog"
              variant="backlog"
              cards={buckets[BUCKET_BACKLOG]}
              onOpenCard={onOpenCard}
              onStatusChange={onStatusChange}
              disabled={readOnly}
              isAdmin={isAdmin}
              emptyLabel="Nenhum card"
            />

            <div className="h-px bg-border/60 my-1" />

            <div className="space-y-1.5">
              {weeks.map((w, i) => (
                <WeeklyRow
                  key={w.index}
                  bucket={i + 1}
                  title={`Semana ${w.index}`}
                  subtitle={w.rangeLabel}
                  cards={buckets[i + 1]}
                  onOpenCard={onOpenCard}
                  onStatusChange={onStatusChange}
                  disabled={readOnly}
                  isAdmin={isAdmin}
                  isCurrentWeek={i + 1 === currentWeekBucket}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="pointer-events-none w-[var(--kb-col,260px)]">
                <ProjectCardView
                  card={activeCard}
                  onStatusChange={() => {}}
                  onOpenCard={() => {}}
                  dragging
                  isAdmin={isAdmin}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </DialogContent>
    </Dialog>
  );
}
