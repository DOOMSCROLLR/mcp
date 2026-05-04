# Changelog

## 1.1.0

- Added public-storefront product scrapers + importers for Gumroad, Payhip, Bandcamp, and Big Cartel.
  - `doomscrollr_scrape_<platform>_products` and `doomscrollr_import_<platform>_products` tool pairs for each new platform, mirroring the existing Shopify pattern.
  - Digital/virtual products (Gumroad, Payhip, most Bandcamp items) are imported as `type=digital` with shipping disabled.
- Added unified auto-detect tools `doomscrollr_scrape_url_products` and `doomscrollr_import_url_products` that sniff the platform from the URL host (shopify, gumroad, payhip, bandcamp, bigcartel) and fall back to Shopify for custom domains.
- Source URLs and import attribution remain in tool result metadata only — never appended to product or post descriptions.
- Added test fixtures for the new scrapers (`test/scrapers.test.mjs`).

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

