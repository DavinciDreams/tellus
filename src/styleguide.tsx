/* src/styleguide.tsx
   The living styleguide for the Tellus HUD design system, served at /styleguide.
   Renders the token layer (with REAL computed contrast readouts) and interactive
   demos of every component. Dogfoods the system: the page chrome is built from the
   same design tokens, and the icons are the same lucide set the app HUD uses. */

import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  Building2,
  Check,
  Globe2,
  Map as MapIcon,
  MessageCircle,
  MoreHorizontal,
  Mountain,
  PersonStanding,
  Plane,
  Sparkles,
} from "lucide-react";
import {
  ActionGroup,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  IconButton,
  Panel,
  PresenceDot,
  Tabs,
  Toolbar,
} from "./design-system";
import type { BadgeTone, PresenceStatus } from "./design-system";
import { FirstRunCoach } from "./onboarding/FirstRunCoach";
import "./styleguide.css";

/* ------------------------------------------------------------------ *
 * Contrast helper — resolves --ds-* token strings (hex or the CSS
 * `rgb(r g b / a%)` syntax the tokens use), composites translucent
 * fills over the page backdrop, and reports a real WCAG ratio.
 * ------------------------------------------------------------------ */
interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(input: string): RGBA {
  const s = input.trim();
  if (s.startsWith("#")) {
    let hex = s.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b, a: 1 };
  }
  // rgb(r g b / a%) | rgb(r g b) | rgb(r,g,b,a)
  const body = s.replace(/^rgba?\(/i, "").replace(/\)$/, "");
  const [rgbPart, alphaPart] = body.split("/");
  const nums = rgbPart.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  let a = 1;
  if (alphaPart !== undefined) {
    const t = alphaPart.trim();
    a = t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t);
  } else if (nums.length === 4) {
    a = nums[3];
  }
  return { r: nums[0] ?? 0, g: nums[1] ?? 0, b: nums[2] ?? 0, a };
}

function over(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a + bg.a * (1 - fg.a);
  const blend = (f: number, b: number) =>
    a === 0 ? 0 : (f * fg.a + b * bg.a * (1 - fg.a)) / a;
  return { r: blend(fg.r, bg.r), g: blend(fg.g, bg.g), b: blend(fg.b, bg.b), a };
}

function relLuminance({ r, g, b }: RGBA): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** Contrast of a (possibly translucent) foreground token over a (possibly
 * translucent) surface token, both resolved against the opaque page backdrop. */
