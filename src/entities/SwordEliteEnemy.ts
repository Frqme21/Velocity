import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import '@babylonjs/loaders/glTF';
import { COMBAT_CONFIG as DUEL } from '../config/combat';
import type { MeleeEnemy, ShurikenHitResult } from './Enemy';

/** The shared skinned body, loaded once and cloned per elite. */
export interface SwordEliteModelSource {
  container: BABYLON.AssetContainer;
  hasModel: boolean;
}

/** The Elite's own katana, loaded once and parented to its weapon hand. */
export interface SwordEliteKatanaSource {
  container: BABYLON.AssetContainer;
  hasModel: boolean;
}

type DuelState = 'wait' | 'windup' | 'dash' | 'stunned' | 'blocked' | 'recover' | 'dying';

const CENTER_OFFSET = new BABYLON.Vector3(0, 1.02, 0);
const EYE_OFFSET = new BABYLON.Vector3(0, 1.55, 0);
const DASH_LAUNCH_CLIP = 'ET1_turbo_to_dash';
const DASH_RUN_CLIP = 'ESW08_sw_spirint_F450';

/**
 * A Ghostrunner Sword Elite.
 *
 * It waits until the player is in range, then glows red and winds up. The
 * player has to hit it in the tail of that telegraph: a perfect hit stuns it
 * and opens a separate follow-up window, a hit at any other time is blocked
 * and knocks the player back, and a dash that is left unanswered kills.
 */
export class SwordEliteEnemy implements MeleeEnemy {
  private scene: BABYLON.Scene;
  private world: RAPIER.World;
  private playerBody: RAPIER.RigidBody;
  private spawnPosition: BABYLON.Vector3;
  private initialWait: number;
  private root: BABYLON.TransformNode;

  private entries: BABYLON.InstantiatedEntries | null = null;
  private katanaEntries: BABYLON.InstantiatedEntries | null = null;
  private meshes: BABYLON.AbstractMesh[] = [];
  private proxyMaterials: BABYLON.Material[] = [];
  private groups = new Map<string, BABYLON.AnimationGroup>();
  private currentGroup: BABYLON.AnimationGroup | null = null;
  private weaponSocket: BABYLON.TransformNode | null = null;

  /** The red telegraph around the body and the shrinking ring on the floor. */
  private aura: BABYLON.Mesh;
  private auraMaterial: BABYLON.StandardMaterial;
  private ring: BABYLON.Mesh;
  private ringMaterial: BABYLON.StandardMaterial;
  /** A bright target ring that appears only during the punish window. */
  private strikeRing: BABYLON.Mesh;
  private strikeRingMaterial: BABYLON.StandardMaterial;

  private alive = true;
  private state: DuelState = 'wait';
  private facing: number;
  private yaw = 0;

  private waitTimer = 0;
  private telegraphTimer = 0;
  private dashStartup = 0;
  private dashTimer = 0;
  private dashElapsed = 0;
  private stunTimer = 0;
  private blockTimer = 0;
  private recoverTimer = 0;
  private deathTimer = 0;
  private dashDirection = new BABYLON.Vector3(0, 0, 1);

  private losTimer = 0;
  private hasLineOfSight = false;
  /** True during the last moments of the dash, just before the blade lands. */
  private dashPunishOpen = false;

  /** False while a cinematic owns the screen. */
  public aiEnabled = true;
  /** Fired when the katana actually reaches the player. */
  public onPlayerStrike?: (position: BABYLON.Vector3) => void;

  constructor(
    scene: BABYLON.Scene,
    world: RAPIER.World,
    playerBody: RAPIER.RigidBody,
    model: SwordEliteModelSource,
    katana: SwordEliteKatanaSource,
    spawnPosition: BABYLON.Vector3,
    index: number,
    facing = 0,
  ) {
    this.scene = scene;
    this.world = world;
    this.playerBody = playerBody;
    this.spawnPosition = spawnPosition.clone();
    this.facing = facing;
    // Enemies are TransformNodes, not Rapier bodies, so they do not fall onto
    // the floor on their own. Drop the spawn marker onto the nearest surface.
    this.snapToGround(this.spawnPosition);

    this.root = new BABYLON.TransformNode(`sword-elite-${index}`, scene);
    this.root.position.copyFrom(this.spawnPosition);
    this.yaw = facing;
    this.root.rotation.y = facing;

    if (model.hasModel) {
      this.buildFromModel(model, katana, index);
    } else {
      this.buildProxy(index);
    }

    const glow = this.buildGlow(index);
    this.aura = glow.aura;
    this.auraMaterial = glow.auraMaterial;
    this.ring = glow.ring;
    this.ringMaterial = glow.ringMaterial;
    this.strikeRing = glow.strikeRing;
    this.strikeRingMaterial = glow.strikeRingMaterial;

    // Stagger the first attacks so a row of Elites does not dash in unison.
    this.initialWait = DUEL.SWORD_ATTACK_COOLDOWN * (0.6 + index * 0.3);
    this.waitTimer = this.initialWait;
    this.playIdle();
  }

