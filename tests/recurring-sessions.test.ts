import assert from "node:assert/strict";
import { initializeDatabase } from "./database";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { addDays, clubToday, weekStart } from "../src/lib/sessions";

const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001";
const exec = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const outsider = "00000000-0000-4000-8000-000000000004";
let sessionId: string;

before(() => initializeDatabase(db));
after(() => db.close());
beforeEach(async () => {
  await db.exec(
    "reset role; delete from public.club_sessions; delete from public.session_schedules; delete from public.club_roles; delete from auth.users",
  );
  await db.exec(`
    truncate net.requests, net._http_response, vault.decrypted_secrets;
    insert into vault.decrypted_secrets values ('discord_session_webhook', 'https://discord.com/api/webhooks/123/fake-test-token');
  `);
  for (const [id, email, role] of [
    [admin, "admin@example.com", "admin"],
    [exec, "exec@example.com", "exec"],
    [other, "other@example.com", "exec"],
    [outsider, "outsider@example.com", null],
  ]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())",
      [id, email],
    );
    await db.query("insert into auth.identities values ($1,'google',$2)", [
      id,
      JSON.stringify({ email, email_verified: true }),
    ]);
    if (role)
      await db.query(
        "insert into public.club_roles(email,user_id,role) values ($1,$2,$3)",
        [email, id, role],
      );
  }
  await db.exec(
    "insert into public.club_roles(email,role) values ('pending@example.com','exec')",
  );
  sessionId = (
    await db.query<{ id: string }>(
      "insert into public.club_sessions(session_date,starts_at,ends_at,created_by) values ('2026-10-26','19:00','21:00',$1) returning id",
      [exec],
    )
  ).rows[0].id;
});
async function asUser<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec(id ? "set role authenticated" : "set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function respond(response: string | null) {
  await db.query("select public.set_session_availability($1,$2)", [
    sessionId,
    response,
  ]);
}

async function futureWeek() {
  const today = (
    await db.query<{ day: string }>(
      "select (now() at time zone 'America/Toronto')::date::text as day",
    )
  ).rows[0].day;
  return addDays(weekStart(today), 7);
}
async function createSchedule(day = 1, start = "19:00", end = "21:00") {
  await asUser(exec, () =>
    db.query("select public.save_session_schedule($1,$2,$3)", [
      day,
      start,
      end,
    ]),
  );
  return (
    await db.query<{ id: string }>(
      "select id from public.session_schedules where ends_on is null order by weekday",
    )
  ).rows[0].id;
}
async function setDefault(id: string, response: string, as = exec) {
  await asUser(as, () =>
    db.query("select public.save_session_defaults($1)", [
      JSON.stringify([{ schedule_id: id, response }]),
    ]),
  );
}
type Snapshot = {
  sessions: {
    id: string;
    session_date: string;
    schedule_id: string | null;
    starts_at: string;
  }[];
  responses: { session_id: string; user_id: string; response: string | null }[];
  defaults: { user_id: string; response: string }[];
};
async function board(week: string, as = exec) {
  return asUser(
    as,
    async () =>
      (
        await db.query<{ value: Snapshot }>(
          "select public.get_session_week($1) as value",
          [week],
        )
      ).rows[0].value,
  );
}

test("recurring APIs deny anonymous and non-club users; direct writes cannot bypass checks", async () => {
  for (const who of [null, outsider])
    await asUser(who, async () => {
      for (const sql of [
        "select public.get_session_week('2026-09-28')",
        "select public.save_session_schedule(1,'19:00','21:00')",
        "select public.stop_session_schedule('00000000-0000-4000-8000-000000000099')",
        "select public.save_session_defaults('[]')",
        "select public.add_extra_session('2026-09-28','19:00','21:00')",
        "select public.cancel_club_session('00000000-0000-4000-8000-000000000099')",
      ])
        await assert.rejects(
          db.query(sql),
          who ? /Club access required/ : /permission denied/,
        );
    });
  await asUser(exec, async () => {
    await assert.rejects(
      db.query(
        "insert into public.session_schedules(weekday,starts_at,ends_at) values (1,'19:00','21:00')",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.club_sessions"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update public.session_availability set response='yes'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.copy_sessions_to_next_week('2026-09-28')"),
      /does not exist/,
    );
    await assert.rejects(
      db.query("select public.get_session_week('2026-09-29')"),
      /valid week/,
    );
  });
});

