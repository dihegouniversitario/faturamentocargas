import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Copy, Pencil, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogsQuery, calculateBoxes, type Product } from "@/lib/catalogs";
import { fmtNum } from "@/lib/status";

const PALLET_CODE: Record<string, string> = { VENDA: "118571", EMPRESTIMO: "197604" };

/** Sufixo fixo da placa, exatamente como vai para o SAP: "<placa>  ED" (dois espaços). */
const PLATE_SUFFIX = "  ED";

/** "gee9b77" -> "GEE9B77  ED" | "gee9b77 e" -> "GEE9B77  E" | "" -> "" */
function maskPlate(raw: string): string {
  const base = raw
    .replace(/\s*E\s*D\s*$/i, "") // remove o sufixo antes de reaplicar (evita "EDED")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  return base ? `${base}${PLATE_SUFFIX}` : "";
}

type Item = { key: string; product_id: string; pallets: number; boxes: number; boxes_per_pallet: number };

async function copyValue(value: string, label: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => copyValue(value, label)}
      title={`Copiar ${label}`}
      className="ml-1 align-middle text-muted-foreground transition-colors hover:text-foreground"
    >
      <Copy className="inline size-3" />
    </button>
  );
}

function FieldLabel({ children, copyValue: cv }: { children: React.ReactNode; copyValue?: string }) {
  return (
    <Label className="text-[11px] text-muted-foreground">
      {children}
      {cv !== undefined && <CopyButton value={cv} label={String(children)} />}
    </Label>
  );
}

function ReadField({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">
        {label}
        {copy && value && <CopyButton value={value} label={label} />}
      </p>
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
  const [notes, setNotes] = useState(load.notes ?? "");
  const [editingDt, setEditingDt] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
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

  const { data: events = [] } = useQuery({
    queryKey: ["load_events", load.id],
    enabled: showLogs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("load_events")
        .select("id, from_status, to_status, user_name, created_at")
        .eq("load_id", load.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Dados do destino: vêm do join em loadsQuery (destinations).
  // Fallback nas colunas da própria carga, para as linhas antigas.
  const d = load.destinations ?? {};
  const carrierName = catalogs?.carriers.find((c) => c.id === carrierId)?.name ?? load.carrier ?? "";
  const palletType = d.pallet_type ?? load.pallet_type ?? "VENDA";
  const palletCode = d.pallet_code || PALLET_CODE[palletType] || PALLET_CODE.VENDA;
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
    if (!items.length) { toast.error("Inclua ao menos um produto"); return; }
    if (items.some((i) => !i.product_id)) { toast.error("Selecione todos os produtos"); return; }
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
          notes,
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
    if (error) { toast.error(error.message); return; }
    toast.success("Status atualizado");
    await qc.invalidateQueries({ queryKey: ["loads"] });
    onClose();
  }

  /** Fecha liberando a trava. */
  async function close() {
    await supabase.rpc("unlock_load", { load_id: load.id });
    await qc.invalidateQueries({ queryKey: ["loads"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Carga {load.load_number} · {d.name ?? load.dest_name ?? load.dest_center}
          </DialogTitle>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="font-mono text-sm text-muted-foreground">
              IDc: <span className="text-xl font-semibold text-foreground">{load.load_number}</span>
            </span>

            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditingDt((v) => !v)}
                title="Editar DT"
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
              {editingDt ? (
                <Input
                  autoFocus
                  value={dt}
                  onChange={(e) => setDt(e.target.value)}
                  onBlur={() => setEditingDt(false)}
                  onKeyDown={(e) => e.key === "Enter" && setEditingDt(false)}
                  inputMode="numeric"
                  className="h-8 w-40 font-mono text-lg tabular-nums"
                />
              ) : (
                <span className="font-mono text-xl font-semibold tabular-nums">{dt || "—"}</span>
              )}
              <CopyButton value={dt} label="DT" />
            </span>

            <span className="text-xs text-muted-foreground">{load.status}</span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-8"
              onClick={() => setShowLogs((v) => !v)}
            >
              <History className="mr-1 size-3.5" />
              Logs
            </Button>
          </div>
        </DialogHeader>

        {showLogs && (
          <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
            {events.length === 0 ? (
              <p className="py-2 text-center text-muted-foreground">Sem registros.</p>
            ) : (
              events.map((e: any) => (
                <div key={e.id} className="flex items-center gap-2 border-b py-1 last:border-0">
                  <span className="tabular-nums text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("pt-BR")}
                  </span>
                  <span className="font-medium">{e.user_name || "sistema"}</span>
                  <span className="text-muted-foreground">
                    {e.from_status ? `${e.from_status} → ${e.to_status}` : e.to_status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-4">
          <ReadField label="Centro" value={load.dest_center ?? d.center ?? ""} />
          <ReadField label="CNPJ" value={d.cnpj ?? ""} copy />
          <ReadField label="Cliente SAP" value={d.sap_client_code ?? ""} copy />
          <ReadField label="Itinerário" value={d.itinerary ?? load.itinerary ?? ""} copy />
          <ReadField label="Tipo palete" value={palletType} />
          <ReadField label="Código palete" value={palletCode} copy />
        </div>

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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Máscara da placa: "<placa>  ED" */}
          <div>
            <FieldLabel copyValue={plate}>Placa</FieldLabel>
            <Input
              value={plate}
              onChange={(e) => setPlate(maskPlate(e.target.value))}
              placeholder="Ex.: GEE9B77  ED"
              className="h-9 font-mono"
            />
          </div>
          <div className="sm:col-span-3">
            <FieldLabel copyValue={carrierName}>Transportadora</FieldLabel>
            <Select value={carrierId} onValueChange={setCarrierId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(catalogs?.carriers ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground">Observações</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="min-h-0 text-sm"
            placeholder="—"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[11px] text-muted-foreground">Produtos</Label>
          {items.map((it, idx) => {
            const p = catalogs?.products.find((x) => x.id === it.product_id);
            const boxesValue = fmtNum(calculateBoxes(it.pallets, it.boxes_per_pallet));
            return (
              <div key={it.key} className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <Label className="text-[11px] text-muted-foreground">Produto</Label>
                  <Select value={it.product_id} onValueChange={(v) => pickProduct(idx, v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {(catalogs?.products ?? []).filter((x) => x.active).map((x) => (
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

                <div className="w-28">
                  <Label className="text-[11px] text-muted-foreground">
                    Caixas
                    <CopyButton value={boxesValue} label="Caixas" />
                  </Label>
                  <Input value={boxesValue} readOnly className="h-9 bg-muted" />
                </div>

                <div className="w-24">
                  <Label className="text-[11px] font-semibold text-destructive">FEMSA</Label>
                  {p ? (
                    <button
                      type="button"
                      onClick={() => copyValue(p.femsa_code, "Código FEMSA")}
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
          <Button variant="outline" size="sm" onClick={() => release("impressa_ag_cte")}>Impressa Ag. CT-e</Button>
          <Button size="sm" onClick={() => release("finalizada")}>Finalizada</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
