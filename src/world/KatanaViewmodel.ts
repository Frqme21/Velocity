import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { COMBAT_CONFIG } from '../config/combat';
import { SlashTrail } from './SlashTrail';

export interface KatanaViewmodelInput {
  speed: number;
  grounded: boolean;
  dashing: boolean;
  sliding: boolean;
  wallRunning: boolean;
  sensoryBoosting: boolean;
}

const MODEL_URL = '/models/katana_sword.glb';

/**
 * Measured from the loaded GLB hierarchy (align-local space):
 *   the handle sits at +X (guard ~ +40, pommel ~ +101)
 *   the blade runs from the guard at +40 down to the tip at -173
 *   thickness is along Y, the blade width / curve along Z
 * so the blade axis points towards -X in the model space.
 */
const MODEL_SCALE = 0.00425;
/** Middle of the wrapped handle, in raw model units. */
const GRIP_ANCHOR = new BABYLON.Vector3(67, 0, 0);
/**
 * The very tip of the blade, in raw model units.
 *
 * The katana is curved (sori), so the tip sits a bit off the blade's axis.
 */
const BLADE_TIP = new BABYLON.Vector3(-173.1, -0.3, -9.3);

/** Where the grip sits in camera space: lower right, forward of the near plane. */
const REST_POSITION = new BABYLON.Vector3(0.55, -0.43, 0.5);
/** Tip points left across the bottom of the view, almost horizontal. */
const BLADE_DIRECTION = new BABYLON.Vector3(-0.99, 0.05, 0.12).normalize();
/** Approximate blade flat normal before it is made orthogonal to the blade. */
const FLAT_NORMAL = new BABYLON.Vector3(0.25, 0.2, -0.95);

const RUN_SPEED = 10;
const BOB_FREQUENCY_WALK = 7.5;
const BOB_FREQUENCY_SPRINT = 4;
const BOB_X = 0.01;
const BOB_Y = 0.012;
const BOB_Z = 0.004;
const IDLE_BOB_Y = 0.0032;
const IDLE_BOB_X = 0.0022;

/**
 * The base slash path, in camera space.
 *
 * The blade is hidden while it cuts, so the light trail is what the player
 * actually sees: a streak that starts in the upper right, bows slightly
 * upwards and leaves through the lower left. Every swing mirrors and
 * wobbles this shape a little, so no two cuts are identical.
 */
const SLASH_START_TIP = new BABYLON.Vector3(0.62, 0.3, 0.55);
/** The control point of the curve - it bows the slash upwards. */
const SLASH_CONTROL_TIP = new BABYLON.Vector3(0.05, 0.36, 0.6);
/** Where the blade tip finishes the cut, in the lower left. */
const SLASH_END_TIP = new BABYLON.Vector3(-0.62, -0.34, 0.58);
/** How many samples the slash curve is drawn with. */
const SLASH_SAMPLES = 28;

/**
 * The shape of a single cut, in camera space.
 *
 * `start` is where the blade tip enters, `control` bends the arc and `end`
 * is where it finishes. The tangent at any point follows the curve.
 */
interface SlashShape {
  start: BABYLON.Vector3;
  control: BABYLON.Vector3;
  end: BABYLON.Vector3;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** A point on the slash curve. */
function slashPoint(shape: SlashShape, u: number): BABYLON.Vector3 {
  const t = 1 - u;
  return shape.start.scale(t * t)
    .add(shape.control.scale(2 * t * u))
    .add(shape.end.scale(u * u));
}

/** The direction the slash travels at a point on the curve. */
function slashTangent(shape: SlashShape, u: number): BABYLON.Vector3 {
  const t = 1 - u;
  return shape.control.subtract(shape.start).scale(2 * t)
    .add(shape.end.subtract(shape.control).scale(2 * u));
}

export class KatanaViewmodel {
  private scene: BABYLON.Scene;
  private camera: BABYLON.FreeCamera;

  private root: BABYLON.TransformNode | null = null;
  /** Carries the swing rotation between the resting pose and the cut. */
  private swingNode: BABYLON.TransformNode | null = null;
  /** The node the model hangs off - scaled for the little pop on return. */
  private alignNode: BABYLON.TransformNode | null = null;
  /** The meshes of the katana itself - they are hidden while it cuts. */
  private bladeMeshes: BABYLON.AbstractMesh[] = [];
  private lights: BABYLON.Light[] = [];

