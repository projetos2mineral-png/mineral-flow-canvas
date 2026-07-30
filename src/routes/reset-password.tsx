import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Briefcase, KeyRound } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha · Projetos Runrun.it" },
      { name: "description", content: "Defina uma nova senha de acesso." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Aguarda o Supabase processar o link de recuperação (event PASSWORD_RECOVERY)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Caso já exista sessão (link já processado), libera direto
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("Falha ao atualizar a senha: " + error.message);
      return;
    }
    toast.success("Senha atualizada com sucesso!");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Redefinir senha</h1>
            <p className="text-xs text-muted-foreground">Cadastre uma nova senha de acesso.</p>
          </div>
        </div>

        {!ready ? (
          <p className="text-sm text-muted-foreground">
            Validando link de recuperação… Se você não chegou aqui pelo e-mail enviado pelo
            sistema, solicite novamente em “Esqueci minha senha”.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pwd-new">Nova senha</Label>
              <Input
                id="pwd-new"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pwd-confirm">Confirmar nova senha</Label>
              <Input
                id="pwd-confirm"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <KeyRound className="h-4 w-4" />
              {loading ? "Atualizando…" : "Atualizar senha"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}