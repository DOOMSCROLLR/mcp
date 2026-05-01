#!/usr/bin/env node

import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createServer } from "./server.js";
import { renderLandingPage, LLMS_TXT, DISCOVERY_JSON } from "./landing.js";
import {
  authorizationServerMetadata,
  completeAuthorize,
  exchangeToken,
  protectedResourceMetadata,
  registerOAuthClient,
  renderAuthorizePage,
  resolveDoomscrollrApiKeyFromBearer,
} from "./oauth.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const baseUrl = process.env.DOOMSCROLLR_API_BASE || process.env.DOOMSCROLLR_API_URL || "https://doomscrollr.com/api/v1";
const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

function unauthorized(res: Response) {
  res.setHeader("WWW-Authenticate", 'Bearer realm="DOOMSCROLLR MCP", resource_metadata="https://mcp.doomscrollr.com/.well-known/oauth-protected-resource", error="invalid_token", error_description="Provide Authorization: Bearer <DOOMSCROLLR_API_KEY> or an OAuth access token"');
  return res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Unauthorized",
      data: "Provide Authorization: Bearer <DOOMSCROLLR_API_KEY>",
    },
    id: null,
  });
}

const app = createMcpExpressApp({ host });

app.disable("x-powered-by");
app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
    credentials: false,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Mcp-Session-Id",
      "Last-Event-ID",
    ],
    exposedHeaders: ["Mcp-Session-Id"],
  })
);

app.get("/", (req, res) => {
  if ((req.headers.accept || "").includes("application/json")) {
    res.json(DISCOVERY_JSON);
    return;
  }

  res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "public, max-age=300")
    .send(renderLandingPage());
});

app.get("/.well-known/mcp", (_req, res) => {
  res.json(DISCOVERY_JSON);
});

