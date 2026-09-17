import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Info, Users, Layers, Clock, Wrench, Tag, FolderKanban } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  fetchQfqAtividades,
  fetchQfqColaboradores,
  fetchQfqMatriz,
  upsertQfqMatrizNivel,
} from "@/lib/qfq";

export const Route = createFileRoute("/_authenticated/quem-faz-o-que")({
  head: () => ({
    meta: [
      { title: "Quem faz o que · Mineral Geologia" },
      {
        name: "description",
        content: "Matriz de atividades por colaborador com níveis por cores.",
      },
    ],
  }),
  component: QuemFazOQuePage,
});

const NIVEL_CONFIG: Record<
  string,
  { bg: string; text: string; border: string; label: string; desc: string }
> = {
  W: {
    bg: "bg-emerald-600",
    text: "text-white",
    border: "border-emerald-700",
    label: "W",
    desc: "Executa com autonomia / Domina a atividade",
  },
  K: {
    bg: "bg-blue-600",
    text: "text-white",
    border: "border-blue-700",
    label: "K",
    desc: "Conhece e pode executar com apoio",
  },
  Y: {
    bg: "bg-yellow-400",
    text: "text-zinc-900",
    border: "border-yellow-500",
    label: "Y",
    desc: "Em desenvolvimento / Executa com supervisão",
  },
  X: {
    bg: "bg-orange-500",
    text: "text-white",
    border: "border-orange-600",
    label: "X",
    desc: "Não executa / Não se aplica no momento",
  },
  Z: {
    bg: "bg-red-600",
    text: "text-white",
    border: "border-red-700",
    label: "Z",
    desc: "Sem conhecimento / Observador",
  },
};

const NIVEL_ORDER = ["W", "K", "Y", "X", "Z"] as const;

function NivelCell({ nivel }: { nivel: string | null | undefined }) {
  const key = (nivel ?? "").toUpperCase().trim();
  const cfg = NIVEL_CONFIG[key];
  if (!cfg) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground text-[11px]">
        —
      </div>
    );
  }
  return (
    <div
      className={`flex h-full w-full items-center justify-center border ${cfg.bg} ${cfg.border}`}
      title={cfg.desc}
      aria-label={cfg.desc}
    />
  );
}

