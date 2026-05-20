import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "manager" | "employee";

export interface AuthProfile {
  id: string;
  full_name: string | null;
  current_company_id: string | null;
  is_active: boolean;
}

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  roles: { role: AppRole; company_id: string | null }[];
  currentCompanyId: string | null;
  profile: AuthProfile | null;
  switchCompany: (companyId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  isManager: boolean;
  isSuperAdmin: boolean;
  isEmployee: boolean;
  effectiveRole: AppRole | null;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

const log = (...args: unknown[]) => console.log("[auth-flow]", ...args);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [roles, setRoles] = useState<{ role: AppRole; company_id: string | null }[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const loadAuthContext = async (
    uid: string,
    reqId: number,
  ): Promise<{
    roles: { role: AppRole; company_id: string | null }[];
    currentCompanyId: string | null;
    profile: AuthProfile | null;
  } | null> => {
    log("get_auth_context:start", { reqId, uid });
    const { data, error } = await (supabase as any).rpc("get_auth_context");
    if (error) {
      console.error("[auth-flow] get_auth_context:error", { reqId, error });
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const nextRoles = (row?.roles ?? []) as { role: AppRole; company_id: string | null }[];
    const nextCompanyId = (row?.current_company_id ?? null) as string | null;
    log("get_auth_context:success", { reqId, currentCompanyId: nextCompanyId, roles: nextRoles });

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name, current_company_id, is_active")
      .eq("id", uid)
      .maybeSingle();
    if (profErr) {
      console.error("[auth-flow] profile:error", { reqId, profErr });
    } else {
      log("profile:success", { reqId, profile: prof });
    }

    return { roles: nextRoles, currentCompanyId: nextCompanyId, profile: (prof as AuthProfile) ?? null };
  };

  useEffect(() => {
    log("provider mounted");
    let active = true;
    let reqIdSeq = 0;
    let currentReqId = 0;

    const applySession = async (s: Session | null, source: string) => {
      const reqId = ++reqIdSeq;
      currentReqId = reqId;
      log("applySession:start", { reqId, source, user: s?.user?.email ?? null });
      setSession(s);
      if (!s?.user) {
        if (!active) return;
        setRoles([]);
        setCurrentCompanyId(null);
        setProfile(null);
        setLoading(false);
        setInitialized(true);
        log("state:commit (no user)", { reqId });
        return;
      }
      setLoading(true);
      try {
        const ctx = await loadAuthContext(s.user.id, reqId);
        if (!active || reqId !== currentReqId) {
          log("state:commit skipped (stale)", { reqId, currentReqId });
          return;
        }
        if (!ctx) {
          // RPC failed — keep previous state but mark initialized so UI can react
          setLoading(false);
          setInitialized(true);
          return;
        }
        setRoles(ctx.roles);
        setCurrentCompanyId(ctx.currentCompanyId);
        setProfile(ctx.profile);
        setLoading(false);
        setInitialized(true);
        log("state:commit", {
          reqId,
          currentCompanyId: ctx.currentCompanyId,
          roles: ctx.roles,
          loading: false,
          initialized: true,
        });
      } catch (e) {
        console.error("[auth-flow] applySession:exception", { reqId, e });
        if (active && reqId === currentReqId) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    // 1) Register listener FIRST so we never miss an event
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      log("auth event", { event, user: s?.user?.email ?? null });
      if (event === "INITIAL_SESSION") return;
      void applySession(s, `event:${event}`);
    });
    log("listener registered");

    // 2) Then read persisted session
    log("getSession:start");
    supabase.auth.getSession().then(({ data }) => {
      log("getSession:end", { user: data.session?.user?.email ?? null });
      if (active) void applySession(data.session, "getSession");
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refresh = async () => {
    if (!session?.user) return;
    const ctx = await loadAuthContext(session.user.id, -1);
    if (ctx) {
      setRoles(ctx.roles);
      setCurrentCompanyId(ctx.currentCompanyId);
      setProfile(ctx.profile);
    }
  };

  const switchCompany = async (companyId: string | null) => {
    if (!session?.user) return;
    const { error } = await (supabase as any).rpc("set_current_company", {
      _company_id: companyId,
    });
    if (error) throw error;
    setCurrentCompanyId(companyId);
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    initialized,
    roles,
    currentCompanyId,
    profile,
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
    isEmployee:
      !roles.some((r) => r.role === "super_admin") &&
      !roles.some(
        (r) => r.role === "manager" && (!currentCompanyId || r.company_id === currentCompanyId),
      ) &&
      roles.some((r) => r.role === "employee"),
    effectiveRole: roles.some((r) => r.role === "super_admin")
      ? "super_admin"
      : roles.some(
          (r) =>
            r.role === "manager" && (!currentCompanyId || r.company_id === currentCompanyId),
        )
      ? "manager"
      : roles.some((r) => r.role === "employee")
      ? "employee"
      : null,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
