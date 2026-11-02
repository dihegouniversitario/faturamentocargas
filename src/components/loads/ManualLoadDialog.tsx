import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { catalogsQuery, importProgramming, calculateBoxes } from "@/lib/catalogs";
import { fmtNum, todayIso, type LoadWithItems } from "@/lib/status";
import type { ParsedLoad } from "@/lib/parse-loads";

export function ManualLoadDialog({ load, onClose }: { load?: LoadWithItems; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: catalogs } = useQuery(catalogsQuery);

  const [form, setForm] = useState({
    load_date: load?.load_date ?? todayIso(),
    load_number: load?.load_number ?? "",
    dt: load?.dt ?? "",
    plate: load?.plate ?? "",
    destination_id: load?.destination_id ?? "",
    carrier_id: load?.carrier_id ?? "",
    notes: load?.notes ?? "",
  });

  const [items, setItems] = useState(
    load?.load_items.map((i) => ({
      id: i.product_id ?? "",
      pallets: String(i.pallets),
      bpp: Number(i.boxes_per_pallet ?? 0),
    })) ?? [{ id: "", pallets: "0", bpp: 0 }],
  );
  const [busy, setBusy] = useState(false);

  /** Ao trocar o produto, herda o boxes_per_pallet do cadastro. */
  function pickProduct(n: number, productId: string) {
    const p = catalogs?.products.find((x) => x.id === productId);
    setItems((prev) =>
      prev.map((it, i) => (i === n ? { ...it, id: productId, bpp: Number(p?.boxes_per_pallet ?? 0) } : it)),
    );
  }

  const totalBoxes = items.reduce((s, i) => s + calculateBoxes(Number(i.pallets) || 0, i.bpp), 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const d = catalogs?.destinations.find((x) => x.id === form.destination_id);
    const c = catalogs?.carriers.find((x) => x.id === form.carrier_id);
    if (!d || !c || items.some((i) => !i.id || !Number.isFinite(Number(i.pallets)) || Number(i.pallets) < 0)) {
      toast.error("Selecione destino, transportadora e produtos.");
      return;
    }

    const parsed: ParsedLoad & { notes: string } = {
      ...form,
      load_date_br: form.load_date.split("-").reverse().join("/"),
      origin_center: load?.origin_center ?? "",
      // O CENTRO vai em dest_center — é o que a planilha da Remessa usa e o que
      // o import_programming casa. A sigla é só reserva.
      dest_center: d.center || d.sigla,
      dest_name: d.name,
      carrier: c.name,
      raw_lines: [],
      notes: form.notes,
      items: items.map((i) => {
        const p = catalogs?.products.find((x) => x.id === i.id);
        return {
          sap_code: p?.ijui_code ?? "",
          description: p?.description ?? "",
          pallets: Number(i.pallets),
          boxes: calculateBoxes(Number(i.pallets), Number(p?.boxes_per_pallet ?? i.bpp)),
        };
      }),
    };

    if (parsed.items.some((i) => !i.sap_code)) {
      toast.error("O produto precisa de código Ijuí para a programação.");
      return;
    }

    setBusy(true);
    try {
      await importProgramming([parsed]);
      await qc.invalidateQueries({ queryKey: ["loads"] });
      toast.success("Carga salva.");
      onClose();
    } catch (err) {
      toast.error((err as { message: string }).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{load ? "Editar programação" : "Nova carga"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(["load_date", "load_number", "dt", "plate"] as const).map((k) => (
              <label key={k} className="text-xs">
                {{ load_date: "Previsão", load_number: "Nº da carga", dt: "DT", plate: "Placa" }[k]}
                <Input
                  required
                  readOnly={k === "dt" && !!load}
                  type={k === "load_date" ? "date" : "text"}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>

          {(["destination_id", "carrier_id"] as const).map((k) => (
            <label key={k} className="block text-xs">
              {k === "destination_id" ? "Destino" : "Transportadora"}
              <select
                required
                className="h-9 w-full rounded-md border bg-panel"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              >
                <option value="">Selecione</option>
                {(k === "destination_id" ? catalogs?.destinations : catalogs?.carriers)?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {k === "destination_id" ? `${r.sigla} — ${r.name}` : r.name}
                  </option>
                ))}
              </select>
            </label>
          ))}

          {items.map((i, n) => {
            const p = catalogs?.products.find((x) => x.id === i.id);
            const bpp = Number(p?.boxes_per_pallet ?? i.bpp);
            return (
              <div key={n} className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-xs">
                  Produto
                  <select
                    aria-label={`Produto ${n + 1}`}
                    className="h-9 w-full rounded-md border bg-panel"
                    value={i.id}
                    onChange={(e) => pickProduct(n, e.target.value)}
                  >
                    <option value="">Produto</option>
                    {catalogs?.products
                      .filter((x) => x.active && x.ijui_code)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.short_name} — {x.femsa_code}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="w-24 text-xs">
                  Paletes
                  <Input
                    aria-label={`Paletes ${n + 1}`}
                    type="number"
                    min="0"
                    step="any"
                    value={i.pallets}
                    onChange={(e) =>
                      setItems((prev) => prev.map((it, idx) => (idx === n ? { ...it, pallets: e.target.value } : it)))
                    }
                  />
                </label>

                {/* Caixas calculadas automaticamente — só informativo */}
                <label className="w-24 text-xs">
                  Caixas
                  <Input
                    readOnly
                    value={fmtNum(calculateBoxes(Number(i.pallets) || 0, bpp))}
                    className="bg-muted"
                  />
                </label>

                <Button
                  type="button"
                  variant="outline"
                  disabled={items.length === 1}
                  onClick={() => setItems(items.filter((_, idx) => idx !== n))}
                >
                  Remover
                </Button>
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems([...items, { id: "", pallets: "0", bpp: 0 }])}
            >
              Adicionar produto
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">{fmtNum(totalBoxes)} caixas</span>
          </div>

          <label className="block text-xs">
            Observações
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>

          <Button disabled={busy} className="w-full">
            {busy ? "Salvando…" : "Salvar carga"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
