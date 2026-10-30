import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface Me {
  id: string;
  email: string;
  full_name: string;
  unit_id: string | null;
  unit_name: string | null;
  billing_email: string | null;
  active: boolean;
  roles: AppRole[];
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*, units(name, billing_email)").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id),
    ]);
    return {
      id: u.user.id,
      email: u.user.email ?? "",
      full_name: p?.full_name ?? "",
      unit_id: p?.unit_id ?? null,
      unit_name: p?.units?.name ?? null,
      billing_email: p?.units?.billing_email ?? null,
      active: p?.active ?? false,
      roles: (r ?? []).map((x) => x.role),
    };
  },
  staleTime: 60_000,
});

export const useMe = () => useQuery(meQuery);

/** Subscribes to realtime changes on loads and items and refreshes load lists. */
export function useLoadsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`loads-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "loads" }, () =>
        qc.invalidateQueries({ queryKey: ["loads"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "load_items" }, () =>
        qc.invalidateQueries({ queryKey: ["loads"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

export const loadsQuery = (date: string) =>
  queryOptions({
    queryKey: ["loads", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loads")
        .select("*, load_items(*)")
        .eq("import_date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map((l) => ({ ...l, load_items: [...l.load_items].sort((a, b) => a.position - b.position) }));
    },
  });

/** Loads imported between two dates (inclusive), newest day first — general history. */
export const loadsRangeQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["loads", "range", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loads")
        .select("*, load_items(*)")
        .gte("import_date", from)
        .lte("import_date", to)
        .order("import_date", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map((l) => ({ ...l, load_items: [...l.load_items].sort((a, b) => a.position - b.position) }));
    },
  });

/** Fixed itinerary per destination center, registered once (not edited in billing). */
export const itinerariesQuery = queryOptions({
  queryKey: ["itineraries"],
  queryFn: async () => {
    const { data, error } = await supabase.from("itineraries").select("dest_center, itinerary");
    if (error) throw error;
    return new Map(data.map((r) => [r.dest_center.trim(), r.itinerary]));
  },
  staleTime: 5 * 60_000,
});
