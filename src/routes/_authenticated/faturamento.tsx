import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/loads/StatusBadge";
import { itinerariesQuery, loadsQuery, useLoadsRealtime, useMe, type Me } from "@/lib/session";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  fmtDate,
  fmtNum,
  isLockedByOther,
  todayIso,
  totalPallets,
  type LoadItem,
  type LoadStatus,
  type LoadWithItems,
} from "@/lib/status";
import { loadLabel } from "@/lib/parse-loads";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/faturamento")({
  head: () => ({
    meta: [
      { title: "Faturamento — Cargas Coca" },
      { name: "description", content: "Fila de cargas para faturar." },
      { property: "og:title", content: "Faturamento — Cargas Coca" },
      { property: "og:description", content: "Fila de cargas para faturar." },
    ],
  }),
  component: BillingPage,
});

// Display order in the queue; loads with "saida" leave the queue and go to Histórico.
const ORDER: Record<LoadStatus, number> = { em_faturamento: 0, pendente: 1, erro: 2, faturada: 3, saida: 4 };
const DOT: Record<LoadStatus, string> = {
  pendente: "bg-st-pendente-fg",
  em_faturamento: "bg-st-faturamento-fg",
  faturada: "bg-st-faturada-fg",
  erro: "bg-st-erro-fg",
  saida: "bg-st-saida-fg",
};

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function BillingPage() {
  const { data: me } = useMe();
  const [date, setDate] = useState(todayIso());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = useNow();
  useLoadsRealtime();
  const { data: loads = [] } = useQuery(loadsQuery(date));
  const qc = useQueryClient();
  const canBill = me?.roles.includes("faturamento");

  if (!me || !canBill) return <div className="p-6 text-sm text-muted-foreground">Apenas o Faturamento acessa esta tela.</div>;

  const queue = loads
    .filter((l) => l.status !== "saida")
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.created_at.localeCompare(b.created_at));
  const selected = loads.find((l) => l.id === selectedId) ?? null;

  async function openLoad(l: LoadWithItems) {
    setSelectedId(l.id);
    if (isLockedByOther(l, me!.id, now)) return;
    if (l.status === "saida") return;
    const { error } = await supabase
      .from("loads")
      .update({
        locked_by: me!.id,
        locked_by_name: me!.full_name || me!.email,
        locked_at: new Date().toISOString(),
        ...(l.status === "pendente" ? { status: "em_faturamento" as const } : {}),
      })
      .eq("id", l.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["loads"] });
  }

  return (
    <div className="grid h-full grid-cols-[360px_1fr]">
      <aside className="flex min-h-0 flex-col border-r bg-panel">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <h1 className="text-sm font-semibold">Fila</h1>
          <span className="text-[11px] text-muted-foreground">{queue.length}</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-auto h-7 w-36 text-xs" />
        </div>
        <div className="flex gap-3 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
          {(["pendente", "em_faturamento", "faturada", "erro"] as LoadStatus[]).map((st) => (
            <span key={st} className="flex items-center gap-1">
              <span className={cn("size-2 rounded-full", DOT[st])} /> {STATUS_LABEL[st]}
            </span>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-2">
          {queue.map((l) => {
            const locked = isLockedByOther(l, me.id, now);
            return (
              <button
                key={l.id}
                onClick={() => openLoad(l)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]",
                  STATUS_CLASS[l.status],
                  selectedId === l.id && "ring-2 ring-primary",
                  locked && "opacity-50",
                )}
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", DOT[l.status])} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{loadLabel(l.plate, l.dt, l.carrier)}</span>
                  <span className="flex justify-between gap-2 opacity-75">
                    <span className="truncate">{locked ? `Em atendimento por ${l.locked_by_name}` : l.dest_name}</span>
                    <span className="tabular shrink-0">{fmtNum(totalPallets(l.load_items))} plt</span>
                  </span>
                </span>
              </button>
            );
          })}
          {queue.length === 0 && <p className="p-4 text-xs text-muted-foreground">Nenhuma carga na fila em {fmtDate(date)}.</p>}
        </div>
      </aside>
      <section className="min-h-0 overflow-auto p-4">
        {selected ? (
          <LoadCard
            key={selected.id}
            load={selected}
            me={me}
            readOnly={isLockedByOther(selected, me.id, now) || selected.status === "saida"}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Selecione uma carga na fila.
          </div>
        )}
      </section>
    </div>
  );
}