  // ------------------------------------------------------------------
  // Model
  // ------------------------------------------------------------------

  static async loadModel(scene: BABYLON.Scene): Promise<SwordEliteModelSource> {
    try {
      const container = await BABYLON.loadAssetContainerAsync(
        DUEL.SWORD_ELITE_MODEL_URL,
        scene,
      );
      if (!container.meshes.length) {
        container.dispose();
        return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
      }
      return { container, hasModel: true };
    } catch (error) {
      console.warn('Sword Elite model failed to load, using the proxy', error);
      return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
    }
  }

  static async loadKatana(scene: BABYLON.Scene): Promise<SwordEliteKatanaSource> {
    try {
      const container = await BABYLON.loadAssetContainerAsync(
        DUEL.SWORD_ELITE_KATANA_URL,
        scene,
      );
      if (!container.meshes.length) {
        container.dispose();
        return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
      }
      return { container, hasModel: true };
    } catch (error) {
      console.warn('Sword Elite katana failed to load, using the proxy blade', error);
      return { container: null as unknown as BABYLON.AssetContainer, hasModel: false };
    }
  }

  private buildFromModel(
    model: SwordEliteModelSource,
    katana: SwordEliteKatanaSource,
    index: number,
  ) {
    const suffix = `-se${index}`;
    // Clone materials: the red telegraph is per enemy and must never tint a
    // second elite standing next to it.
    this.entries = model.container.instantiateModelsToScene(
      (name) => `${name}${suffix}`,
      true,
    );

    for (const node of this.entries.rootNodes) node.parent = this.root;
    for (const mesh of this.collectMeshes(this.entries.rootNodes)) {
      this.meshes.push(mesh);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
    }

    // 97 bones exceed the vertex uniform budget on most GPUs. The texture
    // path is required or the skinned mesh silently disappears.
    for (const skeleton of this.entries.skeletons) {
      skeleton.useTextureToStoreBoneMatrices = true;
    }

    for (const group of this.entries.animationGroups) {
      const original = group.name.endsWith(suffix)
        ? group.name.slice(0, -suffix.length)
        : group.name;
      this.groups.set(original, group);
      this.neutralizeRootMotion(group);
    }

    const nodes: BABYLON.Node[] = [];
    for (const node of this.entries.rootNodes) {
      nodes.push(node, ...node.getDescendants(false));
    }
    this.weaponSocket = nodes.find(
      (node): node is BABYLON.TransformNode => node.name.startsWith('Gun_r'),
    ) ?? null;

    if (katana.hasModel && this.weaponSocket) {
      this.katanaEntries = katana.container.instantiateModelsToScene(
        (name) => `${name}${suffix}`,
        true,
      );
      for (const node of this.katanaEntries.rootNodes) {
        node.parent = this.weaponSocket;
        const transform = node as BABYLON.TransformNode;
        transform.position.setAll(0);
        // Blender exports both GLBs with a coordinate-correction root:
        // a 180 degree Y rotation plus a mirrored Z scale. The rotation is
        // stored in rotationQuaternion, so setting `rotation` does nothing;
        // overwriting `scaling` with all-positive values used to flip the
        // blade backwards through the Elite's body. Scale the existing vector
        // instead, which keeps the mirror sign and points the katana forward.
        transform.scaling.scaleInPlace(DUEL.SWORD_KATANA_SCALE);
      }
      for (const mesh of this.collectMeshes(this.katanaEntries.rootNodes)) {
        this.meshes.push(mesh);
        mesh.isPickable = false;
      }
    } else {
      this.buildProxyKatana(index);
    }
  }

