// Tellus auth + payments client: session plumbing, Passkey (WebAuthn) / NIP-07 / Bunker (NIP-46)
// login flows, npub linking, anonymous-id claiming and the premium checkout helpers.
//
// Wire contract: hyades docs/TELLUS_USERS_PAYMENTS.md. The session is an HMAC bearer token
// ("tlu1.<accountId>.<tokenVersion>.<exp-unix>.<sig>") persisted in localStorage and sent as
// X-Tellus-Session on every Hyades API call (installSessionFetch patches window.fetch so all
// existing call sites pick it up). The /live WebSocket cannot carry headers, so an authenticated
// HTTP call exchanges the session for a short-lived one-time ticket backed by Hyades' ceremony grain.

import { runtimeConfig, runtimeConfigReady } from "./tellus-runtime-config";

// ── Wire shapes ──────────────────────────────────────────────────────────────

export interface TellusPasskeyInfo {
  credentialId: string;
  label?: string | null;
  addedAt?: string | null;
}

export interface TellusAccount {
  accountId: string;
  label?: string | null;
  npub?: string | null;
  /** Server-verified NIP-05 identifier (e.g. "alice@example.com"; "_@domain" displays as "domain"). */
  nip05?: string | null;
  status?: string | null;
  role?: string | null;
  premium?: boolean;
  premiumUntil?: string | null;
  passkeys?: TellusPasskeyInfo[];
  claimedUserIds?: string[];
  createdAt?: string | null;
  lastLoginAt?: string | null;
}

export interface TellusAuthStatus {
  authenticated: boolean;
  account?: TellusAccount | null;
}

export interface PayProduct {
  id: string;
  name?: string;
  priceSat?: number;
  periodDays?: number;
}

export type PayCheckoutStatus = "pending" | "paid" | "expired" | "canceled" | "failed";

export interface PayCheckout {
  checkoutId: string;
  productId?: string;
  amountSat?: number;
  status: PayCheckoutStatus;
  invoice?: string | null;
  paymentHash?: string | null;
  createdAt?: string;
  paidAt?: string | null;
  expiresAt?: string | null;
  error?: string | null;
}

interface LoginResponse {
  token: string;
  account: TellusAccount;
}

/** Error carrying the HTTP status so the UI can special-case 404/501 ("payments not enabled yet"). */
export class TellusApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// NIP-07 browser extension surface (window.nostr).
interface NostrEventTemplate {
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
}

interface SignedNostrEvent extends NostrEventTemplate {
  id: string;
  pubkey: string;
  sig: string;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: NostrEventTemplate): Promise<SignedNostrEvent>;
    };
  }
}

// ── Session store ────────────────────────────────────────────────────────────

const SESSION_KEY = "tellus.session";
const ACCOUNT_KEY = "tellus.account";
const BUNKER_KEY = "tellus.bunker";
export const SESSION_HEADER = "X-Tellus-Session";

type AuthListener = (account: TellusAccount | null) => void;
const authListeners = new Set<AuthListener>();

export function onAuthChange(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function notifyAuthChange(): void {
  const account = getSession()?.account ?? null;
  for (const listener of authListeners) {
    try {
      listener(account);
    } catch {
      /* a listener must never break auth state changes */
    }
  }
}

function parseToken(token: string): { accountId: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "tlu1" || !parts[1]) return null;
  const exp = Number(parts[3]);
  if (!Number.isFinite(exp)) return null;
  return { accountId: parts[1], exp };
}

function readStoredAccount(): TellusAccount | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && typeof (parsed as TellusAccount).accountId === "string") {
      return parsed as TellusAccount;
    }
  } catch {
    /* corrupted cache — treat as absent */
  }
  return null;
}

