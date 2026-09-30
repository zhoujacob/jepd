import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const DISCORD_STATE_COOKIE = "discord_connect_state";
const MAX_AGE_MS = 10 * 60 * 1000;
type ConnectionState = {
  nonce: string;
  userId: string;
  approvalId: string;
  expiresAt: number;
};

export function createDiscordState(
  userId: string,
  approvalId: string,
  secret: string,
  now = Date.now(),
) {
  const state: ConnectionState = {
    nonce: randomBytes(32).toString("hex"),
    userId,
    approvalId,
    expiresAt: now + MAX_AGE_MS,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return { nonce: state.nonce, cookie: `${payload}.${signature}` };
}

export function validateDiscordState(
  cookie: string | undefined,
  nonce: string | null,
  userId: string,
  secret: string,
  now = Date.now(),
): ConnectionState | null {
  if (!cookie || !nonce) return null;
  const [payload, signature, extra] = cookie.split(".");
  if (extra || !payload || !signature || !/^[a-f0-9]{64}$/.test(signature))
    return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (!timingSafeEqual(Buffer.from(signature, "hex"), expected)) return null;
  try {
    const state: ConnectionState = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    if (
      state.nonce !== nonce ||
      state.userId !== userId ||
      !state.approvalId ||
      !Number.isFinite(state.expiresAt) ||
      state.expiresAt <= now
    )
      return null;
    return state;
  } catch {
    return null;
  }
}

export function discordAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  nonce: string,
) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state: nonce,
    prompt: "consent",
  }).toString();
  return url.toString();
}

// Only provider-returned IDs are saved, never a user-entered Discord handle/ID.
export async function identifyDiscordAccount(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  request: typeof fetch = fetch,
) {
  const tokenResponse = await request("https://discord.com/api/oauth2/token", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) throw new Error("Discord authorization failed.");
  const token = await tokenResponse.json();
  if (typeof token.access_token !== "string" || !token.access_token)
    throw new Error("Missing Discord token.");
  const identityResponse = await request(
    "https://discord.com/api/v10/users/@me",
    {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token.access_token}` },
    },
  );
  if (!identityResponse.ok)
    throw new Error("Unable to verify Discord identity.");
  const identity = await identityResponse.json();
  if (
    typeof identity.id !== "string" ||
    !/^[0-9]{17,20}$/.test(identity.id) ||
    typeof identity.username !== "string" ||
    identity.username.length < 1 ||
    identity.username.length > 100
  )
    throw new Error("Invalid Discord identity.");
  // Access/refresh tokens remain in this request only; no token storage is needed for mentions.
  return { id: identity.id as string, username: identity.username as string };
}
