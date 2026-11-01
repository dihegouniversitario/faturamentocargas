import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogsQuery, validateProgramming, importProgramming } from "@/lib/catalogs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmailDialog } from "@/components/loads/EmailDialog";
import { parseLoads, loadLabel } from "@/lib/parse-loads";
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
  const { data: catalogs, error: catalogError } = useQuery(catalogsQuery);
  const errors = catalogs ? validateProgramming(parsed.loads, catalogs) : [];
  const canImport = me?.roles.includes("remessa");

  async function confirm() {
    if (!me?.unit_id) return;
    setBusy(true);
    try {
      const count = await importProgramming(parsed.loads);
      toast.success(`${count} carga(s) importada(s)/atualizada(s).`);
      setImported(parsed.loads.map((l) => ({ raw_text: l.raw_lines.join("\n"), plate: l.plate, dt: l.dt, carrier: l.carrier })));
      setText("");
      qc.invalidateQueries({ queryKey: ["loads"] });
    } catch (e) {
      toast.error((e as { message: string }).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canImport) return <div className="p-6 text-sm text-muted-foreground">Apenas a Remessa importa cargas.</div>;

  return (
    <div className="grid h-full grid-cols-[1fr_380px] gap-4 p-4">
      <section className="flex min-h-0 flex-col gap-2">
        <Input type="file" accept=".xlsx" aria-label="Planilha XLSX" onChange={async (e) => {
          const file = e.target.files?.[0]; if (!file) return;
          try {
            const { default: readXlsxFile } = await import('read-excel-file/browser');
            const rows = await readXlsxFile(file);
            setText(rows.map((row) => row.map((cell) => cell instanceof Date ? `${String(cell.getUTCDate()).padStart(2,'0')}/${String(cell.getUTCMonth()+1).padStart(2,'0')}/${cell.getUTCFullYear()}` : String(cell ?? '')).join('\t')).join('\n'));
          } catch { toast.error('Não foi possível ler a planilha XLSX.'); }
        }} />
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
        {errors.map((err) => <p key={err} className="px-3 py-1 text-xs text-destructive">{err}</p>)}
        {catalogError && <p className="p-3 text-xs text-destructive">Não foi possível carregar os cadastros.</p>}
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
          <Button className="w-full" disabled={busy || !catalogs || !!catalogError || errors.length > 0 || parsed.rejected.length > 0 || parsed.loads.length === 0} onClick={confirm}>
            {busy ? "Importando…" : `Confirmar importação (${parsed.loads.length})`}
          </Button>
        </div>
      </aside>
      <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} loads={imported} to={me?.billing_email ?? null} />
    </div>
  );
}
