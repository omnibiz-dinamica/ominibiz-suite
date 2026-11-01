/**
 * OmniBiz · Assinatura e Visto sem fundo.
 *
 * As imagens de assinatura/visto chegam muitas vezes fotografadas ou
 * digitalizadas (fundo cinzento/branco). Nos documentos devem aparecer sempre
 * só com o traço. Aqui o fundo é removido no browser:
 *   1. a cor do fundo é estimada pela borda da imagem;
 *   2. os píxeis próximos dessa cor ficam transparentes (com transição suave);
 *   3. a imagem é recortada ao traço.
 * Imagens que já têm fundo transparente ficam como estão (só o recorte).
 */

export type CleanImage = { dataUrl: string; width: number; height: number };

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Remove o fundo de uma imagem RGBA (in-place) e devolve o retângulo do traço.
 * Pura — testável sem canvas.
 */
export function removeBackgroundPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  // Amostra da borda (2 píxeis de espessura).
  const border: number[] = [];
  let transparentBorder = 0;
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 16) transparentBorder += 1;
    else border.push(lum(data[i], data[i + 1], data[i + 2]));
  };
  for (let x = 0; x < width; x += 1) {
    for (const y of [0, 1, height - 2, height - 1]) if (y >= 0 && y < height) sample(x, y);
  }
  for (let y = 2; y < height - 2; y += 1) {
    for (const x of [0, 1, width - 2, width - 1]) if (x >= 0 && x < width) sample(x, y);
  }
  const total = border.length + transparentBorder;
  const alreadyTransparent = total > 0 && transparentBorder / total > 0.6;

  if (!alreadyTransparent && border.length > 0) {
    const sorted = [...border].sort((a, b) => a - b);
    const bg = sorted[Math.floor(sorted.length / 2)];
    const mean = border.reduce((s, v) => s + v, 0) / border.length;
    const sd = Math.sqrt(border.reduce((s, v) => s + (v - mean) ** 2, 0) / border.length);
    // Ruído do fundo (papel, foto) alarga a zona que fica transparente.
    const low = Math.min(25 + 2 * sd, 90);
    const high = low + 40;
    for (let i = 0; i < data.length; i += 4) {
      const darkness = bg - lum(data[i], data[i + 1], data[i + 2]);
      let a: number;
      if (darkness <= low) a = 0;
      else if (darkness >= high) a = 1;
      else a = (darkness - low) / (high - low);
      data[i + 3] = Math.round(data[i + 3] * a);
    }
  }

  // Recorte ao traço.
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 2;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(width, maxX + pad + 1) - x, h: Math.min(height, maxY + pad + 1) - y };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Imagem inválida"));
    img.src = src;
  });
}

/** Data URL (PNG/JPEG/…) → PNG sem fundo e recortado. Null se não houver traço. */
export async function cleanSignatureImage(src: string, maxSide = 1200): Promise<CleanImage | null> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  const box = removeBackgroundPixels(pixels.data, w, h);
  if (!box) return null;
  ctx.putImageData(pixels, 0, 0);
  const out = document.createElement("canvas");
  out.width = box.w;
  out.height = box.h;
  out.getContext("2d")?.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return { dataUrl: out.toDataURL("image/png"), width: box.w, height: box.h };
}

/** Ficheiro enviado → PNG sem fundo, pronto a guardar. */
export async function cleanSignatureFile(file: Blob): Promise<Blob> {
  const src = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    fr.readAsDataURL(file);
  });
  const clean = await cleanSignatureImage(src);
  if (!clean) throw new Error("Não foi encontrado traço na imagem. Envie outra imagem.");
  return await (await fetch(clean.dataUrl)).blob();
}

/** Encaixa (w,h) numa caixa mantendo a proporção. */
export function fitInBox(w: number, h: number, boxW: number, boxH: number) {
  const s = Math.min(boxW / w, boxH / h);
  return { w: w * s, h: h * s };
}
