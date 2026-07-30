import { useCallback, useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modos de densidade do Kanban. Afetam apenas largura de coluna,
 * espaçamentos e padding dos cards — nenhuma regra de negócio.
 */
export const DENSITY_MODES = ["compacta", "padrao", "confortavel"] as const;
export type DensityMode = (typeof DENSITY_MODES)[number];

export const DENSITY_LABEL: Record<DensityMode, string> = {
  compacta: "Compacta",
  padrao: "Padrão",
  confortavel: "Confortável",
};

type DensityVars = {
  "--kb-col": string;
  "--kb-gap": string;
  "--kb-pad": string;
  "--kb-card-pad": string;
  "--kb-card-gap": string;
  "--kb-head-py": string;
};

export const DENSITY_VARS: Record<DensityMode, DensityVars> = {
  compacta: {
    "--kb-col": "clamp(220px, 17vw, 240px)",
    "--kb-gap": "0.5rem",
    "--kb-pad": "0.75rem",
    "--kb-card-pad": "0.5rem",
    "--kb-card-gap": "0.375rem",
    "--kb-head-py": "0.3rem",
  },
  padrao: {
    "--kb-col": "clamp(250px, 19vw, 270px)",
    "--kb-gap": "0.625rem",
    "--kb-pad": "1rem",
    "--kb-card-pad": "0.625rem",
    "--kb-card-gap": "0.5rem",
    "--kb-head-py": "0.4rem",
  },
  confortavel: {
    "--kb-col": "clamp(300px, 23vw, 320px)",
    "--kb-gap": "1rem",
    "--kb-pad": "1.25rem",
    "--kb-card-pad": "0.875rem",
    "--kb-card-gap": "0.75rem",
    "--kb-head-py": "0.625rem",
  },
};

const STORAGE_KEY = "kanban:density";

function isDensityMode(v: unknown): v is DensityMode {
  return typeof v === "string" && (DENSITY_MODES as readonly string[]).includes(v);
}

/**
 * Lê/escreve a preferência de densidade. A leitura acontece após a
 * montagem para evitar divergência de hidratação no SSR.
 */
export function useKanbanDensity() {
  const [density, setDensityState] = useState<DensityMode>("padrao");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isDensityMode(saved)) setDensityState(saved);
    } catch {
      /* localStorage indisponível — mantém o padrão */
    }
  }, []);

  const setDensity = useCallback((next: DensityMode) => {
    setDensityState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { density, setDensity, vars: DENSITY_VARS[density] as React.CSSProperties };
}

export interface DensityControlProps {
  value: DensityMode;
  onChange: (next: DensityMode) => void;
  className?: string;
}

export function DensityControl({ value, onChange, className }: DensityControlProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5",
        className
      )}
      role="group"
      aria-label="Densidade de visualização do Kanban"
    >
      <Maximize2 className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {DENSITY_MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          title={`Visualização ${DENSITY_LABEL[m]}`}
          className={cn(
            "rounded px-2 py-1 text-[12px] leading-none transition-colors",
            value === m
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {DENSITY_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