  /** Remove the baked-in root translation so only our transform moves them. */
  private neutralizeRootMotion(group: BABYLON.AnimationGroup) {
    for (const targeted of group.targetedAnimations) {
      const target = targeted.target as BABYLON.Node | null;
      if (!target?.name?.startsWith('Root')) continue;
      if (targeted.animation.targetProperty !== 'position') continue;
      for (const key of targeted.animation.getKeys()) {
        key.value = new BABYLON.Vector3(0, 0, 0);
      }
    }
  }

  private collectMeshes(nodes: BABYLON.Node[]): BABYLON.AbstractMesh[] {
    const meshes: BABYLON.AbstractMesh[] = [];
    for (const node of nodes) {
      if ((node as BABYLON.AbstractMesh).getTotalVertices) {
        meshes.push(node as BABYLON.AbstractMesh);
      }
      for (const child of node.getChildMeshes(false)) meshes.push(child);
    }
    return [...new Set(meshes)];
  }

  /** A dark armoured stand-in used only when the GLB cannot be loaded. */
  private buildProxy(index: number) {
    const body = new BABYLON.StandardMaterial(`sword-elite-${index}-proxy-body`, this.scene);
    body.diffuseColor = new BABYLON.Color3(0.1, 0.11, 0.14);
    body.specularColor = new BABYLON.Color3(0.5, 0.5, 0.55);
    const trim = new BABYLON.StandardMaterial(`sword-elite-${index}-proxy-trim`, this.scene);
    trim.emissiveColor = new BABYLON.Color3(0.9, 0.12, 0.08);
    trim.disableLighting = true;
    this.proxyMaterials.push(body, trim);

    const addBox = (
      name: string,
      position: BABYLON.Vector3,
      size: BABYLON.Vector3,
      material: BABYLON.Material,
    ) => {
      const mesh = BABYLON.MeshBuilder.CreateBox(
        `sword-elite-${index}-${name}`,
        { width: size.x, height: size.y, depth: size.z },
        this.scene,
      );
      mesh.parent = this.root;
      mesh.position.copyFrom(position);
      mesh.material = material;
      mesh.isPickable = false;
      this.meshes.push(mesh);
    };

    addBox('leg-l', new BABYLON.Vector3(-0.14, 0.42, 0), new BABYLON.Vector3(0.2, 0.84, 0.24), body);
    addBox('leg-r', new BABYLON.Vector3(0.14, 0.42, 0), new BABYLON.Vector3(0.2, 0.84, 0.24), body);
    addBox('torso', new BABYLON.Vector3(0, 1.2, 0), new BABYLON.Vector3(0.56, 0.74, 0.3), body);
    addBox('visor', new BABYLON.Vector3(0, 1.72, 0.16), new BABYLON.Vector3(0.26, 0.07, 0.04), trim);
    addBox('hand-r', new BABYLON.Vector3(0.34, 1.36, 0.34), new BABYLON.Vector3(0.14, 0.14, 0.14), body);

    const blade = new BABYLON.StandardMaterial(`sword-elite-${index}-proxy-blade`, this.scene);
    blade.diffuseColor = new BABYLON.Color3(0.68, 0.75, 0.82);
    blade.emissiveColor = new BABYLON.Color3(0.08, 0.1, 0.12);
    this.proxyMaterials.push(blade);
    const proxyKatana = BABYLON.MeshBuilder.CreateBox(
      `sword-elite-${index}-proxy-katana`,
      { width: 0.05, height: 0.03, depth: 0.95 },
      this.scene,
    );
    proxyKatana.parent = this.root;
    proxyKatana.position.set(0.34, 1.36, 0.82);
    proxyKatana.material = blade;
    proxyKatana.isPickable = false;
    this.meshes.push(proxyKatana);
  }

  /** Used when the real katana GLB is missing but the body loaded. */
  private buildProxyKatana(index: number) {
    const socket = this.weaponSocket ?? this.root;
    const blade = new BABYLON.StandardMaterial(`sword-elite-${index}-blade`, this.scene);
    blade.diffuseColor = new BABYLON.Color3(0.68, 0.75, 0.82);
    blade.emissiveColor = new BABYLON.Color3(0.08, 0.1, 0.12);
    this.proxyMaterials.push(blade);
    const mesh = BABYLON.MeshBuilder.CreateBox(
      `sword-elite-${index}-katana`,
      { width: 0.05, height: 0.03, depth: 0.95 },
      this.scene,
    );
    mesh.parent = socket;
    mesh.position.set(0, 0, 0.45);
    mesh.material = blade;
    mesh.isPickable = false;
    this.meshes.push(mesh);
  }