test("weeks repeat idempotently and autofill each exec's own defaults", async () => {
  const schedule = await createSchedule();
  const week = await futureWeek();
  assert.equal((await board(week)).responses.length, 0);
  await setDefault(schedule, "yes");
  await setDefault(schedule, "maybe", other);
  const first = await board(week);
  const again = await board(week);
  assert.deepEqual(again, first);
  assert.equal(
    first.sessions.filter((s) => s.schedule_id === schedule).length,
    1,
  );
  assert.equal(
    first.responses.find((r) => r.user_id === exec)?.response,
    "yes",
  );
  assert.equal(
    first.responses.find((r) => r.user_id === other)?.response,
    "maybe",
  );
  assert.deepEqual(
    first.defaults.map((d) => d.user_id),
    [exec],
  );
  const next = await board(addDays(week, 7));
  assert.equal(next.sessions[0].session_date, addDays(week, 7));
  assert.equal(next.responses.find((r) => r.user_id === exec)?.response, "yes");
});

test("date exceptions and cleared dates survive defaults and reopening", async () => {
  const schedule = await createSchedule();
  const week = await futureWeek();
  await setDefault(schedule, "yes");
  const first = await board(week);
  sessionId = first.sessions.find((s) => s.schedule_id === schedule)!.id;
  await asUser(exec, () => respond("no"));
  await setDefault(schedule, "maybe");
  assert.equal(
    (await board(week)).responses.find((r) => r.user_id === exec)?.response,
    "no",
  );
  await asUser(exec, () => respond(null));
  assert.equal(
    (await board(week)).responses.find((r) => r.user_id === exec)?.response,
    null,
  );
  assert.equal(
    (await board(addDays(week, 7))).responses.find((r) => r.user_id === exec)
      ?.response,
    "maybe",
  );
  await setDefault(schedule, "no");
  assert.equal(
    (await board(addDays(week, 7))).responses.find((r) => r.user_id === exec)
      ?.response,
    "maybe",
  );
  await setDefault(schedule, "");
  assert.equal((await board(addDays(week, 14))).responses.length, 0);
});

test("defaults do not backfill history", async () => {
  const schedule = await createSchedule();
  const past = addDays(weekStart(clubToday()), -7);
  await db.query(
    "update public.session_schedules set starts_on=$1 where id=$2",
    [past, schedule],
  );
  await setDefault(schedule, "yes");
  const snapshot = await board(past);
  assert.ok(snapshot.sessions.some((s) => s.schedule_id === schedule));
  assert.equal(snapshot.responses.length, 0);
});

test("cancelling one date never regenerates it and leaves other weeks intact", async () => {
  const schedule = await createSchedule();
  const week = await futureWeek();
  const target = (await board(week)).sessions.find(
    (s) => s.schedule_id === schedule,
  )!;
  await asUser(other, () =>
    assert.rejects(
      db.query("select public.cancel_club_session($1)", [target.id]),
      /own sessions/,
    ),
  );
  await asUser(exec, () =>
    db.query("select public.cancel_club_session($1)", [target.id]),
  );
  assert.equal(
    (await board(week)).sessions.filter((s) => s.schedule_id === schedule)
      .length,
    0,
  );
  assert.equal(
    (await board(addDays(week, 7))).sessions.filter(
      (s) => s.schedule_id === schedule,
    ).length,
    1,
  );
  sessionId = target.id;
  await asUser(exec, () => assert.rejects(respond("yes"), /cancelled/));
});

test("time changes start a fresh series without defaults, and stopping preserves history", async () => {
  const schedule = await createSchedule();
  const week = await futureWeek();
  const past = addDays(weekStart(clubToday()), -7);
  await db.query(
    "update public.session_schedules set starts_on=$1 where id=$2",
    [past, schedule],
  );
  const history = await board(past);
  await setDefault(schedule, "yes");
  const upcoming = await board(week);
  await asUser(other, () =>
    assert.rejects(
      db.query("select public.save_session_schedule(1,'18:00','20:00',$1)", [
        schedule,
      ]),
      /own schedules/,
    ),
  );
  // A no-op edit keeps the same series and answers.
  await asUser(exec, () =>
    db.query("select public.save_session_schedule(1,'19:00','21:00',$1)", [
      schedule,
    ]),
  );
  assert.deepEqual(await board(week), upcoming);
  await asUser(admin, () =>
    db.query("select public.save_session_schedule(1,'18:00','20:00',$1)", [
      schedule,
    ]),
  );
  const changed = await board(week);
  const replacement = changed.sessions.find((s) => s.schedule_id !== null)!;
  assert.notEqual(replacement.schedule_id, schedule);
  assert.equal(replacement.starts_at, "18:00:00");
  assert.equal(changed.responses.length, 0);
  assert.deepEqual((await board(past)).sessions, history.sessions);
  await asUser(other, () =>
    assert.rejects(
      db.query("select public.stop_session_schedule($1)", [
        replacement.schedule_id,
      ]),
      /own schedules/,
    ),
  );
  await asUser(admin, () =>
    db.query("select public.stop_session_schedule($1)", [
      replacement.schedule_id,
    ]),
  );
  assert.equal(
    (await board(week)).sessions.filter((s) => s.schedule_id !== null).length,
    0,
  );
  assert.deepEqual((await board(past)).sessions, history.sessions);
});

