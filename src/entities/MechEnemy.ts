import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import '@babylonjs/loaders/glTF';
import { COMBAT_CONFIG } from '../config/combat';
import type { MeleeEnemy, ShurikenHitResult } from './Enemy';

/** The shared skinned Mech, loaded once and cloned per placement. */
export interface MechModelSource {
  container: BABYLON.AssetContainer;
  hasModel: boolean;
}

type MechState = 'wait' | 'telegraph' | 'recover' | 'stunned' | 'dying';

/** A laser wave travelling away from its Mech. */
interface Wave {
  position: BABYLON.Vector3;
  direction: BABYLON.Vector3;
  mesh: BABYLON.Mesh;
  material: BABYLON.StandardMaterial;
  life: number;
}

/** How long a wave is visible while it flies, in seconds. */
const WAVE_VISUAL_LIFE = 1.2;

/**
 * A Ghostrunner Mech (the Waver).
 *
 * It stays planted, snaps to the player's position when it decides to fire,
 * lights its head red while charging, then sends a growing laser wall along
 * that locked sight line. A shuriken stuns it instead of killing it: while
 * stunned it turns into a grapple point, and grappling to it performs the
 * execution.
 */
export class MechEnemy implements MeleeEnemy {
  private scene: BABYLON.Scene;
  private world: RAPIER.World;
  private playerBody: RAPIER.RigidBody;
  private spawnPosition: BABYLON.Vector3;
  private spawnYaw = 0;
  private root: BABYLON.TransformNode;
  private meshes: BABYLON.AbstractMesh[] = [];
  private groups = new Map<string, BABYLON.AnimationGroup>();
  private currentGroup: BABYLON.AnimationGroup | null = null;

  private state: MechState = 'wait';
  private timer = 0;
  private cooldown = 0;
  private yaw = 0;
  /** The player's position when the current attack started. */
  private aimSnapshot: BABYLON.Vector3 | null = null;
  private losTimer = 0;
  private hasLineOfSight = false;
  private alive = true;
  private deathTimer = 0;
  private waves: Wave[] = [];

  private headGlow: BABYLON.Mesh;
  private headGlowMaterial: BABYLON.StandardMaterial;
  private sight: BABYLON.Mesh;
  private sightMaterial: BABYLON.StandardMaterial;

  public aiEnabled = true;
  /** Fired when the wave reaches the player. */
  public onPlayerStrike?: (position: BABYLON.Vector3) => void;
  /** Fired when the Mech enters or leaves the shuriken-stunned state. */
  public onStunChange?: (stunned: boolean) => void;
  /** Fired when the Mech starts charging its wave. */
  public onCharge?: (position: BABYLON.Vector3) => void;

  constructor(
    scene: BABYLON.Scene,
    world: RAPIER.World,
    playerBody: RAPIER.RigidBody,
    model: MechModelSource,
    spawnPosition: BABYLON.Vector3,
    index: number,
    facing = 0,
  ) {
    this.scene = scene;
    this.world = world;
    this.playerBody = playerBody;
    this.spawnPosition = spawnPosition.clone();
    this.spawnYaw = facing;
    this.cooldown = COMBAT_CONFIG.MECH_FIRE_INTERVAL * (0.5 + index * 0.2);

    this.root = new BABYLON.TransformNode(`mech-${index}`, scene);
    this.root.position.copyFrom(spawnPosition);
    this.root.rotation.y = facing;
    this.yaw = facing;

    if (model.hasModel) {
      this.buildFromModel(model, index);
    } else {
      this.buildProxy(index);
    }

    // The head light doubles as the charge cue: red before the wave, cyan
    // while shuriken-stunned, dark whenever the Mech is idle.
    this.headGlowMaterial = new BABYLON.StandardMaterial(`mech-head-${index}`, scene);
    this.headGlowMaterial.diffuseColor = BABYLON.Color3.Black();
    this.headGlowMaterial.specularColor = BABYLON.Color3.Black();
    this.headGlowMaterial.emissiveColor = new BABYLON.Color3(1, 0.1, 0.05);
    this.headGlowMaterial.disableLighting = true;
    this.headGlowMaterial.alpha = 0;
    this.headGlow = BABYLON.MeshBuilder.CreateSphere(`mech-head-glow-${index}`, {
      diameter: 0.55, segments: 12,
    }, scene);
    this.headGlow.material = this.headGlowMaterial;
    this.headGlow.parent = this.root;
    this.headGlow.position.y = COMBAT_CONFIG.MECH_MUZZLE_HEIGHT;
    this.headGlow.isPickable = false;
    this.headGlow.alwaysSelectAsActiveMesh = true;
    this.headGlow.setEnabled(false);

    this.sightMaterial = new BABYLON.StandardMaterial(`mech-sight-${index}`, scene);
    this.sightMaterial.diffuseColor = BABYLON.Color3.Black();
    this.sightMaterial.specularColor = BABYLON.Color3.Black();
    this.sightMaterial.emissiveColor = new BABYLON.Color3(1, 0.05, 0.03);
    this.sightMaterial.disableLighting = true;
    this.sightMaterial.alpha = 0;
    this.sight = BABYLON.MeshBuilder.CreateCylinder(`mech-sight-${index}`, {
      height: 1, diameter: 0.035, tessellation: 6,
    }, scene);
    this.sight.material = this.sightMaterial;
    this.sight.isPickable = false;
    this.sight.alwaysSelectAsActiveMesh = true;
    this.sight.setEnabled(false);
  }

