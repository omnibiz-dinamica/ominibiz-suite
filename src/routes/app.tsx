import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { LogOut, MapPinOff, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

function AppShell() {
  const { loading, initialized, user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (initialized && !loading && !user) nav({ to: "/login" });
  }, [initialized, loading, user, nav]);

  if (!initialized || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">Carregando...</div>
    );
  }
  if (!user) return null;

  return (
    <AppLayout>
      <EmployeeGeoGuard>
        <Outlet />
      </EmployeeGeoGuard>
    </AppLayout>
  );
}

type GeoGateState = "checking" | "granted" | "blocked";

const GEO_BLOCKED_DETAIL = "A permissão de localização está bloqueada para este site.";

/**
 * Por ordem da Gerência, o funcionário (papel efetivo employee) só usa o sistema com a
 * localização autorizada. Gestor, owner, secretária, contabilidade e super admin nunca são bloqueados.
 * Só bloqueia quando a PERMISSÃO é negada (ou o navegador não tem localização); sinal fraco,
 * GPS lento ou tempo esgotado não bloqueiam — o registo de ponto já trata a precisão.
 */
function EmployeeGeoGuard({ children }: { children: ReactNode }) {
  const { isEmployee, effectiveRole, signOut } = useAuth();
  const mustShareLocation = isEmployee && effectiveRole === "employee";
  const [state, setState] = useState<GeoGateState>("checking");
  const [detail, setDetail] = useState<string | null>(null);
  const [retryFailed, setRetryFailed] = useState(false);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState("blocked");
      setDetail("Este navegador ou dispositivo não disponibiliza a localização.");
      return;
    }
    setState("checking");
    setRetryFailed(false);
    navigator.geolocation.getCurrentPosition(
      () => {
        setState("granted");
        setDetail(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState("blocked");
          setDetail(GEO_BLOCKED_DETAIL);
          setRetryFailed(true);
        } else {
          // Permissão concedida, mas sem posição agora (GPS lento, interior de edifício): não bloqueia.
          setState("granted");
          setDetail(null);
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (!mustShareLocation) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onPermissionChange = () => {
      if (!status || cancelled) return;
      if (status.state === "denied") {
        setState("blocked");
        setDetail(GEO_BLOCKED_DETAIL);
      } else if (status.state === "granted") {
        setState("granted");
        setDetail(null);
      }
    };
    (async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.permissions?.query) {
          status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
          if (cancelled) return;
          status.addEventListener?.("change", onPermissionChange);
          if (status.state === "granted") {
            setState("granted");
            return;
          }
          if (status.state === "denied") {
            setState("blocked");
            setDetail(GEO_BLOCKED_DETAIL);
            return;
          }
        }
      } catch {
        // Safari antigo ou navegador sem Permissions API: segue para o pedido direto.
      }
      if (!cancelled) requestLocation();
    })();
    return () => {
      cancelled = true;
      status?.removeEventListener?.("change", onPermissionChange);
    };
  }, [mustShareLocation, requestLocation]);

  // Depois de ativar a localização nas definições do telemóvel/navegador, ao voltar para o sistema
  // a permissão é verificada de novo sozinha (sem precisar sair da sessão).
  useEffect(() => {
    if (!mustShareLocation || state !== "blocked") return;
    const recheck = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        if (typeof navigator !== "undefined" && navigator.permissions?.query) {
          const s = await navigator.permissions.query({ name: "geolocation" as PermissionName });
          if (s.state === "granted") {
            setState("granted");
            setDetail(null);
          }
        }
      } catch {
        // Navegador sem Permissions API: o botão "Tentar novamente" continua disponível.
      }
    };
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [mustShareLocation, state]);

  if (!mustShareLocation || state === "granted") return <>{children}</>;

  if (state === "checking") {
    return (
      <div className="grid min-h-[50vh] place-items-center p-4 text-center text-sm text-muted-foreground">
        A verificar a autorização de localização...
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <MapPinOff className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">Localização obrigatória</h2>
          <p className="text-sm font-medium text-destructive">
            Por ordem da Gerência, a localização deve ser permitida para o funcionamento do sistema.
          </p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
          {retryFailed && (
            <p className="text-xs font-medium text-destructive">
              O navegador ainda informa que a localização está bloqueada. Se já a ativou nas definições, toque em
              "Recarregar página" (a sua sessão continua iniciada).
            </p>
          )}
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-left text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Como ativar:</p>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong>Android (Chrome):</strong> toque no cadeado ao lado do endereço do site → Permissões → Localização
              → Permitir. Confirme também que a Localização do telemóvel está ligada.
            </li>
            <li>
              <strong>iPhone:</strong> Ajustes → Privacidade e Segurança → Serviços de Localização (ligado) → Safari (ou
              Chrome) → Ao usar a app. No Safari, toque em aA → Definições do site → Localização → Permitir.
            </li>
            <li>
              <strong>Computador:</strong> clique no cadeado ao lado do endereço do site e permita a Localização.
            </li>
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" className="w-full gap-2" onClick={requestLocation}>
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
          <Button type="button" variant="outline" className="w-full gap-2" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" /> Recarregar página
          </Button>
          <Button type="button" variant="ghost" className="w-full gap-2" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" /> Terminar sessão
          </Button>
        </div>
      </div>
    </div>
  );
}
