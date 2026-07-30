import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  fetchDashboardUsers,
  updateUserAccessLevel,
  updateUserActive,
  type DashboardUser,
} from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { RequireLevel } from "@/components/RequireLevel";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gerenciar-usuarios")({
  head: () => ({
    meta: [
      { title: "Gerenciar Usuários · Projetos Runrun.it" },
      { name: "description", content: "Administração de níveis de acesso dos usuários do dashboard." },
    ],
  }),
  component: () => (
    <RequireLevel allow={["administrador"]}>
      <GerenciarUsuariosPage />
    </RequireLevel>
  ),
});

type Level = "comum" | "lider" | "administrador";

const LEVEL_LABEL: Record<Level, string> = {
  comum: "Comum",
  lider: "Líder",
  administrador: "Administrador",
};

function GerenciarUsuariosPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", "users"],
    queryFn: fetchDashboardUsers,
    staleTime: 30_000,
  });
  // Ao abrir a página, marca como "vistos" para limpar o badge no menu.
  useEffect(() => {
    try {
      window.localStorage.setItem("last_seen_users_at", String(Date.now()));
    } catch {
      /* ignore */
    }
  }, []);

  const [search, setSearch] = useState("");
  const users: DashboardUser[] = data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      )
    : users;

  const handleLevel = async (u: DashboardUser, next: Level) => {
    try {
      await updateUserAccessLevel(u.id, next);
      toast.success(`Nível de ${u.name} atualizado para ${LEVEL_LABEL[next]}`);
      qc.invalidateQueries({ queryKey: ["dashboard", "users"] });
    } catch (e) {
      toast.error("Falha ao atualizar nível: " + (e as Error).message);
    }
  };

  const handleActive = async (u: DashboardUser, next: boolean) => {
    try {
      await updateUserActive(u.id, next);
      toast.success(next ? "Usuário ativado" : "Usuário inativado");
      qc.invalidateQueries({ queryKey: ["dashboard", "users"] });
    } catch (e) {
      toast.error("Falha ao atualizar status: " + (e as Error).message);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gerenciar Usuários</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} usuário(s) cadastrado(s). Somente administradores podem alterar níveis de acesso.
        </p>
      </div>

      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          className="pl-9"
        />
      </div>

      {error && (
        <div className="text-sm text-destructive">
          Erro ao carregar usuários: {(error as Error).message}
        </div>
      )}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Nível de acesso</TableHead>
                <TableHead>Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const currentLevel = (u.access_level ?? "comum") as Level;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={currentLevel}
                          onValueChange={(v) => handleLevel(u, v as Level)}
                        >
                          <SelectTrigger className="w-[180px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="comum">Comum</SelectItem>
                            <SelectItem value="lider">Líder</SelectItem>
                            <SelectItem value="administrador">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                        {currentLevel === "administrador" && (
                          <Badge variant="outline" className="text-primary border-primary/60">
                            Admin
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.is_active !== false}
                          onCheckedChange={(v) => handleActive(u, v)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {u.is_active !== false ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}