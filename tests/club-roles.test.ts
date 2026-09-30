import assert from "node:assert/strict";
import { initializeDatabase, readInitialSchema } from "./database";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001";
const exec = "00000000-0000-4000-8000-000000000002";
const newcomer = "00000000-0000-4000-8000-000000000003";
const outsider = "00000000-0000-4000-8000-000000000004";
const passwordUser = "00000000-0000-4000-8000-000000000005";
const unverified = "00000000-0000-4000-8000-000000000006";
let migration: string;

before(async () => {
  migration = await readInitialSchema();
  await initializeDatabase(db);
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(
    "reset role; delete from public.club_roles; delete from auth.users;",
  );
  for (const [id, email] of [
    [admin, "admin@gmail.com"],
    [exec, "exec@gmail.com"],
    [newcomer, "new@gmail.com"],
    [outsider, "outsider@gmail.com"],
    [passwordUser, "password@gmail.com"],
    [unverified, "unverified@gmail.com"],
  ]) {
    await db.query(
      "insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())",
      [id, email],
    );
    await db.query("insert into auth.identities values ($1, $2, $3::jsonb)", [
      id,
      id === passwordUser ? "email" : "google",
      JSON.stringify({ email, email_verified: id !== unverified }),
    ]);
  }
  await db.query(
    "insert into public.club_roles (email, user_id, role) values ('admin@gmail.com', $1, 'admin'), ('exec@gmail.com', $2, 'exec')",
    [admin, exec],
  );
});

async function asUser<T>(id: string | null, run: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    id ?? "",
  ]);
  await db.exec(id ? "set role authenticated" : "set role anon");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}

async function scalar(sql: string, params: string[] = []) {
  const result = await db.query<{ value: string | null }>(
    `select ${sql} as value`,
    params,
  );
  return result.rows[0].value;
}

async function approvalId(email: string) {
  const result = await db.query<{ id: string }>(
    "select id from public.club_roles where email = $1",
    [email],
  );
  return result.rows[0].id;
}

test("only exec/admin roles are accepted", async () => {
  await assert.rejects(
    db.query(
      "insert into public.club_roles (email, role) values ('other@gmail.com', 'member')",
    ),
    /check constraint/,
  );
});

test("anonymous users cannot read or activate approvals or manage access", async () => {
  await asUser(null, async () => {
    for (const sql of [
      "select * from public.club_roles",
      "select public.activate_club_access()",
      "select public.get_club_role()",
      "select * from public.list_club_roles()",
      "select public.approve_club_account('new@gmail.com', 'admin')",
      "select public.remove_club_access('00000000-0000-4000-8000-000000000001')",
    ])
      await assert.rejects(db.query(sql), /permission denied/);
  });
});

test("execs see only their role and cannot promote themselves or manage approvals", async () => {
  await asUser(exec, async () => {
    assert.equal(await scalar("public.get_club_role()"), "exec");
    assert.deepEqual(
      (await db.query("select email, role from public.club_roles")).rows,
      [{ email: "exec@gmail.com", role: "exec" }],
    );
    await assert.rejects(
      db.query("select * from public.list_club_roles()"),
      /Admin access required/,
    );
    await assert.rejects(
      db.query("select public.approve_club_account('new@gmail.com', 'admin')"),
      /Admin access required/,
    );
    await assert.rejects(
      db.query(
        "select public.remove_club_access('00000000-0000-4000-8000-000000000001')",
      ),
      /Admin access required/,
    );
    await assert.rejects(
      db.query("update public.club_roles set role = 'admin'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "insert into public.club_roles (email, role) values ('new@gmail.com', 'admin')",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.club_roles"),
      /permission denied/,
    );
  });
});

test("admins can preapprove either role before an Auth account exists", async () => {
  await asUser(admin, async () => {
    await db.query(
      "select public.approve_club_account(' Future@Gmail.com ', 'exec')",
    );
    await db.query(
      "select public.approve_club_account('future-admin@gmail.com', 'admin')",
    );
    const rows = (
      await db.query(
        "select email, role, status, user_id from public.club_roles where user_id is null order by email",
      )
    ).rows;
    assert.deepEqual(rows, [
      {
        email: "future-admin@gmail.com",
        role: "admin",
        status: "pending",
        user_id: null,
      },
      {
        email: "future@gmail.com",
        role: "exec",
        status: "pending",
        user_id: null,
      },
    ]);
    await assert.rejects(
      db.query(
        "select public.approve_club_account('future@gmail.com', 'admin')",
      ),
      /already has pending or active access/,
    );
    await assert.rejects(
      db.query(
        "select public.approve_club_account('other@gmail.com', 'owner')",
      ),
      /Choose Exec or Admin/,
    );
    await assert.rejects(
      db.query("select public.approve_club_account('invalid', 'exec')"),
      /valid Google account email/,
    );
  });
});