  private bobPhase = 0;
  private idleTime = 0;
  private swayX = 0;
  private swayY = 0;
  private swayRoll = 0;
  private stateOffset = new BABYLON.Vector3();
  private stateRoll = 0;
  private lastYaw = 0;
  private lastPitch = 0;

  /** True while the swing animation is running. */
  private swinging = false;
  /** Time since the swing started, in seconds. */
  private swingElapsed = 0;
  /** Time left before another swing is allowed, in seconds. */
  private swingCooldown = 0;
  /** True once the impact frame of the current swing has been handled. */
  private swingImpactFired = false;
  /** True once the slash has been painted completely. */
  private slashComplete = false;
  /** Time left of the slash's afterglow, in seconds. */
  private slashFade = 0;
  /** The painted part of the slash, in camera space. */
  private slashPoints: BABYLON.Vector3[] = [];

  /** How many slashes have been cut - drives the alternating direction. */
  private slashCount = 0;
  /** The shape of the cut that is being made right now. */
  private slashShape: SlashShape = {
    start: SLASH_START_TIP.clone(),
    control: SLASH_CONTROL_TIP.clone(),
    end: SLASH_END_TIP.clone(),
  };

  /**
   * What the steel is doing right now:
   *   `solid`     - sitting in the grip, fully visible
   *   `dissolving`- fading out where it is, at the start of a cut
   *   `hidden`    - out of sight, the light trail is the blade now
   *   `returning` - fading back in at the grip, at the end of a cut
   */
  private bladeState: 'solid' | 'dissolving' | 'hidden' | 'returning' = 'solid';
  /** Time spent in the current blade state, in seconds. */
  private bladeStateElapsed = 0;

  /** The laser-like slash the blade paints through the air. */
  private trail!: SlashTrail;

  /** The grip and the blade tip in the model's local frame. */
  private gripLocal = new BABYLON.Vector3();
  private tipLocal = new BABYLON.Vector3();
  /** The direction the blade points in the model's local frame. */
  private bladeAxis = new BABYLON.Vector3();

  /**
   * Fired on the frame the blade crosses the target, so the hit resolves
   * exactly when the slash is at its brightest.
   */
  public onSwingImpact?: () => void;

  private readonly bob = new BABYLON.Vector3();
  private readonly offset = new BABYLON.Vector3();
  private readonly basePosition = new BABYLON.Vector3();

  constructor(scene: BABYLON.Scene, camera: BABYLON.FreeCamera) {
    this.scene = scene;
    this.camera = camera;
    this.lastYaw = camera.rotation.y;
    this.lastPitch = camera.rotation.x;
  }

