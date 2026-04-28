import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/server.js";

async function makeClient() {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/integrations/pinterest/search-post")) {
      return Response.json({ query: "air-cooled Porsche", created: 4, posts: [{ title: "911", image: "https://example.com/911.jpg" }] });
    }
    if (url.includes("/products")) {
      return Response.json({ id: 1, title: "Tie Dye Pants", price: 50, type: "physical", cover_photo_url: "https://example.com/pants.jpg", inventory_count: 10 });
    }
    if (url.includes("/settings")) {
      return Response.json({ ok: true });
    }
    if (url.includes("/analytics/top-liked-posts")) {
      return Response.json({ days: 7, total_likes: 1170, top_posts: [{ title: "Sunday drop", likes: 412 }] });
    }
    return Response.json({ ok: true });
  };

  const server = createServer("test-key", "https://example.test/api/v1");
  const client = new Client({ name: "widget-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server, restore: () => { globalThis.fetch = oldFetch; } };
}

const widgetTools = [
  ["doomscrollr_search_pinterest_and_post", { query: "air-cooled Porsche", status: "draft", limit: 4 }, "ui://doomscrollr/widgets/pinterest-v1.html"],
  ["doomscrollr_create_product", { title: "Tie Dye Pants", price: 50, type: "physical", cover_photo_url: "https://example.com/pants.jpg" }, "ui://doomscrollr/widgets/product-v1.html"],
  ["doomscrollr_apply_style_preset", { preset: "skims" }, "ui://doomscrollr/widgets/style-v1.html"],
  ["doomscrollr_top_liked_posts", { days: 7, limit: 5 }, "ui://doomscrollr/widgets/analytics-v1.html"],
];

test("widget tools advertise output templates and return widget metadata", async () => {
  const { client, server, restore } = await makeClient();
  try {
    const listed = await client.listTools();
    for (const [name, args, uri] of widgetTools) {
      const tool = listed.tools.find((t) => t.name === name);
      assert.ok(tool, `${name} should be listed`);
      assert.equal(tool._meta?.["openai/outputTemplate"], uri);
      assert.equal(tool._meta?.ui?.resourceUri, uri);

      const result = await client.callTool({ name, arguments: args });
      assert.equal(result._meta?.widget ? true : false, true, `${name} should return widget metadata`);
      assert.equal(result.isError, undefined);
    }
  } finally {
    restore();
    await client.close();
    await server.close();
  }
});

test("widget resources are readable as MCP app HTML", async () => {
  const { client, server, restore } = await makeClient();
  try {
    for (const [, , uri] of widgetTools) {
      const result = await client.readResource({ uri });
      assert.equal(result.contents[0].mimeType, "text/html;profile=mcp-app");
      assert.match(result.contents[0].text, /DOOMSCROLLR/);
    }
  } finally {
    restore();
    await client.close();
    await server.close();
  }
});
