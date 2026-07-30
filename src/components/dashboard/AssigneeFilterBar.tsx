import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
          className="overflow-x-auto overflow-y-hidden py-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <TabsList className="flex h-auto w-max items-center gap-1.5 bg-transparent p-0">
            {assignees.map((a) => (
              <TabsTrigger
                key={a}
                value={a}
                title={a}
                data-assignee-chip={a}
                className="flex h-[30px] max-w-[130px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border px-2 py-0 text-[12px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <span className="min-w-0 truncate">{a}</span>
                <Badge
                  variant="secondary"
                  className="h-4 shrink-0 px-1 text-[10px] font-medium leading-none"
                >
                  {counts[a] ?? 0}
                </Badge>
              </TabsTrigger>
            ))}
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
