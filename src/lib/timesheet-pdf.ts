import jsPDF from "jspdf";
import { PDFDocument } from "pdf-lib";
import {
  MONTH_LABELS,
  formatMinutes,
  signatureDataUrl,
  type TimesheetSnapshot,
} from "@/lib/timesheet";
import { isDayVisto } from "@/lib/timesheet-signature";
import { cleanSignatureImage, fitInBox, type CleanImage } from "@/lib/signature-image";
import { formatWallDate } from "@/lib/wall-clock";
import {
  AFTER_SIGNATURE_NOTICE,
  OFF_SCHEDULE_LEGEND,
  dayClients,
  dayEntryRows,
  dayFlags,
  dayInText,
  dayOutText,
  dayStatusText,
  fillMonthDays,
  hasOffSchedule,
  isWeekendKey,
  revisionText,
  weekdayLetter,
} from "@/lib/timesheet-view";
import { PAYMENT_TYPE_LABEL, type PaymentType } from "@/lib/compensation";
import { currentLanguage, dateLocale, translator, type AppLanguage } from "@/i18n";

/**
 * Gerador do PDF "Folha de Ponto Individual de Trabalho" (ADR-038).
 *
 * Consome EXCLUSIVAMENTE o snapshot gravado no fechamento. Nenhum cálculo
 * financeiro acontece aqui — os valores chegam prontos da fonte canónica.
 */

const MARGIN = 40;
const A4 = { w: 595.28, h: 841.89 };

