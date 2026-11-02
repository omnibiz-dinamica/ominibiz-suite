import { normalizePhone } from "./phone";

/**
 * Importação de contatos por CSV (colunas: nome, telefone, e-mail).
 * Aceita separador "," ou ";", aspas, e cabeçalho em português ou inglês.
 * Devolve as linhas válidas e um relatório de duplicados e erros de formato.
 */

export interface CsvContactRow {
  line: number;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface CsvIssue {
  line: number;
  value: string;
  reason: string;
}

export interface CsvImportReport {
  valid: CsvContactRow[];
  duplicates: CsvIssue[];
  errors: CsvIssue[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEADER_ALIASES: Record<"name" | "phone" | "email", string[]> = {
  name: ["nome", "name"],
  phone: ["telefone", "phone", "telemovel", "telemóvel", "celular", "whatsapp"],
  email: ["email", "e-mail", "mail"],
};

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function detectSeparator(firstLine: string): string {
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
}

function headerIndexes(cells: string[]): { name: number; phone: number; email: number } | null {
  const norm = cells.map((c) =>
    c
      .toLowerCase()
      .replace(/^\uFEFF/, "")
      .trim(),
  );
  const find = (k: keyof typeof HEADER_ALIASES) =>
    norm.findIndex((c) => HEADER_ALIASES[k].includes(c));
  const idx = { name: find("name"), phone: find("phone"), email: find("email") };
  return idx.name >= 0 ? idx : null;
}

/**
 * @param text conteúdo do ficheiro CSV
 * @param existingPhones telefones (E.164) que já existem na empresa
 */
export function parseContactsCsv(
  text: string,
  existingPhones: Iterable<string> = [],
): CsvImportReport {
  const report: CsvImportReport = { valid: [], duplicates: [], errors: [] };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const firstIdx = lines.findIndex((l) => l.trim() !== "");
  if (firstIdx < 0) return report;

  const sep = detectSeparator(lines[firstIdx]);
  const header = headerIndexes(splitLine(lines[firstIdx], sep));
  const cols = header ?? { name: 0, phone: 1, email: 2 };
  const start = header ? firstIdx + 1 : firstIdx;

  const seen = new Set<string>(existingPhones);
  const seenInFile = new Set<string>();

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") continue;
    const line = i + 1;
    const cells = splitLine(raw, sep);
    const name = (cells[cols.name] ?? "").trim();
    const phoneRaw = cols.phone >= 0 ? (cells[cols.phone] ?? "") : "";
    const emailRaw = cols.email >= 0 ? (cells[cols.email] ?? "").trim() : "";

    if (!name) {
      report.errors.push({ line, value: raw, reason: "Nome em falta." });
      continue;
    }
    const phone = normalizePhone(phoneRaw);
    if (!phone.ok) {
      report.errors.push({ line, value: phoneRaw, reason: phone.error });
      continue;
    }
    if (emailRaw && !EMAIL_PATTERN.test(emailRaw)) {
      report.errors.push({ line, value: emailRaw, reason: "E-mail inválido." });
      continue;
    }
    if (phone.phone) {
      if (seenInFile.has(phone.phone)) {
        report.duplicates.push({
          line,
          value: phone.phone,
          reason: "Telefone repetido no ficheiro.",
        });
        continue;
      }
      if (seen.has(phone.phone)) {
        report.duplicates.push({ line, value: phone.phone, reason: "Contato já existe." });
        continue;
      }
      seenInFile.add(phone.phone);
    }
    report.valid.push({ line, name, phone: phone.phone, email: emailRaw || null });
  }
  return report;
}
