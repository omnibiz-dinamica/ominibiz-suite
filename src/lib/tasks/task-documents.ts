import { supabase } from "@/integrations/supabase/client";

export const TASK_DOCUMENT_ACCEPT = "application/pdf,image/png,image/jpeg,image/jpg";
export const TASK_DOCUMENT_MAX_SIZE = 10 * 1024 * 1024;
export const TASK_DOCUMENT_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

export type TaskDocumentKind = "pdf" | "image" | "checklist" | "video";

export type TaskDocument = {
  id: string;
  task_id: string;
  company_id: string;
  kind: TaskDocumentKind;
  title: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export function taskDocumentValidationError(file: File): string | null {
  if (file.size <= 0) return "o arquivo está vazio";
  if (file.size > TASK_DOCUMENT_MAX_SIZE) return "o arquivo excede o limite de 10 MB";
  if (!TASK_DOCUMENT_ALLOWED_MIME.has(file.type)) return "tipo não permitido; use PDF, PNG ou JPG";
  return null;
}

function fileKey(file: File): string {
  return [file.name, file.size, file.lastModified, file.type].join("\u0000");
}

export function mergeTaskFiles(current: File[], incoming: File[]): File[] {
  const seen = new Set(current.map(fileKey));
  const next = [...current];
  for (const file of incoming) {
    const key = fileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(file);
  }
  return next;
}

export function formatTaskFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function safeFileName(name: string): string {
  return name.normalize("NFKC").replace(/[^\w.\-]+/g, "_").slice(0, 180) || "arquivo";
}

function taskDocumentPath(companyId: string, taskId: string, file: File): string {
  return `${companyId}/${taskId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
}

export async function uploadTaskDocument({
  taskId,
  companyId,
  file,
  uploadedBy,
}: {
  taskId: string;
  companyId: string;
  file: File;
  uploadedBy?: string;
}): Promise<TaskDocument> {
  const validationError = taskDocumentValidationError(file);
  if (validationError) throw new Error(`${file.name}: ${validationError}`);

  const kind: TaskDocumentKind = file.type === "application/pdf" ? "pdf" : "image";
  const path = taskDocumentPath(companyId, taskId, file);
  const upload = await supabase.storage.from("task-docs").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) throw new Error(`${file.name}: ${upload.error.message}`);

  // Never leave a storage object without its canonical metadata row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("task_documents" as any) as any)
    .insert({
      task_id: taskId,
      company_id: companyId,
      uploaded_by: uploadedBy ?? null,
      kind,
      title: file.name,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from("task-docs").remove([path]);
    throw new Error(`${file.name}: ${error.message}`);
  }
  return data as TaskDocument;
}

export async function uploadTaskDocuments(args: {
  taskId: string;
  companyId: string;
  files: File[];
  uploadedBy?: string;
}): Promise<TaskDocument[]> {
  const uploaded: TaskDocument[] = [];
  try {
    for (const file of args.files) {
      uploaded.push(await uploadTaskDocument({ ...args, file }));
    }
    return uploaded;
  } catch (error) {
    // A multi-upload is treated as one user operation: clean this batch so a
    // retry cannot leave a misleading partial set attached to the task.
    await removeTaskDocuments(uploaded);
    throw error;
  }
}

export async function removeTaskDocuments(documents: TaskDocument[]): Promise<void> {
  for (const doc of documents) {
    await supabase.storage.from("task-docs").remove([doc.storage_path]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("task_documents" as any) as any).delete().eq("id", doc.id);
  }
}
