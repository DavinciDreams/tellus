// Login button + dialog + account panel + premium checkout for the Tellus top bar.
// Pure client UI over src/tellus-auth.ts (the wire layer); gold HUD styling via .auth-* classes.

import React, { useCallback, useEffect, useState } from "react";
import {
  anonymousUserId,
  authStatus,
  claimAnonymousId,
  getCheckout,
  getProducts,
  getSession,
  linkNostr,
  loginNostrBunker,
  loginNostrNip07,
  getMcpTokenStatus,
  logout,
  maybeResolveNip05,
  mcpEndpointUrl,
  mintMcpToken,
  nip05Display,
  onAuthChange,
  passkeyLogin,
  passkeyRegister,
  revokeMcpToken,
  startCheckout,
  storedBunkerUri,
  TellusApiError,
  type McpTokenStatus,
  type PayCheckout,
  type TellusAccount,
} from "./tellus-auth";

const OPEN_ACCOUNT_EVENT = "tellus-open-account";

/** Open the account panel from anywhere (e.g. the agent panel's premium upsell chip). */
export function openTellusAccountPanel(): void {
  window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_EVENT));
}

/** Live account state: the cached account, refreshed from /auth/status on mount + on every auth change. */
export function useTellusAuth(): TellusAccount | null {
  const [account, setAccount] = useState<TellusAccount | null>(
    () => getSession()?.account ?? null,
  );
  useEffect(() => onAuthChange(setAccount), []);
  useEffect(() => {
    if (getSession()) void authStatus().catch(() => undefined);
  }, []);
  useEffect(() => {
    // Resolve the verified NIP-05 for display (throttled + best-effort inside).
    if (account?.npub && !account.nip05) void maybeResolveNip05();
  }, [account?.npub, account?.nip05]);
  return account;
}

function shortNpub(npub: string): string {
  return npub.length > 18 ? `${npub.slice(0, 11)}…${npub.slice(-4)}` : npub;
}

