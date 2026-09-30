export type ClubRole = "exec" | "admin";

export function isClubRole(value: unknown): value is ClubRole {
  return value === "exec" || value === "admin";
}

export type ClubAccount = {
  id: string;
  user_id: string | null;
  email: string;
  role: ClubRole;
  status: "pending" | "active";
  created_at: string;
};
