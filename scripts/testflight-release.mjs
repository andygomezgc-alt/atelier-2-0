// Releases an iOS build to the chefs' TestFlight group: waits for Apple to process it, updates
// the build number in the review notes, adds it to the group and submits it for beta review.
//
// Usage:
//   node scripts/testflight-release.mjs 21                         # a given build number
//   node scripts/testflight-release.mjs --after 2026-10-20T13:00Z  # the newest build uploaded after that time
//   node scripts/testflight-release.mjs 21 --group Chefs           # group name (default: Chefs)
//
// Reads the App Store Connect key and app id from the `testflight` submit profile in apps/mobile/eas.json.
// Calls go through curl: Node's fetch does not reach api.appstoreconnect.apple.com on this machine.
import { execFile } from "node:child_process";
import { sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { releaseToGroup } from "./lib/testflight-release.mjs";

const run = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = { group: "Chefs" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--after") args.uploadedAfter = argv[++i];
    else if (argv[i] === "--group") args.group = argv[++i];
    else if (/^\d+$/.test(argv[i])) args.buildNumber = argv[i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.buildNumber && !(args.uploadedAfter && !Number.isNaN(Date.parse(args.uploadedAfter)))) {
    throw new Error("Pass a build number or --after <ISO time>");
  }
  return args;
}

function token({ keyPem, keyId, issuerId }) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "ES256", kid: keyId, typ: "JWT" })}.${b64({ iss: issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: keyPem, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${unsigned}.${signature}`;
}

// App Store Connect answers 401 now and then for no reason: retry those (the request was not applied).
// Other failures of a read are retried too; a failed write is reported, never repeated.
function ascClient(credentials, scratch) {
  return async function api(method, path, body) {
    const args = ["-sg", "--max-time", "30", "-w", "\n%{http_code}", "-X", method,
      "-H", `Authorization: Bearer ${token(credentials)}`, "-H", "Content-Type: application/json; charset=utf-8"];
    if (body) {
      // A file keeps non-ASCII text intact (typographic quotes in the notes break when passed inline).
      const file = join(scratch, "body.json");
      await writeFile(file, JSON.stringify(body), "utf8");
      args.push("--data-binary", `@${file}`);
    }
    let last = "";
    for (let attempt = 1; attempt <= 10; attempt++) {
      const { stdout } = await run("curl", [...args, `https://api.appstoreconnect.apple.com${path}`], { maxBuffer: 10 * 1024 * 1024 }).catch(() => ({ stdout: "\n000" }));
      const cut = stdout.lastIndexOf("\n");
      const status = Number(stdout.slice(cut + 1));
      const text = stdout.slice(0, cut);
      if (status >= 200 && status < 300) return text ? JSON.parse(text) : {};
      last = `${status} ${text.slice(0, 300)}`;
      // Reads also retry rate limits (429), server errors and curl failures (000).
      if (status !== 401 && (method !== "GET" || (status >= 400 && status < 500 && status !== 429))) break;
      await sleep(attempt * 2000);
    }
    throw new Error(`App Store Connect ${method} ${path.split("?")[0]} failed: ${last}`);
  };
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(2);
}
const eas = JSON.parse(await readFile(new URL("../apps/mobile/eas.json", import.meta.url), "utf8"));
const ios = eas.submit.testflight.ios;
const credentials = { keyPem: await readFile(ios.ascApiKeyPath, "utf8"), keyId: ios.ascApiKeyId, issuerId: ios.ascApiKeyIssuerId };
const scratch = await mkdtemp(join(tmpdir(), "atelier-testflight-"));
try {
  const result = await releaseToGroup({ api: ascClient(credentials, scratch), appId: ios.ascAppId, ...args });
  console.log(`Done: build ${result.build} for "${args.group}" is ${result.externalState}.`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
} finally {
  await rm(scratch, { recursive: true, force: true });
}
