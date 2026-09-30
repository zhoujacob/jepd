import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDiscordState,
  validateDiscordState,
  discordAuthorizationUrl,
  identifyDiscordAccount,
} from "../src/lib/discord-oauth";

test("Discord state rejects forgery, wrong user, wrong nonce, and expired requests", () => {
  const state = createDiscordState(
    "user-one",
    "approval-one",
    "test-secret",
    1000,
  );
  assert.equal(
    validateDiscordState(
      state.cookie,
      state.nonce,
      "user-one",
      "test-secret",
      2000,
    )?.approvalId,
    "approval-one",
  );
  for (const [cookie, nonce, user, secret, now] of [
    [undefined, state.nonce, "user-one", "test-secret", 2000],
    [state.cookie, "wrong", "user-one", "test-secret", 2000],
    [state.cookie, state.nonce, "user-two", "test-secret", 2000],
    [state.cookie, state.nonce, "user-one", "other-secret", 2000],
    [state.cookie, state.nonce, "user-one", "test-secret", 601000],
    [`${state.cookie}extra`, state.nonce, "user-one", "test-secret", 2000],
  ] as const)
    assert.equal(validateDiscordState(cookie, nonce, user, secret, now), null);
  const [payload, signature] = state.cookie.split(".");
  const changed = JSON.parse(Buffer.from(payload, "base64url").toString());
  changed.approvalId = "another-approval";
  assert.equal(
    validateDiscordState(
      `${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`,
      state.nonce,
      "user-one",
      "test-secret",
      2000,
    ),
    null,
  );
});

test("Discord connection requests only identify and uses a fixed callback", () => {
  const url = new URL(
    discordAuthorizationUrl(
      "123",
      "https://club.example/auth/discord/callback",
      "nonce",
    ),
  );
  assert.equal(url.origin, "https://discord.com");
  assert.equal(url.searchParams.get("scope"), "identify");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "nonce");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://club.example/auth/discord/callback",
  );
});

test("Discord identity comes from authenticated provider response, tokens are not returned", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fake: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(
      calls.length === 1
        ? { access_token: "test-token", refresh_token: "test-refresh" }
        : { id: "123456789012345678", username: "test.exec" },
    );
  };
  const identity = await identifyDiscordAccount(
    "code",
    "client",
    "secret",
    "https://club.example/auth/discord/callback",
    fake,
  );
  assert.deepEqual(identity, {
    id: "123456789012345678",
    username: "test.exec",
  });
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(
    (calls[0].init?.body as URLSearchParams).get("redirect_uri"),
    "https://club.example/auth/discord/callback",
  );
  assert.equal(
    new Headers(calls[1].init?.headers).get("Authorization"),
    "Bearer test-token",
  );
  assert.equal(calls[1].url, "https://discord.com/api/v10/users/@me");
});

test("Discord failures and invalid IDs are rejected", async () => {
  await assert.rejects(
    identifyDiscordAccount(
      "code",
      "id",
      "secret",
      "uri",
      async () => new Response(null, { status: 401 }),
    ),
    /authorization failed/,
  );
  let count = 0;
  await assert.rejects(
    identifyDiscordAccount("code", "id", "secret", "uri", async () =>
      Response.json(
        ++count === 1
          ? { access_token: "token" }
          : { id: "@everyone", username: "bad" },
      ),
    ),
    /Invalid Discord identity/,
  );
});
