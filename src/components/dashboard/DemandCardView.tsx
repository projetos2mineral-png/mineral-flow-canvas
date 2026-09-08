import { Building2, CalendarDays, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDesiredDate, type DemandBoardCard } from "@/lib/dashboard-demands";
import { formatHoursHHMM } from "@/lib/manual-demands";

export interface DemandCardViewProps {
  card: DemandBoardCard;
  className?: string;
}

/**
 * Card de Demanda Avulsa no Painel Geral.
 * Identidade visual própria (azul-turquesa) para diferenciar dos projetos
 * do Runrun.it, cuja aparência permanece inalterada.
 */
export function DemandCardView({ card, className }: DemandCardViewProps) {
  const { demand, people, totalHours, ownHours } = card;

  return (
    <div
      style={{ padding: "var(--kb-card-pad)" }}
      className={cn(
        "rounded-[8px] border shadow-sm transition-shadow",
        "border-teal-300 bg-teal-50 text-teal-950",
        "dark:border-teal-800/70 dark:bg-[#0C3A3A] dark:text-teal-50",
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
          <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug">
            {demand.name}
          </p>

          <div className="mt-1 space-y-0.5 text-[12px] opacity-80">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{demand.client_name || "Sem cliente"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span>{formatDesiredDate(demand.desired_date)}</span>
            </div>
            <div className="flex items-start gap-1.5">
              <Users className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="truncate">
                {people
                  .map((p) => `${p.name} (${formatHoursHHMM(p.hours)})`)
                  .join(" · ")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              <span>
                Total {formatHoursHHMM(totalHours)}
                {people.length > 1 ? ` · nesta fila ${formatHoursHHMM(ownHours)}` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
