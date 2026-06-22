import { describe, expect, it } from "vitest";
import {
  inferAnimationIntentFromText,
  normalizeAnimationIntent,
  selectAnimationClipByIntent,
} from "./tellus-animation-intents";

describe("tellus animation intents", () => {
  it("normalizes common behavior aliases", () => {
    expect(normalizeAnimationIntent("gallop")).toBe("run");
    expect(normalizeAnimationIntent("Stand-Up")).toBe("stand");
    expect(normalizeAnimationIntent("disembark")).toBe("dismount");
    expect(normalizeAnimationIntent("not-a-known-intent")).toBeNull();
  });

  it("selects animal and mount clips by intent with sensible fallbacks", () => {
    const clips = [
      { name: "Armature|Death" },
      { name: "Horse_Idle" },
      { name: "Horse_Walk" },
      { name: "Horse_Gallop" },
    ];
    const reject = (clip: { name?: string }) => /death/i.test(clip.name ?? "");

    expect(selectAnimationClipByIntent(clips, "run", { actor: "mount", reject })?.name).toBe("Horse_Gallop");
    expect(selectAnimationClipByIntent(clips, "walk", { actor: "mount", reject })?.name).toBe("Horse_Walk");
    expect(selectAnimationClipByIntent(clips, "flap", { actor: "animal", reject })?.name).toBe("Horse_Idle");
  });

  it("finds bird movement before generic idle", () => {
    const clips = [
      { name: "Bird_Idle" },
      { name: "Bird_Wing_Flap" },
      { name: "Bird_Flying_Loop" },
    ];

    expect(selectAnimationClipByIntent(clips, "flap", { actor: "animal" })?.name).toBe("Bird_Wing_Flap");
    expect(selectAnimationClipByIntent(clips, "fly", { actor: "animal" })?.name).toBe("Bird_Flying_Loop");
  });

  it("infers intents from conversational text", () => {
    expect(inferAnimationIntentFromText("Would you like to dance with me?")).toBe("dance");
    expect(inferAnimationIntentFromText("Can the deer graze near the pond?")).toBe("graze");
  });
});
