import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { catalogsQuery, importProgramming } from "@/lib/catalogs";
import { todayIso, type LoadWithItems } from "@/lib/status";
import type { ParsedLoad } from "@/lib/parse-loads";

export function ManualLoadDialog({ load, onClose }: { load?: LoadWithItems; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: catalogs } = useQuery(catalogsQuery);
  const [form, setForm] = useState({ load_date: load?.load_date ?? todayIso(), load_number: load?.load_number ?? '', dt: load?.dt ?? '', plate: load?.plate ?? '', destination_id: load?.destination_id ?? '', carrier_id: load?.carrier_id ?? '', notes: load?.notes ?? '' });
  const [items, setItems] = useState(load?.load_items.map((i) => ({ id: i.product_id ?? '', pallets: String(i.pallets), boxes: i.boxes, bpp: i.boxes_per_pallet })) ?? [{ id:'', pallets:'0', boxes:0, bpp:0 }]);
  const [busy,setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const d = catalogs?.destinations.find((d) => d.id === form.destination_id);
    const c = catalogs?.carriers.find((c) => c.id === form.carrier_id);
    if (!d || !c || items.some((i) => !i.id || !Number.isFinite(Number(i.pallets)) || Number(i.pallets)<0)) { toast.error('Selecione destino, transportadora e produtos.'); return; }
    const parsed: ParsedLoad & { notes: string } = { ...form, load_date_br: form.load_date.split('-').reverse().join('/'), origin_center: load?.origin_center ?? '', dest_center: d.sigla, dest_name:d.name, carrier:c.name, raw_lines:[], notes:form.notes,
      items: items.map((i) => { const p = catalogs?.products.find((p) => p.id===i.id); return { sap_code:p?.ijui_code ?? '', description:p?.description ?? '', pallets:Number(i.pallets), boxes: Number(i.pallets)*(p?.boxes_per_pallet ?? i.bpp) }; }) };
    if (parsed.items.some((i) => !i.sap_code)) { toast.error('O produto precisa de código Ijuí para a programação.'); return; }
    setBusy(true);
    try { await importProgramming([parsed]); await qc.invalidateQueries({ queryKey:['loads'] }); toast.success('Carga salva.'); onClose(); }
    catch (e) { toast.error((e as {message:string}).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent className="max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>{load ? 'Editar programação' : 'Nova carga'}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-3">
    <div className="grid grid-cols-2 gap-3">{(['load_date','load_number','dt','plate'] as const).map((k) => <label key={k} className="text-xs">{{load_date:'Previsão',load_number:'Nº da carga',dt:'DT',plate:'Placa'}[k]}<Input required readOnly={k==='dt' && !!load} type={k==='load_date'?'date':'text'} value={form[k]} onChange={(e) => setForm({...form,[k]:e.target.value})} /></label>)}</div>
    {(['destination_id','carrier_id'] as const).map((k) => <label key={k} className="block text-xs">{k==='destination_id'?'Destino':'Transportadora'}<select required className="h-9 w-full rounded-md border bg-panel" value={form[k]} onChange={(e) => setForm({...form,[k]:e.target.value})}><option value="">Selecione</option>{(k==='destination_id'?catalogs?.destinations:catalogs?.carriers)?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>)}
    {items.map((i,n) => <div key={n} className="flex gap-2"><select aria-label={`Produto ${n+1}`} className="min-w-0 flex-1 rounded-md border bg-panel" value={i.id} onChange={(e) => setItems(items.map((it,idx) => idx===n?{...it,id:e.target.value}:it))}><option value="">Produto</option>{catalogs?.products.filter((p)=>p.active && p.ijui_code).map((p)=><option key={p.id} value={p.id}>{p.short_name}</option>)}</select><Input aria-label={`Paletes ${n+1}`} type="number" min="0" step="any" className="w-24" value={i.pallets} onChange={(e)=>setItems(items.map((it,idx)=>idx===n?{...it,pallets:e.target.value}:it))} /><Button type="button" variant="outline" disabled={items.length===1} onClick={()=>setItems(items.filter((_,idx)=>idx!==n))}>Remover</Button></div>)}
    <Button type="button" variant="outline" size="sm" onClick={()=>setItems([...items,{id:'',pallets:'0',boxes:0,bpp:0}])}>Adicionar produto</Button>
    <label className="block text-xs">Observações<Textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} /></label>
    <Button disabled={busy} className="w-full">Salvar carga</Button>
  </form></DialogContent></Dialog>;
}