// bech32 (BIP-173) npub encoding of the server's hex pubkey — display-only, self-contained.
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function npubFromHex(pubkeyHex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(pubkeyHex)) return pubkeyHex;
  const data: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < 64; i += 2) {
    acc = (acc << 8) | Number.parseInt(pubkeyHex.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      data.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) data.push((acc << (5 - bits)) & 31);
  const hrp = "npub";
  const hrpExpanded = [
    ...[...hrp].map((c) => c.charCodeAt(0) >> 5),
    0,
    ...[...hrp].map((c) => c.charCodeAt(0) & 31),
  ];
  const polymod =
    bech32Polymod([...hrpExpanded, ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from(
    { length: 6 },
    (_, i) => (polymod >> (5 * (5 - i))) & 31,
  );
  return `${hrp}1${[...data, ...checksum].map((d) => BECH32_CHARSET[d]).join("")}`;
}

function accountButtonLabel(account: TellusAccount): string {
  if (account.nip05) return nip05Display(account.nip05).slice(0, 24);
  if (account.label && account.label.trim())
    return account.label.trim().slice(0, 18);
  if (account.npub) return shortNpub(npubFromHex(account.npub));
  return account.accountId.slice(0, 8);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function isPaymentsUnavailable(err: unknown): boolean {
  return (
    err instanceof TellusApiError && (err.status === 404 || err.status === 501)
  );
}

function premiumLabel(account: TellusAccount): string {
  if (!account.premium) return "Free";
  if (account.premiumUntil) {
    const until = new Date(account.premiumUntil);
    if (!Number.isNaN(until.getTime()))
      return `Premium until ${until.toLocaleDateString()}`;
  }
  return "Premium";
}

// ── Premium checkout block (inside the account panel) ────────────────────────

function PremiumCheckout({
  account,
}: {
  account: TellusAccount;
}): React.ReactElement | null {
  const [checkout, setCheckout] = useState<PayCheckout | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [priceLabel, setPriceLabel] = useState("$0");

  useEffect(() => {
    let cancelled = false;
    void getProducts()
      .then((products) => {
        if (cancelled) return;
        const premium = products.find((p) => p.id === "premium") ?? products[0];
        if (
          premium &&
          typeof premium.priceSat === "number" &&
          premium.priceSat > 0
        ) {
          setPriceLabel(`${premium.priceSat} sat`);
        }
      })
      .catch(() => undefined); // pricing label is cosmetic — the checkout call is authoritative
    return () => {
      cancelled = true;
    };
  }, []);

  const begin = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const started = await startCheckout("premium");
      setCheckout(started);
      if (started.status === "paid") {
        setCelebrate(true);
        void authStatus().catch(() => undefined);
      }
    } catch (err) {
      setNote(
        isPaymentsUnavailable(err)
          ? "Payments aren't enabled yet — check back soon."
          : errorMessage(err, "Checkout failed."),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // Poll a pending checkout every 3s until it settles (paid / expired / failed).
  useEffect(() => {
    if (!checkout || checkout.status !== "pending") return;
    const id = window.setInterval(() => {
      void getCheckout(checkout.checkoutId)
        .then((next) => {
          setCheckout(next);
          if (next.status === "paid") {
            setCelebrate(true);
            void authStatus().catch(() => undefined);
          }
        })
        .catch(() => undefined); // transient poll failure — keep waiting
    }, 3000);
    return () => window.clearInterval(id);
  }, [checkout]);

  const copyInvoice = useCallback(() => {
    if (!checkout?.invoice) return;
    void navigator.clipboard?.writeText(checkout.invoice).then(
      () => setNote("Invoice copied."),
      () => setNote("Copy failed — select the invoice text manually."),
    );
  }, [checkout?.invoice]);

  if (account.premium && !celebrate) return null;

  return (
    <div className="auth-section">
      <span className="auth-section-title">Premium</span>
      {celebrate || checkout?.status === "paid" ? (
        <span className="auth-celebrate">
          ✨ Premium is active — your agent stays awake while you're away.
        </span>
      ) : checkout?.status === "pending" && checkout.invoice ? (
        <>
          <span className="auth-muted">
            Pay this Lightning invoice to activate Premium:
          </span>
          <pre className="auth-invoice">{checkout.invoice}</pre>
          <div className="auth-row">
            <button
              type="button"
              className="auth-small-button"
              onClick={copyInvoice}
            >
              Copy
            </button>
            <a
              className="auth-small-button"
              href={`lightning:${checkout.invoice}`}
            >
              Open wallet
            </a>
          </div>
          <span className="auth-muted">Waiting for payment…</span>
        </>
      ) : checkout &&
        (checkout.status === "expired" ||
          checkout.status === "failed" ||
          checkout.status === "canceled") ? (
        <>
          <span className="auth-error">
            Checkout {checkout.status}
            {checkout.error ? ` — ${checkout.error}` : ""}.
          </span>
          <button
            type="button"
            className="auth-premium-button"
            disabled={busy}
            onClick={() => void begin()}
          >
            Try again
          </button>
        </>
      ) : (
        <button
          type="button"
          className="auth-premium-button"
          disabled={busy}
          onClick={() => void begin()}
        >
          {busy ? "Starting checkout…" : `Get Premium — ${priceLabel}`}
        </button>
      )}
      {note && <span className="auth-muted">{note}</span>}
      <span className="auth-muted">
        Premium keeps your agent alive while you're away.
      </span>
    </div>
  );
}

function McpGuideLink(): React.ReactElement {
  return (
    <span className="auth-kv">
      <span className="auth-muted">guide</span>
      <a
        className="auth-small-button"
        href="/tellus-mcp-skill.md"
        download
        target="_blank"
        rel="noopener noreferrer"
      >
        Download the LLM skill doc
      </a>
    </span>
  );
}

/** Surface the MCP guide to every user; premium gates only endpoint/token management. */
function McpAccessSection({
  account,
}: {
  account: TellusAccount;
}): React.ReactElement | null {
  const [status, setStatus] = useState<McpTokenStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const endpoint = mcpEndpointUrl("main");

  useEffect(() => {
    if (!account.premium) return;
    let alive = true;
    void getMcpTokenStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        /* status is best-effort */
      });
    return () => {
      alive = false;
    };
  }, [account.premium]);

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
      },
      () => {
        /* clipboard blocked — the value is selectable */
      },
    );
  };

  const mint = async () => {
    setBusy(true);
    try {
      const r = await mintMcpToken();
      setToken(r.token);
      setStatus({ hasToken: true, premium: true });
    } catch {
      /* surfaced by the disabled state resetting */
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await revokeMcpToken();
      setToken(null);
      setStatus({ hasToken: false, premium: true });
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-section">
      <span className="auth-section-title">Play programmatically (MCP)</span>
      <span className="auth-muted">
        Drive your avatar from any MCP client or your own automation — same
        tools the in-world agents use.
      </span>
      <McpGuideLink />
      {account.premium ? (
        <>
          <span className="auth-kv">
            <span className="auth-muted">endpoint</span>
            <code style={{ wordBreak: "break-all" }}>{endpoint}</code>
            <button
              type="button"
              className="auth-small-button"
              onClick={() => copy(endpoint, "endpoint")}
            >
              {copied === "endpoint" ? "Copied" : "Copy"}
            </button>
          </span>
          {token ? (
            <>
              <span className="auth-kv">
                <span className="auth-muted">token</span>
                <code style={{ wordBreak: "break-all" }}>{token}</code>
                <button
                  type="button"
                  className="auth-small-button"
                  onClick={() => copy(token, "token")}
                >
                  {copied === "token" ? "Copied" : "Copy"}
                </button>
              </span>
              <span className="auth-muted">
                Shown once — store it now. Send it as{" "}
                <code>Authorization: Bearer &lt;token&gt;</code>.
              </span>
            </>
          ) : (
            <span className="auth-muted">
              {status?.hasToken
                ? "A token is active (the secret is shown only when created). Regenerate to get a new one."
                : "No token yet — generate one to get your Bearer token."}
            </span>
          )}
          <div className="auth-row">
            <button
              type="button"
              className="auth-small-button"
              disabled={busy}
              onClick={() => void mint()}
            >
              {busy
                ? "Working…"
                : status?.hasToken
                  ? "Regenerate token"
                  : "Generate token"}
            </button>
            {status?.hasToken && (
              <button
                type="button"
                className="auth-small-button"
                disabled={busy}
                onClick={() => void revoke()}
              >
                Revoke
              </button>
            )}
          </div>
        </>
      ) : (
        <span className="auth-muted">
          Premium is required to generate a Bearer token for MCP access.
        </span>
      )}
    </div>
  );
}

