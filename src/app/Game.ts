import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FirstPersonController } from '../world/FirstPersonController';
import { createGraybox } from '../world/maps/graybox';
import { HUD } from '../ui/HUD';

export class Game {
  private canvas: HTMLCanvasElement;
  private engine!: BABYLON.Engine;
  private scene!: BABYLON.Scene;
  private camera!: BABYLON.FreeCamera;
  private input!: InputManager;
  private controller!: FirstPersonController;
  private hud!: HUD;
  private physics!: PhysicsWorld;
  private rapierWorld!: RAPIER.World;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    this.engine = new BABYLON.Engine(this.canvas, true, { stencil: true });
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

    this.physics = new PhysicsWorld();
    await this.physics.init();
    this.rapierWorld = this.physics.getWorld();

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.48, 0.58, 0.68, 1);
    this.scene.collisionsEnabled = false;

    const hemispheric = new BABYLON.HemisphericLight(
      'ambient',
      new BABYLON.Vector3(0, 1, 0),
      this.scene,
    );
    hemispheric.intensity = 0.75;
    hemispheric.groundColor = new BABYLON.Color3(0.22, 0.25, 0.3);

    const sun = new BABYLON.DirectionalLight(
      'sun',
      new BABYLON.Vector3(-0.45, -1, 0.35),
      this.scene,
    );
    sun.position = new BABYLON.Vector3(20, 35, -20);
    sun.intensity = 1.1;

    const shadowGenerator = new BABYLON.ShadowGenerator(1024, sun);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.bias = 0.0005;

    this.camera = new BABYLON.FreeCamera(
      'player-camera',
      new BABYLON.Vector3(0, 1, 16),
      this.scene,
    );
    this.camera.minZ = 0.05;
    this.camera.fov = (90 * Math.PI) / 180;

    // Babylon's camera is only a transform now. All built-in input and
    // smoothing behavior is removed; the controller writes it directly.
    this.camera.inputs.clear();
    this.camera.rotationQuaternion = null;
    this.camera.upVector.set(0, 1, 0);
    this.scene.activeCamera = this.camera;

    const graybox = createGraybox(this.scene, this.rapierWorld, shadowGenerator);

    this.input = new InputManager(this.canvas);
    this.controller = new FirstPersonController(
      this.camera,
      this.rapierWorld,
      this.input,
      graybox.spawn,
    );

    this.hud = new HUD(document.getElementById('hud')!);

    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
      this.controller.update(dt);
      this.physics.step();

      // Write the final camera transform after physics and immediately before
      // rendering, so camera.rotation can never lag behind by one frame.
      const playerPosition = this.controller.position;
      this.controller.syncCamera(playerPosition.x, playerPosition.y, playerPosition.z);
      this.hud.update(
        this.controller.horizontalSpeed,
        this.engine.getFps(),
        this.controller.dashChargeAmount,
      );
      this.scene.render();
    });

    window.addEventListener('resize', () => this.engine.resize());
  }
}