test("duplicate schedules, invalid defaults and invalid times roll back safely", async () => {
  const schedule = await createSchedule();
  await asUser(exec, async () => {
    await assert.rejects(
      db.query("select public.save_session_schedule(1,'19:00','21:00')"),
      /unique constraint/,
    );
    await assert.rejects(
      db.query("select public.save_session_schedule(9,'19:00','21:00')"),
      /check constraint/,
    );
    await assert.rejects(
      db.query("select public.save_session_schedule(1,'21:00','19:00',$1)", [
        schedule,
      ]),
      /check constraint/,
    );
    await assert.rejects(
      db.query("select public.save_session_defaults($1)", [
        JSON.stringify([{ schedule_id: schedule, response: "invalid" }]),
      ]),
      /check constraint/,
    );
    await assert.rejects(db.query("select public.save_session_defaults('{}')"));
  });
  assert.equal(
    (
      await db.query(
        "select * from public.session_schedules where ends_on is null",
      )
    ).rows.length,
    1,
  );
});

test("defaults cannot be assigned to others and revocation removes defaults and responses", async () => {
  const schedule = await createSchedule();
  await asUser(exec, async () => {
    await db.query("select public.save_session_defaults($1)", [
      JSON.stringify([
        { schedule_id: schedule, response: "yes", user_id: other },
      ]),
    ]);
    assert.deepEqual(
      (await db.query("select user_id from public.session_defaults")).rows,
      [{ user_id: exec }],
    );
    await assert.rejects(
      db.query("delete from public.session_defaults"),
      /permission denied/,
    );
  });
  assert.equal((await board(await futureWeek(), other)).defaults.length, 0);
  await db.query("delete from public.club_roles where user_id=$1", [exec]);
  assert.equal(
    (await db.query("select * from public.session_defaults")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.session_availability")).rows.length,
    0,
  );
  await asUser(exec, () =>
    assert.rejects(
      db.query("select public.save_session_defaults('[]')"),
      /Club access required/,
    ),
  );
});

test("extra dates coexist with schedules and existing matching sessions are preserved", async () => {
  const week = await futureWeek();
  await asUser(other, () =>
    db.query("select public.add_extra_session($1,'19:00','21:00')", [week]),
  );
  await createSchedule();
  const snapshot = await board(week);
  assert.equal(
    snapshot.sessions.filter((s) => s.session_date === week).length,
    1,
  );
  assert.equal(
    snapshot.sessions.find((s) => s.session_date === week)?.schedule_id,
    null,
  );
});

test("time updates enforce ownership, validate times, and preserve answers on failure", async () => {
  await asUser(exec, () => respond("yes"));
  for (const who of [null, outsider, other]) {
    await assert.rejects(
      asUser(who, () =>
        db.query("select public.update_session_time($1,'18:00','20:00')", [
          sessionId,
        ]),
      ),
    );
  }
  await assert.rejects(
    asUser(exec, () =>
      db.query("select public.update_session_time($1,'22:00','20:00')", [
        sessionId,
      ]),
    ),
  );
  await asUser(exec, () =>
    db.query("select public.update_session_time($1,'19:00','21:00')", [
      sessionId,
    ]),
  );
  assert.equal(
    (await db.query("select response from public.session_availability")).rows
      .length,
    1,
  );
  await asUser(admin, () =>
    db.query("select public.update_session_time($1,'18:00','20:00')", [
      sessionId,
    ]),
  );
  assert.equal(
    (await db.query("select response from public.session_availability")).rows
      .length,
    0,
  );
});

test("changing one occurrence clears answers without autofilling or changing other weeks", async () => {
  const schedule = await createSchedule();
  await setDefault(schedule, "yes");
  const week = await futureWeek();
  const before = await board(week);
  const occurrence = before.sessions.find((s) => s.schedule_id === schedule)!;
  assert.ok(before.responses.some((r) => r.session_id === occurrence.id));
  await asUser(exec, () =>
    db.query("select public.update_session_time($1,'18:00','20:00')", [
      occurrence.id,
    ]),
  );
  const after = await board(week);
  assert.equal(
    after.sessions.find((s) => s.id === occurrence.id)?.starts_at,
    "18:00:00",
  );
  assert.equal(
    after.responses.filter((r) => r.session_id === occurrence.id).length,
    0,
  );
  const next = await board(addDays(week, 7));
  assert.equal(
    next.sessions.find((s) => s.schedule_id === schedule)?.starts_at,
    "19:00:00",
  );
  assert.ok(next.responses.some((r) => r.response === "yes"));
});

// These fixed timestamps exercise Waterloo time independently of the test runner's clock.
async function reminderSession(
  date: string,
  answers: (string | null)[] = [],
  start = "19:00",
) {
  const id = (
    await db.query<{ id: string }>(
      "insert into public.club_sessions(session_date, starts_at, ends_at, created_by) values ($1,$2,'21:00',$3) returning id",
      [date, start, exec],
    )
  ).rows[0].id;
  for (const [index, response] of answers.entries()) {
    await db.query(
      "insert into public.session_availability(session_id,user_id,response) values ($1,$2,$3)",
      [id, [exec, other, admin][index], response],
    );
  }
  return id;
}
async function tick(at: string, hour = 9) {
  return (
    await db.query<{ queued: number }>(
      "select private.send_discord_session_reminders($1,$2) as queued",
      [hour, at],
    )
  ).rows[0].queued;
}
async function discordMessages() {
  return (
    await db.query<{
      body: {
        content: string;
        allowed_mentions: { parse: string[]; users: string[] };
      };
    }>("select body from net.requests order by id")
  ).rows.map((row) => row.body);
}

test("Discord warns for zero/one Yes tomorrow and reminds only covered sessions today", async () => {
  await reminderSession("2027-01-11", ["maybe", "no", null]);
  await reminderSession("2027-01-11", ["yes"], "18:00");
  await reminderSession("2027-01-11", ["yes", "yes"], "17:00");
  await reminderSession("2027-01-10", ["yes", "yes"]);
  await reminderSession("2027-01-10", ["yes"], "18:00");
  assert.equal(await tick("2027-01-10T14:00:00Z"), 3);
  const messages = await discordMessages();
  assert.ok(messages.some((m) => m.content.includes("No execs")));
  assert.ok(messages.some((m) => m.content.includes("could use some backup")));
  assert.ok(messages.some((m) => m.content.includes("2 execs attending")));
  for (const message of messages) {
    const isToday = message.content.startsWith("Today's session");
    assert.equal(message.content.startsWith("@everyone "), !isToday);
    assert.deepEqual(
      message.allowed_mentions.parse,
      isToday ? [] : ["everyone"],
    );
    assert.ok(!message.content.includes("example.com"));
  }
  assert.equal(await tick("2027-01-10T14:05:00Z"), 0);
});

test("Discord uses local hours across DST and supports a different day-before hour", async () => {
  await reminderSession("2027-07-12");
  assert.equal(await tick("2027-07-11T12:55:00Z"), 0);
  assert.equal(await tick("2027-07-11T13:00:00Z", 18), 0);
  assert.equal(await tick("2027-07-11T22:00:00Z", 18), 1);
  await reminderSession("2027-03-15");
  assert.equal(await tick("2027-03-14T12:55:00Z"), 0);
  assert.equal(await tick("2027-03-14T13:00:00Z"), 1);
  await reminderSession("2027-11-08");
  assert.equal(await tick("2027-11-07T13:00:00Z"), 0);
  assert.equal(await tick("2027-11-07T14:00:00Z"), 1);
});

test("Discord generates unopened recurring dates across Sunday/Monday and respects defaults", async () => {
  const schedule = await createSchedule(1);
  await db.query(
    "update public.session_schedules set starts_on='2027-01-01' where id=$1",
    [schedule],
  );
  await setDefault(schedule, "yes");
  await setDefault(schedule, "yes", other);
  assert.equal(await tick("2027-01-10T14:00:00Z"), 0);
  assert.equal(
    (
      await db.query(
        "select * from public.club_sessions where session_date='2027-01-11'",
      )
    ).rows.length,
    1,
  );
  assert.equal(await tick("2027-01-11T14:00:00Z"), 1);
  assert.ok((await discordMessages())[0].content.includes("2 execs attending"));
});

test("Discord skips cancelled, stopped, past and out-of-window sessions", async () => {
  const cancelled = await reminderSession("2027-01-11");
  await db.query("update public.club_sessions set cancelled=true where id=$1", [
    cancelled,
  ]);
  await reminderSession("2027-01-10", ["yes", "yes"], "08:00");
  const schedule = await createSchedule();
  await db.query(
    "update public.session_schedules set starts_on='2026-01-01',ends_on='2027-01-09' where id=$1",
    [schedule],
  );
  assert.equal(await tick("2027-01-10T14:00:00Z"), 0);
  await reminderSession("2027-01-11", [], "18:00");
  assert.equal(await tick("2027-01-10T15:00:00Z"), 0);
});

test("Discord honours blanks, time overrides and revoked access", async () => {
  const schedule = await createSchedule();
  await db.query(
    "update public.session_schedules set starts_on='2027-01-01' where id=$1",
    [schedule],
  );
  await setDefault(schedule, "yes");
  await setDefault(schedule, "yes", other);
  const id = await reminderSession("2027-01-11", [null, "yes"]);
  await db.query("update public.club_sessions set schedule_id=$1 where id=$2", [
    schedule,
    id,
  ]);
  await db.query("delete from public.club_roles where user_id=$1", [other]);
  assert.equal(await tick("2027-01-10T14:00:00Z"), 1);
  assert.ok((await discordMessages())[0].content.includes("No execs"));
  const changed = await reminderSession("2027-01-18");
  await db.query(
    "update public.club_sessions set schedule_id=$1,time_overridden=true where id=$2",
    [schedule, changed],
  );
  assert.equal(await tick("2027-01-17T14:00:00Z"), 1);
  assert.ok((await discordMessages())[1].content.includes("No execs"));
});

test("Discord records success/failure without repeating potentially delivered pings", async () => {
  await reminderSession("2027-01-11");
  await reminderSession("2027-01-11", [], "18:00");
  await reminderSession("2027-01-11", [], "17:00");
  assert.equal(await tick("2027-01-10T14:00:00Z"), 3);
  const ids = (
    await db.query<{ id: number }>("select id from net.requests order by id")
  ).rows;
  await db.query("insert into net._http_response values ($1,200),($2,429)", [
    ids[0].id,
    ids[1].id,
  ]);
  assert.equal(await tick("2027-01-10T14:05:00Z"), 0);
  await tick("2027-01-10T14:20:00Z");
  const states = (
    await db.query<{ status: string }>(
      "select status from private.discord_session_deliveries order by request_id",
    )
  ).rows.map((r) => r.status);
  assert.deepEqual(states, ["sent", "failed", "unknown"]);
  assert.equal((await discordMessages()).length, 3);
});

test("Discord credentials, scheduler and delivery log are inaccessible to app users", async () => {
  for (const who of [null, outsider, exec, admin]) {
    await asUser(who, async () => {
      await assert.rejects(
        db.query("select private.send_discord_session_reminders()"),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "select private.materialize_session_dates(current_date,current_date)",
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from private.discord_session_deliveries"),
        /permission denied/,
      );
    });
  }
  await db.exec("delete from vault.decrypted_secrets");
  await assert.rejects(
    tick("2027-01-10T14:00:00Z"),
    /Configure discord_session_webhook/,
  );
  assert.equal((await discordMessages()).length, 0);
});

async function linkDiscord(userId: string, discordId: string) {
  const approval = (
    await db.query<{ id: string }>(
      "select id from public.club_roles where user_id=$1",
      [userId],
    )
  ).rows[0].id;
  await db.exec("set role service_role");
  try {
    await db.query(
      "select public.save_discord_connection($1,$2,$3,'test.exec')",
      [userId, approval, discordId],
    );
  } finally {
    await db.exec("reset role");
  }
  return approval;
}

test("only verified server callbacks can save Discord IDs; IDs are unique and private", async () => {
  const id = "123456789012345678";
  await linkDiscord(exec, id);
  await assert.rejects(linkDiscord(other, id), /unique/);
  for (const user of [exec, other, admin]) {
    await asUser(user, async () => {
      await assert.rejects(
        db.query("select public.save_discord_connection($1,$1,$2,'fake')", [
          user,
          id,
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "insert into public.discord_connections values ($1,$2,'fake',now())",
          [user, id],
        ),
        /permission denied/,
      );
      assert.equal(
        (await db.query("select * from public.discord_connections")).rows
          .length,
        user === exec ? 1 : 0,
      );
    });
  }
});

test("removal cascades Discord connections and old callbacks cannot relink after reapproval", async () => {
  const approval = await linkDiscord(exec, "123456789012345678");
  await asUser(admin, () =>
    db.query("select public.remove_club_access($1)", [approval]),
  );
  assert.equal(
    (await db.query("select * from public.discord_connections")).rows.length,
    0,
  );
  await db.query(
    "insert into public.club_roles(user_id,email,role) values ($1,'exec@example.com','exec')",
    [exec],
  );
  await db.exec("set role service_role");
  try {
    await assert.rejects(
      db.query(
        "select public.save_discord_connection($1,$2,'123456789012345678','test.exec')",
        [exec, approval],
      ),
      /approval changed/,
    );
  } finally {
    await db.exec("reset role");
  }
});

test("disconnect only removes the caller's connection", async () => {
  await linkDiscord(exec, "123456789012345678");
  await linkDiscord(other, "223456789012345678");
  await asUser(exec, () => db.query("select public.disconnect_discord()"));
  assert.deepEqual(
    (await db.query("select user_id from public.discord_connections")).rows,
    [{ user_id: other }],
  );
  await asUser(outsider, () =>
    assert.rejects(
      db.query("select public.disconnect_discord()"),
      /Club access required/,
    ),
  );
});

test("same-day pings include only linked Yes attendees; coverage keeps everyone", async () => {
  const execDiscord = "123456789012345678";
  const otherDiscord = "223456789012345678";
  const adminDiscord = "323456789012345678";
  await linkDiscord(exec, execDiscord);
  await linkDiscord(other, otherDiscord);
  await linkDiscord(admin, adminDiscord);
  await reminderSession("2027-01-10", ["yes", "yes", "maybe"]);
  await reminderSession("2027-01-11", ["yes", "no", null]);
  assert.equal(await tick("2027-01-10T14:00:00Z"), 2);
  const [today, tomorrow] = await discordMessages();
  assert.deepEqual(today.allowed_mentions.parse, []);
  assert.deepEqual(today.allowed_mentions.users, [execDiscord, otherDiscord]);
  assert.ok(today.content.includes(`<@${execDiscord}>`));
  assert.ok(!today.content.includes(`<@${adminDiscord}>`));
  assert.deepEqual(tomorrow.allowed_mentions.parse, ["everyone"]);
  assert.deepEqual(tomorrow.allowed_mentions.users, [execDiscord]);
});

test("Discord lists unlinked Yes attendees by name alongside linked mentions", async () => {
  await linkDiscord(exec, "123456789012345678");
  await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
    JSON.stringify({ full_name: "Taylor Example" }),
    other,
  ]);
  await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
    JSON.stringify({ full_name: "Not Attending" }),
    admin,
  ]);
  await reminderSession("2027-01-10", ["yes", "yes", "no"]);
  await tick("2027-01-10T14:00:00Z");
  const message = (await discordMessages())[0];
  assert.ok(
    message.content.includes(
      "Attending: <@123456789012345678>, Taylor Example",
    ),
  );
  assert.ok(!message.content.includes("Not Attending"));
  assert.deepEqual(message.allowed_mentions.users, ["123456789012345678"]);
  assert.deepEqual(message.allowed_mentions.parse, []);
});

