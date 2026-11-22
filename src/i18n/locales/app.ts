/**
 * 22/11/2026 — Traduções das telas do funcionário (fase 1). Chaves = texto
 * português exato que aparece no ecrã; sem tradução, mostra o português.
 * Gerado a partir de src/i18n/locales/app.json (en, nl-BE, fr-BE).
 */
import table from "./app.json";

type Row = [en: string, nl: string, fr: string];
const rows = table as unknown as Record<string, Row>;
const col = (i: 0 | 1 | 2) =>
  Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v[i]])) as Record<string, string>;

export const enApp: Record<string, string> = col(0);
export const nlApp: Record<string, string> = col(1);
export const frApp: Record<string, string> = col(2);
