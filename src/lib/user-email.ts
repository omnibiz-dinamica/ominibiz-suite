import { supabase } from "@/integrations/supabase/client";
import { normalizeUserEmail } from "@/lib/user-email-security";

async function authenticatedPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirada. Entre novamente.");

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Não foi possível concluir a operação.");
  }

  return payload;
}

export async function submitEmailChangeRequest(input: {
  companyId: string;
  email: string;
  reason: string;
}) {
  return authenticatedPost<{ id: string; status: string }>("/api/users/email-change-requests", {
    companyId: input.companyId,
    email: normalizeUserEmail(input.email),
    reason: input.reason.trim(),
  });
}

export async function decideEmailChangeRequest(input: {
  decision: "approve" | "reject";
  decisionReason?: string;
  requestId: string;
}) {
  return authenticatedPost<{ changed: boolean; email?: string; status: string }>(
    "/api/admin/users/email",
    {
      decision: input.decision,
      decisionReason: input.decisionReason?.trim() || undefined,
      requestId: input.requestId,
    },
  );
}