test("Discord name fallback prevents injected mentions and never substitutes emails", async () => {
  await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
    JSON.stringify({
      full_name: "@everyone **Taylor**\n<@123456789012345678>",
    }),
    exec,
  ]);
  await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
    JSON.stringify({ full_name: "private@example.com" }),
    other,
  ]);
  await reminderSession("2027-01-10", ["yes", "yes", "yes"]);
  await reminderSession("2027-01-11", ["yes"]);
  await tick("2027-01-10T14:00:00Z");
  const [today, tomorrow] = await discordMessages();
  assert.ok(today.content.includes("Attending:"));
  assert.ok(today.content.includes("Taylor"));
  assert.ok(today.content.includes("An exec"));
  assert.ok(!today.content.includes("@"));
  assert.ok(!today.content.includes("**"));
  assert.ok(!today.content.includes("example.com"));
  assert.deepEqual(today.allowed_mentions.users, []);
  assert.equal(tomorrow.content.split("@everyone").length - 1, 1);
});

test("Cron test resolves all Yes attendees and preserves real delivery history", async () => {
  const session = await reminderSession("2026-09-28", ["yes", "yes", "no"]);
  await reminderSession("2026-09-28", ["yes", "yes"], "18:00");
  await linkDiscord(exec, "123456789012345678");
  await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
    JSON.stringify({ full_name: "Taylor Example" }),
    other,
  ]);
  assert.equal(await tick("2026-09-28T13:00:00Z"), 2);
  const history = (
    await db.query(
      "select * from private.discord_session_deliveries order by request_id",
    )
  ).rows;
  const normal = (await discordMessages()).find((m) =>
    m.content.includes("7:00 PM–9:00 PM"),
  )!;
  const result = await db.exec(
    "select private.test_discord_session_reminder('2026-09-28','19:00','21:00','same_day')",
  );
  assert.ok(result.length > 0);
  const messages = await discordMessages();
  assert.equal(messages.length, 3); // Only the selected session is retested.
  assert.ok(messages[2].content.startsWith("**TEST RUN"));
  assert.ok(messages[2].content.includes(normal.content));
  assert.ok(messages[2].content.includes("Taylor Example"));
  assert.deepEqual(messages[2].allowed_mentions, normal.allowed_mentions);
  assert.deepEqual(
    (
      await db.query(
        "select * from private.discord_session_deliveries order by request_id",
      )
    ).rows,
    history,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.session_availability where session_id=$1",
        [session],
      )
    ).rows.length,
    3,
  );
});

