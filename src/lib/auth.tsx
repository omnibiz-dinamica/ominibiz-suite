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
      const [rolesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role, company_id").eq("user_id", uid),
        supabase.from("profiles").select("current_company_id").eq("id", uid).maybeSingle(),
      ]);
      if (rolesRes.error) console.error("[auth] user_roles error", rolesRes.error);
      if (profileRes.error) console.error("[auth] profiles error", profileRes.error);

      const nextRoles = (rolesRes.data ?? []) as { role: AppRole; company_id: string | null }[];
      const isSuper = nextRoles.some((r) => r.role === "super_admin");
      let companyId =
        profileRes.data?.current_company_id ??
        nextRoles.find((r) => r.company_id)?.company_id ??
        null;

      if (!companyId && isSuper) {
        const { data: firstCompany, error: cErr } = await supabase
          .from("companies")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cErr) console.error("[auth] companies fetch error", cErr);
        companyId = firstCompany?.id ?? null;

        // Bootstrap: super admin sem nenhuma empresa → cria automaticamente
        if (!companyId) {
          const { data: created, error: createErr } = await supabase
            .from("companies")
            .insert({
              name: "Minha Empresa",
              slug: `empresa-${uid.slice(0, 8)}-${Date.now().toString(36)}`,
              created_by: uid,
            })
            .select("id")
            .single();
          if (createErr) {
            console.error("[auth] auto-create company failed", createErr);
          } else if (created) {
            companyId = created.id;
          }
        }

        if (companyId) {
          await supabase.from("profiles").update({ current_company_id: companyId }).eq("id", uid);
        }
      }

      setRoles(nextRoles);
      setCurrentCompanyId(companyId);
    } catch (e) {
      console.error("[auth] loadProfile failed", e);
    }
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
