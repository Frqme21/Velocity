import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FirstPersonController } from '../world/FirstPersonController';
import { createGraybox } from '../world/maps/graybox';
import { KatanaViewmodel } from '../world/KatanaViewmodel';
import { KatanaCombat } from '../world/KatanaCombat';
import { Grappler } from '../world/Grappler';
import { HUD } from '../ui/HUD';
import { AudioManager } from '../audio/AudioManager';
import { COMBAT_CONFIG } from '../config/combat';

export class Game {
  private canvas: HTMLCanvasElement;
  private engine!: BABYLON.Engine;
  private scene!: BABYLON.Scene;
  private camera!: BABYLON.FreeCamera;
  private input!: InputManager;
  private controller!: FirstPersonController;
  private katana!: KatanaViewmodel;
  private combat!: KatanaCombat;
  private grappler!: Grappler;
  private hud!: HUD;
  private audio!: AudioManager;
  private physics!: PhysicsWorld;
  private rapierWorld!: RAPIER.World;

  /** Time left of the hit-stop micro freeze, in seconds. */
  private hitStopTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    // `audioEngine: true` is needed for Babylon to create its audio engine.
    this.engine = new BABYLON.Engine(this.canvas, true, {
      stencil: true,
      audioEngine: true,
    });
    this.engine.maxFPS = 240;
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

    this.grappler = new Grappler(
      this.scene,
      this.camera,
      this.rapierWorld,
      this.controller.rigidBody,
    );
    for (const anchor of graybox.grappleAnchors) {
      this.grappler.addAnchor(anchor.position, anchor.landing);
    }
    this.input.onGrapplePressed = () => {
      this.grappler.fire();
    };

    // A single tap fires the hook. The controller owns the pull, the vault
    // and the landing; the grappler owns the targeting and the cooldown.
    this.grappler.onFire = (anchorPos, landingPos) => {
      this.controller.startGrapplePull(anchorPos, landingPos);
    };
    this.controller.onGrappleFinished = () => {
      this.grappler.detach();
    };

    this.katana = new KatanaViewmodel(this.scene, this.camera);
    try {
      await this.katana.load();
    } catch (error) {
      console.warn('Katana viewmodel failed to load', error);
    }

    // The melee registry. The enemy system will register its actors here;
    // until then every swing whiffs and nothing is cut.
    this.combat = new KatanaCombat();

    // Left mouse swings the katana. The blade animation and the hit
    // resolution are driven by the viewmodel, the hit itself by the combat
    // registry.
    this.input.onAttackPressed = () => {
      if (!this.katana.playSwing()) return;
      this.audio.play('katana-swing');
    };
    this.katana.onSwingImpact = () => this.resolveSwing();

    this.audio = new AudioManager(this.scene);
    await this.audio.load();
    // The browser needs a gesture before the audio context may run.
    this.canvas.addEventListener('click', () => this.audio.unlock());

    (window as unknown as Record<string, unknown>).__velocity = {
      BABYLON,
      scene: this.scene,
      camera: this.camera,
      katana: this.katana,
      combat: this.combat,
      grappler: this.grappler,
      controller: this.controller,
      input: this.input,
      audio: this.audio,
    };

    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);

      // Hit-stop: a tiny freeze when the blade connects. The world stops,
      // but the swing animation keeps playing so the slash stays readable.
      this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
      const simulationDt = this.hitStopTimer > 0 ? 0 : dt;

      // The movement runs first, then the grapple visuals are refreshed so the
      // tether starts at the player's current off-hand position and ends
      // exactly at the center of the locked ring.
      this.controller.update(simulationDt);
      this.physics.step();
      this.grappler.update(dt);

      // Write the final camera transform after physics and immediately before
      // rendering, so camera.rotation can never lag behind by one frame.
      const playerPosition = this.controller.position;
      this.controller.syncCamera(playerPosition.x, playerPosition.y, playerPosition.z);
      this.katana.update(dt, {
        speed: this.controller.horizontalSpeed,
        grounded: this.controller.isGrounded,
        dashing: this.controller.isDashing,
        sliding: this.controller.isSliding,
        wallRunning: this.controller.isWallRunning,
        sensoryBoosting: this.controller.isSensoryBoosting,
      });
      this.hud.update({
        speed: this.controller.horizontalSpeed,
        fps: this.engine.getFps(),
        dashCharge: this.controller.dashChargeAmount,
        meter: this.controller.isSensoryBoosting
          ? this.controller.sensoryBoostRemaining
          : this.controller.dashChargeAmount,
        speedEffect: this.controller.speedEffectIntensity,
        dashing: this.controller.isDashing,
        sliding: this.controller.isSliding,
        sensoryBoost: this.controller.isSensoryBoosting,
      });
      this.scene.render();
    });

    window.addEventListener('resize', () => this.engine.resize());
  }

  /**
   * Resolve a katana swing that just crossed the target.
   *
   * A hit freezes the world for a few milliseconds, plays the slash sound,
   * cuts the target and tops the dash meter back up so the next kill can be
   * chained straight into a dash.
   */
  private resolveSwing() {
    const target = this.combat.findTarget(
      this.camera.position,
      this.camera.getForwardRay().direction,
    );
    if (!target) return;

    // Cut it.
    target.onSlice();
    this.combat.unregisterTarget(target);

    // Punch: freeze the world for a few milliseconds.
    this.hitStopTimer = COMBAT_CONFIG.HIT_STOP;

    // The sound of the blade going through the target.
    this.audio.play('katana-slash');

    // Chain straight into the next dash.
    this.controller.refillDash(COMBAT_CONFIG.DASH_REFILL);
  }
}
