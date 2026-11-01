import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/loads/StatusBadge";
import { LoadDetailsDialog } from "@/components/loads/LoadDetailsDialog";
import { ManualLoadDialog } from "@/components/loads/ManualLoadDialog";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { loadsQuery, useLoadsRealtime, useMe } from "@/lib/session";
import { fmtDate, fmtNum, todayIso, totalPallets, type LoadWithItems } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/acompanhamento")({
  head: () => ({
    meta: [
      { title: "Acompanhamento — Cargas Coca" },
      { name: "description", content: "Status das cargas importadas pela Remessa." },
      { property: "og:title", content: "Acompanhamento — Cargas Coca" },
      { property: "og:description", content: "Status das cargas importadas pela Remessa." },
    ],
  }),
  component: TrackingPage,
});

function TrackingPage() {
  const { data: me } = useMe();
  const [date, setDate] = useState(todayIso());
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<LoadWithItems | 'new' | null>(null);
  useLoadsRealtime();
  const { data: loads = [], isLoading } = useQuery(loadsQuery(date));

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return loads.filter(
      (l) =>
        (!s || [l.plate, l.dt, l.dest_name, l.dest_center, l.carrier].some((v) => v.toLowerCase().includes(s))),
    );
  }, [loads, q, me?.id]);
  const selected = (loads.find((l) => l.id === open) as LoadWithItems | undefined) ?? null;

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="mr-4 text-sm font-semibold">Acompanhamento</h1>
        {me?.roles.includes('remessa') && <><Button size="sm" onClick={() => setEditing('new')}>Nova carga</Button><Link to="/importar" className="text-xs underline">Importar programação</Link></>}
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40 bg-panel" />
        <Input
          placeholder="Buscar placa, DT, destino ou transportadora"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 w-80 bg-panel"
        />
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} carga(s)</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-panel">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
            <tr>
              {["Status", "Placa", "DT", "Transportadora", "Destino", "Carga", "Previsão", "Pallets", "Ordem prod.", "Ordem pallets"].map((h) => (
                <th key={h} className="border-b px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} onClick={() => setOpen(l.id)} className="cursor-pointer border-b hover:bg-muted/60">
                <td className="px-2 py-1">
                  <StatusBadge status={l.status} />
                  {l.locked_by && <span className="block text-muted-foreground">{l.locked_by_name}</span>}
                </td>
                <td className="px-2 font-medium">{l.plate}</td>
                <td className="px-2 tabular">{l.dt}</td>
                <td className="px-2">{l.carrier}</td>
                <td className="px-2">{l.dest_name}</td>
                <td className="px-2 tabular">{l.load_number}</td>
                <td className="px-2 tabular">{fmtDate(l.load_date)}</td>
                <td className="px-2 tabular">{fmtNum(totalPallets(l.load_items))}</td>
                <td className="px-2 tabular">{l.product_order || "—"}</td>
                <td className="px-2 tabular">{l.pallet_order || "—"}</td>
                <td>{l.status === 'pendente' && !l.locked_by && me?.roles.includes('remessa') && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(l); }}>Editar</Button>}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-6 text-center text-muted-foreground">
                  Nenhuma carga nesta data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <LoadDetailsDialog load={selected} onClose={() => setOpen(null)} billingEmail={me?.billing_email ?? null} />
      {editing && <ManualLoadDialog load={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
