/**
 * OmniBiz · Anexos da ficha do funcionário para ler/assinar.
 *
 * - O gestor marca cada anexo: "funcionário pode ver" e "só visualizar" ou
 *   "assinar" (assinar só em PDF; o banco também recusa).
 * - Lido / assinado só mudam pelas RPCs `employee_attachment_mark_viewed` e
 *   `employee_attachment_sign` (validam dono, visibilidade e caminho).
 * - A assinatura é colocada no PDF no sítio de "Assinatura" / linha ____;
 *   sem isso, no fim da última página. O original nunca é alterado: grava-se
 *   uma cópia assinada na pasta do funcionário.
 */
import { supabase } from "@/integrations/supabase/client";

export type AttachmentAction = "view" | "sign";
export type AttachmentStatus = "pending" | "viewed" | "signed";

export type EmployeeAttachment = {
  id: string;
  profile_id: string;
  company_id: string;
  category: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes?: number | null;
  uploaded_at: string;
  employee_visible?: boolean | null;
  employee_action?: AttachmentAction | null;
  employee_status?: AttachmentStatus | null;
  viewed_at?: string | null;
  signed_at?: string | null;
  signed_storage_path?: string | null;
};

export const ATTACH_CATEGORIES = [
  { v: "cc", l: "Cartão de Cidadão" },
  { v: "tr", l: "Título de Residência" },
  { v: "passport", l: "Passaporte" },
  { v: "driver_license", l: "Carta de Condução" },
  { v: "a1", l: "A1" },
  { v: "work_contract", l: "Contrato de Trabalho" },
  { v: "health_card", l: "Cartão Saúde" },
  { v: "other", l: "Outro" },
];

export function labelForCategory(v: string): string {
  return ATTACH_CATEGORIES.find((c) => c.v === v)?.l ?? v;
}

export function isPdfAttachment(a: { mime_type?: string | null; file_name: string }): boolean {
  return a.mime_type === "application/pdf" || /\.pdf$/i.test(a.file_name);
}

export function isImageAttachment(a: { mime_type?: string | null; file_name: string }): boolean {
  return (a.mime_type ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.file_name);
}

/** Texto do estado do anexo para o gestor. */
export function attachmentStatusLabel(a: EmployeeAttachment, locale = "pt-PT"): string {
  if (!a.employee_visible) {
    return a.employee_status === "signed" && a.signed_at
      ? `Assinado em ${fmt(a.signed_at, locale)} · oculto ao funcionário`
      : "Só gestão";
  }
  if (a.employee_status === "signed" && a.signed_at)
    return `Assinado em ${fmt(a.signed_at, locale)}`;
  if (a.employee_status === "viewed" && a.viewed_at) return `Lido em ${fmt(a.viewed_at, locale)}`;
  return a.employee_action === "sign" ? "Aguarda assinatura" : "Aguarda leitura";
}

function fmt(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

/** Pendentes do próprio funcionário (a RLS já só devolve os marcados). */
export function isPendingForEmployee(a: EmployeeAttachment, userId: string): boolean {
  return (
    a.profile_id === userId &&
    !!a.employee_visible &&
    (a.employee_status ?? "pending") === "pending"
  );
}

export function attachmentBadgeClass(a: EmployeeAttachment): string {
  if (!a.employee_visible) return "bg-muted text-muted-foreground";
  if (a.employee_status === "signed")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  if (a.employee_status === "viewed")
    return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
  return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
}

/** Distância ao fundo (px) que conta como "chegou ao fim". */
export const END_TOLERANCE = 24;
export function reachedEnd(el: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - END_TOLERANCE;
}

/* ------------------------------------------------------------------ */
/* Local da assinatura no PDF                                           */
/* ------------------------------------------------------------------ */

/** Item de texto em coordenadas PDF (y a partir de baixo, linha de base). */
export type PdfTextItem = { page: number; str: string; x: number; y: number; w: number; h: number };
export type PdfPageSize = { page: number; width: number; height: number };
export type SignaturePlacement = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  found: "line" | "label" | "underline" | "fallback";
};

const LABEL = /\b(assinatura|assinado|signature|ass\.)/i;
const UNDERLINE = /_{5,}|\.{12,}/;

