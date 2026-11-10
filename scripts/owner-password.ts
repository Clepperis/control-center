import { createInterface } from "node:readline/promises";
import { openPostgres } from "../src/server/db/postgres";
import { setOwnerPassword } from "../src/server/auth/operator";

function hidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Interactive terminal required.");
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      // Process entire paste, including Windows bracketed paste if supplied.
      for (const c of chunk
        .replaceAll("\x1b[200~", "")
        .replaceAll("\x1b[201~", "")) {
        if (c === "\x03") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (c === "\r" || c === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (c === "\x7f" || c === "\b") value = value.slice(0, -1);
        else if (c >= " " && value.length < 1025) value += c;
      }
    };
    process.stdin.on("data", onData);
  });
}
let db: ReturnType<typeof openPostgres> | undefined;
try {
  const action = process.argv[2];
  if (!["bootstrap", "reset"].includes(action) || process.argv.length !== 3)
    throw new Error(
      "Use owner-password.ts bootstrap|reset. No password arguments accepted.",
    );
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    !process.env.OPERATOR_DATABASE_URL
  )
    throw new Error("Interactive terminal and OPERATOR_DATABASE_URL required.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = await rl.question("Owner login email (no delivery service): ");
  rl.close();
  const password = await hidden(
    "New passphrase (10–1024 characters, hidden): ",
  );
  const confirmation = await hidden("Repeat passphrase (hidden): ");
  if (password !== confirmation) throw new Error("Passphrases differ.");
  db = openPostgres(process.env.OPERATOR_DATABASE_URL);
  await setOwnerPassword(
    db,
    { ...process.env, DATABASE_URL: process.env.OPERATOR_DATABASE_URL },
    action as "bootstrap" | "reset",
    email,
    password,
  );
  console.log(
    "Owner password saved. Existing sessions revoked; login budget cleared.",
  );
} catch {
  console.error(
    "Owner operation failed. Check mode, terminal, owner identity and operator database setup. No credential values logged.",
  );
  process.exitCode = 1;
} finally {
  await db?.close();
}
