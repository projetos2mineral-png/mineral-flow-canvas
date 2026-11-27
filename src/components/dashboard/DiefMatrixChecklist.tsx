import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DIEF_MONTHS,
  checkedMonthsForClient,
  clientKey,
  totalCheckedMonths,
} from "@/lib/dief-checklist";

export interface DiefMatrixChecklistProps {
  idPrefix: string;
  /** Linhas da matriz (clientes/itens) persistidas em checklist_items. */
  clients: string[];
  /** Marcações persistidas em checklist_selections (chaves compostas). */
  selections: string[];
  disabled: boolean;
  ownerName?: string | null;
  onToggle: (client: string, month: number, on: boolean) => void;
  onAddClient: (name: string) => void;
  onRenameClient: (from: string, to: string) => void;
  onRemoveClient: (name: string) => void;
}

/** Matriz DIEF: linhas = clientes editáveis, colunas = 12 meses. */
export function DiefMatrixChecklist({
  idPrefix,
  clients,
  selections,
  disabled,
  ownerName,
  onToggle,
  onAddClient,
  onRenameClient,
  onRemoveClient,
}: DiefMatrixChecklistProps) {
  const [newClient, setNewClient] = useState("");
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const doneTotal = totalCheckedMonths(selections, clients);
  const cellTotal = clients.length * DIEF_MONTHS.length;

  const startEdit = (name: string) => {
    if (disabled) return;
    setEditingClient(name);
    setEditValue(name);
  };

  const cancelEdit = () => {
    setEditingClient(null);
    setEditValue("");
  };

  const commitEdit = () => {
    const original = editingClient;
    const value = editValue.trim();
    if (!original || !value) {
      cancelEdit();
      return;
    }
    if (clientKey(value) !== clientKey(original)) {
      if (
        clients.some(
          (c) => clientKey(c) === clientKey(value) && clientKey(c) !== clientKey(original),
        )
      ) {
        toast.info("Já existe um cliente com esse nome.");
        return;
      }
    }
    if (clientKey(value) !== clientKey(original)) onRenameClient(original, value);
    cancelEdit();
  };

  const addClient = () => {
    const value = newClient.trim();
    if (!value || disabled) return;
    if (clients.some((c) => clientKey(c) === clientKey(value))) {
      toast.info("Este cliente já está na matriz.");
      return;
    }
    onAddClient(value);
    setNewClient("");
  };

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Total: {doneTotal}/{cellTotal} meses cumpridos
        </span>
      </div>

      <div className="flex gap-1.5">
        <Input
          value={newClient}
          onChange={(event) => setNewClient(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addClient();
            }
          }}
          placeholder="Adicionar cliente (Enter)..."
          className="h-7 text-xs"
          disabled={disabled}
          aria-label="Adicionar cliente à matriz DIEF"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-7 w-7 shrink-0"
          onClick={addClient}
          disabled={disabled || !newClient.trim()}
          title="Adicionar cliente"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Único scroll horizontal do modal: protege tablets/celulares. */}
      <div className="overflow-x-auto rounded-md border border-border/40 [scrollbar-width:thin]">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <th className="sticky left-0 z-10 min-w-[180px] bg-muted/30 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cliente / Item
              </th>
              {DIEF_MONTHS.map((month) => (
                <th
                  key={month}
                  className="w-8 px-0.5 py-1.5 text-center text-[10px] font-medium text-muted-foreground"
                >
                  {month}
                </th>
              ))}
              <th className="w-14 px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Total
              </th>
              <th className="w-16 px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td
                  colSpan={DIEF_MONTHS.length + 3}
                  className="py-3 text-center text-[11px] text-muted-foreground/70"
                >
                  Nenhum cliente cadastrado. Adicione um acima para começar.
                </td>
              </tr>
            ) : (
              clients.map((client) => {
                const done = checkedMonthsForClient(selections, client);
                const isEditing = editingClient === client;
                return (
                  <tr
                    key={client}
                    className="group border-b border-border/40 last:border-0 hover:bg-accent/40"
                  >
                    <td className="sticky left-0 z-10 max-w-[220px] bg-background px-2 py-1 group-hover:bg-accent/40">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={editValue}
                            onChange={(event) => setEditValue(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitEdit();
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                cancelEdit();
                              }
                            }}
                            className="h-6 min-w-0 flex-1 px-1.5 text-xs"
                            aria-label={`Renomear ${client}`}
                          />
                          <button
                            type="button"
                            onClick={commitEdit}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Salvar nome"
                            aria-label={`Salvar nome de ${client}`}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Cancelar"
                            aria-label="Cancelar renomeação"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onDoubleClick={() => startEdit(client)}
                          className="block w-full truncate text-left text-xs"
                          title={`${client} (duplo clique para renomear)`}
                        >
                          {client}
                        </button>
                      )}
                    </td>

                    {DIEF_MONTHS.map((label, index) => {
                      const month = index + 1;
                      const id = `${idPrefix}-${clientKey(client)}-mes-${month}`;
                      return (
                        <td key={label} className="px-0.5 py-1 text-center">
                          <Checkbox
                            id={id}
                            checked={done.has(month)}
                            disabled={disabled}
                            onCheckedChange={(value) => onToggle(client, month, value === true)}
                            className="h-3.5 w-3.5"
                            aria-label={`${client} — ${label}`}
                          />
                        </td>
                      );
                    })}

                    <td className="px-1 py-1 text-center tabular-nums text-muted-foreground">
                      {done.size}/12
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => startEdit(client)}
                          disabled={disabled}
                          className="rounded p-0.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground disabled:opacity-40"
                          title={`Renomear ${client}`}
                          aria-label={`Renomear ${client}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => !disabled && onRemoveClient(client)}
                          disabled={disabled}
                          className="rounded p-0.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                          title={`Excluir ${client}`}
                          aria-label={`Excluir ${client}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {ownerName ? (
        <p className="text-[10px] text-muted-foreground">
          Marcações de <span className="font-medium text-foreground">{ownerName}</span> — cada
          responsável mantém a sua matriz.
        </p>
      ) : null}
    </div>
  );
}
