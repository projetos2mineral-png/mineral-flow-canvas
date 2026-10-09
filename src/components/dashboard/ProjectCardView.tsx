import { GripVertical, Building2, CalendarDays, ListChecks, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CardStatusSelect } from "@/components/dashboard/CardStatusSelect";
import { estimateSourceLabel, STATUS_CARD_CLASS, type CardStatus } from "@/lib/dashboard";
import { formatHoursCompact } from "@/lib/kanban-capacity";
import { cn } from "@/lib/utils";
import type { DashboardCard } from "@/routes/_authenticated/dashboard";

/**
 * Card de projeto do Kanban mensal, compartilhado com o Planejamento
 * Semanal (WeeklyPlanView). Mesmo markup, mesmos estilos e mesmos
 * comportamentos nas duas visualizações: status + cor, seletor de status,
 * estimativa, tooltip do título, truncamento, ícones, hover, clique e
 * abertura de detalhes via `onOpenCard`.
 *
 * `disabled` desliga o seletor de status (Kanban mensal nunca passa);
 * `dragging` e `isAdmin` controlam apenas sombra e linhas administrativas.
 */
export function ProjectCardView({
  card,
  onStatusChange,
  onOpenCard,
  dragging,
  isAdmin = false,
  disabled = false,
}: {
  card: DashboardCard;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  onOpenCard: (c: DashboardCard) => void;
  dragging?: boolean;
  isAdmin?: boolean;
  disabled?: boolean;
}) {
  const p = card.project;
  const hasNote = !!(card.internal_note && card.internal_note.trim());
  const totalTasks = card.card?.total_tasks ?? null;
  const rawHours = card.card?.total_estimated_hours ?? null;
  const estimatedHours =
    rawHours == null
      ? null
      : Number(rawHours) % 1 === 0
        ? Number(rawHours)
        : Number(rawHours).toFixed(1);
  const sourceLabel = estimateSourceLabel(card.card?.calculation_details ?? null);
  return (
    <div
      style={{ padding: "var(--kb-card-pad, 0.625rem)" }}
      className={cn(
        "rounded-[8px] border border-border/60 shadow-sm flex flex-col justify-between bg-card",
        "h-[176px] min-h-[176px] overflow-hidden",
        STATUS_CARD_CLASS[card.status],
        dragging ? "shadow-md" : "",
      )}
    >
      <div className="flex items-start gap-2 flex-1 min-h-0">
        <GripVertical className="h-3 w-3 mt-1 text-muted-foreground/25 shrink-0" />
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onOpenCard(card)}
                  className="w-full shrink-0 h-[3.9em] self-start text-left font-semibold text-[13px] leading-[1.3] tracking-[-0.015em] line-clamp-3 break-words [overflow-wrap:anywhere] hover:text-primary transition-colors cursor-pointer"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  {p.project_name}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={6}
                className="max-w-[280px] whitespace-normal break-words bg-white text-neutral-900 border border-neutral-200 shadow-sm dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700"
              >
                {p.project_name}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

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
                      : (p.desired_delivery_date as string),
                  ).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                </span>
              </div>
            )}
          </div>
          {/* Linha visível diretamente na frente do card — apenas para ADMINISTRADOR */}
          {(isAdmin || rawHours != null) && (
            <div className="flex items-center gap-3.5 text-[11px] leading-4 text-muted-foreground/60">
              {isAdmin && (
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="tabular-nums">{totalTasks != null ? `${totalTasks}` : "—"}</span>
                </span>
              )}
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
      <CardStatusSelect
        card={card}
        onStatusChange={onStatusChange}
        disabled={disabled}
        className="mt-auto pt-2 flex flex-col shrink-0"
      />
    </div>
  );
}
