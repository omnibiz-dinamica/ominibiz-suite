/**
 * OmniBiz · Assinatura e Visto da Folha de Ponto (ADR-059).
 *
 * Módulo PURAMENTE documental. Não calcula horas, pausas, totais nem
 * remuneração — apenas responde:
 *   1. este documento está validado/assinado pelo próprio funcionário?
 *   2. qual a assinatura histórica associada a esta versão?
 *   3. o "visto" da linha deve aparecer?
 *
 * Fonte canónica única da assinatura da versão:
 *   `timesheet_period_versions.signature_url` (gravada no momento da assinatura
 *   ou pelo backfill auditado). O snapshot serve apenas como fallback histórico.
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

export type VersionSignatureRow = {
  signature_url?: string | null;
  initials_url?: string | null;
} | null | undefined;

export type SnapshotSignatureSource = {
  employee?: { signature_url?: string | null; initials_url?: string | null };
} | null | undefined;

export type ResolvedSignature = { signatureUrl: string | null; initialsUrl: string | null };

/**
 * Assinatura efetiva do documento. Só existe quando a versão está validada —
 * possuir assinatura cadastrada NUNCA basta para assinar uma folha em aberto.
 * A coluna da versão (snapshot da assinatura) tem prioridade sobre o perfil
 * atual, para que relatórios históricos não mudem quando a assinatura muda.
 */
export function resolveVersionSignature(
  version: VersionSignatureRow,
  snapshot: SnapshotSignatureSource,
  ctx: SignedContext,
): ResolvedSignature {
  if (!isVersionSigned(ctx)) return { signatureUrl: null, initialsUrl: null };
  return {
    signatureUrl: version?.signature_url || snapshot?.employee?.signature_url || null,
    initialsUrl: version?.initials_url || snapshot?.employee?.initials_url || null,
  };
}

export type SignatureBackfillInput = {
  /** Assinatura já associada à versão (histórica). */
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
 *
 * Elegível (B) = versão validada pelo PRÓPRIO funcionário + assinatura
 * cadastrada. A assinatura registada depois da validação continua elegível
 * (o documento é do mesmo funcionário), ficando marcada como `late_signature`
 * na auditoria.
 */
export function classifySignatureBackfill(input: SignatureBackfillInput): SignatureClassification {
  if (input.snapshotSignatureUrl) return "A_SIGNATURE_PRESENT";
  if (!input.validatedAt) return "C_MANUAL_REVIEW";
  if (!input.validatedBy || !input.employeeId || input.validatedBy !== input.employeeId) {
    return "D_INCONSISTENT";
  }
  if (!input.profileSignatureUrl) return "C_MANUAL_REVIEW";
  return "B_SAFE_BACKFILL";
}

/** A assinatura desta versão foi registada depois da validação? (só auditoria) */
export function isLateSignature(input: SignatureBackfillInput): boolean {
  if (!input.validatedAt) return false;
  if (!input.signatureCreatedAt) return true;
  return new Date(input.signatureCreatedAt).getTime() > new Date(input.validatedAt).getTime();
}

/**
 * Aviso mostrado ao funcionário/gestor quando a versão está validada mas não
 * existe assinatura associada nem cadastrada — nunca inventamos assinatura.
 */
export function signatureNotice(opts: {
  signedAt?: string | null;
  snapshotSignatureUrl?: string | null;
}): string | null {
  if (!opts.signedAt) return null;
  if (opts.snapshotSignatureUrl) return null;
  return "Documento validado pelo funcionário, sem assinatura gráfica cadastrada. Cadastre a assinatura no Perfil para que passe a constar nos próximos relatórios.";
}
