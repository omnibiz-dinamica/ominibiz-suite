import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importContacts } from "@/lib/messages/api";
import { parseContactsCsv, type CsvImportReport, type CsvIssue } from "@/lib/messages/csv";

const MAX_BYTES = 2 * 1024 * 1024;

export function ImportContactsDialog({
  companyId,
  existingPhones,
  onClose,
  onImported,
}: {
  companyId: string;
  existingPhones: string[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [report, setReport] = useState<CsvImportReport | null>(null);
  const [fileName, setFileName] = useState("");
  const [done, setDone] = useState<number | null>(null);

  const onFile = async (file: File | undefined) => {
    setDone(null);
    setReport(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Ficheiro demasiado grande (máximo 2 MB).");
      return;
    }
    setFileName(file.name);
    setReport(parseContactsCsv(await file.text(), existingPhones));
  };

  const run = useMutation({
    mutationFn: () => importContacts(companyId, report?.valid ?? []),
    onSuccess: (n) => {
      setDone(n);
      toast.success(`${n} contato(s) importado(s).`);
      onImported();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar contatos (CSV)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Colunas: <strong>nome</strong>, <strong>telefone</strong>, <strong>e-mail</strong>{" "}
            (separadas por vírgula ou ponto e vírgula). O telefone deve ter o código do país, ex.:
            +351912345678.
          </p>
          <div className="space-y-1">
            <Label htmlFor="msg-csv">Ficheiro</Label>
            <Input
              id="msg-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>
          {report ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="font-medium">{fileName}</p>
              <p>
                Prontos para importar: <strong>{report.valid.length}</strong>
              </p>
              <p>
                Duplicados (ignorados): <strong>{report.duplicates.length}</strong>
              </p>
              <p>
                Com erro de formato (ignorados): <strong>{report.errors.length}</strong>
              </p>
              <IssueList title="Duplicados" items={report.duplicates} />
              <IssueList title="Erros" items={report.errors} />
            </div>
          ) : null}
          {done !== null ? (
            <p className="text-emerald-700 dark:text-emerald-400">
              Importação concluída: {done} contato(s) gravado(s).
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {done !== null ? "Fechar" : "Cancelar"}
          </Button>
          {done === null ? (
            <Button
              disabled={!report || report.valid.length === 0 || run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? "Importando..." : `Importar ${report?.valid.length ?? 0}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueList({ title, items }: { title: string; items: CsvIssue[] }) {
  if (!items.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium">
        {title} ({items.length})
      </summary>
      <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
        {items.map((i) => (
          <li key={`${i.line}-${i.value}`}>
            Linha {i.line}: <span className="font-mono">{i.value || "—"}</span> — {i.reason}
          </li>
        ))}
      </ul>
    </details>
  );
}
