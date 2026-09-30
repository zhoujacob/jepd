import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { initializeDatabase } from "./database";

test("fresh baseline works before optional services are enabled and restricts every API write", async () => {
  const db = new PGlite();
  try {
    await initializeDatabase(db, false);
    const health = (
      await db.query<{ check_name: string; status: string }>(
        "select * from private.discord_setup_health()",
      )
    ).rows;
    assert.equal(
      health.find((row) => row.check_name === "webhook")?.status,
      "missing",
    );
    assert.equal(
      health.find((row) => row.check_name === "job:discord-session-reminders")
        ?.status,
      "missing",
    );
    const tables = (
      await db.query<{ name: string; rls: boolean }>(`
      select c.oid::regclass::text as name, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname
    `)
    ).rows;
    assert.equal(tables.length, 6);
    for (const table of tables) {
      assert.equal(table.rls, true, table.name);
      // Names come only from this fresh test database's catalog.
      assert.equal(
        (await db.query(`select * from ${table.name}`)).rows.length,
        0,
      );
      for (const role of ["anon", "authenticated"]) {
        const privileges = (
          await db.query<{ writable: boolean }>(
            `
          select has_table_privilege($1, $2, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as writable
        `,
            [role, table.name],
          )
        ).rows[0];
        assert.equal(privileges.writable, false, `${role}: ${table.name}`);
      }
    }
    const functions = (
      await db.query<{ signature: string; schema: string; name: string }>(`
      select p.oid::regprocedure::text as signature, n.nspname as schema, p.proname as name
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private')
    `)
    ).rows;
    assert.equal(functions.length, 28);
    for (const fn of functions) {
      for (const role of ["anon", "authenticated"]) {
        const actual = (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege($1, $2, 'EXECUTE') as allowed",
            [role, fn.signature],
          )
        ).rows[0].allowed;
        const expected =
          role === "authenticated" &&
          ((fn.schema === "public" && fn.name !== "save_discord_connection") ||
            ["google_email", "is_club_admin"].includes(fn.name));
        assert.equal(actual, expected, `${role}: ${fn.signature}`);
      }
    }
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('service_role', 'public.save_discord_connection(uuid,uuid,text,text)', 'EXECUTE') as allowed",
        )
      ).rows[0].allowed,
      true,
    );
  } finally {
    await db.close();
  }
});
