import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, ShieldAlert, ShieldCheck, ShieldQuestion, Info, Lock } from "lucide-react";
import { toast } from "sonner";

type GeoPolicy = "block" | "justify" | "alert";

interface GeoSettings {
  geo_required_start: boolean;
  geo_required_stop: boolean;
  geo_default_radius_m: number;
  geo_out_of_range_policy_start: GeoPolicy;
  geo_out_of_range_policy_stop: GeoPolicy;
  geo_no_location_policy_start: GeoPolicy;
  geo_no_location_policy_stop: GeoPolicy;
  geo_photo_start_enabled: boolean;
  geo_photo_stop_enabled: boolean;
  geo_policy_version: number;
}

const DEFAULTS: GeoSettings = {
  geo_required_start: false,
  geo_required_stop: false,
  geo_default_radius_m: 50,
  geo_out_of_range_policy_start: "alert",
  geo_out_of_range_policy_stop: "alert",
  geo_no_location_policy_start: "alert",
  geo_no_location_policy_stop: "alert",
  geo_photo_start_enabled: false,
  geo_photo_stop_enabled: false,
  geo_policy_version: 1,
};

const POLICY_LABEL: Record<GeoPolicy, string> = {
  block: "Bloquear",
  justify: "Permitir com justificativa",
  alert: "Somente alertar",
};

const MIN_RADIUS = 5;
const MAX_RADIUS = 1000;

function validate(s: GeoSettings): string | null {
  if (!Number.isFinite(s.geo_default_radius_m)) return "Raio inválido.";
  if (s.geo_default_radius_m < MIN_RADIUS) return `O raio mínimo é ${MIN_RADIUS} metros.`;
  if (s.geo_default_radius_m > MAX_RADIUS) return `O raio máximo é ${MAX_RADIUS} metros.`;
  return null;
}

function diff(a: GeoSettings, b: GeoSettings): { key: keyof GeoSettings; from: unknown; to: unknown }[] {
  const keys = Object.keys(a) as (keyof GeoSettings)[];
  return keys
    .filter((k) => k !== "geo_policy_version" && a[k] !== b[k])
    .map((k) => ({ key: k, from: a[k], to: b[k] }));
}

const KEY_LABEL: Record<string, string> = {
  geo_required_start: "Exigir GPS no Start",
  geo_required_stop: "Exigir GPS no Stop",
  geo_default_radius_m: "Raio padrão (m)",
  geo_out_of_range_policy_start: "Fora do raio (Start)",
  geo_out_of_range_policy_stop: "Fora do raio (Stop)",
  geo_no_location_policy_start: "Sem GPS (Start)",
  geo_no_location_policy_stop: "Sem GPS (Stop)",
  geo_photo_start_enabled: "Foto no Start",
  geo_photo_stop_enabled: "Foto no Stop",
};

function fmt(v: unknown): string {
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "string" && v in POLICY_LABEL) return POLICY_LABEL[v as GeoPolicy];
  return String(v);
}

