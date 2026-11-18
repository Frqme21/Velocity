import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FirstPersonController } from '../world/FirstPersonController';
import { createFirstLevel, type FirstLevelWorld } from '../world/maps/firstLevel';
import { loadLevel } from '../world/maps/loadLevel';
import { IntroCinematic } from '../cinematic/IntroCinematic';
import { KatanaViewmodel } from '../world/KatanaViewmodel';
import { Grappler } from '../world/Grappler';
import { HUD } from '../ui/HUD';
import { AudioManager } from '../audio/AudioManager';
import { COMBAT_CONFIG } from '../config/combat';
import { ProjectileManager } from '../combat/ProjectileManager';
import { CombatSystem } from '../combat/CombatSystem';
import { PistolEnemy } from '../entities/PistolEnemy';

export class Game {
  private canvas: HTMLCanvasElement;
  private engine!: BABYLON.Engine;
  private scene!: BABYLON.Scene;
  private camera!: BABYLON.FreeCamera;
  private input!: InputManager;
  private controller!: FirstPersonController;
  private katana!: KatanaViewmodel;
  private combat!: CombatSystem;
  private grappler!: Grappler;
  private hud!: HUD;
  private audio!: AudioManager;
  private physics!: PhysicsWorld;
  /** The current level: the linear first-stage traversal course. */
  private world!: FirstLevelWorld;
  private rapierWorld!: RAPIER.World;
  private projectiles!: ProjectileManager;
  /** The guards that are shooting at the player. */
  private enemies: PistolEnemy[] = [];
  /** The opening shot, which owns the camera until it hands back control. */
  private cinematic?: IntroCinematic;
  /** Set when a ?level= JSON level is loaded instead of the first level. */
  private customLevel = false;
  /** True after falling out of the level, until R restarts. */
  private fatal = false;
  /** True after touching a finish zone, until R restarts. */
  private completed = false;
  /** Frame counter for debug logging. */
  private debugFrame = 0;

  /** Time left of the hit-stop micro freeze, in seconds. */
  private hitStopTimer = 0;
  /** Set when the player was hit and the run has to be reset. */
  private pendingReset = false;

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

