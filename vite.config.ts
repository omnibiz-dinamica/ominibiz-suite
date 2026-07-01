// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Build-time diagnostics: expose build timestamp + commit (when available)
// to the client via import.meta.env.VITE_BUILD_* so we can compare deployments.
const buildTime = new Date().toISOString();
const commit =
  process.env.VITE_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  "dev";

process.env.VITE_BUILD_TIME = buildTime;
process.env.VITE_COMMIT_SHA = commit;

export default defineConfig();
