export type CompanyRole = "employee" | "manager" | "owner" | "super_admin" | string;

export type UserRoleAssignment = {
  company_id: string | null;
  role: CompanyRole;
  user_id: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeUserEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUserEmail(value: string): boolean {
  const normalized = normalizeUserEmail(value);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export function redactUserEmail(value: string): string {
  const normalized = normalizeUserEmail(value);
  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) return "***";
  return `${localPart.slice(0, 1)}***@${domain}`;
}

export function isValidEmailChangeReason(value: string): boolean {
  const reason = value.trim();
  return reason.length >= 5 && reason.length <= 500;
}

export function canApproveUserEmailChange({
  actorId,
  companyId,
  roles,
  targetUserId,
}: {
  actorId: string;
  companyId: string;
  roles: UserRoleAssignment[];
  targetUserId: string;
}): boolean {
  if (actorId === targetUserId) return false;

  const actorRoles = roles.filter((role) => role.user_id === actorId);
  const targetRoles = roles.filter((role) => role.user_id === targetUserId);
  const actorIsSuperAdmin = actorRoles.some((role) => role.role === "super_admin");
  const targetCompanyRole = targetRoles.find((role) => role.company_id === companyId)?.role;

  if (!targetCompanyRole) return false;
  if (actorIsSuperAdmin) return true;

  const actorCompanyRoles = actorRoles
    .filter((role) => role.company_id === companyId)
    .map((role) => role.role);
  if (actorCompanyRoles.includes("manager")) {
    return targetCompanyRole === "employee";
  }

  if (actorCompanyRoles.includes("owner")) {
    return targetCompanyRole === "manager" || targetCompanyRole === "employee";
  }

  return false;
}