    // ?level=name loads a JSON-built level; otherwise the hand-authored
    // first level is used. JSON levels skip the scripted intro and drop the
    // player straight into gameplay at gameplaySpawn.
    const params = new URLSearchParams(window.location.search);
    const levelName = params.get('level');
    // Play in Game tags the URL so the editor's just-saved copy wins over any
    // older exported JSON sitting on disk. A plain ?level=name still prefers
    // the on-disk level, with localStorage only as a fallback.
    const fromEditor = params.get('fromEditor') === '1';
    if (levelName) {
      let data: unknown = null;
      const storedRaw = localStorage.getItem(`velocity-level-${levelName}`);
      let stored: unknown = null;
      if (storedRaw) {
        try {
          stored = JSON.parse(storedRaw);
        } catch {
          stored = null;
        }
      }
      if (fromEditor && stored !== null) {
        data = stored;
      }
      if (data === null) {
        for (const url of [
          `/src/world/levels/${levelName}.json`,
          `/levels/${levelName}.json`,
        ]) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              data = await response.json();
              break;
            }
          } catch {
            // Missing path or offline — try the next one.
          }
        }
      }
      if (data === null && stored !== null) data = stored;
      if (data === null) {
        throw new Error(`Level not found: ${levelName}.json (checked browser save, src/world/levels and /levels)`);
      }
      this.world = loadLevel(data as never, this.scene, this.rapierWorld, shadowGenerator);
      this.customLevel = true;
    } else {
      this.world = createFirstLevel(this.scene, this.rapierWorld, shadowGenerator);
    }

    this.input = new InputManager(this.canvas);
    this.controller = new FirstPersonController(
      this.camera,
      this.rapierWorld,
      this.input,
      this.world.spawn,
    );

    // JSON levels start gameplay immediately at the gameplay spawn; there is
    // no scripted intro cinematic for them.
    if (this.customLevel) {
      this.controller.setSpawn(this.world.gameplaySpawn);
      this.controller.setPose(this.world.gameplaySpawn, this.world.playerFacing, 0);
    }

    // Parkour triggers: JSON levels tag their wall-run surfaces in the
    // editor. The hand-authored level keeps the old "any wall" behaviour.
    this.controller.setParkourTriggers(
      this.world.wallRunColliders,
      this.world.wallRunStrict,
    );
    this.controller.setMantleTriggers(
      this.world.mantleColliders,
      this.world.mantleStrict,
    );

    this.hud = new HUD(document.getElementById('hud')!);

    this.grappler = new Grappler(
      this.scene,
      this.camera,
      this.rapierWorld,
      this.controller.rigidBody,
    );
    for (const anchor of this.world.grappleAnchors) {
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

    // The bolts and the parry. The projectile manager owns the bullets and
    // turns the incoming ones around when the blade is in its window. It
    // gets the physics world as well, so the bolts stop at walls instead
    // of sailing straight through the this.world.
    this.projectiles = new ProjectileManager(
      this.scene,
      this.camera,
      this.rapierWorld,
      this.controller.rigidBody,
    );

    // The combat system owns the kills: the katana cuts the guards down
    // during the strike phase, and a bolt the player sent back goes
    // straight through them.
    this.combat = new CombatSystem(
      this.scene,
      this.camera,
      this.controller,
      this.projectiles,
      this.katana,
    );

    // The guards. The model is loaded once and cloned for each of them.
    const enemyModel = await PistolEnemy.loadModel(this.scene);
    for (let i = 0; i < this.world.enemySpawns.length; i++) {
      const enemy = new PistolEnemy(
        this.scene,
        this.rapierWorld,
        this.projectiles,
        enemyModel,
        this.world.enemySpawns[i],
        i,
        this.controller.rigidBody,
        this.world.enemyFacings[i] ?? 0,
      );
      enemy.onFire = () => this.audio.play('enemy-shot');
      this.enemies.push(enemy);
      this.combat.registerEnemy(enemy);
    }

    // Left mouse swings the katana. The blade animation and the hit
    // resolution are driven by the viewmodel, the hit itself by the combat
    // registry.
    this.input.onAttackPressed = () => {
      if (!this.katana.playSwing()) return;
      this.audio.play('katana-swing');
      // The first frames of the swing are the parry window: from here on,
      // an incoming bolt in front of the blade gets turned around.
      this.projectiles.notifySlashStarted();
      // A slash next to a guard pulls the player in, so a fast pass does
      // not sail straight over the target.
      this.lungeAtEnemy();
    };
    this.katana.onSwingImpact = () => this.resolveSwing();

    // A kill freezes the world for a moment and plays the sound of the
    // blade going through the guard.
    this.combat.onKill = () => {
      this.hitStopTimer = COMBAT_CONFIG.KILL_HITSTOP;
      // The flash is what makes the freeze readable: the world holds still
      // while the screen pops.
      this.hud.flashHit();
      this.audio.play('katana-slash');
    };

    // A deflect is its own little impact: freeze, punch the camera out,
    // shake it, and clang.
    this.projectiles.onDeflect = () => {
      this.hitStopTimer = COMBAT_CONFIG.PARRY_HITSTOP;
      this.controller.triggerImpactFeedback(
        COMBAT_CONFIG.PARRY_FOV_KICK,
        COMBAT_CONFIG.PARRY_SHAKE,
      );
      this.audio.play('parry');
    };

    // An incoming bolt that lands hurts: a red flash and an instant
    // reset back to the spawn point. The reset is deferred to the end of
    // the frame, so nothing is torn down while the frame is still running.
    this.projectiles.onPlayerHit = () => {
      if (this.pendingReset) return;
      this.pendingReset = true;
      this.hud.flashDamage();
    };

    // R resets the run by hand, the same way a death does.
    this.input.onResetPressed = () => this.resetRun();

    this.audio = new AudioManager(this.scene);
    await this.audio.load();
    // The browser needs a gesture before the audio context may run.
    this.canvas.addEventListener('click', () => this.audio.unlock());

    // The opening shot takes the camera, the input and the blade until it is
    // done. JSON levels skip it and start gameplay immediately.
    if (!this.customLevel) {
      this.cinematic = new IntroCinematic({
        camera: this.camera,
        controller: this.controller,
        katana: this.katana,
        hud: this.hud,
        input: this.input,
        audio: this.audio,
        combat: this.combat,
        victim: this.enemies[0],
        enemies: this.enemies,
        gameplaySpawn: this.world.gameplaySpawn,
        onFinish: () => {
          this.pendingReset = false;
          this.hitStopTimer = 0;
        },
      });
      this.input.onSkipPressed = () => this.cinematic!.skip();
    }

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
      projectiles: this.projectiles,
      enemies: this.enemies,
      cinematic: this.cinematic,
      world: this.world,
      hud: this.hud,
    };

    // The game starts with the opening shot; the ordinary render loop takes
    // over the moment it finishes.
    this.cinematic?.start();

    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);

      // Level props keep moving through hit-stop and through the intro.
      this.world.update(dt);

      // --- The opening shot -----------------------------------------------
      // The cinematic owns the camera, the blade and the input. The player is
      // not simulated at all, so nothing can fight the scripted camera.
      if (this.cinematic?.active) {
        this.cinematic.update(dt);
        for (const enemy of this.enemies) {
          enemy.update(dt, 1, this.camera.position);
        }
        this.combat.update(dt);
        this.katana.update(dt, {
          speed: 0,
          grounded: false,
          dashing: false,
          sliding: false,
          wallRunning: false,
          sensoryBoosting: false,
        });
        this.hud.update({
          speed: 0,
          fps: this.engine.getFps(),
          dashCharge: 1,
          meter: 1,
          speedEffect: 0,
          dashing: false,
          sliding: false,
          sensoryBoost: false,
        });
        this.scene.render();
        return;
      }

      // --- Level complete: frozen until R ----------------------------------
      if (this.completed) {
        this.world.update(dt);
        this.scene.render();
        return;
      }

      // --- Fatal error: frozen until R ------------------------------------
      if (this.fatal) {
        this.input.read();
        this.combat.update(dt);
        this.scene.render();
        return;
      }

      // Hit-stop: the whole world freezes for a few milliseconds when the
      // blade connects. Everything that moves is held still - the player,
      // the guards, the bolts and the blade itself - so the cut reads as
      // one frozen frame instead of a stutter. Only the impact flash and
      // the sparks keep running, so the hit still pops.
      this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
      const frozen = this.hitStopTimer > 0;
      const simulationDt = frozen ? 0 : dt;

      // The movement runs first, then the grapple visuals are refreshed so the
      // tether starts at the player's current off-hand position and ends
      // exactly at the center of the locked ring.
      this.controller.update(simulationDt);
      if (!frozen) this.physics.step();
      this.grappler.update(simulationDt);

      // Debug: log player position and physics step every 60 frames
      this.debugFrame++;
      if (this.debugFrame % 60 === 0) {
        const p = this.controller.position;
        console.log(`[Game] step pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) grounded=${this.controller.isGrounded} speed=${this.controller.horizontalSpeed.toFixed(2)}`);
      }

      // Write the final camera transform after physics and immediately before
      // rendering, so camera.rotation can never lag behind by one frame.
      const playerPosition = this.controller.position;
      this.controller.syncCamera(playerPosition.x, playerPosition.y, playerPosition.z);

      // The bolts and the guards. Bullets use the world's time scale, so
      // the sensory boost turns them into slow motion targets.
      this.projectiles.setPlayerPosition(playerPosition);
      this.projectiles.update(simulationDt, this.controller.worldTimeScale);

      const worldTimeScale = this.controller.worldTimeScale;
      for (const enemy of this.enemies) {
        enemy.update(simulationDt, worldTimeScale, playerPosition);
      }
      this.combat.update(dt);

      // Touching a finish zone clears the level. Distance is measured on the
      // ground plane with a generous vertical window so a jump over the pad
      // still counts, but falling far below it does not.
      if (!this.completed) {
        for (const zone of this.world.finishZones ?? []) {
          const dx = playerPosition.x - zone.position.x;
          const dz = playerPosition.z - zone.position.z;
          const dy = Math.abs(playerPosition.y - zone.position.y);
          if (dx * dx + dz * dz <= zone.radius * zone.radius && dy <= 3) {
            this.enterCompleted();
            break;
          }
        }
      }

      // Falling out of the level is a fatal error, not a silent teleport.
      if (playerPosition.y < this.world.killY) {
        this.enterFatal();
      }

      // The reset happens at the very end of the frame, so the whole frame
      // is drawn with the world it started with.
      if (this.pendingReset) {
        this.pendingReset = false;
        this.resetRun();
      }

      this.katana.update(simulationDt, {
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
    // Never resolve player swings during the intro cinematic.
    if (this.cinematic?.active) return;

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

  /**
   * Pull the player toward a guard that is close to the blade.
   *
   * This is the gap closer of the dash-slash: a slash next to a guard
   * bends the player's momentum toward it, so a dash at full speed does
   * not sail straight past the target and miss the swing.
   */
  private lungeAtEnemy() {
    const cameraPosition = this.camera.position;
    const forward = this.camera.getForwardRay().direction;

    let target: PistolEnemy | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;

      const toEnemy = enemy.center.subtract(cameraPosition);
      const distance = toEnemy.length();
      if (distance > COMBAT_CONFIG.LUNGE_RANGE) continue;

      // Only a guard the player is actually swinging at pulls them in.
      if (distance > 0.001) {
        const direction = toEnemy.scale(1 / distance);
        if (BABYLON.Vector3.Dot(direction, forward) <= COMBAT_CONFIG.LUNGE_CONE_DOT) {
          continue;
        }
      }

      if (distance < bestDistance) {
        target = enemy;
        bestDistance = distance;
      }
    }

    if (!target) return;

    this.controller.lungeToward(
      target.center,
      COMBAT_CONFIG.LUNGE_PULL_SPEED,
      COMBAT_CONFIG.LUNGE_DIRECTION_BLEND,
      COMBAT_CONFIG.LUNGE_DURATION,
    );
  }

  /**
   * Freeze the run on a fatal-error screen after a fall.
   *
   * The world keeps rendering but nothing moves until R. The message stays up
   * so the player can read what went wrong instead of being teleported
   * without an explanation.
   */
  private enterFatal() {
    if (this.fatal) return;
    this.fatal = true;
    this.input.enabled = false;
    this.hud.showFatalError();
  }

  /** Freeze the run on a completion screen until R restarts it. */
  private enterCompleted() {
    if (this.completed) return;
    this.completed = true;
    this.input.enabled = false;
    this.hud.showLevelComplete();
  }

  /**
   * Put the run back to the start.
   *
   * No loading screen, no menu: the player is back in the courtyard in the
   * same frame, every bolt in the air is gone and every guard is standing
   * again. If R is pressed during the intro the whole shot plays again.
   */
  private resetRun() {
    const replayIntro = this.cinematic?.active ?? false;

    this.combat.respawnAll();
    this.projectiles.clear();
    this.controller.setSpawn(this.world.spawn);
    this.controller.setPose(this.world.spawn, this.world.playerFacing, 0);

    this.hitStopTimer = 0;
    this.pendingReset = false;
    this.fatal = false;
    this.completed = false;
    this.hud.hideFatalError();
    this.hud.hideLevelComplete();
    this.input.enabled = true;

    this.katana.cinematicPose = null;
    this.katana.setBladeEnabled(true);

    if (replayIntro) {
      this.cinematic?.start();
    } else {
      // Restart at the courtyard where control was handed over, not back up
      // on the rooftop beam.
      this.controller.setSpawn(this.world.gameplaySpawn);
      this.controller.setPose(this.world.gameplaySpawn, this.world.playerFacing, 0);
    }
  }
}
