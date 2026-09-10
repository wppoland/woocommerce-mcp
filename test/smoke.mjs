// Smoke check: the server constructs and registers its tools without needing
// credentials or a network. Fails loudly if the SDK API or tool wiring breaks.
// Run: npm run check  (builds first, then this).
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createServer, VERSION } from "../dist/index.js";

const server = createServer();
assert.ok(server, "createServer() returned nothing");
assert.match(VERSION, /^\d+\.\d+\.\d+$/, "VERSION is not semver");

// VERSION is what the MCP handshake reports to every client, and it is a
// hardcoded string, so it drifts silently: it sat at 0.1.0 for the whole of
// 0.1.1 and no test noticed. Tie it to the manifest rather than to a habit.
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
assert.strictEqual(
  VERSION,
  pkg.version,
  `VERSION is ${VERSION} but package.json says ${pkg.version}; clients see the former`,
);

// The registered tool names live on the underlying server's tool registry.
// Reach in defensively so the check survives minor SDK shape changes.
const reg =
  server._registeredTools ??
  server.server?._registeredTools ??
  {};
const names = Object.keys(reg);

const expected = ["list_products", "get_product", "list_orders", "sales_report", "search_posts"];
for (const t of expected) {
  assert.ok(names.includes(t), `tool "${t}" not registered (found: ${names.join(", ") || "none"})`);
}

console.log(`OK woocommerce-mcp v${VERSION} - ${names.length} tools registered: ${names.join(", ")}`);
