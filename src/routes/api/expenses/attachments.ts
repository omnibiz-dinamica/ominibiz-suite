import { createFileRoute } from "@tanstack/react-router";
import { Zip, ZipPassThrough } from "fflate";
import { expenseMonthBounds, safeExpenseAttachmentName } from "@/lib/expense-attachments";

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
        const month = url.searchParams.get("month") ?? "";
        const format = url.searchParams.get("format") === "zip" ? "zip" : "manifest";
        const bounds = expenseMonthBounds(month);
        if (!UUID_PATTERN.test(companyId) || !bounds) return json({ error: "Período inválido." }, 400);

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

        const { data, error } = await (supabaseAdmin as any)
          .from("employee_expenses")
          .select("id,expense_date,user_id,amount,reason,attachment_path,attachment_mime,attachment_size")
          .eq("company_id", companyId)
          .gte("expense_date", bounds.start)
          .lt("expense_date", bounds.end)
          .not("attachment_path", "is", null)
          .order("expense_date", { ascending: true })
          .limit(MAX_FILES + 1);
        if (error) return json({ error: "Não foi possível consultar os comprovantes." }, 500);
        const rows = (data ?? []) as ExpenseAttachmentRow[];
        if (rows.length > MAX_FILES) return json({ error: `O mês excede o limite de ${MAX_FILES} comprovantes.` }, 413);
        const totalBytes = rows.reduce((sum, row) => sum + (row.attachment_size ?? 0), 0);
        if (totalBytes > MAX_TOTAL_BYTES) return json({ error: "O mês excede o limite de 200 MB para processamento imediato." }, 413);

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
            "Content-Disposition": `attachment; filename="comprovantes-despesas-${month}.zip"`,
            "Content-Type": "application/zip",
          },
        });
      },
    },
  },
});