/**
 * Escolhe onde pôr a assinatura. Usa a ÚLTIMA ocorrência (normalmente a do
 * funcionário fica no fim): linha ____ junto de "Assinatura" > só a palavra
 * > só a linha > fim da última página.
 */
export function chooseSignaturePlacement(
  items: PdfTextItem[],
  pages: PdfPageSize[],
  aspect: number,
): SignaturePlacement {
  const W = 150;
  const size = (maxW: number) => {
    const width = Math.max(80, Math.min(W, maxW));
    const height = Math.min(55, width / Math.max(aspect, 0.5));
    return { width, height };
  };
  const order = (a: PdfTextItem, b: PdfTextItem) => a.page - b.page || b.y - a.y || a.x - b.x;
  const sorted = [...items].filter((i) => i.str.trim()).sort(order);
  const labels = sorted.filter((i) => LABEL.test(i.str));
  const lines = sorted.filter((i) => UNDERLINE.test(i.str));
  const pageOf = (p: number) => pages.find((pg) => pg.page === p) ?? pages[pages.length - 1];

  const label = labels[labels.length - 1];
  if (label) {
    // linha na mesma altura (à direita), por cima da palavra ou por baixo dela
    const near = lines
      .filter((l) => l.page === label.page)
      .map((l) => {
        const dy = l.y - label.y;
        const sameRow = Math.abs(dy) < 6 && l.x >= label.x;
        const above = dy > 0 && dy <= 45;
        const below = dy < 0 && dy >= -45;
        return { l, ok: sameRow || above || below, d: Math.abs(dy) + (sameRow ? 0 : 10) };
      })
      .filter((c) => c.ok)
      .sort((a, b) => a.d - b.d)[0];
    if (near) {
      const s = size(near.l.w);
      return { page: near.l.page, x: near.l.x, y: near.l.y + 2, ...s, found: "line" };
    }
    const pg = pageOf(label.page);
    const right = label.x + label.w + 8;
    const s = size(pg.width - right - 24);
    if (pg.width - right - 24 >= 80) {
      return { page: label.page, x: right, y: Math.max(8, label.y - 4), ...s, found: "label" };
    }
    const s2 = size(W);
    return {
      page: label.page,
      x: Math.min(label.x, pg.width - s2.width - 24),
      y: Math.min(pg.height - s2.height - 8, label.y + label.h + 4),
      ...s2,
      found: "label",
    };
  }
  const line = lines[lines.length - 1];
  if (line) {
    const s = size(line.w);
    return { page: line.page, x: line.x, y: line.y + 2, ...s, found: "underline" };
  }
  const last = pages[pages.length - 1] ?? { page: 1, width: 595, height: 842 };
  const s = size(W);
  return { page: last.page, x: last.width - s.width - 48, y: 56, ...s, found: "fallback" };
}

/** Lê o texto e o tamanho das páginas com pdfjs (só no navegador). */
export async function readPdfText(
  bytes: Uint8Array,
): Promise<{ items: PdfTextItem[]; pages: PdfPageSize[] }> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  (pdfjs as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
    workerSrc;
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const items: PdfTextItem[] = [];
  const pages: PdfPageSize[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ page: p, width: vp.width, height: vp.height });
    const content = await page.getTextContent();
    for (const it of content.items as Array<{
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
    }>) {
      if (!it.str || !it.transform) continue;
      items.push({
        page: p,
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width ?? 0,
        h: it.height ?? Math.abs(it.transform[3] ?? 10),
      });
    }
  }
  await doc.destroy();
  return { items, pages };
}

/* ------------------------------------------------------------------ */
/* 18/11/2026 — local escolhido pelo funcionário e visto em cada página */
/* ------------------------------------------------------------------ */

/**
 * Caixa da assinatura centrada no ponto tocado (coordenadas PDF: y a partir
 * de baixo), sempre dentro da página. Usado quando o PDF é digitalizado (sem
 * texto) ou quando o funcionário quer mudar o local sugerido.
 */
export function placementAtPoint(
  page: PdfPageSize,
  x: number,
  y: number,
  aspect: number,
): SignaturePlacement {
  const a = Math.max(aspect, 0.5);
  const height = Math.min(55, 150 / a);
  const width = height * a;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  return {
    page: page.page,
    x: clamp(x - width / 2, 4, page.width - width - 4),
    y: clamp(y - height / 2, 4, page.height - height - 4),
    width,
    height,
    found: "label",
  };
}

