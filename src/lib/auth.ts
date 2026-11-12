import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { isClubRole } from "@/lib/roles";

// React cache deduplicates checks within a request, never across users/requests.
export const getExec = cache(async () => {
  if (!getSupabaseConfig()) return null;
  const supabase = await createClient();
  // Both checks must pass, and neither needs the other's result, so they share
  // one round trip instead of running back to back.
  const [
    {
      data: { user },
      error,
    },
    { data: role, error: roleError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_club_role"),
  ]);
  if (error || !user?.email_confirmed_at) return null;
  if (roleError || !isClubRole(role)) return null;
  return { ...user, role };
});

export async function requireExec() {
  const user = await getExec();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireExec();
  if (user.role !== "admin") redirect("/home");
  return user;
}