  static async loadModel(scene: BABYLON.Scene): Promise<MechModelSource> {
    try {
      const container = await BABYLON.loadAssetContainerAsync(
        COMBAT_CONFIG.MECH_MODEL_URL,
        scene,
      );
      if (!container.meshes.length) {
        container.dispose();
        return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
      }
      return { container, hasModel: true };
    } catch (error) {
      console.warn('Mech model failed to load, using the proxy', error);
      return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
    }
  }

  private buildFromModel(model: MechModelSource, index: number) {
    const suffix = `-mech${index}`;
    const entries = model.container.instantiateModelsToScene(
      (name) => `${name}${suffix}`,
      true,
    );
    for (const node of entries.rootNodes) node.parent = this.root;
    for (const mesh of this.collectMeshes(entries.rootNodes)) {
      this.meshes.push(mesh);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
    }
    // A skinned Mech has enough bones to need the texture bone path.
    for (const skeleton of entries.skeletons) {
      skeleton.useTextureToStoreBoneMatrices = true;
    }
    for (const group of entries.animationGroups) {
      const original = group.name.endsWith(suffix)
        ? group.name.slice(0, -suffix.length)
        : group.name;
      this.groups.set(original, group);
      this.neutralizeRootMotion(group);
    }
    this.root.scaling.setAll(COMBAT_CONFIG.MECH_MODEL_SCALE);
    this.playClip('idle', true);
  }

  /** Keep animation root motion from dragging the Mech away from its spawn. */
  private neutralizeRootMotion(group: BABYLON.AnimationGroup) {
    for (const targeted of group.targetedAnimations) {
      const target = targeted.target as BABYLON.Node | null;
      const name = target?.name ?? '';
      if (targeted.animation.targetProperty !== 'position') continue;
      if (!/^(Bone|Root|IK_Root)/.test(name)) continue;
      for (const key of targeted.animation.getKeys()) {
        key.value = new BABYLON.Vector3(0, 0, 0);
      }
    }
  }

  private collectMeshes(nodes: BABYLON.Node[]): BABYLON.AbstractMesh[] {
    const found: BABYLON.AbstractMesh[] = [];
    for (const node of nodes) {
      if ((node as BABYLON.AbstractMesh).getTotalVertices) {
        found.push(node as BABYLON.AbstractMesh);
      }
      for (const child of node.getChildMeshes(false)) found.push(child);
    }
    return [...new Set(found)];
  }

