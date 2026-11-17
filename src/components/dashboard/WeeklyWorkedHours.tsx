import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatHours } from "@/lib/capacity-overview";
import { normalizeAssigneeName } from "@/lib/dashboard";
import { fetchDailyWorkedHours } from "@/lib/worked-hours";
import { todayInTimeZone } from "@/lib/worked-hours/period";
import {
  currentWeekStartISO,
  formatWeekRange,
  shiftWeekISO,
  summarizeWeeklyWorkedHours,
  weekRangeFromStart,
} from "@/lib/worked-hours/week";
import { cn } from "@/lib/utils";

export function WeeklyWorkedHoursButton({
  assignee,
  className,
}: {
  assignee: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(() => currentWeekStartISO());
  const currentWeek = currentWeekStartISO();
  const today = todayInTimeZone();
  const disabled = !assignee || assignee === "Sem responsável";

  useEffect(() => {
    setWeekStart(currentWeekStartISO());
  }, [assignee]);

  const range = useMemo(() => weekRangeFromStart(weekStart), [weekStart]);
  const worked = useQuery({
    queryKey: ["dashboard", "worked-hours", "week", normalizeAssigneeName(assignee), range.start],
    queryFn: () => fetchDailyWorkedHours(range),
    enabled: open && !disabled,
  });

  const summary = useMemo(
    () => summarizeWeeklyWorkedHours(worked.data ?? [], assignee, range.start),
    [worked.data, assignee, range.start],
  );
  const maxDaySeconds = Math.max(1, ...summary.days.map((day) => day.totalSeconds));
  const isCurrentWeek = range.start === currentWeek;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="Ver horas trabalhadas na semana"
        title="Horas efetivamente trabalhadas na semana"
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 text-[11px] font-medium leading-none text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        <span className="hidden sm:inline">Horas</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[660px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horas trabalhadas
            </DialogTitle>
            <DialogDescription>
              Horas efetivamente registradas no Runrun.it para{" "}
              <span className="font-medium text-foreground">{assignee}</span>. Não inclui horas
              planejadas ou capacidade.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Semana anterior"
                title="Semana anterior"
                onClick={() => setWeekStart((value) => shiftWeekISO(value, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="min-w-0 text-center">
                <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span>{formatWeekRange(range.start)}</span>
                  {isCurrentWeek && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Semana atual
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">Segunda a domingo</div>
              </div>

              <div className="flex items-center gap-1">
                {!isCurrentWeek && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setWeekStart(currentWeek)}
                  >
                    Hoje
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Próxima semana"
                  title="Próxima semana"
                  onClick={() => setWeekStart((value) => shiftWeekISO(value, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Acumulado semanal</div>
                <div className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                  {worked.isLoading ? "…" : formatHours(summary.totalSeconds / 3600)}
                </div>
              </div>
              <div className="text-right text-xs leading-relaxed text-muted-foreground">
                <div>
                  {summary.daysWithRecords} dia{summary.daysWithRecords === 1 ? "" : "s"} com
                  registro{summary.daysWithRecords === 1 ? "" : "s"}
                </div>
                <div>Total das horas diárias</div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Detalhamento diário
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                {summary.days.map((day) => (
                  <div
                    key={day.date}
                    className={cn(
                      "rounded-lg border border-border bg-card px-2.5 py-2",
                      day.date === today && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {day.weekday}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{day.dayLabel}</div>
                    <div
                      className={cn(
                        "mt-1 text-sm font-semibold tabular-nums",
                        day.totalSeconds > 0 ? "text-foreground" : "text-muted-foreground/60",
                      )}
                    >
                      {worked.isLoading ? "…" : formatHours(day.totalSeconds / 3600)}
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/60"
                        style={{
                          width: `${Math.max(0, Math.min(100, (day.totalSeconds / maxDaySeconds) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {!worked.isLoading && summary.daysWithRecords === 0 && (
                <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma hora trabalhada registrada nesta semana para este responsável.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
