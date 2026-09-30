"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getSiteOrigin } from "@/lib/site-url";

export type LoginState = { error: string };

export async function loginWithGoogle(): Promise<LoginState> {
  const origin = getSiteOrigin();
  if (!getSupabaseConfig() || !origin) {
    return {
      error: "Sign-in is not configured yet. Contact your club administrator.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url)
    return { error: "Unable to start Google sign-in. Please try again." };
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error("Unable to log out. Please try again.");
  redirect("/login");
}