export type VistoPlacement = { page: number; x: number; y: number; width: number; height: number };

const overlaps = (a: VistoPlacement, b: SignaturePlacement) =>
  a.page === b.page &&
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/**
 * Visto (rubrica) em TODAS as páginas, no canto inferior direito (margem).
 * Se na página da assinatura bater na caixa da assinatura, vai para o canto
 * inferior esquerdo.
 */
export function vistoPlacements(
  pages: PdfPageSize[],
  signature: SignaturePlacement,
  aspect: number,
): VistoPlacement[] {
  const a = Math.max(aspect, 0.3);
  const height = Math.min(28, 56 / a);
  const width = height * a; // mantém a proporção do visto (nunca deformado)
  return pages.map((pg) => {
    const right: VistoPlacement = { page: pg.page, x: pg.width - width - 20, y: 14, width, height };
    if (!overlaps(right, signature)) return right;
    return { ...right, x: 20 };
  });
}

/**
 * Desenha a assinatura (PNG) e a linha "Assinado digitalmente…" numa cópia do
 * PDF e, se vier, o visto em cada página.
 */
export async function stampSignature(
  pdfBytes: Uint8Array,
  png: Uint8Array,
  placement: SignaturePlacement,
  signerLine: string,
  visto?: { png: Uint8Array; placements: VistoPlacement[] },
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  let pdf;
  try {
    pdf = await PDFDocument.load(pdfBytes);
  } catch {
    throw new Error(
      "Não foi possível abrir este PDF para assinar (protegido ou danificado). Peça ao gestor outra versão.",
    );
  }
  const page = pdf.getPages()[placement.page - 1] ?? pdf.getPages()[pdf.getPageCount() - 1];
  const img = await pdf.embedPng(png);
  page.drawImage(img, {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
  });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(signerLine, {
    x: placement.x,
    y: Math.max(4, placement.y - 12),
    size: 6,
    font,
    color: rgb(0.3, 0.3, 0.3),
    maxWidth: Math.max(placement.width, 200),
  });
  if (visto && visto.placements.length > 0) {
    const vImg = await pdf.embedPng(visto.png);
    const all = pdf.getPages();
    for (const v of visto.placements) {
      const pg = all[v.page - 1];
      if (!pg) continue;
      pg.drawImage(vImg, { x: v.x, y: v.y, width: v.width, height: v.height });
    }
  }
  return pdf.save();
}

/** Proporção (largura/altura) de um PNG pelos bytes do cabeçalho IHDR. */
export function pngAspect(png: Uint8Array): number {
  if (png.length < 24) return 3;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const w = dv.getUint32(16);
  const h = dv.getUint32(20);
  return w > 0 && h > 0 ? w / h : 3;
}

export function signedCopyPath(
  a: Pick<EmployeeAttachment, "company_id" | "profile_id" | "file_name">,
  now = Date.now(),
) {
  const base =
    a.file_name
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80) || "documento";
  return `${a.company_id}/${a.profile_id}/${now}-assinado-${base}.pdf`;
}

/* ------------------------------------------------------------------ */
/* Chamadas ao banco                                                    */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args);

export async function markAttachmentViewed(id: string) {
  const { data, error } = await rpc("employee_attachment_mark_viewed", { _attachment_id: id });
  if (error) throw new Error(error.message ?? "Não foi possível marcar como lido.");
  return data as { status: AttachmentStatus };
}

export async function saveSignedAttachment(
  id: string,
  signedPath: string,
  source: "profile" | "drawn",
  placement: SignaturePlacement,
) {
  const { data, error } = await rpc("employee_attachment_sign", {
    _attachment_id: id,
    _signed_storage_path: signedPath,
    _signature_source: source,
    _placement: placement,
  });
  if (error) throw new Error(error.message ?? "Não foi possível gravar a assinatura.");
  return data as { status: AttachmentStatus; already?: boolean };
}

export async function downloadStorageBytes(bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message ?? "Não foi possível abrir o arquivo.");
  return new Uint8Array(await data.arrayBuffer());
}
