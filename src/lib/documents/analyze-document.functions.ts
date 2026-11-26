import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 26/11/2026 — Leitura de documentos de identificação (só a pedido do gestor).
 *
 * O navegador envia 1 a 3 imagens (a foto, ou as páginas do PDF já desenhadas
 * em imagem). Aqui, no servidor:
 *  1. o token do utilizador é validado (requireSupabaseAuth);
 *  2. só a gestão da empresa pode pedir (is_company_manager) e o funcionário
 *     tem de ser da mesma empresa (is_company_member);
 *  3. as imagens vão para o Lovable AI Gateway (Gemini), que devolve só os
 *     campos pedidos em JSON. Nada é gravado aqui: o gestor decide o que fazer.
 * A chave LOVABLE_API_KEY nunca sai do servidor.
 */

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_IMAGES = 3;
const MAX_DATA_URL_CHARS = 7_000_000; // ~5 MB por imagem

export type DocumentReading = {
  document_type: "cc" | "tr" | "passport" | "driver_license" | "a1" | "health_card" | "other" | null;
  document_number: string | null;
  expiry_date: string | null; // YYYY-MM-DD
  full_name: string | null;
  birth_date: string | null; // YYYY-MM-DD
  nationality: string | null;
  issuing_country: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
};

type Input = { companyId: string; profileId: string; images: string[]; categoryHint?: string | null };

function validate(raw: unknown): Input {
  const v = raw as Partial<Input> | null;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!v || typeof v.companyId !== "string" || !uuid.test(v.companyId)) throw new Error("Empresa inválida.");
  if (typeof v.profileId !== "string" || !uuid.test(v.profileId)) throw new Error("Funcionário inválido.");
  if (!Array.isArray(v.images) || v.images.length === 0 || v.images.length > MAX_IMAGES) {
    throw new Error(`Envie de 1 a ${MAX_IMAGES} imagens.`);
  }
  for (const img of v.images) {
    if (typeof img !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(img)) {
      throw new Error("Formato de imagem não suportado.");
    }
    if (img.length > MAX_DATA_URL_CHARS) throw new Error("Imagem demasiado grande.");
  }
  const hint = typeof v.categoryHint === "string" ? v.categoryHint.slice(0, 40) : null;
  return { companyId: v.companyId, profileId: v.profileId, images: v.images, categoryHint: hint };
}

const PROMPT = `You read identity and work documents (Belgium, Portugal, EU and others).
Look at the image(s) and return ONLY a JSON object with these keys:
- document_type: one of "cc" (Portuguese Cartão de Cidadão or any national identity card), "tr" (residence permit / título de residência / titre de séjour / verblijfstitel / EU residence card, including Belgian A/B/E/E+/F/F+/K/L/M cards), "passport", "driver_license", "a1" (A1 social security certificate), "health_card", "other"; null if unreadable.
- document_number: the main document/card number exactly as printed (keep letters and digits, drop spaces), NOT the national register number / NISS / NIF unless it is the only number; null if not visible.
- expiry_date: validity end date as YYYY-MM-DD, or null.
- full_name: holder's full name as printed (given names then surname), or null.
- birth_date: YYYY-MM-DD or null.
- nationality: as printed, or null.
- issuing_country: country that issued the document, or null.
- confidence: "high", "medium" or "low" for document_number.
- notes: one short sentence if something is unclear (e.g. only the back side, blurred), else null.
Never invent values: use null when you cannot read a field.`;

/** Super Admin, ou Owner/Manager da empresa ativa (igual a isManager do frontend). */
function canAnalyze(roles: { role: string; company_id: string | null }[], companyId: string): boolean {
  return roles.some(
    (r) => r.role === "super_admin" || ((r.role === "owner" || r.role === "manager") && r.company_id === companyId),
  );
}

function parseReading(text: string): DocumentReading {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("A IA não devolveu dados legíveis.");
  const j = JSON.parse(match[0]) as Record<string, unknown>;
  const str = (k: string) => (typeof j[k] === "string" && (j[k] as string).trim() ? (j[k] as string).trim() : null);
  const date = (k: string) => {
    const s = str(k);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };
  const types = ["cc", "tr", "passport", "driver_license", "a1", "health_card", "other"] as const;
  const t = str("document_type");
  const conf = str("confidence");
  return {
    document_type: (types as readonly string[]).includes(t ?? "") ? (t as DocumentReading["document_type"]) : null,
    document_number: str("document_number"),
    expiry_date: date("expiry_date"),
    full_name: str("full_name"),
    birth_date: date("birth_date"),
    nationality: str("nationality"),
    issuing_country: str("issuing_country"),
    confidence: conf === "high" || conf === "medium" ? conf : "low",
    notes: str("notes"),
  };
}

export const analyzeEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as {
      supabase: {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => Promise<{ data: { role: string; company_id: string | null }[] | null; error: unknown }>;
          };
        };
      };
      userId: string;
    };
    // As RPCs is_company_manager/is_company_member têm EXECUTE revogado para
    // "authenticated"; lemos user_roles com o token do próprio gestor (RLS).
    const mine = await supabase.from("user_roles").select("role, company_id").eq("user_id", userId);
    if (mine.error) throw new Error("Não foi possível confirmar as suas permissões.");
    if (!canAnalyze(mine.data ?? [], data.companyId)) {
      throw new Error("Apenas a gestão da empresa pode analisar documentos.");
    }
    const target = await supabase.from("user_roles").select("role, company_id").eq("user_id", data.profileId);
    if (target.error || !(target.data ?? []).some((r) => r.company_id === data.companyId)) {
      throw new Error("Este funcionário não é desta empresa.");
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Análise de documentos indisponível: a IA não está ativa neste projeto.");

    const content = [
      {
        type: "text",
        text: PROMPT + (data.categoryHint ? `\nThe manager filed this as: ${data.categoryHint}.` : ""),
      },
      ...data.images.map((url) => ({ type: "image_url", image_url: { url } })),
    ];
    const resp = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, temperature: 0, messages: [{ role: "user", content }] }),
    });
    if (resp.status === 429) throw new Error("Muitos pedidos à IA neste momento. Tente de novo dentro de 1 minuto.");
    if (resp.status === 402) throw new Error("Os créditos de IA do projeto acabaram. Fale com o administrador.");
    if (!resp.ok) {
      console.error(`analyze-document gateway ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      throw new Error("Não foi possível analisar o documento agora.");
    }
    const body = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    return parseReading(body.choices?.[0]?.message?.content ?? "");
  });

export const __test = { parseReading, validate, canAnalyze };
