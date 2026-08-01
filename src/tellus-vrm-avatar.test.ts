import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { LocomotionAvatarRig, stripMountedRootTranslation } from "./tellus-vrm-avatar";

class TestAvatarRig extends LocomotionAvatarRig {
  readonly idleAction: THREE.AnimationAction;
  readonly sittingAction?: THREE.AnimationAction;

  constructor(withSitting: boolean) {
    const root = new THREE.Group();
    const mixer = new THREE.AnimationMixer(root);
    super(root, mixer);
    this.idleAction = mixer.clipAction(new THREE.AnimationClip("idle", 1, []));
    this.actions.idle = this.idleAction;
    if (withSitting) {
      this.sittingAction = mixer.clipAction(new THREE.AnimationClip("Sitting", 1, []));
    }
    this.play("idle", 0);
  }

  protected override resolveEmoteAction(name: string): THREE.AnimationAction | undefined {
    if (/^(sitting|sit|seated)$/i.test(name)) return this.sittingAction;
    return super.resolveEmoteAction(name);
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}

describe("mounted avatar locomotion", () => {
  it("keeps seated limb animation while removing duplicate hips translation", () => {
    const clip = new THREE.AnimationClip("Sitting", 1, [
      new THREE.VectorKeyframeTrack("NormalizedHips.position", [0, 1], [0, 0.4, 0, 0, 0.42, 0]),
      new THREE.QuaternionKeyframeTrack(
        "NormalizedLeftUpperLeg.quaternion",
        [0, 1],
        [0, 0, 0, 1, 0.2, 0, 0, 0.98],
      ),
    ]);

    stripMountedRootTranslation(clip, "NormalizedHips");

    expect(clip.tracks.map((track) => track.name)).toEqual([
      "NormalizedLeftUpperLeg.quaternion",
    ]);
  });

  it("stops standing locomotion immediately and loops the seated action", () => {
    const rig = new TestAvatarRig(true);
    expect(rig.idleAction.isRunning()).toBe(true);

    rig.setMounted(true);

    expect(rig.idleAction.isRunning()).toBe(false);
    expect(rig.sittingAction?.isRunning()).toBe(true);
    expect(rig.sittingAction?.loop).toBe(THREE.LoopRepeat);
  });

  it("holds still without a sit clip and restores idle after dismounting", () => {
    const rig = new TestAvatarRig(false);

    rig.setMounted(true);
    expect(rig.idleAction.isRunning()).toBe(false);

    rig.setMounted(false);
    expect(rig.idleAction.isRunning()).toBe(true);
  });
});
