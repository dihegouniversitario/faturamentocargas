import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/loads/StatusBadge";
import { LoadDetailsDialog } from "@/components/loads/LoadDetailsDialog";
import { itinerariesQuery, loadsRangeQuery, useLoadsRealtime, useMe } from "@/lib/session";
import { fmtDate, fmtNum, todayIso, totalPallets, type LoadWithItems } from "@/lib/status";

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
      (l) => !s || [l.plate, l.dt, l.dest_name, l.dest_center, l.carrier, l.product_order, l.pallet_order].some((v) => v.toLowerCase().includes(s)),
    );
    const map = new Map<string, typeof filtered>();
    for (const l of filtered) map.set(l.import_date, [...(map.get(l.import_date) ?? []), l]);
    return [...map.entries()];
  }, [loads, q]);
  const selected = (loads.find((l) => l.id === open) as LoadWithItems | undefined) ?? null;
  const cols = ["Status", "Placa", "DT", "Transportadora", "Destino", "Itinerário", "Carga", "Previsão", "Pallets", "Ordem prod.", "Ordem pallets"];

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-sm font-semibold">Histórico</h1>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40 bg-panel" />
        <span className="text-xs text-muted-foreground">até</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40 bg-panel" />
        <Input placeholder="Buscar placa, DT, destino, ordem…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-72 bg-panel" />
        <span className="ml-auto text-xs text-muted-foreground">{days.reduce((s, [, r]) => s + r.length, 0)} carga(s)</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-panel">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
            <tr>{cols.map((h) => <th key={h} className="border-b px-2 py-1.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {days.map(([day, rows]) => (
              <DayRows key={day} day={day} rows={rows} itins={itins} onOpen={setOpen} span={cols.length} />
            ))}
            {!isLoading && days.length === 0 && (
              <tr><td colSpan={cols.length} className="px-2 py-6 text-center text-muted-foreground">Nenhuma carga no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <LoadDetailsDialog load={selected} onClose={() => setOpen(null)} billingEmail={me?.billing_email ?? null} />
    </div>
  );
}

function DayRows({ day, rows, itins, onOpen, span }: { day: string; rows: LoadWithItems[]; itins?: Map<string, string>; onOpen: (id: string) => void; span: number }) {
  return (
    <>
      <tr><td colSpan={span} className="border-b bg-muted/60 px-2 py-1 font-semibold">{fmtDate(day)} · {rows.length} carga(s)</td></tr>
      {rows.map((l) => (
        <tr key={l.id} onClick={() => onOpen(l.id)} className="cursor-pointer border-b hover:bg-muted/60">
          <td className="px-2 py-1"><StatusBadge status={l.status} /></td>
          <td className="px-2 font-medium">{l.plate}</td>
          <td className="px-2 tabular">{l.dt}</td>
          <td className="px-2">{l.carrier}</td>
          <td className="px-2">{l.dest_name}</td>
          <td className="px-2">{itins?.get(l.dest_center.trim()) || "—"}</td>
          <td className="px-2 tabular">{l.load_number}</td>
          <td className="px-2 tabular">{fmtDate(l.load_date)}</td>
          <td className="px-2 tabular">{fmtNum(totalPallets(l.load_items))}</td>
          <td className="px-2 tabular">{l.product_order || "—"}</td>
          <td className="px-2 tabular">{l.pallet_order || "—"}</td>
        </tr>
      ))}
    </>
  );
}
