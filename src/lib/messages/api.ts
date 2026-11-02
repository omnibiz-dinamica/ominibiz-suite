import { supabase } from "@/integrations/supabase/client";
import type {
  MsgAutomation,
  MsgContact,
  MsgContactStatus,
  MsgContactTag,
  MsgCustomField,
  MsgFieldScope,
  MsgFieldType,
  MsgTag,
} from "./types";

/**
 * Acesso a dados do módulo Mensagens (tabelas msg_*).
 * Todas as chamadas filtram por company_id; a RLS da base de dados bloqueia
 * qualquer leitura/escrita quando o adicional whatsapp_ai não está ativo.
 *
 * As tabelas msg_* ainda não estão no types.ts gerado: usamos o mesmo cast
 * já adotado no projeto (ModuleGuard, Trabalho Extra).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type DbError = { code?: string; message?: string } | null;

/** Mensagem clara para o utilizador a partir do erro do Postgres/PostgREST. */
export function friendlyError(error: DbError): string {
  if (!error) return "Erro desconhecido.";
  const msg = error.message ?? "";
  if (error.code === "23505") {
    if (msg.includes("phone")) return "Já existe um contato com este telefone.";
    return "Já existe um registo com este nome.";
  }
  if (error.code === "23514") return "Algum valor não está no formato aceite.";
  if (error.code === "42501" || /row-level security/i.test(msg)) {
    return "Sem permissão. Confirme que o adicional WhatsApp com IA está ativo e o seu papel.";
  }
  return msg || "Erro ao gravar.";
}

function check<T>(res: { data: T | null; error: DbError }): T {
  if (res.error) throw new Error(friendlyError(res.error));
  return (res.data ?? ([] as unknown)) as T;
}

/* ------------------------------ Automações ------------------------------ */

export async function listAutomations(companyId: string): Promise<MsgAutomation[]> {
  return check(
    await db
      .from("msg_automations")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false }),
  );
}

export async function createAutomationDraft(
  companyId: string,
  name: string,
  folder: string | null,
) {
  return check<MsgAutomation>(
    await db
      .from("msg_automations")
      .insert({ company_id: companyId, name: name.trim(), folder: folder?.trim() || null })
      .select("*")
      .single(),
  );
}

export async function updateAutomation(
  companyId: string,
  id: string,
  patch: Partial<Pick<MsgAutomation, "name" | "folder" | "deleted_at">>,
) {
  check(await db.from("msg_automations").update(patch).eq("company_id", companyId).eq("id", id));
}

/* ------------------------------- Contatos ------------------------------- */

export interface ContactInput {
  name: string;
  phone: string | null;
  email: string | null;
  opted_in: boolean;
  status: MsgContactStatus;
}

export async function listContacts(companyId: string): Promise<MsgContact[]> {
  return check(await db.from("msg_contacts").select("*").eq("company_id", companyId).order("name"));
}

export async function listContactTags(companyId: string): Promise<MsgContactTag[]> {
  return check(
    await db
      .from("msg_contact_tags")
      .select("company_id, contact_id, tag_id")
      .eq("company_id", companyId),
  );
}

export async function saveContact(
  companyId: string,
  id: string | null,
  input: ContactInput,
): Promise<string> {
  const row = { ...input, name: input.name.trim(), email: input.email?.trim() || null };
  if (id) {
    check(await db.from("msg_contacts").update(row).eq("company_id", companyId).eq("id", id));
    return id;
  }
  const created = check<{ id: string }>(
    await db
      .from("msg_contacts")
      .insert({ ...row, company_id: companyId })
      .select("id")
      .single(),
  );
  return created.id;
}

/** Substitui as tags do contato pelo conjunto indicado (só mexe nas diferenças). */
export async function setContactTags(
  companyId: string,
  contactId: string,
  current: string[],
  next: string[],
) {
  const toAdd = next.filter((t) => !current.includes(t));
  const toRemove = current.filter((t) => !next.includes(t));
  if (toRemove.length) {
    check(
      await db
        .from("msg_contact_tags")
        .delete()
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .in("tag_id", toRemove),
    );
  }
  if (toAdd.length) {
    check(
      await db
        .from("msg_contact_tags")
        .insert(toAdd.map((tag_id) => ({ company_id: companyId, contact_id: contactId, tag_id }))),
    );
  }
}

/** Importa contatos já validados. Devolve quantos foram gravados. */
export async function importContacts(
  companyId: string,
  rows: { name: string; phone: string | null; email: string | null }[],
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    try {
      const data = check<{ id: string }[]>(
        await db
          .from("msg_contacts")
          .insert(chunk.map((r) => ({ ...r, company_id: companyId })))
          .select("id"),
      );
      saved += data.length;
    } catch (e) {
      const prefix = saved ? `${saved} contato(s) gravado(s) antes do erro. ` : "";
      throw new Error(prefix + (e as Error).message);
    }
  }
  return saved;
}

/* ---------------------------- Tags e campos ----------------------------- */

export async function listTags(companyId: string): Promise<MsgTag[]> {
  return check(await db.from("msg_tags").select("*").eq("company_id", companyId).order("name"));
}

export async function saveTag(
  companyId: string,
  id: string | null,
  name: string,
  folder: string | null,
) {
  const row = { name: name.trim(), folder: folder?.trim() || null };
  if (id) check(await db.from("msg_tags").update(row).eq("company_id", companyId).eq("id", id));
  else check(await db.from("msg_tags").insert({ ...row, company_id: companyId }));
}

export async function setTagArchived(companyId: string, id: string, archived: boolean) {
  check(
    await db
      .from("msg_tags")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("company_id", companyId)
      .eq("id", id),
  );
}

export async function listCustomFields(companyId: string): Promise<MsgCustomField[]> {
  return check(
    await db.from("msg_custom_fields").select("*").eq("company_id", companyId).order("name"),
  );
}

export async function createCustomField(
  companyId: string,
  name: string,
  scope: MsgFieldScope,
  type: MsgFieldType,
) {
  check(
    await db
      .from("msg_custom_fields")
      .insert({ company_id: companyId, name: name.trim(), scope, type }),
  );
}

export async function renameCustomField(companyId: string, id: string, name: string) {
  check(
    await db
      .from("msg_custom_fields")
      .update({ name: name.trim() })
      .eq("company_id", companyId)
      .eq("id", id),
  );
}

export async function setCustomFieldArchived(companyId: string, id: string, archived: boolean) {
  check(
    await db
      .from("msg_custom_fields")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("company_id", companyId)
      .eq("id", id),
  );
}
