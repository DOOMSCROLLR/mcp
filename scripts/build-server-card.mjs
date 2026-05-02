// Build a richer server-card.json by introspecting the registered MCP tools.
// Uses Zod 4's built-in toJSONSchema().
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import { createServer } from "../dist/server.js";

const server = createServer("placeholder-server-card-build", "https://doomscrollr.com/api/v1");
// McpServer holds _registeredTools directly
const reg = server._registeredTools || {};
console.log("_registeredTools keys count:", Object.keys(reg).length);
const names = Object.keys(reg).sort();
const tools = [];
for (const name of names) {
  const t = reg[name];
  let inputSchema = { type: "object", properties: {} };
  try {
    if (t.inputSchema) {
      const js = z.toJSONSchema(t.inputSchema);
      if (js && typeof js === "object") {
        const { $schema, ...rest } = js;
        inputSchema = rest;
      }
    }
  } catch (err) {
    console.error(`tool ${name} schema convert error:`, err.message);
  }
  if (!inputSchema.type) inputSchema.type = "object";
  if (!inputSchema.properties) inputSchema.properties = {};

  let outputSchema;
  try {
    if (t.outputSchema && typeof z.toJSONSchema === "function") {
      const js = z.toJSONSchema(t.outputSchema);
      if (js && typeof js === "object") {
        const { $schema, ...rest } = js;
        outputSchema = rest;
      }
    }
  } catch (err) { /* ignore */ }

  const tool = {
    name,
    description: t.description || "",
    inputSchema,
    annotations: {
      title: t.annotations?.title || name.replace(/^doomscrollr_/, "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      readOnlyHint: !!t.annotations?.readOnlyHint,
      destructiveHint: !!t.annotations?.destructiveHint,
      openWorldHint: !!t.annotations?.openWorldHint,
    },
  };
  if (outputSchema) tool.outputSchema = outputSchema;
  tools.push(tool);
}

const card = {
  serverInfo: { name: "doomscrollr", version: "1.0.24" },
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
    icon: "https://doomscrollr.com/share.png",
    logo: "https://doomscrollr.com/share.png",
    iconUrl: "https://doomscrollr.com/share.png",
    logoUrl: "https://doomscrollr.com/share.png",
  },
  icon: "https://doomscrollr.com/share.png",
  logo: "https://doomscrollr.com/share.png",
  tools,
  resources: [
    { uri: "ui://doomscrollr/widgets/pinterest-v1.html", name: "doomscrollr-pinterest-widget", mimeType: "text/html;profile=mcp-app", description: "Pinterest search results card with imageable pins ready to draft." },
    { uri: "ui://doomscrollr/widgets/product-v1.html", name: "doomscrollr-product-widget", mimeType: "text/html;profile=mcp-app", description: "Product / Shopify import card with title, price, image, and CTA." },
    { uri: "ui://doomscrollr/widgets/style-v1.html", name: "doomscrollr-style-widget", mimeType: "text/html;profile=mcp-app", description: "Style preset preview card showing applied brand styling." },
    { uri: "ui://doomscrollr/widgets/analytics-v1.html", name: "doomscrollr-analytics-widget", mimeType: "text/html;profile=mcp-app", description: "Top-liked posts analytics card for the last N days." },
  ],
  prompts: [],
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, "..", "dist", "server-card.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(card, null, 2));
console.log(`wrote ${out} with ${tools.length} tools`);
const sample = tools.find((x) => x.name === "doomscrollr_publish_post") || tools[0];
console.log("sample:", JSON.stringify(sample, null, 2).slice(0, 1200));
