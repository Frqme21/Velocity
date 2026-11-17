import * as BABYLON from '@babylonjs/core';
import type { FirstPersonController } from '../world/FirstPersonController';
import type { KatanaViewmodel } from '../world/KatanaViewmodel';
import type { HUD } from '../ui/HUD';
import type { AudioManager } from '../audio/AudioManager';
import type { CombatSystem } from '../combat/CombatSystem';
import type { PistolEnemy } from '../entities/PistolEnemy';
import type { InputManager } from '../input/InputManager';

interface Keyframe {
  t: number;
  /** Camera eye position in world space. */
  eye: [number, number, number];
  /** World point the camera is aimed at. */
  look: [number, number, number];
  /** Vertical FOV in degrees. */
  fov: number;
  /** Optional camera roll in radians. */
  roll?: number;
  /** Subtitle shown while this keyframe is current ('' clears it). */
  caption: string;
}

interface Pose {
  position: BABYLON.Vector3;
  rotation: BABYLON.Vector3;
}

/**
 * The opening shot.
 *
 * The player starts on a rooftop beam, walks to the edge, looks down at the
 * guard in the courtyard, draws and inspects the katana, drops, cuts the guard
 * in mid-air, and lands just as control is handed back.
 *
 * Everything is driven from one timeline: camera, FOV, blur, subtitles, the
 * blade's scripted grip, the swing and the kill. That keeps the shot
 * deterministic and makes it skippable at any point.
 */
const KEYS: Keyframe[] = [
  // Approach the ledge (stay level, don't look down yet)
  { t: 0.00, eye: [0, 19.58, -4.6],  look: [0, 19.4,  6],  fov: 74, caption: 'SECTOR 07  //  04:12' },
  { t: 1.80, eye: [0, 19.58, -1.0],  look: [0, 18.9,  7],  fov: 74, caption: 'PERIMETER  /  ROOFTOP' },
  // Hold the aim level right up to the ledge; the drop into the lookout must
  // feel like a decision, not the camera drifting down half a second early.
  { t: 2.55, eye: [0, 19.56,  1.6],  look: [0, 18.6,  8],  fov: 76, caption: 'PERIMETER  /  ROOFTOP' },
  { t: 3.20, eye: [0, 19.55,  3.6],  look: [0,  1.3,  12], fov: 82, caption: 'TARGET BELOW' },
  { t: 4.40, eye: [0, 19.35,  4.6],  look: [0,  1.25, 12], fov: 82, caption: 'DRAW BLADE' },
  // The camera lifts during the inspection so the blade, not the guard, is
  // the subject for a moment. The aim snaps back down for the jump.
  { t: 5.20, eye: [0, 19.10,  5.2],  look: [0, 13.0,  15], fov: 80, roll: -0.05, caption: '' },
  { t: 6.40, eye: [0, 19.00,  5.8],  look: [0, 14.5,  17], fov: 78, roll:  0.06, caption: 'STEEL // ONLINE' },
  // CRITICAL: eye must clear the end of the beam (z > 6) BEFORE descending.
  // Beam spans z=-6..6, top y=18. At t=7.05 eye is at z=6.8, y=18.3 (above beam).
  { t: 7.05, eye: [0, 18.30,  6.8],  look: [0,  1.3,  12], fov: 80, caption: '' },
  // Continuous descent past the guard at (0,0,12): eye passes z=12 around y≈5.
  { t: 7.55, eye: [0, 13.50,  8.0],  look: [0,  1.3,  12], fov: 84, caption: '' },
  { t: 7.98, eye: [0,  7.00,  9.4],  look: [0,  1.2,  12], fov: 88, caption: '' },
  // Swing and kill just past the guard's position.
  { t: 8.35, eye: [0,  2.60,  10.8], look: [0,  1.0,  12], fov: 92, caption: '' },
  { t: 8.64, eye: [0,  1.55,  12.0], look: [0,  1.4,  17], fov: 86, caption: 'TARGET ELIMINATED' },
  // Handover pose: body centre at (0, 0.92, 14.5), eye height ~1.58.
  { t: 9.40, eye: [0,  1.58,  14.5], look: [0,  1.5,  23], fov: 78, caption: 'CONTROLS ONLINE' },
];

