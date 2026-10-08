import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dailyShiftDurationMinutes } from "../src/lib/tasks/daily-shift-duration.ts";
import { notificationOpenLink, canOpenNotification } from "../src/lib/notification-actions.ts";

test("série 15:30→19:30 de 07/10 a 30/10 grava 240 min (datas da série ignoradas)", () => {
  assert.equal(dailyShiftDurationMinutes("15:30", "19:30"), 240);
  const form = readFileSync(new URL("../src/routes/app.tarefas.tsx", import.meta.url), "utf8");
  assert.match(form, /dailyShiftDurationMinutes\(startTime, endTime\)/);
});

test("turno noturno 22:00→06:00 grava 480", () => {
  assert.equal(dailyShiftDurationMinutes("22:00", "06:00"), 480);
});

test("nunca mais que 1440", () => {
  assert.equal(dailyShiftDurationMinutes("08:00", "08:00"), 1440);
  for (const [s, e] of [["00:00", "23:59"], ["23:59", "00:00"], ["12:00", "11:59"]]) {
    assert.ok(dailyShiftDurationMinutes(s, e) <= 1440);
  }
  assert.equal(dailyShiftDurationMinutes("", "10:00"), 0);
});

test("punch_regularized abre o link do metadata", () => {
  const n = { event: "punch_regularized", task_id: null, metadata: { link: "/app/ponto" } };
  assert.equal(notificationOpenLink(n), "/app/ponto");
  assert.equal(canOpenNotification(n, false), true);
  assert.equal(notificationOpenLink({ event: "punch_regularized", metadata: { link: "https://evil.com" } }), null);
  assert.equal(notificationOpenLink({ event: "punch_regularized", metadata: { link: "//evil.com" } }), null);
  assert.equal(canOpenNotification({ event: "punch_regularized", metadata: {} }, false), true);
});
