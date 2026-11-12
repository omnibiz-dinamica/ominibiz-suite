/**
 * Horas de ponto no fuso da EMPRESA (SUP-2026-000323, 12/11/2026).
 *
 * O Fechamento (servidor) mostra o ponto no fuso da empresa / do sítio onde foi
 * batido; o Ponto · Gestão mostrava no fuso do computador de quem via. Aqui
 * fica a regra única do frontend: mostrar e interpretar horas de ponto no fuso
 * da empresa ativa (companies.timezone), seja onde for que o gestor esteja.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const DEFAULT_COMPANY_TZ = "Europe/Lisbon";

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type Parts = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function partsInTz(ms: number, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms)))
    if (x.type !== "literal") p[x.type] = Number(x.value);
  return {
    y: p.year,
    mo: p.month,
    d: p.day,
    h: p.hour === 24 ? 0 : p.hour,
    mi: p.minute,
    s: p.second,
  };
}

/** Diferença (ms) entre a hora de parede no fuso e o UTC, nesse instante. */
function offsetMs(ms: number, tz: string): number {
  const p = partsInTz(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → "YYYY-MM-DDTHH:MM" (valor de <input type="datetime-local">) no fuso indicado. */
export function isoToInputInTz(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const p = partsInTz(ms, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** "YYYY-MM-DDTHH:MM" lido como hora de parede no fuso indicado → ISO (UTC). */
export function inputInTzToIso(local: string | null | undefined, tz: string): string | null {
  if (!local) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  // Duas passagens para acertar a mudança de hora (verão/inverno).
  let guess = asUtc - offsetMs(asUtc, tz);
  guess = asUtc - offsetMs(guess, tz);
  return new Date(guess).toISOString();
}

/** "12/11/2026 08:05" no fuso indicado (ou só a hora com timeOnly). */
export function formatInTz(
  iso: string | null | undefined,
  tz: string,
  opts: { timeOnly?: boolean; seconds?: boolean } = {},
): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const p = partsInTz(ms, tz);
  const time = `${pad(p.h)}:${pad(p.mi)}${opts.seconds ? `:${pad(p.s)}` : ""}`;
  return opts.timeOnly ? time : `${pad(p.d)}/${pad(p.mo)}/${p.y} ${time}`;
}

/**
 * Fuso da empresa ativa (companies.timezone). `ready` = já carregado; enquanto
 * não, devolve o fuso do aparelho (só para mostrar — não gravar antes de `ready`).
 */
export function useCompanyTimeZoneInfo(): { tz: string; ready: boolean } {
  const { currentCompanyId } = useAuth();
  const { data } = useQuery({
    queryKey: ["company-timezone", currentCompanyId],
    enabled: !!currentCompanyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("companies" as never) as any)
        .select("timezone")
        .eq("id", currentCompanyId!)
        .maybeSingle();
      if (error) throw error;
      const tz = (data as { timezone?: string | null } | null)?.timezone?.trim();
      return isValidTimeZone(tz) ? tz : DEFAULT_COMPANY_TZ;
    },
  });
  if (data) return { tz: data, ready: true };
  let device = DEFAULT_COMPANY_TZ;
  try {
    device = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_COMPANY_TZ;
  } catch {
    /* fica o padrão */
  }
  return { tz: device, ready: false };
}

export function useCompanyTimeZone(): string {
  return useCompanyTimeZoneInfo().tz;
}