  /** Fallback silhouette: a tall two-legged robot with a bright head. */
  private buildProxy(index: number) {
    const body = new BABYLON.StandardMaterial(`mech-proxy-body-${index}`, this.scene);
    body.diffuseColor = new BABYLON.Color3(0.13, 0.16, 0.2);
    body.specularColor = new BABYLON.Color3(0.5, 0.55, 0.62);
    const dark = new BABYLON.StandardMaterial(`mech-proxy-dark-${index}`, this.scene);
    dark.diffuseColor = new BABYLON.Color3(0.07, 0.08, 0.1);

    const addBox = (
      name: string,
      pos: BABYLON.Vector3,
      size: BABYLON.Vector3,
      mat: BABYLON.Material,
    ) => {
      const mesh = BABYLON.MeshBuilder.CreateBox(`mech-${index}-${name}`, {
        width: size.x, height: size.y, depth: size.z,
      }, this.scene);
      mesh.parent = this.root;
      mesh.position.copyFrom(pos);
      mesh.material = mat;
      mesh.isPickable = false;
      this.meshes.push(mesh);
    };

    addBox('leg-l', new BABYLON.Vector3(-0.45, 0.85, 0), new BABYLON.Vector3(0.32, 1.7, 0.38), dark);
    addBox('leg-r', new BABYLON.Vector3(0.45, 0.85, 0), new BABYLON.Vector3(0.32, 1.7, 0.38), dark);
    addBox('pelvis', new BABYLON.Vector3(0, 1.85, 0), new BABYLON.Vector3(0.95, 0.5, 0.6), body);
    addBox('torso', new BABYLON.Vector3(0, 2.55, 0), new BABYLON.Vector3(1.1, 1.1, 0.7), body);
    addBox('head', new BABYLON.Vector3(0, 3.25, 0), new BABYLON.Vector3(0.55, 0.42, 0.5), dark);
    addBox('arm-l', new BABYLON.Vector3(-0.8, 2.45, 0.1), new BABYLON.Vector3(0.28, 1.1, 0.32), body);
    addBox('arm-r', new BABYLON.Vector3(0.8, 2.45, 0.1), new BABYLON.Vector3(0.28, 1.1, 0.32), body);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get position(): BABYLON.Vector3 {
    return this.root.position;
  }

  get center(): BABYLON.Vector3 {
    return this.root.position.add(new BABYLON.Vector3(0, COMBAT_CONFIG.MECH_CENTER_HEIGHT, 0));
  }

  private get muzzle(): BABYLON.Vector3 {
    return this.root.position.add(new BABYLON.Vector3(0, COMBAT_CONFIG.MECH_MUZZLE_HEIGHT, 0));
  }

  get isStunned(): boolean {
    return this.state === 'stunned';
  }

  get canBeShurikenTargeted(): boolean {
    return this.alive && this.state !== 'dying' && this.state !== 'stunned';
  }

  /** A shuriken does not kill the Mech; it opens the grapple execution window. */
  takeShurikenHit(): ShurikenHitResult {
    if (!this.alive || this.state === 'dying') return 'ignore';
    if (this.state === 'stunned') return 'ignore';
    this.state = 'stunned';
    this.timer = COMBAT_CONFIG.MECH_STUN_DURATION;
    this.aimSnapshot = null;
    this.clearWaves();
    this.sight.setEnabled(false);
    this.sightMaterial.alpha = 0;
    this.playClip('idle', true);
    this.onStunChange?.(true);
    return 'stun';
  }

  /** Grappling to a stunned Mech performs the finisher. */
  execute(): boolean {
    if (!this.alive || this.state === 'dying') return false;
    this.kill();
    return true;
  }

  update(dt: number, timeScale: number, playerPosition: BABYLON.Vector3) {
    if (this.state === 'dying') {
      this.updateDeath(dt);
      this.updateWaves(dt, timeScale, playerPosition);
      return;
    }
    if (!this.alive || !this.aiEnabled) return;

    const scaled = dt * timeScale;
    this.updateWaves(dt, timeScale, playerPosition);

    const toPlayer = playerPosition.subtract(this.muzzle);
    const distance = toPlayer.length();
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.12;
      this.hasLineOfSight = this.checkLineOfSight(playerPosition);
    }

    // A stunned Mech is a stationary grapple point: it watches the player but
    // never charges or fires until the stun expires.
    if (this.state === 'stunned') {
      this.timer -= scaled;
      this.setCue('stun', 0.55 + Math.sin(performance.now() / 130) * 0.12);
      if (this.timer <= 0) {
        this.state = 'wait';
        this.cooldown = COMBAT_CONFIG.MECH_FIRE_INTERVAL * 0.6;
        this.setCue('off', 0);
        this.onStunChange?.(false);
      }
      return;
    }

    // The Mech does not track the player continuously. It acquires a position
    // once when it starts an attack, snaps to face it, and fires at that spot.
    switch (this.state) {
      case 'wait': {
        this.setCue('off', 0);
        this.cooldown -= scaled;
        if (
          this.cooldown <= 0
          && distance <= COMBAT_CONFIG.MECH_AGGRO_RANGE
          && this.hasLineOfSight
        ) {
          this.state = 'telegraph';
          this.timer = COMBAT_CONFIG.MECH_TELEGRAPH;
          // Snapshot the target now. Everything from here until the wave is
          // fired uses this point, so strafing does not drag the aim around.
          this.aimSnapshot = playerPosition.clone();
          const toSnapshot = this.aimSnapshot.subtract(this.muzzle);
          this.yaw = Math.atan2(toSnapshot.x, toSnapshot.z);
          this.root.rotation.y = this.yaw;
          this.playClip('attack', false);
          this.onCharge?.(this.position.clone());
        }
        break;
      }
      case 'telegraph': {
        this.timer -= scaled;
        const charge = 1 - Math.max(0, this.timer) / COMBAT_CONFIG.MECH_TELEGRAPH;
        this.setCue('charge', charge);
        this.drawSight(this.aimSnapshot ?? playerPosition, charge);
        if (this.timer <= 0) {
          this.fireWave(this.aimSnapshot ?? playerPosition);
          this.aimSnapshot = null;
          this.state = 'recover';
          this.timer = 0.7;
          this.cooldown = COMBAT_CONFIG.MECH_FIRE_INTERVAL;
          this.sight.setEnabled(false);
          this.sightMaterial.alpha = 0;
          this.setCue('off', 0);
        }
        break;
      }
      case 'recover': {
        this.timer -= scaled;
        if (this.timer <= 0) {
          this.state = 'wait';
          this.playClip('idle', true);
        }
        break;
      }
    }
  }

