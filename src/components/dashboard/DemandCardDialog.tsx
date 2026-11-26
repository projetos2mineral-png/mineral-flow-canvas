import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarDays, Clock, Loader2, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDesiredDate, type DemandBoardCard } from "@/lib/dashboard-demands";
import {
  fetchManualDemands,
  formatHoursHHMM,
  isDemandClientChecklistSupported,
  normalizeClientList,
  updateDemandAssigneeClientSelections,
  updateManualDemandClients,
} from "@/lib/manual-demands";

/**
 * Modal de um card de Demanda Avulsa.
 *
 * A lista de clientes pertence à DEMANDA (compartilhada por todos os
 * responsáveis). As marcações pertencem à linha do RESPONSÁVEL deste card:
 * ao abrir, carregamos apenas as seleções dele; ao salvar, atualizamos apenas
 * essa linha — os demais responsáveis nunca são sobrescritos.
 */
export function DemandCardDialog({
  card,
  onClose,
}: {
  card: DemandBoardCard | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const demandId = card?.demand.id ?? null;
  const assigneeRowId = card?.assigneeRowId ?? null;
  const assigneeName = card?.assigneeName ?? null;

  const { data: demands, refetch } = useQuery({
    queryKey: ["manual-demands"],
    queryFn: fetchManualDemands,
    enabled: !!card,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Ao abrir um card, busca as marcações persistidas mais recentes.
  useEffect(() => {
    if (card) void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.key]);

  const demand = useMemo(
    () => demands?.find((d) => d.id === demandId) ?? card?.demand ?? null,
    [demands, demandId, card],
  );

  const assignee = useMemo(() => {
    if (!demand) return null;
    return (
      demand.assignees.find((a) => a.id && a.id === assigneeRowId) ??
      demand.assignees.find((a) => (a.assignee_name ?? "") === (assigneeName ?? "")) ??
      null
    );
  }, [demand, assigneeRowId, assigneeName]);

  const cardAssignee = assigneeName ?? "Sem responsável";
  const [clients, setClients] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [newClient, setNewClient] = useState("");
  const [saving, setSaving] = useState(false);

  const sourceKey = JSON.stringify({
    key: card?.key ?? null,
    clients: demand?.client_names ?? [],
    selected: assignee?.client_selections ?? [],
  });

  useEffect(() => {
    if (!card) return;
    setClients(normalizeClientList(demand?.client_names ?? []));
    setSelected(normalizeClientList(assignee?.client_selections ?? []));
    setNewClient("");
    // Rehidrata ao abrir o card e quando os dados persistidos mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueue = (task: () => Promise<void>) => {
    pendingRef.current += 1;
    setSaving(true);
    queueRef.current = queueRef.current.then(async () => {
      try {
        await task();
      } catch (e) {
        toast.error(`Não foi possível salvar os clientes: ${(e as Error).message}`);
        await qc.invalidateQueries({ queryKey: ["manual-demands"] });
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setSaving(false);
      }
    });
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["manual-demands"] });

  const persistClients = (nextClients: string[]) => {
    if (!demandId) return;
    enqueue(async () => {
      await updateManualDemandClients(demandId, nextClients);
      await invalidate();
    });
  };

  const persistSelections = (nextSelected: string[]) => {
    if (!assigneeRowId) return;
    enqueue(async () => {
      await updateDemandAssigneeClientSelections(assigneeRowId, nextSelected);
      await invalidate();
    });
  };

  const handleAddClient = () => {
    const name = newClient.trim();
    if (!name) return;
    const key = name.toLocaleLowerCase("pt-BR");
    if (clients.some((c) => c.toLocaleLowerCase("pt-BR") === key)) {
      toast.info("Este cliente já está na lista.");
      return;
    }
    const next = normalizeClientList([...clients, name]);
    setClients(next);
    setNewClient("");
    persistClients(next);
  };

  const handleRemoveClient = (name: string) => {
    const key = name.toLocaleLowerCase("pt-BR");
    const nextClients = clients.filter((c) => c.toLocaleLowerCase("pt-BR") !== key);
    const nextSelected = selected.filter((c) => c.toLocaleLowerCase("pt-BR") !== key);
    setClients(nextClients);
    setSelected(nextSelected);
    enqueue(async () => {
      if (demandId) await updateManualDemandClients(demandId, nextClients);
      if (assigneeRowId) await updateDemandAssigneeClientSelections(assigneeRowId, nextSelected);
      await invalidate();
    });
  };

  const handleToggle = (name: string, checked: boolean) => {
    const key = name.toLocaleLowerCase("pt-BR");
    const next = checked
      ? normalizeClientList([...selected, name])
      : selected.filter((c) => c.toLocaleLowerCase("pt-BR") !== key);
    setSelected(next);
    persistSelections(next);
  };

  const others = demand
    ? demand.assignees.map((a) => a.assignee_name ?? "").filter((n) => n && n !== cardAssignee)
    : [];

  const checklistReady = isDemandClientChecklistSupported();
  const canMark = !!assigneeRowId && checklistReady;

  if (!card || !demand) return null;

  return (
    <Dialog open={!!card} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <span className="w-fit rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-200">
            Demanda avulsa
          </span>
          <DialogTitle className="text-base leading-snug">{demand.name}</DialogTitle>
          <DialogDescription className="text-xs">
            Responsável: <span className="font-medium text-foreground">{cardAssignee}</span>
            {others.length > 0 ? ` · Também com: ${others.join(", ")}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-1 rounded-md border border-border/60 bg-muted/20 p-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{demand.client_name || "Sem cliente"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span>{formatDesiredDate(demand.desired_date)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatHoursHHMM(Number(assignee?.estimated_hours ?? card.ownHours))}</span>
            </div>
            {demand.description ? (
              <p className="pt-1 text-muted-foreground/90 whitespace-pre-wrap break-words">
                {demand.description}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-md border border-border/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Clientes da demanda</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {clients.length} {clients.length === 1 ? "cliente" : "clientes"}
              </span>
            </div>

            <div className="flex gap-1.5">
              <Input
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddClient();
                  }
                }}
                placeholder="Adicionar cliente…"
                className="h-7 text-xs"
                disabled={!checklistReady}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7 shrink-0"
                onClick={handleAddClient}
                disabled={!checklistReady || !newClient.trim()}
                title="Adicionar cliente"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Marcações de <span className="font-medium text-foreground">{cardAssignee}</span> —
              cada responsável mantém as suas.
            </p>

            {clients.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-muted-foreground/70">
                Nenhum cliente cadastrado.
              </p>
            ) : (
              <ul className="max-h-44 space-y-0.5 overflow-y-auto pr-0.5">
                {clients.map((name) => {
                  const checked = selected.some(
                    (s) => s.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"),
                  );
                  return (
                    <li
                      key={name}
                      className="group flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent/50"
                    >
                      <Checkbox
                        id={`demand-client-${demand.id}-${name}`}
                        checked={checked}
                        onCheckedChange={(v) => handleToggle(name, v === true)}
                        disabled={!canMark}
                        className="h-3.5 w-3.5"
                      />
                      <label
                        htmlFor={`demand-client-${demand.id}-${name}`}
                        className="min-w-0 flex-1 cursor-pointer truncate"
                        title={name}
                      >
                        {name}
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveClient(name)}
                        disabled={!checklistReady}
                        className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:pointer-events-none"
                        title={`Remover ${name} da lista`}
                        aria-label={`Remover ${name} da lista`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {!checklistReady ? (
              <p className="rounded bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                O checklist exige a migration local de clientes. A lista atual continua visível, mas
                as alterações não podem ser salvas.
              </p>
            ) : !assigneeRowId ? (
              <p className="rounded bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                Este responsável ainda não possui linha própria para salvar marcações.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
              </>
            ) : (
              <>
                <Users className="h-3 w-3" /> Seleções individuais
              </>
            )}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
