export interface SupportErrorDetails {
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getSupportErrorDetails(error: unknown): SupportErrorDetails {
  if (error instanceof Error) {
    const source = error as Error & { code?: unknown; details?: unknown; hint?: unknown };
    return {
      code: readString(source.code),
      message: readString(source.message) ?? "Falha inesperada no serviço de suporte.",
      details: readString(source.details),
      hint: readString(source.hint),
    };
  }

  if (error && typeof error === "object") {
    const source = error as Record<string, unknown>;
    return {
      code: readString(source.code),
      message:
        readString(source.message) ??
        readString(source.error_description) ??
        readString(source.error) ??
        "Falha inesperada no serviço de suporte.",
      details: readString(source.details),
      hint: readString(source.hint),
    };
  }

  return {
    code: null,
    message: readString(error) ?? "Falha inesperada no serviço de suporte.",
    details: null,
    hint: null,
  };
}

export function getSupportErrorMessage(error: unknown): string {
  const details = getSupportErrorDetails(error);
  const raw = [details.message, details.details, details.hint].filter(Boolean).join(" ");

  if (details.code === "42501" || /not_authorized|permission denied/i.test(raw)) {
    return "Não tem permissão para criar uma solicitação nesta empresa.";
  }
  if (/destination_required/i.test(raw)) {
    return "Selecione um destino válido para a solicitação.";
  }
  if (/rate_limit_exceeded/i.test(raw)) {
    return "O limite diário de solicitações foi atingido. Tente novamente mais tarde.";
  }
  if (details.code === "PGRST202" || /schema cache|could not find the function/i.test(raw)) {
    return "O serviço de criação de solicitações está a ser atualizado. Recarregue a página e tente novamente.";
  }
  if (details.code === "23503") {
    return "Não foi possível concluir a solicitação devido a uma referência interna inválida.";
  }

  return details.message;
}
