import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientCombobox } from "@/components/demands/ClientCombobox";
import type { DashboardUser } from "@/lib/dashboard";
import {
  DEMAND_STATUSES,
  formatHoursHHMM,
  totalEstimatedHours,
  validateDemand,
  type DemandAssignee,
  type DemandStatus,
  type ManualDemand,
  type ManualDemandInput,
} from "@/lib/manual-demands";

export interface DemandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Demanda em edição; ausente = criação. */
  demand?: ManualDemand | null;
  users: DashboardUser[];
  clients: string[];
  clientEnabled: boolean;
  saving: boolean;
  deleting?: boolean;
  onSubmit: (input: ManualDemandInput) => void;
  onDelete?: () => void;
}

type DraftAssignee = { user_id: string; hours: string };

function emptyDraft(): DraftAssignee[] {
  return [{ user_id: "", hours: "" }];
}

export function DemandDialog({
  open,
  onOpenChange,
  demand,
  users,
  clients,
  clientEnabled,
  saving,
  deleting,
  onSubmit,
  onDelete,
}: DemandDialogProps) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [status, setStatus] = useState<DemandStatus>("Ativa");
  const [visible, setVisible] = useState(false);
  const [assignees, setAssignees] = useState<DraftAssignee[]>(emptyDraft());

  // Reidrata o formulário sempre que o modal abre.
  useEffect(() => {
    if (!open) return;
    setName(demand?.name ?? "");
    setClientName(demand?.client_name ?? null);
    setDescription(demand?.description ?? "");
    setDesiredDate(demand?.desired_date ?? "");
    setStatus(demand?.status ?? "Ativa");
    setVisible(demand?.is_visible_on_dashboard ?? false);
    setAssignees(
      demand && demand.assignees.length > 0
        ? demand.assignees.map((a) => ({ user_id: a.user_id, hours: String(a.estimated_hours) }))
        : emptyDraft()
    );
  }, [open, demand]);

  const activeUsers = useMemo(
    () => users.filter((u) => u.is_active !== false),
    [users]
  );

  const parsed: DemandAssignee[] = useMemo(
    () =>
      assignees.map((a) => ({
        user_id: a.user_id,
        // Estimativa individual: nunca dividimos o total entre responsáveis.
        estimated_hours: Number(String(a.hours).replace(",", ".")),
      })),
    [assignees]
  );

  const total = totalEstimatedHours(parsed);

  const updateAssignee = (index: number, patch: Partial<DraftAssignee>) => {
    setAssignees((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const handleSubmit = () => {
    const input: ManualDemandInput = {
      name,
      description: description || null,
      client_name: clientEnabled ? clientName : null,
      desired_date: desiredDate,
      is_visible_on_dashboard: visible,
      status,
      assignees: parsed,
    };
    const invalid = validateDemand(input);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    onSubmit(input);
  };

  const usedIds = new Set(assignees.map((a) => a.user_id).filter(Boolean));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{demand ? "Editar demanda" : "Nova demanda"}</DialogTitle>
          <DialogDescription>
            Demandas avulsas não possuem vínculo com o Runrun.it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="demand-name">Nome da demanda *</Label>
            <Input
              id="demand-name"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Levantamento topográfico avulso"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              {clientEnabled ? (
                <ClientCombobox options={clients} value={clientName} onChange={setClientName} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Campo indisponível: a coluna <code>client_name</code> ainda não existe no banco.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demand-date">Data desejada *</Label>
              <Input
                id="demand-date"
                type="date"
                value={desiredDate}
                onChange={(e) => setDesiredDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="demand-description">Descrição</Label>
            <Textarea
              id="demand-description"
              value={description}
              maxLength={2000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <Label>Responsáveis e estimativa *</Label>
              <span className="text-xs text-muted-foreground">
                Total estimado: <strong className="text-foreground">{formatHoursHHMM(total)}</strong>
              </span>
            </div>
            <div className="space-y-2">
              {assignees.map((a, index) => (
                <div key={`${index}-${a.user_id}`} className="flex items-center gap-2">
                  <Select
                    value={a.user_id}
                    onValueChange={(v) => updateAssignee(index, { user_id: v })}
                  >
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue placeholder="Selecionar pessoa" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeUsers.map((u) => (
                        <SelectItem
                          key={u.id}
                          value={u.id}
                          disabled={usedIds.has(u.id) && u.id !== a.user_id}
                        >
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={a.hours}
                    onChange={(e) => updateAssignee(index, { hours: e.target.value })}
                    placeholder="Horas"
                    aria-label="Horas estimadas"
                    className="h-9 w-28"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Remover responsável"
                    onClick={() =>
                      setAssignees((prev) =>
                        prev.length === 1 ? emptyDraft() : prev.filter((_, i) => i !== index)
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAssignees((prev) => [...prev, { user_id: "", hours: "" }])}
            >
              <Plus className="mr-1 h-4 w-4" />
              Adicionar responsável
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DemandStatus)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEMAND_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="flex items-center gap-2">
                <Switch id="demand-visible" checked={visible} onCheckedChange={setVisible} />
                <Label htmlFor="demand-visible" className="cursor-pointer">
                  Exibir no Dashboard
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {demand && onDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
              disabled={saving || deleting}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
