import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentDashboardUser } from "@/lib/auth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PresencePayload {
  user_id: string;
  name: string;
}

/**
 * Indicador leve de usuários online via Supabase Realtime Presence.
 * - Chave de presença = auth user id → várias abas contam como uma pessoa.
 * - Saídas inesperadas são removidas pelo timeout de presença do Realtime.
 * - Não usa tabelas nem altera dados.
 */
export function OnlineUsersIndicator({ className }: { className?: string }) {
  const { me } = useCurrentDashboardUser();
  const [others, setOthers] = useState<string[]>([]);
  const myId = me?.auth_user_id ?? "";
  const myName = me?.name ?? "";

  useEffect(() => {
    if (!myId) return;
    const channel = supabase.channel("presence:central-planejamento", {
      config: { presence: { key: myId } },
    });
    const sync = () => {
      const state = channel.presenceState<PresencePayload>();
      const names = Object.entries(state)
        .filter(([key]) => key !== myId)
        .map(([, metas]) => metas[0]?.name ?? "Usuário")
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      setOthers(names);
    };
    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: myId, name: myName || "Usuário" });
        }
      });
    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [myId, myName]);

  const count = others.length;
  const label = useMemo(
    () => (count === 0 ? "Só você está online" : `Online agora: ${others.join(", ")}`),
    [count, others],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-border/40 bg-card/95 px-2 py-1 text-xs shadow-sm backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              count === 0 ? "text-muted-foreground/50" : "text-foreground",
              className,
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            {count > 0 && <span className="font-semibold tabular-nums">{count}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-xs">
          {count === 0 ? (
            <span>Só você está online</span>
          ) : (
            <div className="space-y-0.5">
              <div className="font-semibold">Online agora</div>
              {others.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
