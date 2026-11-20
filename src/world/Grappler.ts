import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { GRAPPLE_CONFIG } from '../config/grapple';

export interface GrappleAnchor {
  /** World position of the anchor. */
  position: BABYLON.Vector3;
  /**
   * Optional spot the vault should carry the player onto (the platform under
   * the anchor). When it is missing the vault simply keeps the travel
   * direction of the pull.
   */
  landing: BABYLON.Vector3 | null;
  /** The glowing marker shown at the anchor. */
  marker: BABYLON.TransformNode;
  /** Emissive material of the marker ring. */
  material: BABYLON.StandardMaterial;
  /** True while this anchor is the one the player is aiming at. */
  targeted: boolean;
  /** True while the player is tethered to this anchor. */
  attached: boolean;
  /** Disabled anchors (a Mech that is not stunned) are invisible and untargetable. */
  enabled: boolean;
  /** Called when the hook lands on this anchor, before the pull starts. */
  onGrapple?: () => void;
}

export interface GrappleTarget {
  anchor: GrappleAnchor;
  distance: number;
  /** How close the anchor is to the crosshair: 0 = dead on, 1 = edge of range. */
  aim: number;
  /** Ranking score, lower is better. */
  score: number;
}

const CONFIG = GRAPPLE_CONFIG;

const IDLE_COLOR = new BABYLON.Color3(0.16, 0.85, 0.45);
const TARGET_COLOR = new BABYLON.Color3(0.6, 1, 0.75);
const ATTACHED_COLOR = new BABYLON.Color3(1, 0.78, 0.35);

/**
 * Grapple hook.
 *
 * Owns the targeting, the ring visuals and the cooldown. The movement itself
 * is driven by the FirstPersonController: this class only decides *where* the
 * hook bites and reports it.
 *
 * Targeting is deliberately forgiving. Instead of a single thin ray the aim
 * uses a wide cone plus a sphere cast, so a ring that is slightly off the
 * crosshair (or partly hidden behind a thin beam) still locks on.
 */
export class Grappler {
  private scene: BABYLON.Scene;
  private camera: BABYLON.FreeCamera;
  private world: RAPIER.World;
  private playerBody: RAPIER.RigidBody | null;

  private anchors: GrappleAnchor[] = [];
  private tetherAnchor: GrappleAnchor | null = null;
  private cooldown = 0;

  /** The anchor that was targeted last frame, used for sticky aim. */
  private lastTarget: GrappleAnchor | null = null;

  /** Reused sphere for the forgiving line of sight check. */
  private losShape: RAPIER.Ball;

  /**
   * Fired when the grapple fires, with the ring center and the optional
   * landing spot the vault should aim for.
   */
  public onFire?: (targetPos: BABYLON.Vector3, landingPos?: BABYLON.Vector3) => void;

  constructor(
    scene: BABYLON.Scene,
    camera: BABYLON.FreeCamera,
    world: RAPIER.World,
    playerBody: RAPIER.RigidBody | null = null,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.playerBody = playerBody;
    this.losShape = new RAPIER.Ball(CONFIG.LOS_RADIUS);
  }

  /**
   * Register a grapple anchor and build its glowing marker.
   *
   * `landing` is the platform the vault should carry the player onto.
   */
  addAnchor(
    position: BABYLON.Vector3,
    landing: BABYLON.Vector3 | null = null,
    radius = 0.55,
    enabled = true,
  ) {
    const index = this.anchors.length;
    const marker = new BABYLON.TransformNode(`grapple-anchor-${index}`, this.scene);
    marker.position.copyFrom(position);
    marker.setEnabled(enabled);

    const material = new BABYLON.StandardMaterial(`grapple-anchor-material-${index}`, this.scene);
    material.emissiveColor = IDLE_COLOR;
    material.diffuseColor = BABYLON.Color3.Black();
    material.specularColor = BABYLON.Color3.Black();
    material.disableLighting = true;
    material.alpha = 0.9;

    const ring = BABYLON.MeshBuilder.CreateTorus(
      `grapple-ring-${index}`,
      { diameter: radius * 2, thickness: radius * 0.2, tessellation: 24 },
      this.scene,
    );
    ring.material = material;
    ring.parent = marker;
    ring.isPickable = false;
    ring.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    const core = BABYLON.MeshBuilder.CreateDisc(
      `grapple-core-${index}`,
      { radius: radius * 0.4, tessellation: 24 },
      this.scene,
    );
    core.material = material;
    core.parent = marker;
    core.isPickable = false;
    core.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    const anchor: GrappleAnchor = {
      position: position.clone(),
      landing: landing?.clone() ?? null,
      marker,
      material,
      targeted: false,
      attached: false,
      enabled,
    };
    this.anchors.push(anchor);
    return anchor;
  }

