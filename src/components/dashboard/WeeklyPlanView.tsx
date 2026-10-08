import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchWeeklyPlan } from "@/lib/weekly-plan";
import { computeMonthWeeks } from "@/lib/weekly-weeks";
import { monthlyTitleToDateISO, STATUS_DOT_CLASS, STATUS_LABEL } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import type { DashboardCard } from "@/routes/_authenticated/dashboard";

/**
 * Planejamento Semanal — visualização de leitura.
 *
 * Layout horizontal e compacto: Backlog + exatamente 5 semanas (segunda a
 * sexta, restritas ao mês selecionado). Sem drag & drop nesta etapa, sem
 * capacidade semanal e sem distribuição automática por data: cards sem
 * registro em `dashboard_weekly_plan` aparecem no Backlog.
 */

function WeeklyCardChip({
  card,
  onOpenCard,
}: {
  card: DashboardCard;
  onOpenCard?: (c: DashboardCard) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenCard?.(card)}
      className="w-[210px] shrink-0 rounded-[8px] border border-border/60 bg-card shadow-sm px-2.5 py-2 text-left flex flex-col gap-1 hover:border-primary/40 hover:bg-accent/40 transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT_CLASS[card.status])} />
        <span className="text-[10px] leading-none text-muted-foreground/70 truncate">
          {STATUS_LABEL[card.status]}
        </span>
      </div>
      <div className="text-[12px] font-semibold leading-[1.25] tracking-[-0.01em] line-clamp-2 break-words [overflow-wrap:anywhere]">
        {card.project.project_name}
      </div>
      <div className="text-[10px] leading-none text-muted-foreground/60 truncate">
        {card.project.client_name ?? "Sem cliente"}
      </div>
    </button>
  );
}

function WeeklyRow({
  title,
  subtitle,
  variant = "week",
  cards,
  onOpenCard,
  emptyLabel,
}: {
  title: string;
  subtitle?: string | null;
  variant?: "backlog" | "week";
  cards: DashboardCard[];
  onOpenCard?: (c: DashboardCard) => void;
  emptyLabel?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-2 rounded-lg",
        variant === "backlog" && "bg-muted/40 border border-dashed border-border/70",
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
      <div className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:thin]">
        <div className="flex gap-2 pb-0.5 min-h-[70px] items-start">
          {cards.length > 0 ? (
            cards.map((c) => <WeeklyCardChip key={c.key} card={c} onOpenCard={onOpenCard} />)
          ) : (
            <span className="text-[11px] text-muted-foreground/45 pt-6">{emptyLabel ?? ""}</span>
          )}
        </div>
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
}: {
  open: boolean;
  onClose: () => void;
  assigneeName: string;
  monthTitle: string;
  cards: DashboardCard[];
  onOpenCard?: (c: DashboardCard) => void;
}) {
  const referenceMonth = monthlyTitleToDateISO(monthTitle);

  const weeks = useMemo(() => {
    if (!referenceMonth) return [];
    const [y, m] = referenceMonth.split("-").map(Number);
    return computeMonthWeeks(y, m - 1);
  }, [referenceMonth]);

  // Ausência de registro = Backlog. Nenhuma distribuição por data.
  const { data: rows } = useQuery({
    queryKey: ["weekly-plan", assigneeName, referenceMonth],
    queryFn: () => fetchWeeklyPlan(assigneeName, referenceMonth as string),
    enabled: open && !!referenceMonth,
  });

  const planByProject = useMemo(() => {
    const m = new Map<number, { week: number | null; position: number }>();
    for (const r of rows ?? []) {
      m.set(r.runrunit_project_id, { week: r.week_number, position: r.position });
    }
    return m;
  }, [rows]);

  const backlogCards = useMemo(
    () =>
      cards.filter((c) => {
        const w = planByProject.get(c.runrunit_project_id);
        return !w || w.week === null;
      }),
    [cards, planByProject],
  );

  const weekCards = useMemo(
    () =>
      weeks.map((w) =>
        cards
          .filter((c) => planByProject.get(c.runrunit_project_id)?.week === w.index)
          .sort(
            (a, b) =>
              (planByProject.get(a.runrunit_project_id)?.position ?? 0) -
              (planByProject.get(b.runrunit_project_id)?.position ?? 0),
          ),
      ),
    [cards, weeks, planByProject],
  );

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[1080px] w-[95vw] gap-0 p-0 overflow-hidden">
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
              <span className="text-muted-foreground/80">{monthTitle}</span>
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="max-h-[74vh] overflow-y-auto px-4 py-3 space-y-2">
          <WeeklyRow
            title="Backlog"
            variant="backlog"
            cards={backlogCards}
            onOpenCard={onOpenCard}
            emptyLabel="Nenhum card"
          />

          <div className="h-px bg-border/60 my-1" />

          <div className="space-y-1.5">
            {weeks.map((w, i) => (
              <WeeklyRow
                key={w.index}
                title={`Semana ${w.index}`}
                subtitle={w.rangeLabel}
                cards={weekCards[i] ?? []}
                onOpenCard={onOpenCard}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
