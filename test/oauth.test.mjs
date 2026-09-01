import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, beforeEach, afterEach } from "node:test";
import {
  authorizationServerMetadata,
  completeAuthorize,
  exchangeToken,
  isTrustedRedirectHost,
  readRegisteredClient,
  registerOAuthClient,
  renderAuthorizePage,
  resetOAuthRateLimitsForTests,
  validateRedirectUri,
} from "../dist/oauth.js";

function mockReq({ body = {}, query = {}, headers = {}, ip = "203.0.113.10" } = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    body,
    query,
    headers: normalizedHeaders,
    ip,
    protocol: "https",
    header(name) {
      return normalizedHeaders[String(name).toLowerCase()];
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
}

function pkcePair() {
  const verifier = "a".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function registerClient(redirectUri, clientName = "security-research-test") {
  const res = mockRes();
  registerOAuthClient(
    mockReq({
      body: {
        client_name: clientName,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    }),
    res
  );
  return res;
}

function authorizeQuery(clientId, redirectUri, challenge) {
  return {
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: "randomstate123",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "mcp",
  };
}

beforeEach(() => {
  resetOAuthRateLimitsForTests();
});

test("authorization server metadata advertises S256-only PKCE", () => {
  const metadata = authorizationServerMetadata(mockReq());
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  assert.equal(metadata.authorization_response_iss_parameter_supported, true);
});

test("validateRedirectUri rejects dangerous or unbound callbacks", () => {
  assert.equal(validateRedirectUri("javascript:alert(1)").ok, false);
  assert.equal(validateRedirectUri("https://xxx.yyy.zzz/cb#frag").ok, false);
  assert.equal(validateRedirectUri("https://user:pass@evil.example/cb").ok, false);
  assert.equal(validateRedirectUri("http://evil.example/cb").ok, false);
  assert.equal(validateRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect").ok, true);
  assert.equal(validateRedirectUri("http://127.0.0.1:6274/oauth/callback").ok, true);
});

test("trusted hosts do not treat lookalike domains as first-party", () => {
  assert.equal(isTrustedRedirectHost("chatgpt.com"), true);
  assert.equal(isTrustedRedirectHost("connector.chatgpt.com"), true);
  assert.equal(isTrustedRedirectHost("chatgpt.com.evil.example"), false);
  assert.equal(isTrustedRedirectHost("evilchatgpt.com"), false);
  assert.equal(isTrustedRedirectHost("xxx.yyy.zzz"), false);
});

test("register rejects missing and invalid redirect_uris", () => {
  const missing = mockRes();
  registerOAuthClient(mockReq({ body: { client_name: "no-uri" } }), missing);
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.body.error, "invalid_redirect_uri");

  const evilHttp = mockRes();
  registerOAuthClient(mockReq({ body: { redirect_uris: ["http://xxx.yyy.zzz/cb"] } }), evilHttp);
  assert.equal(evilHttp.statusCode, 400);

  const js = mockRes();
  registerOAuthClient(mockReq({ body: { redirect_uris: ["javascript:alert(1)"] } }), js);
  assert.equal(js.statusCode, 400);
});

test("register binds redirect_uris into a signed client_id", () => {
  const res = registerClient("https://xxx.yyy.zzz/cb");
  assert.equal(res.statusCode, 201);
  assert.match(res.body.client_id, /^doomscrollr-dcr-/);

  const client = readRegisteredClient(res.body.client_id);
  assert.ok(client);
  assert.equal(client.clientName, "security-research-test");
  assert.deepEqual(client.redirectUris, ["https://xxx.yyy.zzz/cb"]);
  assert.equal(readRegisteredClient("doomscrollr-openai-25248130-42e3-4be6-a968-be804920782a"), null);
});

test("authorize rejects an unsigned client_id and attacker redirect", () => {
  const { challenge } = pkcePair();
  const res = mockRes();
  renderAuthorizePage(
    mockReq({
      query: authorizeQuery(
        "doomscrollr-openai-25248130-42e3-4be6-a968-be804920782a",
        "https://xxx.yyy.zzz/cb",
        challenge
      ),
    }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /not valid/i);
  assert.doesNotMatch(String(res.body), /password/i);
});

test("authorize rejects a registered client used with a different redirect", () => {
  const { challenge } = pkcePair();
  const created = registerClient("https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT");
  const res = mockRes();
  renderAuthorizePage(
    mockReq({
      query: authorizeQuery(created.body.client_id, "https://xxx.yyy.zzz/cb", challenge),
    }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /not registered/i);
  assert.doesNotMatch(String(res.body), /name="password"/);
});

test("authorize requires S256 PKCE", () => {
  const created = registerClient("https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT");
  const res = mockRes();
  renderAuthorizePage(
    mockReq({
      query: {
        response_type: "code",
        client_id: created.body.client_id,
        redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
      },
    }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body), /PKCE/i);
});

test("authorize shows the registered client name and callback host", () => {
  const { challenge } = pkcePair();
  const created = registerClient("https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT");
  const res = mockRes();
  renderAuthorizePage(
    mockReq({
      query: authorizeQuery(
        created.body.client_id,
        "https://chatgpt.com/connector_platform_oauth_redirect",
        challenge
      ),
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.match(String(res.body), /ChatGPT/);
  assert.match(String(res.body), /chatgpt.com/);
  assert.match(String(res.body), /name="password"/);
  assert.doesNotMatch(String(res.body), /confirm_untrusted_client/);
});

test("authorize warns and requires confirmation for an untrusted callback", () => {
  const { challenge } = pkcePair();
  const created = registerClient("https://xxx.yyy.zzz/cb", "security-research-test");
  const res = mockRes();
  renderAuthorizePage(
    mockReq({
      query: authorizeQuery(created.body.client_id, "https://xxx.yyy.zzz/cb", challenge),
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.match(String(res.body), /Untrusted callback/);
  assert.match(String(res.body), /xxx.yyy.zzz/);
  assert.match(String(res.body), /confirm_untrusted_client/);
});

test("completeAuthorize does not issue a code for an untrusted callback without confirmation", async () => {
  const { challenge } = pkcePair();
  const created = registerClient("https://xxx.yyy.zzz/cb", "security-research-test");
  const res = mockRes();

  await completeAuthorize(
    mockReq({
      body: {
        ...authorizeQuery(created.body.client_id, "https://xxx.yyy.zzz/cb", challenge),
        email: "victim@example.com",
        password: "password",
      },
    }),
    res,
    "https://example.test/api/v1"
  );

  assert.equal(res.statusCode, 200);
  assert.match(String(res.body), /Check the box/);
  assert.doesNotMatch(String(res.body), /[?&]code=/);
});

test("token exchange requires PKCE and the registered redirect", async () => {
  const { verifier, challenge } = pkcePair();
  const created = registerClient("https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/oauth/credentials")) {
      return Response.json({ api_key: "test-api-key" });
    }
    if (url.includes("/profile")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const authorizeRes = mockRes();
    await completeAuthorize(
      mockReq({
        body: {
          ...authorizeQuery(
            created.body.client_id,
            "https://chatgpt.com/connector_platform_oauth_redirect",
            challenge
          ),
          email: "owner@example.com",
          password: "password",
        },
      }),
      authorizeRes,
      "https://example.test/api/v1"
    );

    const html = String(authorizeRes.body);
    const code = decodeURIComponent(html.match(/[?&]code=([^&"]+)/)[1]);
    assert.ok(code.startsWith("dsc_"));

    const missingPkce = mockRes();
    exchangeToken(
      mockReq({
        body: {
          grant_type: "authorization_code",
          code,
          client_id: created.body.client_id,
          redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
        },
      }),
      missingPkce
    );
    assert.equal(missingPkce.statusCode, 400);
    assert.equal(missingPkce.body.error_description, "PKCE is required");

    const ok = mockRes();
    exchangeToken(
      mockReq({
        body: {
          grant_type: "authorization_code",
          code,
          client_id: created.body.client_id,
          redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
          code_verifier: verifier,
        },
      }),
      ok
    );
    assert.equal(ok.statusCode, 200);
    assert.equal(typeof ok.body.access_token, "string");
    assert.equal(typeof ok.body.refresh_token, "string");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("credential exchange sends the shared secret header when configured", async () => {
  const previous = process.env.OAUTH_CREDENTIALS_SHARED_SECRET;
  process.env.OAUTH_CREDENTIALS_SHARED_SECRET = "mcp-internal-secret";
  const { challenge } = pkcePair();
  const created = registerClient("https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT");
  const previousFetch = globalThis.fetch;
  let seenHeaders = null;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/oauth/credentials")) {
      seenHeaders = init?.headers ?? {};
      return Response.json({ api_key: "test-api-key" });
    }
    if (url.includes("/profile")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const authorizeRes = mockRes();
    await completeAuthorize(
      mockReq({
        body: {
          ...authorizeQuery(
            created.body.client_id,
            "https://chatgpt.com/connector_platform_oauth_redirect",
            challenge
          ),
          email: "owner@example.com",
          password: "password",
        },
      }),
      authorizeRes,
      "https://example.test/api/v1"
    );

    assert.equal(authorizeRes.statusCode, 200);
    assert.equal(seenHeaders["X-Doomscrollr-OAuth-Internal"], "mcp-internal-secret");
    assert.match(String(authorizeRes.body), /[?&]code=/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previous === undefined) delete process.env.OAUTH_CREDENTIALS_SHARED_SECRET;
    else process.env.OAUTH_CREDENTIALS_SHARED_SECRET = previous;
  }
});

test("optional registration access token rejects unauthenticated DCR", () => {
  const previous = process.env.OAUTH_REGISTRATION_ACCESS_TOKEN;
  process.env.OAUTH_REGISTRATION_ACCESS_TOKEN = "test-initial-access-token";

  try {
    const denied = mockRes();
    registerOAuthClient(mockReq({ body: { redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"] } }), denied);
    assert.equal(denied.statusCode, 401);

    const allowed = mockRes();
    registerOAuthClient(
      mockReq({
        body: { redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"] },
        headers: { authorization: "Bearer test-initial-access-token" },
      }),
      allowed
    );
    assert.equal(allowed.statusCode, 201);
  } finally {
    if (previous === undefined) delete process.env.OAUTH_REGISTRATION_ACCESS_TOKEN;
    else process.env.OAUTH_REGISTRATION_ACCESS_TOKEN = previous;
  }
});
