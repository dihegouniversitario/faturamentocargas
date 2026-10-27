import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "remessa" | "faturamento";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Apenas administradores.");
}

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { full_name: string; email: string; password: string; role: Role; unit_id: string; admin: boolean }) => {
      if (!i.email?.includes("@")) throw new Error("E-mail inválido.");
      if (!i.password || i.password.length < 8) throw new Error("Senha deve ter ao menos 8 caracteres.");
      if (!i.full_name?.trim()) throw new Error("Informe o nome.");
      if (!["remessa", "faturamento"].includes(i.role)) throw new Error("Papel inválido.");
      if (!i.unit_id) throw new Error("Selecione a unidade.");
      return i;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name.trim() },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar usuário.");
    const id = created.user.id;
    await supabaseAdmin.from("profiles").update({ full_name: data.full_name.trim(), unit_id: data.unit_id }).eq("id", id);
    const roles = [{ user_id: id, role: data.role }, ...(data.admin ? [{ user_id: id, role: "admin" as const }] : [])];
    await supabaseAdmin.from("user_roles").insert(roles);
    return { id };
  });

export const updateAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { id: string; unit_id?: string | null; active?: boolean; role?: Role | null; admin?: boolean }) => i,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { unit_id?: string | null; active?: boolean } = {};
    if (data.unit_id !== undefined) patch.unit_id = data.unit_id;
    if (data.active !== undefined) {
      if (data.id === context.userId && !data.active) throw new Error("Você não pode desativar a si mesmo.");
      patch.active = data.active;
      await supabaseAdmin.auth.admin.updateUserById(data.id, { ban_duration: data.active ? "none" : "876000h" });
    }
    if (Object.keys(patch).length) await supabaseAdmin.from("profiles").update(patch).eq("id", data.id);
    if (data.role !== undefined) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id).in("role", ["remessa", "faturamento"]);
      if (data.role) await supabaseAdmin.from("user_roles").insert({ user_id: data.id, role: data.role });
    }
    if (data.admin !== undefined) {
      if (data.id === context.userId && !data.admin) throw new Error("Você não pode remover seu próprio acesso de administrador.");
      if (data.admin) await supabaseAdmin.from("user_roles").upsert({ user_id: data.id, role: "admin" }, { onConflict: "user_id,role" });
      else await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id).eq("role", "admin");
    }
    return { ok: true };
  });

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").order("created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
    }));
  });
