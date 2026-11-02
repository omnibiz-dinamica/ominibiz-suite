import type { AppVersion } from "./app-version";

/**
 * Versão do OmniBiz mostrada a todos os utilizadores, ao lado do logótipo.
 *
 * Formato MAIOR.MENOR.CORREÇÃO, atualizado à mão antes de cada Publish:
 *  - só correções (tickets): CORREÇÃO + 1          (1.1.0 -> 1.1.1)
 *  - funcionalidade nova:    MENOR + 1, CORREÇÃO 0  (1.1.1 -> 1.2.0)
 *  - mudança grande:         MAIOR + 1              (1.x.x -> 2.0.0)
 *
 * O build, a data do build e o commit continuam em app-version.ts e aparecem
 * só nos detalhes (ao passar o rato), para diagnóstico e suporte.
 */
export const APP_RELEASE = "1.1.0";

const RELEASE_PATTERN = /^\d+\.\d+\.\d+$/;

export function isValidRelease(release: string): boolean {
  return RELEASE_PATTERN.test(release);
}

/** Rótulo curto visível: "v1.1.0". */
export function appReleaseLabel(release: string = APP_RELEASE): string {
  return `v${release}`;
}

/** Data/hora do build em hora de Lisboa; "—" quando não há data (ambiente local). */
export function formatBuildTime(buildTime: string): string {
  const date = new Date(buildTime);
  if (!buildTime || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Texto dos detalhes (tooltip): versão, build, data do build e commit. */
export function appVersionDetails(version: AppVersion, release: string = APP_RELEASE): string {
  return [
    `OmniBiz ${appReleaseLabel(release)}`,
    `build ${version.buildId}`,
    `gerado em ${formatBuildTime(version.buildTime)}`,
    `commit ${version.shortCommitSha}`,
  ].join(" · ");
}
