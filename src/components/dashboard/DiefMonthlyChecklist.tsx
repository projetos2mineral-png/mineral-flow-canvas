import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DIEF_MONTHS, checkedMonths } from "@/lib/dief-checklist";

export interface DiefMonthlyChecklistProps {
  idPrefix: string;
  selections: string[];
  disabled: boolean;
  onToggle: (month: number, on: boolean) => void;
}

/** Linha compacta com os 12 meses; rola horizontalmente em telas estreitas. */
export function DiefMonthlyChecklist({ idPrefix, selections, disabled, onToggle }: DiefMonthlyChecklistProps) {
  const done = checkedMonths(selections);
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Checklist mensal</Label>
        <span className="text-[10px] text-muted-foreground tabular-nums">{done.size}/12</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <ul className="flex min-w-max gap-1">
          {DIEF_MONTHS.map((label, i) => {
            const month = i + 1;
            const id = `${idPrefix}-mes-${month}`;
            return (
              <li key={label} className="flex w-9 flex-col items-center gap-1 rounded py-1 hover:bg-accent/50">
                <label htmlFor={id} className="cursor-pointer text-[10px] text-muted-foreground">{label}</label>
                <Checkbox
                  id={id}
                  checked={done.has(month)}
                  disabled={disabled}
                  onCheckedChange={(v) => onToggle(month, v === true)}
                  className="h-3.5 w-3.5"
                  aria-label={`Marcar ${label}`}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