const END_TIME = KEYS[KEYS.length - 1].t;

/** Offsets from the resting grip pose while the blade is being inspected. */
const INSPECT: Array<{ t: number; pos: [number, number, number]; rot: [number, number, number] }> = [
  { t: 4.50, pos: [ 0,     0,     0],     rot: [ 0,     0,     0] },
  { t: 5.20, pos: [-0.42,  0.28,  0.18],  rot: [ 0.18, -0.55, -0.22] },
  { t: 6.40, pos: [-0.45,  0.33,  0.20],  rot: [-0.10,  0.35,  0.28] },
  { t: 7.05, pos: [-0.10,  0.09,  0.06],  rot: [ 0.05, -0.15, -0.10] },
  { t: 7.98, pos: [ 0,     0,     0],     rot: [ 0,     0,     0] },
];

type EventName = 'draw' | 'swing' | 'kill';
const EVENTS: Array<{ t: number; name: EventName }> = [
  { t: 4.50, name: 'draw' },
  { t: 8.10, name: 'swing' },
  { t: 8.28, name: 'kill' },
];

export interface IntroCinematicDeps {
  camera: BABYLON.FreeCamera;
  controller: FirstPersonController;
  katana: KatanaViewmodel;
  hud: HUD;
  input: InputManager;
  audio: AudioManager;
  combat: CombatSystem;
  /** The guard killed by the scripted strike (enemies[0]). */
  victim: PistolEnemy;
  /** All guards, so their AI can be held back during the shot. */
  enemies: PistolEnemy[];
  /** Where control is handed over. */
  gameplaySpawn: BABYLON.Vector3;
  onFinish: () => void;
}

export class IntroCinematic {
  private deps: IntroCinematicDeps;
  private elapsed = 0;
  private eventIndex = 0;
  private activeFlag = false;
  private restPose: Pose | null = null;
  private caption = '';

  constructor(deps: IntroCinematicDeps) {
    this.deps = deps;
  }

  get active(): boolean {
    return this.activeFlag;
  }

  /** Start (or restart) the opening shot. */
  start() {
    this.elapsed = 0;
    this.eventIndex = 0;
    this.activeFlag = true;
    this.caption = '';
    this.restPose = this.deps.katana.getRestPose();

    this.deps.input.enabled = false;
    this.deps.hud.setCinematic(true);
    this.deps.hud.setCinematicCaption('');
    this.deps.hud.setCinematicBlur(22);
    for (const enemy of this.deps.enemies) enemy.aiEnabled = false;
    this.deps.katana.setBladeEnabled(false);
    this.deps.katana.cinematicPose = null;

    this.applyFrame(0);
  }

  /** Jump straight to the playable part, e.g. when Space is pressed. */
  skip() {
    if (this.activeFlag) this.finish();
  }

  update(dt: number) {
    if (!this.activeFlag) return;
    this.elapsed += dt;

    this.applyFrame(this.elapsed);

    while (
      this.eventIndex < EVENTS.length
      && this.elapsed >= EVENTS[this.eventIndex].t
    ) {
      this.fire(EVENTS[this.eventIndex].name);
      this.eventIndex++;
    }

    if (this.elapsed >= END_TIME) this.finish();
  }

