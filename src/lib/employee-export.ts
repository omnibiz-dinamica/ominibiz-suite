/**
 * OmniBiz · Exportar funcionários para Excel (um ou todos), com os anexos.
 * Sem anexos: baixa só o .xlsx. Com anexos: um .zip com o .xlsx e uma pasta
 * por funcionário. Os dados vêm de `employee_export_profiles` (Owner,
 * Manager, Super Admin e Accountant; sem assinatura/visto).
 */
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  attachmentStatusLabel,
  labelForCategory,
  type EmployeeAttachment,
} from "@/lib/employee-attachments";

type Row = Record<string, unknown>;

/** Ordem e nomes das colunas (as que não estão aqui vão no fim, com o nome técnico). */
export const PROFILE_COLUMNS: Array<[string, string]> = [
  ["full_name", "Nome completo"],
  ["first_name", "Nome"],
  ["last_name", "Apelido"],
  ["company_roles", "Papel na empresa"],
  ["is_active", "Ativo"],
  ["status", "Situação"],
  ["job_title", "Função"],
  ["sector", "Setor"],
  ["team", "Equipa"],
  ["team_number", "Nº equipa"],
  ["work_location", "Local de trabalho"],
  ["phone", "Telefone"],
  ["whatsapp", "WhatsApp"],
  ["birth_date", "Data de nascimento"],
  ["nationality", "Nacionalidade"],
  ["marital_status", "Estado civil"],
  ["dependents_count", "Dependentes"],
  ["official_address", "Morada oficial"],
  ["address_be", "Morada (Bélgica)"],
  ["hire_date", "Data de admissão"],
  ["termination_date", "Data de saída"],
  ["contract_type", "Tipo de contrato"],
  ["contract_renewal_date", "Renovação do contrato"],
  ["weekly_contracted_hours", "Horas semanais"],
  ["tax_id_nif", "NIF"],
  ["tax_country", "País fiscal"],
  ["social_security_niss", "NISS"],
  ["main_doc_type", "Documento principal"],
  ["main_doc_number", "Nº documento principal"],
  ["main_doc_expires_at", "Validade documento principal"],
  ["passport_number", "Passaporte"],
  ["passport_expires_at", "Validade passaporte"],
  ["driver_license_number", "Carta de condução"],
  ["driver_license_expires_at", "Validade carta"],
  ["a1_number", "A1"],
  ["a1_expires_at", "Validade A1"],
  ["health_card_number", "Cartão saúde"],
  ["health_card_expires_at", "Validade cartão saúde"],
  ["occ_health_last_at", "Medicina trabalho (última)"],
  ["occ_health_next_at", "Medicina trabalho (próxima)"],
  ["iban", "IBAN"],
  ["swift", "SWIFT"],
  ["pay_model", "Modelo de pagamento"],
  ["pay_rate_source", "Origem do valor"],
  ["rate_hour_week", "Valor hora (semana)"],
  ["rate_hour_weekend", "Valor hora (fim de semana)"],
  ["rate_day_be", "Valor dia (Bélgica)"],
  ["rate_day_foreign", "Valor dia (Holanda/Alemanha)"],
  ["manual_hourly_rate", "Valor hora (manual)"],
  ["manual_daily_rate", "Valor dia (manual)"],
  ["manual_monthly_rate", "Valor mensal (manual)"],
  ["allowance_rent", "Renda"],
  ["allowance_transport", "Transporte"],
  ["allowance_meal", "Comida"],
  ["allowance_other", "Outros subsídios"],
];

/** Nunca vão para o Excel (técnicos ou assinatura/visto). */
const HIDDEN = new Set([
  "id",
  "signature_url",
  "initials_url",
  "avatar_url",
  "current_company_id",
  "company_id_primary",
  "supervisor_id",
  "created_at",
  "updated_at",
]);

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Gestor",
  accountant: "Contabilidade",
  secretary: "Secretária",
  employee: "Funcionário",
  super_admin: "Super Admin",
};

