export const animationIntents = [
  "idle",
  "walk",
  "run",
  "fly",
  "swim",
  "flap",
  "dance",
  "wave",
  "throw",
  "jump",
  "sit",
  "stand",
  "graze",
  "attack",
  "mount",
  "dismount",
] as const;

export type AnimationIntent = (typeof animationIntents)[number];

export type AnimationActorKind =
  | "avatar"
  | "agent"
  | "animal"
  | "mount"
  | "vehicle"
  | "object";

export interface NamedAnimationClip {
  name?: string;
}

const intentAliases: Record<string, AnimationIntent> = {
  idle: "idle",
  rest: "idle",
  stand: "stand",
  "stand up": "stand",
  standing: "stand",
  wait: "idle",
  waiting: "idle",
  walk: "walk",
  walking: "walk",
  stroll: "walk",
  trot: "walk",
  run: "run",
  running: "run",
  gallop: "run",
  canter: "run",
  fly: "fly",
  flying: "fly",
  glide: "fly",
  hover: "fly",
  swim: "swim",
  swimming: "swim",
  paddle: "swim",
  float: "swim",
  flap: "flap",
  flapping: "flap",
  wing: "flap",
  wings: "flap",
  dance: "dance",
  dancing: "dance",
  groove: "dance",
  wave: "wave",
  greet: "wave",
  hello: "wave",
  throw: "throw",
  toss: "throw",
  hurl: "throw",
  pitch: "throw",
  jump: "jump",
  hop: "jump",
  leap: "jump",
  sit: "sit",
  sitting: "sit",
  seated: "sit",
  graze: "graze",
  grazing: "graze",
  eat: "graze",
  eating: "graze",
  attack: "attack",
  bite: "attack",
  kick: "attack",
  mount: "mount",
  ride: "mount",
  board: "mount",
  dismount: "dismount",
  unmount: "dismount",
  disembark: "dismount",
};

const intentSearchTerms: Record<AnimationIntent, readonly string[]> = {
  idle: ["idle", "stand", "breath", "look"],
  stand: ["stand", "standing", "idle"],
  walk: ["walk", "walking", "trot", "locomotion"],
  run: ["run", "running", "gallop", "canter", "sprint"],
  fly: ["fly", "flying", "glide", "hover", "soar"],
  swim: ["swim", "swimming", "paddle", "float"],
  flap: ["flap", "flapping", "wing", "wings", "fly", "flying"],
  dance: ["dance", "dancing", "ballet", "hip hop", "breakdance", "flair", "uprock", "groove"],
  wave: ["wave", "greet", "hello", "beckon", "gesture"],
  throw: ["throw", "toss", "hurl", "pitch", "baseball", "basketball"],
  jump: ["jump", "hop", "leap"],
  sit: ["sit", "sitting", "seated"],
  graze: ["graze", "grazing", "eat", "eating", "nibble"],
  attack: ["attack", "bite", "kick", "slash", "punch"],
  mount: ["mount", "ride", "board", "climb"],
  dismount: ["dismount", "unmount", "disembark", "stand"],
};

const actorIntentPreference: Partial<Record<AnimationActorKind, Partial<Record<AnimationIntent, readonly AnimationIntent[]>>>> = {
  animal: {
    idle: ["idle", "graze", "stand", "walk"],
    walk: ["walk", "run", "fly", "swim", "idle"],
    run: ["run", "walk", "fly", "swim", "idle"],
    fly: ["fly", "flap", "walk", "idle"],
    flap: ["flap", "fly", "idle"],
  },
  mount: {
    idle: ["idle", "stand", "graze", "walk"],
    walk: ["walk", "run", "idle"],
    run: ["run", "walk", "idle"],
    fly: ["fly", "flap", "run", "walk"],
    swim: ["swim", "walk", "idle"],
  },
  vehicle: {
    idle: ["idle", "stand"],
    walk: ["walk", "run", "fly", "swim", "idle"],
    run: ["run", "walk", "fly", "swim", "idle"],
    fly: ["fly", "run", "idle"],
    swim: ["swim", "walk", "idle"],
  },
};

export function normalizeAnimationIntent(value: unknown): AnimationIntent | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return null;
  return intentAliases[normalized] ?? null;
}

export function animationIntentTerms(intent: AnimationIntent): readonly string[] {
  return intentSearchTerms[intent];
}

export function animationIntentSequence(
  intent: AnimationIntent,
  actor: AnimationActorKind = "object",
): readonly AnimationIntent[] {
  return actorIntentPreference[actor]?.[intent] ?? [intent];
}

export function animationClipNameMatches(name: string | undefined, terms: readonly string[]): boolean {
  const normalized = (name ?? "").toLowerCase().replace(/[_-]+/g, " ");
  return terms.some((term) => normalized.includes(term));
}

export function selectAnimationClipByIntent<T extends NamedAnimationClip>(
  clips: readonly T[],
  intent: AnimationIntent,
  options: {
    actor?: AnimationActorKind;
    reject?: (clip: T) => boolean;
  } = {},
): T | undefined {
  const usable = clips.filter((clip) => !options.reject?.(clip));
  if (usable.length === 0) return undefined;
  for (const candidateIntent of animationIntentSequence(intent, options.actor)) {
    const terms = animationIntentTerms(candidateIntent);
    const match = usable.find((clip) => animationClipNameMatches(clip.name, terms));
    if (match) return match;
  }
  return usable[0];
}

export function inferAnimationIntentFromText(text: string): AnimationIntent | null {
  const normalized = text.toLowerCase();
  for (const [alias, intent] of Object.entries(intentAliases)) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalized)) {
      return intent;
    }
  }
  return null;
}
