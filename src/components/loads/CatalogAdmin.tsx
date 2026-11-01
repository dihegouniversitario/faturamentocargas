import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { catalogsQuery } from "@/lib/catalogs";
import type { Database } from "@/integrations/supabase/types";

type Kind = 'products' | 'destinations' | 'carriers';
const titles = { products: 'Produtos', destinations: 'Destinos', carriers: 'Transportadoras' };
const fields: Record<Kind, [string, string, string?][]> = {
  products: [['ijui_code','Código Ijuí'],['femsa_code','Código FEMSA'],['nota_item','Item nota','number'],['short_name','Nome curto'],['description','Descrição'],['boxes_per_pallet','Caixas por palete','number'],['box_weight','Peso caixa','number'],['active','Ativo','checkbox']],
  destinations: [['name','Nome'],['sigla','Sigla'],['center','Centro'],['cnpj','CNPJ'],['sap_client_code','Cliente SAP'],['itinerary','Itinerário'],['pallet_type','Tipo palete'],['pallet_code','Código palete'],['notes','Observações'],['unit_id','Unidade']],
  carriers: [['name','Nome'],['sap_code','Código SAP']],
};
export function CatalogAdmin() {
  const qc = useQueryClient();
  const { data: catalogs } = useQuery(catalogsQuery);
  const { data: units = [] } = useQuery({ queryKey: ['units'], queryFn: async () => (await supabase.from('units').select('*').order('name')).data ?? [] });
  const [kind, setKind] = useState<Kind>('products');
  const [form, setForm] = useState<Record<string, string | boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = catalogs?.[kind] ?? [];
  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [key,, type] of fields[kind]) payload[key] = type === 'number' ? (form[key] === '' || form[key] === undefined ? null : Number(form[key])) : type === 'checkbox' ? form[key] !== false : form[key] || (key === 'ijui_code' || key === 'sap_code' ? null : '');
      if (form['id']) payload['id'] = form['id'];
      let error;
      if (kind === 'products') ({ error } = await supabase.from('products').upsert(payload as Database['public']['Tables']['products']['Insert']));
      else if (kind === 'destinations') ({ error } = await supabase.from('destinations').upsert(payload as Database['public']['Tables']['destinations']['Insert']));
      else ({ error } = await supabase.from('carriers').upsert(payload as Database['public']['Tables']['carriers']['Insert']));
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['catalogs'] });
      qc.invalidateQueries({ queryKey: ['itineraries'] });
      setForm(null);
      toast.success('Cadastro salvo.');
    } catch (e) { toast.error((e as { message: string }).message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm('Excluir este cadastro? Cadastros em uso não podem ser excluídos.')) return;
    const { error } = await supabase.from(kind).delete().eq('id', id);
    if (error) toast.error('Não foi possível excluir. Verifique se o cadastro está em uso.');
    else qc.invalidateQueries({ queryKey: ['catalogs'] });
  }
  return <section className="space-y-3 border-t pt-4">
    <div className="flex gap-2">{(Object.keys(titles) as Kind[]).map((k) => <Button key={k} size="sm" variant={kind === k ? 'default' : 'outline'} onClick={() => setKind(k)}>{titles[k]}</Button>)}<Button className="ml-auto" size="sm" variant="outline" onClick={() => setForm({ active: true, pallet_type: 'VENDA', unit_id: units[0]?.id ?? '' })}><Plus className="size-4" />Adicionar</Button></div>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr>{fields[kind].filter(([k]) => k !== 'unit_id').map(([key, label]) => <th className="border-b p-2" key={key}>{label}</th>)}<th /></tr></thead><tbody>{rows.map((row) => <tr className="border-b" key={row.id}>{fields[kind].filter(([k]) => k !== 'unit_id').map(([key]) => <td className="p-2" key={key}>{String((row as unknown as Record<string, unknown>)[key] ?? '—')}</td>)}<td className="flex gap-1"><Button variant="ghost" size="icon" title="Editar" aria-label="Editar cadastro" onClick={() => setForm(Object.fromEntries(Object.entries(row).map(([k,v]) => [k, typeof v === 'boolean' ? v : String(v ?? '')])))}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" title="Excluir" aria-label="Excluir cadastro" onClick={() => remove(row.id)}><Trash2 className="size-4" /></Button></td></tr>)}</tbody></table></div>
    <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}><DialogContent className="max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>{titles[kind]}</DialogTitle></DialogHeader>{form && <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>{fields[kind].map(([key,label,type]) => <label className="text-xs" key={key}>{label}{key === 'pallet_type' || key === 'unit_id' ? <select className="h-9 w-full rounded-md border bg-panel" value={String(form[key] ?? '')} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>{key === 'pallet_type' ? <><option value="VENDA">Venda</option><option value="EMPRESTIMO">Empréstimo</option></> : units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select> : type === 'checkbox' ? <input className="ml-2" type="checkbox" checked={form[key] !== false} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} /> : <Input required={['femsa_code','name','sigla'].includes(key)} type={type ?? 'text'} step="any" value={String(form[key] ?? '')} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}</label>)}<Button disabled={busy} className="col-span-2" type="submit">Salvar</Button></form>}</DialogContent></Dialog>
  </section>;
}