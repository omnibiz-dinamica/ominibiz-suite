export type CountryCode = "PT" | "BR" | "ES";

export const COUNTRIES: { code: CountryCode; label: string; currency: string; language: string; timezone: string }[] = [
  { code: "PT", label: "Portugal", currency: "EUR", language: "pt-PT", timezone: "Europe/Lisbon" },
  { code: "BR", label: "Brasil", currency: "BRL", language: "pt-BR", timezone: "America/Sao_Paulo" },
  { code: "ES", label: "Espanha", currency: "EUR", language: "es-ES", timezone: "Europe/Madrid" },
];

export function countryDefaults(code: CountryCode) {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}