test("Cron tests preserve coverage thresholds and return request IDs or a skipped reason", async () => {
  const id = await reminderSession("2026-09-28", ["yes"]);
  await linkDiscord(exec, "123456789012345678");
  const run = async (kind: string) =>
    (
      await db.query<{
        result: {
          queued: number;
          yes_count: number;
          request_ids: number[];
          result: string;
        };
      }>(
        "select private.test_discord_session_reminder('2026-09-28','19:00','21:00',$1) as result",
        [kind],
      )
    ).rows[0].result;
  const skipped = await run("same_day");
  assert.equal(skipped.queued, 0);
  assert.equal(skipped.yes_count, 1);
  assert.ok(skipped.result.startsWith("No message"));
  assert.equal((await discordMessages()).length, 0);
  const sent = await run("day_before");
  assert.equal(sent.queued, 1);
  assert.equal(sent.request_ids.length, 1);
  const message = (await discordMessages())[0];
  assert.ok(message.content.includes("TEST RUN"));
  assert.ok(message.content.includes("@everyone"));
  assert.deepEqual(message.allowed_mentions.users, ["123456789012345678"]);
  assert.equal(
    (await db.query("select * from private.discord_session_deliveries")).rows
      .length,
    0,
  );
  await db.query("update public.club_sessions set cancelled=true where id=$1", [
    id,
  ]);
  await assert.rejects(run("day_before"), /No active session/);
  await assert.rejects(run("invalid"), /Choose a valid/);
});

