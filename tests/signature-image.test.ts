import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { fitInBox, removeBackgroundPixels } from "../src/lib/signature-image";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/** Imagem w×h com fundo cinzento ruidoso e um traço escuro horizontal no meio. */
function scanned(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const ink = y >= 9 && y <= 11 && x >= 5 && x <= 34;
      const v = ink ? 20 : 170 + ((x * 7 + y * 13) % 21) - 10; // fundo 160–180
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

test("assinatura digitalizada: o fundo cinzento fica transparente e o traço fica", () => {
  const w = 40, h = 20;
  const data = scanned(w, h);
  const box = removeBackgroundPixels(data, w, h);
  const alpha = (x: number, y: number) => data[(y * w + x) * 4 + 3];
  expect(alpha(0, 0)).toBe(0);
  expect(alpha(20, 3)).toBe(0);
  expect(alpha(20, 10)).toBe(255);
  // recortado ao traço (com 2 px de margem)
  expect(box).toEqual({ x: 3, y: 7, w: 34, h: 7 });
});

test("imagem já transparente fica igual (só recorte)", () => {
  const w = 10, h = 10;
  const data = new Uint8ClampedArray(w * h * 4);
  const i = (5 * w + 5) * 4;
  data[i] = data[i + 1] = data[i + 2] = 200; // traço claro: não pode desaparecer
  data[i + 3] = 255;
  const box = removeBackgroundPixels(data, w, h);
  expect(data[i + 3]).toBe(255);
  expect(box).toEqual({ x: 3, y: 3, w: 5, h: 5 });
});

test("imagem sem traço devolve null", () => {
  const w = 8, h = 8;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  expect(removeBackgroundPixels(data, w, h)).toBeNull();
});

test("encaixe mantém a proporção", () => {
  expect(fitInBox(400, 100, 170, 44)).toEqual({ w: 170, h: 42.5 });
  expect(fitInBox(100, 100, 54, 15)).toEqual({ w: 15, h: 15 });
});

test("PDF usa o visto cadastrado em cada linha e a assinatura sem fundo", () => {
  const pdf = read("../src/lib/timesheet-pdf.ts");
  expect(pdf).toMatch(/cleanSignatureImage\(raw\)/);
  expect(pdf).toMatch(/doc\.addImage\(initialsImg\.dataUrl, "PNG"/);
  expect(pdf).toMatch(/doc\.addImage\(sigImg\.dataUrl, "PNG"/);
  // sem documento validado não há assinatura nem visto gráfico
  expect(pdf).toMatch(/opts\.embedSignatures === false \|\| !opts\.signedAt\s+\? null\s+: opts\.initialsUrl/);
  expect(read("../src/lib/timesheet-batch.ts")).toMatch(/initialsUrl,\n\s+\}\);/);
  // o envio (só pelo próprio funcionário, no Perfil) remove o fundo
  expect(read("../src/components/perfil/SignatureVistoCard.tsx")).toMatch(/cleanSignatureFile\(file\)/);
  // a ficha do gestor já não mostra nem envia assinatura/visto
  expect(read("../src/components/equipe/EmployeeEditor.tsx")).not.toMatch(/employee-signatures/);
});