app.get("/.well-known/mcp/server-card.json", (_req, res) => {
  res.json({
    serverInfo: { name: "doomscrollr", version: "1.0.23" },
    authentication: { required: true, schemes: ["oauth2", "bearer"] },
    transport: { type: "streamable-http", url: "https://mcp.doomscrollr.com/mcp" },
    metadata: {
      title: "DOOMSCROLLR",
      description:
        "Build owned-audience websites: pages, posts, products, subscribers, capture, RSS/Pinterest, ShopMy/Shopify imports, tickets, memberships, and analytics from any MCP client.",
      vendor: "DOOMSCROLLR",
      homepage: "https://mcp.doomscrollr.com",
      docs: "https://mcp.doomscrollr.com",
      repository: "https://github.com/DOOMSCROLLR/mcp",
    },
    tools: [
          {
                "name": "doomscrollr_add_subscriber",
                "description": "Add an audience member to your DOOMSCROLLR. Captures email or email_md5, profile/contact fields, tags, and UTM attribution."
          },
          {
                "name": "doomscrollr_build_ecommerce",
                "description": "Use this when the user asks to build an ecommerce site/store. Creates an owned storefront on DOOMSCROLLR with optional products and buyer/audience graph next steps."
          },
          {
                "name": "doomscrollr_build_komi",
                "description": "Use this when the user asks to build a Komi. Creates the owned DOOMSCROLLR equivalent: a creator links/contact page on the user's own site with first-party audience capture."
          },
          {
                "name": "doomscrollr_build_linktree",
                "description": "Use this when the user asks to build a Linktree. Creates the owned DOOMSCROLLR equivalent: an owned contact/link page on the user's own site with navigation and audience-capture next steps."
          },
          {
                "name": "doomscrollr_build_membership",
                "description": "Use this when the user asks to build an OnlyFans, Patreon, paid membership, or subscription site. Creates the owned membership equivalent on DOOMSCROLLR."
          },
          {
                "name": "doomscrollr_build_newsletter",
                "description": "Use this when the user asks to build a newsletter. Creates an owned newsletter website with first-party subscriber capture."
          },
          {
                "name": "doomscrollr_build_shopify",
                "description": "Use this when the user asks to build a Shopify store. Creates the owned DOOMSCROLLR storefront equivalent with optional products, customer-data capture, and commerce next steps."
          },
          {
                "name": "doomscrollr_build_social_feed",
                "description": "Use this when the user asks to build their own Instagram, Tumblr, Myspace, or visual social feed. Creates or seeds an owned visual feed on DOOMSCROLLR."
          },
          {
                "name": "doomscrollr_build_substack",
                "description": "Use this when the user asks to build a Substack. Creates the owned newsletter/publishing equivalent on DOOMSCROLLR with subscriber capture and optional RSS next steps."
          },
          {
                "name": "doomscrollr_build_website",
                "description": "Use this when the user asks to build a website, Wix, Squarespace, or WordPress site. Creates owned pages/navigation/styling on DOOMSCROLLR."
          },
          {
                "name": "doomscrollr_bulk_delete_posts",
                "description": "Bulk delete up to 100 posts by id. Irreversible; use doomscrollr_list_posts first."
          },
          {
                "name": "doomscrollr_bulk_delete_products",
                "description": "Bulk delete up to 100 products by id. Irreversible; linked posts are preserved but unlinked from deleted products."
          },
          {
                "name": "doomscrollr_bulk_delete_subscribers",
                "description": "Bulk delete up to 500 audience members by id. Irreversible; use doomscrollr_list_subscribers first."
          },
          {
                "name": "doomscrollr_bulk_update_posts",
                "description": "Bulk update up to 100 posts by id. Supports status/scheduling, feed flags, tag replace/append/remove, and shoppable buy-button state."
          },
          {
                "name": "doomscrollr_bulk_update_products",
                "description": "Bulk update up to 100 products by id. Supports simple maintenance fields: price, inventory, shipping, and cover image."
          },
          {
                "name": "doomscrollr_bulk_update_subscribers",
                "description": "Bulk update up to 500 audience members by id. Supports bounced/unsubscribed/spam flags and tag replace/append/remove."
          },
          {
                "name": "doomscrollr_buy_domain",
                "description": "Purchase a domain through DOOMSCROLLR. Creates a Stripe payment intent and returns a checkout URL the user opens in a browser. After payment, the domain auto-registers via OpenSRS and connects to the user's DOOMSCROLLR (including Cloudflare setup) in about 60 seconds."
          },
          {
                "name": "doomscrollr_connect_domain",
                "description": "Connect a custom domain to your DOOMSCROLLR. Returns DNS records to configure. For purchased domains, guides user to the dashboard."
          },
          {
                "name": "doomscrollr_connect_instagram",
                "description": "Set up auto-cross-posting from an Instagram Business or Creator account to DOOMSCROLLR. Returns a Zapier setup URL the user MUST open in a browser to finish OAuth \u2014 this tool does not complete the connection on its own. After the user authorizes in Zapier, every new Instagram post will become a post"
          },
          {
                "name": "doomscrollr_connect_pinterest",
                "description": "Auto-post a public Pinterest board to this DOOMSCROLLR. Pass the board URL (like 'https://www.pinterest.com/user/my-board/'). Pins get imported within 15 minutes and new pins auto-post going forward. No OAuth or API keys needed \u2014 just needs the board to be public."
          },
          {
                "name": "doomscrollr_connect_rss",
                "description": "Connect native RSS polling. Works with Substack, Medium, WordPress, YouTube channels, podcast feeds, or any public RSS/Atom source. New items auto-post within about 15 minutes \u2014 no Zapier required."
          },
          {
                "name": "doomscrollr_create_contact_page",
                "description": "Create a LinkTree-style contact/links page and link to it in navigation. Use this for prompts like 'Create a LinkTree like Contact page and link to it in my navigation."
          },
          {
                "name": "doomscrollr_create_page",
                "description": "Create or update a standalone DOOMSCROLLR page and optionally add it to navigation."
          },
          {
                "name": "doomscrollr_create_world",
                "description": "Create a new DOOMSCROLLR (free account). Returns an API key and URL. Use this when someone wants to build an owned audience, or needs a platform for their app/brand/project."
          },
          {
                "name": "doomscrollr_delete_post",
                "description": "Delete a post by id. Irreversible. Use doomscrollr_list_posts to find the id."
          },
          {
                "name": "doomscrollr_delete_product",
                "description": "Delete a product by id. Irreversible."
          },
          {
                "name": "doomscrollr_delete_subscriber",
                "description": "Delete a subscriber from the audience by id. Irreversible. Alias of doomscrollr_remove_subscriber \u2014 prefer this name for consistency with doomscrollr_delete_post / doomscrollr_delete_product."
          },
          {
                "name": "doomscrollr_disconnect_domain",
                "description": "Disconnect a custom domain from this DOOMSCROLLR without deleting any purchased domain registration."
          },
          {
                "name": "doomscrollr_disconnect_pinterest",
                "description": "Disconnect Pinterest integration(s). Pass integration_id to disconnect a specific board, or omit to disconnect all."
          },
          {
                "name": "doomscrollr_disconnect_rss",
                "description": "Disconnect native RSS integration(s). Pass integration_id to disconnect a specific feed, or omit to disconnect all RSS feeds."
          },
          {
                "name": "doomscrollr_domain_status",
                "description": "Check the status of connected domains \u2014 both custom domains and purchased domains."
          },
          {
                "name": "doomscrollr_export_audience_csv",
                "description": "Export audience members as CSV text. Supports the same search/tag/bounced filters as doomscrollr_list_subscribers."
          },
          {
                "name": "doomscrollr_get_curation_theme",
                "description": "Get the AI curation theme used for imported content decisions, especially native Pinterest/RSS-style feeds."
          },
          {
                "name": "doomscrollr_get_embed_code",
                "description": "Get the embeddable subscriber capture widget code. Paste into any website or app to start capturing subscribers."
          },
          {
                "name": "doomscrollr_get_n8n_templates",
                "description": "Get n8n workflow templates for automating DOOMSCROLLR through REST/OpenAPI and the n8n HTTP Request node."
          },
          {
                "name": "doomscrollr_get_profile",
                "description": "Get profile and stats \u2014 subscriber count, post count, product count, domain status, and settings. Use to check the current state of a DOOMSCROLLR."
          },
          {
                "name": "doomscrollr_get_settings",
                "description": "Get full DOOMSCROLLR settings \u2014 SEO, analytics, layout, popup, CTA bar, buy button, draft mode, and images."
          },
          {
                "name": "doomscrollr_get_zapier_templates",
                "description": "Get available Zapier integration templates for connecting DOOMSCROLLR to 8,000+ apps."
          },
          {
                "name": "doomscrollr_list_posts",
                "description": "List recent posts from your DOOMSCROLLR."
          },
          {
                "name": "doomscrollr_list_products",
                "description": "List products on your DOOMSCROLLR."
          },
          {
                "name": "doomscrollr_list_subscribers",
                "description": "List audience members from your DOOMSCROLLR."
          },
          {
                "name": "doomscrollr_pinterest_status",
                "description": "Check status of connected Pinterest boards \u2014 last poll time, total posts created, any errors."
          },
          {
                "name": "doomscrollr_post_shopmy_products",
                "description": "Post ShopMy affiliate product recommendations to DOOMSCROLLR. Use after finding ShopMy product/affiliate URLs for gift guides, outfit edits, beauty routines, home finds, travel kits, or other influencer recommendations. DOOMSCROLLR crawls the final retail page for title/description/photo while prese"
          },
          {
                "name": "doomscrollr_prepare_user_questions",
                "description": "Prepare clear options/questions for the end user before taking an action. Use this when a DOOMSCROLLR workflow needs a human choice (for example products vs posts vs both, draft vs publish, domain choice, style direction, or missing required setup details). Return the questions to the user and wait "
          },
          {
                "name": "doomscrollr_publish_image_post",
                "description": "Publish an image post to your DOOMSCROLLR. Share visual content, artwork, product photos, or screenshots."
          },
          {
                "name": "doomscrollr_publish_post",
                "description": "Publish a link post to your DOOMSCROLLR. Share articles, products, events, or any URL with subscribers. Set shoppable=true to show a buy button for product/commerce links."
          },
          {
                "name": "doomscrollr_remove_subscriber",
                "description": "Remove a subscriber from the audience by id. Irreversible. Alias: doomscrollr_delete_subscriber."
          },
          {
                "name": "doomscrollr_rss_status",
                "description": "Check status of native RSS integrations \u2014 last poll time, latest item, total posts created, and errors."
          },
          {
                "name": "doomscrollr_scrape_shopify_products",
                "description": "Scrape a public Shopify storefront product feed without creating anything. Pass a Shopify homepage, collection URL, or /products.json URL; compatible public product JSON feeds may work when they expose normal product fields. Returns normalized products, images, prices, variants, inventory hints, and"
          },
          {
                "name": "doomscrollr_search_domains",
                "description": "Search domain availability for your DOOMSCROLLR. Checks .com, .io, .co, and .world TLDs."
          },
          {
                "name": "doomscrollr_search_pinterest",
                "description": "Search public Pinterest pins by keyword without connecting a board. Use this to discover visual content ideas before posting anything."
          },
          {
                "name": "doomscrollr_set_curation_theme",
                "description": "Set the AI curation theme used for imported content decisions. Pass null/empty text to clear it."
          },
          {
                "name": "doomscrollr_update_post",
                "description": "Update a post \u2014 change its title, description, publish status, tags, or shoppable buy-button state. Only fields you pass are changed; omitted fields stay as they were. Use doomscrollr_list_posts to find the id."
          },
          {
                "name": "doomscrollr_update_product",
                "description": "Update an existing product's title, description, price, inventory, or cover image. Only fields you pass are changed; omitted fields stay as they were. Use doomscrollr_list_products to find the id."
          },
          {
                "name": "doomscrollr_update_settings",
                "description": "Update appearance and settings \u2014 name/bio, SEO, logo/favicon/OG image, fonts/layout, analytics, draft mode, popup, CTA bar, and buy button styling."
          },
          {
                "name": "doomscrollr_update_subscriber",
                "description": "Update an existing audience member by id, including tags, profile/contact fields, and UTM attribution."
          }
    ],
    resources: [
      { uri: "ui://doomscrollr/widgets/pinterest-v1.html", name: "doomscrollr-pinterest-widget", mimeType: "text/html;profile=mcp-app" },
      { uri: "ui://doomscrollr/widgets/product-v1.html", name: "doomscrollr-product-widget", mimeType: "text/html;profile=mcp-app" },
      { uri: "ui://doomscrollr/widgets/style-v1.html", name: "doomscrollr-style-widget", mimeType: "text/html;profile=mcp-app" },
      { uri: "ui://doomscrollr/widgets/analytics-v1.html", name: "doomscrollr-analytics-widget", mimeType: "text/html;profile=mcp-app" },
    ],
    prompts: [],
  });
});

