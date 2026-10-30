import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, type AppRole } from "@/lib/session";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Shell,
});

const NAV: { to: string; label: string; roles: AppRole[] }[] = [
  { to: "/importar", label: "Importar", roles: ["remessa"] },
  { to: "/acompanhamento", label: "Acompanhamento", roles: ["remessa"] },
  { to: "/faturamento", label: "Faturamento", roles: ["faturamento"] },
  { to: "/historico", label: "Histórico", roles: ["remessa", "faturamento", "admin"] },
  { to: "/usuarios", label: "Usuários", roles: ["admin"] },
];

function Shell() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading || !me) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  const items = NAV.filter((n) => n.roles.some((r) => me.roles.includes(r)));
  const blocked = !me.active || (!me.unit_id && !me.roles.includes("admin")) || me.roles.length === 0;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-11 shrink-0 items-center gap-6 bg-sidebar px-4 text-sidebar-foreground">
        <div className="flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" width={20} height={20} className="rounded-sm" />
          <span className="text-sm font-semibold text-sidebar-accent-foreground">Cargas Coca</span>
        </div>
        <nav className="flex h-full items-stretch gap-1">
          {items.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center border-b-2 border-transparent px-3 text-sm hover:text-sidebar-accent-foreground"
              activeProps={{ className: "border-sidebar-primary text-sidebar-accent-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span>
            {me.full_name || me.email}
            {me.unit_name ? ` · ${me.unit_name}` : ""}
          </span>
          <button onClick={signOut} className="flex items-center gap-1 hover:text-sidebar-accent-foreground" title="Sair">
            <LogOut className="size-3.5" /> Sair
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        {blocked ? (
          <div className="p-6 text-sm text-muted-foreground">
            Seu acesso ainda não foi liberado. Peça ao administrador para definir seu papel e sua unidade.
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