  async load() {
    const container = await BABYLON.loadAssetContainerAsync(MODEL_URL, this.scene);
    const modelRoot = container.rootNodes[0] as BABYLON.TransformNode | undefined;
    if (!modelRoot) {
      throw new Error('Katana model has no root node');
    }

    container.addAllToScene();

    // The whole model is rotated onto the camera axes instead of relying on
    // the authoring orientation: the blade runs along BLADE_DIRECTION (towards
    // the tip), the flat faces the camera and the width spans the screen.
    // The model's +X points at the handle, so it maps to -BLADE_DIRECTION.
    const handleAxis = BLADE_DIRECTION.scale(-1);
    const thickness = FLAT_NORMAL.subtract(
      handleAxis.scale(BABYLON.Vector3.Dot(FLAT_NORMAL, handleAxis)),
    ).normalize();
    const width = BABYLON.Vector3.Cross(handleAxis, thickness).normalize();

    const rotationMatrix = BABYLON.Matrix.FromXYZAxesToRef(
      handleAxis,
      thickness,
      width,
      new BABYLON.Matrix(),
    );
    const rotation = BABYLON.Quaternion.FromRotationMatrix(rotationMatrix);

    const align = new BABYLON.TransformNode('katana-align', this.scene);
    align.rotationQuaternion = rotation;
    align.scaling.setAll(MODEL_SCALE);

    // Put the grip, not the authoring origin, on REST_POSITION.
    const gripOffset = GRIP_ANCHOR.scale(MODEL_SCALE);
    const rotatedGrip = new BABYLON.Vector3();
    gripOffset.rotateByQuaternionToRef(rotation, rotatedGrip);

    // The blade tip, in the same space.
    const tipOffset = BLADE_TIP.scale(MODEL_SCALE);
    const rotatedTip = new BABYLON.Vector3();
    tipOffset.rotateByQuaternionToRef(rotation, rotatedTip);

    const root = new BABYLON.TransformNode('katana-viewmodel', this.scene);
    root.parent = this.camera;
    this.basePosition.copyFrom(REST_POSITION).subtractInPlace(rotatedGrip);
    root.position.copyFrom(this.basePosition);
    root.rotationQuaternion = null;

    // The swing happens on its own node, so the resting pose (bob, sway,
    // movement states) stays untouched while the blade cuts.
    const swingNode = new BABYLON.TransformNode('katana-swing', this.scene);
    swingNode.parent = root;
    swingNode.rotationQuaternion = BABYLON.Quaternion.Identity();

    align.parent = swingNode;
    modelRoot.parent = align;

    const meshes: BABYLON.AbstractMesh[] = [];
    for (const mesh of container.meshes) {
      if (!(mesh instanceof BABYLON.Mesh)) continue;
      meshes.push(mesh);
      mesh.renderingGroupId = 1;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.alwaysSelectAsActiveMesh = true;

      const material = mesh.material;
      if (material instanceof BABYLON.PBRMaterial) {
        // No IBL in this scene, so let a little base colour through the metal
        // and fake the environment response with the dedicated lights below.
        material.metallic = 0.55;
        material.roughness = 0.42;
        material.environmentIntensity = 0;
        // The steel fades in and out, so it has to keep writing depth to
        // hide its own parts from each other while it is semi transparent.
        material.forceDepthWrite = true;
      }
    }

    this.addLights(meshes);
    this.root = root;
    this.swingNode = swingNode;
    this.alignNode = align;
    this.bladeMeshes = meshes;
    this.gripLocal.copyFrom(rotatedGrip);
    this.tipLocal.copyFrom(rotatedTip);
    this.bladeAxis.copyFrom(rotatedTip).subtractInPlace(rotatedGrip).normalize();

    // The laser-like slash the blade paints instead of showing the steel.
    this.trail = new SlashTrail(
      this.scene,
      this.camera,
      COMBAT_CONFIG.SLASH_WIDTH,
      new BABYLON.Color3(
        COMBAT_CONFIG.SLASH_CORE_COLOR.r,
        COMBAT_CONFIG.SLASH_CORE_COLOR.g,
        COMBAT_CONFIG.SLASH_CORE_COLOR.b,
      ),
      new BABYLON.Color3(
        COMBAT_CONFIG.SLASH_EDGE_COLOR.r,
        COMBAT_CONFIG.SLASH_EDGE_COLOR.g,
        COMBAT_CONFIG.SLASH_EDGE_COLOR.b,
      ),
    );

    // Draw the viewmodel in its own rendering group with a fresh depth buffer
    // so it can never clip into world geometry.
    this.scene.setRenderingAutoClearDepthStencil(1, true, true, false);
  }

  /**
   * Start a swing.
   *
   * The steel dissolves where it is and the slash takes over: the light is
   * painted out of the blade tip while it travels through the air. When the
   * cut is over the blade fades back in at the grip, so it never looks like
   * it is being picked up from the side of the screen.
   *
   * Returns false when the katana is still recovering from the last one.
   */
  playSwing(): boolean {
    if (!this.root) return false;
    if (this.swinging || this.swingCooldown > 0) return false;

    this.swinging = true;
    this.swingElapsed = 0;
    this.swingImpactFired = false;
    this.slashComplete = false;
    this.slashFade = 0;
    this.slashPoints = [];
    this.swingCooldown = COMBAT_CONFIG.SWING_COOLDOWN;

    // Every cut gets its own shape, and every second cut goes the other
    // way, so a chain of attacks never looks like one repeated animation.
    this.slashShape = this.createSlashShape();
    this.slashCount++;

    // The steel dissolves in place - it is never yanked across the screen.
    this.bladeState = 'dissolving';
    this.bladeStateElapsed = 0;
    this.resetSwingPose();
    this.trail.hide();

    return true;
  }

  /** True while the swing animation is running. */
  get isSwinging(): boolean {
    return this.swinging;
  }

