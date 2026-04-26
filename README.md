# @doomscrollr/mcp-server

The [Model Context Protocol](https://modelcontextprotocol.io) server for **DOOMSCROLLR** — lets AI agents build and operate an owned creator audience end-to-end.

Create a DOOMSCROLLR, publish posts, manage subscribers, sell products, connect Pinterest boards, buy custom domains, and more — all from Claude Desktop, ChatGPT, Cursor, or any MCP-compatible client.

## What you can do with it

> *"Set up a DOOMSCROLLR for Frida, my English Cocker Spaniel. Connect a few Pinterest boards about the breed. Buy the domain fridasfriends.com. Launch a $35 bandana product with an event-ticket upsell."*

That whole paragraph takes about 45 seconds with this MCP server — the AI calls the tools, the backend does the work, the user answers two browser prompts (Stripe payment, Zapier OAuth when relevant).

## Quick start

### 1. Get an API key

Free account at [doomscrollr.com](https://doomscrollr.com). Your API key is in the dashboard under **Settings → API keys**.

### 2. Install in Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Restart Claude Desktop. Ask it: *"What DOOMSCROLLR tools do you have?"*

### 3. Or install globally

```bash
npm install -g @doomscrollr/mcp-server
export DOOMSCROLLR_API_KEY=your_api_key_here
doomscrollr-mcp
```

## Clients

Works with any MCP-compatible client:

- **Claude Desktop** — see config above
- **Cursor / Windsurf / Cline** — same pattern, edit their MCP config
- **ChatGPT / Claude remote connectors** — use the Streamable HTTP endpoint (see Remote HTTPS below)
- **Custom agents via the MCP SDK** — connect over stdio or Streamable HTTP

## Tools (27)

| Category | Tools |
|---|---|
| Account | `create_world`, `get_profile`, `update_settings` |
| Posts | `publish_post`, `publish_image_post`, `list_posts`, `update_post`, `delete_post` |
| Products | `create_product`, `list_products`, `update_product`, `delete_product` |
| Subscribers | `add_subscriber`, `list_subscribers`, `remove_subscriber` / `delete_subscriber` |
| Domains | `search_domains`, `connect_domain`, `buy_domain`, `domain_status` |
| Pinterest | `connect_pinterest`, `pinterest_status`, `disconnect_pinterest` |
| Other integrations | `connect_instagram`, `connect_rss`, `get_zapier_templates` |
| Embed | `get_embed_code` |

All tools are namespaced `doomscrollr_*`.

## Resources (3)

| URI | MIME | Content |
|---|---|---|
| `doomscrollr://profile` | application/json | Current DOOMSCROLLR profile + stats |
| `doomscrollr://posts` | application/json | Recent posts |
| `doomscrollr://audience` | application/json | Subscribers |

## Prompts (4)

- `setup-doomscrollr` — guided end-to-end account setup
- `add-audience-capture` — embed the subscriber widget on any site
- `launch-product` — publish a product drop to your audience
- `migrate-from-instagram` — reduce IG dependency, build an owned channel

## Remote HTTPS (Streamable HTTP)

DOOMSCROLLR runs a hosted Streamable HTTP MCP endpoint for remote MCP clients (ChatGPT remote connectors, Claude Messages API, etc).

```text
POST https://mcp.doomscrollr.com/mcp
Authorization: Bearer YOUR_DOOMSCROLLR_API_KEY
```

The bearer token is your normal DOOMSCROLLR API key from the dashboard. No OAuth setup, no extra signup.

### Run the remote server locally

```bash
npm install
npm run build
PORT=3000 npm run start:http
```

Then point your MCP client at:

```text
http://localhost:3000/mcp
```

with header:

```text
Authorization: Bearer YOUR_DOOMSCROLLR_API_KEY
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DOOMSCROLLR_API_KEY` | yes for stdio | Your API key from the dashboard |
| `DOOMSCROLLR_API_BASE` | no | Override the API base (defaults to `https://doomscrollr.com/api/v1`) |
| `PORT` | no | Port for the remote HTTP server |
| `HOST` | no | Host bind for the remote HTTP server (default `0.0.0.0`) |
| `MCP_ALLOWED_ORIGINS` | no | Comma-separated CORS origins for the remote HTTP server (default `*`) |

## Development

```bash
git clone https://github.com/aaayersss/doomscrollr.git
cd doomscrollr/mcp
npm install
npm run build
DOOMSCROLLR_API_KEY=... node dist/index.js
# or
PORT=3000 npm run start:http
```

Test with the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT


## ChatGPT App readiness

Version 1.0.9 adds MCP tool annotations (`readOnlyHint`, `destructiveHint`, and `openWorldHint`) so ChatGPT Apps / connector review can distinguish read-only, write, public, and destructive actions.