  private buildGlow(index: number) {
    const auraMaterial = new BABYLON.StandardMaterial(`sword-elite-${index}-glow`, this.scene);
    auraMaterial.diffuseColor = BABYLON.Color3.Black();
    auraMaterial.specularColor = BABYLON.Color3.Black();
    auraMaterial.emissiveColor = new BABYLON.Color3(1, 0.08, 0.04);
    auraMaterial.alpha = 0;
    auraMaterial.disableLighting = true;
    auraMaterial.backFaceCulling = false;

    const aura = BABYLON.MeshBuilder.CreateCylinder(
      `sword-elite-${index}-glow`,
      { height: 1.9, diameter: 1.25, tessellation: 18 },
      this.scene,
    );
    aura.parent = this.root;
    aura.position.y = 0.95;
    aura.material = auraMaterial;
    aura.isPickable = false;
    aura.setEnabled(false);

    const ringMaterial = new BABYLON.StandardMaterial(`sword-elite-${index}-ring`, this.scene);
    ringMaterial.diffuseColor = BABYLON.Color3.Black();
    ringMaterial.emissiveColor = new BABYLON.Color3(1, 0.1, 0.05);
    ringMaterial.alpha = 0;
    ringMaterial.disableLighting = true;

    const ring = BABYLON.MeshBuilder.CreateTorus(
      `sword-elite-${index}-ring`,
      { diameter: 1.8, thickness: 0.08, tessellation: 32 },
      this.scene,
    );
    ring.parent = this.root;
    ring.position.y = 0.06;
    ring.material = ringMaterial;
    ring.isPickable = false;
    ring.setEnabled(false);

    // The "hit now" cue. A Billboarded ring at chest height is impossible to
    // miss from a first person view, unlike a floor ring seen at a shallow
    // angle. It only exists during the punish window.
    const strikeRingMaterial = new BABYLON.StandardMaterial(
      `sword-elite-${index}-strike-ring`,
      this.scene,
    );
    strikeRingMaterial.diffuseColor = BABYLON.Color3.Black();
    strikeRingMaterial.emissiveColor = new BABYLON.Color3(0.75, 0.98, 1);
    strikeRingMaterial.alpha = 0.95;
    strikeRingMaterial.disableLighting = true;
    strikeRingMaterial.backFaceCulling = false;

    const strikeRing = BABYLON.MeshBuilder.CreateTorus(
      `sword-elite-${index}-strike-ring`,
      { diameter: 1.5, thickness: 0.075, tessellation: 40 },
      this.scene,
    );
    strikeRing.parent = this.root;
    strikeRing.position.y = 1.1;
    strikeRing.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    strikeRing.material = strikeRingMaterial;
    strikeRing.isPickable = false;
    strikeRing.setEnabled(false);

    return { aura, auraMaterial, ring, ringMaterial, strikeRing, strikeRingMaterial };
  }

  /**
   * Drive the telegraph.
   *
   * `progress` runs 0 -> 1 over the windup. `perfect` flips true when the
   * punish window opens; that is the moment the whole cue changes from "get
   * ready" red to "hit NOW" cyan so the player is not guessing.
   */
  private setGlow(progress: number, perfect = false) {
    const visible = progress > 0;
    this.aura.setEnabled(visible);
    this.ring.setEnabled(visible);
    this.strikeRing.setEnabled(visible && perfect);
    if (!visible) return;

    const charge = Math.max(0, Math.min(1, progress));
    if (perfect) {
      this.auraMaterial.alpha = 0.18;
      this.auraMaterial.emissiveColor.set(0.35, 0.9, 1);
      this.ringMaterial.alpha = 1;
      this.ringMaterial.emissiveColor.set(0.75, 1, 1);
      // A slow pulse keeps the cue alive for the whole window.
      const pulse = 1 + Math.sin(progress * 70) * 0.08;
      this.strikeRingMaterial.alpha = 0.95;
      this.strikeRingMaterial.emissiveColor.set(0.75, 0.98, 1);
      this.strikeRing.scaling.setAll(pulse);
    } else {
      this.auraMaterial.alpha = 0.06 + charge * 0.18;
      this.auraMaterial.emissiveColor.set(1, 0.04 + charge * 0.16, 0.02);
      this.ringMaterial.alpha = 0.3 + charge * 0.55;
      this.ringMaterial.emissiveColor.set(1, 0.06 + charge * 0.2, 0.03);
    }
    // The floor ring contracts toward the Elite as the strike approaches,
    // giving a clear read of exactly how much time is left.
    this.ring.scaling.setAll(2.1 - charge * 1.35);
  }