  private checkLineOfSight(playerPosition: BABYLON.Vector3): boolean {
    const from = this.muzzle;
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

  /** Red head glow plus a laser line that tracks the player while charging. */
  private setCue(mode: 'off' | 'charge' | 'stun', charge: number) {
    if (mode === 'off') {
      this.headGlow.setEnabled(false);
      this.headGlowMaterial.alpha = 0;
      return;
    }
    this.headGlow.setEnabled(true);
    if (mode === 'stun') {
      this.headGlowMaterial.emissiveColor.set(0.35, 0.95, 1);
      this.headGlowMaterial.alpha = charge;
      this.headGlow.scaling.setAll(1.1);
    } else {
      this.headGlowMaterial.emissiveColor.set(1, 0.04 + charge * 0.1, 0.02);
      this.headGlowMaterial.alpha = 0.2 + charge * 0.8;
      this.headGlow.scaling.setAll(0.75 + charge * 0.9);
    }
  }

  private drawSight(target: BABYLON.Vector3, charge: number) {
    const muzzle = this.muzzle;
    const direction = target.subtract(muzzle);
    const length = Math.max(direction.length(), 0.001);
    direction.scaleInPlace(1 / length);
    this.sight.setEnabled(true);
    this.sight.position.copyFrom(muzzle.add(direction.scale(length * 0.5)));
    this.sight.scaling.set(0.7 + charge, length, 0.7 + charge);
    const rotation = BABYLON.Quaternion.Identity();
    BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Axis.Y, direction, rotation);
    this.sight.rotationQuaternion = rotation;
    this.sightMaterial.alpha = 0.25 + charge * 0.6;
  }

  /** Launch the expanding wave along the current sight line. */
  private fireWave(playerPosition: BABYLON.Vector3) {
    const origin = this.muzzle;
    const direction = playerPosition.subtract(origin).normalize();
    if (direction.lengthSquared() < 0.5) return;

    const material = new BABYLON.StandardMaterial(`mech-wave-${this.waves.length}`, this.scene);
    material.diffuseColor = BABYLON.Color3.Black();
    material.specularColor = BABYLON.Color3.Black();
    material.emissiveColor = new BABYLON.Color3(1, 0.12, 0.05);
    material.disableLighting = true;
    material.alpha = 0.8;
    material.backFaceCulling = false;

    // A vertical wall of light travelling down the lane. Its local Z is the
    // travel direction; the wall face spans X (width) and Y (height).
    const mesh = BABYLON.MeshBuilder.CreateBox('mech-wave-mesh', {
      width: 1,
      height: COMBAT_CONFIG.MECH_WAVE_HEIGHT,
      depth: 0.08,
    }, this.scene);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.position.copyFrom(origin);
    // Put the bottom of the wall at the Mech's feet instead of centring it on
    // the muzzle, while the impact test still follows the muzzle-height line.
    mesh.position.y -= COMBAT_CONFIG.MECH_MUZZLE_HEIGHT - COMBAT_CONFIG.MECH_WAVE_HEIGHT * 0.5;
    const rotation = BABYLON.Quaternion.Identity();
    BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Axis.Z, direction, rotation);
    mesh.rotationQuaternion = rotation;

