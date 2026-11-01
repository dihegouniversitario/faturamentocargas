import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/loads/StatusBadge";
import { LoadDetailsDialog } from "@/components/loads/LoadDetailsDialog";
import { itinerariesQuery, loadsRangeQuery, useLoadsRealtime, useMe } from "@/lib/session";
import { fmtDate, fmtNum, todayIso, totalPallets, type LoadWithItems } from "@/lib/status";
import { loadLabel } from "@/lib/parse-loads";
import { STATUS_CLASS } from "@/lib/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — Cargas Coca" },
      { name: "description", content: "Histórico geral das cargas por dia de importação." },
      { property: "og:title", content: "Histórico — Cargas Coca" },
      { property: "og:description", content: "Histórico geral das cargas por dia de importação." },
    ],
  }),
  component: HistoryPage,
});

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function HistoryPage() {
  const { data: me } = useMe();
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(todayIso());
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useLoadsRealtime();
  const { data: loads = [], isLoading } = useQuery(loadsRangeQuery(from, to));
  const { data: itins } = useQuery(itinerariesQuery);

  const days = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = loads.filter(
      (l) =>
        !s ||
        [l.plate, l.dt, l.dest_name, l.dest_center, l.carrier, l.product_order, l.pallet_order].some((v) =>
          v.toLowerCase().includes(s),
        ),
    );
    const map = new Map<string, typeof filtered>();
    for (const l of filtered) map.set(l.import_date, [...(map.get(l.import_date) ?? []), l]);
    // Dia mais recente primeiro, como na planilha (última importação em cima).
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [loads, q]);

  const selected = (loads.find((l) => l.id === open) as LoadWithItems | undefined) ?? null;
  const total = days.reduce((s, [, r]) => s + r.length, 0);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="mr-1">
          <Link to="/faturamento">
            <ArrowLeft className="mr-1 size-4" />
            Faturamento
          </Link>
        </Button>
        <h1 className="mr-4 text-sm font-semibold">Histórico</h1>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40 bg-panel" />
        <span className="text-xs text-muted-foreground">até</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40 bg-panel" />
        <Input
          placeholder="Buscar placa, DT, destino, ordem…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 w-72 bg-panel"
        />
        <span className="ml-auto text-xs text-muted-foreground">{total} carga(s)</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {days.map(([day, rows]) => (
          <section key={day} className="mb-4">
            {/* Cabeçalho do dia — a faixa da planilha */}
            <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-md border border-b-0 bg-muted px-3 py-1.5">
              <span className="text-xs font-semibold">{fmtDate(day)}</span>
              <span className="text-xs text-muted-foreground">· {rows.length} carga(s)</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {fmtNum(rows.reduce((s, l) => s + totalPallets(l.load_items), 0))} paletes ·{" "}
                {fmtNum(rows.reduce((s, l) => s + l.load_items.reduce((a, i) => a + i.boxes, 0), 0))} caixas
              </span>
            </div>

            {/* Cargas daquele dia, lado a lado */}
            <div className="grid gap-2 rounded-b-md border bg-panel p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setOpen(l.id)}
                  className={cn(
                    "flex h-auto flex-col items-start gap-1 rounded-md border p-3 text-left transition-shadow hover:shadow-sm",
                    STATUS_CLASS[l.status],
                  )}
                >
                  <span className="text-xs font-semibold">Carga {l.load_number}</span>
                  <span className="text-sm font-semibold">{l.plate}</span>
                  <span className="text-xs tabular">DT {l.dt}</span>
                  <span className="text-xs">{l.carrier || "—"}</span>
                  <span className="text-xs">
                    {l.dest_name} · {l.dest_center}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Itin. {itins?.get(l.dest_center.trim()) || "—"}
                  </span>
                  <span className="text-xs tabular">
                    {fmtNum(totalPallets(l.load_items))} paletes ·{" "}
                    {fmtNum(l.load_items.reduce((s, i) => s + i.boxes, 0))} caixas
                  </span>
                  <span className="text-xs tabular">
                    Ordens: {l.product_order || "—"} / {l.pallet_order || "—"}
                  </span>
                  <StatusBadge status={l.status} />
                </button>
              ))}
            </div>
          </section>
        ))}

        {!isLoading && days.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma carga no período.</p>
        )}
      </div>

      <LoadDetailsDialog load={selected} onClose={() => setOpen(null)} billingEmail={me?.billing_email ?? null} />
    </div>
  );
}
