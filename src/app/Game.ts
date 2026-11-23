import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FirstPersonController } from '../world/FirstPersonController';
import { createFirstLevel, type FirstLevelWorld } from '../world/maps/firstLevel';
import { loadLevel } from '../world/maps/loadLevel';
import { IntroCinematic } from '../cinematic/IntroCinematic';
import { KatanaViewmodel } from '../world/KatanaViewmodel';
import { Grappler, type GrappleAnchor } from '../world/Grappler';
import { HUD, type RunStats } from '../ui/HUD';
import { AudioManager } from '../audio/AudioManager';
import { COMBAT_CONFIG } from '../config/combat';
import {
  loadBestTime,
  loadPreferences,
  saveBestTime,
  savePreferences,
  type GamePreferences,
} from '../config/preferences';
import { ProjectileManager } from '../combat/ProjectileManager';
import { CombatSystem } from '../combat/CombatSystem';
import { ShurikenSystem } from '../combat/ShurikenSystem';
import type { MeleeEnemy } from '../entities/Enemy';
import { PistolEnemy } from '../entities/PistolEnemy';
import { SmgEnemy } from '../entities/SmgEnemy';
import { MechEnemy } from '../entities/MechEnemy';
import { SwordEliteEnemy } from '../entities/SwordEliteEnemy';
import { MOVEMENT_CONFIG } from '../config/movement';
import {
  ORIGINAL_LEVEL,
  discoverLevels,
  fetchLevelData,
  levelLabel,
} from '../world/levels/campaign';

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
  /** The shuriken ability: energy, homing stars and kill refunds. */
  private shuriken!: ShurikenSystem;
  /** The pistol guards that are shooting at the player. */
  private enemies: PistolEnemy[] = [];
  /** UZI gunners placed by SMG Spawn markers. */
  private smgEnemies: SmgEnemy[] = [];
  /** Mech robots placed by Mech Spawn markers. */
  private mechEnemies: MechEnemy[] = [];
  /** The katana duelists placed by Sword Elite Spawn markers. */
  private swordEnemies: SwordEliteEnemy[] = [];
  /** A stunned Mech's temporary grapple point. */
  private mechAnchors = new Map<MechEnemy, GrappleAnchor>();
  /** The opening shot, which owns the camera until it hands back control. */
  private cinematic?: IntroCinematic;
  /** Set when a ?level= JSON level is loaded instead of the first level. */
  private customLevel = false;
  /** The ?level= name currently being played, if any. */
  private currentLevel: string | null = null;
  /** True when finishing a ring chains into the next playable level. */
  private campaign = false;
  /** First playable level in the campaign (used to place the warning). */
  private campaignStart: string | null = null;
  /** Playable levels after this one, in campaign order. */
  private campaignChain: string[] = [];
  /** Editor Play in Game: the just-saved browser copy wins over disk. */
  private fromEditor = false;
  /** True while the first-run Ctrl+W warning owns the screen. */
  private warningPending = false;
  /** True while the pause overlay owns the screen. */
  private paused = false;
  /** True only when the Escape key opened the pause overlay. */
  private pauseOpenedByEscapeKey = false;
  /** Tracks pointer lock loss so browser Escape can pause the run. */
  private pointerWasLocked = false;
  /** True while a campaign transition is loading the next level. */
  private transitioning = false;
  /** True after falling out of the level, until R restarts. */
  private fatal = false;
  /** True after touching a finish zone, until R restarts. */
  private completed = false;
  /** Frame counter for debug logging. */
  private debugFrame = 0;

  /** Player settings loaded from local storage. */
  private preferences!: GamePreferences;
  /** Elapsed time of the current run, in real seconds. */
  private runElapsed = 0;
  /** True while the run clock is advancing. */
  private runTiming = false;
  /** Number of the current attempt, starting at one. */
  private attempts = 1;
  /** Personal best for the current level, in seconds. */
  private bestTime: number | null = null;
  /** Storage key for the current level's best time. */
  private recordKey = '';

  /** Time left of the hit-stop micro freeze, in seconds. */
  private hitStopTimer = 0;
  /** Set when the player was hit and the run has to be reset. */
  private pendingReset = false;
  /**
   * Brief immunity after a laser death so respawning on top of a hazard (or
   * brushing it again on the next frame) can't chain-kill the player.
   */
  private hazardGraceTimer = 0.6;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    const params = new URLSearchParams(window.location.search);
    const levelName = params.get('level');
    const introCourse = params.get('intro') === '1';
    // Level 1 is the hand-authored course, so ?level=level1 and ?intro=1 are
    // two ways of asking for the same place. The chain needs that identity to
    // avoid linking level 1 back to itself.
    const currentName = levelName ?? (introCourse ? ORIGINAL_LEVEL : null);
    this.fromEditor = params.get('fromEditor') === '1';
    this.campaign = params.get('campaign') === '1';
    this.currentLevel = currentName;
    this.preferences = loadPreferences();
    this.recordKey = this.currentLevel ?? ORIGINAL_LEVEL;
    this.bestTime = loadBestTime(this.recordKey);

    // "Play all" only visits levels that actually have a finish ring. Levels
    // still being built are kept in the picker but skipped here, so a chain
    // never drops the player into a dead end.
    if (this.campaign) {
      const entries = await discoverLevels(this.fromEditor);
      const playable = entries.filter((entry) => entry.hasRing);
      this.campaignStart = playable[0]?.name ?? null;
      const index = entries.findIndex((entry) => entry.name === currentName);
      this.campaignChain = entries
        .filter((entry, i) => entry.hasRing && (index < 0 || i > index))
        .map((entry) => entry.name);
      if (index >= 0 && !entries[index].hasRing && this.campaignChain.length) {
        window.location.replace(this.levelUrl(this.campaignChain[0]));
        return;
      }
    }

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
    // The controller writes Euler rotation every frame. Without this flag,
    // Babylon keeps upVector latched until roll changes, which leaves the
    // view skewed after the intro's long zero-roll hold.
    this.camera.updateUpVectorFromRotation = true;
    this.scene.activeCamera = this.camera;

    // level1 is the hand-authored opening course (the placeholder JSON is
    // ignored while it is being remade). ?intro=1 is its old alias. Other
    // ?level= names load JSON; Play in Game tags the URL so the editor's
    // just-saved copy wins over any older exported JSON on disk.
    if (levelName === ORIGINAL_LEVEL || !levelName || introCourse) {
      this.world = createFirstLevel(this.scene, this.rapierWorld, shadowGenerator);
    } else {
      const data = await fetchLevelData(levelName, this.fromEditor);
      if (!data) {
        throw new Error(`Level not found: ${levelName}.json (checked browser save, levels/ and src/world/levels)`);
      }
      this.world = loadLevel(data, this.scene, this.rapierWorld, shadowGenerator);
      this.customLevel = true;
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
    this.hud.applyPreferences(this.preferences);
    this.controller.setBaseFov((this.preferences.fov * Math.PI) / 180);

    // The first run shows a warning about CTRL + W: CTRL is the slide key,
    // but CTRL + W closes the browser tab. Hold W first, then tap CTRL.
    const firstRun = !levelName
      || levelName === 'level1'
      || (this.campaign && levelName === this.campaignStart);
    if (firstRun) {
      this.warningPending = true;
      this.input.enabled = false;
      this.hud.showControlWarning(() => this.onWarningDismissed());
    }

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

    // Q throws a shuriken. The system owns the energy bar and the stars in
    // flight; this class owns the consequences when one reaches an enemy.
    const shurikenModel = await ShurikenSystem.loadModel(this.scene);
    this.shuriken = new ShurikenSystem(
      this.scene,
      this.camera,
      this.rapierWorld,
      this.controller.rigidBody,
      shurikenModel,
    );
    this.shuriken.onThrow = () => this.audio.play('shuriken-throw');
    this.shuriken.onEnemyHit = (enemy, point, result) => {
      const outcome = this.combat.hitWithShuriken(enemy, point, result);
      // Every confirmed shuriken kill feeds the combo and the energy bar.
      if (outcome === 'kill') this.shuriken.notifyKill();
    };

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

    // UZI gunners fire short bursts. They are only loaded when placed.
    const smgSpawns = this.world.smgSpawns ?? [];
    if (smgSpawns.length) {
      const smgModel = await SmgEnemy.loadModel(this.scene);
      for (let i = 0; i < smgSpawns.length; i++) {
        const smg = new SmgEnemy(
          this.scene,
          this.rapierWorld,
          this.projectiles,
          smgModel,
          smgSpawns[i],
          i,
          this.controller.rigidBody,
          this.world.smgFacings?.[i] ?? 0,
        );
        smg.onFire = () => this.audio.play('enemy-shot');
        this.smgEnemies.push(smg);
        this.combat.registerEnemy(smg);
      }
    }

    // Sword Elites are the katana duelists. Their GLBs are large, so they are
    // only loaded when the level actually places one.
    const swordSpawns = this.world.swordEliteSpawns ?? [];
    if (swordSpawns.length) {
      const swordModel = await SwordEliteEnemy.loadModel(this.scene);
      const swordKatana = await SwordEliteEnemy.loadKatana(this.scene);
      for (let i = 0; i < swordSpawns.length; i++) {
        const elite = new SwordEliteEnemy(
          this.scene,
          this.rapierWorld,
          this.controller.rigidBody,
          swordModel,
          swordKatana,
          swordSpawns[i],
          i,
          this.world.swordEliteFacings?.[i] ?? 0,
        );
        elite.onPlayerStrike = () => {
          if (this.pendingReset || this.cinematic?.active) return;
          this.pendingReset = true;
          this.hud.flashDamage();
          this.controller.triggerImpactFeedback(
            COMBAT_CONFIG.KILL_FOV_KICK * 0.6,
            COMBAT_CONFIG.KILL_SHAKE,
          );
          this.audio.play('sword-strike');
        };
        this.swordEnemies.push(elite);
        this.combat.registerEnemy(elite);
      }
    }

    // Mechs charge a laser wave. A shuriken stuns one and turns it into a
    // temporary grapple point; hooking that point performs the execution.
    const mechSpawns = this.world.mechSpawns ?? [];
    if (mechSpawns.length) {
      const mechModel = await MechEnemy.loadModel(this.scene);
      for (let i = 0; i < mechSpawns.length; i++) {
        const mech = new MechEnemy(
          this.scene,
          this.rapierWorld,
          this.controller.rigidBody,
          mechModel,
          mechSpawns[i],
          i,
          this.world.mechFacings?.[i] ?? 0,
        );
        mech.onCharge = () => this.audio.play('mech-wave');
        mech.onPlayerStrike = () => {
          if (this.pendingReset || this.cinematic?.active) return;
          this.pendingReset = true;
          this.hud.flashDamage();
        };
        // The anchor is created disabled: it only becomes visible and
        // targetable while the Mech is stunned by a shuriken.
        const anchorPosition = mech.position.add(
          new BABYLON.Vector3(0, COMBAT_CONFIG.MECH_CENTER_HEIGHT, 0),
        );
        const anchor = this.grappler.addAnchor(anchorPosition, null, 0.85, false);
        anchor.onGrapple = () => {
          if (!mech.isStunned) return;
          this.combat.killEnemy(mech);
          this.hitStopTimer = COMBAT_CONFIG.KILL_HITSTOP * 1.5;
          this.hud.flashHit();
          this.controller.triggerImpactFeedback(
            COMBAT_CONFIG.KILL_FOV_KICK,
            COMBAT_CONFIG.KILL_SHAKE,
          );
          this.audio.play('katana-slash');
        };
        mech.onStunChange = (stunned) => {
          anchor.enabled = stunned && mech.isAlive;
          anchor.marker.setEnabled(anchor.enabled);
        };
        this.mechAnchors.set(mech, anchor);
        this.mechEnemies.push(mech);
        this.combat.registerEnemy(mech);
      }
    }

    // Left mouse swings the katana. The blade animation and the hit
    // resolution are driven by the viewmodel, the hit itself by the combat
    // registry.
    this.input.onAttackPressed = () => {
      if (!this.katana.playSwing()) return;
      // A new swing gets a fresh set of possible hits: the previous swing may
      // have stunned a Sword Elite and must not finish it on the same input.
      this.combat.beginSwing();
      this.audio.play('katana-swing');
      // The first frames of the swing are the parry window: from here on,
      // an incoming bolt in front of the blade gets turned around.
      this.projectiles.notifySlashStarted();
      // A slash next to a guard pulls the player in, so a fast pass does
      // not sail straight over the target.
      this.lungeAtEnemy();
    };
    this.katana.onSwingImpact = () => this.resolveSwing();

    // Q throws a shuriken. It costs half the energy bar and homes toward a
    // target near the crosshair; a miss simply spends the energy.
    this.input.onThrowPressed = () => {
      if (this.cinematic?.active || this.completed || this.fatal) return;
      this.shuriken.throw(this.combat.trackedEnemies);
    };

    // A kill freezes the world for a moment and plays the sound of the
    // blade going through the guard.
    this.combat.onKill = () => {
      this.hitStopTimer = COMBAT_CONFIG.KILL_HITSTOP;
      // The flash is what makes the freeze readable: the world holds still
      // while the screen pops.
      this.hud.flashHit();
      this.audio.play('katana-slash');
    };

    // A perfect hit is not a kill: it rings the Elite's guard open for the
    // next swing. The stun is its own small impact so it feels deliberate.
    this.combat.onPerfectStun = () => {
      this.hitStopTimer = COMBAT_CONFIG.SWORD_STUN_HITSTOP;
      this.hud.flashHit();
      this.controller.triggerImpactFeedback(
        COMBAT_CONFIG.PARRY_FOV_KICK,
        COMBAT_CONFIG.PARRY_SHAKE * 0.6,
      );
      this.audio.play('parry');
    };

    // Out-of-time swings clang off the Elite's blade and shove the player
    // back. No reset here: the player keeps control and can try again.
    this.combat.onBlocked = (_point, enemy) => {
      this.hitStopTimer = COMBAT_CONFIG.SWORD_BLOCK_HITSTOP;
      this.controller.knockbackFrom(
        enemy.position,
        COMBAT_CONFIG.SWORD_BLOCK_KNOCKBACK,
        COMBAT_CONFIG.SWORD_BLOCK_LIFT,
      );
      // The shove cancels an in-flight pull without notifying the hook.
      if (this.grappler.isAttached) this.grappler.detach();
      this.controller.triggerImpactFeedback(
        COMBAT_CONFIG.PARRY_FOV_KICK * 0.6,
        COMBAT_CONFIG.PARRY_SHAKE,
      );
      this.audio.play('sword-block');
    };

    // A shuriken stun is its own pop: the Mech's head turns cyan and its
    // grapple ring appears. No reset - this is the execution window.
    this.combat.onShurikenStun = () => {
      this.hitStopTimer = COMBAT_CONFIG.SWORD_STUN_HITSTOP;
      this.hud.flashHit();
      this.controller.triggerImpactFeedback(
        COMBAT_CONFIG.PARRY_FOV_KICK * 0.8,
        COMBAT_CONFIG.PARRY_SHAKE * 0.7,
      );
      this.audio.play('parry');
    };

    // A duelist bats the star aside: a small clang, no kill.
    this.combat.onShurikenBlock = () => {
      this.hitStopTimer = COMBAT_CONFIG.SWORD_BLOCK_HITSTOP;
      this.audio.play('sword-block');
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

    // R resets the run by hand, the same way a death does. While paused it
    // restarts from the menu instead of leaving the overlay up.
    this.input.onResetPressed = () => {
      if (this.paused) this.restartFromPause();
      else this.resetRun();
    };

    // Escape pauses or resumes. Pointer lock may also be lost before the key
    // event arrives, so the lock callback can open the same menu. The flag
    // below stops that second event from closing it again.
    this.input.onPausePressed = () => {
      if (this.paused) {
        if (this.pauseOpenedByEscapeKey) this.resume();
        return;
      }
      if (!this.canPause()) return;
      this.pauseOpenedByEscapeKey = true;
      this.pause();
    };

    // H toggles the input overlay from anywhere, including the pause menu.
    this.input.onHudTogglePressed = () => {
      this.preferences.showInputOverlay = !this.preferences.showInputOverlay;
      this.hud.applyPreferences(this.preferences);
      savePreferences(this.preferences);
    };

    this.input.onPointerLockChange = (locked) => {
      if (locked) {
        this.pointerWasLocked = true;
        return;
      }
      const wasLocked = this.pointerWasLocked;
      this.pointerWasLocked = false;
      if (wasLocked && !this.paused && this.canPause()) {
        this.pauseOpenedByEscapeKey = false;
        this.pause();
      }
    };

    this.audio = new AudioManager(this.scene);
    this.audio.setVolume(this.preferences.volume);
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
          // The intro is a cutscene, so the run starts when control is handed
          // back to the player.
          this.runTiming = true;
        },
      });
    }

    // Space/Enter dismisses the first-run warning before it can skip a
    // cinematic: at that point the intro has not even started yet.
    this.input.onSkipPressed = () => {
      if (this.paused) return;
      if (this.hud.controlWarningActive) {
        this.hud.dismissControlWarning();
        return;
      }
      this.cinematic?.skip();
    };

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
      shuriken: this.shuriken,
      enemies: this.enemies,
      smgEnemies: this.smgEnemies,
      mechEnemies: this.mechEnemies,
      swordEnemies: this.swordEnemies,
      cinematic: this.cinematic,
      world: this.world,
      hud: this.hud,
    };

    // The game starts with the opening shot unless the first-run warning is
    // still up; dismissing it starts the shot.
    if (!this.warningPending) this.cinematic?.start();
    if (this.customLevel && !this.warningPending) this.runTiming = true;

    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);

      // Pause holds every system, including the intro and animated props.
      // The last rendered frame stays on screen behind the menu.
      if (this.paused) {
        this.input.read();
        this.scene.render();
        return;
      }

      // The first-run warning holds the whole simulation: no movement, no
      // enemies and no cinematic until the player acknowledges it.
      if (this.warningPending) {
        this.world.update(dt);
        this.scene.render();
        return;
      }

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
        for (const smg of this.smgEnemies) {
          smg.update(dt, 1, this.camera.position);
        }
        for (const mech of this.mechEnemies) {
          mech.update(dt, 1, this.camera.position);
        }
        for (const elite of this.swordEnemies) {
          elite.update(dt, 1, this.camera.position);
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
          energy: this.shuriken.energyAmount,
          speedEffect: 0,
          dashing: false,
          sliding: false,
          sensoryBoost: false,
          run: this.runStats(),
          input: this.controller.inputState,
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

      // The run clock uses real time, so hit-stop still counts. It stops on
      // pause, death, completion, and during the intro.
      if (this.runTiming) this.runElapsed += dt;

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
      for (const smg of this.smgEnemies) {
        smg.update(simulationDt, worldTimeScale, playerPosition);
      }
      for (const mech of this.mechEnemies) {
        mech.update(simulationDt, worldTimeScale, playerPosition);
      }
      for (const elite of this.swordEnemies) {
        elite.update(simulationDt, worldTimeScale, playerPosition);
      }

      // Mech grapple anchors follow their robot. They are only enabled while
      // the Mech is stunned, so no permanent ring appears in the level.
      for (const [mech, anchor] of this.mechAnchors) {
        anchor.position.copyFrom(
          mech.position.add(new BABYLON.Vector3(0, COMBAT_CONFIG.MECH_CENTER_HEIGHT, 0)),
        );
        anchor.marker.position.copyFrom(anchor.position);
      }

      const tracked = this.combat.trackedEnemies;
      const combatRangeSq = COMBAT_CONFIG.SHURIKEN_COMBAT_RANGE ** 2;
      const inCombat = tracked.some(
        (enemy) => enemy.isAlive
          && BABYLON.Vector3.DistanceSquared(enemy.position, playerPosition) <= combatRangeSq,
      );
      this.shuriken.update(simulationDt, inCombat, tracked);
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

      // Touching a laser wall kills the player and respawns them at the start.
      // The short grace timer (started at spawn and refreshed after each death)
      // stops an overlapping hazard from killing them again on the next frame.
      this.hazardGraceTimer = Math.max(0, this.hazardGraceTimer - dt);
      if (this.hazardGraceTimer <= 0 && this.touchesLaserWall(playerPosition)) {
        this.hud.flashDamage();
        this.hazardGraceTimer = 0.8;
        this.pendingReset = true;
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
        energy: this.shuriken.energyAmount,
        speedEffect: this.controller.speedEffectIntensity,
        dashing: this.controller.isDashing,
        sliding: this.controller.isSliding,
        sensoryBoost: this.controller.isSensoryBoosting,
        run: this.runStats(),
        input: this.controller.inputState,
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

    const best: { enemy: MeleeEnemy | null; distance: number } = {
      enemy: null,
      distance: Number.POSITIVE_INFINITY,
    };

    const consider = (enemy: MeleeEnemy) => {
      if (!enemy.isAlive) return;
      // Never yank the player into an active duel: the Elite has to come to
      // them. Once it is stunned, though, the finisher can lunge normally.
      if (enemy instanceof SwordEliteEnemy && !enemy.canBeLungedAt) return;

      const toEnemy = enemy.center.subtract(cameraPosition);
      const distance = toEnemy.length();
      if (distance > COMBAT_CONFIG.LUNGE_RANGE) return;

      // Only a guard the player is actually swinging at pulls them in.
      if (distance > 0.001) {
        const direction = toEnemy.scale(1 / distance);
        if (BABYLON.Vector3.Dot(direction, forward) <= COMBAT_CONFIG.LUNGE_CONE_DOT) {
          return;
        }
      }

      if (distance < best.distance) {
        best.enemy = enemy;
        best.distance = distance;
      }
    };

    for (const enemy of this.enemies) consider(enemy);
    for (const smg of this.smgEnemies) consider(smg);
    for (const elite of this.swordEnemies) consider(elite);

    const target = best.enemy;
    if (!target) return;

    this.controller.lungeToward(
      target.center,
      COMBAT_CONFIG.LUNGE_PULL_SPEED,
      COMBAT_CONFIG.LUNGE_DIRECTION_BLEND,
      COMBAT_CONFIG.LUNGE_DURATION,
    );
  }

  /**
   * Test the player's capsule against every laser wall in the level.
   *
   * Each wall is an oriented box. Bringing the player's centre into the wall's
   * local space (via the inverse rotation) turns the test into three cheap
   * axis comparisons. A small pad accounts for the player's radius so
   * brushing the surface counts as touching it.
   */
  private touchesLaserWall(playerPosition: BABYLON.Vector3): boolean {
    const pad = MOVEMENT_CONFIG.PLAYER_RADIUS + 0.15;
    for (const wall of this.world.laserWalls ?? []) {
      const local = playerPosition.subtract(wall.position);
      local.rotateByQuaternionToRef(wall.inverseRotation, local);
      if (Math.abs(local.x) <= wall.halfExtents.x + pad
        && Math.abs(local.y) <= wall.halfExtents.y + pad
        && Math.abs(local.z) <= wall.halfExtents.z + pad) {
        return true;
      }
    }
    return false;
  }

  /** Snapshot of the run stats drawn in the bottom HUD panel. */
  private runStats(): RunStats {
    return {
      elapsed: this.runElapsed,
      bestTime: this.bestTime,
      attempts: this.attempts,
      showTimer: this.preferences.showTimer,
      showBestTime: this.preferences.showBestTime,
      showAttempts: this.preferences.showAttempts,
      showInputOverlay: this.preferences.showInputOverlay,
    };
  }

  /** Pausing is available once gameplay or the intro owns the screen. */
  private canPause() {
    return !this.warningPending && !this.fatal && !this.completed && !this.transitioning;
  }

  /** Freeze the run and hand the screen to the pause menu. */
  private pause() {
    if (this.paused || !this.canPause()) return;
    this.paused = true;
    this.input.enabled = false;
    this.input.releasePointerLock();
    this.hud.showPause({
      resume: () => this.resume(),
      restart: () => this.restartFromPause(),
      quit: () => this.quitToLevelSelect(),
      settings: { ...this.preferences },
      onVolumeChange: (volume) => {
        this.preferences.volume = volume;
        this.audio.setVolume(volume);
        savePreferences(this.preferences);
      },
      onFovChange: (degrees) => {
        this.preferences.fov = degrees;
        this.controller.setBaseFov((degrees * Math.PI) / 180);
        savePreferences(this.preferences);
      },
      onToggle: (key, value) => {
        this.preferences[key] = value;
        this.hud.applyPreferences(this.preferences);
        savePreferences(this.preferences);
      },
    });
  }

  /** Leave the pause menu and give input back to the player. */
  private resume() {
    if (!this.paused) return;
    this.paused = false;
    this.pauseOpenedByEscapeKey = false;
    this.hud.hidePause();
    this.input.enabled = true;
    this.input.requestPointerLock();
  }

  /** Restart from the pause menu, then return to play or the intro. */
  private restartFromPause() {
    if (!this.paused) return;
    this.paused = false;
    this.pauseOpenedByEscapeKey = false;
    this.hud.hidePause();
    this.resetRun();
    if (!this.cinematic?.active) this.input.requestPointerLock();
  }

  /** Leave the run and return to the level picker. */
  private quitToLevelSelect() {
    window.location.href = '/';
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
    this.runTiming = false;
    this.input.enabled = false;
    // Release the hook now, not on R: a death mid-pull must not leave the
    // ring marked as attached behind the fatal screen.
    this.grappler.reset();
    this.grappler.update(0);
    this.hud.showFatalError();
  }

  /** Freeze the run on a completion screen until R restarts it. */
  private enterCompleted() {
    if (this.completed) return;
    this.completed = true;
    this.runTiming = false;
    this.input.enabled = false;

    const time = this.runElapsed;
    const previousBest = this.bestTime;
    const isBest = previousBest === null || time < previousBest;
    if (isBest) {
      this.bestTime = time;
      saveBestTime(this.recordKey, time);
    }
    const stats = {
      time,
      bestTime: this.bestTime,
      attempts: this.attempts,
      isBest,
    };

    // In campaign mode a finish ring is a doorway into the next playable
    // level. Ringless levels were already skipped when this level loaded.
    const next = this.campaignChain[0];
    if (this.campaign && next) {
      this.transitioning = true;
      this.hud.showLevelComplete(
        `${levelLabel(this.currentLevel ?? '')} CLEAR`,
        'LOADING NEXT LEVEL…',
        stats,
      );
      window.setTimeout(() => {
        window.location.href = this.levelUrl(next);
      }, 900);
      return;
    }

    this.hud.showLevelComplete(
      this.campaign ? 'CAMPAIGN COMPLETE' : 'LEVEL COMPLETE',
      this.campaign
        ? 'PRESS <kbd>R</kbd> TO RUN THE FINAL LEVEL AGAIN'
        : 'PRESS <kbd>R</kbd> TO RUN IT AGAIN',
      stats,
    );
  }

  /** Build a URL for another level, keeping the campaign/editor flags. */
  private levelUrl(name: string): string {
    const params = new URLSearchParams();
    params.set('level', name);
    if (this.campaign) params.set('campaign', '1');
    if (this.fromEditor) params.set('fromEditor', '1');
    return `/?${params.toString()}`;
  }

  /** Begin play once the first-run Ctrl+W warning has been acknowledged. */
  private onWarningDismissed() {
    if (!this.warningPending) return;
    this.warningPending = false;
    this.input.enabled = true;
    if (this.customLevel) {
      // The dismiss click/key press is a user gesture, so pointer lock can be
      // taken here without asking for another click on the canvas.
      this.input.requestPointerLock();
      this.runTiming = true;
    } else {
      this.cinematic?.start();
    }
  }

  /**
   * Put the run back to the start.
   *
   * No loading screen, no menu: the player is back in the courtyard in the
   * same frame, every bolt in the air is gone and every guard is standing
   * again. If R is pressed during the intro the whole shot plays again.
   */
  private resetRun() {
    // R must not restart the old level while the next campaign level is loading.
    if (this.transitioning) return;
    const replayIntro = this.cinematic?.active ?? false;
    this.attempts += 1;
    this.runElapsed = 0;
    this.runTiming = false;

    // Teleporting cancels the controller's pull silently; clear the hook's
    // tether too so the next grapple works immediately after respawning.
    this.grappler.reset();
    this.combat.respawnAll();
    this.projectiles.clear();
    this.shuriken.reset();
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
      // A restart begins at the gameplay spawn, so the clock starts now.
      this.runTiming = true;
      // Restart at the courtyard where control was handed over, not back up
      // on the rooftop beam.
      this.controller.setSpawn(this.world.gameplaySpawn);
      this.controller.setPose(this.world.gameplaySpawn, this.world.playerFacing, 0);
    }
  }
}
