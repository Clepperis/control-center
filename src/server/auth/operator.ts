import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "../db/types";
import { AUTH_LOCK, hashOwnerPassword, passwordConfig } from "./password";
import type { Env } from "./policy";

// No HTTP entry point. Caller must possess the separate operator DB credential.
// Never reassign any existing operational owner or approval subject.
export async function setOwnerPassword(
  db: Database,
  env: Env,
  action: "bootstrap" | "reset",
  email: string,
  password: string,
) {
  const { subject } = passwordConfig(env);
  email = z.email().max(254).parse(email).toLowerCase();
  const encoded = await hashOwnerPassword(password);
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [AUTH_LOCK]);
    const users = (
      await tx.query<{ id: string; email: string }>(
        "SELECT id,email FROM auth_user FOR UPDATE",
      )
    ).rows;
    if (action === "bootstrap") {
      if (users.length)
        throw new Error("Owner already exists; bootstrap refused.");
      await tx.query(
        'INSERT INTO auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
        [subject, "Savininkas", email],
      );
      await tx.query(
        'INSERT INTO auth_account(id,"accountId","providerId","userId",password) VALUES($1,$2,\'credential\',$2,$3)',
        [randomUUID(), subject, encoded],
      );
    } else {
      if (
        users.length !== 1 ||
        users[0].id !== subject ||
        users[0].email !== email
      )
        throw new Error("Configured owner does not match; reset refused.");
      const updated = await tx.query(
        'UPDATE auth_account SET password=$1,"updatedAt"=now() WHERE "userId"=$2 AND "providerId"=\'credential\' RETURNING id',
        [encoded, subject],
      );
      if (updated.rows.length !== 1)
        throw new Error("Credential account missing; reset refused.");
      await tx.query('DELETE FROM auth_session WHERE "userId"=$1', [subject]);
    }
    await tx.query("DELETE FROM auth_login_budget");
  });
}
