import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUSES, STATUS_DOT_CLASS, STATUS_LABEL, type CardStatus } from "@/lib/dashboard";
import type { DashboardCard } from "@/routes/_authenticated/dashboard";
import { cn } from "@/lib/utils";

/**
 * Seletor de status extraído do ProjectCardView do Kanban mensal.
 *
 * É o MESMO controle de status usado no quadro mensal — mesma lista de
 * statuses selecionáveis e o mesmo callback `onStatusChange` (que no
 * dashboard aponta para `handleStatusChange`, persistindo em
 * `dashboard_project_cards`). Não há regra de status própria aqui.
 *
 * `onPointerDown`/`onClick` com `stopPropagation` impedem que o clique no
 * controle inicie um drag (dnd-kit) ou dispare o clique de abrir detalhes.
 */
export function CardStatusSelect({
  card,
  onStatusChange,
  className,
  triggerClassName,
  disabled = false,
}: {
  card: DashboardCard;
  onStatusChange: (c: DashboardCard, s: CardStatus) => void;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  // Selectable statuses exclude "em revisão" (only set by send-for-review action)
  const selectableStatuses = STATUSES.filter((s) => s !== "em revisão");
  return (
    <div
      className={cn("flex flex-col", className)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Select
        value={card.status}
        onValueChange={(v) => onStatusChange(card, v as CardStatus)}
        disabled={disabled}
      >
        <SelectTrigger
          className={cn(
            "h-6 text-[10px] leading-none px-2 py-0 bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/30 hover:text-foreground/80 data-[state=open]:bg-muted/30 focus:ring-0 focus:ring-offset-0 shadow-none",
            triggerClassName,
          )}
        >
          <SelectValue>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn("h-1.5 w-1.5 rounded-full opacity-70", STATUS_DOT_CLASS[card.status])}
              />
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
  );
}
