import { supabase } from "@/integrations/supabase/client";
import { normalizeUserEmail } from "@/lib/user-email-security";

export async function updateManagedUserEmail(input: {
  companyId: string;
  email: string;
  userId: string;
}): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirada. Entre novamente.");

  const response = await fetch("/api/admin/users/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      companyId: input.companyId,
      email: normalizeUserEmail(input.email),
      userId: input.userId,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    email?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Não foi possível alterar o e-mail.");
  }
  if (!payload.email) throw new Error("O servidor não confirmou o novo e-mail.");

  return payload.email;
}
