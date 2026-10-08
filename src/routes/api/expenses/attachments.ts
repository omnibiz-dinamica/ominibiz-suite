import { createFileRoute } from "@tanstack/react-router";
import { Zip, ZipPassThrough } from "fflate";
import { attachmentArchiveName, safeExpenseAttachmentName, type ExpenseSelectionFilters } from "@/lib/expense-attachments";

type ExpenseAttachmentRow = {
  id: string;
  expense_date: string;
  user_id: string;
  amount: number;
  reason: string;
  attachment_path: string;
  attachment_mime: string | null;
  attachment_size: number | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILES = 100;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function extensionFrom(path: string, mime: string | null) {
  const candidate = path.split(".").pop()?.split(/[?#]/)[0];
  if (candidate && /^[a-zA-Z0-9]{1,8}$/.test(candidate)) return candidate;
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  return "jpg";
}

export const Route = createFileRoute("/api/expenses/attachments")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);
        const url = new URL(request.url);
        const companyId = url.searchParams.get("companyId") ?? "";
        const format = url.searchParams.get("format") === "zip" ? "zip" : "manifest";
        const statusParam = url.searchParams.get("status");
        const paymentParam = url.searchParams.get("payment");
        const userIdParam = url.searchParams.get("userId");
        const start = url.searchParams.get("start") ?? "";
        const end = url.searchParams.get("end") ?? "";
        const filters: ExpenseSelectionFilters = {
          status: statusParam === "pendente" || statusParam === "aprovada" || statusParam === "rejeitada" ? statusParam : "all",
          payment: paymentParam === "paga" || paymentParam === "aguardando_pagamento" ? paymentParam : "all",
          userId: userIdParam ?? "all",
          dateBy: url.searchParams.get("dateBy") === "created_at" ? "created_at" : "expense_date",
          start,
          end,
        };
        if (userIdParam && !UUID_PATTERN.test(userIdParam)) return json({ error: "Colaborador inválido." }, 400);
        if ((start && !DATE_PATTERN.test(start)) || (end && !DATE_PATTERN.test(end))) return json({ error: "Período inválido." }, 400);
        if (!UUID_PATTERN.test(companyId)) return json({ error: "Empresa inválida." }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token = authHeader.slice("Bearer ".length).trim();
        const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
        const actor = userData.user;
        if (authError || !actor) return json({ error: "Sessão inválida." }, 401);

        const { data: roleRows, error: roleError } = await supabaseAdmin
          .from("user_roles")
          .select("role, company_id")
          .eq("user_id", actor.id);
        if (roleError) return json({ error: "Não foi possível validar as permissões." }, 500);
        const allowed = (roleRows ?? []).some(
          (row) => row.role === "super_admin" || (row.company_id === companyId && (row.role === "manager" || row.role === "owner")),
        );
        if (!allowed) return json({ error: "Sem permissão para consultar estes comprovantes." }, 403);

        // Mesma seleção do Histórico (estado, pagamento, colaborador, datas); sem regra escondida.
        let query = (supabaseAdmin as any)
          .from("employee_expenses")
          .select("id,expense_date,user_id,amount,reason,attachment_path,attachment_mime,attachment_size")
          .eq("company_id", companyId)
          .not("attachment_path", "is", null);
        if (filters.status !== "all") query = query.eq("status", filters.status);
        if (filters.userId !== "all") query = query.eq("user_id", filters.userId);
        if (filters.payment === "paga") query = query.eq("payment_status", "paga");
        // Aprovadas ainda sem estado de pagamento contam como "aguarda pagamento".
        if (filters.payment === "aguardando_pagamento") {
          query = query.eq("status", "aprovada").or("payment_status.is.null,payment_status.neq.paga");
        }
        if (filters.dateBy === "expense_date") {
          if (start) query = query.gte("expense_date", start);
          if (end) query = query.lte("expense_date", end);
        } else {
          if (start) query = query.gte("created_at", `${start}T00:00:00Z`);
          if (end) {
            const next = new Date(`${end}T00:00:00Z`);
            next.setUTCDate(next.getUTCDate() + 1);
            query = query.lt("created_at", next.toISOString());
          }
        }
        const { data, error } = await query
          .order("expense_date", { ascending: true })
          .limit(MAX_FILES + 1);
        if (error) return json({ error: "Não foi possível consultar os comprovantes." }, 500);
        const rows = (data ?? []) as ExpenseAttachmentRow[];
        if (rows.length > MAX_FILES) return json({ error: `A seleção excede o limite de ${MAX_FILES} comprovantes. Reduza o período.` }, 413);
        const totalBytes = rows.reduce((sum, row) => sum + (row.attachment_size ?? 0), 0);
        if (totalBytes > MAX_TOTAL_BYTES) return json({ error: "A seleção excede o limite de 200 MB para processamento imediato." }, 413);

        const userIds = [...new Set(rows.map((row) => row.user_id))];
        const { data: profiles } = userIds.length
          ? await supabaseAdmin.from("profiles").select("id,full_name").in("id", userIds)
          : { data: [] as { id: string; full_name: string | null }[] };
        const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? "Colaborador"]));

        const prepared = await Promise.all(rows.map(async (row) => {
          const { data: signed, error: signedError } = await supabaseAdmin.storage
            .from("employee-expenses")
            .createSignedUrl(row.attachment_path, 300);
          if (signedError || !signed?.signedUrl) throw new Error("SIGNED_URL_FAILED");
          const mime = row.attachment_mime || "application/octet-stream";
          return {
            id: row.id,
            expenseDate: row.expense_date,
            employeeName: names.get(row.user_id) ?? "Colaborador",
            reason: row.reason,
            amount: Number(row.amount),
            mime,
            fileName: safeExpenseAttachmentName({
              expenseDate: row.expense_date,
              employeeName: names.get(row.user_id) ?? "Colaborador",
              reason: row.reason,
              id: row.id,
              extension: extensionFrom(row.attachment_path, mime),
            }),
            signedUrl: signed.signedUrl,
          };
        })).catch(() => null);
        if (!prepared) return json({ error: "Não foi possível preparar os comprovantes." }, 500);
        if (format === "manifest") return json({ items: prepared, totalBytes });

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const zip = new Zip((zipError, chunk, final) => {
              if (zipError) {
                controller.error(zipError);
                return;
              }
              controller.enqueue(chunk);
              if (final) controller.close();
            });
            void (async () => {
              for (const item of prepared) {
                const fileResponse = await fetch(item.signedUrl);
                if (!fileResponse.ok) throw new Error("ATTACHMENT_DOWNLOAD_FAILED");
                const entry = new ZipPassThrough(item.fileName);
                zip.add(entry);
                const reader = fileResponse.body?.getReader();
                if (!reader) {
                  entry.push(new Uint8Array(await fileResponse.arrayBuffer()), true);
                  continue;
                }
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  entry.push(value, false);
                }
                entry.push(new Uint8Array(), true);
              }
              zip.end();
            })().catch((streamError) => controller.error(streamError));
          },
        });

        return new Response(stream, {
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="${attachmentArchiveName(filters, filters.userId !== "all" ? names.get(filters.userId) : null)}"`,
            "Content-Type": "application/zip",
          },
        });
      },
    },
  },
});