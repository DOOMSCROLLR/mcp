import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const DEFAULT_ISSUER = "https://mcp.doomscrollr.com";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTH_CODE_TTL_SECONDS = 10 * 60;
const CLIENT_ID_PREFIX = "doomscrollr-dcr-";
const MAX_CLIENT_NAME_LENGTH = 80;
const MAX_REDIRECT_URIS = 8;
const MAX_REDIRECT_URI_LENGTH = 2048;
const REGISTER_RATE_LIMIT = 20;
const REGISTER_RATE_WINDOW_MS = 15 * 60 * 1000;
const AUTHORIZE_RATE_LIMIT = 30;
const AUTHORIZE_RATE_WINDOW_MS = 15 * 60 * 1000;

const DEFAULT_TRUSTED_REDIRECT_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "platform.openai.com",
  "claude.ai",
  "claude.com",
  "anthropic.com",
  "cursor.com",
  "cursor.sh",
  "vscode.dev",
  "github.com",
  "copilot.microsoft.com",
];

const BRAND_NAME_PATTERN = /\b(chatgpt|openai|claude|anthropic|cursor|vscode|github|copilot|doomscrollr)\b/i;

type TokenPayload = {
  type: "code" | "access" | "refresh";
  apiKey: string;
  exp: number;
  clientId?: string;
  redirectUri?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
};

type SealedClient = {
  t: "dcr";
  n: string;
  r: string[];
  i: number;
};

export type RegisteredClient = {
  clientName: string;
  redirectUris: string[];
  issuedAt: number;
};

export type RedirectValidation =
  | { ok: true; url: URL }
  | { ok: false; error: string };

type RateBucket = {
  count: number;
  resetAt: number;
};

const registerRateLimits = new Map<string, RateBucket>();
const authorizeRateLimits = new Map<string, RateBucket>();

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

function hasProductionTokenSecret(): boolean {
  return Boolean(process.env.OAUTH_TOKEN_SECRET || process.env.DOOMSCROLLR_OAUTH_SECRET);
}

function tokenSecret(): Buffer {
  const secret = process.env.OAUTH_TOKEN_SECRET || process.env.DOOMSCROLLR_OAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OAUTH_TOKEN_SECRET is required in production");
    }

    return createHash("sha256").update("doomscrollr-mcp-oauth-development-secret").digest();
  }

  return createHash("sha256").update(secret).digest();
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function sealJson(payload: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenSecret(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [b64url(iv), b64url(tag), b64url(ciphertext)].join(".");
}

function openJson<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const [ivRaw, tagRaw, ciphertextRaw] = parts;
    const decipher = createDecipheriv("aes-256-gcm", tokenSecret(), fromB64url(ivRaw), { authTagLength: 16 });
    decipher.setAuthTag(fromB64url(tagRaw));
    const plaintext = Buffer.concat([decipher.update(fromB64url(ciphertextRaw)), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext) as T;
  } catch {
    return null;
  }
}

function seal(payload: TokenPayload): string {
  return sealJson(payload);
}

function open(token: string): TokenPayload | null {
  const payload = openJson<TokenPayload>(token);
  if (!payload || typeof payload !== "object" || payload.exp < nowSeconds()) return null;
  return payload;
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

function pkceChallengeS256(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
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

export function requestIp(req: Request): string {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || "unknown";
}

function consumeRateLimit(store: Map<string, RateBucket>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (store.size > 10_000) {
    for (const [entryKey, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(entryKey);
    }
  }

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function resetOAuthRateLimitsForTests(): void {
  registerRateLimits.clear();
  authorizeRateLimits.clear();
}

function trustedRedirectHosts(): string[] {
  const extra = (process.env.OAUTH_TRUSTED_REDIRECT_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return [...DEFAULT_TRUSTED_REDIRECT_HOSTS, ...extra];
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

export function isTrustedRedirectHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (isLoopbackHost(host)) return true;

  return trustedRedirectHosts().some((root) => host === root || host.endsWith(`.${root}`));
}

export function isTrustedRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.protocol === "https:") return isTrustedRedirectHost(url.hostname);
    if (url.protocol === "http:") return isLoopbackHost(url.hostname);
    return false;
  } catch {
    return false;
  }
}

export function validateRedirectUri(value: unknown): RedirectValidation {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "redirect_uri is required" };
  }

  const raw = value.trim();
  if (raw.length > MAX_REDIRECT_URI_LENGTH) {
    return { ok: false, error: "redirect_uri is too long" };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "redirect_uri is not a valid URL" };
  }

  if (url.hash) {
    return { ok: false, error: "redirect_uri must not include a fragment" };
  }

  if (url.username || url.password) {
    return { ok: false, error: "redirect_uri must not include credentials" };
  }

  if (url.protocol === "https:") {
    if (!url.hostname) return { ok: false, error: "redirect_uri host is required" };
    return { ok: true, url };
  }

  if (url.protocol === "http:") {
    if (!isLoopbackHost(url.hostname)) {
      return { ok: false, error: "http redirect_uri is only allowed for localhost" };
    }
    return { ok: true, url };
  }

  return { ok: false, error: "redirect_uri must use https, or http on localhost" };
}

