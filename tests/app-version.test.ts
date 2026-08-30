import assert from "node:assert/strict";
import test from "node:test";

import {
  extractBuildId,
  formatBuildDate,
  nextBuildId,
  resolveBuildMetadata,
  type GitRunner,
} from "../scripts/build-id.ts";
import { resolveAppVersion } from "../src/lib/app-version.ts";

test("extracts the nine-digit build id from the commit subject", () => {
  assert.equal(extractBuildId("300826001 feat(platform): versioning"), "300826001");
});

test("increments the daily sequence", () => {
  assert.equal(
    nextBuildId("300826", ["300826001 first", "unrelated", "300826002 second"]),
    "300826003",
  );
});

test("formats the date in the OmniBiz timezone", () => {
  assert.equal(formatBuildDate(new Date("2026-08-30T04:00:00.000Z")), "300826");
});

test("build metadata prefers the id recorded in the current commit", () => {
  const responses = new Map<string, string>([
    ["show -s --format=%s HEAD", "300826001 feat(platform): versioning"],
    ["log --format=%s", "300826001 feat(platform): versioning"],
    ["rev-parse HEAD", "abcdef1234567890"],
  ]);
  const git: GitRunner = (args) => responses.get(args.join(" ")) ?? null;

  assert.deepEqual(
    resolveBuildMetadata({ env: {}, git, now: new Date("2026-08-30T15:00:00.000Z") }),
    {
      buildId: "300826001",
      buildTime: "2026-08-30T15:00:00.000Z",
      commitSha: "abcdef1234567890",
    },
  );
});

test("build metadata uses the update date before the new commit exists", () => {
  const responses = new Map<string, string>([
    ["show -s --format=%s HEAD", "fix: previous update without sequential id"],
    ["log --format=%s", "290826004 fix: previous update"],
    ["rev-parse HEAD", "abcdef1234567890"],
  ]);
  const git: GitRunner = (args) => responses.get(args.join(" ")) ?? null;

  assert.equal(
    resolveBuildMetadata({ env: {}, git, now: new Date("2026-08-30T15:00:00.000Z") }).buildId,
    "300826001",
  );
});

test("frontend version keeps build id and git sha as separate values", () => {
  assert.deepEqual(
    resolveAppVersion({
      VITE_BUILD_ID: "300826001",
      VITE_BUILD_TIME: "2026-08-30T15:00:00.000Z",
      VITE_COMMIT_SHA: "abcdef1234567890",
    }),
    {
      buildId: "300826001",
      buildTime: "2026-08-30T15:00:00.000Z",
      commitSha: "abcdef1234567890",
      shortCommitSha: "abcdef1",
    },
  );
});
