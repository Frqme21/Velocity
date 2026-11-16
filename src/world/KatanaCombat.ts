import * as BABYLON from '@babylonjs/core';
import { COMBAT_CONFIG } from '../config/combat';

/**
 * Something the katana can cut.
 *
 * The enemy system will register its actors here; until then the registry is
 * simply empty and every swing whiffs.
 */
export interface SlashTarget {
  /** World position of the target (its centre). */
  position: BABYLON.Vector3;
  /** Radius of the target, in metres. */
  radius: number;
  /** Called when the target is sliced. */
  onSlice: () => void;
}

/**
 * Melee hit detection.
 *
 * The katana uses a wide forward cone rather than a ray: the blade sweeps a
 * wide arc, so anything inside that arc is cut. The target's own radius
 * widens the cone a little further, which keeps the hit feeling generous
 * without turning it into a 360 degree sweep.
 */
export class KatanaCombat {
  private targets = new Set<SlashTarget>();

  /** Register a target so it can be cut. */
  registerTarget(target: SlashTarget) {
    this.targets.add(target);
  }

  /** Remove a target (for example after it was sliced). */
  unregisterTarget(target: SlashTarget) {
    this.targets.delete(target);
  }

  /** Drop every registered target. */
  clearTargets() {
    this.targets.clear();
  }

  /** How many targets are currently registered. */
  get targetCount(): number {
    return this.targets.size;
  }

  /**
   * Find the closest target inside the forward hit cone.
   *
   * Returns null when the swing whiffs.
   */
  findTarget(
    origin: BABYLON.Vector3,
    forward: BABYLON.Vector3,
  ): SlashTarget | null {
    const halfAngle = ((COMBAT_CONFIG.HIT_CONE_ANGLE * Math.PI) / 180) / 2;

    let best: SlashTarget | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const target of this.targets) {
      const toTarget = target.position.subtract(origin);
      const distance = toTarget.length();
      if (distance < 0.0001) continue;

      // The target's radius can reach back into range.
      if (distance - target.radius > COMBAT_CONFIG.HIT_RANGE) continue;

      const direction = toTarget.scale(1 / distance);
      const dot = BABYLON.Vector3.Dot(direction, forward);
      // Behind the player: never hit.
      if (dot <= 0) continue;

      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

      // The sphere of the target widens the effective cone.
      const angularRadius = Math.asin(
        Math.min(1, target.radius / Math.max(distance, 0.0001)),
      );
      if (angle > halfAngle + angularRadius) continue;

      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }

    return best;
  }
}
