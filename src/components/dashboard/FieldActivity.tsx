import { useEffect, useState } from "react";
import { MapPin, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  FIELD_STATUSES,
  FIELD_STATUS_BADGE_CLASS,
  FIELD_STATUS_DOT_CLASS,
  FIELD_STATUS_LABEL,
  createFieldActivity,
  deleteFieldActivity,
  formatFieldDateShort,
  formatMinutes,
  normalizeFieldStatus,
  parseHoursInput,
  updateFieldActivity,
  type FieldActivityRow,
  type FieldStatus,
} from "@/lib/field-activities";

/** Dados mínimos herdados do post-it de origem. */
export type FieldParentContext = {
  card_id: string | null;
  runrunit_project_id: number;
  assignee_name: string;
  lane_id: string | null;
  project_name: string;
  client_name: string | null;
};

/** Post-it de campo derivado — visual leve, com indicador próprio. */
export function FieldActivityCard({
  activity,
  parentName,
  onEdit,
  onOpenParent,
}: {
  activity: FieldActivityRow;
  parentName: string | null;
  onEdit: () => void;
  onOpenParent?: () => void;
}) {
  const status = normalizeFieldStatus(activity.field_status);
  const date = formatFieldDateShort(activity.planned_date);
  return (
    <div
      style={{ padding: "var(--kb-card-pad)" }}
      className="rounded-[8px] border border-dashed border-sky-300 bg-sky-50/70 shadow-sm hover:shadow transition-shadow text-foreground"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
        <MapPin className="h-3 w-3" />
        Campo
      </div>
      <button
        onClick={onEdit}
        className="w-full text-left font-semibold text-[13px] leading-snug line-clamp-2 mt-0.5 hover:text-primary transition-colors"
      >
        {activity.activity}
      </button>
      {parentName && (
        <button
          onClick={onOpenParent}
          disabled={!onOpenParent}
          className="mt-0.5 w-full text-left text-[11px] text-[#6B7280] truncate hover:text-primary disabled:hover:text-[#6B7280] inline-flex items-center gap-1"
          title={`Campo derivado de: ${parentName}`}
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">Derivado de: {parentName}</span>
        </button>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-[#6B7280]">
        {date && <span>📅 {date}</span>}
        <span>⏱ {formatMinutes(activity.estimated_minutes)}</span>
      </div>
      <div className="mt-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
            FIELD_STATUS_BADGE_CLASS[status]
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", FIELD_STATUS_DOT_CLASS[status])} />
          {FIELD_STATUS_LABEL[status]}
        </span>
      </div>
    </div>
  );
}

/** Formulário de criação/edição de uma atividade de campo derivada. */
export function FieldActivityDialog({
  open,
  parent,
  activity,
  currentUserName,
  onClose,
  onSaved,
}: {
  open: boolean;
  parent: FieldParentContext | null;
  activity: FieldActivityRow | null;
  currentUserName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [activityName, setActivityName] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [hours, setHours] = useState("");
  const [status, setStatus] = useState<FieldStatus>("planejado");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActivityName(activity?.activity ?? "");
    setPlannedDate(activity?.planned_date?.slice(0, 10) ?? "");
    setHours(activity ? formatMinutes(activity.estimated_minutes) : "");
    setStatus(normalizeFieldStatus(activity?.field_status));
    setNote(activity?.note ?? "");
  }, [open, activity]);

  if (!open) return null;

  const isEdit = !!activity;

  const handleSave = async () => {
    const name = activityName.trim();
    if (!name) {
      toast.error("Informe a atividade de campo");
      return;
    }
    const minutes = hours.trim() ? parseHoursInput(hours) : 0;
    if (minutes === null) {
      toast.error('Horas inválidas. Use formatos como "2h", "8" ou "12h30".');
      return;
    }
    setSaving(true);
    try {
      if (activity) {
        await updateFieldActivity(activity.id, {
          activity: name,
          planned_date: plannedDate || null,
          estimated_minutes: minutes,
          field_status: status,
          note: note.trim() || null,
        });
        toast.success("Campo atualizado");
      } else {
        if (!parent) throw new Error("Post-it de origem não identificado");
        await createFieldActivity({
          parent_card_id: parent.card_id,
          runrunit_project_id: parent.runrunit_project_id,
          assignee_name: parent.assignee_name,
          lane_id: parent.lane_id,
          activity: name,
          planned_date: plannedDate || null,
          estimated_minutes: minutes,
          field_status: status,
          note: note.trim() || null,
          created_by: currentUserName ?? null,
        });
        toast.success("Campo derivado criado");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Falha ao salvar campo: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activity) return;
    if (!window.confirm("Excluir esta atividade de campo?")) return;
    setSaving(true);
    try {
      await deleteFieldActivity(activity.id);
      toast.success("Campo excluído");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Falha ao excluir: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600" />
            {isEdit ? "Atividade de campo" : "Derivar campo"}
          </DialogTitle>
          <DialogDescription>
            {parent
              ? `${parent.project_name}${parent.client_name ? ` · ${parent.client_name}` : ""} · ${parent.assignee_name}`
              : "Atividade vinculada ao post-it de origem."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Atividade de campo</label>
            <Input
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              placeholder="Ex.: Visita técnica, Coleta de dados…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data planejada</label>
              <Input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Horas estimadas</label>
              <Input
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Ex.: 6h ou 12h30"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status do campo</label>
            <Select value={status} onValueChange={(v) => setStatus(v as FieldStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", FIELD_STATUS_DOT_CLASS[s])} />
                      {FIELD_STATUS_LABEL[s]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Observação (opcional)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {isEdit && (
            <Button variant="ghost" onClick={handleDelete} disabled={saving} className="mr-auto text-destructive">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {isEdit ? "Salvar" : "Criar campo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
