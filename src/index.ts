#!/usr/bin/env node
/**
 * woocommerce-mcp — a Model Context Protocol server for WordPress + WooCommerce.
 *
 * Gives Claude (and any MCP client) read access to a store over the public
 * WordPress and authenticated WooCommerce REST APIs: products, single product,
 * recent orders, a sales report, and blog posts. Read-only by design — it never
 * writes to the store.
 *
 * Configure with env vars:
 *   WP_URL              e.g. https://shop.example.com   (required)
 *   WC_CONSUMER_KEY     WooCommerce REST API key        (required for wc_* tools)
 *   WC_CONSUMER_SECRET  WooCommerce REST API secret     (required for wc_* tools)
 *
 * Built by wppoland.com — WordPress & WooCommerce engineering.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export const VERSION = "0.1.0";

interface Config {
  wpUrl: string;
  key: string;
  secret: string;
}

/** Read + validate env at call time (not import time) so tooling/tests don't need credentials. */
function loadConfig(requireWoo: boolean): Config {
  const wpUrl = (process.env.WP_URL ?? "").trim().replace(/\/+$/, "");
  if (!wpUrl) throw new Error("Missing required env var WP_URL (e.g. https://shop.example.com)");
  if (!/^https?:\/\//.test(wpUrl)) throw new Error("WP_URL must start with http:// or https://");
  const key = (process.env.WC_CONSUMER_KEY ?? "").trim();
  const secret = (process.env.WC_CONSUMER_SECRET ?? "").trim();
  if (requireWoo && (!key || !secret)) {
    throw new Error("This tool needs WC_CONSUMER_KEY and WC_CONSUMER_SECRET (WooCommerce > Settings > Advanced > REST API).");
  }
  return { wpUrl, key, secret };
}

async function apiGet(
  base: string,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new Error(`Network error reaching ${url.host}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    // Surface the API error message but never echo the credentials in the URL.
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      detail = body?.message ? ` — ${body.message}` : "";
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(`API ${res.status} ${res.statusText}${detail}`);
  }
  return res.json();
}

function wc(cfg: Config, path: string, params: Record<string, string | number | undefined> = {}) {
  return apiGet(`${cfg.wpUrl}/wp-json/wc/v3/${path}`, {
    consumer_key: cfg.key,
    consumer_secret: cfg.secret,
    ...params,
  });
}

function wp(cfg: Config, path: string, params: Record<string, string | number | undefined> = {}) {
  return apiGet(`${cfg.wpUrl}/wp-json/wp/v2/${path}`, params);
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown): ToolResult => ({
  content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
});

export function createServer(): McpServer {
  const server = new McpServer({ name: "woocommerce-mcp", version: VERSION });

  server.registerTool(
    "list_products",
    {
      title: "List products",
      description: "List or search WooCommerce products. Returns id, name, sku, price, stock status and permalink.",
      inputSchema: {
        search: z.string().optional().describe("Search term to filter products by name/sku"),
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page (default 10)"),
        status: z.enum(["any", "draft", "pending", "private", "publish"]).optional().describe("Product status filter"),
      },
    },
    async ({ search, per_page, status }): Promise<ToolResult> => {
      try {
        const cfg = loadConfig(true);
        const data = (await wc(cfg, "products", { search, per_page: per_page ?? 10, status })) as Array<Record<string, unknown>>;
        return ok(
          data.map((p) => ({
            id: p.id, name: p.name, sku: p.sku, price: p.price,
            stock_status: p.stock_status, permalink: p.permalink,
          })),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product",
      description: "Get a single WooCommerce product by id, with full details.",
      inputSchema: { id: z.number().int().positive().describe("Product id") },
    },
    async ({ id }): Promise<ToolResult> => {
      try {
        return ok(await wc(loadConfig(true), `products/${id}`));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_orders",
    {
      title: "List orders",
      description: "List recent WooCommerce orders, newest first. Optionally filter by status.",
      inputSchema: {
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page (default 10)"),
        status: z
          .enum(["any", "pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"])
          .optional()
          .describe("Order status filter"),
      },
    },
    async ({ per_page, status }): Promise<ToolResult> => {
      try {
        const cfg = loadConfig(true);
        const data = (await wc(cfg, "orders", { per_page: per_page ?? 10, status, orderby: "date", order: "desc" })) as Array<Record<string, unknown>>;
        return ok(
          data.map((o) => ({
            id: o.id, number: o.number, status: o.status, total: o.total, currency: o.currency,
            date_created: o.date_created, customer: (o.billing as Record<string, unknown> | undefined)?.email,
          })),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "sales_report",
    {
      title: "Sales report",
      description: "WooCommerce sales totals for a period (week, month, last_month, year). Gross sales, orders, items.",
      inputSchema: {
        period: z.enum(["week", "month", "last_month", "year"]).optional().describe("Reporting period (default week)"),
      },
    },
    async ({ period }): Promise<ToolResult> => {
      try {
        return ok(await wc(loadConfig(true), "reports/sales", { period: period ?? "week" }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "search_posts",
    {
      title: "Search posts",
      description: "Search published WordPress blog posts (public REST API, no WooCommerce keys required).",
      inputSchema: {
        search: z.string().min(1).describe("Search term"),
        per_page: z.number().int().min(1).max(50).optional().describe("Results per page (default 10)"),
      },
    },
    async ({ search, per_page }): Promise<ToolResult> => {
      try {
        const cfg = loadConfig(false);
        const data = (await wp(cfg, "posts", { search, per_page: per_page ?? 10, _fields: "id,link,title,date,excerpt" })) as Array<Record<string, unknown>>;
        return ok(
          data.map((p) => ({
            id: p.id, link: p.link, date: p.date,
            title: (p.title as Record<string, unknown> | undefined)?.rendered,
          })),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  // stdio transport: logs must go to stderr so they don't corrupt the protocol on stdout.
  console.error(`woocommerce-mcp v${VERSION} ready (stdio)`);
}

// Only start the stdio server when run directly, not when imported (tests import createServer).
const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
