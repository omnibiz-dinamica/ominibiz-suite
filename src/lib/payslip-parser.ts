// Parser heurístico de recibos (PDF) — executado no navegador via pdfjs-dist.
// Retorna metadados best-effort; gestor pode corrigir manualmente no drawer.
import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

(pdfjs as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;

export type ParsedPayslip = {
  text: string;
  period_year: number | null;
  period_month: number | null;
  employee_name_detected: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  parse_confidence: number;
};

const MONTHS_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, "março": 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return out;
}

export function parsePayslipText(text: string): ParsedPayslip {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();

  // Período: mês + ano
  let period_month: number | null = null;
  let period_year: number | null = null;
  const monthRe = new RegExp(`\\b(${Object.keys(MONTHS_PT).join("|")})\\b[^\\d]{0,20}(20\\d{2})`, "i");
  const m = lower.match(monthRe);
  if (m) {
    period_month = MONTHS_PT[m[1].toLowerCase()] ?? null;
    period_year = parseInt(m[2], 10);
  } else {
    // fallback: MM/YYYY
    const m2 = normalized.match(/\b(0?[1-9]|1[0-2])\/(20\d{2})\b/);
    if (m2) {
      period_month = parseInt(m2[1], 10);
      period_year = parseInt(m2[2], 10);
    }
  }

  // Nome do funcionário
  let employee_name_detected: string | null = null;
  const nameRe = /\b(nome|funcion[áa]rio|colaborador|trabalhador)\s*:?\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ' ]{4,80})/;
  const nm = normalized.match(nameRe);
  if (nm) employee_name_detected = nm[2].trim().replace(/\s+\d.*$/, "").trim();

  // Valor líquido
  let net_amount: number | null = null;
  const netRe = /(l[ií]quido(?:\s+a\s+receber)?|total\s+l[ií]quido|valor\s+l[ií]quido)[^\d-]{0,20}([\-\d.,]{2,})/i;
  const nn = normalized.match(netRe);
  if (nn) net_amount = parseAmount(nn[2]);

  // Valor bruto
  let gross_amount: number | null = null;
  const grossRe = /(vencimento\s+(?:base|bruto)|total\s+bruto|sal[áa]rio\s+bruto|remunera[çc][ãa]o\s+bruta)[^\d-]{0,20}([\-\d.,]{2,})/i;
  const gg = normalized.match(grossRe);
  if (gg) gross_amount = parseAmount(gg[2]);

  const found = [period_year, period_month, employee_name_detected, net_amount].filter(Boolean).length;
  const parse_confidence = Math.min(1, found / 4);

  return {
    text: normalized.slice(0, 4000),
    period_year,
    period_month,
    employee_name_detected,
    gross_amount,
    net_amount,
    parse_confidence,
  };
}

export function fuzzyMatchEmployee(
  detected: string | null,
  candidates: { id: string; name: string }[],
): { id: string; name: string; score: number }[] {
  if (!detected) return [];
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
  const target = norm(detected);
  const targetTokens = new Set(target.split(/\s+/).filter((t) => t.length > 2));
  if (targetTokens.size === 0) return [];
  return candidates
    .map((c) => {
      const tokens = new Set(norm(c.name).split(/\s+/).filter((t) => t.length > 2));
      let inter = 0;
      targetTokens.forEach((t) => { if (tokens.has(t)) inter++; });
      const union = targetTokens.size + tokens.size - inter;
      const score = union ? inter / union : 0;
      return { id: c.id, name: c.name, score };
    })
    .filter((c) => c.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export const MONTH_LABEL_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];