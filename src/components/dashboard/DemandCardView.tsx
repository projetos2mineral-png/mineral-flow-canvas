import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  Clock,
  GripVertical,
  ListChecks,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDesiredDate, type DemandBoardCard } from "@/lib/dashboard-demands";
import {
  formatHoursHHMM,
  updateDemandAssigneeKanbanStatus,
} from "@/lib/manual-demands";
import {
  STATUS_CARD_CLASS,
  STATUS_DOT_CLASS,
  STATUS_LABEL,
  STATUSES,
  type CardStatus,
} from "@/lib/dashboard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface DemandCardViewProps {
  card: DemandBoardCard;
  className?: string;
  /** Abre o modal do card (checklist e marcações individuais). */
  onOpenCard?: (card: DemandBoardCard) => void;
  /** Oculta o seletor em prévias de arraste. */
  showStatus?: boolean;
  disabled?: boolean;
}

/** Seletor padronizado de status para cards de Demandas Avulsas. */
export function DemandStatusSelect({
  status,
  onChange,
  disabled = false,
  title,
  className,
}: {
  status: CardStatus;
  onChange: (status: CardStatus) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("min-w-0", className)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Select
        value={status}
        onValueChange={(value) => onChange(value as CardStatus)}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label="Status da demanda avulsa"
          title={title}
          className="h-7 w-full rounded-lg border-border/60 bg-background/70 px-2.5 py-0 text-[11px] leading-none text-muted-foreground shadow-none hover:bg-background hover:text-foreground data-[state=open]:bg-background focus:ring-0 focus:ring-offset-0"
        >
          <SelectValue>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full opacity-70", STATUS_DOT_CLASS[status])} />
              {STATUS_LABEL[status]}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((option) => (
            <SelectItem key={option} value={option} className="text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[option])} />
                {STATUS_LABEL[option]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Card de Demanda Avulsa no Painel Geral.
 * Identidade visual própria (azul-turquesa) para diferenciar dos projetos
 * do Runrun.it, cuja aparência permanece inalterada.
 */
export function DemandCardView({
  card,
  className,
  onOpenCard,
  showStatus = true,
  disabled = false,
}: DemandCardViewProps) {
  const qc = useQueryClient();
  const { demand, ownHours } = card;
  const assignee = demand.assignees.find(
    (person) => person.id && person.id === card.assigneeRowId,
  );
  const [status, setStatus] = useState<CardStatus>(assignee?.kanban_status ?? "a iniciar");
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setStatus(assignee?.kanban_status ?? "a iniciar");
  }, [assignee?.kanban_status, card.key]);

  const handleStatusChange = async (nextStatus: CardStatus) => {
    if (!card.assigneeRowId) return;
    const previous = status;
    setStatus(nextStatus);
    try {
      await updateDemandAssigneeKanbanStatus(card.assigneeRowId, nextStatus);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["manual-demands"] }),
        qc.invalidateQueries({ queryKey: ["dashboard", "cards"] }),
      ]);
    } catch (error) {
      setStatus(previous);
      toast.error(`Não foi possível atualizar o status: ${(error as Error).message}`);
    }
  };

  return (
    <div
      style={{ padding: "var(--kb-card-pad)" }}
      role={onOpenCard ? "button" : undefined}
      tabIndex={onOpenCard ? 0 : undefined}
      onPointerDown={
        onOpenCard
          ? (e) => {
              pointerStart.current = { x: e.clientX, y: e.clientY };
            }
          : undefined
      }
      onClick={
        onOpenCard
          ? (e) => {
              const start = pointerStart.current;
              pointerStart.current = null;
              // Um arraste não deve abrir o modal ao soltar o card.
              if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
              onOpenCard(card);
            }
          : undefined
      }
      onKeyDown={
        onOpenCard
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenCard(card);
              }
            }
          : undefined
      }
      className={cn(
        "flex h-[176px] min-h-[176px] flex-col justify-between overflow-hidden rounded-[8px] border border-border/60 shadow-sm transition-shadow",
        STATUS_CARD_CLASS[status],
        onOpenCard &&
          "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 items-start gap-2">
        <GripVertical className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/25" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <p className="h-[3.9em] w-full shrink-0 self-start line-clamp-3 break-words text-left text-[13px] font-semibold leading-[1.3] tracking-[-0.015em] [overflow-wrap:anywhere]">
                  {demand.name}
                </p>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={6}
                className="max-w-[280px] whitespace-normal break-words border border-neutral-200 bg-white text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                {demand.name}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground/80">
              <Building2 className="h-3 w-3 shrink-0 opacity-60" />
              <span className="truncate font-normal">{demand.client_name || "Sem cliente"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground/70">
              <CalendarDays className="h-3 w-3 shrink-0 opacity-50" />
              <span className="font-mono tabular-nums tracking-tight">
                {formatDesiredDate(demand.desired_date)}
              </span>
            </div>
          </div>

          {(assignee?.checklist_items?.length || ownHours > 0 || card.is_tec || card.is_geo || card.is_rev || card.is_campo) ? (
            <div className="flex items-center gap-3.5 text-[11px] leading-4 text-muted-foreground/60">
              {assignee?.checklist_items?.length ? (
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="tabular-nums">{assignee.checklist_items.length}</span>
                </span>
              ) : null}
              {ownHours > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="tabular-nums">{formatHoursHHMM(ownHours)}</span>
                </span>
              ) : null}
              {(card.is_tec || card.is_geo || card.is_rev || card.is_campo) ? (
                <span aria-label="Classificações da demanda" className="ml-auto inline-flex shrink-0 items-center gap-1 text-[9px] leading-3">
                  {card.is_tec && <span className="rounded-[3px] bg-blue-100 px-1 py-px font-semibold tracking-wide text-blue-700">TEC</span>}
                  {card.is_geo && <span className="rounded-[3px] bg-green-100 px-1 py-px font-semibold tracking-wide text-green-700">GEO</span>}
                  {card.is_rev && <span className="rounded-[3px] bg-purple-100 px-1 py-px font-semibold tracking-wide text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">REV</span>}
                  {card.is_campo && <span className="rounded-[3px] bg-orange-100 px-1 py-px font-semibold tracking-wide text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">CAM</span>}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {showStatus ? (
        <div className="mt-auto shrink-0 pt-2">
          <DemandStatusSelect
            status={status}
            onChange={(nextStatus) => void handleStatusChange(nextStatus)}
            disabled={disabled || !card.assigneeRowId}
            title="Alterar status do card"
          />
        </div>
      ) : null}
    </div>
  );
}
