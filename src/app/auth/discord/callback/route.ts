import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getExec } from "@/lib/auth";
import { getDiscordConfig } from "@/lib/discord";
import {
  DISCORD_STATE_COOKIE,
  validateDiscordState,
  identifyDiscordAccount,
} from "@/lib/discord-oauth";

export async function GET(request: NextRequest) {
  const config = getDiscordConfig();
  if (!config)
    return new NextResponse("Discord connection is not configured.", {
      status: 503,
    });
  const origin = config.origin;

  function finish(path: string) {
    const response = NextResponse.redirect(new URL(path, origin));
    response.cookies.delete(DISCORD_STATE_COOKIE);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const user = await getExec();
  if (!user) return finish("/login");
  const state = validateDiscordState(
    request.cookies.get(DISCORD_STATE_COOKIE)?.value,
    request.nextUrl.searchParams.get("state"),
    user.id,
    config.clientSecret,
  );
  if (!state) return finish("/discord?error=state");
  if (request.nextUrl.searchParams.has("error"))
    return finish("/discord?error=cancelled");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return finish("/discord?error=oauth");
  try {
    const identity = await identifyDiscordAccount(
      code,
      config.clientId,
      config.clientSecret,
      config.redirectUri,
    );
    // Isolated privileged client: never reads browser cookies or takes a submitted user/Discord ID.
    const admin = createClient(config.supabaseUrl, config.supabaseSecret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { error } = await admin.rpc("save_discord_connection", {
      account_id: user.id,
      approval_id: state.approvalId,
      discord_id: identity.id,
      discord_name: identity.username,
    });
    if (error)
      return finish(
        error.code === "23505"
          ? "/discord?error=used"
          : "/discord?error=access",
      );
    return finish("/discord?status=connected");
  } catch {
    // Never expose provider responses, codes, tokens, or secrets to the browser/logs.
    return finish("/discord?error=oauth");
  }
}
