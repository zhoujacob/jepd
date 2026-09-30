"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isClubRole } from "@/lib/roles";

export type ManagementState = { error: string; success: string };

export async function approveAccount(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  await requireAdmin();
  const email = formData.get("email");
  const role = formData.get("role");
  if (
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return {
      error: "Enter the exact Google account email address.",
      success: "",
    };
  }
  if (!isClubRole(role)) return { error: "Choose Exec or Admin.", success: "" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_club_account", {
    account_email: email.trim().toLowerCase(),
    account_role: role,
  });
  if (error) {
    return {
      error:
        error.code === "P0001"
          ? error.message
          : "Unable to add access. Please try again.",
      success: "",
    };
  }

  revalidatePath("/execs");
  return {
    error: "",
    success: `Pending ${role} access saved for ${email.trim()}. Share the website link with them; no email was sent.`,
  };
}

export async function removeAccess(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  await requireAdmin();
  const approvalId = formData.get("approval_id");
  if (
    typeof approvalId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      approvalId,
    )
  ) {
    return { error: "Invalid access record.", success: "" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_club_access", {
    approval_id: approvalId,
  });
  if (error) {
    return {
      error:
        error.code === "P0001"
          ? error.message
          : "Unable to remove access. Refresh the page and try again.",
      success: "",
    };
  }

  revalidatePath("/execs");
  return { error: "", success: "Access removed." };
}
