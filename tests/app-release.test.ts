import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  APP_RELEASE,
  appReleaseLabel,
  appVersionDetails,
  formatBuildTime,
  isValidRelease,
} from "../src/lib/app-release.ts";

const layout = readFileSync(new URL("../src/components/AppLayout.tsx", import.meta.url), "utf8");

test("versão atual está no formato MAIOR.MENOR.CORREÇÃO", () => {
  assert.ok(isValidRelease(APP_RELEASE), APP_RELEASE);
  assert.equal(appReleaseLabel("1.1.0"), "v1.1.0");
  assert.equal(isValidRelease("1.1"), false);
  assert.equal(isValidRelease("v1.1.0"), false);
});

test("data do build em hora de Lisboa; sem data mostra traço", () => {
  assert.equal(formatBuildTime("2026-11-02T17:55:00.000Z"), "02/11/2026, 17:55");
  assert.equal(formatBuildTime("dev"), "—");
  assert.equal(formatBuildTime(""), "—");
});

test("detalhes juntam versão, build, data e commit", () => {
  const details = appVersionDetails(
    {
      buildId: "021126001",
      buildTime: "2026-11-02T17:55:00.000Z",
      commitSha: "abcdef1234567",
      shortCommitSha: "abcdef1",
    },
    "1.1.0",
  );
  assert.equal(
    details,
    "OmniBiz v1.1.0 · build 021126001 · gerado em 02/11/2026, 17:55 · commit abcdef1",
  );
});

test("versão aparece ao lado do logótipo (mesmo componente no desktop e no mobile)", () => {
  const logo = layout.indexOf('alt="Dinâmica Solução"');
  const release = layout.indexOf('data-testid="app-release"');
  assert.ok(logo > 0 && release > logo, "versão logo a seguir ao logótipo");
  assert.match(layout, /\{appReleaseLabel\(\)\}/);
  assert.match(layout, /title=\{appVersionDetails\(getAppVersion\(\)\)\}/);
  assert.doesNotMatch(layout, /\bv1 · build/);
});
