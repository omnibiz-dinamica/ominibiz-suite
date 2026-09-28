import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Rótulo do nome de família conforme o país da empresa. */
export function lastNameLabel(country: string | null | undefined): string {
  const c = (country ?? "").toUpperCase();
  if (c === "BR") return "Sobrenome";
  if (c === "ES") return "Apellido";
  return "Apelido";
}

export function splitFullName(full: string | null | undefined): { first: string; last: string } {
  const t = (full ?? "").trim().replace(/\s+/g, " ");
  if (!t) return { first: "", last: "" };
  const i = t.indexOf(" ");
  return i < 0 ? { first: t, last: "" } : { first: t.slice(0, i), last: t.slice(i + 1) };
}

/** Primeiro nome para exibição rápida (tarefas, calendário). */
export function firstNameOf(full: string | null | undefined): string {
  return splitFullName(full).first;
}

export function useCompanyCountry(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["company-country", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("country").eq("id", companyId!).maybeSingle();
      return (data?.country as string | null) ?? null;
    },
  }).data;
}
