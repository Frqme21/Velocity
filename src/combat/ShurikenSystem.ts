import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import '@babylonjs/loaders/glTF';
import { COMBAT_CONFIG } from '../config/combat';
import type { MeleeEnemy, ShurikenHitResult } from '../entities/Enemy';

/** One star in flight. */
interface FlyingStar {
  pivot: BABYLON.TransformNode;
  meshes: BABYLON.AbstractMesh[];
  position: BABYLON.Vector3;
  velocity: BABYLON.Vector3;
  target: MeleeEnemy | null;
  life: number;
}

/** The loaded star model, shared by every throw. */
export interface ShurikenModelSource {
  container: BABYLON.AssetContainer;
  hasModel: boolean;
}

/**
 * The shuriken ability (Q).
 *
 * A throw costs half the energy bar. The star homes toward the closest valid
 * target near the crosshair, so a slightly off-axis throw still connects.
 * Energy trickles back passively, recharges faster while enemies are close,
 * and a kill refunds part of the bar with a growing combo bonus.
 */
export class ShurikenSystem {
  private scene: BABYLON.Scene;
  private camera: BABYLON.FreeCamera;
  private world: RAPIER.World;
  private playerBody: RAPIER.RigidBody;
  private model: ShurikenModelSource;
  private stars: FlyingStar[] = [];

  private energy = 1;
  private cooldown = 0;
  private combo = 0;
  private comboTimer = 0;

  /** Fired when a star reaches an enemy, with the already-resolved outcome. */
  public onEnemyHit?: (
    enemy: MeleeEnemy,
    point: BABYLON.Vector3,
    result: ShurikenHitResult,
  ) => void;
  /** Fired on a successful throw, for audio feedback. */
  public onThrow?: (position: BABYLON.Vector3) => void;

  constructor(
    scene: BABYLON.Scene,
    camera: BABYLON.FreeCamera,
    world: RAPIER.World,
    playerBody: RAPIER.RigidBody,
    model: ShurikenModelSource,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.playerBody = playerBody;
    this.model = model;
  }

  static async loadModel(scene: BABYLON.Scene): Promise<ShurikenModelSource> {
    try {
      const container = await BABYLON.loadAssetContainerAsync(
        COMBAT_CONFIG.SHURIKEN_MODEL_URL,
        scene,
      );
      if (!container.meshes.length) {
        container.dispose();
        return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
      }
      return { container, hasModel: true };
    } catch (error) {
      console.warn('Shuriken model failed to load, using the proxy star', error);
      return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
    }
  }

  get energyAmount(): number {
    return this.energy;
  }

  /** True when the player can afford a throw right now. */
  get canThrow(): boolean {
    return this.cooldown <= 0 && this.energy >= COMBAT_CONFIG.SHURIKEN_COST;
  }

  /**
   * Throw a star along the crosshair.
   *
   * @param targets every living enemy the game knows about, for homing
   * @returns false when the throw was on cooldown or energy was too low
   */
  throw(targets: readonly MeleeEnemy[]): boolean {
    if (!this.canThrow) return false;

    this.energy -= COMBAT_CONFIG.SHURIKEN_COST;
    this.cooldown = COMBAT_CONFIG.SHURIKEN_COOLDOWN;

    const forward = this.camera.getForwardRay().direction.clone().normalize();
    const origin = this.camera.position.add(forward.scale(0.6));
    const target = this.acquireTarget(origin, forward, targets);

    // A locked target bends the initial heading toward it, so even a throw
    // from off-centre starts out on a believable intercept course.
    const direction = target
      ? target.center.subtract(origin).normalize()
      : forward.clone();

    const pivot = new BABYLON.TransformNode('shuriken', this.scene);
    pivot.position.copyFrom(origin);
    pivot.scaling.setAll(COMBAT_CONFIG.SHURIKEN_MODEL_SCALE);
    const meshes: BABYLON.AbstractMesh[] = [];

    if (this.model.hasModel) {
      const entries = this.model.container.instantiateModelsToScene(
        (name) => `${name}-shuriken`,
      );
      for (const node of entries.rootNodes) {
        node.parent = pivot;
        for (const child of node.getChildMeshes(false)) {
          meshes.push(child);
          child.isPickable = false;
        }
      }
    } else {
      const star = BABYLON.MeshBuilder.CreateCylinder('shuriken-proxy', {
        height: 0.06, diameterTop: 0, diameterBottom: 0.42, tessellation: 4,
      }, this.scene);
      const material = new BABYLON.StandardMaterial('shuriken-proxy-mat', this.scene);
      material.emissiveColor = new BABYLON.Color3(0.6, 0.95, 1);
      material.disableLighting = true;
      star.material = material;
      star.parent = pivot;
      star.isPickable = false;
      meshes.push(star);
    }

    this.stars.push({
      pivot,
      meshes,
      position: origin.clone(),
      velocity: direction.scale(COMBAT_CONFIG.SHURIKEN_SPEED),
      target,
      life: COMBAT_CONFIG.SHURIKEN_LIFETIME,
    });
    this.onThrow?.(origin);
    return true;
  }

