import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  Clock,
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
          className="h-6 min-w-[118px] text-[10px] leading-none px-2 py-0 bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/30 hover:text-foreground/80 data-[state=open]:bg-muted/30 focus:ring-0 focus:ring-offset-0 shadow-none"
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
  const { demand, people, ownHours, assigneeName } = card;
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
        "flex flex-col rounded-[8px] border shadow-sm transition-shadow",
        "border-teal-300 bg-teal-50 text-teal-950",
        "dark:border-teal-800/70 dark:bg-[#0C3A3A] dark:text-teal-50",
        onOpenCard &&
          "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <div className="flex items-start gap-1.5">
        <span
          aria-hidden
          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-500"
        />
        <div className="min-w-0 flex-1">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug">
                  {demand.name}
                </p>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={6}
                className="max-w-[280px] whitespace-normal break-words bg-white text-neutral-900 border border-neutral-200 shadow-sm dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700"
              >
                {demand.name}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="mt-1 space-y-0.5 text-[12px] opacity-80">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{demand.client_name || "Sem cliente"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span>{formatDesiredDate(demand.desired_date)}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatHoursHHMM(ownHours)}</span>
            </div>
          </div>
        </div>
      </div>
      {showStatus ? (
        <div className="mt-2 flex justify-end border-t border-border/40 pt-1.5">
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
