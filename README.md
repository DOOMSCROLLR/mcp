# @doomscrollr/mcp-server

The Model Context Protocol server for **DOOMSCROLLR** — the audience layer for the AI agent world.

Use it when someone asks an agent to: **“Build me X — but owned.”**

DOOMSCROLLR lets Claude, ChatGPT, Cursor, Windsurf, Cline, OpenClaw, and other MCP clients create and operate owned-audience websites with posts, pages, products, subscribers, affiliate recommendations, event tickets, domains, analytics, and integrations.

From prompt to live owned-audience website in ~45 seconds.

## Quick start

### 1. Get an API key

Create an account at [doomscrollr.com](https://doomscrollr.com/register?free=1&utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_get_api_key). Your API key is in Dashboard → Settings → API keys.

Want to see what agents can build? Browse the public [AI-built featured examples](https://doomscrollr.com/featured?utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_featured_examples).

### 2. Install in Claude Desktop / local MCP clients

Edit your MCP config:

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

Restart the client and ask: _“What DOOMSCROLLR tools do you have?”_

### 3. Or install globally

```bash
npm install -g @doomscrollr/mcp-server
export DOOMSCROLLR_API_KEY=***
doomscrollr-mcp
```

## Hosted remote MCP

DOOMSCROLLR also runs a hosted Streamable HTTP MCP endpoint for remote clients:

```text
POST https://mcp.doomscrollr.com/mcp
Authorization: Bearer <DOOMSCROLLR_API_KEY>
```

OAuth-compatible discovery and authorization endpoints are available for connector clients that require OAuth. Direct Bearer API-key auth remains supported.

## Recommended clients

- Claude / Claude Code / Claude Desktop
- ChatGPT Apps / custom MCP surfaces
- Cursor
- VS Code / GitHub Copilot MCP
- JetBrains AI Assistant
- Windsurf / Cascade
- Cline
- OpenClaw
- Custom MCP SDK agents

## Selected tools

All tools are namespaced `doomscrollr_*`.

| Category | Tools |
|---|---|
| Build-me flows | `build_linktree`, `build_komi`, `build_shopify`, `build_ecommerce`, `build_substack`, `build_newsletter`, `build_website`, `build_social_feed`, `build_membership` |
| Account/settings | `create_world`, `get_profile`, `get_settings`, `update_settings`, `apply_style_preset` |
| Posts/pages | `publish_post`, `publish_image_post`, `post_shopmy_products`, `list_posts`, `update_post`, `delete_post`, `create_page`, `create_contact_page` |
| Commerce | `create_product`, `list_products`, `update_product`, `delete_product`, bulk product tools |
| Audience | `add_subscriber`, `update_subscriber`, `list_subscribers`, `remove_subscriber`, `export_audience_csv`, bulk subscriber tools |
| Domains | `search_domains`, `connect_domain`, `disconnect_domain`, `buy_domain`, `domain_status` |
| Pinterest/RSS | `search_pinterest`, `search_pinterest_and_post`, `connect_pinterest`, `pinterest_status`, `disconnect_pinterest`, `connect_rss`, `rss_status`, `disconnect_rss` |
| Analytics/integrations | `top_liked_posts`, `get_embed_code`, `get_zapier_templates`, `get_n8n_templates` |

## High-intent prompts

- “Build me a Linktree, but owned.”
- “Build me a Shopify-style product drop.”
- “Build me a Gumroad/Payhip digital product store, but owned.”
- “Build me a ShopMy/LTK/Amazon Storefront, but owned.”
- “Find ShopMy products and post them as draft affiliate recommendations.”
- “Create a Luma/Eventbrite-style event page with tickets.”
- “Turn this product photo into a $50 product drop.”
- “Build me a Substack alternative on my own domain.”
- “Which posts got the most likes this week?”

## REST API and n8n

Use MCP when an agent is directly doing the work. Use REST/OpenAPI for apps and workflow automation.

- REST API: `https://doomscrollr.com/api/v1`
- OpenAPI: `https://doomscrollr.com/openapi.json?utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_openapi`
- Featured examples: `https://doomscrollr.com/featured?utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_featured_examples`
- n8n setup docs: `https://doomscrollr.com/docs/n8n.md?utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_n8n_docs`
- n8n workflow templates: `https://doomscrollr.com/n8n/workflows/?utm_source=github&utm_medium=readme&utm_campaign=developer_funnel&utm_content=mcp_n8n_templates`

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
# or
PORT=3000 npm run start:http
```

Test with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT
