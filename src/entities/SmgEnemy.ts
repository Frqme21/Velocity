import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import '@babylonjs/loaders/glTF';
import { COMBAT_CONFIG } from '../config/combat';
import type { ProjectileManager } from '../combat/ProjectileManager';
import type { MeleeEnemy, ShurikenHitResult } from './Enemy';

/** The loaded SMG model, shared by every gunner in the level. */
export interface SmgModelSource {
  container: BABYLON.AssetContainer;
  hasModel: boolean;
}

/** How long the death animation takes, in seconds. */
const DEATH_DURATION = 0.55;

/** A bone's driver node and the rotation the GLB exported it with. */
interface SmgBonePose {
  node: BABYLON.TransformNode;
  rest: BABYLON.Quaternion;
}

/**
 * A Ghostrunner UZI gunner.
 *
 * It stands where it was placed, tracks the player when it has line of sight,
 * draws a red laser and then empties a full magazine at them. The skinned
 * model is posed procedurally - idle, aim, recoil, reload and death are all
 * driven from code, even though the extracted GLB has no baked clips. One
 * shuriken or one katana hit takes it down, just like a pistol guard.
 */
export class SmgEnemy implements MeleeEnemy {
  private scene: BABYLON.Scene;
  private world: RAPIER.World;
  private projectiles: ProjectileManager;
  private playerBody: RAPIER.RigidBody;

  private spawnPosition: BABYLON.Vector3;
  private spawnYaw = 0;
  private index = 0;
  private root: BABYLON.TransformNode;
  private meshes: BABYLON.AbstractMesh[] = [];

  /** The gunner's bone driver nodes, posed in code because the GLB has no clips. */
  private poses = new Map<string, SmgBonePose>();
  private animTime = 0;
  private recoil = 0;
  private aimBlend = 0;
  private reloadBlend = 0;

  private sight: BABYLON.Mesh;
  private sightMaterial: BABYLON.StandardMaterial;

  private alive = true;
  private dying = false;
  private deathTimer = 0;

  private aimTimer = 0;
  private fireCooldown = 0;
  private burstRemaining = 0;
  private burstTimer = 0;
  private reloadTimer = 0;

  private yaw = 0;
  private targetYaw = 0;
  private losTimer = 0;
  private hasLineOfSight = false;

  /** Fired when the gunner pulls the trigger. */
  public onFire?: (position: BABYLON.Vector3) => void;
  public aiEnabled = true;

  constructor(
    scene: BABYLON.Scene,
    world: RAPIER.World,
    projectiles: ProjectileManager,
    model: SmgModelSource,
    spawnPosition: BABYLON.Vector3,
    index: number,
    playerBody: RAPIER.RigidBody,
    facing = 0,
  ) {
    this.scene = scene;
    this.world = world;
    this.projectiles = projectiles;
    this.playerBody = playerBody;
    this.spawnPosition = spawnPosition.clone();
    this.spawnYaw = facing;
    this.index = index;

    this.root = new BABYLON.TransformNode(`smg-${index}`, scene);
    this.root.position.copyFrom(spawnPosition);
    this.root.rotation.y = facing;
    this.yaw = facing;
    this.targetYaw = facing;

    if (model.hasModel) {
      this.buildFromModel(model, index);
    } else {
      this.buildProxy(index);
    }

    this.sightMaterial = new BABYLON.StandardMaterial(`smg-sight-${index}`, scene);
    this.sightMaterial.diffuseColor = BABYLON.Color3.Black();
    this.sightMaterial.specularColor = BABYLON.Color3.Black();
    this.sightMaterial.emissiveColor = new BABYLON.Color3(1, 0.12, 0.05);
    this.sightMaterial.disableLighting = true;
    this.sightMaterial.alpha = 0;

    this.sight = BABYLON.MeshBuilder.CreateCylinder(
      `smg-sight-${index}`,
      { height: 1, diameter: 0.024, tessellation: 6 },
      scene,
    );
    this.sight.material = this.sightMaterial;
    this.sight.isPickable = false;
    this.sight.alwaysSelectAsActiveMesh = true;
    this.sight.setEnabled(false);

    // Stagger the first burst so a room of gunners does not fire in unison.
    this.fireCooldown = COMBAT_CONFIG.SMG_FIRE_INTERVAL * (0.35 + index * 0.22);
  }

  static async loadModel(scene: BABYLON.Scene): Promise<SmgModelSource> {
    try {
      const container = await BABYLON.loadAssetContainerAsync(
        COMBAT_CONFIG.SMG_MODEL_URL,
        scene,
      );
      if (!container.meshes.length) {
        container.dispose();
        return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
      }
      return { container, hasModel: true };
    } catch (error) {
      console.warn('SMG model failed to load, using the proxy gunner', error);
      return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
    }
  }

  private buildFromModel(model: SmgModelSource, index: number) {
    const entries = model.container.instantiateModelsToScene(
      (name) => `${name}-smg-${index}`,
    );
    for (const node of entries.rootNodes) {
      node.parent = this.root;
      for (const child of node.getChildMeshes(false)) {
        this.meshes.push(child);
        child.isPickable = false;
        child.receiveShadows = true;
      }
    }

    // The UZI shares the pistol skeleton, so the GLB has a full rig even
    // though it has no baked animation clips. glTF drives those bones through
    // TransformNodes, so the procedural animation has to write the linked
    // nodes. Writing Bone.rotation only changes a temporary Euler vector and
    // leaves the skinned mesh in its bind pose.
    for (const skeleton of entries.skeletons) {
      skeleton.useTextureToStoreBoneMatrices = true;
      for (const bone of skeleton.bones) {
        const node = bone.getTransformNode();
        if (!node) continue;
        const rest = node.rotationQuaternion
          ? node.rotationQuaternion.clone()
          : BABYLON.Quaternion.RotationYawPitchRoll(node.rotation.y, node.rotation.x, node.rotation.z);
        const entry: SmgBonePose = { node, rest };
        this.poses.set(bone.name, entry);
        this.poses.set(`${bone.name}-smg-${index}`, entry);
      }
    }

    this.root.scaling.setAll(COMBAT_CONFIG.SMG_MODEL_SCALE);
    this.restoreBones();
  }

  private bone(name: string): SmgBonePose | null {
    return this.poses.get(name) ?? this.poses.get(`${name}-smg-${this.index}`) ?? null;
  }

  /** Restore every bone driver to the exact pose the GLB was exported with. */
  private restoreBones() {
    for (const entry of new Set(this.poses.values())) {
      if (!entry.node.rotationQuaternion) {
        entry.node.rotationQuaternion = entry.rest.clone();
        continue;
      }
      entry.node.rotationQuaternion.copyFrom(entry.rest);
    }
  }

  /** Add a local-space Euler offset to one bone's exported rest rotation. */
  private pose(name: string, x: number, y: number, z: number) {
    const entry = this.bone(name);
    if (!entry) return;
    const offset = BABYLON.Quaternion.RotationYawPitchRoll(y, x, z);
    entry.node.rotationQuaternion = entry.rest.multiply(offset);
  }

  /**
   * Procedural gunner animation:
   * idle breathing, aim raise, per-round recoil and a reload dip.
   */
  private updateAnimation(
    dt: number,
    aiming: boolean,
    reloading: boolean,
  ) {
    this.animTime += dt;
    this.recoil = Math.max(0, this.recoil - dt * 6.5);
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * Math.min(1, dt * 8);
    this.reloadBlend += ((reloading ? 1 : 0) - this.reloadBlend) * Math.min(1, dt * 7);

    const sway = Math.sin(this.animTime * 2.1);
    const bob = Math.sin(this.animTime * 4.2);
    const aim = this.aimBlend;
    const reload = this.reloadBlend;
    const kick = this.recoil;

    this.pose('spine_03', -0.02 + sway * 0.012 + kick * 0.1 - reload * 0.08, 0, sway * 0.012);
    this.pose('head', sway * 0.015 + aim * 0.05 - reload * 0.12, 0, 0);

    // Weapon arm: raises on telegraph, punches back on every round.
    this.pose('upperarm_r', -0.12 - aim * 0.5 - kick * 0.24, 0, -0.1 - aim * 0.06);
    this.pose('lowerarm_r', -0.18 - aim * 0.34 - kick * 0.2, 0, 0);
    this.pose('hand_r', -kick * 0.14, 0, 0);
    this.pose('Gun_r', -kick * 0.28, 0, 0);

    // Support arm drops down and forward during the reload dip.
    this.pose('upperarm_l', -0.18 - aim * 0.32 + reload * 0.42, 0, 0.1);
    this.pose('lowerarm_l', -0.3 - aim * 0.18 + reload * 0.55, 0, 0);
    this.pose('hand_l', reload * 0.3, 0, 0);
    this.pose('Gun_l', reload * 0.2, 0, 0);

    // A little weight shift keeps the idle pose from looking frozen.
    this.pose('thigh_l', sway * 0.015, 0, 0);
    this.pose('thigh_r', -sway * 0.015 + bob * 0.004, 0, 0);
  }