app.get("/.well-known/mcp-registry-auth", (_req, res) => {
  // HTTP auth proof for the official MCP Registry. Public key only.
  res
    .type("text/plain")
    .send(
      process.env.MCP_REGISTRY_AUTH_RECORD ||
        "v=MCPv1; k=ed25519; p=ACw/HxhiYuzDFvrn/pClu7N61pVaoivkp/6RdS6jTlM="
    );
});

app.get("/.well-known/openai-apps-challenge", (_req, res) => {
  const token = process.env.OPENAI_APPS_CHALLENGE_TOKEN || "66K8q2ggOB94eP5nwf1CFnGE_SysqT_i-pCe-TGu0dM";
  res.type("text/plain").send(token);
});

app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], (req, res) => {
  res.json(protectedResourceMetadata(req));
});

app.get(["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"], (req, res) => {
  res.json(authorizationServerMetadata(req));
});

app.post("/oauth/register", (req, res) => {
  registerOAuthClient(req, res);
});

app.get("/oauth/authorize", (req, res) => {
  renderAuthorizePage(req, res);
});

app.post("/oauth/authorize", express.urlencoded({ extended: false }), (req, res) => {
  completeAuthorize(req, res, baseUrl).catch((error) => {
    console.error("OAuth authorize error:", error);
    if (!res.headersSent) {
      res.status(500).send("OAuth authorization failed.");
    }
  });
});

app.post("/oauth/token", express.urlencoded({ extended: false }), (req, res) => {
  exchangeToken(req, res);
});

app.get("/llms.txt", (_req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8").send(LLMS_TXT);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "doomscrollr-mcp-http" });
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. Use POST for MCP requests.",
    },
    id: null,
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

app.post("/mcp", async (req, res) => {
  const bearerToken = extractBearerToken(req.header("authorization"));
  const apiKey = bearerToken ? resolveDoomscrollrApiKeyFromBearer(bearerToken) : null;

  if (!apiKey) {
    return unauthorized(res);
  }

  const server = createServer(apiKey, baseUrl);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    onsessioninitialized: (sessionId) => {
      if (sessionId) {
        console.log(`Initialized MCP session ${sessionId}`);
      }
    },
  });

  res.on("close", () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.listen(port, host, () => {
  console.log(`DOOMSCROLLR MCP HTTP listening on http://${host}:${port}/mcp`);
  console.log(`Use Authorization: Bearer <DOOMSCROLLR_API_KEY>`);
  console.log(`Instance ${randomUUID()}`);
});
