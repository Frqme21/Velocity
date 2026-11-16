import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';

export interface GrappleAnchor {
  /** World position of the anchor. */
  position: BABYLON.Vector3;
  /** The glowing marker shown at the anchor. */
  marker: BABYLON.TransformNode;
  /** Emissive material of the marker ring. */
  material: BABYLON.StandardMaterial;
  /** True while this anchor is the one the player is aiming at. */
  targeted: boolean;
  /** True while the player is tethered to this anchor. */
  attached: boolean;
}

export interface GrappleTarget {
  anchor: GrappleAnchor;
  distance: number;
  /** How close the anchor is to the crosshair: 0 = dead on, 1 = edge of range. */
  aim: number;
}

const CONFIG = {
  /** Maximum distance an anchor can be grappled from. */
  MAX_RANGE: 34,
  /** Maximum angle (radians) between the view direction and the anchor. */
  MAX_AIM_ANGLE: 0.8,
  /** Minimum time between grapple attempts. */
  COOLDOWN: 0.35,
} as const;

const IDLE_COLOR = new BABYLON.Color3(0.16, 0.85, 0.45);
const TARGET_COLOR = new BABYLON.Color3(0.6, 1, 0.75);
const ATTACHED_COLOR = new BABYLON.Color3(1, 0.78, 0.35);

/**
 * Grapple hook: highlights nearby rings and starts a one-tap zip towards the
 * locked one. The zip movement itself is driven by the FirstPersonController;
 * this class owns the targeting, the ring visuals and the cooldown.
 */
export class Grappler {
  private scene: BABYLON.Scene;
  private camera: BABYLON.FreeCamera;
  private world: RAPIER.World;
  private playerBody: RAPIER.RigidBody | null;

  private anchors: GrappleAnchor[] = [];
  private tetherAnchor: GrappleAnchor | null = null;
  private cooldown = 0;

  /** Fired when the grapple fires, with the ring center as the target. */
  public onFire?: (targetPos: BABYLON.Vector3) => void;

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
  }

  /** Register a grapple anchor and build its glowing marker. */
  addAnchor(position: BABYLON.Vector3, radius = 0.55) {
    const index = this.anchors.length;
    const marker = new BABYLON.TransformNode(`grapple-anchor-${index}`, this.scene);
    marker.position.copyFrom(position);

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
      marker,
      material,
      targeted: false,
      attached: false,
    };
    this.anchors.push(anchor);
    return anchor;
  }

  /** The anchor the player is currently aiming at, if any. */
  getTarget(): GrappleTarget | null {
    const cameraPosition = this.camera.position;
    const forward = this.camera.getForwardRay().direction;

    let best: GrappleTarget | null = null;

    for (const anchor of this.anchors) {
      const toAnchor = anchor.position.subtract(cameraPosition);
      const distance = toAnchor.length();
      if (distance > CONFIG.MAX_RANGE) continue;

      const direction = toAnchor.scale(1 / Math.max(distance, 0.0001));
      const angle = Math.acos(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(direction, forward))));
      if (angle > CONFIG.MAX_AIM_ANGLE) continue;

      // Ignore anchors behind walls: cast against the level colliders.
      if (!this.hasLineOfSight(cameraPosition, direction, distance)) continue;

      const aim = angle / CONFIG.MAX_AIM_ANGLE;
      if (!best || aim < best.aim || (aim === best.aim && distance < best.distance)) {
        best = { anchor, distance, aim };
      }
    }

    return best;
  }

  private hasLineOfSight(origin: BABYLON.Vector3, direction: BABYLON.Vector3, distance: number) {
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z },
    );
    // The ray starts inside the player capsule, so the player body has to be
    // excluded or every anchor would look blocked.
    const hit = this.world.castRay(
      ray,
      Math.max(distance - 0.45, 0.1),
      true,
      undefined,
      undefined,
      undefined,
      this.playerBody ?? undefined,
      undefined,
    );
    return !hit;
  }

  /**
   * Fire the grapple at the current target.
   *
   * This is a one-tap action: it starts the zip and the ring is released
   * automatically when the zip arrives (or is cancelled by jump/dash).
   */
  fire() {
    if (this.cooldown > 0) return false;
    if (this.tetherAnchor) return false;

    const target = this.getTarget();
    if (!target) return false;

    this.tetherAnchor = target.anchor;
    this.tetherAnchor.attached = true;
    this.onFire?.(target.anchor.position.clone());
    return true;
  }

  /** Detach the grapple and put it on cooldown so it cannot re-trigger. */
  detach() {
    if (this.tetherAnchor) this.tetherAnchor.attached = false;
    this.tetherAnchor = null;
    this.cooldown = CONFIG.COOLDOWN;
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
