import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

export type PlaceholderPlacement = {
  page: number; // 1-based
  x: number; // points from left
  y: number; // points from bottom (pdf-lib default)
  size?: number;
  bold?: boolean;
  color?: [number, number, number]; // 0-1
  maxWidth?: number;
  type?: "text" | "image"; // image = signature PNG/JPG data URL
  width?: number; // for image
  height?: number; // for image
};

export type PlaceholderMap = Record<string, PlaceholderPlacement>;

export type FillVars = Record<string, string | undefined>;

export async function fillPdfTemplate(
  templateBytes: ArrayBuffer | Uint8Array,
  map: PlaceholderMap,
  vars: FillVars,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  for (const [key, place] of Object.entries(map)) {
    const value = vars[key];
    if (value === undefined || value === null || value === "") continue;
    const pageIdx = Math.max(1, place.page) - 1;
    if (pageIdx >= pages.length) continue;
    const page = pages[pageIdx];

    if (place.type === "image") {
      try {
        const b64 = String(value).split(",").pop() ?? "";
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const isPng = String(value).startsWith("data:image/png");
        const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        page.drawImage(img, {
          x: place.x,
          y: place.y,
          width: place.width ?? 160,
          height: place.height ?? 60,
        });
      } catch {
        /* ignore broken image */
      }
      continue;
    }

    const size = place.size ?? 11;
    const useFont = place.bold ? fontBold : font;
    const [r, g, b] = place.color ?? [0, 0, 0];
    const text = String(value);
    // simple wrap if maxWidth given
    if (place.maxWidth) {
      const words = text.split(/\s+/);
      let line = "";
      let y = place.y;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        const width = useFont.widthOfTextAtSize(test, size);
        if (width > place.maxWidth && line) {
          page.drawText(line, { x: place.x, y, size, font: useFont, color: rgb(r, g, b) });
          y -= size * 1.25;
          line = w;
        } else {
          line = test;
        }
      }
      if (line) page.drawText(line, { x: place.x, y, size, font: useFont, color: rgb(r, g, b) });
    } else {
      page.drawText(text, { x: place.x, y: place.y, size, font: useFont, color: rgb(r, g, b) });
    }
  }

  return await pdf.save();
}

export async function downloadTemplatePdf(pdfPath: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from("contracts").download(pdfPath);
  if (error || !data) throw error ?? new Error("Falha ao carregar template");
  return await data.arrayBuffer();
}

export async function uploadGeneratedPdf(contractId: string, bytes: Uint8Array): Promise<string> {
  const path = `generated/${contractId}-${Date.now()}.pdf`;
  const { error } = await supabase.storage.from("contracts").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return path;
}