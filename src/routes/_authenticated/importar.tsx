import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmailDialog } from "@/components/loads/EmailDialog";
import { parseLoads, loadLabel, type ParsedLoad } from "@/lib/parse-loads";
import { useMe } from "@/lib/session";
import { fmtNum } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({
    meta: [
      { title: "Importar cargas — Cargas Coca" },
      { name: "description", content: "Cole as linhas da planilha para enviar cargas ao Faturamento." },
      { property: "og:title", content: "Importar cargas — Cargas Coca" },
      { property: "og:description", content: "Cole as linhas da planilha para enviar cargas ao Faturamento." },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<{ raw_text: string; plate: string; dt: string; carrier: string }[]>([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const parsed = useMemo(() => parseLoads(text), [text]);
  const canImport = me?.roles.includes("remessa");

  async function confirm() {
    if (!me?.unit_id) return;
    setBusy(true);
    try {
      const dts = parsed.loads.map((l) => l.dt);
      const { data: existing } = await supabase.from("loads").select("dt").in("dt", dts);
      const dup = new Set((existing ?? []).map((e) => e.dt));
      const toInsert = parsed.loads.filter((l) => !dup.has(l.dt));
      const ok: ParsedLoad[] = [];
      for (const l of toInsert) {
        const raw_text = l.raw_lines.join("\n");
        const { data: row, error } = await supabase
          .from("loads")
          .insert({
            unit_id: me.unit_id,
            dt: l.dt,
            load_number: l.load_number,
            load_date: l.load_date,
            origin_center: l.origin_center,
            dest_center: l.dest_center,
            dest_name: l.dest_name,
            carrier: l.carrier,
            plate: l.plate,
            raw_text,
          })
          .select("id")
          .single();
        if (error) {
          if (error.code === "23505") dup.add(l.dt);
          else toast.error(`DT ${l.dt}: ${error.message}`);
          continue;
        }
        const { error: e2 } = await supabase.from("load_items").insert(
          l.items.map((it, idx) => ({
            load_id: row.id,
            position: idx,
            sap_code: it.sap_code,
            description: it.description,
            boxes: it.boxes,
            pallets: it.pallets,
            boxes_per_pallet: it.pallets > 0 ? it.boxes / it.pallets : 0,
          })),
        );
        if (e2) toast.error(`Produtos do DT ${l.dt}: ${e2.message}`);
        ok.push(l);
      }
      if (ok.length) toast.success(`${ok.length} carga(s) importada(s) com sucesso.`);
      if (dup.size) toast.warning(`DT já existente, não importado: ${[...dup].join(", ")}`);
      setImported(ok.map((l) => ({ raw_text: l.raw_lines.join("\n"), plate: l.plate, dt: l.dt, carrier: l.carrier })));
      setText("");
      qc.invalidateQueries({ queryKey: ["loads"] });
    } finally {
      setBusy(false);
    }
  }

  if (!canImport) return <div className="p-6 text-sm text-muted-foreground">Apenas a Remessa importa cargas.</div>;

  return (
    <div className="grid h-full grid-cols-[1fr_380px] gap-4 p-4">
      <section className="flex min-h-0 flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-sm font-semibold">Importar cargas</h1>
          <span className="text-xs text-muted-foreground">Cole as linhas da planilha (sem cabeçalho)</span>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="26/10/2026	14	B0AC	BFDY	Antonio Carlos	92527	CRYSTAL 500ML SEM GÁS 12UN	4.368	26	Dinon	JCY5B51	106875705"
          className="min-h-0 flex-1 resize-none whitespace-pre bg-panel font-mono text-xs"
          spellCheck={false}
        />
        {imported.length > 0 && (
          <div className="flex items-center justify-between rounded-sm border bg-panel px-3 py-2 text-xs">
            <span>
              Última importação: <strong>{imported.length}</strong> carga(s) enviada(s) ao Faturamento.
            </span>
            <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
              Gerar e-mail de formalização
            </Button>
          </div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col rounded-md border bg-panel">
        <div className="border-b px-3 py-2 text-xs">
          <strong>{parsed.loads.length}</strong> carga(s) reconhecida(s)
          {parsed.rejected.length > 0 && (
            <span className="text-destructive"> · {parsed.rejected.length} linha(s) não entendida(s)</span>
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-auto text-xs">
          {parsed.loads.map((l) => (
            <li key={l.dt} className="border-b px-3 py-1.5">
              <div className="font-medium">{loadLabel(l.plate, l.dt, l.carrier)}</div>
              <div className="text-muted-foreground">
                {l.dest_name} · {l.items.length} produto(s) · {fmtNum(l.items.reduce((s, i) => s + i.pallets, 0))} pallets
              </div>
            </li>
          ))}
          {parsed.rejected.length > 0 && (
            <li className="px-3 py-2">
              <div className="mb-1 font-medium text-destructive">Linhas não entendidas</div>
              {parsed.rejected.map((r, i) => (
                <pre key={i} className="overflow-x-auto whitespace-pre text-[11px] text-muted-foreground">
                  {r}
                </pre>
              ))}
            </li>
          )}
        </ul>
        <div className="border-t p-3">
          <Button className="w-full" disabled={busy || parsed.loads.length === 0} onClick={confirm}>
            {busy ? "Importando…" : `Confirmar importação (${parsed.loads.length})`}
          </Button>
        </div>
      </aside>
      <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} loads={imported} to={me?.billing_email ?? null} />
    </div>
  );
}
