// pnpm provision: creates the single owner (docs/prd/01-identity-and-access.md).
// The owner runs this; there is no HTTP route that creates a user.
//
//   pnpm provision --remote            create the owner in the deployed D1
//   pnpm provision --local             create the owner in the local D1
//   pnpm provision --verify <url>      log in against <url>; writes no user data
//
// Options: --timezone <IANA name> (default: this machine's), and with --local,
// --persist-to <dir> (local state elsewhere; used to test this script).
//
// The passphrase is prompted without echo (or read from stdin when it isn't a
// terminal) and never leaves this machine: only its derived hash is stored.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline";
import {
  deriveAuthKey,
  generateSalt,
  hashAuthKey,
  KDF_ITERATIONS,
  loginResponseSchema,
  PASSPHRASE_MIN_LENGTH,
  saltResponseSchema,
} from "@projects-lab/shared";

const API_DIR = path.join(import.meta.dirname, "../packages/api");
const WRANGLER = path.join(API_DIR, "node_modules/.bin/wrangler");
const DB = "projects-lab";

type Options =
  | { mode: "verify"; url: string }
  | {
      mode: "provision";
      target: "--local" | "--remote";
      persistTo?: string;
      timezone: string;
    };

function fail(message: string): never {
  console.error(`provision: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  let target: "--local" | "--remote" | undefined;
  let verify: string | undefined;
  let persistTo: string | undefined;
  let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i] ?? fail(`${arg} needs a value`);
    if (arg === "--local" || arg === "--remote") {
      if (target && target !== arg) fail("give --local or --remote, not both");
      target = arg;
    } else if (arg === "--verify") verify = value();
    else if (arg === "--persist-to") persistTo = value();
    else if (arg === "--timezone") timezone = value();
    else fail(`unknown argument ${arg}`);
  }

  if (verify) {
    if (target || persistTo) fail("--verify takes only a URL");
    try {
      return { mode: "verify", url: new URL(verify).origin };
    } catch {
      fail(`not a URL: ${verify}`);
    }
  }
  if (!target) fail("say where: --local or --remote (or --verify <url>)");
  if (persistTo && target !== "--local") fail("--persist-to needs --local");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    fail(`not an IANA time zone: ${timezone}`);
  }
  return { mode: "provision", target, persistTo, timezone };
}

// --- input -------------------------------------------------------------------

let pipedLines: AsyncIterator<string> | undefined;

/** Reads one line without echoing it; from stdin as-is when it isn't a terminal. */
async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    pipedLines ??= createInterface({ input: process.stdin })[
      Symbol.asyncIterator
    ]();
    const next = await pipedLines.next();
    if (next.done) fail("stdin ended before a passphrase was read");
    return next.value;
  }

  process.stdout.write(question);
  return new Promise((resolve) => {
    let input = "";
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(input);
          return;
        }
        if (char === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") input = input.slice(0, -1);
        else input += char;
      }
    };
    stdin.on("data", onData);
  });
}

// --- D1 through wrangler -----------------------------------------------------

// Local `d1 execute` reports no change count, so writes use RETURNING instead.
type ExecuteResult = { results: Record<string, unknown>[] };

function d1(
  options: Extract<Options, { mode: "provision" }>,
  sql: string,
): ExecuteResult {
  const args = [
    "d1",
    "execute",
    DB,
    options.target,
    "--json",
    "--command",
    sql,
  ];
  if (options.persistTo)
    args.push("--persist-to", path.resolve(options.persistTo));
  const run = spawnSync(WRANGLER, args, { cwd: API_DIR, encoding: "utf8" });
  if (run.error) fail(`could not run wrangler: ${run.error.message}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    fail(`wrangler failed:\n${run.stderr || run.stdout}`);
  }
  if (!Array.isArray(parsed)) {
    const error = (parsed as { error?: { text?: string } })?.error?.text;
    fail(`D1 rejected the statement: ${error ?? run.stdout}`);
  }
  const last = parsed.at(-1) as ExecuteResult | undefined;
  if (!last) fail("wrangler returned no result");
  return last;
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

// --- modes -------------------------------------------------------------------

async function provision(options: Extract<Options, { mode: "provision" }>) {
  const where =
    options.target === "--remote" ? "the deployed D1" : "the local D1";
  const existing = d1(options, "SELECT count(*) AS n FROM user").results[0]?.n;
  if (typeof existing !== "number")
    fail("could not read the user table; are migrations applied?");
  if (existing > 0) fail(`${where} already has an owner. Nothing was changed.`);

  const passphrase = await promptHidden(
    `New passphrase (at least ${PASSPHRASE_MIN_LENGTH} characters): `,
  );
  if (passphrase.length < PASSPHRASE_MIN_LENGTH) {
    fail(
      `the passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters. Nothing was changed.`,
    );
  }
  if ((await promptHidden("Repeat it: ")) !== passphrase) {
    fail("the two entries differ. Nothing was changed.");
  }

  const salt = generateSalt();
  const hash = await hashAuthKey(
    await deriveAuthKey(passphrase, salt, KDF_ITERATIONS),
  );
  const id = randomUUID();
  const values = [
    quote(id),
    quote(hash),
    quote(salt),
    String(KDF_ITERATIONS),
    quote(options.timezone),
    quote(new Date().toISOString()),
  ].join(", ");

  // Conditional insert: if another run got there first, this writes nothing.
  const inserted = d1(
    options,
    `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at)
     SELECT ${values} WHERE NOT EXISTS (SELECT 1 FROM user)
     RETURNING id`,
  );
  if (inserted.results.length !== 1 || inserted.results[0]?.id !== id) {
    fail(`${where} gained an owner while this ran. Nothing was changed.`);
  }
  console.log(`Owner created in ${where} (time zone ${options.timezone}).`);
}

async function verify(url: string) {
  const saltRes = await fetch(`${url}/api/auth/salt`);
  if (saltRes.status === 404) fail(`${url} has no owner yet.`);
  if (!saltRes.ok) fail(`GET /api/auth/salt answered ${saltRes.status}.`);
  const { salt, iterations } = saltResponseSchema.parse(await saltRes.json());

  const passphrase = await promptHidden("Passphrase: ");
  const authKey = await deriveAuthKey(passphrase, salt, iterations);
  const loginRes = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authKey }),
  });
  if (loginRes.status === 401) fail("wrong passphrase.");
  if (loginRes.status === 429) {
    fail(
      `too many attempts; retry in ${loginRes.headers.get("Retry-After")} s.`,
    );
  }
  if (!loginRes.ok) fail(`POST /api/auth/login answered ${loginRes.status}.`);
  loginResponseSchema.parse(await loginRes.json());
  console.log(`Verified: the passphrase logs in to ${url}.`);
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "verify") await verify(options.url);
else await provision(options);
process.exit(0);
