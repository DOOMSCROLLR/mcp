# Changelog

## 1.1.4

- `POST /api/v1/oauth/credentials` can be locked to this server with `OAUTH_CREDENTIALS_SHARED_SECRET`. When set, the authorize password exchange sends `X-Doomscrollr-OAuth-Internal`.

## 1.1.3

- Hardened MCP OAuth Dynamic Client Registration and the authorization prompt.
  - Registration still stays open for ChatGPT / Claude / Cursor MCP clients, but `client_id` is now a signed binding of `client_name` + `redirect_uris` instead of an unbound UUID.
  - `/oauth/authorize` rejects unsigned clients, unbound attacker `redirect_uri` values, and requests without PKCE S256. The password form is not shown in those cases.
  - The consent screen shows the application name, callback host, and full redirect URI. Untrusted or brand-impersonating callbacks require an explicit confirmation checkbox.
  - `/oauth/register` validates redirect URIs (https or localhost http only), rate-limits by IP, and can optionally require `OAUTH_REGISTRATION_ACCESS_TOKEN`.
  - Token exchange requires PKCE S256 and an exact `client_id` / `redirect_uri` match. Authorization responses include `iss` (RFC 9207).

## 1.1.0

- Added public-storefront product scrapers + importers for Gumroad, Payhip, Bandcamp, and Big Cartel.
  - `doomscrollr_scrape_<platform>_products` and `doomscrollr_import_<platform>_products` tool pairs for each new platform, mirroring the existing Shopify pattern.
  - Digital/virtual products (Gumroad, Payhip, most Bandcamp items) are imported as `type=digital` with shipping disabled.
- Added unified auto-detect tools `doomscrollr_scrape_url_products` and `doomscrollr_import_url_products` that sniff the platform from the URL host (shopify, gumroad, payhip, bandcamp, bigcartel) and fall back to Shopify for custom domains.
- Gumroad scraper supports the current Inertia.js page format in addition to legacy `data-component-props` and `window.GR_INITIAL_STATE` blobs, so profile-page product discovery and per-product price/image extraction work on contemporary Gumroad creator pages.
- Source URLs and import attribution remain in tool result metadata only — never appended to product or post descriptions.
- Added test fixtures for the new scrapers (`test/scrapers.test.mjs`).
- Verified live against real creator storefronts (Gumroad: mackenziechild; Bandcamp: Bonobo; Payhip: CollectiveWellness, RawBeadCollection; Big Cartel: shop.bigcartel.com).

## 1.0.23

- Clarified Shopify imports must not append source attribution or original listing URLs to product/post descriptions.

## 1.0.22

- Expanded npm keywords for AI-agent discovery (`ai`, `ai-agents`, MCP, ChatGPT, Claude, OpenAI, automation, ecommerce).

## 1.0.21

- Shopify import post results now surface the direct DOOMSCROLLR product URL as `link_url`/`product_url` for both-mode imports.

## 1.0.20

- Added `doomscrollr_prepare_user_questions` for structured end-user decision prompts.
- Shopify scrape results now include suggested import questions/options.

## 1.0.19

- Shopify imports now keep source Shopify links only on post-only imports; DOOMSCROLLR product imports no longer link product records back to Shopify.

## 1.0.18

- Added first-class Shopify MCP scraping/import tools for public storefront product feeds.

## 1.0.16

- Rewrite README as an AI-agent marketplace landing page.
- Add repo-level AGENTS.md and CLAUDE.md for coding-agent/LLM retrieval.
- Document client install blocks, tool safety labels, and high-intent prompts.
- Refresh MCP Registry server metadata version/package version.

