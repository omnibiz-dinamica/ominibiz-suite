type AppVersionEnv = {
  VITE_BUILD_ID?: string;
  VITE_BUILD_TIME?: string;
  VITE_COMMIT_SHA?: string;
};

export type AppVersion = {
  buildId: string;
  buildTime: string;
  commitSha: string;
  shortCommitSha: string;
};

declare const __OMNIBIZ_BUILD_ID__: string | undefined;
declare const __OMNIBIZ_BUILD_TIME__: string | undefined;
declare const __OMNIBIZ_COMMIT_SHA__: string | undefined;

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveAppVersion(env: AppVersionEnv): AppVersion {
  const commitSha = clean(env.VITE_COMMIT_SHA) ?? "dev";

  return {
    buildId: clean(env.VITE_BUILD_ID) ?? "local",
    buildTime: clean(env.VITE_BUILD_TIME) ?? "dev",
    commitSha,
    shortCommitSha: commitSha === "dev" ? commitSha : commitSha.slice(0, 7),
  };
}

const runtimeEnv: AppVersionEnv =
  typeof __OMNIBIZ_BUILD_ID__ === "undefined"
    ? {}
    : {
        VITE_BUILD_ID: __OMNIBIZ_BUILD_ID__,
        VITE_BUILD_TIME: __OMNIBIZ_BUILD_TIME__,
        VITE_COMMIT_SHA: __OMNIBIZ_COMMIT_SHA__,
      };

export const APP_VERSION = Object.freeze(resolveAppVersion(runtimeEnv));

export function getAppVersion(): AppVersion {
  return APP_VERSION;
}