  /** Apply the whole shot at a single point in time. */
  private applyFrame(t: number) {
    const time = Math.min(t, END_TIME);
    const frame = sampleKeys(time);

    this.deps.camera.position.set(frame.eye[0], frame.eye[1], frame.eye[2]);
    this.deps.camera.fov = (frame.fov * Math.PI) / 180;

    const dx = frame.look[0] - frame.eye[0];
    const dy = frame.look[1] - frame.eye[1];
    const dz = frame.look[2] - frame.eye[2];
    const length = Math.max(Math.hypot(dx, dy, dz), 0.001);
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.max(-1.5, Math.min(1.5, Math.asin(-dy / length)));
    this.deps.camera.rotationQuaternion = null;
    this.deps.camera.rotation.set(pitch, yaw, frame.roll ?? 0);

    // The opening blur melts away over the first two seconds. A short kick
    // at the kill makes the cut itself feel like a punch.
    // Impact blur now centred on the new kill time (8.28).
    const opening = 22 * (1 - smoothstep(0, 2.0, time));
    const impact = 5 * Math.exp(-Math.pow((time - 8.28) / 0.13, 2));
    this.deps.hud.setCinematicBlur(Math.min(24, opening + impact));

    if (frame.caption !== this.caption) {
      this.caption = frame.caption;
      this.deps.hud.setCinematicCaption(this.caption);
    }

    // Hold the blade in front of the camera between the draw and the swing.
    // Inspection ends when the swing starts (t=8.10).
    if (time >= 4.50 && time < 8.10 && this.restPose) {
      const pose = sampleInspect(time);
      this.deps.katana.cinematicPose = {
        position: this.restPose.position.add(new BABYLON.Vector3(...pose.pos)),
        rotation: this.restPose.rotation.add(new BABYLON.Vector3(...pose.rot)),
      };
    } else {
      this.deps.katana.cinematicPose = null;
    }
  }

  private fire(event: EventName) {
    switch (event) {
      case 'draw':
        this.deps.katana.setBladeEnabled(true);
        this.deps.audio.play('katana-swing');
        break;
      case 'swing':
        this.deps.katana.cinematicPose = null;
        this.deps.katana.setBladeEnabled(true);
        this.deps.katana.playSwing();
        this.deps.audio.play('katana-swing');
        break;
      case 'kill':
        // The scripted victim is always cut, even if the camera angle meant
        // the melee cone missed by a hair.
        if (this.deps.victim.isAlive) this.deps.combat.killEnemy(this.deps.victim);
        break;
    }
  }

  private finish() {
    if (!this.activeFlag) return;
    this.activeFlag = false;

    // If the shot was skipped early, still put the victim down so the level
    // state is the same as if the whole intro had played.
    if (this.deps.victim.isAlive) this.deps.combat.killEnemy(this.deps.victim);

    this.deps.katana.cinematicPose = null;
    this.deps.katana.setBladeEnabled(true);
    this.deps.hud.setCinematic(false);
    this.deps.hud.setCinematicCaption('');

    this.deps.input.enabled = true;
    for (const enemy of this.deps.enemies) enemy.aiEnabled = true;

    // The body teleports to the courtyard; the player keeps looking down the
    // route, which is exactly where the last camera frame was pointing.
    this.deps.controller.setSpawn(this.deps.gameplaySpawn);
    this.deps.controller.setPose(this.deps.gameplaySpawn, 0, 0);

    // CRITICAL: clear any latched impact feedback AFTER setPose.
    // setPose resets cameraFov to BASE_FOV; we must restore the cinematic's
    // final FOV and zero all shake/roll sources that may have been set by the
    // scripted kill during the intro. Use the final keyframe FOV (78°) so the
    // handover FOV is correct even when skipping.
    const finalFov = (KEYS[KEYS.length - 1].fov * Math.PI) / 180;
    this.deps.controller.prepareHandover(finalFov);

    this.deps.onFinish();
  }
}

interface SampledFrame {
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
  roll: number;
  caption: string;
}

/**
 * Sample the camera keyframes using time-aware Hermite interpolation.
 *
 * Position uses time-aware Catmull-Rom (Hermite with tangents derived from
 * neighbouring keyframe positions and time deltas) so the eye velocity is
 * C1-continuous across segments - no stop-start in mid-air.
 *
 * Aim uses the same time-aware Hermite so the look direction also has
 * continuous angular velocity (no snaps at keyframes).
 *
 * FOV and roll use simple linear interpolation between adjacent keyframes.
 */