// ── The top-bar control: Login button / account pill + the two dialogs ───────

type AuthView = null | "login" | "account";

export function AuthControls(): React.ReactElement {
  const account = useTellusAuth();
  const [view, setView] = useState<AuthView>(null);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bunkerUri, setBunkerUri] = useState(() => storedBunkerUri() ?? "");
  const [registerLabel, setRegisterLabel] = useState("");
  const [claimAccount, setClaimAccount] = useState<TellusAccount | null>(null);
  const [linkBunkerOpen, setLinkBunkerOpen] = useState(false);
  const nip07Available = typeof window !== "undefined" && Boolean(window.nostr);

  // Other panels (e.g. the agent panel upsell chip) can ask us to open the account view.
  useEffect(() => {
    const open = () => setView(getSession() ? "account" : "login");
    window.addEventListener(OPEN_ACCOUNT_EVENT, open);
    return () => window.removeEventListener(OPEN_ACCOUNT_EVENT, open);
  }, []);

  const finishLogin = useCallback((loggedIn: TellusAccount) => {
    // First successful login: offer to claim the anonymous identity so pre-login worlds stay
    // reachable. The reload (either way) rebinds world list + agent state to the new identity.
    const anon = anonymousUserId();
    if (
      anon &&
      anon !== loggedIn.accountId &&
      !(loggedIn.claimedUserIds ?? []).includes(anon)
    ) {
      setBusyText(null);
      setClaimAccount(loggedIn);
      return;
    }
    window.location.reload();
  }, []);

  const runLogin = useCallback(
    async (status: string, flow: () => Promise<TellusAccount>) => {
      setBusyText(status);
      setError(null);
      try {
        finishLogin(await flow());
      } catch (err) {
        setError(errorMessage(err, "Login failed."));
        setBusyText(null);
      }
    },
    [finishLogin],
  );

  const resolveClaim = useCallback(async (keep: boolean) => {
    if (keep) {
      setBusyText("Claiming your worlds…");
      try {
        await claimAnonymousId();
      } catch {
        /* claim is best-effort — the account login itself already succeeded */
      }
    }
    window.location.reload();
  }, []);

  const runLink = useCallback(async (viaBunkerUri?: string) => {
    setBusyText(
      viaBunkerUri
        ? "Waiting for signer approval…"
        : "Waiting for your Nostr extension…",
    );
    setError(null);
    try {
      await linkNostr(viaBunkerUri);
      setLinkBunkerOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Linking failed."));
    } finally {
      setBusyText(null);
    }
  }, []);

  const addPasskey = useCallback(async () => {
    setBusyText("Touch your authenticator…");
    setError(null);
    try {
      await passkeyRegister(registerLabel.trim() || undefined);
      await authStatus().catch(() => undefined);
      setRegisterLabel("");
    } catch (err) {
      setError(errorMessage(err, "Adding the passkey failed."));
    } finally {
      setBusyText(null);
    }
  }, [registerLabel]);

  const onLogout = useCallback(async () => {
    setBusyText("Signing out…");
    try {
      await logout();
    } finally {
      window.location.reload();
    }
  }, []);

  const close = useCallback(() => {
    setView(null);
    setError(null);
    setBusyText(null);
    setClaimAccount(null);
    setLinkBunkerOpen(false);
  }, []);

  const pendingApproval = (account?.status ?? "").toLowerCase() === "pending";

  return (
    <>
      <button
        type="button"
        className={
          account ? "auth-login-button auth-logged-in" : "auth-login-button"
        }
        title={account ? "Your account" : "Log in"}
        onClick={() => setView(account ? "account" : "login")}
      >
        {account ? accountButtonLabel(account) : "Login"}
      </button>

      {/* Note: stays mounted while `claimAccount` is set — login succeeding flips `account` non-null,
          and the claim confirm must still render before the reload. */}
      {view === "login" && (claimAccount || !account) && (
        <div className="auth-overlay" onClick={close}>
          <div
            className="auth-dialog"
            role="dialog"
            aria-label="Log in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auth-title-row">
              <span className="auth-title">Log in to Tellus</span>
              <button
                type="button"
                className="auth-close"
                onClick={close}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {claimAccount ? (
              <div className="auth-section">
                <span className="auth-section-title">You're in!</span>
                <span className="auth-muted">
                  You also played here before logging in. Keep the worlds and
                  agent tied to this browser's anonymous identity by claiming it
                  onto your account.
                </span>
                <div className="auth-row">
                  <button
                    type="button"
                    className="auth-premium-button"
                    onClick={() => void resolveClaim(true)}
                  >
                    Keep my existing worlds
                  </button>
                  <button
                    type="button"
                    className="auth-small-button"
                    onClick={() => void resolveClaim(false)}
                  >
                    Skip
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="auth-section">
                  <span className="auth-section-title">Developer docs</span>
                  <span className="auth-muted">
                    The MCP guide is public; sign in and activate Premium only
                    when you need a personal token.
                  </span>
                  <McpGuideLink />
                </div>
                <button
                  type="button"
                  className="auth-option"
                  disabled={Boolean(busyText)}
                  onClick={() =>
                    void runLogin("Touch your authenticator…", passkeyLogin)
                  }
                >
                  <strong>Passkey</strong>
                  <small>Sign in with a passkey you already created here</small>
                </button>
                {nip07Available && (
                  <button
                    type="button"
                    className="auth-option"
                    disabled={Boolean(busyText)}
                    onClick={() =>
                      void runLogin(
                        "Waiting for your Nostr extension…",
                        loginNostrNip07,
                      )
                    }
                  >
                    <strong>Nostr extension (NIP-07)</strong>
                    <small>Sign a one-time nonce with window.nostr</small>
                  </button>
                )}
                <div className="auth-option auth-option-static">
                  <strong>Bunker (NIP-46)</strong>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="bunker://…"
                    value={bunkerUri}
                    onChange={(e) => setBunkerUri(e.target.value)}
                    disabled={Boolean(busyText)}
                  />
                  <button
                    type="button"
                    className="auth-small-button"
                    disabled={Boolean(busyText) || !bunkerUri.trim()}
                    onClick={() =>
                      void runLogin("Waiting for signer approval…", () =>
                        loginNostrBunker(bunkerUri),
                      )
                    }
                  >
                    Connect
                  </button>
                </div>
                <div className="auth-option auth-option-static">
                  <strong>Create account with Passkey</strong>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Name (optional)"
                    value={registerLabel}
                    onChange={(e) => setRegisterLabel(e.target.value)}
                    disabled={Boolean(busyText)}
                  />
                  <button
                    type="button"
                    className="auth-small-button"
                    disabled={Boolean(busyText)}
                    onClick={() =>
                      void runLogin("Touch your authenticator…", () =>
                        passkeyRegister(registerLabel.trim() || undefined),
                      )
                    }
                  >
                    Create account
                  </button>
                </div>
              </>
            )}
            {busyText && <span className="auth-status">{busyText}</span>}
            {error && <span className="auth-error">{error}</span>}
          </div>
        </div>
      )}

      {view === "account" && account && (
        <div className="auth-overlay" onClick={close}>
          <div
            className="auth-dialog"
            role="dialog"
            aria-label="Your account"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auth-title-row">
              <span className="auth-title">
                {account.label?.trim() || "Your account"}
              </span>
              <button
                type="button"
                className="auth-close"
                onClick={close}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {pendingApproval && (
              <span className="auth-status">
                Awaiting approval — you can play, but premium purchase is
                locked.
              </span>
            )}
            <div className="auth-section">
              <span className="auth-section-title">Identity</span>
              <span className="auth-kv">
                <span className="auth-muted">id</span>{" "}
                <code>{account.accountId.slice(0, 13)}…</code>
              </span>
              <span className="auth-kv">
                <span className="auth-muted">status</span>{" "}
                {premiumLabel(account)}
              </span>
              {account.nip05 && (
                <span className="auth-kv" title="NIP-05 verified by its domain">
                  <span className="auth-muted">nip-05</span>{" "}
                  <code>✓ {nip05Display(account.nip05)}</code>
                </span>
              )}
              {account.npub ? (
                <span className="auth-kv" title={npubFromHex(account.npub)}>
                  <span className="auth-muted">npub</span>{" "}
                  <code>{shortNpub(npubFromHex(account.npub))}</code>
                </span>
              ) : (
                <div className="auth-row" style={{ flexWrap: "wrap" }}>
                  {nip07Available && (
                    <button
                      type="button"
                      className="auth-small-button"
                      disabled={Boolean(busyText)}
                      onClick={() => void runLink()}
                    >
                      Link your npub (NIP-07)
                    </button>
                  )}
                  <button
                    type="button"
                    className="auth-small-button"
                    disabled={Boolean(busyText)}
                    onClick={() => setLinkBunkerOpen((open) => !open)}
                  >
                    Link via bunker…
                  </button>
                  {linkBunkerOpen && (
                    <>
                      <input
                        type="text"
                        className="auth-input"
                        placeholder="bunker://…"
                        value={bunkerUri}
                        onChange={(e) => setBunkerUri(e.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-small-button"
                        disabled={Boolean(busyText) || !bunkerUri.trim()}
                        onClick={() => void runLink(bunkerUri)}
                      >
                        Link
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="auth-section">
              <span className="auth-section-title">Passkeys</span>
              {(account.passkeys ?? []).length === 0 ? (
                <span className="auth-muted">No passkeys yet.</span>
              ) : (
                (account.passkeys ?? []).map((pk) => (
                  <span key={pk.credentialId} className="auth-kv">
                    <span className="auth-muted">🔑</span>{" "}
                    {pk.label?.trim() || `${pk.credentialId.slice(0, 10)}…`}
                  </span>
                ))
              )}
              <div className="auth-row">
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Label (optional)"
                  value={registerLabel}
                  onChange={(e) => setRegisterLabel(e.target.value)}
                  disabled={Boolean(busyText)}
                />
                <button
                  type="button"
                  className="auth-small-button"
                  disabled={Boolean(busyText)}
                  onClick={() => void addPasskey()}
                >
                  Add passkey
                </button>
              </div>
            </div>
            {!pendingApproval && <PremiumCheckout account={account} />}
            <McpAccessSection account={account} />
            {(account.claimedUserIds ?? []).length > 0 && (
              <div className="auth-section">
                <span className="auth-section-title">Claimed identities</span>
                {(account.claimedUserIds ?? []).map((id) => (
                  <span key={id} className="auth-muted">
                    <code>{id.slice(0, 13)}…</code>
                  </span>
                ))}
              </div>
            )}
            {busyText && <span className="auth-status">{busyText}</span>}
            {error && <span className="auth-error">{error}</span>}
            <button
              type="button"
              className="auth-small-button auth-logout"
              onClick={() => void onLogout()}
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Small gold upsell chip for the agent panel: visible while logged in and not premium. */
export function PremiumUpsellChip(): React.ReactElement | null {
  const account = useTellusAuth();
  if (!account || account.premium) return null;
  return (
    <button
      type="button"
      className="auth-upsell-chip"
      title="Get Premium"
      onClick={openTellusAccountPanel}
    >
      ⚡ Your agent sleeps when you leave — Premium keeps it alive
    </button>
  );
}
