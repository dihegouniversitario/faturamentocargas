import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { EmailDialog } from "./EmailDialog";
import { fmtDate, fmtNum, totalPallets, type LoadWithItems } from "@/lib/status";
import { loadLabel } from "@/lib/parse-loads";

export function LoadDetailsDialog({
  load,
  onClose,
  billingEmail,
}: {
  load: LoadWithItems | null;
  onClose: () => void;
  billingEmail: string | null;
}) {
  const [email, setEmail] = useState(false);
  const { data: history } = useQuery({
    queryKey: ["history", load?.id, load?.updated_at],
    enabled: !!load,
    queryFn: async () => {
      if (!load) return [];
      const { data } = await supabase
        .from("load_history")
        .select("*")
        .eq("load_id", load.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  return (
    <Dialog open={!!load} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
        {load && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-base">
                {loadLabel(load.plate, load.dt, load.carrier)} <StatusBadge status={load.status} />
              </DialogTitle>
            </DialogHeader>
            <dl className="grid grid-cols-4 gap-x-4 gap-y-1 text-xs">
              <Field k="DT" v={load.dt} />
              <Field k="Carga" v={load.load_number} />
              <Field k="Importada em" v={fmtDate(load.import_date)} />
              <Field k="Previsão" v={fmtDate(load.load_date)} />
              <Field k="Destino" v={`${load.dest_center} · ${load.dest_name}`} />
              <Field k="Origem" v={load.origin_center} />
              <Field k="Ordem de produtos" v={load.product_order || "—"} />
              <Field k="Ordem de pallets" v={load.pallet_order || "—"} />
              <Field k="Itinerário" v={load.itinerary || "—"} />
            </dl>
            {load.notes && <p className="rounded-sm bg-muted px-2 py-1 text-xs">Obs.: {load.notes}</p>}
            <table className="w-full text-xs">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Código</th>
                  <th className="font-medium">Produto</th>
                  <th className="text-right font-medium">Pallets</th>
                  <th className="text-right font-medium">Caixas</th>
                  <th className="pl-3 font-medium">ID pallet</th>
                </tr>
              </thead>
              <tbody>
                {load.load_items.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-1 tabular">{i.sap_code}</td>
                    <td>{i.description}</td>
                    <td className="text-right tabular">{fmtNum(i.pallets)}</td>
                    <td className="text-right tabular">{fmtNum(i.boxes)}</td>
                    <td className="pl-3">{i.pallet_id || "—"}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={2} className="py-1">Total</td>
                  <td className="text-right tabular">{fmtNum(totalPallets(load.load_items))}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
            <div>
              <h3 className="mb-1 text-xs font-semibold">Histórico</h3>
              <ul className="max-h-40 space-y-0.5 overflow-auto text-xs">
                {(history ?? []).map((h) => (
                  <li key={h.id} className="flex gap-2">
                    <span className="tabular text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <span className="font-medium">{h.user_name}</span>
                    <span>{h.action}</span>
                    <span className="text-muted-foreground">{h.details}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setEmail(true)}>
                Gerar e-mail de formalização
              </Button>
            </div>
            <EmailDialog open={email} onOpenChange={setEmail} loads={[load]} to={billingEmail} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
