import assert from "node:assert/strict";
import test from "node:test";

import {
  canApproveUserEmailChange,
  isValidEmailChangeReason,
  isValidUserEmail,
  normalizeUserEmail,
  redactUserEmail,
  type UserRoleAssignment,
} from "../src/lib/user-email-security.ts";

const roles: UserRoleAssignment[] = [
  { user_id: "manager-a", role: "manager", company_id: "company-a" },
  { user_id: "manager-a2", role: "manager", company_id: "company-a" },
  { user_id: "owner-a", role: "owner", company_id: "company-a" },
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

test("manager can approve another account holder in the same company", () => {
  assert.equal(
    canApproveUserEmailChange({
      actorId: "manager-a",
      companyId: "company-a",
      roles,
      targetUserId: "employee-a",
    }),
    true,
  );
});

test("manager cannot approve across tenants, a manager or their own request", () => {
  assert.equal(
    canApproveUserEmailChange({
      actorId: "manager-a",
      companyId: "company-b",
      roles,
      targetUserId: "employee-b",
    }),
    false,
  );
  assert.equal(
    canApproveUserEmailChange({
      actorId: "manager-a",
      companyId: "company-a",
      roles,
      targetUserId: "manager-a2",
    }),
    false,
  );
  assert.equal(
    canApproveUserEmailChange({
      actorId: "manager-a",
      companyId: "company-a",
      roles,
      targetUserId: "manager-a",
    }),
    false,
  );
});

test("owner can approve managers and employees in the same company", () => {
  assert.equal(
    canApproveUserEmailChange({
      actorId: "owner-a",
      companyId: "company-a",
      roles,
      targetUserId: "manager-a",
    }),
    true,
  );
});

test("super admin can approve another account holder", () => {
  assert.equal(
    canApproveUserEmailChange({
      actorId: "super",
      companyId: "company-b",
      roles,
      targetUserId: "employee-b",
    }),
    true,
  );
});

test("email change reason is required and bounded", () => {
  assert.equal(isValidEmailChangeReason("troca"), true);
  assert.equal(isValidEmailChangeReason("curt"), false);
  assert.equal(isValidEmailChangeReason("x".repeat(501)), false);
});
