import * as BABYLON from '@babylonjs/core';
import { COMBAT_CONFIG } from '../config/combat';
import type { FirstPersonController } from '../world/FirstPersonController';
import type { KatanaViewmodel } from '../world/KatanaViewmodel';
import type { ProjectileManager } from './ProjectileManager';
import type { PistolEnemy } from '../entities/PistolEnemy';
import { SparkBurst } from './SparkBurst';
import { SliceArc } from './SliceArc';

/**
 * Something the katana can cut that is not an enemy.
 *
 * The enemy system plugs into the combat system; anything else that wants
 * to be cut registers itself here.
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
 * Everything that turns a swing or a bolt into a kill.
 *
 * The katana owns the swing, the projectile manager owns the bolts, and
 * this owns the question "did that hit anything?". Two things can kill:
 *
 *   - the katana, during the strike phase of a slash
 *   - a bolt the player deflected, when it flies through an enemy
 *
 * A kill is instant. It refills the dash meter, freezes the world for a
 * moment, punches the camera out and throws a burst of sparks where the
 * enemy was standing.
 */
export class CombatSystem {
  private scene: BABYLON.Scene;
  private camera: BABYLON.FreeCamera;
  private controller: FirstPersonController;
  private projectiles: ProjectileManager;
  private katana: KatanaViewmodel;

  /** The enemies this system watches. */
  private enemies: PistolEnemy[] = [];
  /** Things that are not enemies but can still be cut. */
  private targets = new Set<SlashTarget>();
  /** The bursts of sparks that mark a kill. */
  private sparks: SparkBurst;
  /** The bright arc that flashes where the blade went through. */
  private arcs: SliceArc;

  /**
   * Fired on a kill.
   *
   * The game listens to this to freeze the world for a moment and to play
   * the sound of the kill.
   */
  public onKill?: (point: BABYLON.Vector3, enemy: PistolEnemy) => void;

  constructor(
    scene: BABYLON.Scene,
    camera: BABYLON.FreeCamera,
    controller: FirstPersonController,
    projectiles: ProjectileManager,
    katana: KatanaViewmodel,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.controller = controller;
    this.projectiles = projectiles;
    this.katana = katana;
    this.sparks = new SparkBurst(scene);
    this.arcs = new SliceArc(scene);
  }

  // ------------------------------------------------------------------
  // Registration
  // ------------------------------------------------------------------

  /** Add an enemy to the system. */
  registerEnemy(enemy: PistolEnemy) {
    this.enemies.push(enemy);
  }

  /** The enemies this system watches. */
  get enemyCount(): number {
    return this.enemies.length;
  }

  /** How many enemies are still standing. */
  get livingEnemyCount(): number {
    return this.enemies.filter((enemy) => enemy.isAlive).length;
  }

  /** Register a target so it can be cut. */
  registerTarget(target: SlashTarget) {
    this.targets.add(target);
  }

  /** Remove a target (for example after it has been cut). */
  unregisterTarget(target: SlashTarget) {
    this.targets.delete(target);
  }

  /** How many targets are registered. */
  get targetCount(): number {
    return this.targets.size;
  }

  /** Forget every registered target. */
  clearTargets() {
    this.targets.clear();
  }

  // ------------------------------------------------------------------
  // The update loop
  // ------------------------------------------------------------------

  /**
   * Look for kills.
   *
   * @param dt the real time step, in seconds
   */
  update(dt: number) {
    this.resolveMeleeKill();
    this.resolveDeflectedKill();
    this.sparks.update(dt);
    this.arcs.update(dt);
  }