    this.waves.push({
      position: origin.clone(),
      direction,
      mesh,
      material,
      life: COMBAT_CONFIG.MECH_WAVE_LIFETIME,
    });
  }

  private updateWaves(dt: number, timeScale: number, playerPosition: BABYLON.Vector3) {
    const scaled = dt * timeScale;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      if (!wave) continue;
      wave.life -= dt;
      const previous = wave.position.clone();
      wave.position.addInPlace(wave.direction.scale(COMBAT_CONFIG.MECH_WAVE_SPEED * scaled));
      wave.mesh.position.copyFrom(wave.position);
      wave.mesh.position.y -= COMBAT_CONFIG.MECH_MUZZLE_HEIGHT - COMBAT_CONFIG.MECH_WAVE_HEIGHT * 0.5;

      const growth = Math.min(1, (WAVE_VISUAL_LIFE - wave.life) / WAVE_VISUAL_LIFE);
      const width = 0.4 + growth * COMBAT_CONFIG.MECH_WAVE_RADIUS * 2;
      wave.mesh.scaling.set(width, 1, 1);
      wave.material.alpha = Math.max(0, 0.85 * (wave.life / WAVE_VISUAL_LIFE));

      // Blocks stop the wave just like they stop a bolt.
      const delta = wave.position.subtract(previous);
      const distance = delta.length();
      if (distance > 0.001) {
        const dir = delta.scale(1 / distance);
        const hit = this.world.castRay(
          new RAPIER.Ray(previous, dir),
          distance,
          true,
          undefined,
          undefined,
          undefined,
          this.playerBody,
        );
        if (hit) {
          this.removeWave(i);
          continue;
        }
      }

      const toPlayer = playerPosition.subtract(wave.position);
      // The wave is a wall of energy: ignore its height and measure against
      // its current visible width, with a minimum so a fresh wave still hits.
      const flatDistance = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.z * toPlayer.z);
      const hitRadius = Math.max(COMBAT_CONFIG.MECH_WAVE_HIT_RADIUS, width * 0.5);
      if (flatDistance <= hitRadius) {
        this.onPlayerStrike?.(wave.position.clone());
        this.removeWave(i);
        continue;
      }

      if (wave.life <= 0) this.removeWave(i);
    }
  }

  private removeWave(index: number) {
    const wave = this.waves[index];
    if (!wave) return;
    wave.mesh.dispose();
    wave.material.dispose();
    this.waves.splice(index, 1);
  }

  private clearWaves() {
    for (let i = this.waves.length - 1; i >= 0; i--) this.removeWave(i);
  }

  private playClip(name: string, loop: boolean) {
    let group = this.groups.get(name);
    if (!group) {
      // The exported clip names are W01_wav_idle_loop, W05_wav_attack_3 etc.
      for (const [key, value] of this.groups) {
        if (key.toLowerCase().includes(name.toLowerCase())) {
          group = value;
          break;
        }
      }
    }
    if (!group) return;
    if (this.currentGroup && this.currentGroup !== group) this.currentGroup.stop();
    this.currentGroup = group;
    if (group.isStarted) group.stop();
    group.loopAnimation = loop;
    group.start(loop);
  }

  kill() {
    if (!this.alive) return;
    const wasStunned = this.state === 'stunned';
    this.alive = false;
    this.state = 'dying';
    this.deathTimer = COMBAT_CONFIG.MECH_DEATH_DURATION;
    this.aimSnapshot = null;
    this.clearWaves();
    this.sight.setEnabled(false);
    this.sightMaterial.alpha = 0;
    this.setCue('off', 0);
    this.playClip('death', false);
    if (wasStunned) this.onStunChange?.(false);
  }

  private updateDeath(dt: number) {
    this.deathTimer -= dt;
    const t = Math.max(0, Math.min(1, 1 - this.deathTimer / COMBAT_CONFIG.MECH_DEATH_DURATION));
    this.root.rotation.x = -t * 1.15;
    this.root.position.y = this.spawnPosition.y - t * 0.5;
    for (const mesh of this.meshes) mesh.visibility = 1 - t;
    if (this.deathTimer <= 0) this.setVisible(false);
  }

  respawn() {
    this.alive = true;
    this.state = 'wait';
    this.deathTimer = 0;
    this.cooldown = COMBAT_CONFIG.MECH_FIRE_INTERVAL;
    this.timer = 0;
    this.yaw = this.spawnYaw;
    this.aimSnapshot = null;
    this.root.position.copyFrom(this.spawnPosition);
    this.root.rotation.set(0, this.spawnYaw, 0);
    this.clearWaves();
    this.sight.setEnabled(false);
    this.sightMaterial.alpha = 0;
    this.setCue('off', 0);
    for (const mesh of this.meshes) mesh.visibility = 1;
    this.setVisible(true);
    this.playClip('idle', true);
    this.onStunChange?.(false);
  }

  private setVisible(visible: boolean) {
    for (const mesh of this.meshes) mesh.setEnabled(visible);
  }

  dispose() {
    this.clearWaves();
    this.sight.dispose();
    this.sightMaterial.dispose();
    this.headGlow.dispose();
    this.headGlowMaterial.dispose();
    for (const group of this.groups.values()) group.dispose();
    for (const mesh of this.meshes) mesh.dispose();
    this.root.dispose();
  }
}