  /**
   * Build the shape of the next cut.
   *
   * The base arc is mirrored on alternate swings and every fourth cut rises
   * instead of falls, so a chain of attacks never repeats the same motion.
   * On top of that the arc wobbles a little: the bow, the height of the
   * ends and how far out in front of the camera the cut happens all move.
   */
  private createSlashShape(): SlashShape {
    const count = this.slashCount;
    const variation = COMBAT_CONFIG.SLASH_VARIATION;
    const jitter = (amount: number) => (Math.random() * 2 - 1) * amount * variation;

    // Every second slash goes the other way and every fourth one cuts
    // upwards.
    const direction = COMBAT_CONFIG.SLASH_ALTERNATE && count % 2 === 1 ? -1 : 1;
    const rising = COMBAT_CONFIG.SLASH_ALTERNATE && count % 4 >= 2;

    const start = SLASH_START_TIP.clone();
    const control = SLASH_CONTROL_TIP.clone();
    const end = SLASH_END_TIP.clone();

    if (rising) {
      // The cut rises instead of falls - the arc bows the other way too.
      start.y = -start.y;
      control.y = -control.y;
      end.y = -end.y;
    }

    // The arc wobbles: a higher or lower bow, ends that sit a little
    // higher or lower and a cut that happens nearer or further away.
    start.y += jitter(0.09);
    control.y += jitter(0.13);
    end.y += jitter(0.09);
    start.z += jitter(0.09);
    control.z += jitter(0.09);
    end.z += jitter(0.09);
    start.x += jitter(0.09);
    end.x += jitter(0.09);

    // Mirror the whole cut for the other direction.
    start.x *= direction;
    control.x *= direction;
    end.x *= direction;

    return { start, control, end };
  }

  /** Show or hide the katana model. */
  private setBladeVisible(visible: boolean) {
    for (const mesh of this.bladeMeshes) {
      mesh.setEnabled(visible);
    }
  }

  /** Fade the steel in or out (0 = invisible, 1 = solid). */
  private setBladeAlpha(alpha: number) {
    for (const mesh of this.bladeMeshes) {
      mesh.visibility = alpha;
    }
  }

  private addLights(meshes: BABYLON.AbstractMesh[]) {
    const key = new BABYLON.PointLight(
      'katana-key-light',
      new BABYLON.Vector3(0.55, 0.75, -0.4),
      this.scene,
    );
    key.parent = this.camera;
    key.intensity = 9;
    key.range = 5;

    const fill = new BABYLON.PointLight(
      'katana-fill-light',
      new BABYLON.Vector3(-0.7, -0.25, 0.15),
      this.scene,
    );
    fill.parent = this.camera;
    fill.intensity = 4;
    fill.range = 5;
    fill.diffuse = new BABYLON.Color3(0.55, 0.7, 0.9);

    const rim = new BABYLON.PointLight(
      'katana-rim-light',
      new BABYLON.Vector3(-0.2, 0.5, 0.9),
      this.scene,
    );
    rim.parent = this.camera;
    rim.intensity = 6;
    rim.range = 5;
    rim.diffuse = new BABYLON.Color3(1, 0.82, 0.6);

    this.lights = [key, fill, rim];
    for (const light of this.lights) {
      light.includedOnlyMeshes = meshes;
    }
  }