  /**
   * The katana kill.
   *
   * The blade is only lethal while it is actually travelling through the
   * target, so the hit window is a slice of the middle of the swing.
   */
  private resolveMeleeKill() {
    if (!this.katana.isSwinging) return;

    const elapsed = this.katana.swingTime;
    if (
      elapsed < COMBAT_CONFIG.MELEE_ACTIVE_START
      || elapsed > COMBAT_CONFIG.MELEE_ACTIVE_END
    ) {
      return;
    }

    const cameraPosition = this.camera.position;
    const forward = this.camera.getForwardRay().direction;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;

      // The middle of the guard is what the blade has to reach - its feet
      // are far below the swing.
      const toEnemy = enemy.center.subtract(cameraPosition);
      const distance = toEnemy.length();
      if (distance > COMBAT_CONFIG.MELEE_KILL_RANGE) continue;

      // Only what is in front of the blade gets cut.
      if (distance > 0.001) {
        const direction = toEnemy.scale(1 / distance);
        if (BABYLON.Vector3.Dot(direction, forward) <= COMBAT_CONFIG.MELEE_KILL_CONE_DOT) {
          continue;
        }
      }

      this.kill(enemy);
    }
  }

  /**
   * The deflected bolt kill.
   *
   * A bolt the player sent back is lethal: it goes through an enemy.
   */
  private resolveDeflectedKill() {
    const bolts = this.projectiles.activeBolts;
    if (!bolts.length) return;

    for (const bolt of bolts) {
      if (!bolt.playerDeflected) continue;

      for (const enemy of this.enemies) {
        if (!enemy.isAlive) continue;

        const distance = BABYLON.Vector3.Distance(bolt.position, enemy.center);
        if (distance > COMBAT_CONFIG.DEFLECT_KILL_RADIUS) continue;

        this.kill(enemy);
      }
    }
  }

  // ------------------------------------------------------------------
  // The kill
  // ------------------------------------------------------------------

  /**
   * Kill an enemy.
   *
   * The dash meter goes straight back to full, so a kill can be chained
   * straight into a dash or an air-dash.
   */
  private kill(enemy: PistolEnemy) {
    if (!enemy.isAlive) return;

    const point = enemy.center.clone();
    enemy.kill();

    // The dash meter is refilled, so the next kill is always one dash away.
    this.controller.refillDash(COMBAT_CONFIG.DASH_REFILL);

    // The camera punches out and shakes.
    this.controller.triggerImpactFeedback(
      COMBAT_CONFIG.KILL_FOV_KICK,
      COMBAT_CONFIG.KILL_SHAKE,
    );

    // The bright cut across the guard: a hot crescent in the plane the
    // player is looking along, so the hit reads even at full speed.
    const forward = this.camera.getForwardRay().direction;
    const up = BABYLON.Vector3.Cross(forward, BABYLON.Axis.X).normalize();
    const right = BABYLON.Vector3.Cross(up, forward).normalize();
    this.arcs.pop(point, right, up, {
      color: new BABYLON.Color3(1, 0.98, 0.92),
      radius: COMBAT_CONFIG.SLICE_ARC_RADIUS,
      thickness: COMBAT_CONFIG.SLICE_ARC_THICKNESS,
      duration: COMBAT_CONFIG.SLICE_ARC_DURATION,
    });

    // Red and cyan sparks where the guard was standing.
    this.sparks.burst(point, {
      flashColor: new BABYLON.Color3(1, 0.92, 0.7),
      shardColors: [
        new BABYLON.Color3(1, 0.22, 0.16),
        new BABYLON.Color3(0.35, 0.95, 1),
        new BABYLON.Color3(1, 0.55, 0.2),
      ],
      shardCount: 14,
      speed: 6,
      life: 0.42,
      flashSize: 0.4,
    });

    this.onKill?.(point, enemy);
  }

  // ------------------------------------------------------------------
  // The generic target registry
  // ------------------------------------------------------------------

  /**
   * Find the generic target the blade is crossing.
   *
   * The katana uses a wide forward cone rather than a ray: the blade
   * sweeps a wide arc, so anything inside that arc is cut. The target's
   * own radius widens the cone a little further, which keeps the hit
   * feeling generous without turning it into a 360 degree sweep.
   */
  findTarget(
    cameraPosition: BABYLON.Vector3,
    forward: BABYLON.Vector3,
  ): SlashTarget | null {
    let best: SlashTarget | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const target of this.targets) {
      const toTarget = target.position.subtract(cameraPosition);
      const distance = toTarget.length();
      if (distance > COMBAT_CONFIG.HIT_RANGE) continue;

      // A fat target is easier to hit than a thin one.
      const halfAngle = Math.asin(Math.min(1, target.radius / Math.max(distance, 0.001)));
      const allowed = Math.min(
        Math.PI / 2,
        (COMBAT_CONFIG.HIT_CONE_ANGLE * Math.PI) / 360 + halfAngle,
      );
      const cosAllowed = Math.cos(allowed);

      const direction = distance > 0.001 ? toTarget.scale(1 / distance) : BABYLON.Vector3.Up();
      if (BABYLON.Vector3.Dot(direction, forward) < cosAllowed) continue;

      // The closest one wins.
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }

    return best;
  }

  // ------------------------------------------------------------------
  // Reset
  // ------------------------------------------------------------------

  /** Bring every enemy back to life. */
  respawnAll() {
    for (const enemy of this.enemies) {
      enemy.respawn();
    }
    this.sparks.clear();
    this.arcs.clear();
  }

  /** Remove every enemy and target. */
  clear() {
    this.enemies = [];
    this.targets.clear();
    this.sparks.clear();
    this.arcs.clear();
  }
}