export function GeoSettingsCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { isSuperAdmin, isManager } = useAuth();

  const { data: saved, isLoading } = useQuery({
    queryKey: ["hr-settings-geo", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_hr_settings")
        .select(
          "geo_required_start, geo_required_stop, geo_default_radius_m, geo_out_of_range_policy_start, geo_out_of_range_policy_stop, geo_no_location_policy_start, geo_no_location_policy_stop, geo_photo_start_enabled, geo_photo_stop_enabled, geo_policy_version",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return (data as GeoSettings | null) ?? DEFAULTS;
    },
  });

  const [form, setForm] = useState<GeoSettings>(DEFAULTS);
  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved]);

  const changes = useMemo(() => (saved ? diff(saved, form) : []), [saved, form]);
  const hasChanges = changes.length > 0;

  const save = useMutation({
    mutationFn: async () => {
      const err = validate(form);
      if (err) throw new Error(err);
      const { error } = await (supabase as any)
        .from("company_hr_settings")
        .upsert(
          { company_id: companyId, ...form },
          { onConflict: "company_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações de geolocalização salvas");
      qc.invalidateQueries({ queryKey: ["hr-settings-geo", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isManager) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Geolocalização</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define quando o GPS é exigido no ponto e como tratar registros fora do raio.
          </p>
        </div>
        {(isManager || isSuperAdmin) && (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            política v{form.geo_policy_version ?? 1}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <div className="mt-5 space-y-6">
          {/* Ajuda */}
          <div className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
              <Info className="h-3.5 w-3.5" /> Como cada modo se comporta
            </div>
            <ul className="space-y-1">
              <li>
                <b>Bloquear</b> — o funcionário não consegue registrar o ponto fora das regras.
              </li>
              <li>
                <b>Permitir com justificativa</b> — o funcionário registra, mas precisa justificar o motivo.
              </li>
              <li>
                <b>Somente alertar</b> — o ponto é registrado normalmente e apenas fica sinalizado no relatório.
              </li>
            </ul>
          </div>

          {/* Raio padrão */}
          <div className="grid gap-2 sm:max-w-xs">
            <Label>Raio padrão (metros)</Label>
            <Input
              type="number"
              min={MIN_RADIUS}
              max={MAX_RADIUS}
              step={5}
              value={form.geo_default_radius_m}
              onChange={(e) =>
                setForm((f) => ({ ...f, geo_default_radius_m: Number(e.target.value) || 0 }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Entre {MIN_RADIUS} m e {MAX_RADIUS} m. Cada cliente pode ter o seu próprio raio.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <PolicyColumn
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Início do ponto (Start)"
              required={form.geo_required_start}
              onRequired={(v) => setForm((f) => ({ ...f, geo_required_start: v }))}
              outOfRange={form.geo_out_of_range_policy_start}
              onOutOfRange={(v) => setForm((f) => ({ ...f, geo_out_of_range_policy_start: v }))}
              noLocation={form.geo_no_location_policy_start}
              onNoLocation={(v) => setForm((f) => ({ ...f, geo_no_location_policy_start: v }))}
              photo={form.geo_photo_start_enabled}
            />
            <PolicyColumn
              icon={<ShieldAlert className="h-4 w-4" />}
              title="Término do ponto (Stop)"
              required={form.geo_required_stop}
              onRequired={(v) => setForm((f) => ({ ...f, geo_required_stop: v }))}
              outOfRange={form.geo_out_of_range_policy_stop}
              onOutOfRange={(v) => setForm((f) => ({ ...f, geo_out_of_range_policy_stop: v }))}
              noLocation={form.geo_no_location_policy_stop}
              onNoLocation={(v) => setForm((f) => ({ ...f, geo_no_location_policy_stop: v }))}
              photo={form.geo_photo_stop_enabled}
            />
          </div>

          {/* Resumo da política atual */}
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs">
            <div className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground">
              <ShieldQuestion className="h-3.5 w-3.5" /> Resumo da política
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              <ResumeLine label="Raio padrão" value={`${form.geo_default_radius_m} m`} />
              <ResumeLine label="Foto (Start / Stop)" value="Em breve" muted />
              <ResumeLine
                label="Start"
                value={`${form.geo_required_start ? "obrigatório" : "opcional"} • fora do raio: ${POLICY_LABEL[form.geo_out_of_range_policy_start]} • sem GPS: ${POLICY_LABEL[form.geo_no_location_policy_start]}`}
              />
              <ResumeLine
                label="Stop"
                value={`${form.geo_required_stop ? "obrigatório" : "opcional"} • fora do raio: ${POLICY_LABEL[form.geo_out_of_range_policy_stop]} • sem GPS: ${POLICY_LABEL[form.geo_no_location_policy_stop]}`}
              />
            </div>
          </div>

          {/* Diff antes de salvar */}
          {hasChanges && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
              <p className="mb-1 font-semibold text-foreground">Alterações pendentes</p>
              <ul className="space-y-0.5">
                {changes.map((c) => (
                  <li key={String(c.key)}>
                    <span className="text-muted-foreground">{KEY_LABEL[c.key] ?? c.key}:</span>{" "}
                    <span className="line-through">{fmt(c.from)}</span> → <b>{fmt(c.to)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !hasChanges}
            >
              {save.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumeLine({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className={muted ? "italic text-muted-foreground" : "font-medium"}>{value}</span>
    </div>
  );
}

function PolicyColumn({
  icon,
  title,
  required,
  onRequired,
  outOfRange,
  onOutOfRange,
  noLocation,
  onNoLocation,
  photo,
}: {
  icon: React.ReactNode;
  title: string;
  required: boolean;
  onRequired: (v: boolean) => void;
  outOfRange: GeoPolicy;
  onOutOfRange: (v: GeoPolicy) => void;
  noLocation: GeoPolicy;
  onNoLocation: (v: GeoPolicy) => void;
  photo: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>

      <label className="flex items-center justify-between gap-2">
        <span className="text-sm">Exigir geolocalização</span>
        <Switch checked={required} onCheckedChange={onRequired} />
      </label>

      <div className="space-y-1.5">
        <Label>Quando estiver fora do raio</Label>
        <Select value={outOfRange} onValueChange={(v) => onOutOfRange(v as GeoPolicy)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="block">Bloquear</SelectItem>
            <SelectItem value="justify">Permitir com justificativa</SelectItem>
            <SelectItem value="alert">Somente alertar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Quando o GPS não estiver disponível</Label>
        <Select value={noLocation} onValueChange={(v) => onNoLocation(v as GeoPolicy)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="block">Bloquear</SelectItem>
            <SelectItem value="justify">Permitir com justificativa</SelectItem>
            <SelectItem value="alert">Somente alertar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Foto — Coming Soon */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-2">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Camera className="h-4 w-4" /> Foto obrigatória
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            em breve
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <Switch checked={photo} disabled />
        </span>
      </div>
    </div>
  );
}