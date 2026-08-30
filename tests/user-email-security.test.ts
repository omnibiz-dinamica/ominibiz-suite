import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageUserEmail,
  isValidUserEmail,
  normalizeUserEmail,
  redactUserEmail,
  type UserRoleAssignment,
} from "../src/lib/user-email-security.ts";

const roles: UserRoleAssignment[] = [
  { user_id: "manager-a", role: "manager", company_id: "company-a" },
  { user_id: "employee-a", role: "employee", company_id: "company-a" },
  { user_id: "manager-b", role: "manager", company_id: "company-b" },
  { user_id: "employee-b", role: "employee", company_id: "company-b" },
  { user_id: "super", role: "super_admin", company_id: null },
];

test("normalizes, validates and redacts email without changing identity semantics", () => {
  assert.equal(normalizeUserEmail("  User@Example.COM "), "user@example.com");
  assert.equal(isValidUserEmail("user@example.com"), true);
  assert.equal(isValidUserEmail("invalid"), false);
  assert.equal(redactUserEmail("user@example.com"), "u***@example.com");
});

test("manager can change an employee email in the same company", () => {
  assert.equal(
    canManageUserEmail({
      actorId: "manager-a",
      companyId: "company-a",
      roles,
      targetUserId: "employee-a",
    }),
    true,
  );
});

test("manager cannot change email across tenants or for another manager", () => {
  assert.equal(
    canManageUserEmail({
      actorId: "manager-a",
      companyId: "company-b",
      roles,
      targetUserId: "employee-b",
    }),
    false,
  );
  assert.equal(
    canManageUserEmail({
      actorId: "manager-a",
      companyId: "company-a",
      roles,
      targetUserId: "manager-a",
    }),
    false,
  );
});

test("super admin retains administrative access", () => {
  assert.equal(
    canManageUserEmail({
      actorId: "super",
      companyId: "company-b",
      roles,
      targetUserId: "employee-b",
    }),
    true,
  );
});
