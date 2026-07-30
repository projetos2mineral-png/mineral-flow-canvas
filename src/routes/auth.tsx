import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar · DB Projetos" },
      { name: "description", content: "Acesse o dashboard interno." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"auth" | "forgot">("auth");
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error("Falha ao entrar: " + error.message);
    else toast.success("Bem-vindo!");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name },
      },
    });
    setLoading(false);
    if (error) toast.error("Falha ao cadastrar: " + error.message);
    else toast.success("Cadastro realizado! Você já pode entrar.");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false);
    // Sempre exibir mensagem genérica, independentemente do resultado
    if (error) {
      // Logamos só no console para diagnóstico, mas a mensagem ao usuário é neutra
      console.warn("resetPasswordForEmail:", error.message);
    }
    toast.success(
      "Se este e-mail estiver cadastrado, enviaremos um link para redefinição de senha."
    );
    setMode("auth");
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <img
            src={logoAsset.url}
            alt="Mineral Geologia"
            width={72}
            height={72}
            className="h-16 w-auto object-contain"
          />
          <div>
            <h1 className="text-lg font-semibold">DB Projetos</h1>
            <p className="text-xs text-muted-foreground">Mineral Geologia</p>
          </div>
        </div>

        {mode === "forgot" ? (
          <form onSubmit={handleForgotPassword} className="space-y-3">
            <button
              type="button"
              onClick={() => setMode("auth")}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar para entrar
            </button>
            <div>
              <h2 className="text-base font-semibold">Recuperar senha</h2>
              <p className="text-xs text-muted-foreground">
                Informe seu e-mail e enviaremos um link para redefinir a senha.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email-reset">E-mail</Label>
              <Input
                id="email-reset"
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando…" : "Enviar link de recuperação"}
            </Button>
          </form>
        ) : (
        <Tabs defaultValue="entrar">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="entrar">Entrar</TabsTrigger>
            <TabsTrigger value="cadastrar">Cadastrar</TabsTrigger>
          </TabsList>
          <TabsContent value="entrar">
            <form onSubmit={handleSignIn} className="space-y-3 mt-4">
              <div className="space-y-1">
                <Label htmlFor="email-in">E-mail</Label>
                <Input id="email-in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pwd-in">Senha</Label>
                <Input id="pwd-in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Entrando…" : "Entrar"}
              </Button>
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setMode("forgot");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
            </form>
          </TabsContent>
          <TabsContent value="cadastrar">
            <form onSubmit={handleSignUp} className="space-y-3 mt-4">
              <div className="space-y-1">
                <Label htmlFor="name-up">Nome</Label>
                <Input id="name-up" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email-up">E-mail</Label>
                <Input id="email-up" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pwd-up">Senha</Label>
                <Input id="pwd-up" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Cadastrando…" : "Cadastrar"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        )}
      </div>
    </div>
  );
}