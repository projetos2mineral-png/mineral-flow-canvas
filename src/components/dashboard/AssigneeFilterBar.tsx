import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const UNASSIGNED_LABEL = "Sem responsável";

function getCompactDisplayNames(assignees: string[]): Map<string, string> {
  const result = new Map<string, string>();
  type Item = { original: string; tokens: string[] };
  const items: Item[] = assignees.map((a) => ({
    original: a,
    tokens: a.trim().split(/\s+/).filter(Boolean),
  }));
  const toGroup: Item[] = [];
  for (const it of items) {
    if (it.original === UNASSIGNED_LABEL) {
      result.set(it.original, it.original);
    } else {
      toGroup.push(it);
    }
  }
  const groups = new Map<string, Item[]>();
  for (const it of toGroup) {
    const key = (it.tokens[0] ?? "").toLowerCase();
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }
  for (const [, group] of groups) {
    if (group.length === 1) {
      const it = group[0];
      result.set(it.original, it.tokens[0] ?? it.original);
      continue;
    }
    const candidateLists = new Map<string, string[]>();
    for (const it of group) {
      const t = it.tokens;
      const cands: string[] = [];
      cands.push(t[0] ?? "");
      if (t.length >= 2) {
        cands.push(`${t[0]} ${t[1].charAt(0).toUpperCase()}.`);
        cands.push(`${t[0]} ${t[1]}`);
        if (t.length >= 3) {
          cands.push(`${t[0]} ${t[1]} ${t[2].charAt(0).toUpperCase()}.`);
          cands.push(`${t[0]} ${t[1]} ${t[2]}`);
        }
        cands.push(it.original);
      } else {
        cands.push(it.original);
      }
      candidateLists.set(it.original, cands);
    }
    for (const it of group) {
      const cands = candidateLists.get(it.original)!;
      let picked = it.original;
      for (let lvl = 0; lvl < cands.length; lvl++) {
        const cand = cands[lvl];
        let collisions = 0;
        for (const other of group) {
          const otherCands = candidateLists.get(other.original)!;
          const otherCand = otherCands[lvl] ?? otherCands[otherCands.length - 1];
          if (otherCand === cand) collisions++;
        }
        if (collisions === 1) {
          picked = cand;
          break;
        }
      }
      result.set(it.original, picked);
    }
  }
  return result;
}

export interface AssigneeFilterBarProps {
  /** Nomes na ordem já definida pelo chamador (não reordenar). */
  assignees: string[];
  /** Contador de projetos por responsável. */
  counts: Record<string, number>;
  /** Responsável atualmente selecionado. */
  value: string;
  className?: string;
}

/**
 * Barra horizontal compacta de filtros por responsável.
 * Apenas apresentação: seleção continua sendo controlada pelo <Tabs> pai.
 */
export function AssigneeFilterBar({
  assignees,
  counts,
  value,
  className,
}: AssigneeFilterBarProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const compact = useMemo(() => getCompactDisplayNames(assignees), [assignees]);

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    updateEdges();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateEdges, assignees.length]);

  // Rolagem horizontal com roda do mouse / touchpad.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Traz o item selecionado para a área visível (centralizado quando possível).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-assignee-chip="${CSS.escape(value)}"]`);
    if (!target) return;
    const left =
      target.offsetLeft - el.clientWidth / 2 + target.offsetWidth / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [value, assignees.length]);

  const nudge = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" });
  };

  return (
    <div
      className={cn(
        "relative flex items-center gap-1 border-b border-border bg-card/30 px-2",
        className
      )}
    >
      <button
        type="button"
        aria-label="Rolar responsáveis para a esquerda"
        onClick={() => nudge(-1)}
        className="z-20 flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30"
        disabled={!canLeft}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="relative min-w-0 flex-1">
        {canLeft && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-card to-transparent" />
        )}
        {canRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-card to-transparent" />
        )}
        <div
          ref={scrollRef}
          onScroll={updateEdges}
          className="overflow-x-auto overflow-y-hidden py-1.5 [scrollbar-width:thin] [-ms-overflow-style:auto] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
        >
          <TabsList className="flex h-auto w-max items-center gap-1.5 bg-transparent p-0">
            {assignees.map((a) => {
              const short = compact.get(a) ?? a;
              return (
                <TabsTrigger
                  key={a}
                  value={a}
                  title={a}
                  data-assignee-chip={a}
                  className="flex h-[30px] max-w-[110px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border px-2 py-0 text-[12px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <span className="min-w-0 truncate">{short}</span>
                  <Badge
                    variant="secondary"
                    className="h-4 shrink-0 px-1 text-[10px] font-medium leading-none"
                  >
                    {counts[a] ?? 0}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </div>

      <button
        type="button"
        aria-label="Rolar responsáveis para a direita"
        onClick={() => nudge(1)}
        className="z-20 flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30"
        disabled={!canRight}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
