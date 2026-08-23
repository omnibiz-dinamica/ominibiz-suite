import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { isModuleEnabled, MODULE_CATALOG, type ModuleKey } from "@/lib/locale";
import { Button } from "@/components/ui/button";

/**
 * ADR-033 — ModuleGuard canónico.
 *
 * Esconder o item de menu NÃO é segurança: o acesso por URL direta tem de ser
 * bloqueado. Este guard resolve os módulos ativos da empresa atual e só renderiza
 * os filhos quando o módulo está efetivamente ativo em `companies.enabled_modules`.
 *
 * Regras:
 *  1. Contexto em carregamento NUNCA equivale a "sem permissão" (ADR-030): mostra
 *     estado de carregamento, nunca 403 prematuro.
 *  2. Sem empresa ativa → sem módulo de empresa → bloqueia.
 *  3. Nada é ativado implicitamente: a ausência do módulo bloqueia sempre.
 */
export function ModuleGuard({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { initialized, loading, currentCompanyId } = useAuth();

  const { data, isFetched, isLoading } = useQuery({
    queryKey: ["module-guard-company", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("companies" as any) as any)
        .select("id, enabled_modules")
        .eq("id", currentCompanyId!)
        .maybeSingle();
      return data as { id: string; enabled_modules?: string[] | null } | null;
    },
  });

  const contextReady = initialized && !loading && (!currentCompanyId || (isFetched && !isLoading));

  if (!contextReady) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const allowed = !!currentCompanyId && isModuleEnabled(data?.enabled_modules ?? [], module);

  if (!allowed) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <div className="max-w-md rounded-2xl border border-border bg-card p-10 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold">Módulo não disponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O módulo <strong>{MODULE_CATALOG[module]?.label ?? module}</strong> não está ativo para
            esta empresa. Fale com o Super Admin para solicitar a ativação.
          </p>
          <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Erro 403</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/app">Voltar ao início</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
