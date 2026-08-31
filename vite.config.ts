// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { resolveBuildMetadata } from "./scripts/build-id.ts";
import { SOURCE_BUILD_ID } from "./src/generated/build-metadata.ts";

const metadata = resolveBuildMetadata({ persistedBuildId: SOURCE_BUILD_ID });

export default defineConfig({
  vite: {
    define: {
      __OMNIBIZ_BUILD_ID__: JSON.stringify(metadata.buildId),
      __OMNIBIZ_BUILD_TIME__: JSON.stringify(metadata.buildTime),
      __OMNIBIZ_COMMIT_SHA__: JSON.stringify(metadata.commitSha),
    },
  },
});
