import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const DEFAULT_ISSUER = "https://mcp.doomscrollr.com";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTH_CODE_TTL_SECONDS = 10 * 60;

type TokenPayload = {
  type: "code" | "access" | "refresh";
  apiKey: string;
  exp: number;
  clientId?: string;
  redirectUri?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function baseUrlFromRequest(req: Request): string {
  const configured = process.env.OAUTH_ISSUER || process.env.MCP_PUBLIC_URL || DEFAULT_ISSUER;
  if (configured) return configured.replace(/\/+$/, "");

  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "mcp.doomscrollr.com").split(",")[0].trim();
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function tokenSecret(): Buffer {
  const secret = process.env.OAUTH_TOKEN_SECRET || process.env.DOOMSCROLLR_OAUTH_SECRET || "doomscrollr-mcp-oauth-development-secret";
  return createHash("sha256").update(secret).digest();
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function seal(payload: TokenPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenSecret(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [b64url(iv), b64url(tag), b64url(ciphertext)].join(".");
}

function open(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const [ivRaw, tagRaw, ciphertextRaw] = parts;
    const decipher = createDecipheriv("aes-256-gcm", tokenSecret(), fromB64url(ivRaw), { authTagLength: 16 });
    decipher.setAuthTag(fromB64url(tagRaw));
    const plaintext = Buffer.concat([decipher.update(fromB64url(ciphertextRaw)), decipher.final()]).toString("utf8");
    const payload = JSON.parse(plaintext) as TokenPayload;

    if (!payload || typeof payload !== "object" || payload.exp < nowSeconds()) return null;
    return payload;
  } catch {
    return null;
  }
}

function oauthToken(prefix: "dsc" | "dso" | "dsr", payload: TokenPayload): string {
  return `${prefix}_${seal(payload)}`;
}

function readOAuthToken(token: string, expectedType: "code" | "access" | "refresh"): TokenPayload | null {
  const prefix = expectedType === "code" ? "dsc_" : expectedType === "access" ? "dso_" : "dsr_";
  if (!token.startsWith(prefix)) return null;

  const payload = open(token.slice(prefix.length));
  if (!payload || payload.type !== expectedType) return null;
  return payload;
}

function constantEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function pkceChallenge(verifier: string, method?: string): string {
  if ((method || "plain").toUpperCase() === "S256") {
    return b64url(createHash("sha256").update(verifier).digest());
  }

  return verifier;
}

function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getParam(req: Request, key: string): string {
  const fromBody = req.body?.[key];
  const fromQuery = req.query?.[key];
  const value = typeof fromBody === "string" ? fromBody : typeof fromQuery === "string" ? fromQuery : "";
  return value.trim();
}

async function validateDoomscrollrApiKey(apiKey: string, baseUrl: string): Promise<boolean> {
  if (!apiKey) return false;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/profile`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    return res.ok;
  } catch {
    return false;
  }
}

export function resolveDoomscrollrApiKeyFromBearer(token: string): string | null {
  const oauthAccess = readOAuthToken(token, "access");
  if (oauthAccess) return oauthAccess.apiKey;

  // Preserve the original direct Bearer API-key behavior for Claude/Cursor/etc.
  return token;
}

export function protectedResourceMetadata(req: Request) {
  const issuer = baseUrlFromRequest(req);
  return {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    resource_documentation: issuer,
  };
}

export function authorizationServerMetadata(req: Request) {
  const issuer = baseUrlFromRequest(req);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["mcp"],
    service_documentation: issuer,
  };
}

export function registerOAuthClient(req: Request, res: Response) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];

  return res.status(201).json({
    client_id: `doomscrollr-openai-${randomUUID()}`,
    client_id_issued_at: nowSeconds(),
    client_name: body.client_name || "DOOMSCROLLR MCP Client",
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "mcp",
  });
}

export function renderAuthorizePage(req: Request, res: Response) {
  const params = ["response_type", "client_id", "redirect_uri", "scope", "state", "code_challenge", "code_challenge_method", "resource"];
  const hidden = params
    .map((key) => `<input type="hidden" name="${key}" value="${htmlEscape(getParam(req, key))}">`)
    .join("\n");

  return res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize DOOMSCROLLR MCP</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background:#0662FF; color:#000; margin:0; min-height:100vh; display:grid; place-items:center; }
    main { width:min(560px, calc(100vw - 32px)); background:#fff; border:2px solid #000; box-shadow:4px 4px 0 #000; padding:28px; }
    h1 { font-size:28px; margin:0 0 12px; }
    p { line-height:1.5; }
    label { display:block; font-weight:800; margin:18px 0 8px; }
    input[type=password] { width:100%; box-sizing:border-box; padding:14px; border:2px solid #000; border-radius:0; font:inherit; }
    button { margin-top:18px; width:100%; padding:14px; border:2px solid #000; border-radius:0; background:#E7FF00; color:#000; font:inherit; font-weight:900; cursor:pointer; box-shadow:4px 4px 0 #000; }
    small { display:block; margin-top:14px; }
  </style>
</head>
<body>
  <main>
    <h1>Authorize DOOMSCROLLR MCP</h1>
    <p>Paste a limited/test DOOMSCROLLR API key to let this client call the MCP server on your behalf. The key is exchanged for an OAuth access token.</p>
    <form method="post" action="/oauth/authorize">
      ${hidden}
      <label for="api_key">DOOMSCROLLR API key</label>
      <input id="api_key" name="api_key" type="password" autocomplete="off" required autofocus>
      <button type="submit">Authorize</button>
    </form>
    <small>Get an API key from the DOOMSCROLLR dashboard. Do not use a production key unless you trust this client.</small>
  </main>
</body>
</html>`);
}

export async function completeAuthorize(req: Request, res: Response, baseUrl: string) {
  const responseType = getParam(req, "response_type");
  const clientId = getParam(req, "client_id");
  const redirectUri = getParam(req, "redirect_uri");
  const state = getParam(req, "state");
  const codeChallenge = getParam(req, "code_challenge");
  const codeChallengeMethod = getParam(req, "code_challenge_method") || "plain";
  const apiKey = getParam(req, "api_key");

  if (responseType !== "code" || !clientId || !redirectUri) {
    return res.status(400).send("Invalid OAuth authorization request.");
  }

  const validApiKey = await validateDoomscrollrApiKey(apiKey, baseUrl);
  if (!validApiKey) {
    return res.status(401).send("Invalid DOOMSCROLLR API key. Go back and try a valid limited/test key.");
  }

  const code = oauthToken("dsc", {
    type: "code",
    apiKey,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    exp: nowSeconds() + AUTH_CODE_TTL_SECONDS,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return res.redirect(302, redirect.toString());
}

export function exchangeToken(req: Request, res: Response) {
  const grantType = getParam(req, "grant_type");
  const redirectUri = getParam(req, "redirect_uri");
  const clientId = getParam(req, "client_id");

  if (grantType === "refresh_token") {
    const refreshToken = getParam(req, "refresh_token");
    const payload = readOAuthToken(refreshToken, "refresh");

    if (!payload) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    return issueAccessToken(res, payload.apiKey, false);
  }

  if (grantType !== "authorization_code") {
    return res.status(400).json({ error: "unsupported_grant_type" });
  }

  const code = getParam(req, "code");
  const codeVerifier = getParam(req, "code_verifier");
  const payload = readOAuthToken(code, "code");

  if (!payload) {
    return res.status(400).json({ error: "invalid_grant" });
  }

  if (payload.clientId && clientId && payload.clientId !== clientId) {
    return res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
  }

  if (payload.redirectUri && redirectUri && payload.redirectUri !== redirectUri) {
    return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
  }

  if (payload.codeChallenge) {
    if (!codeVerifier || !constantEqual(pkceChallenge(codeVerifier, payload.codeChallengeMethod), payload.codeChallenge)) {
      return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    }
  }

  return issueAccessToken(res, payload.apiKey, true);
}

function issueAccessToken(res: Response, apiKey: string, includeRefreshToken: boolean) {
  const accessToken = oauthToken("dso", {
    type: "access",
    apiKey,
    exp: nowSeconds() + ACCESS_TOKEN_TTL_SECONDS,
  });

  const response: Record<string, unknown> = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: "mcp",
  };

  if (includeRefreshToken) {
    response.refresh_token = oauthToken("dsr", {
      type: "refresh",
      apiKey,
      exp: nowSeconds() + REFRESH_TOKEN_TTL_SECONDS,
    });
  }

  return res.json(response);
}
