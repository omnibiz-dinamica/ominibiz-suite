import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageNotification,
  resolveNotificationActions,
} from "../src/lib/notification-actions.ts";

test("employee sees only open and archive for an active notification", () => {
  assert.deepEqual(resolveNotificationActions({ canManage: false, canOpen: true, state: "nova" }), {
    open: true,
    treat: false,
    forward: false,
    resolve: false,
    archive: true,
    restore: false,
  });
});

test("employee cannot restore or run administrative actions", () => {
  assert.deepEqual(
    resolveNotificationActions({ canManage: false, canOpen: true, state: "arquivada" }),
    {
      open: true,
      treat: false,
      forward: false,
      resolve: false,
      archive: false,
      restore: false,
    },
  );
});

test("manager and super admin context retain administrative actions", () => {
  const actions = resolveNotificationActions({ canManage: true, canOpen: true, state: "nova" });

  assert.deepEqual(actions, {
    open: true,
    treat: true,
    forward: true,
    resolve: true,
    archive: true,
    restore: false,
  });
});

test("manager can restore an archived notification", () => {
  const actions = resolveNotificationActions({
    canManage: true,
    canOpen: false,
    state: "arquivada",
  });

  assert.equal(actions.restore, true);
  assert.equal(actions.archive, false);
  assert.equal(actions.treat, false);
  assert.equal(actions.forward, false);
  assert.equal(actions.resolve, false);
});

test("manager actions follow the active company", () => {
  assert.equal(
    canManageNotification({
      currentCompanyId: "company-a",
      isManager: true,
      isSuperAdmin: false,
      notificationCompanyId: "company-a",
    }),
    true,
  );
  assert.equal(
    canManageNotification({
      currentCompanyId: "company-b",
      isManager: false,
      isSuperAdmin: false,
      notificationCompanyId: "company-a",
    }),
    false,
  );
});

test("super admin retains administrative actions across company context", () => {
  assert.equal(
    canManageNotification({
      currentCompanyId: "company-b",
      isManager: true,
      isSuperAdmin: true,
      notificationCompanyId: "company-a",
    }),
    true,
  );
});
