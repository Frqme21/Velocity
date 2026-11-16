import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { MOVEMENT_CONFIG } from '../config/movement';

const MOVEMENT = {
  RUN_SPEED: MOVEMENT_CONFIG.RUN_SPEED,
  GROUND_ACCEL: MOVEMENT_CONFIG.ACCELERATE,
  AIR_ACCEL: MOVEMENT_CONFIG.AIR_ACCELERATE,
  AIR_SPEED_CAP: MOVEMENT_CONFIG.AIR_CAP,
  AIR_TURN_RATE: MOVEMENT_CONFIG.AIR_TURN_RATE,
  FRICTION: MOVEMENT_CONFIG.FRICTION,
  STOP_SPEED: MOVEMENT_CONFIG.STOP_SPEED,
  GRAVITY: MOVEMENT_CONFIG.GRAVITY,
  FALL_GRAVITY_MULTIPLIER: 1.5,
  JUMP_VELOCITY: MOVEMENT_CONFIG.JUMP_VELOCITY,
  COYOTE_TIME: MOVEMENT_CONFIG.COYOTE_TIME,
  JUMP_GROUND_GRACE: MOVEMENT_CONFIG.JUMP_GROUND_GRACE,
  DASH_SPEED: MOVEMENT_CONFIG.DASH_SPEED,
  DASH_DURATION: MOVEMENT_CONFIG.DASH_DURATION,
  DASH_RECHARGE_TIME: MOVEMENT_CONFIG.DASH_RECHARGE_TIME,
  DASH_VERTICAL_INFLUENCE: MOVEMENT_CONFIG.DASH_VERTICAL_INFLUENCE,
  DASH_VERTICAL_DOWN_INFLUENCE: MOVEMENT_CONFIG.DASH_VERTICAL_DOWN_INFLUENCE,
  DASH_VERTICAL_DEAD_ZONE: MOVEMENT_CONFIG.DASH_VERTICAL_DEAD_ZONE,
  DASH_VERTICAL_UP_MAX: MOVEMENT_CONFIG.DASH_VERTICAL_UP_MAX,
  DASH_VERTICAL_DOWN_MAX: MOVEMENT_CONFIG.DASH_VERTICAL_DOWN_MAX,
  SENSORY_BOOST_DURATION: MOVEMENT_CONFIG.SENSORY_BOOST_DURATION,
  SENSORY_BOOST_TIME_SCALE: MOVEMENT_CONFIG.SENSORY_BOOST_TIME_SCALE,
  SENSORY_BOOST_SIDE_DASH_SPEED: MOVEMENT_CONFIG.SENSORY_BOOST_SIDE_DASH_SPEED,
  SENSORY_BOOST_SIDE_DASH_DURATION: MOVEMENT_CONFIG.SENSORY_BOOST_SIDE_DASH_DURATION,
  SENSORY_BOOST_SIDE_DASH_COOLDOWN: MOVEMENT_CONFIG.SENSORY_BOOST_SIDE_DASH_COOLDOWN,
  SENSORY_BOOST_FORWARD_DASH_SPEED: MOVEMENT_CONFIG.SENSORY_BOOST_FORWARD_DASH_SPEED,
  SENSORY_BOOST_FORWARD_DASH_DURATION: MOVEMENT_CONFIG.SENSORY_BOOST_FORWARD_DASH_DURATION,
  SLIDE_MIN_SPEED: MOVEMENT_CONFIG.SLIDE_MIN_SPEED,
  SLIDE_STOP_SPEED: MOVEMENT_CONFIG.SLIDE_STOP_SPEED,
  SLIDE_BURST_SPEED: MOVEMENT_CONFIG.SLIDE_BURST_SPEED,
  SLIDE_MAX_SPEED: MOVEMENT_CONFIG.SLIDE_MAX_SPEED,
  SLIDE_SLOPE_MAX_SPEED: MOVEMENT_CONFIG.SLIDE_SLOPE_MAX_SPEED,
  SLIDE_FLAT_FRICTION: MOVEMENT_CONFIG.SLIDE_FLAT_FRICTION,
  SLIDE_RAMP_FRICTION: MOVEMENT_CONFIG.SLIDE_RAMP_FRICTION,
  SLIDE_FRICTION_RAMP: MOVEMENT_CONFIG.SLIDE_FRICTION_RAMP,
  SLIDE_COOLDOWN: MOVEMENT_CONFIG.SLIDE_COOLDOWN,
  SLIDE_CARVE_ACCEL: MOVEMENT_CONFIG.SLIDE_CARVE_ACCEL,
  SLIDE_TURN_RATE: MOVEMENT_CONFIG.SLIDE_TURN_RATE,
  SLIDE_THROTTLE_ACCEL: MOVEMENT_CONFIG.SLIDE_THROTTLE_ACCEL,
  SLIDE_BRAKE_ACCEL: MOVEMENT_CONFIG.SLIDE_BRAKE_ACCEL,
  SLIDE_SLOPE_ACCEL: MOVEMENT_CONFIG.SLIDE_SLOPE_ACCEL,
  SLIDE_SLOPE_FRICTION_SCALE: MOVEMENT_CONFIG.SLIDE_SLOPE_FRICTION_SCALE,
  SLIDE_HOP_BOOST: MOVEMENT_CONFIG.SLIDE_HOP_BOOST,
  SLIDE_FALL_CONVERSION: MOVEMENT_CONFIG.SLIDE_FALL_CONVERSION,
  SLIDE_FALL_CONVERSION_MAX: MOVEMENT_CONFIG.SLIDE_FALL_CONVERSION_MAX,
  SLIDE_EYE_OFFSET: MOVEMENT_CONFIG.SLIDE_EYE_OFFSET,
  MANTLE_FORWARD_DISTANCE: MOVEMENT_CONFIG.MANTLE_FORWARD_DISTANCE,
  MANTLE_UP_DISTANCE: MOVEMENT_CONFIG.MANTLE_UP_DISTANCE,
  MANTLE_MIN_LEDGE_HEIGHT: MOVEMENT_CONFIG.MANTLE_MIN_LEDGE_HEIGHT,
  MANTLE_MAX_LEDGE_HEIGHT: MOVEMENT_CONFIG.MANTLE_MAX_LEDGE_HEIGHT,
  MANTLE_DURATION: MOVEMENT_CONFIG.MANTLE_DURATION,
  MANTLE_FORWARD_PUSH: MOVEMENT_CONFIG.MANTLE_FORWARD_PUSH,
  GRAPPLE_ZIP_SPEED: MOVEMENT_CONFIG.GRAPPLE_ZIP_SPEED,
  GRAPPLE_ZIP_ARRIVE_DISTANCE: MOVEMENT_CONFIG.GRAPPLE_ZIP_ARRIVE_DISTANCE,
  GRAPPLE_ZIP_HEIGHT: MOVEMENT_CONFIG.GRAPPLE_ZIP_HEIGHT,
  GRAPPLE_ZIP_BRAKE_SPEED: MOVEMENT_CONFIG.GRAPPLE_ZIP_BRAKE_SPEED,
  GRAPPLE_ZIP_BRAKE_VY: MOVEMENT_CONFIG.GRAPPLE_ZIP_BRAKE_VY,
  GRAPPLE_ZIP_LAUNCH_SPEED: MOVEMENT_CONFIG.GRAPPLE_ZIP_LAUNCH_SPEED,
  GRAPPLE_ZIP_END_SPEED: MOVEMENT_CONFIG.GRAPPLE_ZIP_END_SPEED,
  GRAPPLE_ZIP_ARC: MOVEMENT_CONFIG.GRAPPLE_ZIP_ARC,
  GRAPPLE_ZIP_FOV: MOVEMENT_CONFIG.GRAPPLE_ZIP_FOV,
  GRAPPLE_ZIP_ROLL: MOVEMENT_CONFIG.GRAPPLE_ZIP_ROLL,
  CAMERA_HEIGHT_RESPONSE: MOVEMENT_CONFIG.CAMERA_HEIGHT_RESPONSE,
  CAMERA_FOV_RESPONSE: MOVEMENT_CONFIG.CAMERA_FOV_RESPONSE,
  CAMERA_SLIDE_ROLL: MOVEMENT_CONFIG.CAMERA_SLIDE_ROLL,
  BASE_FOV: (90 * Math.PI) / 180,
  MAX_FOV_WIDEN: (18 * Math.PI) / 180,
  FOV_SPEED_START: 8,
  FOV_SPEED_MAX: 32,
  GROUND_STICK: 1.2,
  PLAYER_RADIUS: MOVEMENT_CONFIG.PLAYER_RADIUS,
  PLAYER_HEIGHT: MOVEMENT_CONFIG.PLAYER_HEIGHT,
  EYE_OFFSET: 0.66,
  SENSITIVITY: 0.0022,
} as const;