function contrast(fgToken: string, surfaceToken: string, backdrop = "#0d2820"): number {
  const base = parseColor(backdrop);
  const surface = over(parseColor(surfaceToken), base);
  const fg = over(parseColor(fgToken), surface);
  const l1 = relLuminance(fg);
  const l2 = relLuminance(surface);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------------ *
 * Token data (mirrors tokens.css — values shown verbatim)
 * ------------------------------------------------------------------ */
const SURFACES = [
  { name: "--ds-bg", value: "rgb(17 47 38 / 84%)" },
  { name: "--ds-bg-soft", value: "rgb(38 76 48 / 86%)" },
  { name: "--ds-bg-strong", value: "rgb(9 34 30 / 94%)" },
  { name: "--ds-input-bg", value: "rgb(6 20 15 / 62%)" },
];
const INK = [
  { name: "--ds-text", value: "#fff2c4" },
  { name: "--ds-muted", value: "#c5c58d" },
  { name: "--ds-gold", value: "#dcbc60" },
  { name: "--ds-gold-bright", value: "#f2d98b" },
  { name: "--ds-green", value: "#b8d37a" },
];
const STATUS = [
  { name: "--ds-success", value: "#65ef8f" },
  { name: "--ds-warn", value: "#f2d98b" },
  { name: "--ds-danger", value: "#ff8f7a" },
];
const SPACING = [
  ["--ds-space-2", 4],
  ["--ds-space-3", 6],
  ["--ds-space-4", 8],
  ["--ds-space-6", 12],
  ["--ds-space-8", 16],
  ["--ds-space-10", 20],
  ["--ds-space-12", 24],
] as const;
const RADII = [
  ["--ds-radius-xs", 4],
  ["--ds-radius-sm", 6],
  ["--ds-radius-md", 8],
  ["--ds-radius-lg", 10],
  ["--ds-radius-xl", 14],
] as const;
const TYPE = [
  ["--ds-text-xs", 12, "Dense labels & readouts (hard floor)"],
  ["--ds-text-md", 14, "Default body — the quick brown fox"],
  ["--ds-text-lg", 15, "Panel titles"],
  ["--ds-text-xl", 17, "Dialog titles (serif accent)"],
  ["--ds-text-2xl", 20, "Section headings"],
  ["--ds-text-display", 30, "Display"],
] as const;
const ZINDEX = [
  ["--z-canvas-ui", 4],
  ["--z-rail", 20],
  ["--z-panel", 30],
  ["--z-panel-raised", 35],
  ["--z-toolbar", 50],
  ["--z-overlay", 70],
  ["--z-modal", 80],
] as const;

const NAV = [
  ["colors", "Color"],
  ["spacing", "Spacing & radii"],
  ["type", "Type"],
  ["z", "Z-index & motion"],
  ["buttons", "Buttons"],
  ["surfaces", "Surfaces"],
  ["forms", "Forms & tabs"],
  ["status", "Status"],
  ["toolbar", "Toolbar"],
  ["overlays", "Overlays"],
  ["onboarding", "Onboarding"],
  ["principles", "Principles"],
] as const;

function ratioBadge(ratio: number, large = false): { tone: BadgeTone; text: string } {
  const threshold = large ? 3 : 4.5;
  const pass = ratio >= threshold;
  return {
    tone: pass ? "success" : "danger",
    text: `${ratio.toFixed(2)}:1 ${pass ? "AA" : "fail"}`,
  };
}

function Section(props: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={props.id} className="sg-section">
      <div className="sg-section__head">
        <h2 className="sg-section__title">{props.title}</h2>
        {props.note ? <p className="sg-section__note">{props.note}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

function StyleGuide() {
  const [tab, setTab] = useState("stated");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState("create");

  const inkContrast = useMemo(
    () => INK.map((c) => ({ ...c, ratio: contrast(c.value, "rgb(17 47 38 / 84%)") })),
    [],
  );

  const tools: Array<{ id: string; label: string; icon: React.ReactNode }> = [
    { id: "create", label: "Create", icon: <Sparkles size={18} /> },
    { id: "buildings", label: "Buildings", icon: <Building2 size={18} /> },
    { id: "chat", label: "Chat", icon: <MessageCircle size={18} /> },
    { id: "travel", label: "Travel", icon: <Plane size={18} /> },
    { id: "world", label: "World", icon: <Globe2 size={18} /> },
    { id: "map", label: "Map", icon: <MapIcon size={18} /> },
    { id: "terrain", label: "Terrain", icon: <Mountain size={18} /> },
    { id: "agent", label: "Agent", icon: <Bot size={18} /> },
    { id: "avatar", label: "Avatar", icon: <PersonStanding size={18} /> },
  ];

  return (
    <div className="ds-scope sg-root">
      <div className="sg-shell">
        <header className="sg-header">
          <div className="sg-monogram" aria-hidden="true">
            T
          </div>
          <div>
            <h1 className="sg-title">Tellus Design System</h1>
            <p className="sg-subtitle">
              The cartographer&rsquo;s field kit — gold-on-forest-green, made consistent &amp; accessible.
            </p>
          </div>
          <div className="sg-header__meta">
            <Badge tone="gold">v1.0</Badge>
            <PresenceDot status="online" showLabel label="Live" />
          </div>
        </header>

        <nav className="sg-nav" aria-label="Styleguide sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>

        {/* ---------------- COLOR ---------------- */}
        <Section
          id="colors"
          title="Color"
          note="Identity preserved from the existing --hud-* set. Contrast measured over --ds-bg on the world backdrop."
        >
          <div className="sg-stack">
            <div>
              <h3 className="sg-section__note" style={{ marginBottom: 8 }}>
                Surfaces
              </h3>
              <div className="sg-grid">
                {SURFACES.map((c) => (
                  <div key={c.name} className="sg-swatch">
                    <div className="sg-swatch__chip" style={{ background: `var(${c.name})` }} />
                    <div className="sg-swatch__meta">
                      <span className="sg-swatch__name">{c.name}</span>
                      <span className="sg-swatch__value">{c.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="sg-section__note" style={{ marginBottom: 8 }}>
                Ink &amp; accent
              </h3>
              <div className="sg-grid">
                {INK.concat(STATUS).map((c) => (
                  <div key={c.name} className="sg-swatch">
                    <div
                      className="sg-swatch__chip"
                      style={{ background: `var(${c.name})` }}
                    />
                    <div className="sg-swatch__meta">
                      <span className="sg-swatch__name">{c.name}</span>
                      <span className="sg-swatch__value">{c.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Panel title="Text contrast on --ds-bg" level="panel">
              <table className="sg-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Sample</th>
                    <th>Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {inkContrast.map((c) => {
                    const b = ratioBadge(c.ratio);
                    return (
                      <tr key={c.name}>
                        <td className="sg-mono">{c.name}</td>
                        <td>
                          <span
                            className="sg-sample"
                            style={{ color: `var(${c.name})`, background: "var(--ds-bg)" }}
                          >
                            The quick brown fox
                          </span>
                        </td>
                        <td>
                          <Badge tone={b.tone}>{b.text}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </div>
        </Section>

        {/* ---------------- SPACING & RADII ---------------- */}
        <Section id="spacing" title="Spacing &amp; radii" note="4px rhythm; 8px is the house radius.">
          <div className="sg-stack">
            {SPACING.map(([name, px]) => (
              <div key={name} className="sg-spec">
                <span className="sg-spec__label">
                  {name} · {px}px
                </span>
                <div className="sg-spacing-bar" style={{ width: px * 4 }} />
              </div>
            ))}
            <div className="sg-row" style={{ marginTop: 8 }}>
              {RADII.map(([name, px]) => (
                <div key={name} className="sg-stack" style={{ gap: 6, alignItems: "center" }}>
                  <div className="sg-radius-box" style={{ borderRadius: px }} />
                  <span className="sg-spec__label" style={{ minWidth: 0 }}>
                    {px}px
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ---------------- TYPE ---------------- */}
        <Section id="type" title="Type" note="Inter for UI, a serif accent for dialog titles. Hard floor 12px.">
          <Panel level="panel">
            <div className="sg-stack">
              {TYPE.map(([name, px, sample]) => (
                <div key={name} className="sg-type-row">
                  <span className="sg-spec__label">
                    {name} · {px}px
                  </span>
                  <span style={{ fontSize: px, fontWeight: 700 }}>{sample}</span>
                </div>
              ))}
            </div>
          </Panel>
        </Section>

        {/* ---------------- Z-INDEX & MOTION ---------------- */}
        <Section id="z" title="Z-index &amp; motion" note="Semantic layers (reused --z-* names). Calm ease-out with a reduced-motion path.">
          <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Panel title="Layers" level="panel">
              <table className="sg-table">
                <tbody>
                  {ZINDEX.map(([name, v]) => (
                    <tr key={name}>
                      <td className="sg-mono">{name}</td>
                      <td style={{ textAlign: "right" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Motion" level="panel">
              <p className="sg-props">
                <b>--ds-duration-base</b> 160ms{"\n"}
                <b>--ds-ease-out</b> cubic-bezier(0.22, 1, 0.36, 1){"\n"}
                <b>--ds-transition</b> base × ease-out
              </p>
              <p className="sg-section__note">
                Hover a button below to feel the house transition. Under{" "}
                <span className="sg-mono">prefers-reduced-motion</span> all durations collapse to ~0.
              </p>
            </Panel>
          </div>
        </Section>

        {/* ---------------- BUTTONS ---------------- */}
        <Section id="buttons" title="Buttons" note="Replaces .toolbelt-button, .world-action-button, .auth-small-button, .agent-tab-send, …">
          <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="sg-demo">
              <span className="sg-demo__label">Button — variants</span>
              <div className="sg-demo__stage">
                <Button variant="primary" leadingIcon={<Sparkles size={16} />}>
                  Create
                </Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Delete</Button>
              </div>
              <div className="sg-demo__stage">
                <Button variant="primary" size="sm">
                  Small
                </Button>
                <Button variant="secondary" loading>
                  Working
                </Button>
                <Button variant="secondary" selected>
                  Selected
                </Button>
                <Button variant="secondary" disabled>
                  Disabled
                </Button>
              </div>
              <p className="sg-props">
                <b>variant</b> primary | secondary | ghost | danger{"\n"}
                <b>size</b> sm | md · <b>loading</b> · <b>selected</b> · <b>leadingIcon</b>/<b>trailingIcon</b>
              </p>
            </div>

            <div className="sg-demo">
              <span className="sg-demo__label">IconButton — aria-label required</span>
              <div className="sg-demo__stage">
                <IconButton aria-label="Create" variant="primary" icon={<Sparkles size={18} />} />
                <IconButton aria-label="Map" icon={<MapIcon size={18} />} />
                <IconButton aria-label="Chat" variant="ghost" icon={<MessageCircle size={18} />} />
                <IconButton aria-label="More" shape="round" icon={<MoreHorizontal size={18} />} />
                <IconButton aria-label="Delete" variant="danger" icon={<Building2 size={18} />} />
              </div>
              <p className="sg-props">
                <b>aria-label</b> string (required){"\n"}
                <b>variant</b> · <b>size</b> · <b>shape</b> square | round · <b>selected</b>
              </p>
            </div>
          </div>
        </Section>

        {/* ---------------- SURFACES ---------------- */}
        <Section id="surfaces" title="Surfaces" note="Panels; glass is opt-in (deliberate over the live scene).">
          <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Panel level="canvas" title="Canvas">
              <p className="sg-section__note">Lowest elevation — inline over the world.</p>
            </Panel>
            <Panel
              level="panel"
              title="Panel"
              headerActions={<IconButton aria-label="Options" variant="ghost" size="sm" icon={<MoreHorizontal size={16} />} />}
            >
              <p className="sg-section__note">Default surface with a header actions slot.</p>
            </Panel>
            <Panel level="raised" glass title="Raised · glass">
              <p className="sg-section__note">Highest elevation, backdrop blur on.</p>
            </Panel>
          </div>
        </Section>

        {/* ---------------- FORMS & TABS ---------------- */}
        <Section id="forms" title="Forms &amp; tabs">
          <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Panel level="panel" title="Fields">
              <div className="sg-stack">
                <Field id="sg-world" label="World name" placeholder="Stars at Night" hint="Shown to everyone who visits." />
                <Field id="sg-prompt" as="textarea" label="Describe what to create" placeholder="a crooked apple tree with golden moss…" />
                <Field id="sg-biome" as="select" label="Biome">
                  <option>Meadow</option>
                  <option>Dunes</option>
                  <option>Alpine</option>
                </Field>
                <Field id="sg-portal" label="Portal code" defaultValue="xx" error="Must be at least 3 characters." />
              </div>
            </Panel>
            <Panel level="panel" title="Tabs">
              <Tabs
                aria-label="Evidence view"
                items={[
                  { id: "stated", label: "Stated" },
                  { id: "interpreted", label: "Interpreted" },
                  { id: "sources", label: "Sources" },
                  { id: "archived", label: "Archived", disabled: true },
                ]}
                value={tab}
                onChange={setTab}
              >
                {(active) => (
                  <p className="sg-section__note">
                    Showing <b style={{ color: "var(--ds-text)" }}>{active}</b> — arrow keys move between tabs.
                  </p>
                )}
              </Tabs>
            </Panel>
          </div>
        </Section>

        {/* ---------------- STATUS ---------------- */}
        <Section id="status" title="Status" note="Badges are sentence-case (never uppercase eyebrows). Presence carries a non-color affordance.">
          <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="sg-demo">
              <span className="sg-demo__label">Badge — tones</span>
              <div className="sg-demo__stage">
                {(["neutral", "gold", "success", "warn", "danger"] as BadgeTone[]).map((t) => (
                  <Badge key={t} tone={t}>
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="sg-demo">
              <span className="sg-demo__label">PresenceDot — shape + label, not color alone</span>
              <div className="sg-demo__stage">
                {(["online", "idle", "busy", "offline", "error"] as PresenceStatus[]).map((s) => (
                  <PresenceDot key={s} status={s} showLabel />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------- TOOLBAR ---------------- */}
        <Section id="toolbar" title="Toolbar" note="One emphasized primary + a secondary group + an overflow affordance — the hierarchy the HUD lacked.">
          <div className="sg-worldstrip">
            <Panel level="raised" glass padded={false} style={{ padding: "10px 12px" }}>
              <Toolbar
                aria-label="World tools"
                primary={
                  <Button variant="primary" leadingIcon={<Sparkles size={16} />}>
                    Create
                  </Button>
                }
                overflow={<IconButton aria-label="More tools" variant="ghost" icon={<MoreHorizontal size={18} />} />}
              >
                <ActionGroup gap="sm">
                  {tools.slice(1, 7).map((t) => (
                    <IconButton
                      key={t.id}
                      aria-label={t.label}
                      variant="ghost"
                      icon={t.icon}
                      selected={selectedTool === t.id}
                      onClick={() => setSelectedTool(t.id)}
                    />
                  ))}
                </ActionGroup>
              </Toolbar>
            </Panel>
          </div>
        </Section>

        {/* ---------------- OVERLAYS ---------------- */}
        <Section id="overlays" title="Overlays" note="Styled in-HUD dialogs replace the native window.confirm / alert / prompt that broke immersion.">
          <div className="sg-row">
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Delete world…
            </Button>
          </div>

          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Generate an asset"
            footer={
              <>
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>
                  Generate
                </Button>
              </>
            }
          >
            <Field id="sg-dialog-prompt" as="textarea" label="Prompt" placeholder="a mossy standing stone with carved runes…" />
          </Dialog>

          <ConfirmDialog
            open={confirmOpen}
            title="Delete this world?"
            message="This removes the world and everything built in it. This can't be undone."
            confirmLabel="Delete world"
            danger
            onConfirm={() => setConfirmOpen(false)}
            onCancel={() => setConfirmOpen(false)}
          />
        </Section>

        {/* ---------------- ONBOARDING ---------------- */}
        <Section
          id="onboarding"
          title="Onboarding"
          note="First-run coach (P0 fix): teaches movement + points at Create. Shows once, gated on a localStorage flag."
        >
          <div className="sg-row">
            <Button variant="primary" onClick={() => setCoachOpen(true)}>
              Preview the first-run coach
            </Button>
            <span className="sg-section__note">
              In the app it appears once on a new visitor&rsquo;s first world, dismissible with the
              button or Esc.
            </span>
          </div>
          {coachOpen ? <FirstRunCoach forceOpen onDismiss={() => setCoachOpen(false)} /> : null}
        </Section>

        {/* ---------------- PRINCIPLES ---------------- */}
        <Section id="principles" title="Principles" note="What every component in this system upholds.">
          <Panel level="panel">
            <ul className="sg-check">
              {[
                "Identity preserved — every color aliases the existing --hud-* set, never a new palette.",
                "Full borders only — no side-stripe accent borders anywhere.",
                "Sentence-case labels — no tracked-uppercase eyebrows stamped on every element.",
                "Deliberate glass — backdrop-filter is opt-in (Panel glass prop), not a default.",
                "Visible focus — one --ds-focus-ring on every interactive element via :focus-visible.",
                "No color-only meaning — status carries shape + text, not just a green dot.",
                "Reduced-motion honoured — durations collapse under prefers-reduced-motion.",
                "One vocabulary — Button/IconButton replace 8+ legacy button classes.",
              ].map((line) => (
                <li key={line}>
                  <Check size={16} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>

        <footer className="sg-foot">
          Tellus Design System · src/design-system · rendered live at /styleguide
        </footer>
      </div>
    </div>
  );
}

const container = document.getElementById("styleguide-root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <StyleGuide />
    </React.StrictMode>,
  );
}