  /** A blocky fallback gunner used only if the GLB cannot be loaded. */
  private buildProxy(index: number) {
    const body = new BABYLON.StandardMaterial(`smg-proxy-body-${index}`, this.scene);
    body.diffuseColor = new BABYLON.Color3(0.2, 0.22, 0.26);
    body.specularColor = new BABYLON.Color3(0.4, 0.42, 0.5);
    const visor = new BABYLON.StandardMaterial(`smg-proxy-visor-${index}`, this.scene);
    visor.diffuseColor = BABYLON.Color3.Black();
    visor.emissiveColor = new BABYLON.Color3(1, 0.35, 0.15);
    visor.disableLighting = true;

    const addBox = (
      name: string,
      pos: BABYLON.Vector3,
      size: BABYLON.Vector3,
      mat: BABYLON.Material,
    ) => {
      const mesh = BABYLON.MeshBuilder.CreateBox(
        `smg-${index}-${name}`,
        { width: size.x, height: size.y, depth: size.z },
        this.scene,
      );
      mesh.parent = this.root;
      mesh.position.copyFrom(pos);
      mesh.material = mat;
      mesh.isPickable = false;
      this.meshes.push(mesh);
    };

    addBox('leg-l', new BABYLON.Vector3(-0.14, 0.42, 0), new BABYLON.Vector3(0.2, 0.84, 0.24), body);
    addBox('leg-r', new BABYLON.Vector3(0.14, 0.42, 0), new BABYLON.Vector3(0.2, 0.84, 0.24), body);
    addBox('torso', new BABYLON.Vector3(0, 1.16, 0), new BABYLON.Vector3(0.56, 0.72, 0.32), body);
    addBox('head', new BABYLON.Vector3(0, 1.68, 0), new BABYLON.Vector3(0.3, 0.28, 0.3), body);
    addBox('visor', new BABYLON.Vector3(0, 1.7, 0.16), new BABYLON.Vector3(0.24, 0.07, 0.04), visor);
    addBox('gun', new BABYLON.Vector3(0.26, 1.38, 0.4), new BABYLON.Vector3(0.1, 0.16, 0.5), body);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get position(): BABYLON.Vector3 {
    return this.root.position;
  }

  get center(): BABYLON.Vector3 {
    return this.root.position.add(new BABYLON.Vector3(0, COMBAT_CONFIG.SMG_CENTER_HEIGHT, 0));
  }

  private get aimPoint(): BABYLON.Vector3 {
    return this.root.position.add(new BABYLON.Vector3(0, COMBAT_CONFIG.SMG_EYE_HEIGHT, 0));
  }

  get canBeShurikenTargeted(): boolean {
    return this.alive;
  }

  takeShurikenHit(): ShurikenHitResult {
    return this.alive ? 'kill' : 'ignore';
  }

  update(dt: number, timeScale: number, playerPosition: BABYLON.Vector3) {
    if (this.dying) {
      this.updateDeath(dt);
      return;
    }
    if (!this.alive || !this.aiEnabled) return;

    const scaledDt = dt * timeScale;
    const toPlayer = playerPosition.subtract(this.aimPoint);
    const distance = toPlayer.length();

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.1;
      this.hasLineOfSight = this.checkLineOfSight(playerPosition);
    }

    if (distance <= COMBAT_CONFIG.SMG_FACE_RANGE && this.hasLineOfSight) {
      this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
      this.yaw = this.turnToward(this.yaw, this.targetYaw, COMBAT_CONFIG.SMG_TURN_SPEED * dt);
      this.root.rotation.y = this.yaw;
    }

    // Reloading between magazines.
    if (this.reloadTimer > 0) {
      this.reloadTimer -= scaledDt;
      this.updateAnimation(scaledDt, false, true);
      if (this.reloadTimer <= 0) this.reloadTimer = 0;
      return;
    }

    // A magazine already in progress keeps firing even if the player breaks
    // line of sight halfway through it.
    if (this.burstRemaining > 0) {
      this.burstTimer -= scaledDt;
      this.updateAnimation(scaledDt, true, false);
      if (this.burstTimer <= 0) {
        this.fire(playerPosition);
        this.burstRemaining--;
        this.burstTimer = COMBAT_CONFIG.SMG_BURST_GAP;
        if (this.burstRemaining <= 0) {
          this.reloadTimer = COMBAT_CONFIG.SMG_RELOAD_TIME;
          this.fireCooldown = COMBAT_CONFIG.SMG_FIRE_INTERVAL;
          this.sight.setEnabled(false);
          this.sightMaterial.alpha = 0;
        }
      }
      return;
    }

    if (this.aimTimer > 0) {
      this.aimTimer -= scaledDt;
      this.drawSight(playerPosition);
      this.updateAnimation(scaledDt, true, false);
      if (this.aimTimer <= 0) {
        this.burstRemaining = COMBAT_CONFIG.SMG_BURST_COUNT;
        this.burstTimer = 0;
      }
      return;
    }

    this.updateAnimation(scaledDt, false, false);
    this.fireCooldown -= scaledDt;
    if (
      this.fireCooldown <= 0
      && distance <= COMBAT_CONFIG.SMG_RANGE
      && this.hasLineOfSight
    ) {
      this.aimTimer = COMBAT_CONFIG.SMG_AIM_TIME;
      this.fireCooldown = COMBAT_CONFIG.SMG_FIRE_INTERVAL;
      this.drawSight(playerPosition);
    }
  }