function EditableNivelCell({
  atividadeId,
  colaboradorId,
  nivel,
  onChange,
  atividadeNome,
  colaboradorNome,
}: {
  atividadeId: string | number;
  colaboradorId: string | number;
  nivel: string | null;
  onChange: (atividadeId: string | number, colaboradorId: string | number, novoNivel: string | null) => void;
  atividadeNome: string;
  colaboradorNome: string;
}) {
  const [open, setOpen] = useState(false);
  const key = (nivel ?? "").toUpperCase().trim();
  const cfg = NIVEL_CONFIG[key];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-8 w-full flex items-center justify-center p-0 border-0 bg-transparent hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`${atividadeNome} — ${colaboradorNome}`}
              >
                {cfg ? (
                  <div className={`h-full w-full border ${cfg.bg} ${cfg.border}`} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground text-[11px]">
                    —
                  </div>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="bg-zinc-900 text-white border-zinc-800 text-xs max-w-[220px]">
            <p className="font-medium">
              {atividadeNome} — {colaboradorNome}
            </p>
            <p className="opacity-80">{cfg ? cfg.desc : "Sem registro — clique para definir"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-auto p-2" align="center" side="bottom">
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-medium text-muted-foreground text-center">
            Selecione o nível
          </div>
          <div className="grid grid-cols-3 gap-2">
            {NIVEL_ORDER.map((lvl) => {
              const c = NIVEL_CONFIG[lvl];
              const isActive = key === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    onChange(atividadeId, colaboradorId, lvl);
                    setOpen(false);
                  }}
                  className={`h-9 w-9 rounded-md border-2 ${c.bg} ${c.border} hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${isActive ? "ring-2 ring-foreground ring-offset-1" : ""}`}
                  title={c.desc}
                  aria-label={c.desc}
                />
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(atividadeId, colaboradorId, null);
              setOpen(false);
            }}
            className="h-8 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs text-muted-foreground"
          >
            Limpar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QuemFazOQuePage() {
  const [search, setSearch] = useState("");

  const atividadesQ = useQuery({
    queryKey: ["qfq", "atividades"],
    queryFn: fetchQfqAtividades,
    staleTime: 60_000,
  });
  const colaboradoresQ = useQuery({
    queryKey: ["qfq", "colaboradores"],
    queryFn: fetchQfqColaboradores,
    staleTime: 60_000,
  });
  const matrizQ = useQuery({
    queryKey: ["qfq", "matriz"],
    queryFn: fetchQfqMatriz,
    staleTime: 60_000,
  });

  const atividades = atividadesQ.data ?? [];
  const colaboradores = colaboradoresQ.data ?? [];
  const matriz = matrizQ.data ?? [];

  const loading = atividadesQ.isLoading || colaboradoresQ.isLoading || matrizQ.isLoading;
  const error = atividadesQ.error || colaboradoresQ.error || matrizQ.error;

  const matrizMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of matriz) {
      const key = `${r.atividade_id}::${r.colaborador_id}`;
      const lvl = (r.nivel ?? "").toString().trim().toUpperCase();
      if (lvl) m.set(key, lvl);
    }
    return m;
  }, [matriz]);

  const filteredAtividades = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return atividades;
    return atividades.filter((a) => {
      return (
        a.nome.toLowerCase().includes(q) ||
        (a.categoria ?? "").toLowerCase().includes(q) ||
        (a.software ?? "").toLowerCase().includes(q) ||
        (a.complexidade ?? "").toLowerCase().includes(q) ||
        (a.tipo ?? "").toLowerCase().includes(q)
      );
    });
  }, [atividades, search]);

  // Keep ordering by ordem then nome (already sorted in query), but ensure filtered keeps order
  const orderedAtividades = useMemo(
    () => [...filteredAtividades].sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999) || a.nome.localeCompare(b.nome, "pt-BR")),
    [filteredAtividades]
  );
  const orderedColaboradores = useMemo(
    () => [...colaboradores].sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999) || a.nome.localeCompare(b.nome, "pt-BR")),
    [colaboradores]
  );

  const qc = useQueryClient();

  const handleNivelChange = async (
    atividadeId: string | number,
    colaboradorId: string | number,
    novoNivel: string | null
  ) => {
    const key = `${atividadeId}::${colaboradorId}`;
    const prevNivel = matrizMap.get(key) ?? null;
    const nextNivel = novoNivel ? novoNivel.toUpperCase().trim() : null;

    // Atualização otimista — reflete imediatamente na UI
    qc.setQueryData(["qfq", "matriz"], (old: any) => {
      const arr = (old ?? []) as any[];
      const idx = arr.findIndex(
        (r: any) => String(r.atividade_id) === String(atividadeId) && String(r.colaborador_id) === String(colaboradorId)
      );
      if (!nextNivel) {
        if (idx >= 0) return arr.filter((_, i) => i !== idx);
        return arr;
      }
      if (idx >= 0) {
        const copy = [...arr];
        copy[idx] = { ...copy[idx], nivel: nextNivel, updated_at: new Date().toISOString() };
        return copy;
      }
      return [
        ...arr,
        {
          id: `tmp-${Date.now()}-${atividadeId}-${colaboradorId}`,
          atividade_id: atividadeId,
          colaborador_id: colaboradorId,
          nivel: nextNivel,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    });

    try {
      await upsertQfqMatrizNivel(atividadeId, colaboradorId, nextNivel);
    } catch (e) {
      toast.error("Falha ao salvar: " + (e as Error).message);
      // Reverte em caso de erro
      qc.setQueryData(["qfq", "matriz"], (old: any) => {
        const arr = (old ?? []) as any[];
        const idx = arr.findIndex(
          (r: any) => String(r.atividade_id) === String(atividadeId) && String(r.colaborador_id) === String(colaboradorId)
        );
        if (prevNivel) {
          if (idx >= 0) {
            const copy = [...arr];
            copy[idx] = { ...copy[idx], nivel: prevNivel };
            return copy;
          }
          return [
            ...arr,
            {
              id: `tmp-${Date.now()}`,
              atividade_id: atividadeId,
              colaborador_id: colaboradorId,
              nivel: prevNivel,
              created_at: null,
              updated_at: null,
            },
          ];
        } else {
          if (idx >= 0) return arr.filter((_, i) => i !== idx);
          return arr;
        }
      });
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-primary" />
          Quem faz o que
        </h1>
        <p className="text-sm text-muted-foreground">
          Matriz informativa — atividades nas linhas, colaboradores nas colunas. Cada célula indica o nível de domínio.
          {atividades.length > 0 || colaboradores.length > 0
            ? ` ${atividades.length} atividades × ${colaboradores.length} colaboradores.`
            : ""}
        </p>
      </div>

      {/* Legenda */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-muted-foreground" />
          Legenda dos níveis
        </div>
        <div className="flex flex-wrap gap-3">
          {NIVEL_ORDER.map((lvl) => {
            const cfg = NIVEL_CONFIG[lvl];
            return (
              <div
                key={lvl}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
              >
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border ${cfg.bg} ${cfg.border}`} />
                <span className="text-[11px] text-muted-foreground leading-tight max-w-[160px]">
                  {cfg.desc}
                </span>
              </div>
            );
          })}
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm border bg-muted/40" />
            <span className="text-[11px] text-muted-foreground leading-tight">
              Sem registro / Não avaliado
            </span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Cores idênticas à planilha “Quem faz o que.xlsx”. A célula exibe somente a cor correspondente ao nível.
        </p>
      </div>

      {/* Busca */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar atividade, categoria, software, complexidade..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          {filteredAtividades.length} atividades
          <span className="opacity-30">•</span>
          <Users className="h-3.5 w-3.5" />
          {orderedColaboradores.length} colaboradores
        </div>
      </div>

      {loading && <div className="p-6 text-sm text-muted-foreground">Carregando matriz…</div>}
      {error && (
        <div className="p-6 text-sm text-destructive">
          Erro ao carregar dados: {(error as Error).message}
        </div>
      )}

      {!loading && !error && orderedAtividades.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade encontrada. Verifique os dados em <code className="px-1 py-0.5 bg-muted rounded text-xs">qfq_atividades</code>.
          </p>
        </div>
      )}
      {!loading && !error && orderedColaboradores.length === 0 && orderedAtividades.length > 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum colaborador cadastrado em <code className="px-1 py-0.5 bg-muted rounded text-xs">qfq_colaboradores</code>.
          </p>
        </div>
      )}

      {!loading && !error && orderedAtividades.length > 0 && orderedColaboradores.length > 0 && (
        <div className="space-y-3">
          {/* Tabela */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-auto max-h-[65vh] max-w-full">
              <table className="border-collapse w-full text-xs" style={{ minWidth: `${320 + orderedColaboradores.length * 64}px` }}>
                <thead>
                  <tr className="bg-zinc-100 dark:bg-zinc-900">
                    {/* Corner + Atividade info headers */}
                    <th className="sticky left-0 top-0 z-30 bg-zinc-100 dark:bg-zinc-900 border border-border px-3 py-2 text-left font-semibold min-w-[240px] max-w-[280px]">
                      <span className="flex items-center gap-1.5">
                        <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                        Atividade
                      </span>
                    </th>
                    <th className="sticky top-0 z-20 bg-zinc-100 dark:bg-zinc-900 border border-border px-2 py-2 text-center font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Tempo (h)
                      </span>
                    </th>
                    <th className="sticky top-0 z-20 bg-zinc-100 dark:bg-zinc-900 border border-border px-2 py-2 text-center font-medium whitespace-nowrap">
                      Complex.
                    </th>
                    <th className="sticky top-0 z-20 bg-zinc-100 dark:bg-zinc-900 border border-border px-2 py-2 text-center font-medium whitespace-nowrap">
                      <Tag className="h-3 w-3 inline mr-1" />
                      Categoria
                    </th>
                    <th className="sticky top-0 z-20 bg-zinc-100 dark:bg-zinc-900 border border-border px-2 py-2 text-center font-medium whitespace-nowrap">
                      <Wrench className="h-3 w-3 inline mr-1" />
                      Software
                    </th>
                    <th className="sticky top-0 z-20 bg-zinc-100 dark:bg-zinc-900 border border-border px-2 py-2 text-center font-medium whitespace-nowrap">
                      Tipo
                    </th>
                    {orderedColaboradores.map((c) => (
                      <th
                        key={c.id}
                        className="sticky top-0 z-20 bg-zinc-100 dark:bg-zinc-900 border border-border px-1 py-2 text-center font-semibold whitespace-nowrap min-w-[64px] max-w-[84px]"
                        title={c.nome}
                      >
                        <div className="flex flex-col items-center leading-tight">
                          <span className="truncate max-w-[72px]">{c.nome}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderedAtividades.map((atv, idx) => (
                    <tr
                      key={atv.id}
                      className={idx % 2 === 0 ? "bg-white dark:bg-zinc-950" : "bg-zinc-50/60 dark:bg-zinc-900/40"}
                    >
                      <td className="sticky left-0 z-10 border border-border px-3 py-2 text-left font-medium bg-inherit min-w-[240px] max-w-[280px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="line-clamp-2 leading-tight break-words cursor-default">
                                {atv.nome}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[320px] bg-zinc-900 text-white border-zinc-800">
                              <p className="text-xs font-medium">{atv.nome}</p>
                              <p className="text-[11px] opacity-80">
                                {atv.categoria ?? "—"} • {atv.software ?? "—"} • {atv.tipo ?? "—"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="border border-border px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                        {atv.tempo_esperado_horas != null && String(atv.tempo_esperado_horas).trim() !== ""
                          ? `${Number(atv.tempo_esperado_horas).toString()}h`
                          : "—"}
                      </td>
                      <td className="border border-border px-2 py-1.5 text-center whitespace-nowrap">
                        {atv.complexidade ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {atv.complexidade}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border border-border px-2 py-1.5 text-center max-w-[140px] truncate">
                        <span title={atv.categoria ?? ""} className="truncate">
                          {atv.categoria ?? "—"}
                        </span>
                      </td>
                      <td className="border border-border px-2 py-1.5 text-center max-w-[140px] truncate">
                        <span title={atv.software ?? ""} className="truncate">
                          {atv.software ?? "—"}
                        </span>
                      </td>
                      <td className="border border-border px-2 py-1.5 text-center whitespace-nowrap">
                        {atv.tipo ?? "—"}
                      </td>
                      {orderedColaboradores.map((col) => {
                        const key = `${atv.id}::${col.id}`;
                        const lvl = matrizMap.get(key) ?? null;
                        return (
                          <td key={col.id} className="border border-border p-0 h-8 min-w-[64px] max-w-[84px]">
                            <EditableNivelCell
                              atividadeId={atv.id}
                              colaboradorId={col.id}
                              nivel={lvl}
                              onChange={handleNivelChange}
                              atividadeNome={atv.nome}
                              colaboradorNome={col.nome}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Role horizontal e verticalmente para navegar. Cabeçalhos e primeira coluna são fixos. Clique em uma
            célula para editar o nível pela cor — a alteração é salva em{" "}
            <code className="px-1 py-0.5 bg-muted rounded text-[10px]">qfq_matriz</code> e persiste após recarregar.
            Dados de{" "}
            <code className="px-1 py-0.5 bg-muted rounded text-[10px]">qfq_atividades</code> e{" "}
            <code className="px-1 py-0.5 bg-muted rounded text-[10px]">qfq_colaboradores</code> são somente leitura.
          </p>
        </div>
      )}
    </div>
  );
}
