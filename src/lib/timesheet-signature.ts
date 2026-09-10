/**
 * OmniBiz · Assinatura e Visto da Folha de Ponto (ADR-059).
 *
 * Módulo PURAMENTE documental. Não calcula horas, pausas, totais nem
 * remuneração — apenas responde:
 *   1. este documento está validado/assinado pelo próprio funcionário?
 *   2. a assinatura histórica desta versão pode ser renderizada?
 *   3. o "visto" da linha deve aparecer?
 *
 * A regra canónica do visto é: quando a VERSÃO está assinada pelo funcionário,
 * todas as linhas daquele snapshot estão vistas (o funcionário validou o
 * documento inteiro). Confirmação dia-a-dia continua válida como visto próprio.
 */

export type VistoDay = { confirmed_at?: string | null };

export type SignedContext = {
  /** `signed_at` da versão (ou do período) — null quando não validada. */
  signedAt?: string | null;
};

/** Documento validado (assinado pelo funcionário) — base do visto derivado. */
export function isVersionSigned(ctx: SignedContext): boolean {
  return !!ctx.signedAt;
}

/** Visto da linha: confirmação explícita do dia OU versão validada. */
export function isDayVisto(day: VistoDay, ctx: SignedContext): boolean {
  return !!day.confirmed_at || isVersionSigned(ctx);
}

export type SignatureBackfillInput = {
  /** Assinatura já gravada no snapshot da versão (histórica). */
  snapshotSignatureUrl?: string | null;
  /** Assinatura atualmente cadastrada no perfil. */
  profileSignatureUrl?: string | null;
  /** Momento em que o ficheiro da assinatura passou a existir. */
  signatureCreatedAt?: string | null;
  /** Momento da validação da versão. */
  validatedAt?: string | null;
  /** Quem validou. */
  validatedBy?: string | null;
  /** Funcionário dono da folha. */
  employeeId?: string | null;
};

export type SignatureClassification =
  | "A_SIGNATURE_PRESENT"
  | "B_SAFE_BACKFILL"
  | "C_MANUAL_REVIEW"
  | "D_INCONSISTENT";

/**
 * Espelha exatamente `public.timesheet_signature_audit` (fonte canónica em SQL).
 * Mantido em TS apenas para regressão e para explicar o estado na interface.
 */
export function classifySignatureBackfill(input: SignatureBackfillInput): SignatureClassification {
  if (input.snapshotSignatureUrl) return "A_SIGNATURE_PRESENT";
  if (!input.validatedAt) return "C_MANUAL_REVIEW";
  if (!input.validatedBy || !input.employeeId || input.validatedBy !== input.employeeId) {
    return "D_INCONSISTENT";
  }
  if (!input.profileSignatureUrl || !input.signatureCreatedAt) return "C_MANUAL_REVIEW";
  return new Date(input.signatureCreatedAt).getTime() <= new Date(input.validatedAt).getTime()
    ? "B_SAFE_BACKFILL"
    : "C_MANUAL_REVIEW";
}

/**
 * Aviso mostrado ao funcionário/gestor quando a versão está validada mas não
 * tem assinatura histórica associada — nunca inventamos a assinatura atual.
 */
export function signatureNotice(opts: {
  signedAt?: string | null;
  snapshotSignatureUrl?: string | null;
}): string | null {
  if (!opts.signedAt) return null;
  if (opts.snapshotSignatureUrl) return null;
  return "Documento validado pelo funcionário, sem assinatura gráfica registada nesta versão (revisão manual).";
}
