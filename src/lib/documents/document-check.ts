/**
 * 26/11/2026 — Anexos: vários arquivos de uma vez, tipo sugerido por arquivo e
 * conferência do número lido no documento com o registado na ficha.
 * Funções puras (testadas) + preparação das imagens no navegador.
 */
import type { DocumentReading } from "./analyze-document.functions";

export type DocProfile = {
  full_name?: string | null;
  main_doc_type?: string | null;
  main_doc_number?: string | null;
  main_doc_expires_at?: string | null;
  passport_number?: string | null;
  passport_expires_at?: string | null;
  driver_license_number?: string | null;
  driver_license_expires_at?: string | null;
  a1_number?: string | null;
  a1_expires_at?: string | null;
  health_card_number?: string | null;
  health_card_expires_at?: string | null;
};

/** Categorias que têm número na ficha e podem ser analisadas. */
export const ANALYZABLE_CATEGORIES = ["cc", "tr", "passport", "driver_license", "a1", "health_card"] as const;
export type AnalyzableCategory = (typeof ANALYZABLE_CATEGORIES)[number];

export function isAnalyzable(category: string): category is AnalyzableCategory {
  return (ANALYZABLE_CATEGORIES as readonly string[]).includes(category);
}

/** Campos da ficha de cada tipo de documento. */
export function profileFieldsFor(category: AnalyzableCategory): {
  number: keyof DocProfile;
  expiry: keyof DocProfile;
  mainDocType?: "CC" | "TR";
} {
  switch (category) {
    case "cc":
      return { number: "main_doc_number", expiry: "main_doc_expires_at", mainDocType: "CC" };
    case "tr":
      return { number: "main_doc_number", expiry: "main_doc_expires_at", mainDocType: "TR" };
    case "passport":
      return { number: "passport_number", expiry: "passport_expires_at" };
    case "driver_license":
      return { number: "driver_license_number", expiry: "driver_license_expires_at" };
    case "a1":
      return { number: "a1_number", expiry: "a1_expires_at" };
    case "health_card":
      return { number: "health_card_number", expiry: "health_card_expires_at" };
  }
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Tipo sugerido pelo nome do arquivo (o gestor pode mudar). */
export function guessCategoryFromName(fileName: string): string | null {
  const n = strip(fileName).replace(/[_.-]+/g, " ");
  const has = (re: RegExp) => re.test(n);
  if (has(/titulo de residencia|residencia|residence|verblijf|sejour|\btr\b|\bvk\b/)) return "tr";
  if (has(/cartao de cidadao|cidadao|\bcc\b|identit|\bid card\b|\beid\b|\bbi\b/)) return "cc";
  if (has(/passaporte|passport|paspoort|passeport/)) return "passport";
  if (has(/carta de conducao|conducao|rijbewijs|permis|driver|driving/)) return "driver_license";
  if (has(/\ba1\b/)) return "a1";
  if (has(/contrato|contract|contrat/)) return "work_contract";
  if (has(/saude|health|ehic|mutuelle|ziekenfonds|sis\b/)) return "health_card";
  return null;
}

/** Só letras e algarismos, em maiúsculas: "B 123-4567 89" → "B123456789". */
export function normalizeDocNumber(v: string | null | undefined): string {
  return (v ?? "").normalize("NFD").replace(/[^0-9a-z]/gi, "").toUpperCase();
}

function nameTokens(v: string | null | undefined): Set<string> {
  return new Set(
    strip(v ?? "")
      .split(/[^a-z]+/)
      .filter((t) => t.length > 2),
  );
}

/** O nome do documento parece ser desta pessoa? (≥ 2 nomes em comum, ou todos se só tiver 1). */
export function nameLooksLikeSamePerson(docName: string | null, profileName: string | null | undefined): boolean | null {
  if (!docName || !profileName) return null;
  const a = nameTokens(docName);
  const b = nameTokens(profileName);
  if (a.size === 0 || b.size === 0) return null;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common >= Math.min(2, a.size, b.size);
}

export type NumberCheck =
  | { kind: "same" }
  | { kind: "missing_in_profile"; documentNumber: string }
  | { kind: "different"; profileNumber: string; documentNumber: string }
  | { kind: "not_read" };

export type DocumentCheck = {
  number: NumberCheck;
  expiry: { profile: string | null; document: string | null; differs: boolean; expired: boolean };
  name: boolean | null; // null = não deu para comparar
  typeMismatch: boolean; // a IA leu outro tipo do que o escolhido
  mainDocTypeDiffers: boolean; // ex.: ficha diz CC e o documento é TR
  proposedPatch: Record<string, string> | null; // o que "Atualizar ficha" grava
};

export function checkAgainstProfile(
  category: AnalyzableCategory,
  reading: DocumentReading,
  profile: DocProfile,
  today: string = new Date().toISOString().slice(0, 10),
): DocumentCheck {
  const f = profileFieldsFor(category);
  const profileNumber = (profile[f.number] as string | null | undefined) ?? null;
  const docNumber = reading.document_number;
  let number: NumberCheck;
  if (!docNumber || !normalizeDocNumber(docNumber)) number = { kind: "not_read" };
  else if (!profileNumber || !normalizeDocNumber(profileNumber))
    number = { kind: "missing_in_profile", documentNumber: docNumber };
  else if (normalizeDocNumber(profileNumber) === normalizeDocNumber(docNumber)) number = { kind: "same" };
  else number = { kind: "different", profileNumber, documentNumber: docNumber };

  const profileExpiry = ((profile[f.expiry] as string | null | undefined) ?? null)?.slice(0, 10) ?? null;
  const docExpiry = reading.expiry_date;
  const expiry = {
    profile: profileExpiry,
    document: docExpiry,
    differs: !!docExpiry && docExpiry !== profileExpiry,
    expired: !!docExpiry && docExpiry < today,
  };

  const mainDocTypeDiffers =
    !!f.mainDocType && !!profile.main_doc_type && profile.main_doc_type !== f.mainDocType && number.kind !== "same";

  const patch: Record<string, string> = {};
  if (number.kind === "missing_in_profile" || number.kind === "different") patch[f.number] = docNumber as string;
  if (expiry.differs && docExpiry) patch[f.expiry] = docExpiry;
  if (f.mainDocType && Object.keys(patch).length > 0 && profile.main_doc_type !== f.mainDocType) {
    patch.main_doc_type = f.mainDocType;
  }

  return {
    number,
    expiry,
    name: nameLooksLikeSamePerson(reading.full_name, profile.full_name),
    typeMismatch: !!reading.document_type && reading.document_type !== category,
    mainDocTypeDiffers,
    proposedPatch: Object.keys(patch).length > 0 ? patch : null,
  };
}

/* ---------- Navegador: arquivo → imagens para a análise ---------- */

const MAX_SIDE = 1600;

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function imageFileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível abrir a imagem (use JPG, PNG ou PDF)."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvasToJpeg(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pdfFileToDataUrls(file: File, maxPages = 2): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, MAX_SIDE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
    out.push(await canvasToJpeg(canvas));
  }
  return out;
}

/** Imagens (máx. 2 páginas) para enviar à análise. */
export async function fileToAnalysisImages(file: File): Promise<string[]> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return pdfFileToDataUrls(file);
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    throw new Error("Fotos HEIC do iPhone não podem ser analisadas: tire em JPG ou envie em PDF.");
  }
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error("Só é possível analisar fotos (JPG, PNG) e PDF.");
  }
  return [await imageFileToDataUrl(file)];
}
