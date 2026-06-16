/**
 * Canonical helper for the public application URL used in emails and any
 * link that must work for an external recipient.
 *
 * Order of precedence:
 * 1. VITE_APP_URL (set in .env / hosting environment)
 * 2. Hard-coded production URL fallback
 *
 * NEVER use window.location.origin to build URLs that ship inside emails —
 * that leaks the Lovable Preview host (id-preview--*.lovable.app) into
 * messages sent to real users.
 */
const PRODUCTION_FALLBACK = "https://ominibiz-suite.lovable.app";

export function getAppBaseUrl(): string {
  const fromEnv = (import.meta as any)?.env?.VITE_APP_URL as string | undefined;
  const raw = (fromEnv && fromEnv.trim()) || PRODUCTION_FALLBACK;
  return raw.replace(/\/+$/, "");
}

export function buildAppUrl(path: string): string {
  const base = getAppBaseUrl();
  if (!path) return base;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}