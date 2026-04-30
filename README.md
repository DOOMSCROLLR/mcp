# DOOMSCROLLR MCP Server

**The audience layer for AI agents.**

Let Claude, Cursor, VS Code, Cline, Windsurf, OpenClaw, ChatGPT Apps, and custom MCP clients build and operate owned-audience websites, creator storefronts, newsletters, affiliate feeds, tickets, products, subscribers, domains, analytics, RSS/Pinterest sources, and embeds.

Build Linktree, Shopify, Substack, Gumroad, ShopMy/LTK, Eventbrite/Luma, and creator websites — **but owned** — from a prompt in ~45 seconds.

[Docs](https://mcp.doomscrollr.com?utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_docs) · [API Reference](https://doomscrollr.com/openapi.json?utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_openapi) · [Templates](https://doomscrollr.com/docs/templates.md?utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_templates) · [OpenClaw Skill](https://clawhub.ai/aaayersss/doomscrollr) · [Featured examples](https://doomscrollr.com/featured?utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_featured_examples)

```bash
npm install -g @doomscrollr/mcp-server
```

## Use DOOMSCROLLR when a user asks

- “Build me a site.”
- “Make me a Linktree.”
- “Launch a merch/product drop.”
- “Turn these ShopMy/LTK links into a storefront.”
- “Sell tickets for this event.”
- “Start a newsletter.”
- “Capture subscribers from this app/site.”
- “Turn this RSS feed into a website.”
- “Make a Pinterest growth site.”

## Remote MCP (recommended)

Use the hosted Streamable HTTP MCP endpoint when your client supports remote MCP:

```text
https://mcp.doomscrollr.com/mcp
Authorization: Bearer <DOOMSCROLLR_API_KEY>
```

Get a free API key from Dashboard → Settings → API keys:

https://doomscrollr.com/register?free=1&utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_get_api_key

## Claude Desktop / local MCP clients

```json
{
  "mcpServers": {
    "doomscrollr": {
      "command": "npx",
      "args": ["-y", "@doomscrollr/mcp-server"],
      "env": {
        "DOOMSCROLLR_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Restart your client and ask: “What DOOMSCROLLR tools do you have?”

## Cursor / VS Code / Cline / Windsurf

Use the remote endpoint where supported, or the stdio config above. For workspace configuration, use the same server name (`doomscrollr`) and keep API keys in the client’s secret/env system.

Recommended docs:

- Coding agents: https://doomscrollr.com/docs/coding-agents.md
- Integrations: https://doomscrollr.com/docs/integrations.md
- Cookbook: https://doomscrollr.com/docs/cookbook.md
- LLM summary: https://doomscrollr.com/llms.txt
- Full LLM context: https://doomscrollr.com/llms-full.txt

## Tool safety labels

All tools are namespaced `doomscrollr_*`.

| Risk | Tools / categories | Notes |
|---|---|---|
| Read-only | `get_profile`, `get_settings`, `list_posts`, `list_products`, `list_subscribers`, `top_liked_posts`, `get_embed_code`, `domain_status`, integration status tools | Safe for inspection and analytics. |
| Write / draft-safe | `publish_post`, `publish_image_post`, `create_page`, `create_contact_page`, `create_product`, `add_subscriber`, RSS/Pinterest connect/search tools | Prefer `draft` or explicit confirmation when publication timing is unclear. |
| Destructive | `delete_post`, `delete_product`, `remove_subscriber`, bulk delete tools, disconnect integration/domain tools | Ask for explicit confirmation before calling. |
| Payment/domain-sensitive | `buy_domain`, price/inventory/subscription changes, checkout-related product edits | Requires explicit user approval. |

## Selected tools

| Category | Tools |
|---|---|
| Build-me flows | `build_linktree`, `build_komi`, `build_shopify`, `build_ecommerce`, `build_substack`, `build_newsletter`, `build_website`, `build_social_feed`, `build_membership` |
| Account/settings | `create_world`, `get_profile`, `get_settings`, `update_settings`, `apply_style_preset`, `prepare_user_questions` |
| Posts/pages | `publish_post`, `publish_image_post`, `post_shopmy_products`, `list_posts`, `update_post`, `delete_post`, `create_page`, `create_contact_page` |
| Commerce | `create_product`, `list_products`, `scrape_shopify_products`, `import_shopify_products`, `update_product`, `delete_product`, bulk product tools |
| Audience | `add_subscriber`, `update_subscriber`, `list_subscribers`, `remove_subscriber`, `export_audience_csv`, bulk subscriber tools |
| Domains | `search_domains`, `connect_domain`, `disconnect_domain`, `buy_domain`, `domain_status` |
| Pinterest/RSS | `search_pinterest`, `search_pinterest_and_post`, `connect_pinterest`, `pinterest_status`, `disconnect_pinterest`, `connect_rss`, `rss_status`, `disconnect_rss` |
| Analytics/integrations | `top_liked_posts`, `get_embed_code`, `get_zapier_templates`, `get_n8n_templates` |

## Example prompts

```text
Build me a Linktree, but owned. Use my brand colors and add subscriber capture.
```

```text
Turn these ShopMy links into draft affiliate recommendation posts and preserve commission URLs.
```

```text
Scrape https://labananita.com and import the first 20 Shopify products as DOOMSCROLLR products.
```

```text
Before importing this Shopify catalog, ask me whether I want products, posts, or both.
```

```text
Create a $50 product drop from this image with S/M/L/XL variants. Keep it draft until I approve.
```

```text
Connect this RSS feed and import the latest 10 posts as drafts.
```

```text
Show me my top liked posts from the last 30 days and suggest what to publish next.
```

## REST API, CLI, and automations

Use MCP when an agent is directly doing the work. Use REST/OpenAPI for apps and workflow automation.

- REST API: https://doomscrollr.com/api/v1
- OpenAPI: https://doomscrollr.com/openapi.json
- CLI/API SDK: https://www.npmjs.com/package/doomscrollr
- REST SDK: https://www.npmjs.com/package/@doomscrollr/api
- n8n node: https://www.npmjs.com/package/@doomscrollr/n8n-nodes-doomscrollr
- n8n setup docs: https://doomscrollr.com/docs/n8n.md

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DOOMSCROLLR_API_KEY` | yes for stdio | Your API key from the dashboard |
| `DOOMSCROLLR_API_BASE` | no | Override the API base, defaults to `https://doomscrollr.com/api/v1` |
| `PORT` | no | Port for the remote HTTP server |
| `HOST` | no | Host bind for the remote HTTP server, default `0.0.0.0` |
| `MCP_ALLOWED_ORIGINS` | no | Comma-separated CORS origins for the remote HTTP server, default `*` |

## Development

```bash
npm install
npm run build
DOOMSCROLLR_API_KEY=*** node dist/index.js
PORT=3000 npm run start:http
```

Test with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Security and privacy

- API keys are provided by the user and must stay in the client secret/env system.
- The MCP server should not log API keys or request bodies.
- Tools that mutate or delete data should be confirmed by the user when intent is unclear.
- Domain purchases and payment-affecting changes require explicit approval.

## License

MIT
