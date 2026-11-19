/**
 * 18/11/2026 — Onde vai a assinatura. Mostra a página do PDF com a caixa da
 * assinatura; o funcionário toca na página para a pôr noutro sítio e pode
 * mudar de página. Em PDF digitalizado (sem texto) é obrigatório escolher.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  placementAtPoint,
  type PdfPageSize,
  type SignaturePlacement,
} from "@/lib/employee-attachments";

export function SignaturePlacementPicker({
  pdf,
  pages,
  placement,
  aspect,
  onChange,
}: {
  pdf: Uint8Array;
  pages: PdfPageSize[];
  placement: SignaturePlacement;
  aspect: number;
  onChange: (p: SignaturePlacement) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);
  const [failed, setFailed] = useState(false);
  const page = pages.find((p) => p.page === placement.page) ?? pages[pages.length - 1];

  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    setRendering(true);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        (pdfjs as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
          workerSrc;
        const d = await pdfjs.getDocument({ data: pdf.slice() }).promise;
        const pg = await d.getPage(page.page);
        const width = Math.max(240, (hostRef.current?.clientWidth ?? 480) - 2);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const base = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: (width / base.width) * ratio });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${width}px`;
        await pg.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas } as never)
          .promise;
        await d.destroy();
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page]);

  if (!page) return null;

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * page.width;
    const py = page.height - ((e.clientY - rect.top) / rect.height) * page.height;
    onChange(placementAtPoint(page, px, py, aspect));
  };
  const goPage = (n: number) => {
    const target = pages.find((p) => p.page === n);
    if (!target) return;
    onChange(placementAtPoint(target, target.width - 100, 120, aspect));
  };

  // Caixa em percentagem da página (y do PDF conta de baixo).
  const box = {
    left: `${(placement.x / page.width) * 100}%`,
    top: `${((page.height - placement.y - placement.height) / page.height) * 100}%`,
    width: `${(placement.width / page.width) * 100}%`,
    height: `${(placement.height / page.height) * 100}%`,
  };

  return (
    <div className="space-y-2" data-testid="signature-placement-picker">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page.page <= 1}
          onClick={() => goPage(page.page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">
          Página {page.page} de {pages.length}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page.page >= pages.length}
          onClick={() => goPage(page.page + 1)}
          aria-label="Página seguinte"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div
        ref={hostRef}
        className="max-h-[32vh] overflow-y-auto rounded-md sm:max-h-[45vh] border border-border bg-muted/30"
      >
        <div className="relative mx-auto w-fit cursor-crosshair" onClick={onTap}>
          <canvas ref={canvasRef} className="block bg-white" />
          {!rendering && !failed && (
            <div
              className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/15"
              style={box}
              aria-hidden
            >
              <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-primary px-1 text-[10px] text-primary-foreground">
                Assinatura
              </span>
            </div>
          )}
        </div>
        {rendering && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />A preparar a página…
          </p>
        )}
        {failed && (
          <p className="py-6 text-center text-xs text-destructive">
            Não foi possível mostrar a página.
          </p>
        )}
      </div>
    </div>
  );
}
