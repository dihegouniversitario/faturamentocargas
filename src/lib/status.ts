import type { Database } from "@/integrations/supabase/types";

export type LoadStatus = Database["public"]["Enums"]["load_status"];
export type Load = Database["public"]["Tables"]["loads"]["Row"];
export type LoadItem = Database["public"]["Tables"]["load_items"]["Row"];
export type LoadWithItems = Load & { load_items: LoadItem[] };

export const STATUS_LABEL: Record<LoadStatus, string> = {
  pendente: "Não faturada",
  em_faturamento: "Em faturamento",
  faturada: "Faturada",
  erro: "Com erro",
  saida: "Com saída",
  faturando: "Faturando",
  em_corte: "Em corte",
  impressa_ag_cte: "Impressa ag. CT-e",
  finalizada: "Finalizada",
};

export const STATUS_CLASS: Record<LoadStatus, string> = {
  pendente: "bg-st-pendente text-st-pendente-fg",
  em_faturamento: "bg-st-faturamento text-st-faturamento-fg",
  faturada: "bg-st-faturada text-st-faturada-fg",
  erro: "bg-st-erro text-st-erro-fg",
  saida: "bg-st-saida text-st-saida-fg",
  faturando: "bg-st-faturamento text-st-faturamento-fg",
  em_corte: "bg-st-erro text-st-erro-fg",
  impressa_ag_cte: "bg-st-saida text-st-saida-fg",
  finalizada: "bg-st-saida text-st-saida-fg",
};

export const LOCK_MINUTES = 15;

/** A lock is active when another user opened the load less than 15 minutes ago. */
export function isLockedByOther(load: Pick<Load, "locked_by" | "locked_at">, userId: string, now = Date.now()) {
  if (!load.locked_by || load.locked_by === userId || !load.locked_at) return false;
  return now - new Date(load.locked_at).getTime() < LOCK_MINUTES * 60_000;
}

export const totalPallets = (items: LoadItem[]) => items.reduce((s, i) => s + Number(i.pallets || 0), 0);

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const fmtDate = (iso: string) => iso.split("-").reverse().join("/");
export const fmtNum = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
