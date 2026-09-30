"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireExec } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDiscordConfig } from "@/lib/discord";
import {
  createDiscordState,
  discordAuthorizationUrl,
  DISCORD_STATE_COOKIE,
} from "@/lib/discord-oauth";

export async function connectDiscord() {
  const user = await requireExec();
  const config = getDiscordConfig();
  if (!config) redirect("/discord?error=setup");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_roles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (error || !data) redirect("/discord?error=access");
  const state = createDiscordState(user.id, data.id, config.clientSecret);
  (await cookies()).set(DISCORD_STATE_COOKIE, state.cookie, {
    httpOnly: true,
    secure: config.origin.startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  redirect(
    discordAuthorizationUrl(config.clientId, config.redirectUri, state.nonce),
  );
}

export async function disconnectDiscord() {
  await requireExec();
  (await cookies()).delete(DISCORD_STATE_COOKIE);
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_discord");
  if (error) redirect("/discord?error=disconnect");
  redirect("/discord?status=disconnected");
}