  /**
   * The anchor the player is currently aiming at, if any.
   *
   * A ring qualifies when it is inside the range, inside a forgiving cone
   * around the crosshair and has a clear line to the player.
   */
  getTarget(): GrappleTarget | null {
    const cameraPosition = this.camera.position;
    const forward = this.camera.getForwardRay().direction;

    let best: GrappleTarget | null = null;

    for (const anchor of this.anchors) {
      if (!anchor.enabled) continue;
      const toAnchor = anchor.position.subtract(cameraPosition);
      const distance = toAnchor.length();
      if (distance > CONFIG.MAX_RANGE || distance < 0.5) continue;

      const direction = toAnchor.scale(1 / Math.max(distance, 0.0001));
      const angle = Math.acos(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(direction, forward))));
      if (angle > CONFIG.AIM_CONE_ANGLE) continue;

      // Ignore anchors behind walls. The check is a sphere cast, so a ring
      // that peeks out from behind a thin beam is still reachable.
      if (!this.hasLineOfSight(cameraPosition, direction, distance)) continue;

      const aim = angle / CONFIG.AIM_CONE_ANGLE;
      // Sticky aim: the ring that was locked last frame gets a score bonus,
      // so the lock never flickers between two candidates.
      const sticky = anchor === this.lastTarget ? CONFIG.AIM_STICKY_SCORE : 0;
      const score = aim - sticky;

      if (!best || score < best.score) {
        best = { anchor, distance, aim, score };
      }
    }

    this.lastTarget = best?.anchor ?? null;
    return best;
  }

  /**
   * Forgiving line of sight: a sphere cast along the direction to the anchor.
   * A sphere (instead of a ray) means small offsets from the ring still find
   * a clear path, and very close anchors are accepted without a check at all.
   */
  private hasLineOfSight(origin: BABYLON.Vector3, direction: BABYLON.Vector3, distance: number) {
    if (distance <= CONFIG.LOS_EXEMPT_DISTANCE) return true;

    // Start the cast a little away from the camera so the sphere never starts
    // inside the player capsule or the floor.
    const startOffset = 0.35;
    const maxToi = Math.max(distance - startOffset - CONFIG.LOS_PADDING, 0.1);

    const hit = this.world.castShape(
      {
        x: origin.x + direction.x * startOffset,
        y: origin.y + direction.y * startOffset,
        z: origin.z + direction.z * startOffset,
      },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: direction.x * maxToi, y: direction.y * maxToi, z: direction.z * maxToi },
      this.losShape,
      0,
      1,
      true,
      undefined,
      undefined,
      undefined,
      // The ray starts inside the player capsule, so the player body has to be
      // excluded or every anchor would look blocked.
      this.playerBody ?? undefined,
      undefined,
    );
    return !hit;
  }

  /**
   * Fire the grapple at the current target.
   *
   * This is a one-tap action: it starts the pull and the ring is released
   * automatically when the player vaults over the anchor (or is cancelled by
   * jump/dash).
   */
  fire() {
    if (this.cooldown > 0) return false;
    if (this.tetherAnchor) return false;

    const target = this.getTarget();
    if (!target) return false;

    this.tetherAnchor = target.anchor;
    this.tetherAnchor.attached = true;
    this.onFire?.(target.anchor.position.clone(), target.anchor.landing?.clone());
    // Dynamic anchors (a stunned Mech) carry their own finisher callback.
    target.anchor.onGrapple?.();
    return true;
  }

  /** Detach the grapple and put it on cooldown so it cannot re-trigger. */
  detach() {
    if (this.tetherAnchor) this.tetherAnchor.attached = false;
    this.tetherAnchor = null;
    this.cooldown = CONFIG.COOLDOWN;
  }

  /**
   * Clear all hook state immediately, without a cooldown.
   *
   * Used by death/reset. The controller cancels its pull when it is teleported,
   * but that cancellation does not go through `onGrappleFinished`, so the
   * Grappler would otherwise stay tethered to the old anchor and refuse every
   * future `fire()` call.
   */
  reset() {
    for (const anchor of this.anchors) anchor.attached = false;
    this.tetherAnchor = null;
    this.lastTarget = null;
    this.cooldown = 0;
  }

  get isAttached() {
    return this.tetherAnchor !== null;
  }

  /** True while an anchor is in range and roughly aimed at. */
  get hasTarget() {
    return this.tetherAnchor !== null || this.getTarget() !== null;
  }

  /** Refresh the marker visuals. */
  update(dt: number) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

    const target = this.tetherAnchor ? null : this.getTarget();

    for (const anchor of this.anchors) {
      anchor.marker.setEnabled(anchor.enabled);
      if (!anchor.enabled) continue;
      anchor.targeted = anchor === this.tetherAnchor || anchor === target?.anchor;

      const color = anchor.attached
        ? ATTACHED_COLOR
        : anchor.targeted
          ? TARGET_COLOR
          : IDLE_COLOR;
      anchor.material.emissiveColor = color;

      // Targeted anchors pulse a little so they read as "armed".
      const pulse = anchor.targeted ? 1.15 + Math.sin(performance.now() / 120) * 0.1 : 1;
      anchor.marker.scaling.setAll(pulse);
    }
  }
}