  /**
   * Pick the enemy nearest the crosshair inside the homing cone.
   *
   * The cone is deliberately wide - a star should not miss just because the
   * player was a few degrees off - but still requires the player to aim at a
   * target rather than throwing into empty space.
   */
  private acquireTarget(
    origin: BABYLON.Vector3,
    forward: BABYLON.Vector3,
    targets: readonly MeleeEnemy[],
  ): MeleeEnemy | null {
    let best: MeleeEnemy | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const enemy of targets) {
      if (!enemy.isAlive || enemy.canBeShurikenTargeted === false) continue;
      const toEnemy = enemy.center.subtract(origin);
      const distance = toEnemy.length();
      if (distance > COMBAT_CONFIG.SHURIKEN_HOMING_RANGE || distance < 0.2) continue;
      const direction = toEnemy.scale(1 / distance);
      const dot = BABYLON.Vector3.Dot(direction, forward);
      if (dot < COMBAT_CONFIG.SHURIKEN_HOMING_CONE_DOT) continue;
      // Angle first, distance as a tie-breaker.
      const score = (1 - dot) * 10 + distance * 0.02;
      if (score < bestScore) {
        best = enemy;
        bestScore = score;
      }
    }
    return best;
  }

  /**
   * Advance energy, cooldown and every star in flight.
   *
   * @param dt real time step, in seconds
   * @param inCombat true when an enemy is close enough to charge faster
   * @param targets every living enemy, for mid-flight homing and hits
   */
  update(dt: number, inCombat: boolean, targets: readonly MeleeEnemy[]) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const regen = inCombat
      ? COMBAT_CONFIG.SHURIKEN_REGEN_COMBAT
      : COMBAT_CONFIG.SHURIKEN_REGEN_PASSIVE;
    this.energy = Math.min(1, this.energy + regen * dt);

    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer === 0) this.combo = 0;
    }

    for (let i = this.stars.length - 1; i >= 0; i--) {
      const star = this.stars[i];
      if (!star) continue;
      star.life -= dt;

      // Re-acquire if the locked enemy died mid-flight.
      if (star.target && (!star.target.isAlive || star.target.canBeShurikenTargeted === false)) {
        star.target = this.acquireTarget(star.position, star.velocity.normalizeToNew(), targets);
      }

      if (star.target) {
        const desired = star.target.center.subtract(star.position);
        if (desired.lengthSquared() > 0.0001) {
          desired.normalize();
          const heading = star.velocity.clone().normalize();
          BABYLON.Vector3.LerpToRef(
            heading,
            desired,
            Math.min(1, COMBAT_CONFIG.SHURIKEN_HOMING_STRENGTH * dt),
            heading,
          );
          star.velocity.copyFrom(heading.normalize().scale(COMBAT_CONFIG.SHURIKEN_SPEED));
        }
      }

      const previous = star.position.clone();
      star.position.addInPlace(star.velocity.scale(dt));
      star.pivot.position.copyFrom(star.position);
      // Tumble in flight so the star reads as a thrown blade, not a bullet.
      star.pivot.rotation.z += dt * 22;
      star.pivot.rotation.y += dt * 9;

      // Geometry stops a star, exactly like a bolt.
      if (this.hitsWorld(previous, star.position)) {
        this.removeStar(i);
        continue;
      }

      let hit = false;
      for (const enemy of targets) {
        if (!enemy.isAlive || enemy.canBeShurikenTargeted === false) continue;
        const distance = BABYLON.Vector3.Distance(star.position, enemy.center);
        if (distance > COMBAT_CONFIG.SHURIKEN_HIT_RADIUS) continue;
        const result = enemy.takeShurikenHit?.() ?? 'ignore';
        if (result !== 'ignore') {
          this.onEnemyHit?.(enemy, star.position.clone(), result);
        }
        hit = true;
        break;
      }
      if (hit) {
        this.removeStar(i);
        continue;
      }

      if (star.life <= 0) this.removeStar(i);
    }
  }

  /** Reward a confirmed shuriken kill with energy and a combo bonus. */
  notifyKill() {
    this.combo = Math.min(this.combo + 1, 20);
    this.comboTimer = COMBAT_CONFIG.SHURIKEN_COMBO_WINDOW;
    const bonus = Math.min(
      this.combo * COMBAT_CONFIG.SHURIKEN_COMBO_BONUS,
      COMBAT_CONFIG.SHURIKEN_COMBO_MAX,
    );
    this.energy = Math.min(1, this.energy + COMBAT_CONFIG.SHURIKEN_KILL_REFILL + bonus);
  }

  private hitsWorld(from: BABYLON.Vector3, to: BABYLON.Vector3): boolean {
    const delta = to.subtract(from);
    const distance = delta.length();
    if (distance < 0.0001) return false;
    const direction = delta.scale(1 / distance);
    const hit = this.world.castRay(
      new RAPIER.Ray(from, direction),
      distance,
      true,
      undefined,
      undefined,
      undefined,
      this.playerBody,
    );
    return hit !== null;
  }

  private removeStar(index: number) {
    const star = this.stars[index];
    if (!star) return;
    for (const mesh of star.meshes) mesh.dispose();
    star.pivot.dispose();
    this.stars.splice(index, 1);
  }

  /** Refill the bar and remove every star in flight. */
  reset() {
    this.energy = 1;
    this.cooldown = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.clear();
  }

  clear() {
    for (let i = this.stars.length - 1; i >= 0; i--) this.removeStar(i);
  }

  dispose() {
    this.clear();
  }
}