  // ------------------------------------------------------------------
  // Animation
  // ------------------------------------------------------------------

  private playClip(name: string, loop: boolean) {
    const group = this.groups.get(name);
    if (!group) return;
    if (this.currentGroup && this.currentGroup !== group) this.currentGroup.stop();
    this.currentGroup = group;
    if (group.isStarted) group.stop();
    group.loopAnimation = loop;
    group.start(loop);
  }

  private playIdle() {
    this.playClip('ESW02_sw_idle_01', true);
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  get isAlive(): boolean {
    return this.alive;
  }

  get position(): BABYLON.Vector3 {
    return this.root.position;
  }

  get center(): BABYLON.Vector3 {
    return this.root.position.add(CENTER_OFFSET);
  }

  private get aimPoint(): BABYLON.Vector3 {
    return this.root.position.add(EYE_OFFSET);
  }

  /** True only while the Elite is open to a finishing blow. */
  get isStunned(): boolean {
    return this.state === 'stunned';
  }

  /** The dash-slash lunge should not yank the player into an active duel. */
  get canBeLungedAt(): boolean {
    return this.state === 'stunned';
  }

  /** True while the red windup is on screen. */
  get isTelegraphing(): boolean {
    return this.state === 'windup';
  }

  /**
   * True during the last moments of the dash - the HUD's "BLOCK" cue.
   *
   * The Elite now commits to the lunge before it can be punished. Hitting it
   * during the static windup is too early and gets blocked by its guard.
   */
  get isPunishWindow(): boolean {
    return this.canBePerfectStunned;
  }

  /** The pre-contact slice of the dash in which a katana hit blocks the blow. */
  get canBePerfectStunned(): boolean {
    if (!this.alive) return false;
    return this.state === 'dash'
      && this.dashStartup <= 0
      && this.dashPunishOpen;
  }

  consumePerfectHit(guaranteed = false): boolean {
    // The combat system snapshots the window on the input frame. Once a click
    // was timed correctly, the later blade impact must not be allowed to fail
    // because a few frames have passed.
    if (!guaranteed && !this.canBePerfectStunned) return false;
    this.state = 'stunned';
    this.stunTimer = DUEL.SWORD_STUN_DURATION;
    this.dashPunishOpen = false;
    this.setGlow(0);
    this.playClip('SW15_hit_05', false);
    return true;
  }

  consumeBlockedHit(_forced = false): boolean {
    // A stunned Elite is open, never "blocking" - that is the follow-up kill.
    if (!this.alive || this.state === 'dying' || this.state === 'stunned') return false;
    this.state = 'blocked';
    this.blockTimer = DUEL.SWORD_BLOCK_DURATION;
    this.dashPunishOpen = false;
    this.setGlow(0);
    this.playClip('swa_parry_R_alert', false);
    return true;
  }

  /** Shuriken do not kill a duelist: its guard bats them aside. */
  get canBeShurikenTargeted(): boolean {
    return this.alive;
  }

  takeShurikenHit(): ShurikenHitResult {
    return this.alive ? 'block' : 'ignore';
  }

  // ------------------------------------------------------------------
  // The update loop
  // ------------------------------------------------------------------

  update(dt: number, timeScale: number, playerPosition: BABYLON.Vector3) {
    const scaled = dt * timeScale;

    if (this.state === 'dying') {
      this.updateDeath(scaled);
      return;
    }
    if (!this.alive || !this.aiEnabled) return;

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.1;
      this.hasLineOfSight = this.checkLineOfSight(playerPosition);
    }

    const toPlayer = playerPosition.subtract(this.position);
    const distance = toPlayer.length();

    this.updateFacing(toPlayer, distance, scaled);

    switch (this.state) {
      case 'wait':
        this.waitTimer -= scaled;
        if (
          this.waitTimer <= 0
          && this.hasLineOfSight
          && distance <= DUEL.SWORD_ELITE_AGGRO_RANGE
        ) {
          this.startWindup();
        }
        break;

      case 'windup':
        this.telegraphTimer -= scaled;
        {
          const progress = 1 - this.telegraphTimer / DUEL.SWORD_TELEGRAPH;
          // Still red while it loads up. The cue only turns cyan once the
          // Elite is actually rushing at the player.
          this.setGlow(progress, false);
        }
        if (this.telegraphTimer <= 0) this.startDash(playerPosition);
        break;

      case 'dash':
        this.updateDash(playerPosition, scaled);
        // updateDash may have landed the strike and changed state already.
        if (this.state === 'dash') this.setGlow(1, this.isPunishWindow);
        break;

      case 'stunned':
        this.stunTimer -= scaled;
        if (this.stunTimer <= 0) this.startRecover();
        break;

      case 'blocked':
        this.blockTimer -= scaled;
        if (this.blockTimer <= 0) this.startRecover();
        break;

      case 'recover':
        this.recoverTimer -= scaled;
        if (this.recoverTimer <= 0) {
          this.waitTimer = DUEL.SWORD_ATTACK_COOLDOWN;
          this.state = 'wait';
          this.playIdle();
        }
        break;
    }

    // The dash is horizontal, but platforms are not always flat. Keep the
    // feet on the surface instead of letting the Elite hover over a step.
    this.snapToGround(this.root.position, 3);
  }