function cell(key: string, v: unknown): string | number {
  if (v == null) return "";
  if (key === "company_roles" && Array.isArray(v))
    return v.map((r) => ROLE_LABEL[String(r)] ?? String(r)).join(", ");
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function profileColumns(rows: Row[]): Array<[string, string]> {
  const known = new Set(PROFILE_COLUMNS.map(([k]) => k));
  const extra = new Set<string>();
  for (const r of rows)
    for (const k of Object.keys(r)) if (!known.has(k) && !HIDDEN.has(k)) extra.add(k);
  return [...PROFILE_COLUMNS, ...[...extra].sort().map((k) => [k, k] as [string, string])];
}

export function profilesSheet(rows: Row[]): (string | number)[][] {
  const cols = profileColumns(rows);
  return [cols.map(([, l]) => l), ...rows.map((r) => cols.map(([k]) => cell(k, r[k])))];
}

/** Nome seguro para pasta/ficheiro dentro do zip. */
export function safeName(s: string, fallback = "sem-nome"): string {
  const clean = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return clean || fallback;
}

export type ZipEntry = {
  path: string;
  bucketPath: string;
  attachment: EmployeeAttachment;
  signed: boolean;
};

/** Onde fica cada anexo (e a cópia assinada) no zip, sem nomes repetidos. */
export function planZipEntries(
  attachments: EmployeeAttachment[],
  nameOf: (profileId: string) => string,
): ZipEntry[] {
  const used = new Set<string>();
  const unique = (p: string) => {
    if (!used.has(p.toLowerCase())) {
      used.add(p.toLowerCase());
      return p;
    }
    const dot = p.lastIndexOf(".");
    for (let i = 2; ; i++) {
      const q =
        dot > p.lastIndexOf("/") ? `${p.slice(0, dot)} (${i})${p.slice(dot)}` : `${p} (${i})`;
      if (!used.has(q.toLowerCase())) {
        used.add(q.toLowerCase());
        return q;
      }
    }
  };
  const out: ZipEntry[] = [];
  for (const a of attachments) {
    const folder = `anexos/${safeName(nameOf(a.profile_id))}`;
    out.push({
      path: unique(`${folder}/${safeName(a.file_name, "arquivo")}`),
      bucketPath: a.storage_path,
      attachment: a,
      signed: false,
    });
    if (a.signed_storage_path) {
      out.push({
        path: unique(
          `${folder}/assinado - ${safeName(a.file_name.replace(/\.pdf$/i, ""), "documento")}.pdf`,
        ),
        bucketPath: a.signed_storage_path,
        attachment: a,
        signed: true,
      });
    }
  }
  return out;
}

export function attachmentsSheet(
  entries: ZipEntry[],
  nameOf: (profileId: string) => string,
): (string | number)[][] {
  const head = [
    "Funcionário",
    "Categoria",
    "Arquivo",
    "Visível ao funcionário",
    "Ação",
    "Estado",
    "Enviado em",
    "No zip",
  ];
  return [
    head,
    ...entries.map((e) => [
      nameOf(e.attachment.profile_id),
      labelForCategory(e.attachment.category),
      e.signed ? `${e.attachment.file_name} (cópia assinada)` : e.attachment.file_name,
      e.attachment.employee_visible ? "Sim" : "Não",
      e.attachment.employee_action === "sign" ? "Assinar" : "Visualizar",
      attachmentStatusLabel(e.attachment),
      new Date(e.attachment.uploaded_at).toLocaleDateString("pt-PT"),
      e.path,
    ]),
  ];
}

function workbookBytes(
  profiles: Row[],
  entries: ZipEntry[],
  nameOf: (id: string) => string,
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(profilesSheet(profiles));
  ws["!cols"] = profileColumns(profiles).map(([, l]) => ({ wch: Math.max(l.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, "Funcionários");
  if (entries.length) {
    const wa = XLSX.utils.aoa_to_sheet(attachmentsSheet(entries, nameOf));
    wa["!cols"] = [28, 22, 36, 12, 12, 26, 12, 50].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, wa, "Anexos");
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

function saveBlob(bytes: Uint8Array, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exporta um funcionário (`profileId`) ou todos da empresa.
 * Devolve quantos anexos não foi possível baixar (ficam listados no Excel).
 */
export async function exportEmployees(opts: {
  companyId: string;
  companyName?: string | null;
  profileId?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ employees: number; attachments: number; failed: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("employee_export_profiles", {
    _company_id: opts.companyId,
    _profile_id: opts.profileId ?? null,
  });
  if (error) throw new Error(error.message ?? "Não foi possível exportar.");
  const profiles = (data ?? []) as Row[];
  if (profiles.length === 0) throw new Error("Não há funcionários para exportar.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("employee_attachments")
    .select("*")
    .eq("company_id", opts.companyId)
    .order("uploaded_at", { ascending: true });
  if (opts.profileId) q = q.eq("profile_id", opts.profileId);
  const { data: atts, error: attErr } = await q;
  if (attErr) throw new Error(attErr.message);
  const names = new Map(
    profiles.map((p) => [String(p.id), String(p.full_name ?? "") || "Sem nome"]),
  );
  const nameOf = (id: string) => names.get(id) ?? "Outros";
  const attachments = ((atts ?? []) as EmployeeAttachment[]).filter((a) => names.has(a.profile_id));
  const entries = planZipEntries(attachments, nameOf);

  const stamp = new Date().toISOString().slice(0, 10);
  const base = opts.profileId
    ? `funcionario-${safeName(nameOf(opts.profileId))}-${stamp}`
    : `funcionarios-${safeName(opts.companyName ?? "empresa")}-${stamp}`;
  const xlsx = workbookBytes(profiles, entries, nameOf);

  if (entries.length === 0) {
    saveBlob(
      xlsx,
      `${base}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    return { employees: profiles.length, attachments: 0, failed: 0 };
  }

  const { zipSync } = await import("fflate");
  const files: Record<string, Uint8Array> = { [`${base}.xlsx`]: xlsx };
  let failed = 0;
  let done = 0;
  for (const e of entries) {
    const { data: blob } = await supabase.storage.from("employee-docs").download(e.bucketPath);
    if (blob) files[e.path] = new Uint8Array(await blob.arrayBuffer());
    else failed += 1;
    done += 1;
    opts.onProgress?.(done, entries.length);
  }
  saveBlob(zipSync(files, { level: 6 }), `${base}.zip`, "application/zip");
  return { employees: profiles.length, attachments: entries.length - failed, failed };
}
