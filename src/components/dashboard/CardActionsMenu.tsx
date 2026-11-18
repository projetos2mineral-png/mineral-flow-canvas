import { createContext, useContext, type ReactNode } from "react";
import { MoreVertical, PauseCircle, ArrowRightLeft, CalendarCheck } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardCard } from "@/routes/_authenticated/dashboard";

/** Ações rápidas do card (botão direito e botão ⋮). */
export interface CardActions {
  lanes: { id: string; title: string }[];
  onSuspendProject: (c: DashboardCard) => void;
  onMoveToLane: (c: DashboardCard, laneId: string | null) => void;
  onMoveToDeliveryLane: (c: DashboardCard) => void;
}

export const CardActionsContext = createContext<CardActions | null>(null);

type Parts = {
  Item: typeof ContextMenuItem | typeof DropdownMenuItem;
  Sep: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
  Sub: typeof ContextMenuSub | typeof DropdownMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger | typeof DropdownMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent | typeof DropdownMenuSubContent;
};

function Items({ card, a, P }: { card: DashboardCard; a: CardActions; P: Parts }) {
  const current = card.lane_id ?? null;
  return (
    <>
      <P.Sub>
        <P.SubTrigger>
          <ArrowRightLeft className="mr-2 h-4 w-4" /> Enviar para fila
        </P.SubTrigger>
        <P.SubContent className="max-h-80 overflow-y-auto">
          <P.Item disabled={current === null} onSelect={() => a.onMoveToLane(card, null)}>
            Sem fila
          </P.Item>
          {a.lanes.map((l) => (
            <P.Item key={l.id} disabled={current === l.id} onSelect={() => a.onMoveToLane(card, l.id)}>
              {l.title}
            </P.Item>
          ))}
        </P.SubContent>
      </P.Sub>
      <P.Item onSelect={() => a.onMoveToDeliveryLane(card)}>
        <CalendarCheck className="mr-2 h-4 w-4" /> Enviar para fila da data de entrega
      </P.Item>
      <P.Sep />
      <P.Item className="text-destructive focus:text-destructive" onSelect={() => a.onSuspendProject(card)}>
        <PauseCircle className="mr-2 h-4 w-4" /> Suspender projeto (todos os quadros)
      </P.Item>
    </>
  );
}

export function CardActionsMenu({ card, children }: { card: DashboardCard; children: ReactNode }) {
  const a = useContext(CardActionsContext);
  if (!a) return <>{children}</>;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative group">
          {children}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Ações do card"
                onPointerDown={stop}
                onKeyDown={stop}
                className="absolute top-1.5 right-1.5 rounded-md p-0.5 text-muted-foreground bg-card/90 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 hover:bg-muted transition-opacity"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onPointerDown={stop}>
              <Items
                card={card}
                a={a}
                P={{ Item: DropdownMenuItem, Sep: DropdownMenuSeparator, Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onPointerDown={stop}>
        <Items
          card={card}
          a={a}
          P={{ Item: ContextMenuItem, Sep: ContextMenuSeparator, Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent }}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
