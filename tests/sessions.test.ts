import assert from "node:assert/strict";
import { initializeDatabase } from "./database";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  addDays,
  clubToday,
  formatTime,
  isDate,
  isWeek,
  sessionInputError,
  weekStart,
} from "../src/lib/sessions";

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
    "reset role; delete from public.club_sessions; delete from public.club_roles; delete from auth.users",
  );
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

test("anonymous, unapproved, and revoked users cannot access the board or write sessions", async () => {
  await asUser(null, async () => {
    for (const sql of [
      "select * from public.club_sessions",
      "select * from public.session_availability",
      "select * from public.list_session_execs()",
      "select public.add_extra_session('2026-10-28','19:00','21:00')",
    ])
      await assert.rejects(db.query(sql), /permission denied/);
  });
  for (const id of [outsider, other]) {
    if (id === other)
      await db.query("delete from public.club_roles where user_id=$1", [other]);
    await asUser(id, async () => {
      assert.equal(
        (await db.query("select * from public.club_sessions")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("select * from public.session_availability")).rows
          .length,
        0,
      );
      await assert.rejects(
        db.query("select * from public.list_session_execs()"),
        /Club access required/,
      );
      await assert.rejects(
        db.query(
          "select public.add_extra_session('2026-10-28','19:00','21:00')",
        ),
        /Club access required/,
      );
      await assert.rejects(respond("yes"), /Club access required/);
      await assert.rejects(
        db.query(
          "insert into public.club_sessions(session_date,starts_at,ends_at) values ('2026-10-28','19:00','21:00')",
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.query("delete from public.club_sessions returning id"),
        /permission denied/,
      );
    });
  }
});

test("active execs see the roster without pending approvals, and can add sessions as themselves", async () => {
  await asUser(exec, async () => {
    assert.equal(
      (await db.query("select * from public.list_session_execs()")).rows.length,
      3,
    );
    await db.query(
      "select public.add_extra_session('2026-10-28','19:00','21:00')",
    );
    await assert.rejects(
      db.query(
        "insert into public.club_sessions(session_date,starts_at,ends_at,created_by) values ('2026-10-30','19:00','21:00',$1)",
        [other],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update public.club_sessions set ends_at='22:00'"),
      /permission denied/,
    );
    assert.equal(
      (await db.query("select * from public.club_sessions")).rows.length,
      2,
    );
  });
});

test("availability supports yes/maybe/no/clear and only its owner may change it", async () => {
  await asUser(exec, async () => {
    for (const response of ["yes", "maybe", "no"]) {
      await respond(response);
      assert.deepEqual(
        (await db.query("select response from public.session_availability"))
          .rows,
        [{ response }],
      );
    }
    await assert.rejects(respond("invalid"), /check constraint/);
  });
  for (const id of [other, admin])
    await asUser(id, async () => {
      assert.equal(
        (await db.query("select * from public.session_availability")).rows
          .length,
        1,
      );
      await assert.rejects(
        db.query(
          "insert into public.session_availability(session_id,user_id,response) values ($1,$2,'yes')",
          [sessionId, exec],
        ),
        /permission denied/,
      );
      for (const sql of [
        "update public.session_availability set response='yes' where user_id=$1 returning response",
        "delete from public.session_availability where user_id=$1 returning response",
      ]) {
        await assert.rejects(db.query(sql, [exec]), /permission denied/);
      }
      await assert.rejects(
        db.query("update public.session_availability set user_id=$1", [other]),
        /permission denied/,
      );
    });
  await asUser(exec, () => respond(null));
  assert.deepEqual(
    (await db.query("select response from public.session_availability")).rows,
    [{ response: null }],
  );
});

test("only creators or admins can cancel sessions, retaining their responses", async () => {
  await asUser(other, async () => {
    await respond("maybe");
    await assert.rejects(
      db.query("select public.cancel_club_session($1)", [sessionId]),
      /only cancel your own/,
    );
  });
  await asUser(exec, async () => {
    await db.query("select public.cancel_club_session($1)", [sessionId]);
    await assert.rejects(respond("yes"), /cancelled/);
    await db.query(
      "select public.add_extra_session('2026-10-26','19:00','21:00')",
    );
  });
  assert.equal(
    (await db.query("select * from public.session_availability")).rows.length,
    1,
  );
  const active = (
    await db.query<{ id: string }>(
      "select id from public.club_sessions where not cancelled",
    )
  ).rows[0].id;
  await asUser(admin, () =>
    db.query("select public.cancel_club_session($1)", [active]),
  );
  assert.equal(
    (await db.query("select * from public.club_sessions where not cancelled"))
      .rows.length,
    0,
  );
});

test("removing an exec clears their responses but keeps the schedule", async () => {
  await asUser(exec, () => respond("yes"));
  await db.query("delete from public.club_roles where user_id=$1", [exec]);
  assert.equal(
    (await db.query("select * from public.session_availability")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.club_sessions")).rows.length,
    1,
  );
});

test("database rejects duplicate slots, overnight/invalid times and sub-minute times", async () => {
  await asUser(exec, async () => {
    await assert.rejects(
      db.query("select public.add_extra_session('2026-10-26','19:00','21:00')"),
      /unique constraint/,
    );
    for (const [start, end] of [
      ["21:00", "19:00"],
      ["19:00", "19:00"],
      ["19:00", "24:00"],
      ["19:00:01", "21:00"],
    ])
      await assert.rejects(
        db.query("select public.add_extra_session('2026-10-27',$1,$2)", [
          start,
          end,
        ]),
        /check constraint/,
      );
  });
});

test("week calculations use Toronto dates, Monday boundaries and date-only DST arithmetic", () => {
  assert.equal(clubToday(new Date("2026-09-28T02:00:00Z")), "2026-09-27");
  assert.equal(weekStart("2026-09-27"), "2026-09-21");
  assert.equal(weekStart("2026-09-28"), "2026-09-28");
  assert.equal(addDays("2026-03-02", 7), "2026-03-09");
  assert.equal(addDays("2026-10-26", 7), "2026-11-02");
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
  assert.equal(isDate("2026-02-30"), false);
  assert.equal(isDate("2028-02-29"), true);
  assert.equal(isWeek("2026-09-27"), false);
  assert.equal(isWeek("2099-12-28"), false);
  assert.equal(sessionInputError("2026-10-26", "19:00", "21:00"), null);
  assert.ok(sessionInputError("2026-02-30", "19:00", "21:00"));
  assert.ok(sessionInputError("2026-10-26", "21:00", "19:00"));
  assert.ok(sessionInputError("2026-10-26", "19:00", "24:00"));
  assert.equal(formatTime("00:00:00"), "12:00 AM");
  assert.equal(formatTime("12:30:00"), "12:30 PM");
});
