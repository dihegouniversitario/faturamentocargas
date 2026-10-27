import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { createAppUser, listAppUsers, updateAppUser } from "@/lib/admin.functions";
import { useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Cargas Coca" },
      { name: "description", content: "Cadastro de usuários e unidades." },
      { property: "og:title", content: "Usuários — Cargas Coca" },
      { property: "og:description", content: "Cadastro de usuários e unidades." },
    ],
  }),
  component: UsersPage,
});

const selectCls = "h-8 w-full rounded-sm border border-input bg-panel px-2 text-xs";

function UsersPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const list = useServerFn(listAppUsers);
  const create = useServerFn(createAppUser);
  const update = useServerFn(updateAppUser);
  const isAdmin = me?.roles.includes("admin");

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => list(), enabled: !!isAdmin });
  const { data: units = [] } = useQuery({
    queryKey: ["units"],
    enabled: !!isAdmin,
    queryFn: async () => (await supabase.from("units").select("*").order("name")).data ?? [],
  });

  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "remessa" as "remessa" | "faturamento", unit_id: "", admin: false });
  const [unitName, setUnitName] = useState("");

  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">Apenas administradores.</div>;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  async function saveUnit(id: string, patch: { name?: string; billing_email?: string }) {
    const { error } = await supabase.from("units").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["units"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="grid grid-cols-[1fr_320px] gap-4 p-4">
      <section className="space-y-4">
        <div className="rounded-md border bg-panel">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">Usuários</h2>
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                {["Nome", "E-mail", "Papel", "Unidade", "Admin", "Ativo"].map((h) => (
                  <th key={h} className="border-b px-2 py-1.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const role = u.roles.find((r) => r !== "admin") ?? "";
                return (
                  <tr key={u.id} className="border-b">
                    <td className="px-2 py-1 font-medium">{u.full_name || "—"}</td>
                    <td className="px-2">{u.email}</td>
                    <td className="px-2">
                      <select
                        className={selectCls}
                        value={role}
                        onChange={(e) =>
                          run(() => update({ data: { id: u.id, role: (e.target.value || null) as "remessa" | "faturamento" | null } }), "Papel atualizado.")
                        }
                      >
                        <option value="">—</option>
                        <option value="remessa">Remessa</option>
                        <option value="faturamento">Faturamento</option>
                      </select>
                    </td>
                    <td className="px-2">
                      <select
                        className={selectCls}
                        value={u.unit_id ?? ""}
                        onChange={(e) => run(() => update({ data: { id: u.id, unit_id: e.target.value || null } }), "Unidade atualizada.")}
                      >
                        <option value="">—</option>
                        {units.map((un) => (
                          <option key={un.id} value={un.id}>{un.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2">
                      <Checkbox
                        checked={u.roles.includes("admin")}
                        onCheckedChange={(c) => run(() => update({ data: { id: u.id, admin: !!c } }), "Permissão atualizada.")}
                      />
                    </td>
                    <td className="px-2">
                      <Switch
                        checked={u.active}
                        onCheckedChange={(c) => run(() => update({ data: { id: u.id, active: c } }), c ? "Usuário ativado." : "Usuário desativado.")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-md border bg-panel">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">Unidades</h2>
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="border-b px-2 py-1.5 font-medium">Nome</th>
                <th className="border-b px-2 py-1.5 font-medium">E-mail do Faturamento (formalização)</th>
              </tr>
            </thead>
            <tbody>
              {units.map((un) => (
                <tr key={un.id} className="border-b">
                  <td className="px-2 py-1">
                    <Input defaultValue={un.name} className="h-7 text-xs" onBlur={(e) => e.target.value !== un.name && saveUnit(un.id, { name: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <Input
                      defaultValue={un.billing_email ?? ""}
                      className="h-7 text-xs"
                      placeholder="faturamento@empresa.com"
                      onBlur={(e) => e.target.value !== (un.billing_email ?? "") && saveUnit(un.id, { billing_email: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form
            className="flex gap-2 p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!unitName.trim()) return;
              const { error } = await supabase.from("units").insert({ name: unitName.trim() });
              if (error) return toast.error(error.message);
              setUnitName("");
              qc.invalidateQueries({ queryKey: ["units"] });
            }}
          >
            <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Nova unidade" className="h-8 text-xs" />
            <Button size="sm" variant="outline" type="submit">Adicionar</Button>
          </form>
        </div>
      </section>

      <aside className="h-fit rounded-md border bg-panel">
        <h2 className="border-b px-3 py-2 text-sm font-semibold">Novo usuário</h2>
        <form
          className="space-y-2.5 p-3 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await create({ data: form });
              setForm({ ...form, full_name: "", email: "", password: "", admin: false });
            }, "Usuário criado.");
          }}
        >
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required className="h-8" />
          </div>
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="h-8" />
          </div>
          <div className="space-y-1">
            <Label>Senha inicial</Label>
            <Input type="text" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="h-8" />
          </div>
          <div className="space-y-1">
            <Label>Papel</Label>
            <select className={selectCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "remessa" | "faturamento" })}>
              <option value="remessa">Remessa</option>
              <option value="faturamento">Faturamento</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Unidade</Label>
            <select className={selectCls} value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} required>
              <option value="">Selecione</option>
              {units.map((un) => (
                <option key={un.id} value={un.id}>{un.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={form.admin} onCheckedChange={(c) => setForm({ ...form, admin: !!c })} /> Também é administrador
          </label>
          <Button type="submit" className="w-full" size="sm">Criar usuário</Button>
        </form>
      </aside>
    </div>
  );
}
