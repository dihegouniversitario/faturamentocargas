import { useMemo } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildFormalizationEmail } from "@/lib/parse-loads";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loads: { raw_text: string; plate: string; dt: string; carrier: string }[];
  to: string | null;
}

export function EmailDialog({ open, onOpenChange, loads, to }: Props) {
  const { subject, body } = useMemo(() => buildFormalizationEmail(loads), [loads]);
  const mailto = `mailto:${encodeURIComponent(to ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">E-mail de formalização</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-xs">
          <div>
            <span className="text-muted-foreground">Para: </span>
            {to || <em className="text-muted-foreground">e-mail do Faturamento não cadastrado na unidade</em>}
          </div>
          <div>
            <span className="text-muted-foreground">Assunto: </span>
            {subject}
          </div>
          <Textarea readOnly value={body} className="h-64 font-mono text-xs" />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(body);
              toast.success("Texto copiado.");
            }}
          >
            Copiar texto
          </Button>
          <Button size="sm" asChild>
            <a href={mailto}>Abrir no Outlook</a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