  private turnToward(current: number, target: number, maxStep: number): number {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return current + Math.max(-maxStep, Math.min(maxStep, delta));
  }

  private checkLineOfSight(playerPosition: BABYLON.Vector3): boolean {
    const from = this.aimPoint;
    const to = playerPosition.subtract(from);
    const distance = to.length();
    if (distance < 0.5) return true;
    const direction = to.scale(1 / distance);
    const hit = this.world.castRay(
      new RAPIER.Ray(from, direction),
      distance,
      true,
      undefined,
      undefined,
      undefined,
      this.playerBody,
    );
    return !hit;
  }

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

    const charge = 1 - this.aimTimer / COMBAT_CONFIG.SMG_AIM_TIME;
    this.sightMaterial.alpha = 0.3 + charge * 0.6;
    this.sight.scaling.x = 0.8 + charge;
    this.sight.scaling.z = 0.8 + charge;
  }

  private muzzlePosition(): BABYLON.Vector3 {
    const offset = COMBAT_CONFIG.SMG_MUZZLE_OFFSET;
    const local = new BABYLON.Vector3(offset.x, offset.y, offset.z);
    const rotated = new BABYLON.Vector3();
    local.rotateByQuaternionToRef(
      BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, this.yaw),
      rotated,
    );
    return this.root.position.add(rotated);
  }

  private fire(playerPosition: BABYLON.Vector3) {
    const muzzle = this.muzzlePosition();
    const direction = playerPosition.subtract(muzzle).normalize();
    this.recoil = 1;
    this.projectiles.spawnBolt(muzzle, direction, COMBAT_CONFIG.BOLT_SPEED, false);
    if (this.burstRemaining <= 1) {
      this.sight.setEnabled(false);
      this.sightMaterial.alpha = 0;
    }
    this.onFire?.(muzzle);
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.dying = true;
    this.deathTimer = DEATH_DURATION;
    this.burstRemaining = 0;
    this.aimTimer = 0;
    this.reloadTimer = 0;
    this.sight.setEnabled(false);
    this.sightMaterial.alpha = 0;
    // Freeze the gunner in its current pose as it falls.
    this.aimBlend = 0;
    this.reloadBlend = 0;
    this.recoil = 0;
  }

  private updateDeath(dt: number) {
    this.deathTimer -= dt;
    const t = Math.max(0, Math.min(1, 1 - this.deathTimer / DEATH_DURATION));
    this.root.rotation.x = -t * 1.3;
    this.root.position.y = this.spawnPosition.y - t * 0.3;
    for (const mesh of this.meshes) mesh.visibility = 1 - t;
    if (this.deathTimer <= 0) {
      this.dying = false;
      this.setVisible(false);
    }
  }

  respawn() {
    this.alive = true;
    this.dying = false;
    this.deathTimer = 0;
    this.aimTimer = 0;
    this.burstRemaining = 0;
    this.reloadTimer = 0;
    this.fireCooldown = COMBAT_CONFIG.SMG_FIRE_INTERVAL;
    this.animTime = 0;
    this.recoil = 0;
    this.aimBlend = 0;
    this.reloadBlend = 0;
    this.restoreBones();
    this.yaw = this.spawnYaw;
    this.targetYaw = this.spawnYaw;
    this.root.position.copyFrom(this.spawnPosition);
    this.root.rotation.set(0, this.spawnYaw, 0);
    this.sight.setEnabled(false);
    this.sightMaterial.alpha = 0;
    for (const mesh of this.meshes) mesh.visibility = 1;
    this.setVisible(true);
  }

  private setVisible(visible: boolean) {
    for (const mesh of this.meshes) mesh.setEnabled(visible);
  }

  dispose() {
    this.sight.dispose();
    this.sightMaterial.dispose();
    for (const mesh of this.meshes) mesh.dispose();
    this.root.dispose();
  }
}
