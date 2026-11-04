/**
 * OmniBiz · Documentos pendentes do funcionário (anexos que o gestor marcou
 * para ler ou assinar). Abre ao entrar no sistema; "Mais tarde" fecha até ao
 * próximo acesso. O botão Lido/Assinar só fica ativo no fim do arquivo.
 * Assinar: usa a assinatura do Perfil (ou desenha na hora), põe-na no sítio de
 * "Assinatura" do PDF, grava uma cópia assinada e avisa os gestores.
 */
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eraser, ExternalLink, FileSignature, Loader2 } from "lucide-react";
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
  type EmployeeAttachment,
} from "@/lib/employee-attachments";

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

  const list = pending.data ?? [];
  const current = list[0];
  const open = !later && !!current;

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["my-pending-attachments", userId, companyId] });
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [draw, setDraw] = useState(false);
  const [busy, setBusy] = useState(false);

  const profile = useQuery({
    queryKey: ["my-signature-for-docs", doc.profile_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, signature_url")
        .eq("id", doc.profile_id)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? {}) as { full_name?: string | null; signature_url?: string | null };
      let preview: string | null = null;
      if (row.signature_url) {
        const { data: s } = await supabase.storage
          .from("employee-signatures")
          .createSignedUrl(row.signature_url, 600);
        preview = s?.signedUrl ?? null;
      }
      return { name: row.full_name ?? "", path: row.signature_url ?? null, preview };
    },
  });
  const hasSaved = !!profile.data?.path;
  const showPad = draw || (profile.isSuccess && !hasSaved);

  useEffect(() => {
    if (!showPad) return;
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
  }, [showPad]);

  const run = async () => {
    setBusy(true);
    try {
      let png: Uint8Array;
      let source: "profile" | "drawn";
      if (showPad) {
        if (!padRef.current || padRef.current.isEmpty())
          throw new Error("Desenhe a sua assinatura.");
        const blob = await (await fetch(padRef.current.toDataURL("image/png"))).blob();
        png = new Uint8Array(await blob.arrayBuffer());
        source = "drawn";
      } else {
        png = await toPng(await downloadStorageBytes("employee-signatures", profile.data!.path!));
        source = "profile";
      }
      const { items, pages } = await readPdfText(pdf);
      const placement = chooseSignaturePlacement(items, pages, pngAspect(png));
      const when = new Date().toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
      const signed = await stampSignature(
        pdf,
        png,
        placement,
        `Assinado digitalmente por ${profile.data?.name || "funcionário"} em ${when}`,
      );
      const path = signedCopyPath(doc);
      const up = await supabase.storage
        .from("employee-docs")
        .upload(path, new Blob([signed as BlobPart], { type: "application/pdf" }), {
          contentType: "application/pdf",
        });
      if (up.error) throw new Error(up.error.message);
      await saveSignedAttachment(doc.id, path, source, placement);
      toast.success("Documento assinado. A gestão foi avisada.");
      await onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {profile.isLoading && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A carregar a sua assinatura…
        </p>
      )}
      {profile.isError && (
        <p className="py-6 text-center text-sm text-destructive">
          Não foi possível carregar a sua assinatura.
        </p>
      )}
      {profile.isSuccess && !showPad && (
        <div className="space-y-2 rounded-xl border border-border p-4">
          <p className="text-sm">Vamos usar a assinatura do seu Perfil:</p>
          {profile.data.preview ? (
            <img
              src={profile.data.preview}
              alt="A sua assinatura"
              className="h-20 rounded-md border border-border bg-white object-contain px-2"
            />
          ) : null}
          <button
            type="button"
            className="text-xs text-primary underline"
            onClick={() => setDraw(true)}
          >
            Prefiro desenhar agora
          </button>
        </div>
      )}
      {showPad && (
        <div className="space-y-2">
          <p className="text-sm">
            {hasSaved
              ? "Desenhe a assinatura:"
              : "Ainda não tem assinatura no Perfil. Desenhe-a aqui:"}
          </p>
          <canvas
            ref={canvasRef}
            className="h-36 w-full touch-none rounded-md border border-dashed border-border bg-white"
            aria-label="Área para desenhar a assinatura"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => padRef.current?.clear()}>
            <Eraser className="h-4 w-4" /> Limpar
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        A assinatura é colocada no local de assinatura do documento (ou no fim da última página) e é
        guardada uma cópia assinada. O original não é alterado.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Voltar
        </Button>
        <Button disabled={busy || !profile.isSuccess} onClick={() => void run()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSignature className="h-4 w-4" />
          )}
          {busy ? "A assinar…" : "Confirmar assinatura"}
        </Button>
      </div>
    </div>
  );
}
