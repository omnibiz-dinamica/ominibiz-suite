export const CLIENT_TEAM_TYPES = ["habitual", "recurso"] as const;
export type ClientTeamType = (typeof CLIENT_TEAM_TYPES)[number];

export type ClientTeamMember = {
  user_id: string;
  assignment_type?: string | null;
  is_active?: boolean | null;
};

/** Legacy client links without the new column are operationally habitual. */
export function clientTeamType(member: Pick<ClientTeamMember, "assignment_type">): ClientTeamType {
  return member.assignment_type === "recurso" ? "recurso" : "habitual";
}

export function habitualClientMembers<T extends ClientTeamMember>(members: T[]): T[] {
  return members.filter((member) => clientTeamType(member) === "habitual");
}

export function resourceClientMembers<T extends ClientTeamMember>(members: T[]): T[] {
  return members.filter((member) => clientTeamType(member) === "recurso");
}

export function assignableClientMemberIds<T extends ClientTeamMember>(members: T[]): string[] {
  return habitualClientMembers(members)
    .filter((member) => member.is_active !== false)
    .map((member) => member.user_id);
}