test("an approved Google account activates exactly its assigned role", async () => {
  await asUser(admin, async () => {
    await db.query(
      "select public.approve_club_account('new@gmail.com', 'admin')",
    );
  });
  await asUser(newcomer, async () => {
    assert.equal(await scalar("public.get_club_role()"), null);
    await assert.rejects(
      db.query(
        "select public.approve_club_account('other@gmail.com', 'admin')",
      ),
      /Admin access required/,
    );
    assert.equal(await scalar("public.activate_club_access()"), "admin");
    assert.equal(await scalar("public.activate_club_access()"), "admin");
    const rows = (
      await db.query(
        "select user_id, status from public.club_roles where email = 'new@gmail.com'",
      )
    ).rows;
    assert.deepEqual(rows, [{ user_id: newcomer, status: "active" }]);
  });
});

test("unapproved users cannot claim another email or create their own approval", async () => {
  await asUser(admin, async () => {
    await db.query(
      "select public.approve_club_account('new@gmail.com', 'exec')",
    );
  });
  await asUser(outsider, async () => {
    assert.equal(await scalar("public.activate_club_access()"), null);
    assert.deepEqual(
      (await db.query("select * from public.club_roles")).rows,
      [],
    );
  });
});

test("email aliases and dot variations are not treated as the approved address", async () => {
  await asUser(admin, async () => {
    await db.query(
      "select public.approve_club_account('new@gmail.com', 'exec')",
    );
  });
  for (const email of [
    "new+club@gmail.com",
    "n.ew@gmail.com",
    "new@googlemail.com",
  ]) {
    await db.query("update auth.users set email = $1 where id = $2", [
      email,
      newcomer,
    ]);
    await db.query(
      "update auth.identities set identity_data = jsonb_build_object('email', $1::text, 'email_verified', true) where user_id = $2",
      [email, newcomer],
    );
    await asUser(newcomer, async () => {
      assert.equal(await scalar("public.activate_club_access()"), null);
    });
  }
});

test("unverified identities and editable profile metadata cannot claim access", async () => {
  await db.query(
    'update auth.users set raw_user_meta_data = \'{"provider":"google","email_verified":true}\' where id = $1',
    [passwordUser],
  );
  await asUser(admin, async () => {
    await db.query(
      "select public.approve_club_account('password@gmail.com', 'admin')",
    );
    await db.query(
      "select public.approve_club_account('unverified@gmail.com', 'admin')",
    );
  });
  for (const id of [passwordUser, unverified]) {
    await asUser(id, async () => {
      assert.equal(await scalar("public.activate_club_access()"), null);
      await assert.rejects(
        db.query("select * from public.list_club_roles()"),
        /Admin access required/,
      );
    });
  }
});

test("an email change or unconfirmed account blocks previously active access", async () => {
  await db.query(
    "update auth.users set email = 'changed@gmail.com' where id = $1",
    [exec],
  );
  await asUser(exec, async () => {
    assert.equal(await scalar("public.get_club_role()"), null);
  });
  await db.query(
    "update auth.users set email_confirmed_at = null where id = $1",
    [admin],
  );
  await asUser(admin, async () => {
    await assert.rejects(
      db.query("select * from public.list_club_roles()"),
      /Admin access required/,
    );
  });
});

test("removing pending or active access prevents activation and leaves Auth accounts intact", async () => {
  await asUser(admin, async () => {
    await db.query(
      "select public.approve_club_account('new@gmail.com', 'exec')",
    );
  });
  const pendingId = await approvalId("new@gmail.com");
  const execId = await approvalId("exec@gmail.com");
  await asUser(admin, async () => {
    await db.query("select public.remove_club_access($1)", [pendingId]);
    await db.query("select public.remove_club_access($1)", [execId]);
  });
  for (const id of [newcomer, exec]) {
    await asUser(id, async () => {
      assert.equal(await scalar("public.activate_club_access()"), null);
      assert.equal(await scalar("public.get_club_role()"), null);
    });
  }
  assert.equal(
    (await db.query("select id from auth.users where id = $1", [exec])).rows
      .length,
    1,
  );
});

test("admins can remove another admin but cannot remove themselves", async () => {
  await asUser(admin, async () => {
    await db.query(
      "select public.approve_club_account('new@gmail.com', 'admin')",
    );
  });
  await asUser(newcomer, async () => {
    await scalar("public.activate_club_access()");
  });
  const otherId = await approvalId("new@gmail.com");
  const selfId = await approvalId("admin@gmail.com");
  await asUser(admin, async () => {
    await assert.rejects(
      db.query("select public.remove_club_access($1)", [selfId]),
      /cannot remove your own/,
    );
    await db.query("select public.remove_club_access($1)", [otherId]);
  });
  await asUser(newcomer, async () => {
    await assert.rejects(
      db.query("select public.remove_club_access($1)", [selfId]),
      /Admin access required/,
    );
  });
});

test("the initial migration refuses an existing populated app database", async () => {
  await assert.rejects(db.exec(migration), /requires a fresh project/);
  await db.exec("rollback");
  assert.equal(
    (await db.query("select * from public.club_roles")).rows.length,
    2,
  );
});

test("the initial migration also refuses an empty existing schema", async () => {
  const oldDb = new PGlite();
  try {
    await initializeDatabase(oldDb);
    await assert.rejects(oldDb.exec(migration), /requires a fresh project/);
    await oldDb.exec("rollback");
    assert.equal(
      (await oldDb.query("select * from public.club_roles")).rows.length,
      0,
    );
  } finally {
    await oldDb.close();
  }
});
