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
import { cn } from "@/lib/utils";

const PALLET_CODE: Record<string, string> = { VENDA: "118571", EMPRESTIMO: "197604" };

type Item = { key: string; product_id: string; pallets: number; boxes: number; boxes_per_pallet: number };

/** Valor grande, monoespaçado, que copia no clique — para levar ao SAP. */
function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
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
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <button
        type="button"
        onClick={copy}
        title="Clique para copiar"
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-md border bg-panel px-3 py-2 text-left",
          "font-mono text-lg font-semibold tabular-nums hover:bg-muted/60",
        )}
      >
        <span className="truncate">{value || "—"}</span>
        <Copy className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-sm">{value || "—"}</p>
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
  const [notes, setNotes] = useState(load.notes ?? "");
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

  const palletType = load.pallet_type ?? "VENDA";
  const palletCode = PALLET_CODE[palletType] ?? PALLET_CODE.VENDA;
  const totalPallets = items.reduce((s, i) => s + Number(i.pallets || 0), 0);
  const totalBoxes = items.reduce((s, i) => s + calculateBoxes(Number(i.pallets || 0), i.boxes_per_pallet), 0);

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

  /** Salva produtos + ordens + transporte via RPC (renova a reserva). */
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
      if (notes !== (load.notes ?? "")) {
        const { error: e2 } = await supabase.from("loads").update({ notes }).eq("id", load.id);
        if (e2) throw e2;
      }
      toast.success("Carga salva");
      await qc.invalidateQueries({ queryKey: ["loads"] });
      onClose();
    } catch (e) {
      toast.error((e as { message: string }).message);
    } finally {
      setSaving(false);
    }
  }

  /** Libera a carga para um novo status (chama release_load). */
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
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Carga {load.load_number} · {load.dest_name ?? load.dest_center}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            DT <span className="font-mono font-semibold text-foreground">{dt || "—"}</span> · {load.status}
          </p>
        </DialogHeader>

        {/* ---- Faixa 1: dados do destino (só leitura) ---- */}
        <div className="grid grid-cols-2 gap-4 rounded-md border bg-muted/30 p-4 sm:grid-cols-4">
          <ReadField label="Destino" value={load.dest_name} />
          <ReadField label="CNPJ" value={load.cnpj ?? ""} />
          <ReadField label="Cliente SAP" value={load.sap_client_code ?? ""} />
          <ReadField label="Itinerário" value={load.itinerary ?? ""} />
          <ReadField label="Tipo palete" value={palletType} />
          <ReadField label="Código palete" value={palletCode} />
          <ReadField label="Centro" value={load.dest_center ?? ""} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Observações</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8" placeholder="—" />
          </div>
        </div>

        {/* ---- Faixa 2: as duas ordens (ordem de preenchimento no SAP) ---- */}
        <div className="rounded-md border bg-panel p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ordens no SAP
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CopyField label="Ordem 1 (produto)" value={order1} hint="Ordem de produto" />
            <CopyField label="Ordem 2 (palete)" value={order2} hint="Ordem de palete" />
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Editar Ordem 1</Label>
              <Input
                value={order1}
                onChange={(e) => setOrder1(e.target.value)}
                className="font-mono text-lg tabular-nums"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Editar Ordem 2</Label>
              <Input
                value={order2}
                onChange={(e) => setOrder2(e.target.value)}
                className="font-mono text-lg tabular-nums"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        {/* ---- Faixa 3: transporte ---- */}
        <div className="rounded-md border bg-panel p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Transporte
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">DT</Label>
              <Input
                value={dt}
                onChange={(e) => setDt(e.target.value)}
                className="font-mono text-lg tabular-nums"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Placa</Label>
              <Input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                className="font-mono text-lg font-semibold tracking-wider"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Transportadora</Label>
              <Select value={carrierId} onValueChange={setCarrierId}>
                <SelectTrigger className="text-base">
                  <SelectValue placeholder="Selecione a transportadora" />
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
        </div>

        {/* ---- Faixa 4: produtos ---- */}
        <div className="rounded-md border bg-panel p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Produtos
          </p>
          <div className="space-y-2">
            {items.map((it, idx) => {
              const p = catalogs?.products.find((x) => x.id === it.product_id);
              return (
                <div key={it.key} className="grid items-end gap-3 border-b pb-3 sm:grid-cols-12">
                  <div className="space-y-1 sm:col-span-5">
                    <Label className="text-xs text-muted-foreground">Produto</Label>
                    <Select value={it.product_id} onValueChange={(v) => pickProduct(idx, v)}>
                      <SelectTrigger>
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

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Paletes</Label>
                    <Input
                      type="number"
                      min={0}
                      value={it.pallets}
                      onChange={(e) => pickPallets(idx, Number(e.target.value))}
                      className="font-mono text-lg tabular-nums"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Caixas</Label>
                    <Input value={fmtNum(calculateBoxes(it.pallets, it.boxes_per_pallet))} readOnly className="font-mono text-lg tabular-nums bg-muted" />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold text-destructive">FEMSA</Label>
                    {p ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(p.femsa_code);
                          toast.success("Código FEMSA copiado");
                        }}
                        className="flex w-full items-center justify-center rounded-md border-2 border-destructive bg-destructive/5 px-2 py-2 font-mono text-xl font-bold text-destructive hover:bg-destructive/10"
                      >
                        {p.femsa_code}
                      </button>
                    ) : (
                      <p className="py-2 text-lg">—</p>
                    )}
                  </div>

                  <div className="flex justify-end sm:col-span-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} title="Remover">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="mr-1 size-4" /> Produto
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{fmtNum(totalPallets)}</span> paletes ·{" "}
              <span className="font-mono font-semibold text-foreground">{fmtNum(totalBoxes)}</span> caixas
            </span>
          </div>
        </div>

        {/* ---- Ações ---- */}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          <Button variant="outline" onClick={() => release("faturada")}>Faturada</Button>
          <Button variant="outline" onClick={() => release("em_corte")}>Em corte</Button>
          <Button variant="outline" onClick={() => release("impressa_ag_cte")}>Impressa ag. CT-e</Button>
          <Button onClick={() => release("finalizada")}>Finalizada</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