test("new Cron test entry points remain owner-only", async () => {
  for (const who of [null, exec, admin]) {
    await asUser(who, async () => {
      await assert.rejects(
        db.query(
          "select private.test_discord_session_reminder('2026-09-28','19:00','21:00')",
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select private.run_discord_session_reminders(18,now(),null)"),
        /permission denied/,
      );
    });
  }
});

async function testNext(at: string) {
  return (
    await db.query<{
      result: {
        queued: number;
        session_date?: string;
        starts_at?: string;
        yes_count?: number;
        result: string;
      };
    }>("select private.test_next_discord_session($1) as result", [at])
  ).rows[0].result;
}

test("next-session test uses yesterday at 6pm for this evening's session", async () => {
  await db.exec("delete from public.club_sessions");
  await reminderSession("2026-09-28", ["yes"]);
  await reminderSession("2026-09-29", []);
  await linkDiscord(exec, "123456789012345678");
  const result = await testNext("2026-09-28T15:27:00Z");
  assert.equal(result.session_date, "2026-09-28");
  assert.equal(result.queued, 1);
  assert.equal(result.yes_count, 1);
  const messages = await discordMessages();
  assert.equal(messages.length, 1);
  assert.ok(messages[0].content.includes("TEST RUN"));
  assert.ok(messages[0].content.includes("backup"));
  assert.deepEqual(messages[0].allowed_mentions.users, ["123456789012345678"]);
});

test("next-session test skips cancelled and started sessions but does not bypass a covered session", async () => {
  await db.exec("delete from public.club_sessions");
  const cancelled = await reminderSession("2026-09-28", []);
  await db.query("update public.club_sessions set cancelled=true where id=$1", [
    cancelled,
  ]);
  await reminderSession("2026-09-27", []);
  await reminderSession("2026-09-29", ["yes", "yes"]);
  await reminderSession("2026-09-30", []);
  const result = await testNext("2026-09-28T15:27:00Z");
  assert.equal(result.session_date, "2026-09-29");
  assert.equal(result.queued, 0);
  assert.equal((await discordMessages()).length, 0);
});

test("next-session test finds unopened recurrence after cancelled occurrences", async () => {
  await db.exec("delete from public.club_sessions");
  const schedule = await createSchedule(1);
  await db.query(
    "update public.session_schedules set starts_on='2026-09-01' where id=$1",
    [schedule],
  );
  const cancelled = await reminderSession("2026-09-28");
  await db.query(
    "update public.club_sessions set schedule_id=$1,cancelled=true where id=$2",
    [schedule, cancelled],
  );
  const result = await testNext("2026-09-28T15:27:00Z");
  assert.equal(result.session_date, "2026-10-05");
  assert.equal(result.queued, 1);
});

test("next-session test does nothing without a session, even with no webhook configured", async () => {
  await db.exec(
    "delete from public.club_sessions; delete from vault.decrypted_secrets",
  );
  const result = await testNext("2026-09-28T15:27:00Z");
  assert.equal(result.queued, 0);
  assert.match(result.result, /No upcoming session/);
  assert.equal((await discordMessages()).length, 0);
  await asUser(exec, () =>
    assert.rejects(
      db.query("select private.test_next_discord_session()"),
      /permission denied/,
    ),
  );
});

async function previewNext(kind = "day_before") {
  return (
    await db.query<{
      result: {
        would_send: boolean;
        yes_count: number;
        already_attempted: boolean;
        reason: string;
        payload: {
          content: string;
          allowed_mentions: { parse: string[]; users: string[] };
        } | null;
      };
    }>(
      "select private.preview_next_discord_reminder($1, '2026-09-28T15:27:00Z') as result",
      [kind],
    )
  ).rows[0].result;
}

test("preview shares real message content, sends nothing, and respects delivery history", async () => {
  await db.exec("delete from public.club_sessions");
  await reminderSession("2026-09-28", ["yes"]);
  await linkDiscord(exec, "123456789012345678");
  const preview = await previewNext();
  assert.equal(preview.would_send, true);
  assert.equal(preview.yes_count, 1);
  assert.deepEqual(preview.payload?.allowed_mentions.users, [
    "123456789012345678",
  ]);
  assert.equal((await discordMessages()).length, 0);
  await tick("2026-09-27T22:00:00Z", 18);
  assert.deepEqual(preview.payload, (await discordMessages())[0]);
  const repeated = await previewNext();
  assert.equal(repeated.would_send, false);
  assert.equal(repeated.already_attempted, true);
});

test("preview uses defaults for unopened dates without persisting generated rows or requiring Vault", async () => {
  await db.exec(
    "delete from public.club_sessions; delete from vault.decrypted_secrets",
  );
  const schedule = await createSchedule(1);
  await db.query(
    "update public.session_schedules set starts_on='2026-09-01' where id=$1",
    [schedule],
  );
  await setDefault(schedule, "yes");
  const before = (await db.query("select * from public.session_availability"))
    .rows;
  const result = await previewNext();
  assert.equal(result.would_send, true);
  assert.equal(result.yes_count, 1);
  assert.equal(
    (await db.query("select * from public.club_sessions")).rows.length,
    0,
  );
  assert.deepEqual(
    (await db.query("select * from public.session_availability")).rows,
    before,
  );
  assert.equal(
    (await db.query("select * from private.discord_session_deliveries")).rows
      .length,
    0,
  );
  assert.equal((await discordMessages()).length, 0);
});

test("preview handles coverage thresholds, same-day timing, no session, and invalid input", async () => {
  await db.exec("delete from public.club_sessions");
  assert.equal((await previewNext()).would_send, false);
  await reminderSession("2026-09-28", []);
  assert.equal((await previewNext()).would_send, true);
  assert.equal((await previewNext("same_day")).would_send, false);
  await db.exec("delete from public.club_sessions");
  await reminderSession("2026-09-28", ["yes", "yes"]);
  assert.equal((await previewNext()).would_send, false);
  assert.equal((await previewNext("same_day")).would_send, true);
  await db.exec("delete from public.club_sessions");
  await reminderSession("2026-09-29", ["yes", "yes"], "08:00");
  assert.equal((await previewNext("same_day")).would_send, false);
  await assert.rejects(previewNext("invalid"), /Choose day_before/);
  assert.equal((await discordMessages()).length, 0);
});

test("setup health reports missing services without exposing the webhook; diagnostics are owner-only", async () => {
  const health = (
    await db.query<{ check_name: string; status: string; detail: string }>(
      "select * from private.discord_setup_health()",
    )
  ).rows;
  assert.equal(
    health.find((row) => row.check_name === "webhook")?.status,
    "ok",
  );
  assert.equal(
    health.find((row) => row.check_name === "job:discord-session-reminders")
      ?.status,
    "missing",
  );
  assert.ok(!JSON.stringify(health).includes("fake-test-token"));
  await db.exec("delete from vault.decrypted_secrets");
  assert.equal(
    (
      await db.query<{ status: string }>(
        "select status from private.discord_setup_health() where check_name='webhook'",
      )
    ).rows[0].status,
    "missing_or_invalid",
  );
  for (const user of [null, exec, admin]) {
    await asUser(user, async () => {
      await assert.rejects(
        db.query("select private.preview_next_discord_reminder()"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from private.discord_setup_health()"),
        /permission denied/,
      );
    });
  }
});
