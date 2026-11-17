import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import '@babylonjs/loaders/glTF';
import { COMBAT_CONFIG } from '../config/combat';
import type { ProjectileManager } from '../combat/ProjectileManager';

/**
 * The loaded enemy model, shared by every enemy in the level.
 *
 * The GLB is a skinned mesh with an armature and three clips (Idle,
 * Shooting and Walk), so it is loaded once and then cloned per enemy.
 */
export interface EnemyModelSource {
  /** The loaded asset container. */
  container: BABYLON.AssetContainer;
  /** False when the real model failed to load and the proxy is used. */
  hasModel: boolean;
}

/** How long the death animation takes, in seconds. */
const DEATH_DURATION = 0.7;

/**
 * Where the enemy's gun sits, in the enemy's own space, in metres.
 *
 * The model holds the pistol up in the aiming pose, so the muzzle sits high
 * and slightly to the right of the body. These are world metres - the model
 * is scaled down by the root, but the offset is not.
 */
const MUZZLE_OFFSET = new BABYLON.Vector3(0.24, 1.42, 0.42);

/** How high up the body the aim laser is drawn from, in metres. */
const EYE_OFFSET = new BABYLON.Vector3(0, 1.55, 0);

/** How high up the body the middle of the guard is, in metres. */
const CENTER_OFFSET = new BABYLON.Vector3(0, 0.95, 0);

/**
 * A single pistol enemy.
 *
 * It stands where it was put, turns to face the player when it can see
 * them, lines up a red laser for a moment and then fires one bolt. It dies
 * in a single hit - from the katana or from a bolt the player sent back.
 */
export class PistolEnemy {
  private scene: BABYLON.Scene;
  private world: RAPIER.World;
  private projectiles: ProjectileManager;
  /**
   * The player's body.
   *
   * The line of sight ray has to ignore it - otherwise every guard sees the
   * player's own capsule and never takes a shot.
   */
  private playerBody: RAPIER.RigidBody;

  /** Where the enemy was put - it goes back here when the run resets. */
  private spawnPosition: BABYLON.Vector3;
  /** The transform everything hangs off. */
  private root: BABYLON.TransformNode;
  /** The meshes of the enemy, so they can be hidden and faded. */
  private meshes: BABYLON.AbstractMesh[] = [];
  /** The idle clip, if the model has one. */
  private idleGroup: BABYLON.AnimationGroup | null = null;
  /** The aiming clip, if the model has one. */
  private shootingGroup: BABYLON.AnimationGroup | null = null;

  /** The red aiming laser. */
  private sight: BABYLON.Mesh;
  private sightMaterial: BABYLON.StandardMaterial;

  /** True while the enemy is alive and can be hit. */
  private alive = true;
  /** True while the death animation plays. */
  private dying = false;
  /** Time left of the death animation, in seconds. */
  private deathTimer = 0;

  /** Time left of the aiming laser, in seconds. */
  private aimTimer = 0;
  /** Time until the enemy may start aiming again, in seconds. */
  private fireCooldown = 0;
  /** The yaw the enemy is facing, in radians. */
  private yaw = 0;
  /** The yaw the enemy is turning towards. */
  private targetYaw = 0;

  /** How often the line of sight is checked, in seconds. */
  private losTimer = 0;
  /** The cached result of the last line of sight check. */
  private hasLineOfSight = false;

  /** True when the enemy can currently see the player. */
  private seesPlayer = false;

  /** Fired when the enemy pulls the trigger. */
  public onFire?: (position: BABYLON.Vector3) => void;

  constructor(
    scene: BABYLON.Scene,
    world: RAPIER.World,
    projectiles: ProjectileManager,
    model: EnemyModelSource,
    spawnPosition: BABYLON.Vector3,
    index: number,
    playerBody: RAPIER.RigidBody,
  ) {
    this.scene = scene;
    this.world = world;
    this.projectiles = projectiles;
    this.playerBody = playerBody;
    this.spawnPosition = spawnPosition.clone();

    this.root = new BABYLON.TransformNode(`enemy-${index}`, scene);
    this.root.position.copyFrom(spawnPosition);

    if (model.hasModel) {
      this.buildFromModel(model, index);
    } else {
      this.buildProxy(index);
    }

    // The red aiming laser.
    this.sightMaterial = new BABYLON.StandardMaterial(`enemy-sight-${index}`, scene);
    this.sightMaterial.diffuseColor = BABYLON.Color3.Black();
    this.sightMaterial.specularColor = BABYLON.Color3.Black();
    this.sightMaterial.emissiveColor = new BABYLON.Color3(1, 0.1, 0.06);
    this.sightMaterial.disableLighting = true;
    this.sightMaterial.alpha = 0;

    this.sight = BABYLON.MeshBuilder.CreateCylinder(
      `enemy-sight-${index}`,
      { height: 1, diameter: 0.025, tessellation: 6 },
      scene,
    );
    this.sight.material = this.sightMaterial;
    this.sight.isPickable = false;
    this.sight.alwaysSelectAsActiveMesh = true;
    this.sight.setEnabled(false);

    // Every enemy starts out with a different cooldown, so they do not all
    // shoot at the same instant.
    this.fireCooldown = COMBAT_CONFIG.ENEMY_FIRE_INTERVAL * (0.4 + index * 0.25);
  }

