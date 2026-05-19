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
    const [{ data: roleData }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role, company_id").eq("user_id", uid),
      supabase.from("profiles").select("current_company_id").eq("id", uid).maybeSingle(),
    ]);
    const nextRoles = (roleData ?? []) as { role: AppRole; company_id: string | null }[];
    const isSuper = nextRoles.some((r) => r.role === "super_admin");
    let companyId =
      profile?.current_company_id ?? nextRoles.find((r) => r.company_id)?.company_id ?? null;

    if (!companyId && isSuper) {
      const { data: firstCompany } = await supabase
        .from("companies")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      companyId = firstCompany?.id ?? null;
    }

    setRoles(nextRoles);
    setCurrentCompanyId(companyId);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setLoading(true);
        setTimeout(() => void loadProfile(s.user.id).finally(() => setLoading(false)), 0);
      } else {
        setRoles([]);
        setCurrentCompanyId(null);
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const switchCompany = async (companyId: string | null) => {
    if (!session?.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ current_company_id: companyId })
      .eq("id", session.user.id);
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
