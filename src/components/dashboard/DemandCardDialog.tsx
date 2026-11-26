import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarDays, Check, Clock, Loader2, Pencil, Plus, X } from "lucide-react";
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
import type { CardStatus } from "@/lib/dashboard";
import { DemandStatusSelect } from "@/components/dashboard/DemandCardView";
import {
  fetchManualDemands,
  formatHoursHHMM,
  isDemandAssigneeKanbanStatusSupported,
  normalizeChecklistItems,
  parseFlexibleHours,
  updateDemandAssigneeChecklistItems,
  updateDemandAssigneeChecklistSelections,
  updateDemandAssigneeEstimate,
  updateDemandAssigneeKanbanStatus,
} from "@/lib/manual-demands";

const itemKey = (value: string) => value.trim().toLocaleLowerCase("pt-BR");

/**
 * Modal de um card de Demanda Avulsa.
 *
 * Os itens e as marcações pertencem à linha exclusiva do responsável deste card.
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

  const [items, setItems] = useState<string[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [hoursDraft, setHoursDraft] = useState("");
  const [savingHours, setSavingHours] = useState(false);
  const [localStatus, setLocalStatus] = useState<CardStatus>("a iniciar");
  const [savingStatus, setSavingStatus] = useState(false);

  const sourceKey = JSON.stringify({
    key: card?.key ?? null,
    items: assignee?.checklist_items ?? [],
    checked: assignee?.checklist_selections ?? [],
  });

  useEffect(() => {
    if (!card) return;
    setItems(normalizeChecklistItems(assignee?.checklist_items ?? []));
    setChecked(normalizeChecklistItems(assignee?.checklist_selections ?? []));
    setNewItem("");
    setEditingItem(null);
    // Reidrata ao abrir o card e quando os dados persistidos mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  useEffect(() => {
    if (!card) return;
    setHoursDraft(formatHoursHHMM(Number(assignee?.estimated_hours ?? card.ownHours)));
    setEditingHours(false);
    setLocalStatus(assignee?.kanban_status ?? "a iniciar");
  }, [card?.key, card?.ownHours, assignee?.estimated_hours, assignee?.kanban_status]);

  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueue = (task: () => Promise<void>) => {
    pendingRef.current += 1;
    setSaving(true);
    queueRef.current = queueRef.current.then(async () => {
      try {
        await task();
      } catch (e) {
        toast.error(`Não foi possível salvar o checklist: ${(e as Error).message}`);
        await qc.invalidateQueries({ queryKey: ["manual-demands"] });
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setSaving(false);
      }
    });
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["manual-demands"] });

  const saveEstimate = async () => {
    if (!assigneeRowId) return;
    const hours = parseFlexibleHours(hoursDraft);
    if (hours === undefined || hours <= 0) {
      toast.error("Informe um tempo válido, como 02:00, 1h30 ou 45min.");
      return;
    }
    setSavingHours(true);
    try {
      await updateDemandAssigneeEstimate(assigneeRowId, hours);
      setEditingHours(false);
      await Promise.all([
        invalidate(),
        qc.invalidateQueries({ queryKey: ["dashboard", "cards"] }),
      ]);
      toast.success("Estimativa atualizada.");
    } catch (e) {
      toast.error(`Não foi possível salvar a estimativa: ${(e as Error).message}`);
    } finally {
      setSavingHours(false);
    }
  };

  const handleStatusChange = async (status: CardStatus) => {
    if (!assigneeRowId || !isDemandAssigneeKanbanStatusSupported()) return;
    const previous = localStatus;
    setLocalStatus(status);
    setSavingStatus(true);
    try {
      await updateDemandAssigneeKanbanStatus(assigneeRowId, status);
      await Promise.all([
        invalidate(),
        qc.invalidateQueries({ queryKey: ["dashboard", "cards"] }),
      ]);
    } catch (e) {
      setLocalStatus(previous);
      toast.error(`Não foi possível atualizar o status: ${(e as Error).message}`);
    } finally {
      setSavingStatus(false);
    }
  };

  const persistItems = (nextItems: string[]) => {
    if (!assigneeRowId) return;
    enqueue(async () => {
      await updateDemandAssigneeChecklistItems(assigneeRowId, nextItems);
      await invalidate();
    });
  };

  const persistChecked = (nextChecked: string[]) => {
    if (!assigneeRowId) return;
    enqueue(async () => {
      await updateDemandAssigneeChecklistSelections(assigneeRowId, nextChecked);
      await invalidate();
    });
  };

  const handleAddItem = () => {
    const value = newItem.trim();
    if (!value) return;
    if (items.some((i) => itemKey(i) === itemKey(value))) {
      toast.info("Este item já está no checklist.");
      return;
    }
    const next = normalizeChecklistItems([...items, value]);
    setItems(next);
    setNewItem("");
    persistItems(next);
  };

  const handleRemoveItem = (name: string) => {
    const key = itemKey(name);
    const nextItems = items.filter((i) => itemKey(i) !== key);
    const nextChecked = checked.filter((i) => itemKey(i) !== key);
    setItems(nextItems);
    setChecked(nextChecked);
    if (editingItem && itemKey(editingItem) === key) setEditingItem(null);
    enqueue(async () => {
      if (assigneeRowId) {
        await updateDemandAssigneeChecklistItems(assigneeRowId, nextItems);
        await updateDemandAssigneeChecklistSelections(assigneeRowId, nextChecked);
      }
      await invalidate();
    });
  };

  const startEdit = (name: string) => {
    setEditingItem(name);
    setEditValue(name);
  };

  const commitEdit = () => {
    const original = editingItem;
    const value = editValue.trim();
    if (!original || !value) {
      setEditingItem(null);
      return;
    }
    if (itemKey(value) !== itemKey(original)) {
      if (items.some((i) => itemKey(i) === itemKey(value) && itemKey(i) !== itemKey(original))) {
        toast.info("Já existe um item com esse nome.");
        return;
      }
    }
    const fromKey = itemKey(original);
    const nextItems = items.map((i) => (itemKey(i) === fromKey ? value : i));
    const nextChecked = checked.map((i) => (itemKey(i) === fromKey ? value : i));
    setItems(nextItems);
    setChecked(nextChecked);
    setEditingItem(null);
    enqueue(async () => {
      if (assigneeRowId) {
        await updateDemandAssigneeChecklistItems(assigneeRowId, nextItems);
        await updateDemandAssigneeChecklistSelections(assigneeRowId, nextChecked);
      }
      await invalidate();
    });
  };

  const handleToggle = (name: string, isChecked: boolean) => {
    const key = itemKey(name);
    const next = isChecked
      ? normalizeChecklistItems([...checked, name])
      : checked.filter((i) => itemKey(i) !== key);
    setChecked(next);
    persistChecked(next);
  };

  if (!card || !demand) return null;

  return (
    <Dialog open={!!card} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base leading-snug">{demand.name}</DialogTitle>
          {demand.client_name ? (
            <DialogDescription className="flex items-center gap-1.5 text-xs">
              <Building2 className="h-3 w-3 shrink-0" />
              <span>{demand.client_name}</span>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span>{formatDesiredDate(demand.desired_date)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                {editingHours ? (
                  <>
                    <Input
                      autoFocus
                      value={hoursDraft}
                      onChange={(event) => setHoursDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveEstimate();
                        } else if (event.key === "Escape") {
                          setEditingHours(false);
                          setHoursDraft(
                            formatHoursHHMM(Number(assignee?.estimated_hours ?? card.ownHours)),
                          );
                        }
                      }}
                      placeholder="02:00 ou 1h30"
                      aria-label="Estimativa individual em horas"
                      className="h-7 w-28 text-xs"
                      disabled={savingHours}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => void saveEstimate()}
                      disabled={savingHours || !hoursDraft.trim()}
                      title="Salvar estimativa"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        setEditingHours(false);
                        setHoursDraft(
                          formatHoursHHMM(Number(assignee?.estimated_hours ?? card.ownHours)),
                        );
                      }}
                      disabled={savingHours}
                      title="Cancelar edição"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {formatHoursHHMM(Number(assignee?.estimated_hours ?? card.ownHours))}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setEditingHours(true)}
                      disabled={!assigneeRowId}
                      title="Editar estimativa"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
              <DemandStatusSelect
                status={localStatus}
                onChange={(status) => void handleStatusChange(status)}
                disabled={!assigneeRowId || !isDemandAssigneeKanbanStatusSupported()}
                title={
                  isDemandAssigneeKanbanStatusSupported()
                    ? "Alterar status do card"
                    : "Status individual depende de uma coluna adicional no banco"
                }
              />
            </div>
            {assigneeRowId && !isDemandAssigneeKanbanStatusSupported() ? (
              <p className="text-[10px] text-muted-foreground">
                A edição do status individual aguarda uma coluna própria no banco.
              </p>
            ) : null}
            {demand.description ? (
              <p className="pt-1 text-muted-foreground/90 whitespace-pre-wrap break-words">
                {demand.description}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-md border border-border/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Checklist</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {items.length} {items.length === 1 ? "item" : "itens"}
              </span>
            </div>

            <div className="flex gap-1.5">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
                placeholder="Adicionar item…"
                className="h-7 text-xs"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7 shrink-0"
                onClick={handleAddItem}
                disabled={!newItem.trim()}
                title="Adicionar item"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-muted-foreground/70">
                Nenhum item cadastrado.
              </p>
            ) : (
              <ul className="max-h-44 space-y-0.5 overflow-y-auto pr-0.5">
                {items.map((name) => {
                  const isEditing = editingItem !== null && itemKey(editingItem) === itemKey(name);
                  const isChecked = checked.some((i) => itemKey(i) === itemKey(name));
                  return (
                    <li
                      key={name}
                      className="group flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-accent/50"
                    >
                      {isEditing ? (
                        <>
                          <Input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitEdit();
                              } else if (e.key === "Escape") {
                                setEditingItem(null);
                              }
                            }}
                            className="h-6 flex-1 px-1.5 text-xs"
                            aria-label={`Editar item ${name}`}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            onClick={commitEdit}
                            disabled={!editValue.trim()}
                            title="Salvar item"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            onClick={() => setEditingItem(null)}
                            title="Cancelar"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Checkbox
                            id={`checklist-${demand.id}-${name}`}
                            checked={isChecked}
                            onCheckedChange={(v) => handleToggle(name, v === true)}
                            disabled={!assigneeRowId}
                            className="h-3.5 w-3.5"
                          />
                          <label
                            htmlFor={`checklist-${demand.id}-${name}`}
                            className="min-w-0 flex-1 cursor-pointer truncate"
                            title={name}
                          >
                            {name}
                          </label>
                          <button
                            type="button"
                            onClick={() => startEdit(name)}
                            className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                            title={`Editar ${name}`}
                            aria-label={`Editar ${name}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(name)}
                            className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            title={`Excluir ${name}`}
                            aria-label={`Excluir ${name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {!assigneeRowId ? (
              <p className="rounded bg-muted px-2 py-1 text-[10px] leading-snug text-muted-foreground">
                Este responsável ainda não possui uma linha própria para salvar marcações.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Demanda avulsa</span>
            {saving || savingHours || savingStatus ? (
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
              </span>
            ) : null}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