  // ------------------------------------------------------------------
  // Building the enemy
  // ------------------------------------------------------------------

  /**
   * Load the enemy model.
   *
   * The real model is a 24MB skinned GLB. If it cannot be loaded the game
   * falls back to a stylized proxy instead of refusing to start.
   */
  static async loadModel(scene: BABYLON.Scene): Promise<EnemyModelSource> {
    try {
      const container = await BABYLON.loadAssetContainerAsync(
        COMBAT_CONFIG.ENEMY_MODEL_URL,
        scene,
      );
      if (!container.meshes.length) {
        container.dispose();
        return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
      }
      return { container, hasModel: true };
    } catch (error) {
      console.warn('Enemy model failed to load, using the proxy guard', error);
      return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
    }
  }

  /** Build the enemy out of the loaded model. */
  private buildFromModel(model: EnemyModelSource, index: number) {
    const entries = model.container.instantiateModelsToScene(
      (name) => `${name}-enemy-${index}`,
    );

    for (const node of entries.rootNodes) {
      node.parent = this.root;
    }

    // The instantiated entries do not list their meshes, so they are picked
    // up by walking the cloned hierarchy.
    for (const node of entries.rootNodes) {
      for (const child of node.getChildMeshes(false)) {
        this.meshes.push(child);
        child.isPickable = false;
        child.receiveShadows = true;
      }
    }

    // The model is authored in centimetres.
    this.root.scaling.setAll(COMBAT_CONFIG.ENEMY_MODEL_SCALE);

    for (const group of entries.animationGroups) {
      if (group.name.toLowerCase().includes('idle')) {
        this.idleGroup = group;
      } else if (group.name.toLowerCase().includes('shoot')) {
        this.shootingGroup = group;
      }
    }

    if (this.idleGroup) {
      this.idleGroup.loopAnimation = true;
      this.idleGroup.start(true);
    }
  }

