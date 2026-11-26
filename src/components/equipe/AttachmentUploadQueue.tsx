/**
 * 26/11/2026 — Anexos: escolher vários arquivos de uma vez.
 * Cada arquivo tem o seu tipo (sugerido pelo nome; o gestor pode mudar) e é
 * gravado com esse tipo. Em documentos com número na ficha (Cartão de Cidadão,
 * Título de Residência, Passaporte, Carta de condução, A1, Cartão Saúde), o
 * botão "Analisar" lê o documento com IA — só quando o gestor clica — e compara
 * número, validade e nome com a ficha. Se faltar ou for diferente, propõe
 * atualizar a ficha; nada muda sem o gestor confirmar.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, ScanSearch, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ATTACH_CATEGORIES,
  isPdfAttachment,
  labelForCategory,
  type AttachmentAction,
} from "@/lib/employee-attachments";
import {
  checkAgainstProfile,
  fileToAnalysisImages,
  guessCategoryFromName,
  isAnalyzable,
  type DocProfile,
  type DocumentCheck,
} from "@/lib/documents/document-check";
import { analyzeEmployeeDocument, type DocumentReading } from "@/lib/documents/analyze-document.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const attachmentsTable = () => (supabase as any).from("employee_attachments");

const PROFILE_DOC_FIELDS =
  "full_name, main_doc_type, main_doc_number, main_doc_expires_at, passport_number, passport_expires_at, driver_license_number, driver_license_expires_at, a1_number, a1_expires_at, health_card_number, health_card_expires_at";

const FIELD_LABEL: Record<string, string> = {
  main_doc_type: "Tipo doc principal",
  main_doc_number: "Nº documento principal",
  main_doc_expires_at: "Validade doc principal",
  passport_number: "Nº passaporte",
  passport_expires_at: "Validade passaporte",
  driver_license_number: "Nº carta de condução",
  driver_license_expires_at: "Validade carta de condução",
  a1_number: "Nº A1",
  a1_expires_at: "Validade A1",
  health_card_number: "Nº cartão saúde",
  health_card_expires_at: "Validade cartão saúde",
};

type Analysis =
  | { state: "running" }
  | { state: "error"; message: string }
  | { state: "done"; reading: DocumentReading; check: DocumentCheck | null; profileUpdated?: boolean };

type QueueItem = {
  key: string;
  file: File;
  category: string;
  saving?: boolean;
  error?: string;
  analysis?: Analysis;
};

const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export function AttachmentUploadQueue({
  userId,
  companyId,
  visible,
  action,
  onSaved,
}: {
  userId: string;
  companyId: string;
  visible: boolean;
  action: AttachmentAction;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [savingAll, setSavingAll] = useState(false);

  const profileQ = useQuery({
    queryKey: ["employee-doc-fields", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select(PROFILE_DOC_FIELDS).eq("id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? {}) as DocProfile;
    },
  });

  const patchItem = (key: string, patch: Partial<QueueItem>) =>
    setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: QueueItem[] = Array.from(files).map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      category: guessCategoryFromName(file.name) ?? "other",
    }));
    setQueue((q) => [...q, ...added]);
  };

  const analyze = async (it: QueueItem) => {
    if (!isAnalyzable(it.category)) return;
    patchItem(it.key, { analysis: { state: "running" } });
    try {
      const images = await fileToAnalysisImages(it.file);
      if (images.length === 0) throw new Error("O arquivo não tem páginas para analisar.");
      const reading = await analyzeEmployeeDocument({
        data: { companyId, profileId: userId, images, categoryHint: labelForCategory(it.category) },
      });
      const profile = profileQ.data ?? (await profileQ.refetch()).data ?? {};
      patchItem(it.key, {
        analysis: { state: "done", reading, check: checkAgainstProfile(it.category, reading, profile) },
      });
    } catch (err) {
      patchItem(it.key, { analysis: { state: "error", message: (err as Error).message } });
    }
  };

  const updateProfile = async (it: QueueItem, patch: Record<string, string>) => {
    const lines = Object.entries(patch)
      .map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${k.endsWith("_expires_at") ? fmtDate(v) : v}`)
      .join("\n");
    if (!confirm(`Atualizar a ficha do funcionário com o que foi lido no documento?\n\n${lines}`)) return;
    const { error } = await (
      supabase.from("profiles") as unknown as {
        update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
      }
    )
      .update(patch)
      .eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ficha atualizada com os dados do documento.");
    await qc.invalidateQueries({ queryKey: ["employee-doc-fields", userId] });
    qc.invalidateQueries({ queryKey: ["employee-history"] });
    qc.invalidateQueries({ queryKey: ["employee-profile", userId] });
    if (it.analysis?.state === "done") patchItem(it.key, { analysis: { ...it.analysis, profileUpdated: true } });
  };

  const saveOne = async (it: QueueItem): Promise<boolean> => {
    const pdf = isPdfAttachment({ mime_type: it.file.type, file_name: it.file.name });
    if (visible && action === "sign" && !pdf) {
      patchItem(it.key, { error: "Para assinar, o arquivo tem de ser PDF." });
      return false;
    }
    patchItem(it.key, { saving: true, error: undefined });
    const safe = it.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${companyId}/${userId}/${Date.now()}-${safe}`;
    try {
      const up = await supabase.storage.from("employee-docs").upload(path, it.file);
      if (up.error) throw up.error;
      const { error } = await attachmentsTable().insert({
        profile_id: userId,
        company_id: companyId,
        category: it.category,
        file_name: it.file.name,
        storage_path: path,
        mime_type: it.file.type,
        size_bytes: it.file.size,
        employee_visible: visible,
        employee_action: visible ? action : "view",
      });
      if (error) {
        await supabase.storage.from("employee-docs").remove([path]);
        throw new Error(error.message);
      }
      return true;
    } catch (err) {
      patchItem(it.key, { saving: false, error: (err as Error).message });
      return false;
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    let ok = 0;
    const done: string[] = [];
    for (const it of queue) {
      if (await saveOne(it)) {
        ok++;
        done.push(it.key);
      }
    }
    setQueue((q) => q.filter((it) => !done.includes(it.key)));
    setSavingAll(false);
    if (ok > 0) {
      toast.success(`${ok} arquivo(s) gravado(s).`);
      onSaved();
    }
    if (ok < queue.length) toast.error("Alguns arquivos não foram gravados — veja o motivo em cada um.");
  };

  return (
    <div className="space-y-3">
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">
        <Upload className="h-4 w-4" /> Escolher arquivos
        <input
          type="file"
          hidden
          multiple
          disabled={savingAll}
          data-testid="attachments-multi-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </label>

      {queue.length > 0 && (
        <div className="space-y-2" data-testid="attachments-queue">
          {queue.map((it) => {
            const a = it.analysis;
            const canAnalyze = isAnalyzable(it.category);
            return (
              <div key={it.key} className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium" title={it.file.name}>
                    {it.file.name}
                  </span>
                  <Select
                    value={it.category}
                    disabled={it.saving || savingAll}
                    onValueChange={(v) => patchItem(it.key, { category: v, analysis: undefined })}
                  >
                    <SelectTrigger className="h-8 w-[190px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTACH_CATEGORIES.map((c) => (
                        <SelectItem key={c.v} value={c.v}>
                          {c.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {canAnalyze && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="attachment-analyze"
                      disabled={a?.state === "running" || it.saving || savingAll}
                      onClick={() => void analyze(it)}
                      title="Lê o documento com IA e confere com a ficha"
                    >
                      {a?.state === "running" ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ScanSearch className="mr-1 h-3.5 w-3.5" />
                      )}
                      Analisar
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={it.saving || savingAll}
                    onClick={() => setQueue((q) => q.filter((x) => x.key !== it.key))}
                    aria-label="Tirar da lista"
                    title="Tirar da lista"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {it.saving && <p className="text-xs text-muted-foreground">A gravar…</p>}
                {it.error && <p className="text-xs text-destructive">{it.error}</p>}
                {a?.state === "error" && <p className="text-xs text-destructive">{a.message}</p>}
                {a?.state === "done" && (
                  <AnalysisResult
                    category={it.category}
                    reading={a.reading}
                    check={a.check}
                    profileUpdated={!!a.profileUpdated}
                    onUpdate={(patch) => void updateProfile(it, patch)}
                  />
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Cada arquivo é gravado com o tipo escolhido. "Analisar" envia a imagem do documento à IA só quando
              clica.
            </p>
            <Button type="button" disabled={savingAll} onClick={() => void saveAll()} data-testid="attachments-save-all">
              {savingAll && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Gravar {queue.length} arquivo(s)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisResult({
  category,
  reading,
  check,
  profileUpdated,
  onUpdate,
}: {
  category: string;
  reading: DocumentReading;
  check: DocumentCheck | null;
  profileUpdated: boolean;
  onUpdate: (patch: Record<string, string>) => void;
}) {
  if (!check) return null;
  const n = check.number;
  const ok = n.kind === "same" && !check.expiry.differs && check.name !== false && !check.typeMismatch;
  return (
    <div
      data-testid="attachment-analysis"
      className={`space-y-1 rounded-md border p-2 text-xs ${ok ? "border-green-300 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
    >
      <p className="font-semibold">
        {ok ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
        {n.kind === "same" && "Número igual ao registado na ficha."}
        {n.kind === "missing_in_profile" && `A ficha não tem número registado. No documento: ${n.documentNumber}.`}
        {n.kind === "different" &&
          `Número diferente! Ficha: ${n.profileNumber} · Documento: ${n.documentNumber}.`}
        {n.kind === "not_read" && "Não foi possível ler o número no documento."}
      </p>
      <p>
        Validade — ficha: {fmtDate(check.expiry.profile)} · documento: {fmtDate(check.expiry.document)}
        {check.expiry.expired && <strong> · documento caducado</strong>}
      </p>
      {reading.full_name && (
        <p>
          Nome no documento: {reading.full_name}
          {check.name === false && <strong> · não parece ser este funcionário</strong>}
        </p>
      )}
      {check.typeMismatch && (
        <p>
          <strong>Atenção:</strong> parece ser {labelForCategory(reading.document_type ?? "other")}, e não{" "}
          {labelForCategory(category)}. Confira o tipo antes de gravar.
        </p>
      )}
      {reading.confidence === "low" && n.kind !== "not_read" && (
        <p>Leitura pouco segura — confirme o número no documento antes de atualizar a ficha.</p>
      )}
      {reading.notes && <p className="italic">{reading.notes}</p>}
      {check.proposedPatch && !profileUpdated && check.name !== false && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-1 h-7 text-xs"
          data-testid="attachment-update-profile"
          onClick={() => onUpdate(check.proposedPatch as Record<string, string>)}
        >
          Atualizar ficha com estes dados
        </Button>
      )}
      {profileUpdated && <p className="font-semibold">Ficha atualizada.</p>}
    </div>
  );
}
