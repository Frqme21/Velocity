import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

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

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export class KatanaViewmodel {
  private scene: BABYLON.Scene;
  private camera: BABYLON.FreeCamera;

  private root: BABYLON.TransformNode | null = null;
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

    const root = new BABYLON.TransformNode('katana-viewmodel', this.scene);
    root.parent = this.camera;
    this.basePosition.copyFrom(REST_POSITION).subtractInPlace(rotatedGrip);
    root.position.copyFrom(this.basePosition);
    root.rotationQuaternion = null;

    align.parent = root;
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
      }
    }

    this.addLights(meshes);
    this.root = root;

    // Draw the viewmodel in its own rendering group with a fresh depth buffer
    // so it can never clip into world geometry.
    this.scene.setRenderingAutoClearDepthStencil(1, true, true, false);
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

    root.position.set(
      this.basePosition.x + bob.x + this.swayX + this.stateOffset.x,
      this.basePosition.y + bob.y + this.swayY + this.stateOffset.y,
      this.basePosition.z + bob.z + this.stateOffset.z,
    );
    root.rotation.set(this.swayY * 0.6, this.swayX * 0.8, this.swayRoll + this.stateRoll);
  }
}

function bobStrengthAir(speedRatio: number) {
  return 0.18 + speedRatio * 0.22;
}