  /**
   * Build a stylized cyber-guard out of plain boxes.
   *
   * This is the fallback when the GLB cannot be loaded: a dark armoured
   * body, a glowing visor and a pistol held out in front.
   */
  private buildProxy(index: number) {
    const body = new BABYLON.StandardMaterial('enemy-proxy-body', this.scene);
    body.diffuseColor = new BABYLON.Color3(0.16, 0.18, 0.22);
    body.specularColor = new BABYLON.Color3(0.4, 0.42, 0.5);
    body.specularPower = 48;

    const visor = new BABYLON.StandardMaterial('enemy-proxy-visor', this.scene);
    visor.diffuseColor = BABYLON.Color3.Black();
    visor.specularColor = BABYLON.Color3.Black();
    visor.emissiveColor = new BABYLON.Color3(1, 0.3, 0.2);
    visor.disableLighting = true;

    const addBox = (
      name: string,
      position: BABYLON.Vector3,
      size: BABYLON.Vector3,
      material: BABYLON.Material,
    ) => {
      const mesh = BABYLON.MeshBuilder.CreateBox(
        `enemy-${index}-${name}`,
        { width: size.x, height: size.y, depth: size.z },
        this.scene,
      );
      mesh.parent = this.root;
      mesh.position.copyFrom(position);
      mesh.material = material;
      mesh.isPickable = false;
      this.meshes.push(mesh);
      return mesh;
    };

    // Legs, torso, head and the arm that holds the gun.
    addBox('leg-l', new BABYLON.Vector3(-0.14, 0.42, 0), new BABYLON.Vector3(0.2, 0.84, 0.24), body);
    addBox('leg-r', new BABYLON.Vector3(0.14, 0.42, 0), new BABYLON.Vector3(0.2, 0.84, 0.24), body);
    addBox('torso', new BABYLON.Vector3(0, 1.16, 0), new BABYLON.Vector3(0.52, 0.7, 0.3), body);
    addBox('head', new BABYLON.Vector3(0, 1.68, 0), new BABYLON.Vector3(0.3, 0.28, 0.3), body);
    addBox('visor', new BABYLON.Vector3(0, 1.7, 0.16), new BABYLON.Vector3(0.24, 0.07, 0.04), visor);
    addBox('arm-l', new BABYLON.Vector3(-0.33, 1.2, 0.06), new BABYLON.Vector3(0.14, 0.56, 0.16), body);
    addBox('arm-r', new BABYLON.Vector3(0.3, 1.36, 0.14), new BABYLON.Vector3(0.14, 0.4, 0.16), body);
    addBox('gun', new BABYLON.Vector3(0.26, 1.4, 0.42), new BABYLON.Vector3(0.09, 0.14, 0.42), body);
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  /** True while the enemy is alive and can be hit. */
  get isAlive(): boolean {
    return this.alive;
  }

  /** Where the enemy stands, in world space. */
  get position(): BABYLON.Vector3 {
    return this.root.position;
  }

  /** The point the enemy aims at - roughly its chest. */
  get aimPoint(): BABYLON.Vector3 {
    return this.root.position.add(EYE_OFFSET);
  }

  /**
   * The middle of the guard, in world space.
   *
   * This is the point the katana and the deflected bolts are tested
   * against - the feet would be too low to ever be in reach.
   */
  get center(): BABYLON.Vector3 {
    return this.root.position.add(CENTER_OFFSET);
  }

  /** How many enemies are left standing. */
  get isDead(): boolean {
    return !this.alive;
  }

  // ------------------------------------------------------------------
  // The update loop
  // ------------------------------------------------------------------

  /**
   * Advance the enemy.
   *
   * @param dt the real time step, in seconds
   * @param timeScale the world time scale (sensory boost slows them down)
   * @param playerPosition where the player is right now
   */
  update(dt: number, timeScale: number, playerPosition: BABYLON.Vector3) {
    if (this.dying) {
      this.updateDeath(dt);
      return;
    }
    if (!this.alive) return;

    // The enemy's own clock runs with the world, so the sensory boost
    // stretches out the aiming laser as well.
    const scaledDt = dt * timeScale;

    const toPlayer = playerPosition.subtract(this.aimPoint);
    const distance = toPlayer.length();

    // The line of sight is checked a few times a second, not every frame.
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.1;
      this.hasLineOfSight = this.checkLineOfSight(playerPosition);
    }
    this.seesPlayer = distance <= COMBAT_CONFIG.ENEMY_FACE_RANGE && this.hasLineOfSight;

    // Turn to face the player, but only when the enemy can actually see
    // them - otherwise it keeps watching whatever it was watching.
    if (this.seesPlayer) {
      this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
      this.yaw = this.turnToward(this.yaw, this.targetYaw, COMBAT_CONFIG.ENEMY_TURN_SPEED * dt);
      this.root.rotation.y = this.yaw;
    }

    if (this.aimTimer > 0) {
      // The laser is up: keep it on the player and wait for the shot.
      this.aimTimer -= scaledDt;
      this.drawSight(playerPosition);

      if (this.aimTimer <= 0) {
        this.fire(playerPosition);
      }
      return;
    }

    this.fireCooldown -= scaledDt;
    if (
      this.fireCooldown <= 0
      && distance <= COMBAT_CONFIG.ENEMY_RANGE
      && this.hasLineOfSight
    ) {
      this.aimTimer = COMBAT_CONFIG.ENEMY_AIM_TIME;
      this.fireCooldown = COMBAT_CONFIG.ENEMY_FIRE_INTERVAL;
      this.drawSight(playerPosition);
      this.playShooting();
    }
  }

  /**
   * Turn towards a yaw without ever snapping.
   */
  private turnToward(current: number, target: number, maxStep: number): number {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const step = Math.max(-maxStep, Math.min(maxStep, delta));
    return current + step;
  }

  /**
   * Can the enemy see the player?
   *
   * A ray is cast through the physics world, so the graybox geometry
   * blocks the shot the same way it blocks movement. The player's own
   * body is left out of the query - without that the ray would always
   * end inside the player's capsule and the guard would never take a
   * shot at all.
   */
  private checkLineOfSight(playerPosition: BABYLON.Vector3): boolean {
    const from = this.aimPoint;
    const to = playerPosition.subtract(from);
    const distance = to.length();
    if (distance < 0.5) return true;

    const direction = to.scale(1 / distance);
    const ray = new RAPIER.Ray(from, direction);
    const hit = this.world.castRay(
      ray,
      distance,
      true,
      undefined,
      undefined,
      undefined,
      this.playerBody,
    );
    // A hit before the player means something is in the way.
    return !hit;
  }