  private updateFacing(toPlayer: BABYLON.Vector3, distance: number, scaled: number) {
    if (this.state === 'dash') return;
    if (!this.hasLineOfSight || distance > DUEL.SWORD_ELITE_AGGRO_RANGE) return;

    const target = Math.atan2(toPlayer.x, toPlayer.z);
    this.yaw = this.turnToward(this.yaw, target, DUEL.SWORD_ELITE_TURN_SPEED * scaled);
    this.root.rotation.y = this.yaw;
  }

  /**
   * Put a spawn point on the floor beneath it.
   *
   * Spawn markers are placed by hand in the editor and have no physics body,
   * so without this the whole Elite floats at whatever height the marker was
   * left at. A short ray downwards finds the real surface; if there is no
   * floor under the marker the original position is kept.
   */
  private snapToGround(point: BABYLON.Vector3, maxDrop = 100) {
    const origin = point.add(new BABYLON.Vector3(0, 1, 0));
    const ray = new RAPIER.Ray(origin, new BABYLON.Vector3(0, -1, 0));
    const hit = this.world.castRay(ray, maxDrop + 1, true);
    if (!hit) return;
    point.y = origin.y - hit.timeOfImpact + 0.02;
  }

  private turnToward(current: number, target: number, maxStep: number): number {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return current + Math.max(-maxStep, Math.min(maxStep, delta));
  }

  private startWindup() {
    this.state = 'windup';
    this.telegraphTimer = DUEL.SWORD_TELEGRAPH;
    this.playClip('ET1_alert_to_turbo', false);
    this.setGlow(0.04);
  }

