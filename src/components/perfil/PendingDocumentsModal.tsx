/**
 * OmniBiz · Documentos pendentes do funcionário (anexos que o gestor marcou
 * para ler ou assinar). Abre ao entrar no sistema; "Mais tarde" fecha até ao
 * próximo acesso. O botão Lido/Assinar só fica ativo no fim do arquivo.
 * Assinar: usa a assinatura do Perfil (ou desenha na hora), põe-na no sítio de
 * "Assinatura" do PDF — ou onde o funcionário tocar (obrigatório em PDF
 * digitalizado, sem texto) — e o visto (rubrica) em cada página (18/11/2026).
 * Grava uma cópia assinada e avisa os gestores.
 */
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eraser, ExternalLink, FileSignature, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  chooseSignaturePlacement,
  downloadStorageBytes,
  isImageAttachment,
  isPdfAttachment,
  markAttachmentViewed,
  pngAspect,
  reachedEnd,
  readPdfText,
  saveSignedAttachment,
  signedCopyPath,
  stampSignature,
  vistoPlacements,
  type EmployeeAttachment,
  type SignaturePlacement,
} from "@/lib/employee-attachments";
import { cleanSignatureImage, fitInBox } from "@/lib/signature-image";
import { SignaturePlacementPicker } from "@/components/perfil/SignaturePlacementPicker";
import { OPEN_PENDING_DOCUMENTS_EVENT } from "@/lib/pending-documents-events";
import { saveSignatureToProfile, type SignatureKind } from "@/lib/employee-signature-save";

async function toPng(bytes: Uint8Array): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Não foi possível preparar a assinatura.");
  return new Uint8Array(await blob.arrayBuffer());
}