  /** Draw the red laser from the muzzle to the target. */
  private drawSight(target: BABYLON.Vector3) {
    const muzzle = this.muzzlePosition();
    const direction = target.subtract(muzzle);
    const length = Math.max(direction.length(), 0.001);
    direction.scaleInPlace(1 / length);

    this.sight.setEnabled(true);
    this.sight.position.copyFrom(muzzle.add(direction.scale(length * 0.5)));
    this.sight.scaling.set(1, length, 1);

    const rotation = BABYLON.Quaternion.Identity();
    BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Axis.Y, direction, rotation);
    this.sight.rotationQuaternion = rotation;

    // The beam brightens as the shot approaches, but it stays red.
    const charge = 1 - this.aimTimer / COMBAT_CONFIG.ENEMY_AIM_TIME;
    this.sightMaterial.alpha = 0.3 + charge * 0.65;
    this.sightMaterial.emissiveColor.set(
      1,
      0.1 + charge * 0.15,
      0.06 + charge * 0.09,
    );
    const thickness = 1 + charge * 1.2;
    this.sight.scaling.x = thickness;
    this.sight.scaling.z = thickness;
  }

  /**
   * Where the enemy's gun is, in world space.
   *
   * The offset is in metres, so it is not scaled with the model - the
   * model is scaled down by the root, but the gun's place in the world
   * is not.
   */
  private muzzlePosition(): BABYLON.Vector3 {
    const rotated = new BABYLON.Vector3();
    MUZZLE_OFFSET.rotateByQuaternionToRef(
      BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, this.yaw),
      rotated,
    );
    return this.root.position.add(rotated);
  }

  /** Fire one bolt at the player. */
  private fire(playerPosition: BABYLON.Vector3) {
    const muzzle = this.muzzlePosition();
    const direction = playerPosition.subtract(muzzle).normalize();

    this.projectiles.spawnBolt(
      muzzle,
      direction,
      COMBAT_CONFIG.BOLT_SPEED,
      false,
    );

    this.sight.setEnabled(false);
    this.sightMaterial.alpha = 0;
    this.playIdle();
    this.onFire?.(muzzle);
  }

  /**
   * Switch to the aiming animation.
   *
   * The idle clip is stopped first: the two clips drive the same bones,
   * so letting them run together would fight over every joint.
   */
  private playShooting() {
    if (!this.shootingGroup) return;
    if (this.idleGroup?.isStarted) {
      this.idleGroup.stop();
    }
    if (!this.shootingGroup.isStarted) {
      this.shootingGroup.loopAnimation = true;
      this.shootingGroup.start(true);
    }
  }

  /** Switch back to the idle animation. */
  private playIdle() {
    if (this.shootingGroup?.isStarted) {
      this.shootingGroup.stop();
    }
    if (!this.idleGroup) return;
    if (!this.idleGroup.isStarted) {
      this.idleGroup.loopAnimation = true;
      this.idleGroup.start(true);
    }
  }

  // ------------------------------------------------------------------
  // Death and reset
  // ------------------------------------------------------------------

  /**
   * Take the hit.
   *
   * The enemy is put into its death animation and stops being a target
   * right away. It can be brought back by a reset.
   */
  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.dying = true;
    this.deathTimer = DEATH_DURATION;

    this.sight.setEnabled(false);
    this.sightMaterial.alpha = 0;
    this.shootingGroup?.stop();
  }

  /** The death animation: the guard drops over and fades out. */
  private updateDeath(dt: number) {
    this.deathTimer -= dt;
    const t = Math.max(0, Math.min(1, 1 - this.deathTimer / DEATH_DURATION));

    // It topples backwards and sinks into the floor.
    this.root.rotation.x = -t * 1.35;
    this.root.position.y = this.spawnPosition.y - t * 0.35;

    // And it burns out.
    for (const mesh of this.meshes) {
      mesh.visibility = 1 - t;
    }

    if (this.deathTimer <= 0) {
      this.dying = false;
      this.setVisible(false);
    }
  }

  /** Put the enemy back where it started, alive and standing. */
  respawn() {
    this.alive = true;
    this.dying = false;
    this.deathTimer = 0;
    this.aimTimer = 0;
    this.fireCooldown = COMBAT_CONFIG.ENEMY_FIRE_INTERVAL;
    this.sight.setEnabled(false);
    this.sightMaterial.alpha = 0;

    this.root.position.copyFrom(this.spawnPosition);
    this.root.rotation.set(0, this.yaw, 0);

    for (const mesh of this.meshes) {
      mesh.visibility = 1;
    }
    this.setVisible(true);
    this.playIdle();
  }

  /** Show or hide the whole enemy. */
  private setVisible(visible: boolean) {
    for (const mesh of this.meshes) {
      mesh.setEnabled(visible);
    }
  }

  /** Release the enemy's meshes. */
  dispose() {
    this.sight.dispose();
    this.sightMaterial.dispose();
    this.idleGroup?.dispose();
    this.shootingGroup?.dispose();
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    this.root.dispose();
  }
}