  private startDash(playerPosition: BABYLON.Vector3) {
    const toPlayer = playerPosition.subtract(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    if (distance > 0.0001) {
      toPlayer.scaleInPlace(1 / distance);
      this.dashDirection.copyFrom(toPlayer);
    } else {
      this.dashDirection.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    }
    this.yaw = Math.atan2(this.dashDirection.x, this.dashDirection.z);
    this.root.rotation.y = this.yaw;

    this.state = 'dash';
    this.dashStartup = DUEL.SWORD_DASH_STARTUP;
    this.dashPunishOpen = false;
    // A fixed dash length used to stop several metres short when the Elite
    // started a duel from the far end of its aggro range. Run long enough to
    // actually cross the gap, plus a little slack for the player strafing.
    this.dashTimer = Math.max(
      DUEL.SWORD_DASH_DURATION,
      distance / DUEL.SWORD_DASH_SPEED + 0.2,
    );
    this.dashElapsed = 0;
    this.playClip(DASH_LAUNCH_CLIP, false);
    this.setGlow(1, false);
  }

  private updateDash(playerPosition: BABYLON.Vector3, scaled: number) {
    this.dashElapsed += scaled;

    if (this.dashStartup > 0) {
      this.dashStartup -= scaled;
      if (this.dashStartup <= 0) this.playClip(DASH_RUN_CLIP, true);
      return;
    }

    // Track lightly during the run so a strafing player can still be cut.
    const toPlayer = playerPosition.subtract(this.position);
    toPlayer.y = 0;
    if (toPlayer.lengthSquared() > 0.0001) {
      toPlayer.normalize();
      this.dashDirection.x += (toPlayer.x - this.dashDirection.x) * Math.min(1, scaled * 2.5);
      this.dashDirection.z += (toPlayer.z - this.dashDirection.z) * Math.min(1, scaled * 2.5);
      this.dashDirection.normalize();
    }
    this.yaw = Math.atan2(this.dashDirection.x, this.dashDirection.z);
    this.root.rotation.y = this.yaw;

    this.root.position.addInPlace(this.dashDirection.scale(DUEL.SWORD_DASH_SPEED * scaled));

    const horizontal = Math.hypot(
      playerPosition.x - this.position.x,
      playerPosition.z - this.position.z,
    );

    // The block window lives here, on the rush, not in the static windup.
    // It opens when the blade is about SWORD_PERFECT_WINDOW seconds from the
    // player, so the cue appears as the Elite closes in for the kill.
    const timeToBlade = Math.max(
      0,
      (horizontal - DUEL.SWORD_STRIKE_RADIUS) / DUEL.SWORD_DASH_SPEED,
    );
    this.dashPunishOpen = timeToBlade <= DUEL.SWORD_PERFECT_WINDOW;

    if (
      horizontal <= DUEL.SWORD_STRIKE_RADIUS
      && Math.abs(playerPosition.y - this.position.y) <= 2
    ) {
      this.strike();
      return;
    }

    this.dashTimer -= scaled;
    if (this.dashTimer <= 0) this.startRecover();
  }

  private strike() {
    this.state = 'recover';
    this.recoverTimer = DUEL.SWORD_RECOVER_DURATION;
    this.dashPunishOpen = false;
    this.setGlow(0);
    this.playClip('swa_dash_to_alertF', false);
    this.onPlayerStrike?.(this.position.clone());
  }

  private startRecover() {
    this.state = 'recover';
    this.recoverTimer = DUEL.SWORD_RECOVER_DURATION;
    this.dashPunishOpen = false;
    this.setGlow(0);
    this.playClip('swa_dash_to_alertF', false);
  }

  /** A ray through the physics world, ignoring the player's own capsule. */
  private checkLineOfSight(playerPosition: BABYLON.Vector3): boolean {
    const from = this.aimPoint;
    const to = playerPosition.subtract(from);
    const distance = to.length();
    if (distance < 0.5) return true;

    const ray = new RAPIER.Ray(from, to.scale(1 / distance));
    const hit = this.world.castRay(
      ray,
      distance,
      true,
      undefined,
      undefined,
      undefined,
      this.playerBody,
    );
    return !hit;
  }

  // ------------------------------------------------------------------
  // Death and reset
  // ------------------------------------------------------------------

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dying';
    this.deathTimer = 1.5;
    this.setGlow(0);
    this.playClip('ESW04_swa_Death_1', false);
  }

  private updateDeath(scaled: number) {
    this.deathTimer -= scaled;
    const t = Math.max(0, Math.min(1, 1 - this.deathTimer / 1.5));
    for (const mesh of this.meshes) mesh.visibility = 1 - t;
    if (this.deathTimer <= 0) {
      for (const mesh of this.meshes) mesh.setEnabled(false);
    }
  }

  respawn() {
    this.alive = true;
    this.state = 'wait';
    this.waitTimer = this.initialWait;
    this.telegraphTimer = 0;
    this.dashStartup = 0;
    this.dashTimer = 0;
    this.dashElapsed = 0;
    this.dashPunishOpen = false;
    this.stunTimer = 0;
    this.blockTimer = 0;
    this.recoverTimer = 0;
    this.deathTimer = 0;
    this.hasLineOfSight = false;
    this.yaw = this.facing;

    this.root.position.copyFrom(this.spawnPosition);
    this.root.rotation.set(0, this.facing, 0);
    this.dashDirection.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.setGlow(0);
    for (const mesh of this.meshes) {
      mesh.visibility = 1;
      mesh.setEnabled(true);
    }
    this.playIdle();
  }

  dispose() {
    this.setGlow(0);
    this.katanaEntries?.dispose();
    this.entries?.dispose();
    this.aura.dispose();
    this.auraMaterial.dispose();
    this.ring.dispose();
    this.ringMaterial.dispose();
    this.strikeRing.dispose();
    this.strikeRingMaterial.dispose();
    for (const material of this.proxyMaterials) material.dispose();
    this.root.dispose();
  }
}