export function PendingDocumentsModal({
  userId,
  companyId,
}: {
  userId: string;
  companyId: string;
}) {
  const qc = useQueryClient();
  const [later, setLater] = useState(false);

  const pending = useQuery({
    queryKey: ["my-pending-attachments", userId, companyId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("employee_attachments")
        .select("*")
        .eq("profile_id", userId)
        .eq("company_id", companyId)
        .eq("employee_visible", true)
        .eq("employee_status", "pending")
        .order("uploaded_at", { ascending: true });
      // Antes do SQL desta funcionalidade as colunas não existem: não mostra nada.
      if (error) return [] as EmployeeAttachment[];
      return (data ?? []) as EmployeeAttachment[];
    },
    staleTime: 60_000,
  });

  // "Abrir para ler/assinar" em "Os meus documentos" (Perfil) reabre esta janela.
  useEffect(() => {
    const reopen = () => {
      setLater(false);
      void qc.invalidateQueries({ queryKey: ["my-pending-attachments", userId, companyId] });
    };
    window.addEventListener(OPEN_PENDING_DOCUMENTS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_PENDING_DOCUMENTS_EVENT, reopen);
  }, [qc, userId, companyId]);

  const list = pending.data ?? [];
  const current = list[0];
  const open = !later && !!current;

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["my-pending-attachments", userId, companyId] });
    void qc.invalidateQueries({ queryKey: ["my-documents", userId, companyId] });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && setLater(true)}>
      <DialogContent size="lg" className="flex max-h-[92vh] flex-col gap-3 p-4 sm:p-6">
        {current && (
          <DocumentStep
            key={current.id}
            doc={current}
            index={1}
            total={list.length}
            onLater={() => setLater(true)}
            onDone={done}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DocumentStep({
  doc,
  index,
  total,
  onLater,
  onDone,
}: {
  doc: EmployeeAttachment;
  index: number;
  total: number;
  onLater: () => void;
  onDone: () => Promise<void>;
}) {
  const sign = doc.employee_action === "sign";
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [atEnd, setAtEnd] = useState(false);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    downloadStorageBytes("employee-docs", doc.storage_path)
      .then((b) => alive && setBytes(b))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [doc.storage_path]);

  const confirmRead = async () => {
    setBusy(true);
    try {
      await markAttachmentViewed(doc.id);
      toast.success("Leitura confirmada.");
      await onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {sign ? (
            <FileSignature className="h-5 w-5 text-primary" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          )}
          {sign ? "Documento para assinar" : "Documento para ler"}
          {total > 1 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({index} de {total})
            </span>
          )}
        </DialogTitle>
        <DialogDescription className="truncate">{doc.file_name}</DialogDescription>
      </DialogHeader>

      {signing && bytes ? (
        <SignStep doc={doc} pdf={bytes} onBack={() => setSigning(false)} onDone={onDone} />
      ) : (
        <>
          <Viewer doc={doc} bytes={bytes} error={loadError} onEnd={() => setAtEnd(true)} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {!atEnd && !loadError && (
              <span className="text-xs text-muted-foreground sm:mr-auto">
                Role até ao fim do documento para {sign ? "assinar" : "confirmar a leitura"}.
              </span>
            )}
            <Button variant="ghost" onClick={onLater} disabled={busy}>
              Mais tarde
            </Button>
            {sign ? (
              <Button disabled={!atEnd || !bytes} onClick={() => setSigning(true)}>
                <FileSignature className="h-4 w-4" /> Assinar
              </Button>
            ) : (
              <Button disabled={!atEnd || busy} onClick={() => void confirmRead()}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}{" "}
                Lido
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Viewer({
  doc,
  bytes,
  error,
  onEnd,
}: {
  doc: EmployeeAttachment;
  bytes: Uint8Array | null;
  error: string | null;
  onEnd: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const pdf = isPdfAttachment(doc);
  const image = isImageAttachment(doc);

  const check = () => {
    const el = boxRef.current;
    if (el && reachedEnd(el)) onEnd();
  };

  // PDF: desenha todas as páginas na largura da caixa.
  useEffect(() => {
    if (!bytes || !pdf) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        (pdfjs as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
          workerSrc;
        const d = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        const host = pagesRef.current;
        if (!host) return;
        host.innerHTML = "";
        const width = Math.max(280, (boxRef.current?.clientWidth ?? 600) - 16);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let p = 1; p <= d.numPages && !cancelled; p++) {
          const page = await d.getPage(p);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = `${width}px`;
          canvas.className = "mx-auto mb-2 block rounded border border-border bg-white shadow-sm";
          host.appendChild(canvas);
          await page.render({
            canvasContext: canvas.getContext("2d")!,
            viewport: vp,
            canvas,
          } as never).promise;
        }
        await d.destroy();
      } catch {
        if (!cancelled) setRenderError(true);
      } finally {
        if (!cancelled) {
          setRendering(false);
          requestAnimationFrame(check);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, pdf]);

  useEffect(() => {
    if (!bytes || !image) return;
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: doc.mime_type ?? "image/*" }),
    );
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes, image, doc.mime_type]);

  const openExternal = async () => {
    const { data } = await supabase.storage
      .from("employee-docs")
      .createSignedUrl(doc.storage_path, 120);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
      onEnd();
    } else toast.error("Não foi possível abrir o arquivo.");
  };

  if (error) return <p className="py-10 text-center text-sm text-destructive">{error}</p>;
  if (!bytes)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A abrir documento…
      </p>
    );

  if ((!pdf && !image) || renderError) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-center text-sm">
        <p className="text-muted-foreground">
          Este arquivo não pode ser mostrado aqui. Abra-o, leia até ao fim e volte para confirmar.
        </p>
        <Button variant="outline" onClick={() => void openExternal()}>
          <ExternalLink className="h-4 w-4" /> Abrir arquivo
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      onScroll={check}
      className="min-h-[40vh] flex-1 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2"
      data-testid="document-viewer"
    >
      {pdf && (
        <>
          {rendering && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A preparar páginas…
            </p>
          )}
          <div ref={pagesRef} />
        </>
      )}
      {image && imgUrl && (
        <img
          src={imgUrl}
          alt={doc.file_name}
          className="mx-auto max-w-full"
          onLoad={() => requestAnimationFrame(check)}
        />
      )}
    </div>
  );
}

/** PNG de uma imagem guardada no bucket de assinaturas, sem fundo e recortado. */
async function storedSignaturePng(path: string): Promise<CleanPng> {
  const bytes = await downloadStorageBytes("employee-signatures", path);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    fr.readAsDataURL(new Blob([bytes as BlobPart]));
  });
  return dataUrlToCleanPng(dataUrl);
}

type CleanPng = { png: Uint8Array; aspect: number };

async function dataUrlToCleanPng(dataUrl: string): Promise<CleanPng> {
  const clean = await cleanSignatureImage(dataUrl).catch(() => null);
  if (clean) {
    const png = new Uint8Array(await (await fetch(clean.dataUrl)).arrayBuffer());
    return { png, aspect: clean.width / Math.max(clean.height, 1) };
  }
  const png = await toPng(new Uint8Array(await (await fetch(dataUrl)).arrayBuffer()));
  return { png, aspect: pngAspect(png) };
}

/** Área de desenho (assinatura ou visto). */
function usePad(active: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
    padRef.current = new SignaturePad(canvas, {
      penColor: "#111827",
      backgroundColor: "rgba(255,255,255,0)",
    });
    return () => {
      padRef.current?.off();
      padRef.current = null;
    };
  }, [active]);
  return { canvasRef, padRef };
}

