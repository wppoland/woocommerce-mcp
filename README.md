# woocommerce-mcp

A small, read-only [Model Context Protocol](https://modelcontextprotocol.io) server for **WordPress + WooCommerce**. It lets Claude (or any MCP client) answer questions about a live store — products, orders, sales, and blog posts — over the official REST APIs. No writes, no plugins to install on the store: it talks to the existing WordPress/WooCommerce REST endpoints.

Built and maintained by [WPPoland](https://wppoland.com/en/) — senior WordPress & WooCommerce engineering. If you need this wired into a real store stack, we build [WooCommerce ERP and API integrations](https://wppoland.com/en/woocommerce-erp-integration/) and [enterprise e-commerce architecture](https://wppoland.com/en/enterprise-solutions/) (headless, integrations, AI-ready data).

## Tools

| Tool | What it does | Needs WooCommerce keys |
|------|--------------|:---:|
| `list_products` | List / search products (name, sku, price, stock, permalink) | yes |
| `get_product` | Full details for one product by id | yes |
| `list_orders` | Recent orders, newest first, optional status filter | yes |
| `sales_report` | Sales totals for a period (week / month / last_month / year) | yes |
| `search_posts` | Search published blog posts (public WP REST API) | no |

Everything is **read-only**. The server never creates, edits, or deletes anything in the store.

## Install & build

From npm (package name is scoped - the unscoped `woocommerce-mcp` name is locked on the registry):

```bash
npm install -g @wppoland/woocommerce-mcp
# or: npx @wppoland/woocommerce-mcp
```

From source:

```bash
git clone https://github.com/wppoland/woocommerce-mcp.git
cd woocommerce-mcp
npm install
npm run build
```

## Configure

Set three environment variables:

| Var | Required | Example |
|-----|:---:|---------|
| `WP_URL` | yes | `https://shop.example.com` |
| `WC_CONSUMER_KEY` | for `wc_*` tools | `ck_xxx` |
| `WC_CONSUMER_SECRET` | for `wc_*` tools | `cs_xxx` |

Create the WooCommerce keys in **WooCommerce → Settings → Advanced → REST API → Add key** with **Read** permission. `search_posts` works without keys against any public WordPress site.

> The keys are sent to your own store over HTTPS as REST query auth. Use HTTPS, and give the key **Read** access only.

## Use with Claude Desktop / Claude Code

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "woocommerce": {
      "command": "node",
      "args": ["/absolute/path/to/woocommerce-mcp/dist/index.js"],
      "env": {
        "WP_URL": "https://shop.example.com",
        "WC_CONSUMER_KEY": "ck_xxx",
        "WC_CONSUMER_SECRET": "cs_xxx"
      }
    }
  }
}
```

Then ask things like *"What were last month's WooCommerce sales?"* or *"List the 5 most recent orders that are on hold."*

## Docs on wppoland.com

- [WooCommerce MCP open source (read-only): release and ops guide](https://wppoland.com/en/woocommerce-mcp-open-source-read-only/) - npm scope, registry, Glama, and how we ship updates without write tools

## Articles (off-site)

Field notes published on DEV (not duplicates of wppoland.com pages):

- [A read-only MCP server for WooCommerce: what AI agents actually need from a store](https://dev.to/wppolandcom/a-read-only-mcp-server-for-woocommerce-what-ai-agents-actually-need-from-a-store-3fk6)
- [Syncing a wholesaler's API into WooCommerce without overselling or melting the server](https://dev.to/wppolandcom/syncing-a-wholesalers-api-into-woocommerce-without-overselling-or-melting-the-server-38ao)
- [Twelve months after migrating wppoland.com from WordPress to Astro on Cloudflare Pages](https://dev.to/wppolandcom/twelve-months-after-migrating-wppolandcom-from-wordpress-to-astro-on-cloudflare-pages-11fi)

Show HN: [discussion](https://news.ycombinator.com/item?id=48815903)

## Verify

```bash
npm run check   # builds, then asserts all five tools register (no network/credentials needed)
```

## Notes

- Node 18+ (uses the built-in `fetch`).
- Logs go to stderr so they never corrupt the stdio MCP protocol on stdout.
- API errors are surfaced with the store's message; credentials are never echoed.

## License

MIT © [WPPoland](https://wppoland.com/en/)
