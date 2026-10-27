import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Cargas Coca" },
      { name: "description", content: "Acesso à plataforma Cargas Coca." },
      { property: "og:title", content: "Entrar — Cargas Coca" },
      { property: "og:description", content: "Acesso à plataforma Cargas Coca." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "first">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/" });
        else toast.success("Conta criada. Confirme pelo link enviado ao seu e-mail.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg === "Invalid login credentials" ? "E-mail ou senha incorretos." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-md border bg-panel p-6">
        <div className="mb-5 flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-sm" />
          <div>
            <h1 className="text-base font-semibold leading-tight">Cargas Coca</h1>
            <p className="text-xs text-muted-foreground">Remessa · Faturamento</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "first" && (
            <div className="space-y-1">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "first" : "login")}
          className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {mode === "login" ? "Primeiro acesso do administrador" : "Já tenho conta"}
        </button>
        {mode === "first" && (
          <p className="mt-2 text-xs text-muted-foreground">
            A primeira conta criada vira administradora. As demais são criadas pelo administrador.
          </p>
        )}
      </div>
    </div>
  );
}
