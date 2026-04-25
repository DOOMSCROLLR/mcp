#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const apiKey = process.env.DOOMSCROLLR_API_KEY || "";
const baseUrl = process.env.DOOMSCROLLR_API_URL || "https://doomscrollr.com/api/v1";

if (!apiKey) {
  console.error(
    "DOOMSCROLLR_API_KEY environment variable is required.\n" +
      "Get your API key at https://doomscrollr.com/dashboard"
  );
  process.exit(1);
}

async function main() {
  const server = createServer(apiKey, baseUrl);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
