import { createMindsClient } from './minds-client-lib.js';

// src/oauth/MindsOAuth.ts

// src/oauth/pkce.ts
function base64Url(bytes) {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomString(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Url(bytes);
}
async function pkceChallengeS256(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64Url(new Uint8Array(hash));
}

// src/oauth/state.ts
function isOAuthState(value) {
  if (typeof value === "string") return true;
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function serializeOAuthState(state) {
  if (state === void 0) {
    return JSON.stringify({});
  }
  if (!isOAuthState(state)) {
    throw new Error("state must be a string or object");
  }
  return JSON.stringify(state);
}
function parseOAuthState(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("state must be a string or object");
  }
  if (!isOAuthState(parsed)) {
    throw new Error("state must be a string or object");
  }
  return parsed;
}

// src/oauth/storage.ts
var STORAGE_STATE = "minds_oauth_state";
var STORAGE_VERIFIER = "minds_oauth_code_verifier";
function savePkceSession(session) {
  sessionStorage.setItem(STORAGE_STATE, session.state);
  sessionStorage.setItem(STORAGE_VERIFIER, session.codeVerifier);
}
function loadPkceSession() {
  const state = sessionStorage.getItem(STORAGE_STATE);
  const codeVerifier = sessionStorage.getItem(STORAGE_VERIFIER);
  if (!state || !codeVerifier) return null;
  return { state, codeVerifier };
}
function clearPkceSession() {
  sessionStorage.removeItem(STORAGE_STATE);
  sessionStorage.removeItem(STORAGE_VERIFIER);
}

// src/oauth/authorize.ts
var PAGE_ATTRIBUTION_KEYS = [
  "tag",
  "tags",
  "platform",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content"
];
function applyAttributionParams(url) {
  const current = new URLSearchParams(window.location.search);
  for (const key of PAGE_ATTRIBUTION_KEYS) {
    const value = current.get(key)?.trim();
    if (!value) continue;
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
}
async function buildAuthorizeUrl(config, options = {}) {
  const state = serializeOAuthState(options.state);
  const codeVerifier = randomString(64);
  const codeChallenge = await pkceChallengeS256(codeVerifier);
  savePkceSession({ state, codeVerifier });
  const requestedScopes = options.scopes ?? config.scopes;
  if (!requestedScopes.length) {
    throw new Error("scopes is required");
  }
  const url = new URL("/v2/oauth/login", config.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", [...new Set(requestedScopes)].join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  applyAttributionParams(url);
  return { url: url.toString(), state, codeVerifier };
}

// src/oauth/errors.ts
var TokenExchangeError = class extends Error {
  status;
  body;
  constructor(status, body, message) {
    super(message ?? `Token exchange failed (${status})`);
    this.name = "TokenExchangeError";
    this.status = status;
    this.body = body;
  }
};
var TokenRevokeError = class extends Error {
  status;
  body;
  constructor(status, body, message) {
    super(message ?? `Token revoke failed (${status})`);
    this.name = "TokenRevokeError";
    this.status = status;
    this.body = body;
  }
};
var OAuthRedirectError = class extends Error {
  error;
  errorDescription;
  state;
  constructor(error, extras) {
    super(extras?.errorDescription ?? error);
    this.name = "OAuthRedirectError";
    this.error = error;
    if (extras?.errorDescription !== void 0) {
      this.errorDescription = extras.errorDescription;
    }
    if (extras?.state !== void 0) {
      this.state = extras.state;
    }
  }
};

// src/oauth/token.ts
async function requestTokens(config, requestBody) {
  try {
    const response = await fetch(new URL("/v2/oauth/token", config.authUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    const responseBody = await response.json();
    if (!response.ok) {
      throw new TokenExchangeError(response.status, responseBody);
    }
    const tokens = responseBody;
    const expiresIn = Number(tokens?.expiresIn);
    if (!tokens?.accessToken || !tokens.refreshToken || !tokens.scope || !Number.isFinite(expiresIn)) {
      throw new TokenExchangeError(response.status, responseBody, "Invalid token response");
    }
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn,
      scope: tokens.scope
    };
  } catch (error) {
    if (error instanceof TokenExchangeError) throw error;
    throw new TokenExchangeError(
      0,
      {},
      error instanceof Error ? error.message : "Token request failed"
    );
  }
}
async function exchangeAuthorizationCode(config, { code, codeVerifier }) {
  const requestBody = {
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: codeVerifier
  };
  return requestTokens(config, requestBody);
}
async function refreshTokens(config, { refreshToken }) {
  if (!refreshToken) {
    throw new Error("refreshToken is required");
  }
  const requestBody = {
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: refreshToken
  };
  return requestTokens(config, requestBody);
}
async function revokeRefreshToken(config, { refreshToken }) {
  if (!refreshToken) {
    throw new Error("refreshToken is required");
  }
  const requestBody = {
    token: refreshToken,
    client_id: config.clientId
  };
  try {
    const response = await fetch(new URL("/v2/oauth/revoke", config.authUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const responseBody = await response.json();
      throw new TokenRevokeError(response.status, responseBody);
    }
  } catch (error) {
    if (error instanceof TokenRevokeError) throw error;
    throw new TokenRevokeError(
      0,
      {},
      error instanceof Error ? error.message : "Token revoke failed"
    );
  }
}

// src/oauth/callback.ts
function echoedState(raw) {
  if (!raw) return void 0;
  try {
    return parseOAuthState(raw);
  } catch {
    return void 0;
  }
}
function denied(error, extras) {
  return {
    ok: false,
    error,
    ...extras?.errorDescription !== void 0 ? { errorDescription: extras.errorDescription } : {},
    ...extras?.state !== void 0 ? { state: extras.state } : {}
  };
}
async function handleOAuthCallback(config, search) {
  const params = new URLSearchParams(
    search.startsWith("?") || search.startsWith("#") ? search.slice(1) : search
  );
  const stored = loadPkceSession();
  const clear = () => clearPkceSession();
  const error = params.get("error");
  const state = params.get("state");
  const code = params.get("code");
  const parsedState = echoedState(state);
  if (error) {
    if (state && stored?.state && state !== stored.state) {
      clear();
      return denied("state_mismatch", { errorDescription: "State mismatch on error redirect" });
    }
    clear();
    const errorDescription = params.get("error_description");
    return denied(error, {
      ...errorDescription ? { errorDescription } : {},
      ...parsedState !== void 0 ? { state: parsedState } : {}
    });
  }
  if (!code) {
    clear();
    return denied("missing_code", { errorDescription: "Missing authorization code" });
  }
  if (!stored || state !== stored.state) {
    clear();
    return denied("state_mismatch", {
      errorDescription: "State mismatch \u2014 aborting token exchange (did you switch between localhost and 127.0.0.1?)"
    });
  }
  const { codeVerifier } = stored;
  clear();
  if (parsedState === void 0) {
    return denied("invalid_state", {
      errorDescription: "State could not be parsed after redirect"
    });
  }
  try {
    const tokens = await exchangeAuthorizationCode(config, { code, codeVerifier });
    return { ok: true, tokens, state: parsedState };
  } catch (e) {
    if (e instanceof TokenExchangeError) {
      const body = e.body;
      return denied(body.error ?? "token_exchange_failed", {
        errorDescription: body.error_description ?? e.message,
        state: parsedState
      });
    }
    return denied("token_exchange_failed", {
      errorDescription: e instanceof Error ? e.message : String(e),
      state: parsedState
    });
  }
}

// src/oauth/tokenStore.ts
function tokensToSession(tokens, nowMs = Date.now()) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    scope: tokens.scope,
    expiresAt: nowMs + tokens.expiresIn * 1e3
  };
}
function sessionToTokens(session, nowMs = Date.now()) {
  const remainingMs = session.expiresAt - nowMs;
  const expiresIn = Math.max(0, Math.floor(remainingMs / 1e3));
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn,
    scope: session.scope
  };
}
var TokenStore = class {
  sessionKey;
  constructor(clientId) {
    this.sessionKey = `minds_oauth_session:${clientId}`;
  }
  get() {
    throw new Error("TokenStore.get() is not set");
  }
  set(session) {
    throw new Error("TokenStore.set() is not set");
  }
  clear() {
    throw new Error("TokenStore.clear() is not set");
  }
  parseSession(serialized) {
    try {
      const session = JSON.parse(serialized);
      const expiresAt = Number(session?.expiresAt);
      if (!session?.accessToken || !session.refreshToken || !session.scope || !Number.isFinite(expiresAt)) {
        return null;
      }
      return {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        scope: session.scope,
        expiresAt
      };
    } catch {
      return null;
    }
  }
};
var LocalStorageTokenStore = class extends TokenStore {
  get() {
    const serialized = window.localStorage.getItem(this.sessionKey);
    if (!serialized) return null;
    return this.parseSession(serialized);
  }
  set(session) {
    window.localStorage.setItem(this.sessionKey, JSON.stringify(session));
  }
  clear() {
    window.localStorage.removeItem(this.sessionKey);
  }
};

// src/oauth/types.ts
var AUTH_API_URL = "https://api.oauth.hellominds.ai";
function resolveAuthUrl(opts) {
  if (opts.authUrl?.trim()) {
    return opts.authUrl.replace(/\/$/, "");
  }
  return AUTH_API_URL;
}

// src/oauth/MindsOAuth.ts
var DEFAULT_SKEW_MS = 6e4;
var MindsOAuth = class {
  config;
  tokenStore;
  /**
   * Builder API client. Authed requests call {@link getAccessToken}
   * before each HTTP/SSE call (no Proxy).
   * Streams stay sync: `oauth.client.subscribeEvents(…)`.
   */
  client;
  refreshInFlight = null;
  listeners = /* @__PURE__ */ new Set();
  constructor(opts) {
    if (!opts.clientId) throw new Error("clientId is required");
    if (!opts.redirectUri) throw new Error("redirectUri is required");
    if (!opts.scopes?.length) throw new Error("scopes is required");
    this.config = {
      clientId: opts.clientId,
      redirectUri: opts.redirectUri,
      authUrl: resolveAuthUrl(opts),
      scopes: opts.scopes
    };
    this.tokenStore = opts.storage instanceof TokenStore ? opts.storage : new LocalStorageTokenStore(opts.clientId);
    this.client = createMindsClient({
      getAccessToken: () => this.getAccessToken()
    });
    this.syncMindsClientAccessToken();
  }
  /**
   * Same-tab session changes (login, refresh, logout/clear).
   * Returns an unsubscribe function.
   */
  onTokensChanged(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /**
   * Persist PKCE session and navigate to Auth /v2/oauth/login.
   * Pass `scopes` (full desired set) for incremental consent; defaults to `opts.scopes`.
   */
  async signIn(options) {
    const { url } = await buildAuthorizeUrl(this.config, options);
    window.location.assign(url);
  }
  /**
   * Validate state, exchange code, clear PKCE session, and persist tokens on success.
   * Throws {@link OAuthRedirectError} on OAuth error / denial / exchange failure.
   */
  async handleRedirect(search = window.location.search) {
    const result = await handleOAuthCallback(this.config, search);
    if (!result.ok) {
      throw new OAuthRedirectError(result.error, {
        ...result.errorDescription !== void 0 ? { errorDescription: result.errorDescription } : {},
        ...result.state !== void 0 ? { state: result.state } : {}
      });
    }
    this.persistTokens(result.tokens);
    return { tokens: result.tokens, state: result.state };
  }
  /**
   * Partner sign-out: best-effort `POST /v2/oauth/revoke`, then clear local session.
   * Does **not** clear HelloMinds Auth UI cookies or open Auth UI `/logout`
   * (partner logout only — next login can use session + prior-consent fast path).
   */
  async signOut() {
    await this.revoke();
    this.clearSession();
  }
  /**
   * Sync store snapshot. The access token may already be expired.
   * `expiresIn` is seconds remaining. Use {@link hasScopes} to check coverage.
   */
  get tokens() {
    const session = this.tokenStore.get();
    return session ? sessionToTokens(session) : null;
  }
  /**
   * True when a session exists and `tokens.scope` covers `scopes`.
   * Use this (with the same list) before {@link signIn} with extra `scopes`.
   */
  hasScopes(scopes) {
    const tokens = this.tokens;
    if (!tokens) return false;
    const grantedScopes = new Set(
      tokens.scope.split(/\s+/).filter((grantedScope) => grantedScope.length > 0)
    );
    return scopes.every((requiredScope) => grantedScopes.has(requiredScope));
  }
  /**
   * Return a usable access token, refreshing when within 60s of expiry.
   * `null` if there is no session. Concurrent callers in this tab share one
   * in-flight refresh. Across tabs, uses `navigator.locks` when available so
   * only one tab rotates the refresh token. Clears the store on failure.
   *
   * {@link tokens} is the sync store read (the access token may be expired).
   */
  async getAccessToken() {
    const session = this.tokenStore.get();
    if (!session) return null;
    if (Date.now() < session.expiresAt - DEFAULT_SKEW_MS) {
      return session.accessToken;
    }
    if (this.refreshInFlight) {
      const tokens = await this.refreshInFlight;
      return tokens.accessToken;
    }
    try {
      this.refreshInFlight = this.runExclusiveRefresh();
      const tokens = await this.refreshInFlight;
      return tokens.accessToken;
    } catch (err) {
      this.clearSession();
      throw err;
    } finally {
      this.refreshInFlight = null;
    }
  }
  /** Drop in-flight PKCE session and clear persisted tokens (local only). */
  clearSession() {
    clearPkceSession();
    this.tokenStore.clear();
    this.syncMindsClientAccessToken();
    this.notifySessionChange();
  }
  async refresh(refreshToken) {
    const tokens = await refreshTokens(this.config, { refreshToken });
    return this.persistTokens(tokens);
  }
  async revoke() {
    const token = this.tokenStore.get()?.refreshToken;
    if (!token) return;
    try {
      await revokeRefreshToken(this.config, { refreshToken: token });
    } catch {
    }
  }
  /**
   * Refresh under a cross-tab lock when supported. Re-reads the store after
   * acquiring the lock in case another tab already rotated tokens.
   */
  async runExclusiveRefresh() {
    const lockName = `minds_oauth_refresh:${this.config.clientId}`;
    const refresh = async () => {
      const latest = this.tokenStore.get();
      if (!latest) {
        throw new Error("refreshToken is required");
      }
      if (Date.now() < latest.expiresAt - DEFAULT_SKEW_MS) {
        return sessionToTokens(latest);
      }
      return this.refresh(latest.refreshToken);
    };
    const locks = navigator.locks;
    if (locks?.request) {
      return locks.request(lockName, refresh);
    }
    return refresh();
  }
  persistTokens(tokens) {
    const session = tokensToSession(tokens);
    this.tokenStore.set(session);
    this.syncMindsClientAccessToken();
    this.notifySessionChange();
    return sessionToTokens(session);
  }
  syncMindsClientAccessToken() {
    this.client.setAccessToken(this.tokenStore.get()?.accessToken ?? null);
  }
  notifySessionChange() {
    const tokens = this.tokens;
    for (const listener of this.listeners) {
      listener(tokens);
    }
  }
};

// src/oauth/scopes.ts
var MindsScope = {
  Email: "email",
  MindsList: "minds:list",
  MindsStatus: "minds:status",
  MindsCognition: "minds:cognition",
  MindsSkillsList: "minds:skills:list",
  MindsToolsList: "minds:tools:list",
  MindsAppsList: "minds:apps:list",
  MindsEmail: "minds:email",
  MindsWallets: "minds:wallets",
  MindsAwaken: "minds:awaken",
  MindsEnable: "minds:enable",
  MindsDisable: "minds:disable",
  MindsSkillsEquip: "minds:skills:equip",
  MindsSkillsUnequip: "minds:skills:unequip",
  MindsToolsEquip: "minds:tools:equip",
  MindsToolsUnequip: "minds:tools:unequip",
  MindsAppsEquip: "minds:apps:equip",
  MindsAppsUnequip: "minds:apps:unequip",
  ConversationsCreate: "conversations:create",
  ConversationsList: "conversations:list",
  ConversationsRead: "conversations:read",
  MessagingSend: "messaging:send",
  MessagingBeacon: "messaging:beacon",
  MessagingHistory: "messaging:history",
  MessagingActivityStream: "messaging:activity:stream",
  MessagingStream: "messaging:stream"
};

export { MindsOAuth, MindsScope, OAuthRedirectError, TokenStore };

