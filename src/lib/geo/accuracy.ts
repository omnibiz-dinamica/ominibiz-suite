/**
 * OmniBiz — classifyAccuracy (v1.0)
 *
 * Fonte única para classificação visual de precisão GPS.
 * Nenhum outro componente deve reimplementar esta lógica.
 *
 * Faixas (metros):
 *  - 🟢 excellent : 0–15
 *  - 🟡 good      : 15–40
 *  - 🟠 low       : 40–80
 *  - 🔴 very_low  : > 80  ou desconhecida
 */

export type AccuracyLevel = "excellent" | "good" | "low" | "very_low";

export interface AccuracyClassification {
  level: AccuracyLevel;
  icon: "🟢" | "🟡" | "🟠" | "🔴";
  /** Semantic token — mapeia para classes Tailwind via consumidor. */
  color: "success" | "warning" | "amber" | "destructive";
  label: string;
  description: string;
  /** Valor real reportado pelo dispositivo, em metros. `null` = desconhecido. */
  meters: number | null;
}

export function classifyAccuracy(meters: number | null | undefined): AccuracyClassification {
  const m = typeof meters === "number" && Number.isFinite(meters) ? meters : null;

  if (m === null) {
    return {
      level: "very_low",
      icon: "🔴",
      color: "destructive",
      label: "Muito baixa",
      description: "Precisão desconhecida — não confie na posição.",
      meters: null,
    };
  }
  if (m <= 15) {
    return {
      level: "excellent",
      icon: "🟢",
      color: "success",
      label: "Excelente",
      description: `Precisão de ${Math.round(m)} m — ideal para validar o local.`,
      meters: m,
    };
  }
  if (m <= 40) {
    return {
      level: "good",
      icon: "🟡",
      color: "warning",
      label: "Boa",
      description: `Precisão de ${Math.round(m)} m — adequada para a maioria dos casos.`,
      meters: m,
    };
  }
  if (m <= 80) {
    return {
      level: "low",
      icon: "🟠",
      color: "amber",
      label: "Baixa",
      description: `Precisão de ${Math.round(m)} m — resultado pode ficar fora do raio.`,
      meters: m,
    };
  }
  return {
    level: "very_low",
    icon: "🔴",
    color: "destructive",
    label: "Muito baixa",
    description: `Precisão de ${Math.round(m)} m — considere tentar novamente.`,
    meters: m,
  };
}