function SignStep({
  doc,
  pdf,
  onBack,
  onDone,
}: {
  doc: EmployeeAttachment;
  pdf: Uint8Array;
  onBack: () => void;
  onDone: () => Promise<void>;
}) {
  const [draw, setDraw] = useState(false);
  const [drawVisto, setDrawVisto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placement, setPlacement] = useState<SignaturePlacement | null>(null);
  const [placeChosen, setPlaceChosen] = useState(false);
  const [saving, setSaving] = useState<SignatureKind | null>(null);

  const profile = useQuery({
    queryKey: ["my-signature-for-docs", doc.profile_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, signature_url, initials_url")
        .eq("id", doc.profile_id)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? {}) as {
        full_name?: string | null;
        signature_url?: string | null;
        initials_url?: string | null;
      };
      const signed = async (path?: string | null) => {
        if (!path) return null;
        const { data: s } = await supabase.storage
          .from("employee-signatures")
          .createSignedUrl(path, 600);
        return s?.signedUrl ?? null;
      };
      return {
        name: row.full_name ?? "",
        path: row.signature_url ?? null,
        preview: await signed(row.signature_url),
        vistoPath: row.initials_url ?? null,
        vistoPreview: await signed(row.initials_url),
      };
    },
  });

  // Texto e páginas do PDF: local sugerido para a assinatura.
  const layout = useQuery({
    queryKey: ["doc-sign-layout", doc.id],
    queryFn: () => readPdfText(pdf),
    staleTime: Infinity,
  });
  useEffect(() => {
    if (!layout.data || placement) return;
    const p = chooseSignaturePlacement(layout.data.items, layout.data.pages, 3);
    setPlacement(p);
    // Sem texto no PDF (digitalizado): o funcionário tem de escolher o local.
    setPlaceChosen(p.found !== "fallback");
  }, [layout.data, placement]);

  const hasSaved = !!profile.data?.path;
  const showPad = draw || (profile.isSuccess && !hasSaved);
  const hasVisto = !!profile.data?.vistoPath;
  const showVistoPad = drawVisto || (profile.isSuccess && !hasVisto);
  const sig = usePad(showPad);
  const visto = usePad(showVistoPad);
  const readyToSend = hasSaved && hasVisto && !showPad && !showVistoPad;

  /** Guarda o desenho no Perfil (fica para os próximos documentos). */
  const saveDrawn = async (kind: SignatureKind) => {
    const pad = kind === "signature" ? sig.padRef.current : visto.padRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error(kind === "signature" ? "Desenhe a sua assinatura." : "Desenhe o seu visto.");
      return;
    }
    setSaving(kind);
    try {
      await saveSignatureToProfile(kind, doc.company_id, doc.profile_id, pad.toDataURL("image/png"));
      await profile.refetch();
      if (kind === "signature") setDraw(false);
      else setDrawVisto(false);
      toast.success(kind === "signature" ? "Assinatura guardada." : "Visto guardado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      if (!layout.data || !placement) throw new Error("O documento ainda está a ser preparado.");
      if (!placeChosen) throw new Error("Toque na página, no sítio onde quer assinar.");
      // 19/11/2026: assina-se sempre com a assinatura e o visto GUARDADOS
      // (1. guardar assinatura → 2. guardar visto → 3. enviar).
      if (!profile.data?.path || showPad) throw new Error("Guarde primeiro a sua assinatura.");
      if (!profile.data?.vistoPath || showVistoPad) throw new Error("Guarde primeiro o seu visto.");
      const signature: CleanPng = await storedSignaturePng(profile.data.path);
      const source: "profile" | "drawn" = "profile";
      const vistoPng: CleanPng = await storedSignaturePng(profile.data.vistoPath);
      // A assinatura entra na caixa escolhida sem deformar (centrada).
      const fit = fitInBox(signature.aspect, 1, placement.width, placement.height);
      const finalPlacement: SignaturePlacement = {
        ...placement,
        x: placement.x + (placement.width - fit.w) / 2,
        y: placement.y + (placement.height - fit.h) / 2,
        width: fit.w,
        height: fit.h,
      };
      const when = new Date().toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
      const signedPdf = await stampSignature(
        pdf,
        signature.png,
        finalPlacement,
        `Assinado digitalmente por ${profile.data?.name || "funcionário"} em ${when}`,
        {
          png: vistoPng.png,
          placements: vistoPlacements(layout.data.pages, finalPlacement, vistoPng.aspect),
        },
      );
      const path = signedCopyPath(doc);
      const up = await supabase.storage
        .from("employee-docs")
        .upload(path, new Blob([signedPdf as BlobPart], { type: "application/pdf" }), {
          contentType: "application/pdf",
        });
      if (up.error) throw new Error(up.error.message);
      await saveSignedAttachment(doc.id, path, source, finalPlacement);
      toast.success("Documento assinado. A gestão foi avisada.");
      await onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-0 space-y-3 overflow-y-auto">
      {(profile.isLoading || layout.isLoading) && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A preparar a assinatura…
        </p>
      )}
      {profile.isError && (
        <p className="py-6 text-center text-sm text-destructive">
          Não foi possível carregar a sua assinatura.
        </p>
      )}
      {layout.isError && (
        <p className="py-6 text-center text-sm text-destructive">
          Não foi possível abrir este PDF para assinar (protegido ou danificado). Peça ao gestor
          outra versão.
        </p>
      )}

      {layout.data && placement && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Onde vai a assinatura</p>
          {placement.found === "fallback" && !placeChosen ? (
            <p
              className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs"
              data-testid="signature-place-required"
            >
              Não encontrámos o lugar da assinatura neste documento (por exemplo, PDF digitalizado).
              Vá à página certa e toque no sítio onde quer assinar.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Para mudar, toque noutro sítio da página ou mude de página.
            </p>
          )}
          <SignaturePlacementPicker
            pdf={pdf}
            pages={layout.data.pages}
            placement={placement}
            aspect={3}
            onChange={(p) => {
              setPlacement(p);
              setPlaceChosen(true);
            }}
          />
        </div>
      )}

      {profile.isSuccess && !showPad && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="flex items-center gap-1 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" /> 1. Assinatura guardada:
          </p>
          {profile.data.preview ? (
            <img
              src={profile.data.preview}
              alt="A sua assinatura"
              className="h-16 rounded-md border border-border bg-white object-contain px-2"
            />
          ) : null}
          <button type="button" className="text-xs text-primary underline" onClick={() => setDraw(true)}>
            Desenhar outra
          </button>
        </div>
      )}
      {showPad && (
        <div className="space-y-2" data-testid="signature-pad">
          <p className="text-sm font-medium">
            {hasSaved
              ? "1. Desenhe a nova assinatura e guarde:"
              : "1. Ainda não tem assinatura guardada. Desenhe-a aqui e clique em Guardar assinatura:"}
          </p>
          <canvas
            ref={sig.canvasRef}
            className="h-32 w-full touch-none rounded-md border border-dashed border-border bg-white"
            aria-label="Área para desenhar a assinatura"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => sig.padRef.current?.clear()}
            >
              <Eraser className="h-4 w-4" /> Limpar
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="save-signature"
              disabled={saving !== null}
              onClick={() => void saveDrawn("signature")}
            >
              {saving === "signature" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar assinatura
            </Button>
            {hasSaved && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraw(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}

      {profile.isSuccess && !showVistoPad && (
        <div className="space-y-2 rounded-xl border border-border p-3" data-testid="visto-profile">
          <p className="flex items-center gap-1 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" /> 2. Visto (rubrica) guardado — vai em
            cada página:
          </p>
          {profile.data.vistoPreview ? (
            <img
              src={profile.data.vistoPreview}
              alt="O seu visto"
              className="h-12 rounded-md border border-border bg-white object-contain px-2"
            />
          ) : null}
          <button
            type="button"
            className="text-xs text-primary underline"
            onClick={() => setDrawVisto(true)}
          >
            Desenhar outro
          </button>
        </div>
      )}
      {showVistoPad && (
        <div className="space-y-2" data-testid="visto-pad">
          <p className="text-sm font-medium">
            {hasVisto
              ? "2. Desenhe o novo visto (rubrica) e guarde:"
              : "2. Ainda não tem visto guardado. Desenhe a sua rubrica (vai em cada página) e clique em Guardar visto:"}
          </p>
          <canvas
            ref={visto.canvasRef}
            className="h-24 w-full max-w-xs touch-none rounded-md border border-dashed border-border bg-white"
            aria-label="Área para desenhar o visto"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => visto.padRef.current?.clear()}
            >
              <Eraser className="h-4 w-4" /> Limpar
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="save-visto"
              disabled={saving !== null}
              onClick={() => void saveDrawn("initials")}
            >
              {saving === "initials" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar visto
            </Button>
            {hasVisto && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setDrawVisto(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        A assinatura vai no sítio escolhido e o visto no canto inferior de cada página. É guardada
        uma cópia assinada; o original não é alterado.
      </p>
      {profile.isSuccess && !readyToSend && (
        <p className="text-xs font-medium text-warning-foreground" data-testid="send-signature-hint">
          Guarde a assinatura e o visto para poder enviar.
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Voltar
        </Button>
        <Button
          data-testid="send-signature"
          disabled={
            busy ||
            saving !== null ||
            !profile.isSuccess ||
            !layout.isSuccess ||
            !placeChosen ||
            !readyToSend
          }
          title={readyToSend ? undefined : "Guarde primeiro a assinatura e o visto"}
          onClick={() => void run()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
          {busy ? "A enviar…" : "3. Enviar assinatura"}
        </Button>
      </div>
    </div>
  );
}