function money(value: number | null | undefined, currency: string) {
  if (value == null) return "—";
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${Number(value).toFixed(2)}`;
}

function payLabel(type: string | null | undefined, tr: (k: string) => string) {
  if (!type) return "—";
  if (type === "multiple") return tr("Vários (por cliente)");
  const label = PAYMENT_TYPE_LABEL[type as PaymentType];
  return label ? tr(label) : type;
}

/** "Versão 3" / "Prévia" (vêm das telas em português) na língua do PDF. */
function versionText(label: string, tr: (k: string, o?: Record<string, unknown>) => string) {
  const m = /^Versão (\d+)$/.exec(label);
  if (m) return tr("Versão {{n}}", { n: m[1] });
  return tr(label);
}

/**
 * Visto: marca vetorial (✓) — usada só quando o funcionário não tem o visto
 * (rubrica) cadastrado. A assinatura completa nunca é repetida por linha.
 */
function drawCheck(doc: jsPDF, x: number, y: number) {
  const prevW = doc.getLineWidth();
  doc.setLineWidth(1.1);
  doc.setDrawColor(30, 90, 40);
  doc.line(x, y, x + 3, y + 3.5);
  doc.line(x + 3, y + 3.5, x + 9, y - 4.5);
  doc.setDrawColor(232);
  doc.setLineWidth(prevW);
}

export async function generateTimesheetPdf(
  snapshot: TimesheetSnapshot,
  opts: {
    versionLabel?: string;
    embedSignatures?: boolean;
    signedAt?: string | null;
    /** Assinatura canónica da versão (ADR-059). Sem ela, nada é assinado. */
    signatureUrl?: string | null;
    /** Visto (rubrica) da versão: desenhado em cada linha vistada. */
    initialsUrl?: string | null;
    /** SUP-301: cliente/observação/vermelho vieram dos dados atuais (folha assinada antes). */
    extrasLive?: boolean;
    /** Língua do PDF; por omissão, a língua escolhida por quem o gera. */
    language?: AppLanguage;
  } = {},
): Promise<Uint8Array> {
  const lang = opts.language ?? currentLanguage();
  const tr = translator(lang);
  const locale = dateLocale(lang);
  const monthName = (m: number) => tr(MONTH_LABELS[Math.min(Math.max(m, 1), 12) - 1]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const contentW = A4.w - MARGIN * 2;
  let y = MARGIN;
  let page = 1;

  // Assinatura do colaborador só quando o documento está validado/assinado.
  const signaturePath =
    opts.embedSignatures === false || !opts.signedAt
      ? null
      : opts.signatureUrl ?? snapshot.employee.signature_url;
  const initialsPath =
    opts.embedSignatures === false || !opts.signedAt
      ? null
      : opts.initialsUrl ?? snapshot.employee.initials_url;
  // Assinatura e visto vão sempre sem fundo e recortados ao traço.
  const clean = async (path: string | null | undefined): Promise<CleanImage | null> => {
    const raw = await signatureDataUrl(path);
    if (!raw) return null;
    try {
      return await cleanSignatureImage(raw);
    } catch {
      return null;
    }
  };
  const [sigImg, initialsImg] = await Promise.all([clean(signaturePath), clean(initialsPath)]);

  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text((snapshot.company.name ?? "OmniBiz").toUpperCase(), MARGIN, y);
    doc.text("OmniBiz Suite", A4.w - MARGIN, y, { align: "right" });
    y += 6;
    doc.setDrawColor(210);
    doc.line(MARGIN, y, A4.w - MARGIN, y);
    y += 22;

    doc.setTextColor(20);
    doc.setFontSize(15);
    doc.text(tr("FOLHA DE PONTO INDIVIDUAL DE TRABALHO"), MARGIN, y);
    y += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const rows: [string, string][] = [
      [tr("Nome do empregado"), snapshot.employee.full_name ?? "—"],
      [tr("Função"), snapshot.employee.job_title ?? "—"],
      [tr("Local de trabalho"), snapshot.employee.work_location ?? "—"],
      [tr("Mês / Ano"), `${monthName(snapshot.period.month)} / ${snapshot.period.year}`],
    ];
    for (const [k, v] of rows) {
      doc.setTextColor(120);
      doc.text(`${k}:`, MARGIN, y);
      doc.setTextColor(20);
      doc.text(String(v), MARGIN + 120, y);
      y += 14;
    }
    y += 8;
  };

  // SUP-301: todos os dias do mês, letra do dia, cliente, observação e vermelho.
  const cols = [
    { key: "date", label: tr("Data"), w: 72 },
    { key: "client", label: tr("Cliente"), w: 112 },
    { key: "in", label: tr("Entrada"), w: 46 },
    { key: "out", label: tr("Saída"), w: 46 },
    { key: "break", label: tr("Pausas"), w: 44 },
    { key: "total", label: tr("Total"), w: 44 },
    { key: "status", label: tr("Situação"), w: 90 },
    { key: "visto", label: tr("Visto"), w: contentW - 454 },
  ];
  const VISTO = cols.length - 1;
  const RED: [number, number, number] = [200, 30, 30];
  const fit = (text: string, w: number) => {
    if (!text || doc.getTextWidth(text) <= w) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > w) t = t.slice(0, -1);
    return `${t}…`;
  };
  const days = fillMonthDays(snapshot);

  const tableHead = () => {
    doc.setFillColor(243, 244, 246);
    doc.rect(MARGIN, y - 11, contentW, 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60);
    let x = MARGIN + 6;
    for (const c of cols) {
      doc.text(c.label, x, y + 2);
      x += c.w;
    }
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(25);
  };

  const newPage = (continuation: boolean) => {
    doc.addPage();
    page += 1;
    y = MARGIN;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      `${(snapshot.company.name ?? "OmniBiz").toUpperCase()} — ${tr("Folha de Ponto")} ${monthName(
        snapshot.period.month,
      )}/${snapshot.period.year}${continuation ? ` ${tr("(continuação)")}` : ""}`,
      MARGIN,
      y,
    );
    y += 6;
    doc.line(MARGIN, y, A4.w - MARGIN, y);
    y += 24;
    doc.setTextColor(25);
    tableHead();
  };

  header();
  tableHead();

  doc.setFontSize(9);
  for (const d of days) {
    const flags = dayFlags(d);
    // Só a observação do funcionário vai por baixo da linha (o vermelho fica nas células).
    const extraLines: { text: string; red: boolean }[] = [];
    doc.setFontSize(7.5);
    for (const n of d.task_notes ?? []) {
      const txt = `${tr("Obs.")} (${n.client_name ?? n.title ?? tr("tarefa")}): ${n.note}`;
      for (const line of doc.splitTextToSize(txt, contentW - 12) as string[])
        extraLines.push({ text: line, red: false });
    }
    doc.setFontSize(9);
    // Vários pontos no dia: uma linha por ponto (data, situação e visto só na primeira).
    const [first, ...rest] = dayEntryRows(d);
    const rowH = 18 + rest.length * 13 + extraLines.length * 9;
    if (y + rowH > A4.h - 90) newPage(true);

    if (isWeekendKey(d.work_date)) {
      doc.setFillColor(248, 248, 250);
      doc.rect(MARGIN, y - 11, contentW, 17, "F");
    }
    let x = MARGIN + 6;
    const empty = !!d.placeholder;
    const cells = [
      `${formatWallDate(d.work_date) || d.work_date}  ${weekdayLetter(d.work_date, lang)}`,
      empty ? "" : fit(first ? (first.client_name ?? "—") : dayClients(d) || "—", cols[1].w - 6),
      empty ? "" : first ? (first.first_in_local ?? "—") : dayInText(d),
      empty ? "" : first ? (first.last_out_local ?? "—") : dayOutText(d),
      empty ? "" : formatMinutes(first ? first.break_minutes : d.break_minutes),
      empty ? "" : formatMinutes(first ? first.worked_minutes : d.worked_minutes),
      fit(dayStatusText(d, tr), cols[6].w - 6),
      "",
    ];
    const redCell = first
      ? [false, false, first.start_off, first.end_off, false, first.over_6h, false, false]
      : [false, false, flags.start, flags.end, false, flags.over6h, false, false];
    if (empty) doc.setTextColor(150);
    cells.forEach((value, i) => {
      if (i === VISTO) {
        // Coluna Visto (ADR-059): confirmação do dia OU versão validada pelo
        // funcionário — a validação do documento cobre todas as suas linhas.
        // Marca simples: a assinatura manuscrita aparece só no fim do documento.
        if (!empty && isDayVisto(d, { signedAt: opts.signedAt })) {
          if (initialsImg) {
            const box = fitInBox(initialsImg.width, initialsImg.height, cols[i].w - 6, 15);
            try {
              doc.addImage(initialsImg.dataUrl, "PNG", x, y - 10, box.w, box.h);
            } catch {
              drawCheck(doc, x + 2, y - 1);
            }
          } else {
            drawCheck(doc, x + 2, y - 1);
          }
        }
      } else {
        if (redCell[i]) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...RED);
        }
        doc.text(String(value), x, y + 1);
        if (redCell[i]) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(empty ? 150 : 25);
        }
      }
      x += cols[i].w;
    });
    doc.setTextColor(25);

    // Restantes pontos do dia
    let ry = y;
    for (const e of rest) {
      ry += 13;
      const vals = [
        fit(e.client_name ?? e.task_title ?? "—", cols[1].w - 6),
        e.first_in_local ?? "—",
        e.last_out_local ?? "—",
        formatMinutes(e.break_minutes),
        formatMinutes(e.worked_minutes),
      ];
      const reds = [false, e.start_off, e.end_off, false, e.over_6h];
      let ex = MARGIN + 6 + cols[0].w;
      vals.forEach((v, i) => {
        if (reds[i]) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...RED);
        }
        doc.text(String(v), ex, ry + 1);
        if (reds[i]) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(25);
        }
        ex += cols[i + 1].w;
      });
    }

    let ly = ry + 10;
    if (extraLines.length) {
      doc.setFontSize(7.5);
      for (const l of extraLines) {
        if (l.red) doc.setTextColor(...RED);
        else doc.setTextColor(95);
        doc.text(l.text, MARGIN + 10, ly + 1);
        ly += 9;
      }
      doc.setFontSize(9);
      doc.setTextColor(25);
    }

    doc.setDrawColor(232);
    doc.line(MARGIN, y + rowH - 12, A4.w - MARGIN, y + rowH - 12);
    y += rowH;
  }

  // Avisos da tabela
  const notices: { text: string; red: boolean }[] = [];
  if (hasOffSchedule(days)) notices.push({ text: tr(OFF_SCHEDULE_LEGEND), red: true });
  if (opts.extrasLive) notices.push({ text: tr(AFTER_SIGNATURE_NOTICE), red: false });
  const revision = revisionText(snapshot, tr, locale);
  if (revision) notices.push({ text: revision, red: false });
  if (notices.length) {
    doc.setFontSize(7.5);
    for (const n of notices) {
      const lines = doc.splitTextToSize(n.text, contentW) as string[];
      if (y + lines.length * 9 > A4.h - 90) newPage(true);
      if (n.red) doc.setTextColor(...RED);
      else doc.setTextColor(90);
      for (const line of lines) {
        doc.text(line, MARGIN, y);
        y += 9;
      }
    }
    doc.setFontSize(9);
    doc.setTextColor(25);
  }

  // ---------- Resumo do mês ----------
  if (y > A4.h - 240) newPage(true);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(tr("RESUMO DO MÊS"), MARGIN, y);
  y += 6;
  doc.setDrawColor(210);
  doc.line(MARGIN, y, A4.w - MARGIN, y);
  y += 18;

  const s = snapshot.summary;
  const type = s.payment_type_used as PaymentType | null;
  const summaryRows: [string, string][] = [
    [tr("Total de horas"), formatMinutes(s.worked_minutes)],
    [tr("Dias com registo"), String(s.paid_days ?? 0)],
    [tr("Tipo de pagamento"), payLabel(s.payment_type_used, tr)],
  ];
  if (type === "hourly") {
    summaryRows.push([tr("Valor hora aplicado"), money(s.rate_used, s.currency)]);
    summaryRows.push([tr("Total do mês"), money(s.calculated_amount, s.currency)]);
  } else if (type === "daily") {
    summaryRows.push([tr("Valor dia aplicado"), money(s.rate_used, s.currency)]);
    summaryRows.push([tr("Total do mês"), money(s.calculated_amount, s.currency)]);
  } else if (type === "monthly") {
    summaryRows.push([
      tr("Remuneração mensal"),
      money(s.monthly_amount ?? s.rate_used, s.currency),
    ]);
  } else if (s.calculated_amount != null) {
    summaryRows.push([tr("Total do mês"), money(s.calculated_amount, s.currency)]);
  }
  // 10/11/2026: com mais de um cliente/forma, mostra a composição por cliente.
  const byClient = s.by_client ?? [];
  if (byClient.length > 1) {
    for (const c of byClient) {
      const name = c.client_name.length > 26 ? `${c.client_name.slice(0, 25)}…` : c.client_name;
      summaryRows.push([
        `· ${name}`,
        `${payLabel(c.pay_model, tr)} · ${formatMinutes(c.minutes)} · ${money(c.amount, s.currency)}`,
      ]);
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const [k, v] of summaryRows) {
    if (y > A4.h - 60) newPage(false);
    doc.setTextColor(120);
    doc.text(`${k}:`, MARGIN, y);
    doc.setTextColor(20);
    doc.text(v, MARGIN + 180, y);
    y += 15;
  }

  // ---------- Assinaturas ----------
  if (y > A4.h - 160) newPage(false);
  y = Math.max(y + 30, A4.h - 150);
  const colW = (contentW - 30) / 2;

  if (sigImg) {
    try {
      const fit = fitInBox(sigImg.width, sigImg.height, 170, 44);
      doc.addImage(sigImg.dataUrl, "PNG", MARGIN + 8, y - 2 - fit.h, fit.w, fit.h);
    } catch {
      /* assinatura inválida: mantém linha em branco */
    }
  }
  doc.setDrawColor(120);
  doc.line(MARGIN, y, MARGIN + colW, y);
  doc.line(MARGIN + colW + 30, y, A4.w - MARGIN, y);
  y += 13;
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(tr("Assinatura do Colaborador"), MARGIN, y);
  doc.text(tr("Assinatura do Responsável / Carimbo"), MARGIN + colW + 30, y);
  y += 22;

  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(
    `${tr("Gerado em")} ${new Date(snapshot.generated_at).toLocaleString(locale)}${
      opts.versionLabel ? ` · ${versionText(opts.versionLabel, tr)}` : ""
    } · OmniBiz Suite`,
    MARGIN,
    y,
  );

  // Numeração de páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(tr("Página {{i}} de {{total}}", { i, total }), A4.w - MARGIN, A4.h - 24, {
      align: "right",
    });
  }
  void page;

  return new Uint8Array(doc.output("arraybuffer"));
}

/** Junta vários PDFs num único documento (impressão/download em lote). */
export async function mergePdfs(files: (Uint8Array | ArrayBuffer)[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(f as ArrayBuffer);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return await out.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function printBytes(bytes: Uint8Array) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) {
    w.addEventListener("load", () => w.print(), { once: true });
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
