/**
 * Telefones do módulo Mensagens em formato E.164 (+351…, +55…, +32…).
 * A mesma regra existe na base de dados (CHECK em msg_contacts.phone).
 */
export const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/;

export type PhoneResult = { ok: true; phone: string | null } | { ok: false; error: string };

/**
 * Normaliza o telefone digitado ou importado:
 *  - remove espaços, hífens, pontos e parênteses;
 *  - "00" no início vira "+" (00351… -> +351…);
 *  - vazio -> sem telefone (permitido);
 *  - sem indicativo do país -> erro (não adivinhamos o país).
 */
export function normalizePhone(raw: string | null | undefined): PhoneResult {
  const compact = (raw ?? "").trim().replace(/[\s\-.()]/g, "");
  if (!compact) return { ok: true, phone: null };
  const withPlus = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  if (!withPlus.startsWith("+")) {
    return { ok: false, error: "Indique o código do país (ex.: +351, +55, +32)." };
  }
  if (!E164_PATTERN.test(withPlus)) {
    return {
      ok: false,
      error: "Telefone inválido. Use o formato internacional, ex.: +351912345678.",
    };
  }
  return { ok: true, phone: withPlus };
}
