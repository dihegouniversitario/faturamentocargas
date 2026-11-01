import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { ParsedLoad } from "./parse-loads";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type Destination = Database["public"]["Tables"]["destinations"]["Row"];
export type Carrier = Database["public"]["Tables"]["carriers"]["Row"];
export const normalizeName = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export const calculateBoxes = (pallets: number, boxesPerPallet: number) => pallets * boxesPerPallet;
export const catalogsQuery = queryOptions({
  queryKey: ["catalogs"],
  queryFn: async () => {
    const [p, d, c] = await Promise.all([
      supabase.from("products").select("*").order("nota_item"),
      supabase.from("destinations").select("*").order("name"),
      supabase.from("carriers").select("*").order("name"),
    ]);
    if (p.error || d.error || c.error) throw p.error || d.error || c.error;
    return { products: p.data ?? [], destinations: d.data ?? [], carriers: c.data ?? [] };
  },
});
export function validateProgramming(loads: ParsedLoad[], catalogs: { products: Product[]; destinations: Destination[]; carriers: Carrier[] }) {
  return loads.flatMap((l) => {
    const errors: string[] = [];
    if (!catalogs.destinations.some((d) => normalizeName(d.sigla) === normalizeName(l.dest_center))) errors.push(`DT ${l.dt}: destino desconhecido (${l.dest_center})`);
    if (!catalogs.carriers.some((c) => normalizeName(c.name) === normalizeName(l.carrier))) errors.push(`DT ${l.dt}: transportadora desconhecida (${l.carrier})`);
    l.items.forEach((i, idx) => {
      if (!catalogs.products.some((p) => p.active && p.ijui_code === i.sap_code)) errors.push(`DT ${l.dt}, produto ${idx + 1}: SKU desconhecido (${i.sap_code})`);
      if (i.boxes < 0 || i.pallets < 0) errors.push(`DT ${l.dt}, produto ${idx + 1}: quantidade negativa`);
    });
    return errors;
  });
}

export async function importProgramming(loads: ParsedLoad[]) {
  const { data, error } = await supabase.rpc("import_programming", {
    payload: loads.map((l) => ({ ...l, raw_text: l.raw_lines.join("\n"), items: l.items.map((i, position) => ({ ...i, position })) })),
  });
  if (error) throw error;
  return data;
}