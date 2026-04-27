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

app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], (req, res) => {
  res.json(protectedResourceMetadata(req));
});

app.get("/.well-known/oauth-authorization-server", (req, res) => {
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
