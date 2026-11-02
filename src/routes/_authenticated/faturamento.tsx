import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BillingDialog } from "@/components/loads/BillingDialog";
import { StatusBadge } from "@/components/loads/StatusBadge";
import { loadsQuery, useLoadsRealtime, useMe } from "@/lib/session";
import { STATUS_CLASS, fmtDate, fmtNum, todayIso, totalPallets, type LoadWithItems } from "@/lib/status";
import { loadLabel } from "@/lib/parse-loads";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/faturamento")({
  head: () => ({
    meta: [
      { title: "Faturamento — Cargas Coca" },
      { name: "description", content: "Busca e faturamento de cargas por dia de importação." },
      { property: "og:title", content: "Faturamento — Cargas Coca" },
      { property: "og:description", content: "Busca e faturamento de cargas por dia de importação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

/** Espera o usuário parar de digitar antes de consultar o banco. */
function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const sanitize = (q: string) => q.replace(/[%,()]/g, "").slice(0, 80);

const SEARCH_COLUMNS = `
  id, load_number, status, plate, dt, load_date, import_date,
  carrier, locked_by, locked_by_name, dest_name,
  load_items ( pallets, boxes )
`;

function BillingPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<LoadWithItems[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useLoadsRealtime();
  const { data: loads = [], error } = useQuery(loadsQuery(date));
  const selected = loads.find((l) => l.id === selectedId) ?? hits.find((l) => l.id === selectedId);

  const searching = search.trim().length > 0;
  const term = useDebounced(search, 250);

  // Enquanto digita: consulta leve e mostra só os resultados encontrados.
  useEffect(() => {
    const q = sanitize(term.trim());
    if (q.length < 2) {
      setHits([]);
      if (term.trim() === "") setMessage("");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("loads")
        .select(SEARCH_COLUMNS)
        .or(`dt.ilike.%${q}%,plate.ilike.%${q}%,carrier.ilike.%${q}%`)
        .order("import_date", { ascending: false })
        .limit(30);
      if (cancelled) return;
      if (err) {
        toast.error(err.message);
        return;
      }
      const rows = (data ?? []) as LoadWithItems[];
      // Bate exato em DT ou placa → mostra só essa carga.
      const exact = rows.filter(
        (r) => r.dt?.toLowerCase() === q.toLowerCase() || r.plate?.toLowerCase() === q.toLowerCase(),
      );
      setHits(exact.length ? exact : rows);
      setMessage(rows.length ? "" : "Nenhuma carga encontrada.");
    })();
    return () => {
      cancelled = true;
    };
  }, [term]);

  /** Sai do modo busca e volta para o dia inteiro. */
  function showDay(iso?: string) {
    if (iso) setDate(iso);
    setSearch("");
    setHits([]);
    setMessage("");
  }

  async function open(l: LoadWithItems) {
  const { error } = await supabase.rpc("claim_load", { load_id: l.id });
  if (error) {
    toast.error(error.message);   // "em edição por Fulano"
    return;                       // não abre
  }
  await qc.invalidateQueries({ queryKey: ["loads"] });
  setSelectedId(l.id);
}

  if (!me?.roles.includes("faturamento"))
    return <p className="p-6 text-sm text-muted-foreground">Apenas o Faturamento acessa esta tela.</p>;

  const queue = (searching ? hits : loads).filter(
    (l) => !["saida", "finalizada"].includes(l.status) && (!pending || l.status === "pendente"),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Faturamento</h1>
        <Button variant={pending ? "default" : "outline"} size="sm" onClick={() => setPending(!pending)}>
          Pendentes
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/historico">Histórico</Link>
        </Button>
        <Input
          aria-label="Dia de importação"
          type="date"
          value={date}
          disabled={searching}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
      </div>

      <form
        onSubmit={(e) => e.preventDefault()}
        className="mx-auto flex w-full max-w-2xl items-center gap-2 border-b py-6"
      >
        <Search className="size-5 shrink-0 text-muted-foreground" />
        <Input
          aria-label="Buscar DT, placa ou transportadora"
          placeholder="DT, placa ou transportadora"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 flex-1 text-base"
        />
        {searching && (
          <Button type="button" variant="ghost" size="icon" onClick={() => showDay()} title="Limpar busca">
            <X className="size-4" />
          </Button>
        )}
      </form>

      {message && <p className="text-center text-sm text-muted-foreground">{message}</p>}

      <div className="text-xs text-muted-foreground">
        {searching
          ? `${queue.length} resultado(s) para "${search.trim()}"`
          : `${fmtDate(date)} · ${queue.length} carga(s)`}
      </div>
      {error && <p className="text-destructive">Não foi possível carregar as cargas.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {queue.map((l) => (
          <Button
            variant="ghost"
            key={l.id}
            onClick={() => open(l)}
            className={cn(
              "h-auto min-h-32 flex-col items-start whitespace-normal rounded-md border p-4 text-left",
              STATUS_CLASS[l.status],
            )}
          >
            <span className="w-full text-sm font-semibold">{loadLabel(l.plate, l.dt, l.carrier)}</span>
            <span className="text-xs">
              Carga {l.load_number} · {l.dest_name}
            </span>
            <span className="text-xs">
              DT {l.dt} · {fmtNum(totalPallets(l.load_items))} paletes ·{" "}
              {fmtNum(l.load_items.reduce((s, i) => s + i.boxes, 0))} caixas
            </span>
            <StatusBadge status={l.status} />
            {l.locked_by && <span className="text-xs">Em edição por {l.locked_by_name}</span>}
          </Button>
        ))}
      </div>
      {!queue.length && !message && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma carga na fila.</p>
      )}
      {selected && (
        <BillingDialog key={selected.id} load={selected} userId={me.id} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
