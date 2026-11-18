/**
 * Reabrir a janela de documentos pendentes (PendingDocumentsModal, montada no
 * AppLayout) a partir de outro sítio, ex.: "Os meus documentos" no Perfil.
 */
export const OPEN_PENDING_DOCUMENTS_EVENT = "omnibiz:open-pending-documents";

export function openPendingDocuments() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_PENDING_DOCUMENTS_EVENT));
}