function normalizeClientName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  if (!name) return "MCP client";
  return name.slice(0, MAX_CLIENT_NAME_LENGTH);
}

function looksLikeBrandImpersonation(clientName: string, redirectUri: string): boolean {
  return BRAND_NAME_PATTERN.test(clientName) && !isTrustedRedirectUri(redirectUri);
}

function strictRedirectHostsEnabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.OAUTH_STRICT_REDIRECT_HOSTS || "");
}

function issueClientId(client: RegisteredClient): string {
  const sealed: SealedClient = {
    t: "dcr",
    n: client.clientName,
    r: client.redirectUris,
    i: client.issuedAt,
  };

  return `${CLIENT_ID_PREFIX}${sealJson(sealed)}`;
}

export function readRegisteredClient(clientId: string): RegisteredClient | null {
  if (!clientId.startsWith(CLIENT_ID_PREFIX)) return null;

  const sealed = openJson<SealedClient>(clientId.slice(CLIENT_ID_PREFIX.length));
  if (!sealed || sealed.t !== "dcr" || typeof sealed.n !== "string" || !Array.isArray(sealed.r)) {
    return null;
  }

  const redirectUris = sealed.r.filter((value): value is string => typeof value === "string");
  if (redirectUris.length === 0) return null;

  return {
    clientName: sealed.n,
    redirectUris,
    issuedAt: typeof sealed.i === "number" ? sealed.i : 0,
  };
}

function matchingRegisteredRedirect(client: RegisteredClient, redirectUri: string): string | null {
  return client.redirectUris.find((allowed) => allowed === redirectUri) || null;
}

function registrationAccessToken(): string {
  return (process.env.OAUTH_REGISTRATION_ACCESS_TOKEN || "").trim();
}

function credentialsSharedSecret(): string {
  return (process.env.OAUTH_CREDENTIALS_SHARED_SECRET || "").trim();
}