const WALL_RUN = {
  RAY_DISTANCE: 0.75,
  VELOCITY: 10.5,
  INWARD_PULL: 1.5,
  HOLD_TIME: 0.6,
  MAX_TIME: 2.0,
  MAX_FALL_SPEED: 2.0,
  ENTRY_BOOST: 1.5,
  COOLDOWN: 0.25,
  JUMP_NORMAL_IMPULSE: 7.5,
  JUMP_TANGENT_IMPULSE: 9.5,
  JUMP_VERTICAL_IMPULSE: 8.2,
  ROLL: 0.21,
  ROLL_RESPONSE: 12,
} as const;

interface WallHit {
  normal: BABYLON.Vector3;
  tangent: BABYLON.Vector3;
  colliderHandle: number;
  sideSign: number;
  distance: number;
}

interface MantleState {
  active: boolean;
  elapsed: number;
  duration: number;
  start: BABYLON.Vector3;
  end: BABYLON.Vector3;
}

export class FirstPersonController {
  private camera: BABYLON.FreeCamera;
  private world: RAPIER.World;
  private input: InputManager;

  private body!: RAPIER.RigidBody;
  private collider!: RAPIER.Collider;
  private charController!: RAPIER.KinematicCharacterController;

  private yaw = 0;
  private pitch = 0;
  private vy = 0;
  private velX = 0;
  private velZ = 0;
  private grounded = false;
  private coyoteTimer = 0;
  /** Prevents snap-to-ground from cancelling the first frames of a jump. */
  private jumpGraceTimer = 0;
  private dashCharge = 1;
  private dashTimeRemaining = 0;
  private dashDirection = BABYLON.Vector3.Zero();
  private sensoryBoostActive = false;
  private sensoryBoostElapsed = 0;
  private sensoryBoostDuration = MOVEMENT.SENSORY_BOOST_DURATION;
  private sensoryBoostSideCooldown = 0;
  private timeScale = 1;
  private sensoryDashTime = 0;
  private sensoryDashVelocity = BABYLON.Vector3.Zero();
  private sliding = false;
  private slideElapsed = 0;
  private slideDirectionX = 0;
  private slideDirectionZ = 0;
  private slideCooldown = 0;
  private slideHeldConsumed = false;
  private slideRequestBuffered = false;
  private eyeOffset: number = MOVEMENT.EYE_OFFSET;
  private slideCameraRoll = 0;
  private cameraFov = MOVEMENT.BASE_FOV;

  private wallRunning = false;
  private wallRunTime = 0;
  private wallRunCooldown = 0;
  private wallNormal = BABYLON.Vector3.Zero();
  private wallTangent = BABYLON.Vector3.Zero();
  private wallColliderHandle = -1;
  private lastWallColliderHandle = -1;
  private wallSideSign = 0;
  private wallEntryRising = false;
  private cameraRoll = 0;

  private mantle: MantleState = {
    active: false,
    elapsed: 0,
    duration: MOVEMENT.MANTLE_DURATION,
    start: BABYLON.Vector3.Zero(),
    end: BABYLON.Vector3.Zero(),
  };

  /**
   * Active one-tap zip. While set, the player is pulled straight towards the
   * arrival position with gravity disabled.
   */
  private zipTarget: BABYLON.Vector3 | null = null;
  /** Straight line distance to the arrival point when the zip started. */
  private zipDistance = 0;
  /** Time since the zip started, used for the speed shaping. */
  private zipElapsed = 0;
  /** Decaying launch shake, 1 at the start of the zip. */
  private zipShake = 0;
  /** Camera lean into the zip direction. */
  private zipRoll = 0;

  /**
   * Called when a zip ends.
   * `arrived` means the player reached the target, `cancelled` means the zip
   * was interrupted (jump or dash).
   */
  public onZipFinished?: (reason: 'arrived' | 'cancelled') => void;

  public sensitivity = MOVEMENT.SENSITIVITY;

  constructor(
    camera: BABYLON.FreeCamera,
    world: RAPIER.World,
    input: InputManager,
    spawn: BABYLON.Vector3,
  ) {
    this.camera = camera;
    this.world = world;
    this.input = input;

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawn.x, spawn.y, spawn.z);
    this.body = world.createRigidBody(bodyDesc);

