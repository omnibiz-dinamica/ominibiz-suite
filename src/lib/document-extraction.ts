/**
 * SUP-304 (18/11/2026) — Extração de documentos dos funcionários.
 *
 * O gestor escolhe o tipo de documento (ex.: Título de Residência) e filtra
 * por empresa (campo "Cargo / função": Life Tidy, Tokmagico…), setor, equipa,
 * data de admissão e data em que o documento foi carregado. Sai um .zip em
 * que cada arquivo tem o NOME COMPLETO do funcionário, mais um índice .csv.
 *
 * Os dados vêm das mesmas fontes seguras da exportação (RPC
 * employee_export_profiles + employee_attachments com RLS + bucket
 * employee-docs com RLS). Nada é alterado.
 */
import { supabase } from "@/integrations/supabase/client";
import { labelForCategory, type EmployeeAttachment } from "@/lib/employee-attachments";
import { employeeExitState, type EmployeeStatusFields } from "@/lib/employee-status";
import { safeName } from "@/lib/employee-export";

export type ExtractionProfile = EmployeeStatusFields & {
  id: string;
  full_name?: string | null;
  job_title?: string | null;
  sector?: string | null;
  team_number?: number | null;
  hire_date?: string | null;
};

export type ExtractionFilters = {
  categories: string[]; // vazio = todos os tipos
  employer: string; // "" = todas (comparação sem acentos/maiúsculas)
  sector: string; // "" = todos
  teamNumber: string; // "" = todas
  hireFrom: string; // YYYY-MM-DD ou ""
  hireTo: string;
  uploadedFrom: string;
  uploadedTo: string;
  includeInactive: boolean;
  includeSigned: boolean;
};

export const EMPTY_FILTERS: ExtractionFilters = {
  categories: [],
  employer: "",
  sector: "",
  teamNumber: "",
  hireFrom: "",
  hireTo: "",
  uploadedFrom: "",
  uploadedTo: "",
  includeInactive: false,
  includeSigned: true,
};

const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function profileMatches(p: ExtractionProfile, f: ExtractionFilters): boolean {
  if (!f.includeInactive && employeeExitState(p) === "inativo") return false;
  if (f.employer && norm(p.job_title) !== norm(f.employer)) return false;
  if (f.sector && norm(p.sector) !== norm(f.sector)) return false;
  if (f.teamNumber && String(p.team_number ?? "") !== f.teamNumber) return false;
  const hire = (p.hire_date ?? "").slice(0, 10);
  if (f.hireFrom && (!hire || hire < f.hireFrom)) return false;
  if (f.hireTo && (!hire || hire > f.hireTo)) return false;
  return true;
}

export function attachmentMatches(a: EmployeeAttachment, f: ExtractionFilters): boolean {
  if (f.categories.length > 0 && !f.categories.includes(a.category)) return false;
  const up = (a.uploaded_at ?? "").slice(0, 10);
  if (f.uploadedFrom && (!up || up < f.uploadedFrom)) return false;
  if (f.uploadedTo && (!up || up > f.uploadedTo)) return false;
  return true;
}

export type ExtractionEntry = {
  zipPath: string;
  bucketPath: string;
  employee: string;
  category: string;
  original: string;
  uploadedAt: string;
  signed: boolean;
};

const extOf = (name: string) => {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? `.${m[1].toLowerCase()}` : "";
};

/**
 * "Nome Completo - Título de Residência.pdf"; repetidos ganham (2), (3)…;
 * a cópia assinada leva " - assinado".
 */
export function planExtraction(
  attachments: EmployeeAttachment[],
  nameOf: (profileId: string) => string,
  includeSigned: boolean,
): ExtractionEntry[] {
  const used = new Set<string>();
  const unique = (base: string, ext: string) => {
    let p = `${base}${ext}`;
    for (let i = 2; used.has(p.toLowerCase()); i++) p = `${base} (${i})${ext}`;
    used.add(p.toLowerCase());
    return p;
  };
  const out: ExtractionEntry[] = [];
  const sorted = [...attachments].sort(
    (a, b) =>
      nameOf(a.profile_id).localeCompare(nameOf(b.profile_id), "pt") ||
      (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? ""),
  );
  for (const a of sorted) {
    const person = safeName(nameOf(a.profile_id));
    const cat = safeName(labelForCategory(a.category), "Documento");
    out.push({
      zipPath: unique(`${person} - ${cat}`, extOf(a.file_name)),
      bucketPath: a.storage_path,
      employee: nameOf(a.profile_id),
      category: labelForCategory(a.category),
      original: a.file_name,
      uploadedAt: (a.uploaded_at ?? "").slice(0, 10),
      signed: false,
    });
    if (includeSigned && a.signed_storage_path) {
      out.push({
        zipPath: unique(`${person} - ${cat} - assinado`, ".pdf"),
        bucketPath: a.signed_storage_path,
        employee: nameOf(a.profile_id),
        category: labelForCategory(a.category),
        original: a.file_name,
        uploadedAt: (a.uploaded_at ?? "").slice(0, 10),
        signed: true,
      });
    }
  }
  return out;
}

export function extractionIndexCsv(entries: ExtractionEntry[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["Arquivo;Funcionário;Tipo;Arquivo original;Carregado em;Cópia assinada"];
  for (const e of entries) {
    lines.push(
      [e.zipPath, e.employee, e.category, e.original, e.uploadedAt, e.signed ? "Sim" : "Não"]
        .map(esc)
        .join(";"),
    );
  }
  return `\ufeff${lines.join("\n")}\n`;
}

export async function loadExtractionSources(companyId: string): Promise<{
  profiles: ExtractionProfile[];
  attachments: EmployeeAttachment[];
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("employee_export_profiles", {
    _company_id: companyId,
    _profile_id: null,
  });
  if (error) throw new Error(error.message ?? "Não foi possível ler os funcionários.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: atts, error: attErr } = await (supabase as any)
    .from("employee_attachments")
    .select("*")
    .eq("company_id", companyId)
    .order("uploaded_at", { ascending: true });
  if (attErr) throw new Error(attErr.message);
  return {
    profiles: (data ?? []) as ExtractionProfile[],
    attachments: (atts ?? []) as EmployeeAttachment[],
  };
}

export function selectForExtraction(
  sources: { profiles: ExtractionProfile[]; attachments: EmployeeAttachment[] },
  f: ExtractionFilters,
) {
  const people = new Map(
    sources.profiles
      .filter((p) => profileMatches(p, f))
      .map((p) => [String(p.id), (p.full_name ?? "").trim() || "Sem nome"]),
  );
  const attachments = sources.attachments.filter(
    (a) => people.has(a.profile_id) && attachmentMatches(a, f),
  );
  return {
    people,
    entries: planExtraction(attachments, (id) => people.get(id) ?? "Sem nome", f.includeSigned),
  };
}

export async function downloadExtraction(
  entries: ExtractionEntry[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ files: number; failed: number }> {
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  let failed = 0;
  let done = 0;
  for (const e of entries) {
    const { data: blob } = await supabase.storage.from("employee-docs").download(e.bucketPath);
    if (blob) files[e.zipPath] = new Uint8Array(await blob.arrayBuffer());
    else failed += 1;
    done += 1;
    onProgress?.(done, entries.length);
  }
  files["indice.csv"] = strToU8(extractionIndexCsv(entries));
  const zip = zipSync(files, { level: 6 });
  const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { files: entries.length - failed, failed };
}