function hasValidRegistrationAccessToken(req: Request): boolean {
  const expected = registrationAccessToken();
  if (!expected) return true;

  const header = req.header("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return false;
  return constantEqual(token, expected);
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

type CredentialExchangeResult = {
  apiKey: string | null;
  error?: string;
};

async function exchangeDoomscrollrCredentials(email: string, password: string, username: string, baseUrl: string): Promise<CredentialExchangeResult> {
  if (!email || !password) {
    return { apiKey: null, error: "Enter your DOOMSCROLLR email and password." };
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const secret = credentialsSharedSecret();
    if (secret) {
      headers["X-Doomscrollr-OAuth-Internal"] = secret;
    }

    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/oauth/credentials`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password, username: username || undefined }),
    });

    const data = await res.json().catch(() => null) as { api_key?: unknown; message?: unknown; errors?: Record<string, string[]> } | null;

    if (!res.ok) {
      const firstError = data?.errors ? Object.values(data.errors).flat()[0] : null;
      return {
        apiKey: null,
        error: firstError || (typeof data?.message === "string" ? data.message : "Invalid DOOMSCROLLR email or password."),
      };
    }

    return { apiKey: typeof data?.api_key === "string" ? data.api_key : null };
  } catch {
    return { apiKey: null, error: "Could not reach DOOMSCROLLR to verify these credentials." };
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
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp"],
    authorization_response_iss_parameter_supported: true,
    service_documentation: issuer,
  };
}

export function registerOAuthClient(req: Request, res: Response) {
  if (process.env.NODE_ENV === "production" && !hasProductionTokenSecret()) {
    return res.status(500).json({
      error: "server_error",
      error_description: "OAuth registration is not configured.",
    });
  }

  if (!hasValidRegistrationAccessToken(req)) {
    return res.status(401).json({
      error: "invalid_token",
      error_description: "Registration requires an initial access token.",
    });
  }

  const ip = requestIp(req);
  if (!consumeRateLimit(registerRateLimits, ip, REGISTER_RATE_LIMIT, REGISTER_RATE_WINDOW_MS)) {
    res.set("Retry-After", "900");
    return res.status(429).json({
      error: "rate_limited",
      error_description: "Too many registration requests. Try again later.",
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const rawRedirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];

  if (rawRedirectUris.length === 0) {
    return res.status(400).json({
      error: "invalid_redirect_uri",
      error_description: "At least one redirect_uri is required.",
    });
  }

  if (rawRedirectUris.length > MAX_REDIRECT_URIS) {
    return res.status(400).json({
      error: "invalid_redirect_uri",
      error_description: `No more than ${MAX_REDIRECT_URIS} redirect_uris are allowed.`,
    });
  }

  const redirectUris: string[] = [];
  for (const value of rawRedirectUris) {
    const parsed = validateRedirectUri(value);
    if (!parsed.ok) {
      return res.status(400).json({
        error: "invalid_redirect_uri",
        error_description: parsed.error,
      });
    }

    if (strictRedirectHostsEnabled() && !isTrustedRedirectHost(parsed.url.hostname) && parsed.url.protocol !== "http:") {
      return res.status(400).json({
        error: "invalid_redirect_uri",
        error_description: "This redirect_uri host is not on the allowlist.",
      });
    }

    redirectUris.push(parsed.url.toString());
  }

  const clientName = normalizeClientName(body.client_name);
  const issuedAt = nowSeconds();
  const clientId = issueClientId({
    clientName,
    redirectUris,
    issuedAt,
  });

  console.info("OAuth client registered", {
    clientName,
    redirectHosts: redirectUris.map((uri) => {
      try {
        return new URL(uri).host;
      } catch {
        return "invalid";
      }
    }),
    trusted: redirectUris.every((uri) => isTrustedRedirectUri(uri)),
    ip,
  });

  return res.status(201).json({
    client_id: clientId,
    client_id_issued_at: issuedAt,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "mcp",
  });
}

function authorizeRequestError(req: Request): string | null {
  const responseType = getParam(req, "response_type");
  const clientId = getParam(req, "client_id");
  const redirectUri = getParam(req, "redirect_uri");
  const codeChallenge = getParam(req, "code_challenge");
  const codeChallengeMethod = getParam(req, "code_challenge_method").toUpperCase();

  if (responseType !== "code" || !clientId || !redirectUri) {
    return "This authorization request is missing response_type, client_id, or redirect_uri. Start the connection again from your MCP client.";
  }

  const parsedRedirect = validateRedirectUri(redirectUri);
  if (!parsedRedirect.ok) {
    return parsedRedirect.error;
  }

  const client = readRegisteredClient(clientId);
  if (!client) {
    return "This OAuth client is not valid. Open registration is signed and bound to specific callback URLs — start the connection again from ChatGPT, Claude, Cursor, or another MCP client so it can register itself.";
  }

  if (!matchingRegisteredRedirect(client, parsedRedirect.url.toString()) && !matchingRegisteredRedirect(client, redirectUri)) {
    return "This callback URL was not registered for this client.";
  }

  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return "This authorization request must include PKCE (code_challenge and code_challenge_method=S256).";
  }

  if (strictRedirectHostsEnabled() && !isTrustedRedirectUri(parsedRedirect.url.toString())) {
    return "This callback URL is not on the allowlist for DOOMSCROLLR MCP.";
  }

  return null;
}

function resolveAuthorizeClient(req: Request): { client: RegisteredClient; redirectUri: string; redirectUrl: URL } | null {
  const client = readRegisteredClient(getParam(req, "client_id"));
  const parsedRedirect = validateRedirectUri(getParam(req, "redirect_uri"));
  if (!client || !parsedRedirect.ok) return null;

  const matched = matchingRegisteredRedirect(client, parsedRedirect.url.toString()) || matchingRegisteredRedirect(client, getParam(req, "redirect_uri"));
  if (!matched) return null;

  return { client, redirectUri: matched, redirectUrl: parsedRedirect.url };
}

export function renderAuthorizePage(req: Request, res: Response, errorMessage?: string) {
  const requestError = authorizeRequestError(req);
  if (requestError) {
    return res
      .status(400)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(renderMessagePage("Cannot authorize this client", requestError));
  }

  const resolved = resolveAuthorizeClient(req);
  if (!resolved) {
    return res
      .status(400)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(renderMessagePage("Cannot authorize this client", "This authorization request is invalid."));
  }

  const trusted = isTrustedRedirectUri(resolved.redirectUri);
  const impersonation = looksLikeBrandImpersonation(resolved.client.clientName, resolved.redirectUri);
  const params = ["response_type", "client_id", "redirect_uri", "scope", "state", "code_challenge", "code_challenge_method", "resource"];
  const hidden = params
    .map((key) => `<input type="hidden" name="${key}" value="${htmlEscape(getParam(req, key))}">`)
    .join("\n");

  const warning = !trusted || impersonation
    ? `<aside>
        <strong>Untrusted callback</strong>
        <p>This app wants to send your authorization code to <code>${htmlEscape(resolved.redirectUrl.host)}</code>, which is not a known ChatGPT, Claude, Cursor, or other first-party MCP client address.${impersonation ? " The name also looks like a known product, but the callback does not match that product." : ""} Only continue if you started this connection yourself.</p>
        <label class="check" for="confirm_untrusted_client">
          <input id="confirm_untrusted_client" name="confirm_untrusted_client" type="checkbox" value="1">
          I trust this callback and want to continue
        </label>
      </aside>`
    : "";

  return res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "no-store")
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
    p, dd, dt { line-height:1.5; }
    dl { margin:0 0 18px; }
    dt { font-weight:800; margin-top:12px; }
    dd { margin:4px 0 0; word-break:break-all; }
    label { display:block; font-weight:800; margin:18px 0 8px; }
    input[type=email], input[type=password], input[type=text] { width:100%; box-sizing:border-box; padding:14px; border:2px solid #000; border-radius:0; font:inherit; }
    button { margin-top:18px; width:100%; padding:14px; border:2px solid #000; border-radius:0; background:#E7FF00; color:#000; font:inherit; font-weight:900; cursor:pointer; box-shadow:4px 4px 0 #000; }
    aside { border:2px solid #000; background:#E7FF00; padding:14px; margin:0 0 18px; }
    aside p { margin:8px 0 0; }
    label.check { display:flex; gap:10px; align-items:flex-start; font-weight:800; margin:14px 0 0; }
    label.check input { width:auto; margin-top:3px; }
    .error { border:2px solid #000; background:#ffb4b4; padding:12px; margin:0 0 18px; font-weight:800; }
    code { font:inherit; font-weight:800; }
  </style>
</head>
<body>
  <main>
    <h1>Authorize DOOMSCROLLR MCP</h1>
    <p><strong>${htmlEscape(resolved.client.clientName)}</strong> wants permission to call the DOOMSCROLLR MCP server on your behalf.</p>
    ${errorMessage ? `<p class="error">${htmlEscape(errorMessage)}</p>` : ""}
    <dl>
      <dt>Application</dt>
      <dd>${htmlEscape(resolved.client.clientName)}</dd>
      <dt>Sends you back to</dt>
      <dd>${htmlEscape(resolved.redirectUrl.host)}</dd>
      <dt>Full callback</dt>
      <dd>${htmlEscape(resolved.redirectUri)}</dd>
    </dl>
    ${warning}
    <form method="post" action="/oauth/authorize" autocomplete="off" target="_top">
      ${hidden}
      <label for="email">DOOMSCROLLR email</label>
      <input id="email" name="email" type="email" autocomplete="username" autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password">
      <label for="username">Hub username</label>
      <input id="username" name="username" type="text" autocomplete="off">
      <button type="submit">Authorize</button>
    </form>
  </main>
</body>
</html>`);
}

function renderRedirectPage(targetUrl: string, hostname: string): string {
  const safeUrl = JSON.stringify(targetUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="refresh" content="0;url=${htmlEscape(targetUrl)}">
  <title>Returning to ${htmlEscape(hostname)}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background:#0662FF; color:#000; margin:0; min-height:100vh; display:grid; place-items:center; }
    main { width:min(560px, calc(100vw - 32px)); background:#fff; border:2px solid #000; box-shadow:4px 4px 0 #000; padding:28px; }
    a { color:#000; font-weight:900; }
  </style>
</head>
<body>
  <main>
    <h1>Returning to ${htmlEscape(hostname)}…</h1>
    <p>If this does not continue automatically, <a id="continue" href="${htmlEscape(targetUrl)}" target="_top" rel="noreferrer">click here to continue</a>.</p>
  </main>
  <script>
    (function () {
      var target = ${safeUrl};
      try {
        if (window.top) {
          window.top.location.replace(target);
          return;
        }
      } catch (e) {}
      window.location.replace(target);
    })();
  </script>
</body>
</html>`;
}

function renderMessagePage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background:#0662FF; color:#000; margin:0; min-height:100vh; display:grid; place-items:center; }
    main { width:min(560px, calc(100vw - 32px)); background:#fff; border:2px solid #000; box-shadow:4px 4px 0 #000; padding:28px; }
    h1 { font-size:28px; margin:0 0 12px; }
    p { line-height:1.5; }
  </style>
</head>
<body><main><h1>${htmlEscape(title)}</h1><p>${htmlEscape(message)}</p></main></body>
</html>`;
}

export async function completeAuthorize(req: Request, res: Response, baseUrl: string) {
  if (process.env.NODE_ENV === "production" && !hasProductionTokenSecret()) {
    return res.status(500).send("OAuth is not configured.");
  }

  const ip = requestIp(req);
  if (!consumeRateLimit(authorizeRateLimits, ip, AUTHORIZE_RATE_LIMIT, AUTHORIZE_RATE_WINDOW_MS)) {
    res.set("Retry-After", "900");
    return res.status(429).send("Too many authorization attempts. Try again later.");
  }

  const requestError = authorizeRequestError(req);
  if (requestError) {
    return res.status(400).send(requestError);
  }

  const resolved = resolveAuthorizeClient(req);
  if (!resolved) {
    return res.status(400).send("Invalid OAuth authorization request.");
  }

  const trusted = isTrustedRedirectUri(resolved.redirectUri);
  const impersonation = looksLikeBrandImpersonation(resolved.client.clientName, resolved.redirectUri);
  if ((!trusted || impersonation) && getParam(req, "confirm_untrusted_client") !== "1") {
    return renderAuthorizePage(req, res, "Check the box confirming you trust this callback before authorizing.");
  }

  const suppliedApiKey = getParam(req, "api_key");
  const email = getParam(req, "email");
  const password = getParam(req, "password");
  const username = getParam(req, "username");
  const state = getParam(req, "state");
  const codeChallenge = getParam(req, "code_challenge");
  const clientId = getParam(req, "client_id");

  let apiKey = suppliedApiKey;

  if (!apiKey) {
    const exchange = await exchangeDoomscrollrCredentials(email, password, username, baseUrl);
    if (!exchange.apiKey) {
      return renderAuthorizePage(req, res, exchange.error || "Invalid DOOMSCROLLR email or password.");
    }
    apiKey = exchange.apiKey;
  }

  const validApiKey = await validateDoomscrollrApiKey(apiKey, baseUrl);
  if (!validApiKey) {
    return renderAuthorizePage(req, res, "Invalid DOOMSCROLLR credentials.");
  }

  const code = oauthToken("dsc", {
    type: "code",
    apiKey,
    clientId,
    redirectUri: resolved.redirectUri,
    codeChallenge,
    codeChallengeMethod: "S256",
    exp: nowSeconds() + AUTH_CODE_TTL_SECONDS,
  });

  const redirect = new URL(resolved.redirectUri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("iss", baseUrlFromRequest(req));
  if (state) redirect.searchParams.set("state", state);

  return res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "no-store")
    .send(renderRedirectPage(redirect.toString(), resolved.redirectUrl.host));
}

export function exchangeToken(req: Request, res: Response) {
  if (process.env.NODE_ENV === "production" && !hasProductionTokenSecret()) {
    return res.status(500).json({ error: "server_error" });
  }

  const grantType = getParam(req, "grant_type");
  const redirectUri = getParam(req, "redirect_uri");
  const clientId = getParam(req, "client_id");

  if (grantType === "refresh_token") {
    const refreshToken = getParam(req, "refresh_token");
    const payload = readOAuthToken(refreshToken, "refresh");

    if (!payload) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    if (payload.clientId && clientId && payload.clientId !== clientId) {
      return res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
    }

    return issueAccessToken(res, payload.apiKey, false, payload.clientId);
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

  if (!payload.clientId || !clientId || payload.clientId !== clientId) {
    return res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
  }

  if (!payload.redirectUri || !redirectUri || payload.redirectUri !== redirectUri) {
    return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
  }

  if (!payload.codeChallenge || payload.codeChallengeMethod !== "S256" || !codeVerifier) {
    return res.status(400).json({ error: "invalid_grant", error_description: "PKCE is required" });
  }

  if (!constantEqual(pkceChallengeS256(codeVerifier), payload.codeChallenge)) {
    return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
  }

  return issueAccessToken(res, payload.apiKey, true, payload.clientId);
}

function issueAccessToken(res: Response, apiKey: string, includeRefreshToken: boolean, clientId?: string) {
  const accessToken = oauthToken("dso", {
    type: "access",
    apiKey,
    clientId,
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
      clientId,
      exp: nowSeconds() + REFRESH_TOKEN_TTL_SECONDS,
    });
  }

  return res.json(response);
}
