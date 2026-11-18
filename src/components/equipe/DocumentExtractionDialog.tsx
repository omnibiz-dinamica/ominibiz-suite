/**
 * SUP-304 (18/11/2026) — "Extrair documentos" na Equipe.
 * Filtros → pré-visualização (quantos funcionários e arquivos) → .zip com o
 * nome completo do funcionário em cada arquivo. Só leitura.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ATTACH_CATEGORIES } from "@/lib/employee-attachments";
import { safeName } from "@/lib/employee-export";
import {
  EMPTY_FILTERS,
  downloadExtraction,
  loadExtractionSources,
  selectForExtraction,
  type ExtractionFilters,
} from "@/lib/document-extraction";

const ALL = "__all__";

function distinct(values: (string | null | undefined)[]): string[] {
  const map = new Map<string, string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (!t) continue;
    const k = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (!map.has(k)) map.set(k, t);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "pt"));
}

export function DocumentExtractionDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  companyName?: string | null;
}) {
  const [f, setF] = useState<ExtractionFilters>(EMPTY_FILTERS);
  const [busy, setBusy] = useState<string | null>(null);
  const set = <K extends keyof ExtractionFilters>(k: K, v: ExtractionFilters[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  const sources = useQuery({
    queryKey: ["document-extraction-sources", companyId],
    enabled: open,
    staleTime: 60 * 1000,
    queryFn: () => loadExtractionSources(companyId),
  });
  const employers = useMemo(
    () => distinct((sources.data?.profiles ?? []).map((p) => p.job_title)),
    [sources.data],
  );
  const sectors = useMemo(
    () => distinct((sources.data?.profiles ?? []).map((p) => p.sector)),
    [sources.data],
  );
  const teams = useMemo(
    () =>
      [
        ...new Set(
          (sources.data?.profiles ?? []).map((p) => p.team_number).filter((n) => n != null),
        ),
      ].sort((a, b) => Number(a) - Number(b)),
    [sources.data],
  );
  const selection = useMemo(
    () => (sources.data ? selectForExtraction(sources.data, f) : null),
    [sources.data, f],
  );
  const peopleWithDocs = selection ? new Set(selection.entries.map((e) => e.employee)).size : 0;

  const run = async () => {
    if (!selection || selection.entries.length === 0) return;
    const cat =
      f.categories.length === 1
        ? (ATTACH_CATEGORIES.find((c) => c.v === f.categories[0])?.l ?? "documentos")
        : "documentos";
    const parts = [cat, f.employer, f.sector, new Date().toISOString().slice(0, 10)].filter(
      Boolean,
    );
    const name = `${safeName(companyName ?? "empresa")} - ${parts.map((p) => safeName(p)).join(" - ")}.zip`;
    setBusy("0");
    try {
      const r = await downloadExtraction(selection.entries, name, (d, t) => setBusy(`${d}/${t}`));
      if (r.failed)
        toast.error(`${r.files} arquivo(s) extraído(s); ${r.failed} não foi possível baixar.`);
      else toast.success(`${r.files} arquivo(s) extraído(s).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleCategory = (v: string, on: boolean) =>
    set("categories", on ? [...f.categories, v] : f.categories.filter((c) => c !== v));

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent size="md">
        <ModalHeader
          icon={FolderDown}
          title="Extrair documentos"
          description="Escolha o tipo de documento e os funcionários. Cada arquivo sai com o nome completo do funcionário."
        />
        <ModalBody className="space-y-4" data-testid="document-extraction">
          <div className="space-y-2">
            <Label>Tipo de documento</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ATTACH_CATEGORIES.map((c) => (
                <label key={c.v} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={f.categories.includes(c.v)}
                    onCheckedChange={(v) => toggleCategory(c.v, v === true)}
                  />
                  {c.l}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Nenhum marcado = todos os tipos.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Empresa (cargo / função)</Label>
              <Select
                value={f.employer || ALL}
                onValueChange={(v) => set("employer", v === ALL ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {employers.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <Select
                value={f.sector || ALL}
                onValueChange={(v) => set("sector", v === ALL ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {sectors.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Equipa</Label>
              <Select
                value={f.teamNumber || ALL}
                onValueChange={(v) => set("teamNumber", v === ALL ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={String(t)} value={String(t)}>
                      Equipa {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data de admissão</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={f.hireFrom}
                  onChange={(e) => set("hireFrom", e.target.value)}
                  aria-label="Admissão de"
                />
                <span className="text-xs text-muted-foreground">a</span>
                <Input
                  type="date"
                  value={f.hireTo}
                  onChange={(e) => set("hireTo", e.target.value)}
                  aria-label="Admissão até"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Documento carregado em</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={f.uploadedFrom}
                  onChange={(e) => set("uploadedFrom", e.target.value)}
                  aria-label="Carregado de"
                />
                <span className="text-xs text-muted-foreground">a</span>
                <Input
                  type="date"
                  value={f.uploadedTo}
                  onChange={(e) => set("uploadedTo", e.target.value)}
                  aria-label="Carregado até"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={f.includeSigned}
                onCheckedChange={(v) => set("includeSigned", v === true)}
              />
              Incluir cópias assinadas
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={f.includeInactive}
                onCheckedChange={(v) => set("includeInactive", v === true)}
              />
              Incluir funcionários inativos
            </label>
          </div>

          <div
            className="rounded-md border border-border bg-muted/30 p-3 text-sm"
            data-testid="extraction-preview"
          >
            {sources.isLoading && (
              <span>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A ler documentos…
              </span>
            )}
            {sources.isError && (
              <span className="text-destructive">Não foi possível ler os documentos.</span>
            )}
            {selection && (
              <span>
                {selection.entries.length} arquivo(s) de {peopleWithDocs} funcionário(s)
                {selection.people.size > peopleWithDocs
                  ? ` · ${selection.people.size - peopleWithDocs} funcionário(s) sem este documento`
                  : ""}
              </span>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" disabled={!!busy} onClick={() => setF(EMPTY_FILTERS)}>
            Limpar filtros
          </Button>
          <Button
            disabled={!!busy || !selection || selection.entries.length === 0}
            onClick={() => void run()}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderDown className="h-4 w-4" />
            )}
            {busy ? `A extrair… ${busy}` : "Extrair (.zip)"}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