  update(dt: number, input: KatanaViewmodelInput) {
    const root = this.root;
    if (!root) return;

    const speedRatio = clamp(input.speed / RUN_SPEED, 0, 1);
    const grounded = input.grounded;
    const bobStrength = grounded ? speedRatio : bobStrengthAir(speedRatio);
    this.bobPhase +=
      dt * (grounded ? BOB_FREQUENCY_WALK + speedRatio * BOB_FREQUENCY_SPRINT : 2.6);
    this.idleTime += dt;

    const bob = this.bob.set(
      Math.sin(this.bobPhase) * BOB_X * bobStrength,
      -Math.abs(Math.cos(this.bobPhase)) * BOB_Y * bobStrength,
      Math.sin(this.bobPhase * 2) * BOB_Z * bobStrength,
    );

    // Idle breathing keeps the weapon alive when standing still.
    if (bobStrength < 0.05) {
      const idleBlend = 1 - bobStrength * 20;
      bob.x += Math.sin(this.idleTime * 0.85 + 1.1) * IDLE_BOB_X * idleBlend;
      bob.y += Math.sin(this.idleTime * 1.55) * IDLE_BOB_Y * idleBlend;
    }

    // Look sway: the sword lags a touch behind fast camera turns.
    const yaw = this.camera.rotation.y;
    const pitch = this.camera.rotation.x;
    let yawDelta = yaw - this.lastYaw;
    if (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
    else if (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
    const pitchDelta = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;

    const safeDt = Math.max(dt, 1e-4);
    const swayTargetX = clamp(-(yawDelta / safeDt) * 0.0032, -0.035, 0.035);
    const swayTargetY = clamp((pitchDelta / safeDt) * 0.0022, -0.03, 0.03);
    const swayTargetRoll = clamp((yawDelta / safeDt) * 0.02, -0.09, 0.09);
    const swayBlend = 1 - Math.exp(-9 * dt);
    this.swayX += (swayTargetX - this.swayX) * swayBlend;
    this.swayY += (swayTargetY - this.swayY) * swayBlend;
    this.swayRoll += (swayTargetRoll - this.swayRoll) * swayBlend;

    // Pose offsets for movement states, blended so transitions never snap.
    const target = this.offset.set(0, 0, 0);
    let targetRoll = 0;
    if (input.dashing) {
      target.set(0.035, -0.02, -0.05);
      targetRoll = -0.09;
    } else if (input.sliding) {
      target.set(0.02, -0.055, 0.015);
      targetRoll = 0.06;
    } else if (input.wallRunning) {
      target.set(-0.025, 0.015, -0.01);
      targetRoll = 0.07;
    } else if (input.sensoryBoosting) {
      target.set(0, 0.012, 0.02);
      targetRoll = 0.03;
    } else if (!input.grounded) {
      target.set(-0.01, 0.014, -0.015);
      targetRoll = -0.015;
    }

    const stateBlend = 1 - Math.exp(-10 * dt);
    this.stateOffset.x += (target.x - this.stateOffset.x) * stateBlend;
    this.stateOffset.y += (target.y - this.stateOffset.y) * stateBlend;
    this.stateOffset.z += (target.z - this.stateOffset.z) * stateBlend;
    this.stateRoll += (targetRoll - this.stateRoll) * stateBlend;

    // The swing happens on its own node, so the resting pose below is
    // unaffected by it.
    this.updateSwing(dt);

    root.position.set(
      this.basePosition.x + bob.x + this.swayX + this.stateOffset.x,
      this.basePosition.y + bob.y + this.swayY + this.stateOffset.y,
      this.basePosition.z + bob.z + this.stateOffset.z,
    );
    root.rotation.set(
      this.swayY * 0.6,
      this.swayX * 0.8,
      this.swayRoll + this.stateRoll,
    );
  }

  /**
   * Advance the swing animation.
   *
   * The steel dissolves where it is, the laser-like trail is painted out of
   * the blade tip instead, and the steel fades back in at the grip when the
   * cut is over. The impact callback fires on the frame the blade crosses
   * the target, which is the same frame the trail is at its brightest.
   */
  private updateSwing(dt: number) {
    this.swingCooldown = Math.max(0, this.swingCooldown - dt);

    // --- the steel dissolves into the light -------------------------------
    if (this.bladeState === 'dissolving') {
      this.bladeStateElapsed += dt;
      const t = clamp(this.bladeStateElapsed / COMBAT_CONFIG.SLASH_DISSOLVE, 0, 1);
      this.setBladeAlpha(1 - t * t);
      if (t >= 1) {
        this.bladeState = 'hidden';
        this.setBladeVisible(false);
      }
    }

    if (this.swinging) {
      this.swingElapsed += dt;
      const progress = Math.min(this.swingElapsed / COMBAT_CONFIG.SWING_DURATION, 1);

      // How far along the slash the blade tip is (0 = wound up, 1 = done).
      const u = clamp(
        (progress - COMBAT_CONFIG.SLASH_START) /
          (COMBAT_CONFIG.SLASH_END - COMBAT_CONFIG.SLASH_START),
        0,
        1,
      );

      // The hidden blade rides the slash path, so the light always comes
      // out of the blade tip. It only starts riding once it is out of
      // sight, so the steel never jumps across the screen.
      if (this.bladeState === 'hidden') {
        this.updateSwingPose(u);
      }

      if (!this.slashComplete) {
        if (u > 0) {
          this.slashPoints = this.buildSlashPath(u);
          this.trail.setPath(this.slashPoints, clamp(u / 0.12, 0, 1));
        }
        if (u >= 1) {
          this.slashComplete = true;
          this.slashFade = COMBAT_CONFIG.SLASH_FADE;
        }
      }

      if (!this.swingImpactFired && progress >= COMBAT_CONFIG.IMPACT_POINT) {
        this.swingImpactFired = true;
        this.onSwingImpact?.();
      }

      if (progress >= 1) {
        this.swinging = false;
        // The blade is back in the grip and fades in there. It does not
        // travel in from the side of the screen.
        this.resetSwingPose();
        this.bladeState = 'returning';
        this.bladeStateElapsed = 0;
        this.setBladeVisible(true);
        this.setBladeAlpha(0);
      }
    }

    // The afterglow: the finished slash keeps burning for a moment.
    if (this.slashComplete) {
      this.slashFade = Math.max(0, this.slashFade - dt);
      const alpha = this.slashFade / COMBAT_CONFIG.SLASH_FADE;
      if (alpha > 0) {
        this.trail.setPath(this.slashPoints, alpha);
      } else {
        this.trail.hide();
      }
    }

    // The steel fades back in at the grip.
    if (this.bladeState === 'returning') {
      this.bladeStateElapsed += dt;
      const t = clamp(this.bladeStateElapsed / COMBAT_CONFIG.SLASH_RECOVER, 0, 1);
      const blend = t * t * (3 - 2 * t);
      this.setBladeAlpha(blend);
      // A small pop as it lands, so the blade does not just blink on.
      if (this.alignNode) {
        this.alignNode.scaling.setAll(MODEL_SCALE * (0.94 + 0.06 * blend));
      }
      if (t >= 1) {
        this.bladeState = 'solid';
        this.setBladeAlpha(1);
        if (this.alignNode) {
          this.alignNode.scaling.setAll(MODEL_SCALE);
        }
      }
    }
  }

  /**
   * Place the hidden blade so its tip sits exactly on the slash path.
   *
   * The blade points along the path, so the tip leads the cut and the
   * handle trails behind it.
   */
  private updateSwingPose(u: number) {
    const swingNode = this.swingNode;
    const root = this.root;
    if (!swingNode || !root) return;

    const tip = slashPoint(this.slashShape, u);
    const bladeDirection = slashTangent(this.slashShape, u).normalize();

    // The resting pose (bob, sway, movement state) is the frame the swing
    // happens in, so the slash is expressed in it.
    const rootRotation = BABYLON.Quaternion.RotationYawPitchRoll(
      root.rotation.y,
      root.rotation.x,
      root.rotation.z,
    );
    const inverseRoot = rootRotation.conjugate();

    const directionLocal = new BABYLON.Vector3();
    bladeDirection.rotateByQuaternionToRef(inverseRoot, directionLocal);

    const tipTargetLocal = new BABYLON.Vector3();
    tip.subtract(root.position).rotateByQuaternionToRef(inverseRoot, tipTargetLocal);

    // Turn the blade onto the new direction.
    const rotation = BABYLON.Quaternion.Identity();
    BABYLON.Quaternion.FromUnitVectorsToRef(this.bladeAxis, directionLocal, rotation);

    // Put the tip on the path.
    const rotatedTip = new BABYLON.Vector3();
    this.tipLocal.rotateByQuaternionToRef(rotation, rotatedTip);

    swingNode.position.copyFrom(tipTargetLocal.subtract(rotatedTip));
    swingNode.rotationQuaternion!.copyFrom(rotation);
  }

  /** Put the blade back into its resting pose. */
  private resetSwingPose() {
    const swingNode = this.swingNode;
    if (!swingNode) return;
    swingNode.position.setAll(0);
    swingNode.rotationQuaternion!.copyFrom(BABYLON.Quaternion.Identity());
  }

  /** Sample the slash path up to the given point. */
  private buildSlashPath(u: number): BABYLON.Vector3[] {
    const samples = Math.max(2, Math.ceil(u * SLASH_SAMPLES) + 1);
    const points: BABYLON.Vector3[] = [];
    for (let i = 0; i < samples; i++) {
      points.push(slashPoint(this.slashShape, (i / (samples - 1)) * u));
    }
    return points;
  }
}

function bobStrengthAir(speedRatio: number) {
  return 0.18 + speedRatio * 0.22;
}
