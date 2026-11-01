import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogsQuery, calculateBoxes, type Product } from "@/lib/catalogs";
import { fmtNum } from "@/lib/status";

const PALLET_CODE: Record<string, string> = { VENDA: "118571", EMPRESTIMO: "197604" };

type Item = { key: string; product_id: string; pallets: number; boxes: number; boxes_per_pallet: number };

function CopyButton({ value, label }: { value: string; label: string }) {
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copiar ${label}`}
      className="ml-1 align-middle text-muted-foreground transition-colors hover:text-foreground"
    >
      <Copy className="inline size-3" />
    </button>
  );
}

function FieldLabel({ children, copyValue }: { children: React.ReactNode; copyValue?: string }) {
  return (
    <Label className="text-[11px] text-muted-foreground">
      {children}
      {copyValue !== undefined && <CopyButton value={copyValue} label={String(children)} />}
    </Label>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xs">{value || "—"}</p>
    </div>
  );
}

export function BillingDialog({
  load,
  userId,
  onClose,
}: {
  load: any;
  userId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: catalogs } = useQuery(catalogsQuery);

  const [order1, setOrder1] = useState(load.product_order ?? "");
  const [order2, setOrder2] = useState(load.pallet_order ?? "");
  const [plate, setPlate] = useState(load.plate ?? "");
  const [dt, setDt] = useState(load.dt ?? "");
  const [carrierId, setCarrierId] = useState<string>(load.carrier_id ?? "");
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<Item[]>(
    (load.load_items ?? []).map((i: any, idx: number) => ({
      key: `i${idx}`,
      product_id: i.product_id ?? "",
      pallets: Number(i.pallets ?? 0),
      boxes: Number(i.boxes ?? 0),
      boxes_per_pallet: Number(i.boxes_per_pallet ?? 0),
    })),
  );

  const carrierName = catalogs?.carriers.find((c) => c.id === carrierId)?.name ?? load.carrier ?? "";
  const palletType = load.pallet_type ?? "VENDA";
  const palletCode = PALLET_CODE[palletType] ?? PALLET_CODE.VENDA;
  const totalPallets = items.reduce((s, i) => s + Number(i.pallets || 0), 0);

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function pickProduct(idx: number, productId: string) {
    const p: Product | undefined = catalogs?.products.find((x) => x.id === productId);
    setItem(idx, {
      product_id: productId,
      boxes_per_pallet: Number(p?.boxes_per_pallet ?? 0),
      boxes: calculateBoxes(items[idx]?.pallets ?? 0, Number(p?.boxes_per_pallet ?? 0)),
    });
  }

  function pickPallets(idx: number, pallets: number) {
    setItem(idx, { pallets, boxes: calculateBoxes(pallets, items[idx]?.boxes_per_pallet ?? 0) });
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { key: `n${Date.now()}`, product_id: "", pallets: 0, boxes: 0, boxes_per_pallet: 0 },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!items.length) {
      toast.error("Inclua ao menos um produto");
      return;
    }
    if (items.some((i) => !i.product_id)) {
      toast.error("Selecione todos os produtos");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("save_billing_load", {
        load_id: load.id,
        payload: {
          product_order: order1,
          pallet_order: order2,
          plate,
          dt,
          carrier_id: carrierId,
          items: items.map((i, position) => ({
            product_id: i.product_id,
            pallets: i.pallets,
            boxes: i.boxes,
            boxes_per_pallet: i.boxes_per_pallet,
            position,
          })),
        },
      });
      if (error) throw error;
      toast.success("Carga salva");
      await qc.invalidateQueries({ queryKey: ["loads"] });
      onClose();
    } catch (e) {
      toast.error((e as { message: string }).message);
    } finally {
      setSaving(false);
    }
  }

  async function release(status: string) {
    const { error } = await supabase.rpc("release_load", { load_id: load.id, new_status: status });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Status atualizado");
    await qc.invalidateQueries({ queryKey: ["loads"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Carga {load.load_number} · {load.dest_name ?? load.dest_center}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">DT {dt || "—"} · {load.status}</p>
        </DialogHeader>

        {/* Dados do destino — leitura, compacto */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-4">
          <ReadField label="Centro" value={load.dest_center ?? ""} />
          <ReadField label="CNPJ" value={load.cnpj ?? ""} />
          <ReadField label="Cliente SAP" value={load.sap_client_code ?? ""} />
          <ReadField label="Itinerário" value={load.itinerary ?? ""} />
          <ReadField label="Tipo palete" value={palletType} />
          <ReadField label="Código palete" value={palletCode} />
          <ReadField label="Observações" value={load.notes ?? ""} />
        </div>

        {/* Ordens — inputs estreitos */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel copyValue={order1}>Ordem de produto</FieldLabel>
            <Input value={order1} onChange={(e) => setOrder1(e.target.value)} inputMode="numeric" className="h-9" />
          </div>
          <div>
            <FieldLabel copyValue={order2}>Ordem de palete</FieldLabel>
            <Input value={order2} onChange={(e) => setOrder2(e.target.value)} inputMode="numeric" className="h-9" />
          </div>
        </div>

        {/* Placa, DT, Transportadora — tudo na mesma linha */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <FieldLabel copyValue={plate}>Placa</FieldLabel>
            <Input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              className="h-9"
            />
          </div>
          <div>
            <FieldLabel copyValue={dt}>DT</FieldLabel>
            <Input value={dt} onChange={(e) => setDt(e.target.value)} inputMode="numeric" className="h-9" />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel copyValue={carrierName}>Transportadora</FieldLabel>
            <Select value={carrierId} onValueChange={setCarrierId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(catalogs?.carriers ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Produtos — sobe, porque os campos acima encolheram */}
        <div className="space-y-2">
          <Label className="text-[11px] text-muted-foreground">Produtos</Label>
          {items.map((it, idx) => {
            const p = catalogs?.products.find((x) => x.id === it.product_id);
            return (
              <div key={it.key} className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <Label className="text-[11px] text-muted-foreground">Produto</Label>
                  <Select value={it.product_id} onValueChange={(v) => pickProduct(idx, v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {(catalogs?.products ?? [])
                        .filter((x) => x.active)
                        .map((x) => (
                          <SelectItem key={x.id} value={x.id}>
                            {x.short_name || x.description} — {x.femsa_code}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-20">
                  <Label className="text-[11px] text-muted-foreground">Paletes</Label>
                  <Input
                    type="number"
                    min={0}
                    value={it.pallets}
                    onChange={(e) => pickPallets(idx, Number(e.target.value))}
                    className="h-9"
                  />
                </div>

                <div className="w-24">
                  <Label className="text-[11px] text-muted-foreground">Caixas</Label>
                  <Input
                    value={fmtNum(calculateBoxes(it.pallets, it.boxes_per_pallet))}
                    readOnly
                    className="h-9 bg-muted"
                  />
                </div>

                <div className="w-24">
                  <Label className="text-[11px] font-semibold text-destructive">FEMSA</Label>
                  {p ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(p.femsa_code);
                        toast.success("Código FEMSA copiado");
                      }}
                      className="h-9 w-full rounded-md border border-destructive px-2 font-mono text-sm font-bold text-destructive hover:bg-destructive/10"
                    >
                      {p.femsa_code}
                    </button>
                  ) : (
                    <p className="py-2 text-sm">—</p>
                  )}
                </div>

                <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="mr-1 size-4" /> Produto
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">{fmtNum(totalPallets)} paletes</span>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => release("faturada")}>Faturada</Button>
          <Button variant="outline" size="sm" onClick={() => release("em_corte")}>Em corte</Button>
          <Button variant="outline" size="sm" onClick={() => release("impressa_ag_cte")}>Impressa ag. CT-e</Button>
          <Button size="sm" onClick={() => release("finalizada")}>Finalizada</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