export function getSession(): { token: string; account: TellusAccount | null } | null {
  let token: string | null = null;
  try {
    token = window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!token) return null;
  const parsed = parseToken(token);
  if (!parsed || parsed.exp * 1000 <= Date.now()) {
    // Expired/garbage token — drop it so the app cleanly falls back to the anonymous identity.
    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  return { token, account: readStoredAccount() };
}

export function setSession(token: string, account: TellusAccount | null): void {
  try {
    window.localStorage.setItem(SESSION_KEY, token);
    if (account) window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* storage full/blocked — session lives only for this page */
  }
  notifyAuthChange();
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
  notifyAuthChange();
}

/** Effective logged-in accountId, or null when logged out. tellusUserId() consults this. */
export function sessionAccountId(): string | null {
  const session = getSession();
  if (!session) return null;
  return session.account?.accountId ?? parseToken(session.token)?.accountId ?? null;
}

function sessionToken(): string | null {
  return getSession()?.token ?? null;
}

function updateCachedAccount(account: TellusAccount): void {
  try {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    /* ignore */
  }
  notifyAuthChange();
}

// ── Fetch plumbing ───────────────────────────────────────────────────────────

function apiRoot(): string {
  return runtimeConfig.worldApiBase || runtimeConfig.apiBase || "";
}

function authUrl(path: string): string {
  return `${apiRoot()}/api/tellus/auth/${path}`;
}

function payUrl(path: string): string {
  return `${apiRoot()}/api/tellus/pay/${path}`;
}

/** True when the URL targets the Hyades gateway API (worldApiBase / apiBase / same-origin /api/*). */
function isHeaderFreeWorldRead(url: URL, method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") return false;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "world" || parts.length < 4) return false;
  const route = parts[3];
  return (
    route === "state" ||
    route === "chunk" ||
    route === "chunks" ||
    (route === "preview" && parts[4] === "live")
  );
}

export function shouldAttachSessionHeader(raw: string, method = "GET"): boolean {
  try {
    const url = new URL(raw, window.location.href);
    if (!url.pathname.startsWith("/api/")) return false;
    // The asset-library proxy is identity-free — skip the session header there so the (many, large)
    // model/texture GETs stay simple requests with no CORS preflight.
    if (url.pathname.startsWith("/api/assets/")) return false;
    if (isHeaderFreeWorldRead(url, method)) return false;
    for (const base of [runtimeConfig.worldApiBase, runtimeConfig.apiBase]) {
      if (!base) continue;
      try {
        if (new URL(base, window.location.href).origin === url.origin) return true;
      } catch {
        /* malformed base — skip */
      }
    }
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

let sessionFetchInstalled = false;

/**
 * Patch window.fetch so every Hyades API call (agent endpoints, world meta PATCH, state, pay…)
 * carries X-Tellus-Session while a session exists. The check runs per call, so login/logout takes
 * effect immediately; non-Hyades URLs (asset forge CDN, model stores…) are left untouched to avoid
 * tripping their CORS preflight with an unexpected header.
 */
export function installSessionFetch(): void {
  if (sessionFetchInstalled || typeof window === "undefined") return;
  sessionFetchInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const token = sessionToken();
      if (token) {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method =
          init?.method ??
          (typeof Request !== "undefined" && input instanceof Request ? input.method : undefined) ??
          "GET";
        if (shouldAttachSessionHeader(url, method)) {
          const headers = new Headers(
            init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
          );
          if (!headers.has(SESSION_HEADER)) headers.set(SESSION_HEADER, token);
          init = { ...(init ?? {}), headers };
        }
      }
    } catch {
      /* header injection must never break a fetch */
    }
    return originalFetch(input, init);
  };
}

/** Boot race guard: wait (bounded) for the runtime config so URLs are built against the real API base
 * rather than the page origin. No-op once the base is known. */
async function ensureApiRoot(): Promise<void> {
  if (apiRoot()) return;
  await Promise.race([runtimeConfigReady, new Promise((r) => setTimeout(r, 5000))]);
}

async function apiJson<T>(urlOrBuilder: string | (() => string), init?: RequestInit): Promise<T> {
  await ensureApiRoot();
  const url = typeof urlOrBuilder === "function" ? urlOrBuilder() : urlOrBuilder;
  return await apiJsonAt<T>(url, init);
}

async function apiJsonAt<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = sessionToken();
  if (token && !headers.has(SESSION_HEADER)) headers.set(SESSION_HEADER, token);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new TellusApiError(res.status, detail || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

// ── Auth status / logout / claim ─────────────────────────────────────────────

export async function authStatus(): Promise<TellusAuthStatus> {
  const status = await apiJson<TellusAuthStatus>(() => authUrl("status"));
  if (status.authenticated && status.account) {
    updateCachedAccount(status.account);
  } else if (!status.authenticated && sessionToken()) {
    // Server says the token is dead (ban / logout-all / version bump) — drop it locally too.
    clearSession();
  }
  return status;
}

/**
 * Exchange the header-authenticated account session for a one-time, short-lived WebSocket ticket.
 * Browser WebSocket handshakes cannot set X-Tellus-Session, so the ticket lets Hyades recover the
 * verified account without exposing the bearer token in the socket URL.
 */
export async function issueTellusLiveTicket(visitorId: string, signal?: AbortSignal): Promise<string | null> {
  const normalizedVisitorId = visitorId.trim();
  if (!sessionToken() || !normalizedVisitorId) return null;
  const response = await apiJson<{ ticket?: unknown }>(() => authUrl("live-ticket"), {
    method: "POST",
    body: JSON.stringify({ visitorId: normalizedVisitorId }),
    signal,
  });
  return typeof response.ticket === "string" && response.ticket.trim()
    ? response.ticket.trim()
    : null;
}

export async function logout(all = false): Promise<void> {
  try {
    await apiJson<{ ok?: boolean }>(() => authUrl("logout"), {
      method: "POST",
      body: JSON.stringify({ all }),
    });
  } catch {
    /* best effort — local session clears regardless */
  }
  clearSession();
}

/** The raw anonymous uuid (pre-login identity) — read straight from storage, NOT tellusUserId(). */
export function anonymousUserId(): string | null {
  try {
    return window.localStorage.getItem("tellus.userId");
  } catch {
    return null;
  }
}

export async function claimAnonymousId(): Promise<TellusAccount | null> {
  const userId = anonymousUserId();
  if (!userId) return getSession()?.account ?? null;
  const body = await apiJson<{ account: TellusAccount }>(() => authUrl("claim"), {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  updateCachedAccount(body.account);
  return body.account;
}

// ── Nostr login (NIP-07 + NIP-46 bunker) ─────────────────────────────────────

async function fetchNonce(): Promise<string> {
  const body = await apiJson<{ nonce: string; expiresAt?: string }>(() => authUrl("nonce"));
  if (!body.nonce) throw new Error("Auth nonce unavailable.");
  return body.nonce;
}

function nonceEventTemplate(nonce: string): NostrEventTemplate {
  return { kind: 24242, content: nonce, created_at: Math.floor(Date.now() / 1000), tags: [] };
}

async function postSignedNonceEvent(route: "nostr" | "link/nostr", event: SignedNostrEvent): Promise<LoginResponse | { account: TellusAccount }> {
  return await apiJson<LoginResponse & { account: TellusAccount }>(() => authUrl(route), {
    method: "POST",
    body: JSON.stringify(event),
  });
}

export async function loginNostrNip07(): Promise<TellusAccount> {
  if (!window.nostr) throw new Error("No Nostr extension found (window.nostr).");
  await window.nostr.getPublicKey(); // surfaces the extension's permission prompt early
  const nonce = await fetchNonce();
  const signed = await window.nostr.signEvent(nonceEventTemplate(nonce));
  const body = (await postSignedNonceEvent("nostr", signed)) as LoginResponse;
  setSession(body.token, body.account);
  return body.account;
}

// Persisted bunker pairing so a re-login reuses the already-approved client key (silent re-auth).
interface StoredBunker {
  uri: string;
  clientSecret: string; // hex
}

function readStoredBunker(): StoredBunker | null {
  try {
    const raw = window.localStorage.getItem(BUNKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as StoredBunker).uri === "string" &&
      typeof (parsed as StoredBunker).clientSecret === "string"
    ) {
      return parsed as StoredBunker;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function storedBunkerUri(): string | null {
  return readStoredBunker()?.uri ?? null;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function signNonceViaBunker(bunkerUri: string): Promise<SignedNostrEvent> {
  // Lazy-load nostr-tools so the (large) nip46 stack only ships to users who use a bunker.
  const [{ BunkerSigner, parseBunkerInput }, { generateSecretKey }] = await Promise.all([
    import("nostr-tools/nip46"),
    import("nostr-tools/pure"),
  ]);
  const pointer = await parseBunkerInput(bunkerUri.trim());
  if (!pointer) throw new Error("Invalid bunker:// URI or NIP-05 identifier.");
  // Reuse the persisted client secret for the same bunker so the signer remembers the approval.
  const stored = readStoredBunker();
  const clientSecret =
    stored && stored.uri === bunkerUri.trim() ? hexToBytes(stored.clientSecret) : generateSecretKey();
  const signer = BunkerSigner.fromBunker(clientSecret, pointer, {
    onauth: (url: string) => {
      try {
        window.open(url, "_blank", "noopener");
      } catch {
        /* popup blocked — the signer app will still show the request */
      }
    },
  });
  try {
    await signer.connect();
    const nonce = await fetchNonce();
    const signed = (await signer.signEvent(nonceEventTemplate(nonce))) as SignedNostrEvent;
    try {
      window.localStorage.setItem(
        BUNKER_KEY,
        JSON.stringify({ uri: bunkerUri.trim(), clientSecret: bytesToHex(clientSecret) } satisfies StoredBunker),
      );
    } catch {
      /* ignore */
    }
    return signed;
  } finally {
    void signer.close().catch(() => undefined);
  }
}

export async function loginNostrBunker(bunkerUri: string): Promise<TellusAccount> {
  const signed = await signNonceViaBunker(bunkerUri);
  const body = (await postSignedNonceEvent("nostr", signed)) as LoginResponse;
  setSession(body.token, body.account);
  return body.account;
}

/** Link an npub to the CURRENT (session-authed) account. NIP-07 by default; pass a bunker URI to sign over NIP-46. */
export async function linkNostr(bunkerUri?: string): Promise<TellusAccount> {
  let signed: SignedNostrEvent;
  if (bunkerUri && bunkerUri.trim()) {
    signed = await signNonceViaBunker(bunkerUri);
  } else {
    if (!window.nostr) throw new Error("No Nostr extension found (window.nostr).");
    await window.nostr.getPublicKey();
    const nonce = await fetchNonce();
    signed = await window.nostr.signEvent(nonceEventTemplate(nonce));
  }
  const body = (await postSignedNonceEvent("link/nostr", signed)) as { account: TellusAccount };
  updateCachedAccount(body.account);
  return body.account;
}

// ── NIP-05 (verified identifier display) ─────────────────────────────────────
// The CLIENT discovers the nip05 claim from the user's kind-0 profile on public relays; the SERVER
// independently verifies it against the domain's /.well-known/nostr.json and stores it on the account
// (verified-or-nothing). Best-effort + throttled — display falls back to the npub.

const NIP05_CHECK_KEY = "tellus.nip05check";
const NIP05_RECHECK_MS = 6 * 60 * 60 * 1000;
const NIP05_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://purplepag.es",
];

let nip05InFlight = false;

/** Resolve + submit the account's NIP-05 for server verification (no-op when logged out, already
 * verified, no npub, recently checked, or relays/claim unavailable). Fires an auth-change on success. */
export async function maybeResolveNip05(): Promise<void> {
  const account = getSession()?.account;
  const pubkey = account?.npub;
  if (!account || !pubkey || account.nip05 || nip05InFlight) return;
  try {
    const raw = window.localStorage.getItem(NIP05_CHECK_KEY);
    if (raw) {
      const last = JSON.parse(raw) as { pubkey?: string; at?: number };
      if (last.pubkey === pubkey && typeof last.at === "number" && Date.now() - last.at < NIP05_RECHECK_MS) return;
    }
  } catch {
    /* ignore */
  }
  nip05InFlight = true;
  try {
    const { SimplePool } = await import("nostr-tools/pool");
    const pool = new SimplePool();
    let claim: string | undefined;
    try {
      const profile = await pool.get(NIP05_RELAYS, { kinds: [0], authors: [pubkey] }, { maxWait: 6000 });
      if (profile?.content) {
        const meta = JSON.parse(profile.content) as { nip05?: unknown };
        if (typeof meta.nip05 === "string" && meta.nip05.trim()) claim = meta.nip05.trim();
      }
    } finally {
      try {
        pool.close(NIP05_RELAYS);
      } catch {
        /* ignore */
      }
    }
    try {
      window.localStorage.setItem(NIP05_CHECK_KEY, JSON.stringify({ pubkey, at: Date.now() }));
    } catch {
      /* ignore */
    }
    if (!claim) return;
    const body = await apiJson<{ account: TellusAccount }>(() => authUrl("nip05"), {
      method: "POST",
      body: JSON.stringify({ nip05: claim }),
    });
    updateCachedAccount(body.account);
  } catch {
    /* best effort — unverifiable claims just keep the npub display */
  } finally {
    nip05InFlight = false;
  }
}

/** Display form of a NIP-05 identifier: the "_@domain" root identifier renders as just the domain. */
export function nip05Display(nip05: string): string {
  return nip05.startsWith("_@") ? nip05.slice(2) : nip05;
}

// ── Passkeys (WebAuthn, fido2-net-lib v4 JSON: base64url strings on the wire) ─

function base64urlToBuffer(value: string): ArrayBuffer {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bin = window.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return window.btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Drop null/undefined members recursively — fido2-net-lib serializes optional fields as null, which WebAuthn dictionaries reject. */
function pruneNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneNulls(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === null || item === undefined) continue;
      out[key] = pruneNulls(item);
    }
    return out as T;
  }
  return value;
}

interface PasskeyBeginResponse {
  ceremonyId: string;
  options: Record<string, unknown>;
}

interface WireCredentialDescriptor {
  type?: string;
  id: string;
  transports?: string[];
}

function toCredentialDescriptors(value: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((c): c is WireCredentialDescriptor => Boolean(c) && typeof (c as WireCredentialDescriptor).id === "string")
    .map((c) => ({
      type: "public-key" as const,
      id: base64urlToBuffer(c.id),
      transports: c.transports as AuthenticatorTransport[] | undefined,
    }));
}

function requirePasskeySupport(): void {
  if (typeof navigator === "undefined" || !navigator.credentials || typeof PublicKeyCredential === "undefined") {
    throw new Error("Passkeys are not supported by this browser.");
  }
}

export async function passkeyRegister(label?: string): Promise<TellusAccount> {
  requirePasskeySupport();
  const begin = await apiJson<PasskeyBeginResponse>(() => authUrl("passkey/register/begin"), {
    method: "POST",
    body: JSON.stringify({ label: label || undefined }),
  });
  const raw = pruneNulls(begin.options);
  const user = raw.user as { id: string; name?: string; displayName?: string };
  const publicKey = {
    ...raw,
    challenge: base64urlToBuffer(raw.challenge as string),
    user: { ...user, id: base64urlToBuffer(user.id) },
    excludeCredentials: toCredentialDescriptors(raw.excludeCredentials),
  } as unknown as PublicKeyCredentialCreationOptions;
  const created = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!created) throw new Error("Passkey creation was cancelled.");
  const attestation = created.response as AuthenticatorAttestationResponse;
  const credential = {
    id: created.id,
    rawId: bufferToBase64url(created.rawId),
    type: created.type,
    response: {
      clientDataJSON: bufferToBase64url(attestation.clientDataJSON),
      attestationObject: bufferToBase64url(attestation.attestationObject),
    },
  };
  const body = await apiJson<LoginResponse>(() => authUrl("passkey/register/finish"), {
    method: "POST",
    body: JSON.stringify({ ceremonyId: begin.ceremonyId, credential, label: label || undefined }),
  });
  setSession(body.token, body.account);
  return body.account;
}

export async function passkeyLogin(): Promise<TellusAccount> {
  requirePasskeySupport();
  const begin = await apiJson<PasskeyBeginResponse>(() => authUrl("passkey/login/begin"), {
    method: "POST",
    body: JSON.stringify({}),
  });
  const raw = pruneNulls(begin.options);
  const publicKey = {
    ...raw,
    challenge: base64urlToBuffer(raw.challenge as string),
    allowCredentials: toCredentialDescriptors(raw.allowCredentials),
  } as unknown as PublicKeyCredentialRequestOptions;
  const asserted = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!asserted) throw new Error("Passkey sign-in was cancelled.");
  const assertion = asserted.response as AuthenticatorAssertionResponse;
  const credential = {
    id: asserted.id,
    rawId: bufferToBase64url(asserted.rawId),
    type: asserted.type,
    response: {
      clientDataJSON: bufferToBase64url(assertion.clientDataJSON),
      authenticatorData: bufferToBase64url(assertion.authenticatorData),
      signature: bufferToBase64url(assertion.signature),
      userHandle: assertion.userHandle ? bufferToBase64url(assertion.userHandle) : null,
    },
  };
  const body = await apiJson<LoginResponse>(() => authUrl("passkey/login/finish"), {
    method: "POST",
    body: JSON.stringify({ ceremonyId: begin.ceremonyId, credential }),
  });
  setSession(body.token, body.account);
  return body.account;
}

// ── Payments (premium checkout) ──────────────────────────────────────────────

export async function getProducts(): Promise<PayProduct[]> {
  const body = await apiJson<{ products?: PayProduct[] }>(() => payUrl("products"));
  return Array.isArray(body.products) ? body.products : [];
}

export async function startCheckout(productId: string): Promise<PayCheckout> {
  return await apiJson<PayCheckout>(() => payUrl("checkout"), {
    method: "POST",
    body: JSON.stringify({ productId }),
  });
}

export async function getCheckout(id: string): Promise<PayCheckout> {
  return await apiJson<PayCheckout>(() => payUrl(`checkout/${encodeURIComponent(id)}`));
}

// ── MCP "play programmatically" token (bring your own agent) ─────────────────

export interface McpTokenStatus {
  hasToken: boolean;
  premium: boolean;
  /** Server-authoritative entitlement when supported by Hyades. */
  canUseMcp?: boolean;
}

/** Rollout fallback: every active account may bring its own MCP agent. */
export function canUseTellusMcp(
  account: Pick<TellusAccount, "status">,
): boolean {
  return account.status?.trim().toLowerCase() === "active";
}

/** A server denial narrows the rollout fallback; stale server state can never widen local entitlement. */
export function hasTellusMcpAccess(
  account: Pick<TellusAccount, "status">,
  status?: Pick<McpTokenStatus, "canUseMcp"> | null,
): boolean {
  return canUseTellusMcp(account) && status?.canUseMcp !== false;
}

export interface McpTokenMinted {
  token: string;
  mcpUrl: string;
  note?: string;
}

function mcpTokenApiUrl(): string {
  return `${apiRoot()}/api/tellus/user/mcp-token`;
}

/** Absolute MCP endpoint URL for a world (what the user points their MCP client at). */
export function mcpEndpointUrl(world = "main"): string {
  const path = `/api/tellus/mcp/${encodeURIComponent(world)}`;
  const root = apiRoot();
  try {
    return new URL(path, root ? new URL(root, window.location.href) : window.location.href).href;
  } catch {
    return `${root}${path}`;
  }
}

export async function getMcpTokenStatus(): Promise<McpTokenStatus> {
  return await apiJson<McpTokenStatus>(() => mcpTokenApiUrl());
}

/** Mint (or rotate) the MCP API token. Returns the secret ONCE. Entitlement is enforced server-side. */
export async function mintMcpToken(): Promise<McpTokenMinted> {
  return await apiJson<McpTokenMinted>(() => mcpTokenApiUrl(), { method: "POST" });
}

export async function revokeMcpToken(): Promise<void> {
  await apiJson<unknown>(() => mcpTokenApiUrl(), { method: "DELETE" });
}
