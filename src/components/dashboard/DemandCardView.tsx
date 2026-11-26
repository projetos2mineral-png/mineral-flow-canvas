import { useRef } from "react";
import { Building2, CalendarDays, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDesiredDate, type DemandBoardCard } from "@/lib/dashboard-demands";
import { formatHoursHHMM } from "@/lib/manual-demands";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface DemandCardViewProps {
  card: DemandBoardCard;
  className?: string;
  /** Abre o modal do card (checklist e marcações individuais). */
  onOpenCard?: (card: DemandBoardCard) => void;
}

/**
 * Card de Demanda Avulsa no Painel Geral.
 * Identidade visual própria (azul-turquesa) para diferenciar dos projetos
 * do Runrun.it, cuja aparência permanece inalterada.
 */
export function DemandCardView({ card, className, onOpenCard }: DemandCardViewProps) {
  const { demand, people, ownHours, assigneeName } = card;
  // Colegas aparecem só pelo nome: a estimativa do card é SEMPRE individual.
  const others = people.filter((p) => p.name !== assigneeName).map((p) => p.name);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

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
        "rounded-[8px] border shadow-sm transition-shadow",
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
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-200">
              Demanda avulsa
            </span>
          </div>
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
            {others.length > 0 && (
              <div className="flex items-start gap-1.5" title={`Também com: ${others.join(", ")}`}>
                <Users className="h-3 w-3 shrink-0 mt-0.5" />
                <span className="truncate">Também com: {others.join(", ")}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatHoursHHMM(ownHours)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