    const halfHeight = (MOVEMENT.PLAYER_HEIGHT - 2 * MOVEMENT.PLAYER_RADIUS) / 2;
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, MOVEMENT.PLAYER_RADIUS),
      this.body,
    );

    this.charController = world.createCharacterController(0.01);
    this.charController.setUp({ x: 0, y: 1, z: 0 });
    this.charController.enableAutostep(0.5, 0.35, true);
    this.charController.enableSnapToGround(0.5);
    this.charController.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    this.charController.setMinSlopeSlideAngle((35 * Math.PI) / 180);

    this.input.onMouseDelta = (dx, dy) => this.applyLookDelta(dx, dy);
  }

  /**
   * Start a one-tap zip towards `arrivalPos`.
   *
   * The player is moved straight along the line to the target at a fixed
   * speed with gravity disabled, and the zip ends automatically on arrival.
   */
  startZip(arrivalPos: BABYLON.Vector3) {
    if (this.zipTarget) this.cancelZip(false);

    this.zipTarget = arrivalPos.clone();
    this.zipElapsed = 0;
    this.zipShake = 1;
    this.zipRoll = 0;
    this.zipDistance = BABYLON.Vector3.Distance(this.position, this.zipTarget);
    this.velX = 0;
    this.velZ = 0;
    this.vy = 0;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpGraceTimer = 0;
    this.detachWallRun();
    this.endSlide(false);
    if (this.sensoryBoostActive) this.cancelSensoryBoost();
  }

  /** True while a zip is in progress. */
  get isZipping(): boolean {
    return this.zipTarget !== null;
  }

  /** Interrupt the zip. `notify` controls whether the callback fires. */
  private cancelZip(notify: boolean) {
    if (!this.zipTarget) return;
    this.zipTarget = null;
    this.zipRoll = 0;
    if (notify) this.onZipFinished?.('cancelled');
  }

  /**
   * Zip movement: the body is driven directly along the line to the arrival
   * point. No gravity, no pendulum, but the speed is shaped so the zip
   * kicks off hard, cruises and then boosts into the ring.
   */
  private applyZipMovement(dt: number, position: { x: number; y: number; z: number }) {
    const target = this.zipTarget;
    if (!target) return;

    this.zipElapsed += dt;

    const current = new BABYLON.Vector3(position.x, position.y, position.z);
    const delta = target.subtract(current);
    const distance = delta.length();

    if (distance <= MOVEMENT.GRAPPLE_ZIP_ARRIVE_DISTANCE) {
      this.finishZip();
      return;
    }

    // 0 at the start of the zip, 1 at the arrival point.
    const progress = BABYLON.Scalar.Clamp(
      1 - distance / Math.max(this.zipDistance, 0.001),
      0,
      1,
    );

    const direction = delta.scale(1 / distance);
    // A slight upward bow makes the zip read as a pulled line instead of a
    // flat rail, without turning it into a pendulum swing.
    direction.y += Math.sin(Math.PI * progress) * MOVEMENT.GRAPPLE_ZIP_ARC;
    direction.normalize();

    const speed = this.getZipSpeed(progress);
    this.velX = direction.x * speed;
    this.velZ = direction.z * speed;
    this.vy = direction.y * speed;
  }

  /**
   * The speed profile of the zip: a hard launch, a fast cruise and a final
   * boost into the ring. A constant speed feels like floating.
   */
  private getZipSpeed(progress: number): number {
    const keys: Array<[number, number]> = [
      [0, MOVEMENT.GRAPPLE_ZIP_LAUNCH_SPEED],
      [0.16, MOVEMENT.GRAPPLE_ZIP_SPEED],
      [0.5, MOVEMENT.GRAPPLE_ZIP_SPEED * 0.86],
      [0.78, MOVEMENT.GRAPPLE_ZIP_SPEED * 1.1],
      [1, MOVEMENT.GRAPPLE_ZIP_END_SPEED],
    ];

    for (let i = 0; i < keys.length - 1; i++) {
      const [fromP, fromSpeed] = keys[i];
      const [toP, toSpeed] = keys[i + 1];
      if (progress <= toP) {
        const t = (progress - fromP) / Math.max(toP - fromP, 0.0001);
        return BABYLON.Scalar.Lerp(fromSpeed, toSpeed, BABYLON.Scalar.Clamp(t, 0, 1));
      }
    }

    return MOVEMENT.GRAPPLE_ZIP_END_SPEED;
  }

  /** Damp the current velocity down to a gentle forward settle. */
  private brakeZip() {
    const horizontalSpeed = Math.hypot(this.velX, this.velZ);
    if (horizontalSpeed > MOVEMENT.GRAPPLE_ZIP_BRAKE_SPEED) {
      const scale = MOVEMENT.GRAPPLE_ZIP_BRAKE_SPEED / horizontalSpeed;
      this.velX *= scale;
      this.velZ *= scale;
    }
    this.vy = MOVEMENT.GRAPPLE_ZIP_BRAKE_VY;
  }

  /**
   * The player reached the target: detach the grapple and damp the velocity
   * down to a clean landing.
   */
  private finishZip() {
    if (!this.zipTarget) return;
    this.zipTarget = null;
    this.zipRoll = 0;
    this.brakeZip();
    this.onZipFinished?.('arrived');
  }

  private applyLookDelta(dx: number, dy: number) {
    this.yaw += dx * this.sensitivity;
    this.pitch += dy * this.sensitivity;
    const limit = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    this.applyCameraRotation();
  }

  update(dt: number) {
    const input = this.input.read();

    // Air Shift starts a slow-motion sensory boost instead of an air dash.
    // A live zip takes priority: Shift cancels the zip and dashes instead.
    if (
      !this.sensoryBoostActive
      && input.dashPressed
      && this.dashCharge >= 1
      && !this.grounded
      && !this.mantle.active
      && !this.sliding
      && !this.zipTarget
    ) {
      this.startSensoryBoost();
    }

    const scaledDt = dt * this.timeScale;
    this.wallRunCooldown = Math.max(0, this.wallRunCooldown - scaledDt);
    this.slideCooldown = Math.max(0, this.slideCooldown - scaledDt);
    this.dashTimeRemaining = Math.max(0, this.dashTimeRemaining - scaledDt);
    this.jumpGraceTimer = Math.max(0, this.jumpGraceTimer - scaledDt);
    this.sensoryBoostSideCooldown = Math.max(0, this.sensoryBoostSideCooldown - dt);
    this.zipShake = Math.max(0, this.zipShake - dt / 0.35);
    if (!this.sensoryBoostActive) {
      this.dashCharge = Math.min(
        1,
        this.dashCharge + scaledDt / MOVEMENT.DASH_RECHARGE_TIME,
      );
    }

    if (!input.slide) {
      this.slideHeldConsumed = false;
      this.slideRequestBuffered = false;
    } else if (input.slidePressed) {
      this.slideRequestBuffered = true;
    }

    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const cosPitch = Math.cos(this.pitch);
    const cameraForwardFlat = new BABYLON.Vector3(sinYaw, 0, cosYaw);
    const lookDirection = new BABYLON.Vector3(
      sinYaw * cosPitch,
      -Math.sin(this.pitch),
      cosYaw * cosPitch,
    ).normalize();
    const right = new BABYLON.Vector3(cosYaw, 0, -sinYaw);

    // Jump or dash immediately cancel a running zip.
    if (this.zipTarget) {
      if (input.dashPressed && this.dashCharge >= 1) {
        this.cancelZip(true);
        this.startDash(lookDirection);
      } else if (input.jumpPressed) {
        this.cancelZip(true);
        this.vy = MOVEMENT.JUMP_VELOCITY;
        this.grounded = false;
        this.jumpGraceTimer = MOVEMENT.JUMP_GROUND_GRACE;
      }
    }

    let forward = 0;
    let strafe = 0;
    if (input.forward) forward += 1;
    if (input.backward) forward -= 1;
    if (input.right) strafe += 1;
    if (input.left) strafe -= 1;

    let wishX = forward * sinYaw + strafe * cosYaw;
    let wishZ = forward * cosYaw - strafe * sinYaw;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 0) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    const position = this.body.translation();
    const wasGrounded = this.grounded;
    let slideJumpTriggered = false;

    // Landing cancels the boost without the exit dash.
    if (this.sensoryBoostActive && this.grounded) {
      this.cancelSensoryBoost();
    }

    if (this.sensoryBoostActive) {
      this.updateSensoryBoost(dt, input, right, wishX, wishZ);
    } else if (this.mantle.active) {
      this.updateMantle(scaledDt, position);
    } else if (this.zipTarget) {
      // The zip owns the movement completely: no gravity, no ground friction,
      // no air steering. The body is driven straight at the arrival point.
      this.applyZipMovement(scaledDt, position);
    } else {
      if (input.dashPressed && this.dashCharge >= 1) {
        this.startDash(lookDirection);
      }

      if (this.dashTimeRemaining > 0) {
        this.applyDashVelocity();
      }

      const canUseCoyoteJump = this.coyoteTimer > 0;

      if (this.grounded) {
        this.coyoteTimer = MOVEMENT.COYOTE_TIME;
        this.detachWallRun();
      } else {
        this.coyoteTimer = Math.max(0, this.coyoteTimer - scaledDt);
        if (this.sliding) this.endSlide(true);
      }

      const canJump = (this.grounded || canUseCoyoteJump) && this.dashTimeRemaining <= 0 && !this.mantle.active;
      if (input.jumpPressed && canJump) {
        if (this.sliding) {
          this.endSlide(true);
          const slideSpeed = Math.hypot(this.velX, this.velZ);
          const comboSpeed = Math.max(slideSpeed, this.horizontalSpeed);
          const dirX = this.slideDirectionX || cameraForwardFlat.x;
          const dirZ = this.slideDirectionZ || cameraForwardFlat.z;
          this.velX = dirX * (comboSpeed + MOVEMENT.SLIDE_HOP_BOOST);
          this.velZ = dirZ * (comboSpeed + MOVEMENT.SLIDE_HOP_BOOST);
        }
        this.vy = MOVEMENT.JUMP_VELOCITY;
        this.coyoteTimer = 0;
        this.jumpGraceTimer = MOVEMENT.JUMP_GROUND_GRACE;
        this.grounded = false;
        slideJumpTriggered = true;
      }

      if (this.grounded) {
        if (!input.slide && this.sliding) {
          this.endSlide(false);
        }

        if (
          !slideJumpTriggered
          && this.slideRequestBuffered
          && !this.sliding
          && !this.slideHeldConsumed
          && this.slideCooldown <= 0
          && Math.hypot(this.velX, this.velZ) >= MOVEMENT.SLIDE_MIN_SPEED
        ) {
          const direction = this.getSlideEntryDirection(wishX, wishZ, cameraForwardFlat);
          this.startSlide(direction.x, direction.z, 0);
        }

        if (this.sliding) {
          this.applySlideMovement(forward, strafe, right, scaledDt);
        } else if (!slideJumpTriggered && this.dashTimeRemaining <= 0) {
          this.applyGroundMovement(wishX, wishZ, false, scaledDt);
        }
        // While dashing, keep the vertical dash velocity (ground stick would
        // cancel upward or downward look-driven dashes).
      } else {
        if (this.dashTimeRemaining <= 0) {
          this.applyAirMovement(wishX, wishZ, scaledDt);

          if (this.wallRunning) {
            this.updateWallRun(input.jumpPressed, scaledDt);
          } else if (input.forward && this.wallRunCooldown <= 0) {
            const wallHit = this.detectWall(position, cameraForwardFlat, right);
            if (wallHit) this.attachWallRun(wallHit, this.vy > 0);
          }

          if (!this.wallRunning && this.tryMantle(position, cameraForwardFlat, input.forward || input.jump)) {
            // Mantle started; skip normal integration movement this frame after setup.
          }
        }
      }

      if (this.dashTimeRemaining > 0) {
        // Keep dash velocity authoritative during the dash window.
        this.detachWallRun();
      }
    }

    // Sensory side/exit dashes are applied in real time so they still feel
    // responsive while the rest of the movement is slowed down.
    let extraMoveX = 0;
    let extraMoveY = 0;
    let extraMoveZ = 0;
    if (this.sensoryDashTime > 0) {
      extraMoveX = this.sensoryDashVelocity.x * dt;
      extraMoveY = this.sensoryDashVelocity.y * dt;
      extraMoveZ = this.sensoryDashVelocity.z * dt;
      this.sensoryDashTime = Math.max(0, this.sensoryDashTime - dt);
    }

    const fallSpeedBeforeLanding = !wasGrounded ? Math.max(0, -this.vy) : 0;
    const movement = this.mantle.active
      ? { x: 0, y: 0, z: 0 }
      : {
        x: this.velX * scaledDt + extraMoveX,
        y: this.vy * scaledDt + extraMoveY,
        z: this.velZ * scaledDt + extraMoveZ,
      };

    if (!this.mantle.active) {
      // Snap-to-ground keeps the controller glued to slopes, but it would
      // also swallow the first frames of a jump as a tiny 0.01m hop.
      // Disable it while rising and during the short post-jump grace window.
      // A live zip also disables it so the tether can pull the player up.
      if (this.vy > 0 || this.jumpGraceTimer > 0 || this.zipTarget) {
        this.charController.disableSnapToGround();
      } else {
        this.charController.enableSnapToGround(0.5);
      }

      this.charController.computeColliderMovement(this.collider, movement);
      const corrected = this.charController.computedMovement();

      // Arrival: once the player is within range of the arrival point the
      // grapple pops off and the velocity is damped to a clean landing.
      if (this.zipTarget) {
        const target = this.zipTarget;
        const next = new BABYLON.Vector3(
          position.x + corrected.x,
          position.y + corrected.y,
          position.z + corrected.z,
        );
        if (BABYLON.Vector3.Distance(next, target) <= MOVEMENT.GRAPPLE_ZIP_ARRIVE_DISTANCE) {
          // Land exactly on the arrival point instead of overshooting it.
          corrected.x = target.x - position.x;
          corrected.y = target.y - position.y;
          corrected.z = target.z - position.z;
          this.finishZip();
        } else {
          // Blocked by geometry: end the zip early so the player can never
          // get stuck against a wall or a ledge.
          const intended = Math.hypot(movement.x, movement.y, movement.z);
          const actual = Math.hypot(corrected.x, corrected.y, corrected.z);
          if (intended > 0.05 && actual < intended * 0.25) {
            this.brakeZip();
            this.cancelZip(true);
          }
        }
      }

      const blockedBelow = movement.y < 0 && corrected.y > movement.y * 0.5;
      // A real landing ends the grace window immediately.
      if (this.jumpGraceTimer > 0 && blockedBelow && this.vy <= 0) {
        this.jumpGraceTimer = 0;
      }
      const groundedByController = blockedBelow || this.charController.computedGrounded();
      this.grounded = this.jumpGraceTimer > 0 ? false : groundedByController;
      if (blockedBelow) {
        this.vy = 0;
      } else if (movement.y < 0) {
        this.vy = corrected.y / Math.max(scaledDt, 0.0001);
      }

      const justLanded = !wasGrounded && this.grounded;
      if (justLanded) {
        this.coyoteTimer = MOVEMENT.COYOTE_TIME;
        if (this.sensoryBoostActive) this.cancelSensoryBoost();
      }
      if (
        justLanded
        && input.slide
        && !input.jumpPressed
        && !this.sliding
        && !this.slideHeldConsumed
      ) {
        const direction = this.getSlideEntryDirection(wishX, wishZ, cameraForwardFlat);
        this.startSlide(direction.x, direction.z, fallSpeedBeforeLanding);
      }

      this.body.setNextKinematicTranslation({
        x: position.x + corrected.x,
        y: position.y + corrected.y,
        z: position.z + corrected.z,
      });

      const wallRollTarget = this.wallRunning ? -this.wallSideSign * WALL_RUN.ROLL : 0;
      const wallRollBlend = 1 - Math.exp(-WALL_RUN.ROLL_RESPONSE * dt);
      this.cameraRoll += (wallRollTarget - this.cameraRoll) * wallRollBlend;

      this.updateCameraEffects(dt, right);
      this.syncCamera(position.x + corrected.x, position.y + corrected.y, position.z + corrected.z);
    } else {
      const t = this.body.translation();
      this.updateCameraEffects(dt, right);
      this.syncCamera(t.x, t.y, t.z);
    }
  }

  private getLookDirection(): BABYLON.Vector3 {
    const cosPitch = Math.cos(this.pitch);
    return new BABYLON.Vector3(
      Math.sin(this.yaw) * cosPitch,
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    ).normalize();
  }

  private startDash(direction: BABYLON.Vector3) {
    this.endSlide(false);
    this.detachWallRun();
    this.dashDirection.copyFrom(direction.normalize());
    this.dashTimeRemaining = MOVEMENT.DASH_DURATION;
    this.dashCharge = 0;
    this.coyoteTimer = 0;
    this.applyDashVelocity();
  }

  private applyDashVelocity() {
    // The horizontal part of a dash always keeps its full speed: looking up or
    // down only changes the vertical component, it never shortens the burst.
    const flat = new BABYLON.Vector3(this.dashDirection.x, 0, this.dashDirection.z);
    if (flat.lengthSquared() < 0.0001) flat.copyFrom(BABYLON.Axis.Z);
    flat.normalize();

    this.velX = flat.x * MOVEMENT.DASH_SPEED;
    this.velZ = flat.z * MOVEMENT.DASH_SPEED;
    this.vy = this.getDashVerticalVelocity(this.dashDirection.y);
  }

  /**
   * Vertical dash component driven by pitch: look up to rise, down to dive.
   *
   * The dead zone keeps a roughly horizontal view (or only a slight tilt)
   * from launching the player into the floor or the ceiling. Only a clear
   * look up/down past the dead zone adds vertical speed.
   */
  private getDashVerticalVelocity(lookY: number): number {
    const deadZone = MOVEMENT.DASH_VERTICAL_DEAD_ZONE;
    let y = lookY;
    if (y > deadZone) {
      y = (y - deadZone) / (1 - deadZone);
    } else if (y < -deadZone) {
      y = (y + deadZone) / (1 - deadZone);
    } else {
      y = 0;
    }

    const vertical = y * MOVEMENT.DASH_SPEED;
    return vertical >= 0
      ? Math.min(vertical * MOVEMENT.DASH_VERTICAL_INFLUENCE, MOVEMENT.DASH_VERTICAL_UP_MAX)
      : Math.max(vertical * MOVEMENT.DASH_VERTICAL_DOWN_INFLUENCE, -MOVEMENT.DASH_VERTICAL_DOWN_MAX);
  }

  /**
   * Enter the air-only sensory boost. World/player physics slow to a crawl,
   * the HUD meter drains over the boost window, A/D nudge sideways, and the
   * boost ends with a short forward dash.
   */
  private startSensoryBoost() {
    this.sensoryBoostActive = true;
    this.sensoryBoostElapsed = 0;
    this.sensoryBoostSideCooldown = 0;
    this.dashCharge = 1;
    this.timeScale = 1;
    this.sensoryDashTime = 0;
    this.detachWallRun();
    this.endSlide(false);
  }

  private updateSensoryBoost(
    dt: number,
    input: ReturnType<InputManager['read']>,
    right: BABYLON.Vector3,
    wishX: number,
    wishZ: number,
  ) {
    this.sensoryBoostElapsed += dt;
    const progress = Math.min(1, this.sensoryBoostElapsed / this.sensoryBoostDuration);
    // The dash meter doubles as the boost timer and drains right to left.
    this.dashCharge = 1 - progress;

    // Ease into slow motion over the first quarter second.
    const ramp = Math.min(1, this.sensoryBoostElapsed / 0.25);
    const eased = ramp * ramp * (3 - 2 * ramp);
    this.timeScale = BABYLON.Scalar.Lerp(
      1,
      MOVEMENT.SENSORY_BOOST_TIME_SCALE,
      eased,
    );

    this.applyAirMovement(wishX, wishZ, dt * this.timeScale);

    if (input.leftPressed && this.sensoryBoostSideCooldown <= 0) {
      this.startSensorySideDash(-1, right);
    } else if (input.rightPressed && this.sensoryBoostSideCooldown <= 0) {
      this.startSensorySideDash(1, right);
    }

    if (!input.dashHeld || progress >= 1) {
      this.finishSensoryBoost();
    }
  }

  private startSensorySideDash(sign: number, right: BABYLON.Vector3) {
    const speed = MOVEMENT.SENSORY_BOOST_SIDE_DASH_SPEED;
    this.sensoryDashVelocity.set(right.x * sign * speed, 0, right.z * sign * speed);
    this.sensoryDashTime = MOVEMENT.SENSORY_BOOST_SIDE_DASH_DURATION;
    this.sensoryBoostSideCooldown = MOVEMENT.SENSORY_BOOST_SIDE_DASH_COOLDOWN;

    // A smaller velocity nudge carries through the slow motion after the burst.
    this.velX += right.x * sign * speed * 0.4;
    this.velZ += right.z * sign * speed * 0.4;
  }

  /** End the boost early or on timeout: restore time and dash forward. */
  private finishSensoryBoost() {
    if (!this.sensoryBoostActive) return;

    this.sensoryBoostActive = false;
    this.sensoryBoostElapsed = 0;
    this.dashCharge = 0;
    this.timeScale = 1;

    const look = this.getLookDirection();
    const forward = new BABYLON.Vector3(look.x, 0, look.z);
    if (forward.lengthSquared() < 0.0001) forward.copyFrom(BABYLON.Axis.Z);
    forward.normalize();

    const speed = MOVEMENT.SENSORY_BOOST_FORWARD_DASH_SPEED;
    const vertical = this.getDashVerticalVelocity(look.y);
    this.velX = forward.x * speed;
    this.velZ = forward.z * speed;
    this.vy = vertical;
    this.sensoryDashVelocity.set(forward.x * speed, vertical, forward.z * speed);
    this.sensoryDashTime = MOVEMENT.SENSORY_BOOST_FORWARD_DASH_DURATION;
  }

  /** Landed mid-boost: restore time without the exit dash. */
  private cancelSensoryBoost() {
    if (!this.sensoryBoostActive) return;

    this.sensoryBoostActive = false;
    this.sensoryBoostElapsed = 0;
    this.dashCharge = 0;
    this.timeScale = 1;
    this.sensoryDashTime = 0;
  }

  private tryMantle(
    position: { x: number; y: number; z: number },
    forward: BABYLON.Vector3,
    wantsMantle: boolean,
  ): boolean {
    if (!wantsMantle || this.mantle.active || this.wallRunning || this.sliding) return false;
    if (this.vy > 6) return false;

    const dir = new BABYLON.Vector3(forward.x, 0, forward.z);
    if (dir.lengthSquared() < 0.0001) return false;
    dir.normalize();

    // position.y is the body/capsule center. Probes are tuned around that:
    // eye/head-level wall check, outstretched-hands open-air check, and a
    // forgiving chest-level grab check so ledges can be caught from lower down
    // without snapping onto waist-high obstacles.
    const standOffset = MOVEMENT.PLAYER_HEIGHT / 2;
    const eyeY = position.y + 0.7;
    const upperChestY = position.y + 0.35;
    const lowerChestY = position.y + 0.05;
    const ceilingY = position.y + 1.2;
    const rayDir = { x: dir.x, y: 0, z: dir.z };

    const castForward = (y: number, distance: number) =>
      this.world.castRay(
        new RAPIER.Ray({ x: position.x, y, z: position.z }, rayDir),
        distance,
        true,
        undefined,
        undefined,
        this.collider,
        this.body,
      );

    const wallHit = castForward(eyeY, MOVEMENT.MANTLE_FORWARD_DISTANCE)
      ?? castForward(upperChestY, MOVEMENT.MANTLE_FORWARD_DISTANCE)
      ?? castForward(lowerChestY, MOVEMENT.MANTLE_FORWARD_DISTANCE);
    if (!wallHit) return false;

    const clearanceHit = castForward(ceilingY, MOVEMENT.MANTLE_FORWARD_DISTANCE + 0.15);
    if (clearanceHit) return false;

    const surfaceOrigin = {
      x: position.x + dir.x * (wallHit.timeOfImpact + MOVEMENT.PLAYER_RADIUS + 0.2),
      y: position.y + MOVEMENT.MANTLE_MAX_LEDGE_HEIGHT + 0.9,
      z: position.z + dir.z * (wallHit.timeOfImpact + MOVEMENT.PLAYER_RADIUS + 0.2),
    };
    const surfaceHit = this.world.castRayAndGetNormal(
      new RAPIER.Ray(surfaceOrigin, { x: 0, y: -1, z: 0 }),
      MOVEMENT.MANTLE_UP_DISTANCE + 0.8,
      true,
      undefined,
      undefined,
      this.collider,
      this.body,
    );
    if (!surfaceHit || surfaceHit.normal.y < 0.72) return false;

    const ledgeSurfaceY = surfaceOrigin.y - surfaceHit.timeOfImpact;
    const targetBodyY = ledgeSurfaceY + standOffset;
    const climbHeight = targetBodyY - position.y;
    if (climbHeight < MOVEMENT.MANTLE_MIN_LEDGE_HEIGHT || climbHeight > MOVEMENT.MANTLE_MAX_LEDGE_HEIGHT + 0.25) {
      return false;
    }

    this.mantle.active = true;
    this.mantle.elapsed = 0;
    this.mantle.duration = MOVEMENT.MANTLE_DURATION;
    this.mantle.start.set(position.x, position.y, position.z);
    this.mantle.end.set(
      position.x + dir.x * MOVEMENT.MANTLE_FORWARD_PUSH,
      targetBodyY,
      position.z + dir.z * MOVEMENT.MANTLE_FORWARD_PUSH,
    );
    this.velX = 0;
    this.velZ = 0;
    this.vy = 0;
    this.detachWallRun();
    this.endSlide(false);
    return true;
  }

  private updateMantle(dt: number, _position: { x: number; y: number; z: number }) {
    this.mantle.elapsed += dt;
    const t = Math.min(1, this.mantle.elapsed / this.mantle.duration);
    const smooth = t * t * (3 - 2 * t);
    const x = BABYLON.Scalar.Lerp(this.mantle.start.x, this.mantle.end.x, smooth);
    const y = BABYLON.Scalar.Lerp(this.mantle.start.y, this.mantle.end.y, smooth);
    const z = BABYLON.Scalar.Lerp(this.mantle.start.z, this.mantle.end.z, smooth);

    this.body.setNextKinematicTranslation({ x, y, z });
    this.velX = 0;
    this.velZ = 0;
    this.vy = 0;
    this.grounded = false;

    if (t >= 1) {
      this.mantle.active = false;
      this.body.setNextKinematicTranslation({
        x: this.mantle.end.x,
        y: this.mantle.end.y,
        z: this.mantle.end.z,
      });
      this.grounded = true;
      this.coyoteTimer = MOVEMENT.COYOTE_TIME;
    }
  }

  private applyGroundMovement(wishX: number, wishZ: number, jumpPressed: boolean, dt: number) {
    const hasMovementInput = wishX !== 0 || wishZ !== 0;
    const speed = Math.hypot(this.velX, this.velZ);

    if ((!hasMovementInput || speed > MOVEMENT.RUN_SPEED) && speed > 0.001) {
      const drop = Math.max(speed, MOVEMENT.STOP_SPEED) * MOVEMENT.FRICTION * dt;
      const scale = Math.max(0, speed - drop) / speed;
      this.velX *= scale;
      this.velZ *= scale;
    }

    if (hasMovementInput) {
      const currentSpeed = this.velX * wishX + this.velZ * wishZ;
      const remaining = MOVEMENT.RUN_SPEED - currentSpeed;
      if (remaining > 0) {
        const acceleration = Math.min(MOVEMENT.GROUND_ACCEL * MOVEMENT.RUN_SPEED * dt, remaining);
        this.velX += wishX * acceleration;
        this.velZ += wishZ * acceleration;
      }
    }

    if (jumpPressed && this.coyoteTimer > 0) {
      this.vy = MOVEMENT.JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.grounded = false;
    } else {
      this.vy = -MOVEMENT.GROUND_STICK;
    }
  }

  private getSlideEntryDirection(
    wishX: number,
    wishZ: number,
    cameraForward: BABYLON.Vector3,
  ): BABYLON.Vector3 {
    const speed = Math.hypot(this.velX, this.velZ);
    if (speed > 1) {
      return new BABYLON.Vector3(this.velX / speed, 0, this.velZ / speed);
    }

    if (wishX !== 0 || wishZ !== 0) {
      return new BABYLON.Vector3(wishX, 0, wishZ);
    }

    return cameraForward.clone();
  }

  private startSlide(directionX: number, directionZ: number, fallSpeed: number) {
    const directionLength = Math.hypot(directionX, directionZ);
    if (directionLength < 0.001) return;

    this.slideDirectionX = directionX / directionLength;
    this.slideDirectionZ = directionZ / directionLength;
    this.sliding = true;
    this.slideElapsed = 0;
    this.slideCooldown = MOVEMENT.SLIDE_COOLDOWN;
    this.slideHeldConsumed = true;
    this.slideRequestBuffered = false;

    const fallBoost = Math.min(
      fallSpeed * MOVEMENT.SLIDE_FALL_CONVERSION,
      MOVEMENT.SLIDE_FALL_CONVERSION_MAX,
    );
    const currentSpeed = Math.hypot(this.velX, this.velZ);
    const targetSpeed = Math.max(currentSpeed, MOVEMENT.SLIDE_BURST_SPEED + fallBoost);
    this.velX = this.slideDirectionX * targetSpeed;
    this.velZ = this.slideDirectionZ * targetSpeed;
  }

  private endSlide(allowLandingBuffer: boolean) {
    if (!this.sliding) return;

    this.sliding = false;
    if (allowLandingBuffer) {
      this.slideHeldConsumed = false;
    }
  }

  private applySlideMovement(
    forward: number,
    strafe: number,
    cameraRight: BABYLON.Vector3,
    dt: number,
  ) {
    this.slideElapsed += dt;

    if (strafe !== 0) {
      const desiredX = cameraRight.x * strafe;
      const desiredZ = cameraRight.z * strafe;
      const angle = Math.atan2(
        this.slideDirectionZ * desiredX - this.slideDirectionX * desiredZ,
        this.slideDirectionX * desiredX + this.slideDirectionZ * desiredZ,
      );
      const maxTurn = MOVEMENT.SLIDE_TURN_RATE * dt;
      const turn = Math.max(-maxTurn, Math.min(maxTurn, angle));
      const cosine = Math.cos(turn);
      const sine = Math.sin(turn);

      const directionX = this.slideDirectionX * cosine - this.slideDirectionZ * sine;
      const directionZ = this.slideDirectionX * sine + this.slideDirectionZ * cosine;
      this.slideDirectionX = directionX;
      this.slideDirectionZ = directionZ;

      const velocityX = this.velX;
      const velocityZ = this.velZ;
      this.velX = velocityX * cosine - velocityZ * sine;
      this.velZ = velocityX * sine + velocityZ * cosine;
    }

    const groundNormal = this.getGroundNormal();
    const slopeAmount = Math.max(0, Math.min(1, (1 - groundNormal.y) / 0.7));
    const downhillAmount = this.getDownhillAmount(groundNormal);
    const speedCap = MOVEMENT.SLIDE_MAX_SPEED
      + (MOVEMENT.SLIDE_SLOPE_MAX_SPEED - MOVEMENT.SLIDE_MAX_SPEED) * slopeAmount;

    // Project gravity onto the ground plane and boost downhill slides.
    const gravity = new BABYLON.Vector3(0, -MOVEMENT.GRAVITY, 0);
    const gravityNormalComponent = BABYLON.Vector3.Dot(gravity, groundNormal);
    const slopeAcceleration = gravity.subtract(groundNormal.scale(gravityNormalComponent));
    const slopeBoost = 1 + downhillAmount * MOVEMENT.SLIDE_SLOPE_ACCEL;
    this.velX += slopeAcceleration.x * slopeBoost * dt;
    this.velZ += slopeAcceleration.z * slopeBoost * dt;

    const rampProgress = Math.max(0, Math.min(
      1,
      (this.slideElapsed - 0.25) / MOVEMENT.SLIDE_FRICTION_RAMP,
    ));
    const smoothRamp = rampProgress * rampProgress * (3 - 2 * rampProgress);
    let friction = MOVEMENT.SLIDE_FLAT_FRICTION
      + (MOVEMENT.SLIDE_RAMP_FRICTION - MOVEMENT.SLIDE_FLAT_FRICTION) * smoothRamp;
    // On downhill slopes, remove most friction so slope accel adds speed.
    friction *= 1 - downhillAmount * (1 - MOVEMENT.SLIDE_SLOPE_FRICTION_SCALE);

    const speed = Math.hypot(this.velX, this.velZ);
    if (speed > 0.001 && friction > 0) {
      const drop = speed * friction * dt;
      const scale = Math.max(0, speed - drop) / speed;
      this.velX *= scale;
      this.velZ *= scale;
    }

    if (strafe !== 0) {
      const carveX = cameraRight.x * strafe;
      const carveZ = cameraRight.z * strafe;
      this.velX += carveX * MOVEMENT.SLIDE_CARVE_ACCEL * dt;
      this.velZ += carveZ * MOVEMENT.SLIDE_CARVE_ACCEL * dt;
    }

    if (forward > 0) {
      this.velX += this.slideDirectionX * MOVEMENT.SLIDE_THROTTLE_ACCEL * dt;
      this.velZ += this.slideDirectionZ * MOVEMENT.SLIDE_THROTTLE_ACCEL * dt;
    } else if (forward < 0) {
      const forwardSpeed = Math.max(
        0,
        this.velX * this.slideDirectionX + this.velZ * this.slideDirectionZ,
      );
      const braking = Math.min(MOVEMENT.SLIDE_BRAKE_ACCEL * dt, forwardSpeed);
      this.velX -= this.slideDirectionX * braking;
      this.velZ -= this.slideDirectionZ * braking;
    }

    const finalSpeed = Math.hypot(this.velX, this.velZ);
    if (finalSpeed > speedCap) {
      const scale = speedCap / finalSpeed;
      this.velX *= scale;
      this.velZ *= scale;
    }

    if (Math.hypot(this.velX, this.velZ) < MOVEMENT.SLIDE_STOP_SPEED) {
      this.endSlide(false);
    }
  }

  private getDownhillAmount(groundNormal: BABYLON.Vector3): number {
    const gravity = new BABYLON.Vector3(0, -1, 0);
    const gravityNormalComponent = BABYLON.Vector3.Dot(gravity, groundNormal);
    const slopeDir = gravity.subtract(groundNormal.scale(gravityNormalComponent));
    const slopeLen = slopeDir.length();
    if (slopeLen < 0.0001) return 0;
    slopeDir.scaleInPlace(1 / slopeLen);
    const vel = new BABYLON.Vector3(this.velX, 0, this.velZ);
    const velLen = vel.length();
    if (velLen < 0.0001) return 0;
    vel.scaleInPlace(1 / velLen);
    return Math.max(0, BABYLON.Vector3.Dot(vel, slopeDir));
  }

  private getGroundNormal(): BABYLON.Vector3 {
    const position = this.body.translation();
    const ray = new RAPIER.Ray(
      { x: position.x, y: position.y + 0.15, z: position.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = this.world.castRayAndGetNormal(
      ray,
      1.25,
      true,
      undefined,
      undefined,
      this.collider,
      this.body,
    );

    if (!hit || hit.normal.y < 0.2) return BABYLON.Axis.Y;
    return new BABYLON.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
  }

  private applyAirMovement(wishX: number, wishZ: number, dt: number) {
    if (wishX !== 0 || wishZ !== 0) {
      const speed = Math.hypot(this.velX, this.velZ);
      if (speed > 0.5) {
        const currentAngle = Math.atan2(this.velZ, this.velX);
        const targetAngle = Math.atan2(wishZ, wishX);
        const angleDifference = Math.atan2(
          Math.sin(targetAngle - currentAngle),
          Math.cos(targetAngle - currentAngle),
        );
        const maxTurn = MOVEMENT.AIR_TURN_RATE * dt;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDifference));
        const cosine = Math.cos(turn);
        const sine = Math.sin(turn);
        const velocityX = this.velX;
        const velocityZ = this.velZ;

        this.velX = velocityX * cosine - velocityZ * sine;
        this.velZ = velocityX * sine + velocityZ * cosine;
      }

      const currentSpeed = this.velX * wishX + this.velZ * wishZ;
      const addedSpeed = Math.min(
        MOVEMENT.AIR_ACCEL * MOVEMENT.AIR_SPEED_CAP * dt,
        MOVEMENT.AIR_SPEED_CAP - currentSpeed,
      );

      if (addedSpeed > 0) {
        this.velX += wishX * addedSpeed;
        this.velZ += wishZ * addedSpeed;
      }
    }

    const gravityMultiplier = this.vy < 0 ? MOVEMENT.FALL_GRAVITY_MULTIPLIER : 1;
    this.vy -= MOVEMENT.GRAVITY * gravityMultiplier * dt;
  }

  private detectWall(
    position: { x: number; y: number; z: number },
    cameraForward: BABYLON.Vector3,
    right: BABYLON.Vector3,
  ): WallHit | null {
    const origin = { x: position.x, y: position.y, z: position.z };
    const candidates: WallHit[] = [];

    const castSide = (direction: BABYLON.Vector3) => {
      const ray = new RAPIER.Ray(
        origin,
        { x: direction.x, y: 0, z: direction.z },
      );
      const hit = this.world.castRayAndGetNormal(
        ray,
        WALL_RUN.RAY_DISTANCE,
        true,
        undefined,
        undefined,
        this.collider,
        this.body,
      );

      if (!hit || Math.abs(hit.normal.y) >= 0.2) return;

      const colliderHandle = hit.collider.handle;
      if (colliderHandle === this.lastWallColliderHandle && this.wallRunCooldown > 0) return;

      const normal = new BABYLON.Vector3(hit.normal.x, 0, hit.normal.z).normalize();
      const tangent = BABYLON.Vector3.Cross(normal, BABYLON.Axis.Y).normalize();
      if (BABYLON.Vector3.Dot(tangent, cameraForward) < 0) tangent.scaleInPlace(-1);

      const sideSign = BABYLON.Vector3.Dot(normal, right);
      const flatVelocity = new BABYLON.Vector3(this.velX, 0, this.velZ);
      const speed = flatVelocity.length();
      const approachDir = speed > 0.5
        ? flatVelocity.scale(1 / speed)
        : cameraForward.clone();
      const tangentAlignment = Math.abs(BABYLON.Vector3.Dot(approachDir, tangent));
      const intoWall = -BABYLON.Vector3.Dot(approachDir, normal);
      // Require an angled approach; running straight into a wall should not start a wall run.
      if (tangentAlignment < 0.35 || intoWall > 0.6) return;

      candidates.push({
        normal,
        tangent,
        colliderHandle,
        sideSign,
        distance: hit.timeOfImpact,
      });
    };

    castSide(right.scale(-1));
    castSide(right);

    if (candidates.length === 0) return null;

    return candidates.reduce((closest, candidate) =>
      candidate.distance < closest.distance ? candidate : closest,
    );
  }

  private attachWallRun(hit: WallHit, enteredWhileRising: boolean) {
    this.wallRunning = true;
    this.wallRunTime = 0;
    this.wallNormal.copyFrom(hit.normal);
    this.wallTangent.copyFrom(hit.tangent);
    this.wallColliderHandle = hit.colliderHandle;
    this.wallSideSign = hit.sideSign < 0 ? -1 : 1;
    this.wallEntryRising = enteredWhileRising;

    this.vy = enteredWhileRising ? WALL_RUN.ENTRY_BOOST : 0;
    this.velX = this.wallTangent.x * WALL_RUN.VELOCITY - this.wallNormal.x * WALL_RUN.INWARD_PULL;
    this.velZ = this.wallTangent.z * WALL_RUN.VELOCITY - this.wallNormal.z * WALL_RUN.INWARD_PULL;
  }

  private updateWallRun(jumpPressed: boolean, dt: number) {
    this.wallRunTime += dt;
    if (this.wallRunTime >= WALL_RUN.MAX_TIME) {
      this.detachWallRun();
      return;
    }

    if (jumpPressed) {
      this.velX = this.wallTangent.x * WALL_RUN.JUMP_TANGENT_IMPULSE
        + this.wallNormal.x * WALL_RUN.JUMP_NORMAL_IMPULSE;
      this.velZ = this.wallTangent.z * WALL_RUN.JUMP_TANGENT_IMPULSE
        + this.wallNormal.z * WALL_RUN.JUMP_NORMAL_IMPULSE;
      this.vy = WALL_RUN.JUMP_VERTICAL_IMPULSE;
      this.jumpGraceTimer = MOVEMENT.JUMP_GROUND_GRACE;
      this.lastWallColliderHandle = this.wallColliderHandle;
      this.wallRunCooldown = WALL_RUN.COOLDOWN;
      this.detachWallRun();
      return;
    }

    const position = this.body.translation();
    if (!this.hasWallContact(position)) {
      this.detachWallRun();
      return;
    }

    if (this.wallRunTime <= WALL_RUN.HOLD_TIME) {
      this.vy = this.wallEntryRising ? WALL_RUN.ENTRY_BOOST : 0;
    } else {
      this.vy = Math.max(this.vy - MOVEMENT.GRAVITY * dt, -WALL_RUN.MAX_FALL_SPEED);
    }

    this.velX = this.wallTangent.x * WALL_RUN.VELOCITY - this.wallNormal.x * WALL_RUN.INWARD_PULL;
    this.velZ = this.wallTangent.z * WALL_RUN.VELOCITY - this.wallNormal.z * WALL_RUN.INWARD_PULL;
  }

  private hasWallContact(position: { x: number; y: number; z: number }): boolean {
    // wallNormal points outward from the wall toward the player.
    const towardWall = new BABYLON.Vector3(-this.wallNormal.x, 0, -this.wallNormal.z);
    const ray = new RAPIER.Ray(
      { x: position.x, y: position.y, z: position.z },
      { x: towardWall.x, y: 0, z: towardWall.z },
    );
    const hit = this.world.castRayAndGetNormal(
      ray,
      WALL_RUN.RAY_DISTANCE + 0.15,
      true,
      undefined,
      undefined,
      this.collider,
      this.body,
    );
    if (!hit) return false;
    if (Math.abs(hit.normal.y) >= 0.25) return false;
    return hit.collider.handle === this.wallColliderHandle;
  }

  private detachWallRun() {
    this.wallRunning = false;
    this.wallRunTime = 0;
    this.wallColliderHandle = -1;
    this.wallEntryRising = false;
  }

  private updateCameraEffects(dt: number, right: BABYLON.Vector3) {
    const targetEyeOffset = this.sliding ? MOVEMENT.SLIDE_EYE_OFFSET : MOVEMENT.EYE_OFFSET;
    const heightBlend = 1 - Math.exp(-MOVEMENT.CAMERA_HEIGHT_RESPONSE * dt);
    this.eyeOffset += (targetEyeOffset - this.eyeOffset) * heightBlend;

    const speed = this.speed3D;
    const fovProgress = Math.max(0, Math.min(
      1,
      (speed - MOVEMENT.FOV_SPEED_START) / (MOVEMENT.FOV_SPEED_MAX - MOVEMENT.FOV_SPEED_START),
    ));
    const boostZoom = this.sensoryBoostActive ? -0.05 : 0;
    // The zip gets its own FOV punch so the pull reads as a speed effect
    // instead of a constant glide.
    const zipFov = this.zipTarget
      ? MOVEMENT.GRAPPLE_ZIP_FOV * Math.sin(Math.PI * this.getZipProgress())
      : 0;
    const targetFov = MOVEMENT.BASE_FOV
      + MOVEMENT.MAX_FOV_WIDEN * fovProgress
      + boostZoom
      + zipFov;
    const fovBlend = 1 - Math.exp(-MOVEMENT.CAMERA_FOV_RESPONSE * dt);
    this.cameraFov += (targetFov - this.cameraFov) * fovBlend;
    this.camera.fov = this.cameraFov;

    const lateralSpeed = this.horizontalSpeed > 0.001
      ? BABYLON.Vector3.Dot(new BABYLON.Vector3(this.velX, 0, this.velZ), right) / this.horizontalSpeed
      : 0;
    const targetSlideRoll = this.sliding
      ? Math.max(-1, Math.min(1, lateralSpeed)) * MOVEMENT.CAMERA_SLIDE_ROLL
      : 0;
    const rollBlend = 1 - Math.exp(-MOVEMENT.CAMERA_FOV_RESPONSE * dt);
    this.slideCameraRoll += (targetSlideRoll - this.slideCameraRoll) * rollBlend;

    // Lean into the zip: the camera rolls away from the travel direction.
    if (this.zipTarget) {
      const targetZipRoll = Math.max(-1, Math.min(1, lateralSpeed)) * MOVEMENT.GRAPPLE_ZIP_ROLL;
      const zipRollBlend = 1 - Math.exp(-6 * dt);
      this.zipRoll += (targetZipRoll - this.zipRoll) * zipRollBlend;
    } else {
      this.zipRoll += (0 - this.zipRoll) * (1 - Math.exp(-10 * dt));
    }
  }

  /** Progress through the zip: 0 at the start, 1 at the arrival point. */
  private getZipProgress(): number {
    if (!this.zipTarget) return 0;
    const remaining = BABYLON.Vector3.Distance(this.position, this.zipTarget);
    return BABYLON.Scalar.Clamp(
      1 - remaining / Math.max(this.zipDistance, 0.001),
      0,
      1,
    );
  }

  private applyCameraRotation() {
    this.camera.rotationQuaternion = null;
    // A short decaying shake on launch gives the zip some punch.
    const shake = this.zipShake * this.zipShake;
    const shakePitch = (Math.random() - 0.5) * 0.03 * shake;
    const shakeYaw = (Math.random() - 0.5) * 0.03 * shake;
    const shakeRoll = (Math.random() - 0.5) * 0.045 * shake;
    this.camera.rotation.set(
      this.pitch + shakePitch,
      this.yaw + shakeYaw,
      this.cameraRoll + this.slideCameraRoll + this.zipRoll + shakeRoll,
    );
  }

  /** Write the final camera transform immediately before rendering. */
  syncCamera(x: number, y: number, z: number) {
    this.camera.position.set(x, y + this.eyeOffset, z);
    this.applyCameraRotation();
  }

  get position(): BABYLON.Vector3 {
    const translation = this.body.translation();
    return new BABYLON.Vector3(translation.x, translation.y, translation.z);
  }

  /** The player body, used by systems that need to exclude it from queries. */
  get rigidBody(): RAPIER.RigidBody {
    return this.body;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velX, this.velZ);
  }

  get speed3D(): number {
    return Math.sqrt(this.velX * this.velX + this.vy * this.vy + this.velZ * this.velZ);
  }

  get dashChargeAmount(): number {
    return this.dashCharge;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get isWallRunning(): boolean {
    return this.wallRunning;
  }

  get isDashing(): boolean {
    return this.dashTimeRemaining > 0;
  }

  get isSensoryBoosting(): boolean {
    return this.sensoryBoostActive;
  }

  /** 1 at boost start, draining to 0 over the boost window. */
  get sensoryBoostRemaining(): number {
    if (!this.sensoryBoostActive) return 0;
    return Math.max(
      0,
      1 - this.sensoryBoostElapsed / this.sensoryBoostDuration,
    );
  }

  get isSliding(): boolean {
    return this.sliding;
  }

  get isMantling(): boolean {
    return this.mantle.active;
  }

  get speedEffectIntensity(): number {
    const speed = Math.max(this.horizontalSpeed, this.speed3D * 0.85);
    const base = Math.max(0, Math.min(1, (speed - 10) / 22));
    const dashBoost = this.isDashing ? 0.55 : 0;
    const slideBoost = this.sliding ? Math.min(0.25, this.horizontalSpeed / 80) : 0;
    const zipBoost = this.zipTarget ? 0.35 : 0;
    return Math.max(0, Math.min(1, base + dashBoost + slideBoost + zipBoost));
  }
}