function sampleKeys(t: number): SampledFrame {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;

  const t0 = KEYS[Math.max(0, i - 1)].t;
  const t1 = KEYS[i].t;
  const t2 = KEYS[i + 1].t;
  const t3 = KEYS[Math.min(KEYS.length - 1, i + 2)].t;

  // Hermite parameter in [0, 1] across the [t1, t2] segment.
  const u = (t - t1) / Math.max(0.0001, t2 - t1);
  const u2 = u * u;
  const u3 = u2 * u;

  // Time-aware Catmull-Rom tangents for each component.
  // Tangent at t1:  0.5 * (p2 - p0) / (t2 - t0)  (if t2 != t0)
  // Tangent at t2:  0.5 * (p3 - p1) / (t3 - t1)  (if t3 != t1)
  // Then Hermite basis gives C1 position and velocity.
  function hermite(p0: number, p1: number, p2: number, p3: number): number {
    const dt02 = t2 - t0;
    const dt13 = t3 - t1;
    const m1 = dt02 > 0 ? 0.5 * (p2 - p0) / dt02 : 0;
    const m2 = dt13 > 0 ? 0.5 * (p3 - p1) / dt13 : 0;
    // Hermite basis
    const h00 =  2 * u3 - 3 * u2 + 1;
    const h10 =       u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 =       u3 -     u2;
    return h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
  }

  function lerpClamp(a: number, b: number): number {
    return a + (b - a) * u;
  }

  return {
    eye: [
      hermite(KEYS[Math.max(0, i - 1)].eye[0], KEYS[i].eye[0], KEYS[i + 1].eye[0], KEYS[Math.min(KEYS.length - 1, i + 2)].eye[0]),
      hermite(KEYS[Math.max(0, i - 1)].eye[1], KEYS[i].eye[1], KEYS[i + 1].eye[1], KEYS[Math.min(KEYS.length - 1, i + 2)].eye[1]),
      hermite(KEYS[Math.max(0, i - 1)].eye[2], KEYS[i].eye[2], KEYS[i + 1].eye[2], KEYS[Math.min(KEYS.length - 1, i + 2)].eye[2]),
    ],
    look: [
      hermite(KEYS[Math.max(0, i - 1)].look[0], KEYS[i].look[0], KEYS[i + 1].look[0], KEYS[Math.min(KEYS.length - 1, i + 2)].look[0]),
      hermite(KEYS[Math.max(0, i - 1)].look[1], KEYS[i].look[1], KEYS[i + 1].look[1], KEYS[Math.min(KEYS.length - 1, i + 2)].look[1]),
      hermite(KEYS[Math.max(0, i - 1)].look[2], KEYS[i].look[2], KEYS[i + 1].look[2], KEYS[Math.min(KEYS.length - 1, i + 2)].look[2]),
    ],
    fov: lerpClamp(KEYS[i].fov, KEYS[i + 1].fov),
    roll: lerpClamp(KEYS[i].roll ?? 0, KEYS[i + 1].roll ?? 0),
    // Captions switch on the exact keyframe, not between them.
    caption: t >= KEYS[i].t ? KEYS[i].caption : KEYS[Math.max(0, i - 1)].caption,
  };
}

function sampleInspect(t: number): { pos: [number, number, number]; rot: [number, number, number] } {
  let i = 0;
  while (i < INSPECT.length - 2 && t > INSPECT[i + 1].t) i++;
  const a = INSPECT[i];
  const b = INSPECT[i + 1];
  const u = smoothstep(0, 1, (t - a.t) / Math.max(0.0001, b.t - a.t));
  return {
    pos: lerp3(a.pos, b.pos, u),
    rot: lerp3(a.rot, b.rot, u),
  };
}

function lerp3(a: [number, number, number], b: [number, number, number], u: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function smoothstep(min: number, max: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}