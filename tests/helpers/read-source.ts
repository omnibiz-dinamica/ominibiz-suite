/**
 * 22/11/2026 — Lê um arquivo do código como "texto do ecrã": desfaz os
 * envoltórios de tradução tr("…") para os testes que procuram o texto exato
 * continuarem a validar o mesmo conteúdo (o português é a chave).
 *   {tr("Texto")}  → Texto        (texto JSX)
 *   attr={tr("X")} → attr="X"     (placeholder, title, aria-label…)
 *   tr("X")        → "X"          (toasts, erros, expressões)
 */
import { readFileSync, type PathOrFileDescriptor } from "node:fs";

const STR = String.raw`"(?:[^"\\]|\\.)*"`;

export function stripTr(src: string): string {
  return src
    .replace(new RegExp(String.raw`(\s[\w-]+)=\{tr\((${STR})\)\}`, "g"), "$1=$2")
    .replace(new RegExp(String.raw`\{tr\((${STR})\)\}`, "g"), (_, s: string) => JSON.parse(s) as string)
    .replace(new RegExp(String.raw`\btr\((${STR})\)`, "g"), "$1");
}

export function readSource(path: PathOrFileDescriptor | URL, _enc?: unknown): string {
  return stripTr(readFileSync(path as PathOrFileDescriptor, "utf8"));
}
