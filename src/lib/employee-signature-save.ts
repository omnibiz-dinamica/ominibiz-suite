/**
 * OmniBiz · guardar assinatura / visto no Perfil (19/11/2026).
 *
 * Mesmo caminho e mesma regra do cartão "Assinatura e Visto" do Perfil:
 * bucket PRIVADO `employee-signatures`, pasta `company_id/user_id/`, e o
 * caminho fica em profiles.signature_url / profiles.initials_url (RLS: o
 * próprio funcionário e a gestão).
 */
import { supabase } from "@/integrations/supabase/client";

export type SignatureKind = "signature" | "initials";

export function signatureStoragePath(
  kind: SignatureKind,
  companyId: string,
  userId: string,
  now = Date.now(),
): string {
  return `${companyId}/${userId}/${kind}-${now}.png`;
}

export function signatureProfilePatch(kind: SignatureKind, path: string | null) {
  return kind === "signature" ? { signature_url: path } : { initials_url: path };
}

/** Guarda o desenho (PNG em data URL) no Perfil e devolve o caminho. */
export async function saveSignatureToProfile(
  kind: SignatureKind,
  companyId: string,
  userId: string,
  dataUrl: string,
): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = signatureStoragePath(kind, companyId, userId);
  const { error } = await supabase.storage
    .from("employee-signatures")
    .upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) throw error;
  const { error: upErr } = await supabase
    .from("profiles")
    .update(signatureProfilePatch(kind, path))
    .eq("id", userId);
  if (upErr) throw upErr;
  return path;
}
