// Regression test for the bug meatasit reported and fixed in PR #1.
//
// The entrypoint guard used to compare import.meta.url against a
// string-concatenated `file://${process.argv[1]}`. On Windows argv[1] is a
// drive-letter path with backslashes, so the two strings could never match,
// invokedDirectly was always false, main() never ran, and the server exited 0
// having printed nothing. Every MCP client reported only "Connection closed".
//
// smoke.mjs cannot catch this: it imports createServer directly and so never
// executes the guard. This test runs the built file the way a client does.
import assert from "node:assert";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const entry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

// The unit half only means anything on Windows. pathToFileURL turns a
// drive-letter path into file:///C:/... there, while on POSIX the same string
// is just a relative filename and gets resolved against the cwd, so asserting
// the Windows shape off Windows tests the wrong thing.
if (process.platform === "win32") {
  const entryUrl = pathToFileURL(entry).href;
  assert.notStrictEqual(
    `file://${entry}`,
    entryUrl,
    "string concatenation now matches pathToFileURL, so this assertion proves nothing",
  );
  assert.ok(entryUrl.startsWith("file:///"), `pathToFileURL produced ${entryUrl}`);
}

// The integration half: spawn it and complete an MCP handshake over stdio.
const child = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "pipe"] });

let stdout = "";
let stderr = "";
child.stdout.on("data", (d) => { stdout += d.toString(); });
child.stderr.on("data", (d) => { stderr += d.toString(); });

let exitedEarly = null;
child.on("exit", (code) => { exitedEarly = code; });

child.stdin.write(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "entrypoint-test", version: "0" },
  },
}) + "\n");

const deadline = Date.now() + 8000;
while (Date.now() < deadline && !stdout.includes('"result"')) {
  if (exitedEarly !== null) break;
  await new Promise((r) => setTimeout(r, 100));
}

child.kill();

assert.strictEqual(
  exitedEarly,
  null,
  `the server exited with code ${exitedEarly} instead of serving. This is the Windows bug from PR #1. stderr: ${stderr.trim() || "(empty)"}`,
);
assert.ok(
  stdout.includes('"result"'),
  `no initialize response within 8s. stdout: ${stdout.trim() || "(empty)"} stderr: ${stderr.trim() || "(empty)"}`,
);

console.log("OK entrypoint runs as a program and answers initialize");
