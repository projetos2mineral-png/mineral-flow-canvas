import { Columns3, Rows3 } from "lucide-react";
import {
  KANBAN_ORIENTATIONS,
  type KanbanOrientation,
} from "@/components/dashboard/KanbanOrientation";
import { cn } from "@/lib/utils";

const OPTION_CLASS: Record<
  KanbanOrientation,
  { icon: typeof Columns3; label: string; title: string; aria: string }
> = {
  vertical: {
    icon: Columns3,
    label: "Vertical",
    title: "Filas em colunas (padrão)",
    aria: "Orientação vertical: filas em colunas",
  },
  horizontal: {
    icon: Rows3,
    label: "Horizontal",
    title: "Filas em linhas horizontais",
    aria: "Orientação horizontal: filas em linhas",
  },
};

/**
 * Seletor discreto de orientação das filas do Kanban mensal. Trocar a
 * orientação muda exclusivamente a disposição na tela — nunca a ordem, o
 * mês, o responsável, o status ou qualquer dado dos cards.
 */
export function OrientationToggle({
  value,
  onChange,
  className,
}: {
  value: KanbanOrientation;
  onChange: (next: KanbanOrientation) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5",
        className,
      )}
      role="group"
      aria-label="Orientação das filas"
    >
      {KANBAN_ORIENTATIONS.map((o) => {
        const opt = OPTION_CLASS[o];
        const Icon = opt.icon;
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={active}
            title={`${opt.title}${active ? " (ativado)" : ""} — trocar a orientação não altera nenhum dado dos cards`}
            aria-label={opt.aria}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium leading-none transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
