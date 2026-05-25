import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Image as ImageIcon, X } from "lucide-react";

type Props = {
  value: File | null;
  onChange: (file: File | null) => void;
  label?: string;
  id?: string;
};

/**
 * PhotoPicker — mobile-safe image input.
 * - Não usa <form>/submit, todos os botões são type="button".
 * - Dois inputs ocultos: câmera (capture=environment) e galeria (sem capture).
 *   No mobile o capture forçado faz a WebView ser descartada por falta de memória
 *   ao abrir o app de câmera, recarregando a página. Manter os dois fluxos
 *   separados permite usuário escolher e evita o reload quando ele vem da galeria.
 * - onChange usa preventDefault/stopPropagation por segurança.
 */
export function PhotoPicker({ value, onChange, label, id }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.target.files?.[0] ?? null;
    onChange(f);
    // permitir re-selecionar o mesmo arquivo
    if (e.target) e.target.value = "";
  };

  return (
    <div className="space-y-2">
      {label && <div className="text-sm font-medium">{label}</div>}
      <input
        ref={cameraRef}
        id={id ? `${id}-cam` : undefined}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <input
        ref={galleryRef}
        id={id ? `${id}-gal` : undefined}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            cameraRef.current?.click();
          }}
        >
          <Camera className="h-4 w-4" /> Tirar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            galleryRef.current?.click();
          }}
        >
          <ImageIcon className="h-4 w-4" /> Galeria
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              onChange(null);
            }}
          >
            <X className="h-4 w-4" /> Remover
          </Button>
        )}
      </div>
      {preview && (
        <img
          src={preview}
          alt="Pré-visualização"
          className="h-24 w-32 rounded-md border border-border object-cover"
        />
      )}
      {value && (
        <div className="truncate text-xs text-muted-foreground">{value.name}</div>
      )}
    </div>
  );
}