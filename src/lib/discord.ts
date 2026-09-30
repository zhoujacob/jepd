import "server-only";
import { getSiteOrigin } from "./site-url";

export function getDiscordConfig() {
  const origin = getSiteOrigin();
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin || !clientId || !clientSecret || !supabaseSecret || !supabaseUrl)
    return null;
  return {
    origin,
    clientId,
    clientSecret,
    supabaseSecret,
    supabaseUrl,
    redirectUri: `${origin}/auth/discord/callback`,
  };
}
