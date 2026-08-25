/**
 * OmniBiz · Assinatura e Visto do funcionário (ADR-038).
 *
 * Captura por rato/toque (signature_pad) ou upload de imagem. Os ficheiros
 * vivem no bucket PRIVADO `employee-signatures` sob `company_id/user_id/...`
 * (policies já existentes permitem o próprio utilizador e o gestor).
 * Nunca há URL pública: a pré-visualização usa signed URL de curta duração.
 */
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eraser, PenLine, Trash2, Upload } from "lucide-react";

type Kind = "signature" | "initials";

function Pad({
  kind,
  companyId,
  userId,
  currentPath,
  onSaved,
}: {
  kind: Kind;
  companyId: string;
  userId: string;
  currentPath: string | null;
  onSaved: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      padRef.current?.clear();
    };
    padRef.current = new SignaturePad(canvas, {
      penColor: "#111827",
      backgroundColor: "rgba(255,255,255,0)",
    });
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      padRef.current?.off();
      padRef.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!currentPath) {
        setPreview(null);
        return;
      }
      const { data } = await supabase.storage
        .from("employee-signatures")
        .createSignedUrl(currentPath, 600);
      if (alive) setPreview(data?.signedUrl ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [currentPath]);

  const persist = async (blob: Blob) => {
    const path = `${companyId}/${userId}/${kind}-${Date.now()}.png`;
    const { error } = await supabase.storage
      .from("employee-signatures")
      .upload(path, blob, { contentType: "image/png", upsert: true });
    if (error) throw error;
    const patch = kind === "signature" ? { signature_url: path } : { initials_url: path };
    const { error: upErr } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (upErr) throw upErr;
  };

  const saveDrawing = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      toast.error("Desenhe antes de guardar.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = padRef.current.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      await persist(blob);
      padRef.current.clear();
      toast.success(kind === "signature" ? "Assinatura guardada." : "Visto guardado.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie uma imagem.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem demasiado grande (máx. 2 MB).");
      return;
    }
    setBusy(true);
    try {
      await persist(file);
      toast.success("Imagem guardada.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      if (currentPath) await supabase.storage.from("employee-signatures").remove([currentPath]);
      const patch = kind === "signature" ? { signature_url: null } : { initials_url: null };
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
      toast.success("Removido. Pode cadastrar novamente.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {kind === "signature" ? "Assinatura completa" : "Visto / Rubrica"}
        </div>
        {currentPath && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
            <Trash2 className="h-4 w-4" /> Remover
          </Button>
        )}
      </div>

      {preview && (
        <div className="mt-3">
          <div className="text-xs text-muted-foreground">Cadastrado actualmente</div>
          <img
            src={preview}
            alt={kind === "signature" ? "Assinatura cadastrada" : "Visto cadastrado"}
            className="mt-1 h-16 rounded-md border border-border bg-white object-contain px-2"
          />
        </div>
      )}

      <div className="mt-3">
        <canvas
          ref={canvasRef}
          className="h-32 w-full touch-none rounded-md border border-dashed border-border bg-white"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Desenhe com o rato, com o dedo ou com a caneta e toque em guardar.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={saveDrawing}>
          <PenLine className="h-4 w-4" /> {currentPath ? "Substituir" : "Guardar"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => padRef.current?.clear()}
        >
          <Eraser className="h-4 w-4" /> Limpar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> Enviar imagem
        </Button>
      </div>
    </div>
  );
}

export function SignatureVistoCard() {
  const { user, currentCompanyId } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["profile-signatures", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("signature_url, initials_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as { signature_url?: string | null; initials_url?: string | null };
    },
  });

  const refresh = useMutation({
    mutationFn: async () => {
      await qc.invalidateQueries({ queryKey: ["profile-signatures", user?.id] });
    },
  });

  if (!user?.id) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-lg font-semibold">Assinatura e Visto</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Usados na sua Folha de Ponto mensal. Ficheiros privados — nunca ficam públicos.
      </p>
      {!currentCompanyId ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Selecione uma empresa activa para cadastrar a assinatura.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Pad
            kind="signature"
            companyId={currentCompanyId}
            userId={user.id}
            currentPath={data?.signature_url ?? null}
            onSaved={() => refresh.mutate()}
          />
          <Pad
            kind="initials"
            companyId={currentCompanyId}
            userId={user.id}
            currentPath={data?.initials_url ?? null}
            onSaved={() => refresh.mutate()}
          />
        </div>
      )}
    </section>
  );
}
