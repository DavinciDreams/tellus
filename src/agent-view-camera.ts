import type { Vec3 } from "./tellus-types";

export interface AgentViewCameraPose {
  eye: Vec3;
  target: Vec3;
}

/**
 * Deterministic camera pose for evaluation renders. Presence does not yet carry heading, so yaw zero faces
 * the world origin (or +X at the origin); requested yaw/pitch then produce stable, repeatable evidence.
 */
export function agentViewCameraPose(
  position: Vec3,
  avatarScale = 1,
  yawDegrees = 0,
  pitchDegrees = -8,
): AgentViewCameraPose {
  const scale = Number.isFinite(avatarScale) && avatarScale > 0
    ? Math.min(8, Math.max(0.1, avatarScale))
    : 1;
  const eye = { x: position.x, y: position.y + 2.4 * scale, z: position.z };
  const lengthToOrigin = Math.hypot(position.x, position.z);
  const baseX = lengthToOrigin > 0.001 ? -position.x / lengthToOrigin : 1;
  const baseZ = lengthToOrigin > 0.001 ? -position.z / lengthToOrigin : 0;
  const yaw = Math.min(180, Math.max(-180, yawDegrees)) * Math.PI / 180;
  const pitch = Math.min(30, Math.max(-45, pitchDegrees)) * Math.PI / 180;
  const yawX = baseX * Math.cos(yaw) - baseZ * Math.sin(yaw);
  const yawZ = baseX * Math.sin(yaw) + baseZ * Math.cos(yaw);
  const horizontal = Math.cos(pitch) * 12;
  return {
    eye,
    target: {
      x: eye.x + yawX * horizontal,
      y: eye.y + Math.sin(pitch) * 12,
      z: eye.z + yawZ * horizontal,
    },
  };
}