/** Debounced autosave for a single text field. */
function useAutosave(initial: string, save: (v: string) => Promise<void>, delay = 600) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setState("saving");
    const t = setTimeout(async () => {
      await saveRef.current(value);
      setState("saved");
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return { value, setValue, state };
}

function LoadCard({ load, me, readOnly, onClose }: { load: LoadWithItems; me: Me; readOnly: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const patch = async (p: Record<string, unknown>) => {
    const { error } = await supabase
      .from("loads")
      .update({ ...p, ...(load.locked_by === me.id ? { locked_at: new Date().toISOString() } : {}) })
      .eq("id", load.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["loads"] });
  };

  const notes = useAutosave(load.notes, (v) => patch({ notes: v }));
  const { data: itins } = useQuery(itinerariesQuery);
  const itinerary = itins?.get(load.dest_center.trim()) ?? "";
  const prodOrder = useAutosave(load.product_order, (v) => patch({ product_order: v.trim() }));
  const palOrder = useAutosave(load.pallet_order, (v) => patch({ pallet_order: v.trim() }));

  async function setStatus(status: LoadStatus) {
    await patch({ status });
    toast.success(`Carga marcada como ${STATUS_LABEL[status]}.`);
  }

  async function finish() {
    await patch({ locked_by: null, locked_by_name: null, locked_at: null });
    onClose();
  }

  return (
    <div className="mx-auto max-w-4xl rounded-md border bg-panel text-xs">
      {readOnly && load.status !== "saida" && (
        <div className="border-b bg-st-faturamento px-3 py-1.5 text-st-faturamento-fg">
          Em atendimento por <strong>{load.locked_by_name}</strong>. Somente leitura.
        </div>
      )}
      {/* Parte superior */}
      <div className="grid grid-cols-[1fr_260px] gap-3 border-b p-3">
        <label className="space-y-1">
          <span className="text-muted-foreground">Observação da carga</span>
          <Textarea
            value={notes.value}
            disabled={readOnly}
            onChange={(e) => notes.setValue(e.target.value)}
            className="h-14 resize-none text-xs"
          />
        </label>
        <div className="space-y-1">
          <span className="text-muted-foreground">Itinerário</span>
          <div className="flex h-14 items-center justify-end rounded-md border bg-muted/50 px-3 text-lg font-semibold">
            {itinerary || <span className="text-xs font-normal text-muted-foreground">Sem itinerário cadastrado</span>}
          </div>
        </div>
      </div>
      {/* Identificação */}
      <div className="flex items-end justify-between border-b bg-muted/50 px-3 py-2">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold tracking-wide">{load.plate}</span>
            <span className="text-sm text-muted-foreground">{load.carrier}</span>
            <StatusBadge status={load.status} />
          </div>
          <div className="mt-0.5 text-muted-foreground">
            {load.dest_center} · {load.dest_name} · Carga {load.load_number} · Previsão {fmtDate(load.load_date)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-muted-foreground">DT</div>
          <div className="text-2xl font-bold tabular">{load.dt}</div>
        </div>
      </div>
      {/* Produtos */}
      <table className="w-full">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 font-medium">Código SAP</th>
            <th className="font-medium">Produto</th>
            <th className="w-24 text-right font-medium">Pallets</th>
            <th className="w-24 text-right font-medium">Caixas</th>
            <th className="w-40 px-3 font-medium">ID do pallet</th>
          </tr>
        </thead>
        <tbody>
          {load.load_items.map((i) => (
            <ItemRow key={i.id} item={i} readOnly={readOnly} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/50">
            <td colSpan={2} className="px-3 py-1.5 font-semibold">Total de pallets</td>
            <td className="text-right text-base font-bold tabular">{fmtNum(totalPallets(load.load_items))}</td>
            <td className="text-right tabular text-muted-foreground">
              {fmtNum(load.load_items.reduce((s, i) => s + Number(i.boxes), 0))}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
      {/* Ordens */}
      <div className="grid grid-cols-2 gap-3 border-t p-3">
        <OrderField label="Ordem de produtos" field={prodOrder} readOnly={readOnly} />
        <OrderField label="Ordem de pallets (paletes de madeira)" field={palOrder} readOnly={readOnly} />
      </div>
      {!readOnly && (
        <div className="flex justify-end gap-2 border-t px-3 py-2">
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setStatus("erro")}>
            Marcar com erro
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStatus("saida")}>
            Marcar com saída
          </Button>
          <Button size="sm" onClick={finish}>
            Finalizar
          </Button>
        </div>
      )}
    </div>
  );
}

function OrderField({
  label,
  field,
  readOnly,
}: {
  label: string;
  field: ReturnType<typeof useAutosave>;
  readOnly: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="flex justify-between text-muted-foreground">
        {label}
        <span>{field.state === "saving" ? "salvando…" : field.state === "saved" ? "salvo" : ""}</span>
      </span>
      <Input
        value={field.value}
        disabled={readOnly}
        onChange={(e) => field.setValue(e.target.value)}
        className="h-9 font-mono text-sm"
        placeholder="Cole o número da nota"
      />
    </label>
  );
}

function ItemRow({ item, readOnly }: { item: LoadItem; readOnly: boolean }) {
  const bpp = Number(item.boxes_per_pallet);
  const [pallets, setPallets] = useState(String(item.pallets));
  const [palletId, setPalletId] = useState(item.pallet_id);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      const p = Number(pallets.replace(",", "."));
      if (isNaN(p)) return;
      const { error } = await supabase
        .from("load_items")
        .update({ pallets: p, boxes: bpp > 0 ? Math.round(p * bpp) : item.boxes, pallet_id: palletId })
        .eq("id", item.id);
      if (error) toast.error(error.message);
    }, 600);
    return () => clearTimeout(t);
  }, [pallets, palletId]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = Number(pallets.replace(",", "."));
  const boxes = bpp > 0 && !isNaN(p) ? Math.round(p * bpp) : Number(item.boxes);

  return (
    <tr className="border-b">
      <td className="px-3 py-1 tabular">{item.sap_code}</td>
      <td>{item.description}</td>
      <td className="text-right">
        <Input
          value={pallets}
          disabled={readOnly}
          onChange={(e) => setPallets(e.target.value)}
          className="ml-auto h-7 w-20 text-right tabular"
        />
      </td>
      <td className="text-right tabular">{fmtNum(boxes)}</td>
      <td className="px-3">
        <Input value={palletId} disabled={readOnly} onChange={(e) => setPalletId(e.target.value)} className="h-7" />
      </td>
    </tr>
  );
}
