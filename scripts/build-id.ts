import { execFileSync } from "node:child_process";

export const BUILD_ID_TIME_ZONE = "America/Cuiaba";

export type GitRunner = (args: string[]) => string | null;

export function runGit(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function extractBuildId(value: string | null | undefined): string | null {
  return value?.match(/\b(\d{9})\b/)?.[1] ?? null;
}

export function formatBuildDate(date: Date, timeZone = BUILD_ID_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("day")}${value("month")}${value("year")}`;
}

export function nextBuildId(datePart: string, commitSubjects: string[]): string {
  const highestSequence = commitSubjects.reduce((highest, subject) => {
    const id = extractBuildId(subject);
    if (!id || !id.startsWith(datePart)) return highest;
    return Math.max(highest, Number(id.slice(6)));
  }, 0);
  const nextSequence = highestSequence + 1;

  if (nextSequence > 999) {
    throw new Error(`Limite diário de versões excedido para ${datePart}`);
  }

  return `${datePart}${String(nextSequence).padStart(3, "0")}`;
}

export function resolveBuildMetadata({
  env = process.env,
  git = runGit,
  now = new Date(),
  persistedBuildId,
}: {
  env?: NodeJS.ProcessEnv;
  git?: GitRunner;
  now?: Date;
  persistedBuildId?: string;
} = {}) {
  const subject = git(["show", "-s", "--format=%s", "HEAD"]);
  const subjects = (git(["log", "--format=%s"]) ?? "").split(/\r?\n/).filter(Boolean);
  const explicitBuildId = extractBuildId(env.VITE_BUILD_ID ?? env.APP_BUILD_ID);
  const subjectBuildId = extractBuildId(subject);
  const sourceBuildId = extractBuildId(persistedBuildId);
  const hasGitMetadata = Boolean(subject || subjects.length);
  const buildId =
    explicitBuildId ??
    subjectBuildId ??
    (hasGitMetadata ? nextBuildId(formatBuildDate(now), subjects) : (sourceBuildId ?? "local"));
  const commitSha =
    env.VITE_COMMIT_SHA ??
    env.CF_PAGES_COMMIT_SHA ??
    env.COMMIT_SHA ??
    env.GITHUB_SHA ??
    git(["rev-parse", "HEAD"]) ??
    "dev";

  return {
    buildId,
    buildTime: now.toISOString(),
    commitSha,
  };
}
