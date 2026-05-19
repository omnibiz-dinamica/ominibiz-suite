import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "manager" | "employee";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: { role: AppRole; company_id: string | null }[];
  currentCompanyId: string | null;
  switchCompany: (companyId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  isManager: boolean;
  isSuperAdmin: boolean;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<{ role: AppRole; company_id: string | null }[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);

  const loadProfile = async (uid: string) => {
    try {
      const { data, error } = await (supabase as any).rpc("get_auth_context");
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const nextRoles = (row?.roles ?? []) as { role: AppRole; company_id: string | null }[];

      setRoles(nextRoles);
      setCurrentCompanyId(row?.current_company_id ?? null);
    } catch (e) {
      console.error("[auth] loadProfile failed", e, { uid });
      setRoles([]);
      setCurrentCompanyId(null);
    }
  };

  useEffect(() => {
    let active = true;
    let loadId = 0;

    const applySession = (s: Session | null) => {
      const currentLoad = ++loadId;
      setSession(s);
      if (s?.user) {
        setLoading(true);
        setTimeout(() => {
          void loadProfile(s.user.id).finally(() => {
            if (active && currentLoad === loadId) setLoading(false);
          });
        }, 0);
      } else {
        setRoles([]);
        setCurrentCompanyId(null);
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "INITIAL_SESSION") return;
      applySession(s);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const switchCompany = async (companyId: string | null) => {
    if (!session?.user) return;
    const { error } = await (supabase as any).rpc("set_current_company", { _company_id: companyId });
    if (error) throw error;
    setCurrentCompanyId(companyId);
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    roles,
    currentCompanyId,
    switchCompany,
    refresh,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    isSuperAdmin: roles.some((r) => r.role === "super_admin"),
    isManager:
      roles.some((r) => r.role === "super_admin") ||
      roles.some(
        (r) => r.role === "manager" && (!currentCompanyId || r.company_id === currentCompanyId),
      ),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
