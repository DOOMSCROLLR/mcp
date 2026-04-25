#!/usr/bin/env node

import cors from "cors";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createServer } from "./server.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const baseUrl = process.env.DOOMSCROLLR_API_URL || "https://doomscrollr.com/api/v1";
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
  res.setHeader("WWW-Authenticate", 'Bearer realm="DOOMSCROLLR MCP", error="invalid_token", error_description="Provide Authorization: Bearer <DOOMSCROLLR_API_KEY>"');
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

app.get("/", (_req, res) => {
  res.json({
    name: "DOOMSCROLLR MCP Remote",
    transport: "streamable-http",
    endpoint: "/mcp",
    auth: "Authorization: Bearer <DOOMSCROLLR_API_KEY>",
    apiBase: baseUrl,
  });
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
  const apiKey = extractBearerToken(req.header("authorization"));

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
