/* src/styleguide.tsx
   The living styleguide for the Tellus HUD design system, served at /styleguide.
   Renders the token layer (with REAL computed contrast readouts) and interactive
   demos of every component. Dogfoods the system: the page chrome is built from the
   same design tokens, and the icons are the same lucide set the app HUD uses. */

import React, { useMemo, useRef, useState } from "react";
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
  useDialogs,
  Toggle,
  Checkbox,
  RadioGroup,
  Radio,
  Slider,
  Segmented,
  Card,
  Tooltip,
  Menu,
  MenuItem,
  MenuSeparator,
  useToasts,
  Progress,
  Spinner,
  Skeleton,
  EmptyState,
  RadialMenu,
  Dock,
  PresenceRoster,
  Avatar,
  AgentCard,
  GenerationCard,
  PortalCard,
  AssetTile,
  ChatThread,
  Sheet,
  Popover,
  InlineAlert,
} from "./design-system";
import type { BadgeTone, PresenceStatus, PresenceBeing, ChatMessage, GenerationCardStatus } from "./design-system";
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
  ["controls", "Controls"],
  ["cards", "Cards"],
  ["menus", "Menus & tips"],
  ["feedback", "Feedback"],
  ["fieldkit", "Field Kit"],
  ["world", "World layer"],
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
  const [dialogResult, setDialogResult] = useState<string>("");
  const { askConfirm, askPrompt, dialogs } = useDialogs();
  const { toast, viewport: toastViewport } = useToasts();
  const [toggleOn, setToggleOn] = useState(true);
  const [checkboxOn, setCheckboxOn] = useState(true);
  const [radioVal, setRadioVal] = useState("meadow");
  const [sliderVal, setSliderVal] = useState(48);
  const [segVal, setSegVal] = useState("stated");
  const [radialOpen, setRadialOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dockActive, setDockActive] = useState("create");
  const [selectedAsset, setSelectedAsset] = useState("moss-stone");
  const [genStatus, setGenStatus] = useState<GenerationCardStatus>("generating");
  const [chatLog, setChatLog] = useState<ChatMessage[]>([
    { id: "m1", author: "Willow", kind: "human", text: "who else is here?", time: "14:02" },
    { id: "m2", author: "Omega", kind: "agent", text: "I'm shaping a birch grove near the north ridge. Come look.", time: "14:02" },
    { id: "m3", author: "You", kind: "you", text: "on my way", time: "14:03" },
  ]);
  const chatSeq = useRef(3);

  const beings: PresenceBeing[] = [
    { id: "b1", name: "Willow", kind: "human", status: "online", activity: "exploring the north ridge" },
    { id: "b2", name: "Omega", kind: "agent", status: "busy", activity: "weaving a birch grove" },
    { id: "b3", name: "Cartographer", kind: "agent", status: "idle", activity: "waiting for a request" },
    { id: "b4", name: "Jun", kind: "human", status: "offline", activity: "last seen 2h ago" },
  ];

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

          <Panel level="panel" title="Promise-based dialogs (useDialogs)" style={{ marginTop: 20 }}>
            <p className="sg-section__note">
              <code className="sg-mono">await askConfirm()</code> /{" "}
              <code className="sg-mono">askPrompt()</code> replace native{" "}
              <code className="sg-mono">window.confirm</code> /{" "}
              <code className="sg-mono">window.prompt</code> with styled in-HUD dialogs.
            </p>
            <div className="sg-row">
              <Button
                variant="danger"
                onClick={async () => {
                  const ok = await askConfirm({
                    title: "Delete portal?",
                    message: "Delete portal Starfall Gate?",
                    confirmLabel: "Delete",
                    danger: true,
                  });
                  setDialogResult(`askConfirm → ${ok}`);
                }}
              >
                askConfirm
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  const name = await askPrompt({
                    title: "Rename world",
                    label: "World name",
                    defaultValue: "Stars at Night",
                    maxLength: 64,
                  });
                  setDialogResult(name === null ? "askPrompt → cancelled" : `askPrompt → ${name}`);
                }}
              >
                askPrompt
              </Button>
              {dialogResult ? <Badge tone="gold">{dialogResult}</Badge> : null}
            </div>
          </Panel>
        </Section>

        {/* ---------------- CONTROLS ---------------- */}
        <Section id="controls" title="Controls" note="Form controls — every one keyboard-operable, focus-visible, and label-associated.">
          <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="sg-demo">
              <span className="sg-demo__label">Toggle · Checkbox</span>
              <div className="sg-stack">
                <Toggle checked={toggleOn} onChange={setToggleOn} label="Keep my agent active while I'm away" />
                <Toggle checked={!toggleOn} onChange={(v) => setToggleOn(!v)} label="Ambient world sounds" size="sm" />
                <Checkbox checked={checkboxOn} onChange={setCheckboxOn} label="Show contradictions inline" />
                <Checkbox checked={false} onChange={() => {}} indeterminate label="Include archived worlds" />
                <Checkbox checked={false} onChange={() => {}} disabled label="Disabled option" />
              </div>
            </div>
            <div className="sg-demo">
              <span className="sg-demo__label">Radio group</span>
              <RadioGroup aria-label="Starting biome" value={radioVal} onChange={setRadioVal}>
                <Radio value="meadow" label="Meadow" />
                <Radio value="dunes" label="Dunes" />
                <Radio value="alpine" label="Alpine" />
                <Radio value="wetland" label="Wetland (coming soon)" disabled />
              </RadioGroup>
            </div>
            <div className="sg-demo">
              <span className="sg-demo__label">Slider</span>
              <Slider label="Terrain roughness" value={sliderVal} onChange={setSliderVal} showValue formatValue={(v) => `${v}%`} />
              <Slider label="Time of day" value={100 - sliderVal} onChange={(v) => setSliderVal(100 - v)} min={0} max={100} showValue />
            </div>
            <div className="sg-demo">
              <span className="sg-demo__label">Segmented</span>
              <Segmented
                aria-label="Evidence view"
                value={segVal}
                onChange={setSegVal}
                options={[
                  { value: "stated", label: "Stated" },
                  { value: "interpreted", label: "Interpreted" },
                  { value: "all", label: "All" },
                ]}
              />
              <span className="sg-section__note">Selected: <b style={{ color: "var(--ds-text)" }}>{segVal}</b> — arrow keys move between segments.</span>
            </div>
          </div>
        </Section>

        {/* ---------------- CARDS ---------------- */}
        <Section id="cards" title="Cards" note="Content surfaces (a world, an asset, a being) — distinct from Panel, which is chrome.">
          <div className="sg-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <Card
              title="Stars at Night"
              headerActions={<Badge tone="success">live</Badge>}
              footer={<span className="sg-section__note">3 here · 128 assets</span>}
            >
              <p className="sg-section__note">A chunked world at golden hour. Two agents currently weaving.</p>
            </Card>
            <Card interactive title="+ New world" onClick={() => toast({ message: "Would open the world creator.", tone: "neutral" })}>
              <p className="sg-section__note">An interactive card — hover, then click (fires a toast).</p>
            </Card>
            <Card title="Crooked apple tree" footer={<Button size="sm" variant="ghost">Place</Button>}>
              <p className="sg-section__note">Generated asset · golden moss · 4.2k tris.</p>
            </Card>
          </div>
        </Section>

        {/* ---------------- MENUS & TIPS ---------------- */}
        <Section id="menus" title="Menus &amp; tips" note="Dropdown menu (roving-focus, Esc, click-outside) and hover/focus tooltips.">
          <div className="sg-row">
            <Menu
              aria-label="World actions"
              trigger="World actions ▾"
            >
              <MenuItem icon={<Sparkles size={15} />} onSelect={() => toast({ message: "Renaming…", tone: "neutral" })}>Rename world</MenuItem>
              <MenuItem icon={<MapIcon size={15} />} onSelect={() => toast({ message: "Sharing…", tone: "info" })}>Share link</MenuItem>
              <MenuSeparator />
              <MenuItem danger onSelect={() => toast({ message: "Deleted.", tone: "danger" })}>Delete world</MenuItem>
            </Menu>
            <Tooltip content="Speak an object into being">
              <Button variant="primary" leadingIcon={<Sparkles size={16} />}>Create</Button>
            </Tooltip>
            <Tooltip content="Map (M)" placement="bottom">
              <IconButton aria-label="Map" icon={<MapIcon size={18} />} />
            </Tooltip>
            <Tooltip content="Move (V)" placement="right">
              <IconButton aria-label="Move" icon={<MoreHorizontal size={18} />} />
            </Tooltip>
          </div>
        </Section>

        {/* ---------------- FEEDBACK ---------------- */}
        <Section id="feedback" title="Feedback" note="Toasts, progress, spinners, skeletons, and empty states.">
          <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="sg-demo">
              <span className="sg-demo__label">Toast — fire a notification</span>
              <div className="sg-row">
                <Button variant="secondary" onClick={() => toast({ title: "Saved", message: "Your world was saved.", tone: "success" })}>Success</Button>
                <Button variant="secondary" onClick={() => toast({ title: "Heads up", message: "You're near the portal limit.", tone: "warn" })}>Warn</Button>
                <Button variant="secondary" onClick={() => toast({ title: "Couldn't reach the world", message: "Retrying…", tone: "danger" })}>Danger</Button>
                <Button variant="secondary" onClick={() => toast({ message: "An agent joined the world.", tone: "info" })}>Info</Button>
              </div>
            </div>
            <div className="sg-demo">
              <span className="sg-demo__label">Progress · Spinner</span>
              <Progress value={sliderVal} showValue label="Generating" />
              <Progress tone="success" value={100} label="Complete" showValue />
              <Progress label="Weaving terrain" />
              <div className="sg-row" style={{ alignItems: "center" }}>
                <Spinner size="sm" /> <Spinner size="md" /> <Spinner size="lg" />
              </div>
            </div>
            <div className="sg-demo">
              <span className="sg-demo__label">Skeleton — loading placeholder</span>
              <div className="sg-row" style={{ alignItems: "flex-start" }}>
                <Skeleton variant="circle" width={44} height={44} />
                <div className="sg-stack" style={{ flex: 1, gap: 8 }}>
                  <Skeleton variant="text" width="70%" />
                  <Skeleton variant="text" lines={2} />
                </div>
              </div>
              <Skeleton variant="block" height={64} />
            </div>
            <div className="sg-demo">
              <span className="sg-demo__label">Empty state</span>
              <EmptyState
                icon={<Sparkles size={24} />}
                title="Nothing here yet"
                description="This world is a blank slate. Describe something and watch it appear."
                action={<Button variant="primary" leadingIcon={<Sparkles size={16} />}>Create the first thing</Button>}
              />
            </div>
          </div>
        </Section>

        {/* ---------------- NAV & OVERLAYS (Field Kit) ---------------- */}
        <Section
          id="fieldkit"
          title="Field Kit &amp; navigation"
          note="The reimagined command surface: a radial menu that opens under the cursor, a dock with real hierarchy, drawers, popovers, and inline messages — the chrome recedes so the world leads."
        >
          <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="sg-demo">
              <span className="sg-demo__label">Radial menu — the Field Kit</span>
              <span className="sg-section__note">
                Opens where you are, not on a fixed toolbar. Arrow keys orbit the ring; Enter acts; Esc closes.
              </span>
              <div className="sg-row">
                <Button variant="primary" leadingIcon={<Sparkles size={16} />} onClick={() => setRadialOpen(true)}>
                  Open the Field Kit
                </Button>
              </div>
              <RadialMenu
                open={radialOpen}
                onClose={() => setRadialOpen(false)}
                centerIcon={<Sparkles size={20} />}
                aria-label="Field kit"
                items={[
                  { id: "create", label: "Create", icon: <Sparkles size={18} />, onSelect: () => toast({ message: "Create", tone: "info" }) },
                  { id: "shape", label: "Shape", icon: <Mountain size={18} />, onSelect: () => toast({ message: "Shape terrain", tone: "info" }) },
                  { id: "build", label: "Build", icon: <Building2 size={18} />, onSelect: () => toast({ message: "Build", tone: "info" }) },
                  { id: "connect", label: "Connect", icon: <MessageCircle size={18} />, onSelect: () => toast({ message: "Connect", tone: "info" }) },
                  { id: "travel", label: "Travel", icon: <Plane size={18} />, onSelect: () => toast({ message: "Travel", tone: "info" }) },
                  { id: "map", label: "Map", icon: <MapIcon size={18} />, onSelect: () => toast({ message: "Map", tone: "info" }) },
                ]}
              />
            </div>

            <div className="sg-demo">
              <span className="sg-demo__label">Dock — one primary, a secondary group</span>
              <Dock
                aria-label="World actions"
                items={[
                  { id: "create", label: "Create", icon: <Sparkles size={18} />, primary: true, onSelect: () => setDockActive("create") },
                  { id: "shape", label: "Shape", icon: <Mountain size={18} />, active: dockActive === "shape", onSelect: () => setDockActive("shape") },
                  { id: "chat", label: "Chat", icon: <MessageCircle size={18} />, active: dockActive === "chat", badge: 3, onSelect: () => setDockActive("chat") },
                  { id: "travel", label: "Travel", icon: <Plane size={18} />, active: dockActive === "travel", onSelect: () => setDockActive("travel") },
                  { id: "map", label: "Map", icon: <MapIcon size={18} />, active: dockActive === "map", onSelect: () => setDockActive("map") },
                ]}
              />
            </div>

            <div className="sg-demo">
              <span className="sg-demo__label">Drawer &middot; popover</span>
              <div className="sg-row">
                <Button variant="secondary" onClick={() => setSheetOpen(true)}>Open a drawer</Button>
                <Popover
                  aria-label="World settings"
                  trigger={<span>Popover</span>}
                >
                  <div className="sg-stack" style={{ gap: 8, minWidth: 200 }}>
                    <strong>Quick settings</strong>
                    <Toggle checked={toggleOn} onChange={setToggleOn} label="Show other players" />
                    <Toggle checked={checkboxOn} onChange={setCheckboxOn} label="Ambient sound" />
                  </div>
                </Popover>
              </div>
              <Sheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                side="right"
                title="World settings"
                footer={<Button variant="primary" onClick={() => setSheetOpen(false)}>Done</Button>}
              >
                <div className="sg-stack" style={{ gap: 12 }}>
                  <Field id="sg-sheet-name" label="World name" defaultValue="Stars at Night" />
                  <Field id="sg-sheet-biome" as="select" label="Biome" defaultValue="meadow">
                    <option value="meadow">Meadow</option>
                    <option value="forest">Forest</option>
                    <option value="desert">Desert</option>
                  </Field>
                  <Toggle checked={toggleOn} onChange={setToggleOn} label="Let visitors build" />
                </div>
              </Sheet>
            </div>

            <div className="sg-demo">
              <span className="sg-demo__label">Inline alert — full borders, tone icon, never a side-stripe</span>
              <div className="sg-stack" style={{ gap: 8 }}>
                <InlineAlert tone="info" title="An agent joined">Omega is now in this world.</InlineAlert>
                <InlineAlert tone="success">Your world was saved.</InlineAlert>
                <InlineAlert tone="warn" title="Near the portal limit">You can place 2 more portals.</InlineAlert>
                <InlineAlert tone="danger" title="Couldn't reach the world" onDismiss={() => undefined}>
                  We&rsquo;ll keep retrying in the background.
                </InlineAlert>
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------- THE WORLD LAYER ---------------- */}
        <Section
          id="world"
          title="The world layer"
          note="The components no control panel has — presence, agents, creation, portals, chat. This is where Tellus stops feeling like software and starts feeling like a place."
        >
          <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="sg-demo">
              <span className="sg-demo__label">Presence roster — who is here now</span>
              <PresenceRoster beings={beings} onSelect={(id) => toast({ message: `Focus ${id}`, tone: "info" })} />
            </div>

            <div className="sg-demo">
              <span className="sg-demo__label">Agent card &middot; avatars</span>
              <AgentCard
                name="Omega"
                status="busy"
                activity="weaving a birch grove near the north ridge"
                description="A resident agent. Builds, explores, and answers when spoken to."
                actions={<><Button size="sm" variant="secondary">Watch</Button><Button size="sm" variant="ghost">Message</Button></>}
              />
              <div className="sg-row" style={{ alignItems: "center", marginTop: 12 }}>
                <Avatar name="Willow" kind="human" status="online" />
                <Avatar name="Jun" kind="human" size="sm" status="offline" />
                <Avatar kind="agent" status="busy" />
                <Avatar kind="agent" size="lg" name="Omega" />
              </div>
            </div>

            <div className="sg-demo">
              <span className="sg-demo__label">Creation bloom — describe &rarr; bloom &rarr; place</span>
              <div className="sg-row" style={{ marginBottom: 8 }}>
                <Segmented
                  value={genStatus}
                  onChange={(v) => setGenStatus(v as GenerationCardStatus)}
                  options={[
                    { value: "generating", label: "Generating" },
                    { value: "ready", label: "Ready" },
                    { value: "failed", label: "Failed" },
                  ]}
                  aria-label="Generation state"
                />
              </div>
              <GenerationCard
                prompt="a crooked apple tree with golden moss"
                status={genStatus}
                variants={
                  <div className="sg-row">
                    <AssetTile name="Variant A" meta="3.1k tris" selected={selectedAsset === "a"} onClick={() => setSelectedAsset("a")} />
                    <AssetTile name="Variant B" meta="4.2k tris" selected={selectedAsset === "b"} onClick={() => setSelectedAsset("b")} />
                  </div>
                }
                onPlace={() => toast({ title: "Placed", message: "Your creation is in the world.", tone: "success" })}
                onDiscard={() => toast({ message: "Discarded.", tone: "info" })}
                onRetry={() => setGenStatus("generating")}
              />
            </div>

            <div className="sg-demo">
              <span className="sg-demo__label">Asset library &middot; portals</span>
              <div className="sg-row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <AssetTile name="Moss stone" meta="2.4k tris" selected={selectedAsset === "moss-stone"} onClick={() => setSelectedAsset("moss-stone")} />
                <AssetTile name="Birch" meta="5.0k tris" selected={selectedAsset === "birch"} onClick={() => setSelectedAsset("birch")} />
                <AssetTile name="Lantern" meta="1.1k tris" selected={selectedAsset === "lantern"} onClick={() => setSelectedAsset("lantern")} />
              </div>
              <PortalCard
                label="North ridge gate"
                targetWorld="Stars at Night"
                coords="64, 0, -128"
                onTravel={() => toast({ message: "Travelling…", tone: "info" })}
                onDelete={() => toast({ message: "Portal removed.", tone: "info" })}
              />
            </div>

            <div className="sg-demo" style={{ gridColumn: "1 / -1" }}>
              <span className="sg-demo__label">Chat — humans &amp; agents share one thread</span>
              <div style={{ height: 280, maxWidth: 520 }}>
                <ChatThread
                  messages={chatLog}
                  placeholder="Say something to the world…"
                  onSend={(text) => {
                    chatSeq.current += 1;
                    setChatLog((log) => [
                      ...log,
                      { id: `m${chatSeq.current}`, author: "You", kind: "you", text },
                    ]);
                  }}
                />
              </div>
            </div>
          </div>
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
      {dialogs}
      {toastViewport}
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
