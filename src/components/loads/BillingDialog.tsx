import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { catalogsQuery, calculateBoxes } from "@/lib/catalogs";
import { fmtNum, STATUS_LABEL, type LoadWithItems, type LoadStatus } from "@/lib/status";
import { StatusBadge } from "./StatusBadge";

const selectCls = "h-9 w-full rounded-md border bg-panel px-2 text-sm";
export function BillingDialog({ load, userId, onClose }: { load: LoadWithItems; userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: catalogs } = useQuery(catalogsQuery);
  const [form, setForm] = useState({ product_order: load.product_order, pallet_order: load.pallet_order, plate: load.plate, dt: load.dt, carrier_id: load.carrier_id ?? "" });
  const [items, setItems] = useState(load.load_items.map((i) => ({ product_id: i.product_id ?? "", pallets: String(i.pallets), boxes: i.boxes, boxes_per_pallet: i.boxes_per_pallet })));
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(t); }, []);
  const readOnly = load.locked_by !== userId || !load.locked_at || now - new Date(load.locked_at).getTime() >= 15 * 60000;
  const destination = catalogs?.destinations.find((d) => d.id === load.destination_id);

  async function save(status?: LoadStatus) {
    if (readOnly) return;
    if (!form.dt.trim() || !form.plate.trim() || !form.carrier_id || items.some((i) => !i.product_id || !Number.isFinite(Number(i.pallets.replace(",", "."))) || Number(i.pallets.replace(",", ".")) < 0)) { toast.error("Confira DT, placa, transportadora e produtos."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_billing_load", { load_id: load.id, payload: { ...form, items: items.map((i, position) => ({ ...i, position, pallets: Number(i.pallets.replace(",", ".")) })) } });
      if (error) throw error;
      if (status) {
        const result = await supabase.rpc("release_load", { load_id: load.id, new_status: status });
        if (result.error) throw result.error;
      }
      await qc.invalidateQueries({ queryKey: ["loads"] });
      toast.success(status ? `Carga ${STATUS_LABEL[status].toLowerCase()}.` : "Alterações salvas.");
      if (status) onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : (e as { message?: string }).message ?? "Não foi possível salvar."); }
    finally { setBusy(false); }
  }

  async function close() {
    if (busy) return;
    if (!readOnly) {
      const { error } = await supabase.rpc("release_load", { load_id: load.id, new_status: load.product_order && load.pallet_order ? "faturada" : "pendente" });
      if (error) { toast.error(error.message); return; }
      qc.invalidateQueries({ queryKey: ["loads"] });
    }
    onClose();
  }
  return <Dialog open onOpenChange={(open) => { if (!open) void close(); }}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
      <DialogHeader><DialogTitle>Carga {load.load_number} · {load.dest_name}</DialogTitle><DialogDescription>DT {load.dt} · <StatusBadge status={load.status} /></DialogDescription></DialogHeader>
      {readOnly && <p className="text-sm text-destructive">{load.locked_by === userId ? "Reserva expirada. Feche e abra novamente." : `Em edição por ${load.locked_by_name ?? "outro usuário"}. Somente leitura.`}</p>}
      <dl className="grid grid-cols-2 gap-3 border-b pb-4 text-xs sm:grid-cols-4">
        {[['Destino', load.dest_name], ['CNPJ', destination?.cnpj], ['Cliente SAP', destination?.sap_client_code], ['Itinerário', destination?.itinerary || load.itinerary], ['Tipo palete', destination?.pallet_type], ['Código palete', destination?.pallet_code], ['Observações', load.notes]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value || "—"}</dd></div>)}
      </dl>
      <fieldset disabled={readOnly || busy} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(['product_order','pallet_order','plate','dt'] as const).map((key) => <label key={key} className="text-xs">{{ product_order: 'Ordem de produto', pallet_order: 'Ordem de palete', plate: 'Placa', dt: 'DT' }[key]}<Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
          <label className="text-xs">Transportadora<select aria-label="Transportadora" className={selectCls} value={form.carrier_id} onChange={(e) => setForm({ ...form, carrier_id: e.target.value })}><option value="">Selecione</option>{catalogs?.carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => {
            const product = catalogs?.products.find((p) => p.id === item.product_id);
            const bpp = product?.boxes_per_pallet ?? item.boxes_per_pallet;
            const boxes = bpp > 0 ? calculateBoxes(Number(item.pallets.replace(",", ".")), bpp) : item.boxes;
            return <div key={idx} className="grid grid-cols-[minmax(130px,1fr)_90px_80px_90px_32px] items-end gap-2 border-b pb-2">
              <label className="text-xs">Produto<select aria-label={`Produto ${idx + 1}`} className={selectCls} value={item.product_id} onChange={(e) => setItems(items.map((it, n) => n === idx ? { ...it, product_id: e.target.value } : it))}><option value="">Selecione</option>{catalogs?.products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.short_name}</option>)}</select></label>
              <label className="text-xs">Paletes<Input aria-label={`Paletes ${idx + 1}`} inputMode="decimal" value={item.pallets} onChange={(e) => setItems(items.map((it, n) => n === idx ? { ...it, pallets: e.target.value } : it))} /></label>
              <div className="pb-2 text-xs">Caixas<strong className="block">{fmtNum(boxes)}</strong></div>
              <div className="pb-2 text-xs text-primary">FEMSA<strong className="block text-base">{product?.femsa_code || "—"}</strong></div>
              <Button aria-label={`Remover produto ${idx + 1}`} title="Remover produto" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => setItems(items.filter((_, n) => n !== idx))}><Trash2 className="size-4" /></Button>
            </div>;
          })}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { product_id: '', pallets: '0', boxes: 0, boxes_per_pallet: 0 }])}><Plus className="size-4" />Produto</Button>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={() => save()}>Salvar</Button>
          {(['faturada','em_corte','impressa_ag_cte','finalizada'] as const).map((status) => <Button key={status} variant={status === 'finalizada' ? 'default' : 'outline'} onClick={() => save(status)}>{STATUS_LABEL[status]}</Button>)}
        </div>
      </fieldset>
    </DialogContent>
  </Dialog>;
}