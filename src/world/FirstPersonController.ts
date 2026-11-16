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
  DASH_RECHARGE_TIME: MOVEMENT_CONFIG.DASH_RECHARGE_TIME,
  DASH_GROUND_BOOST: MOVEMENT_CONFIG.DASH_GROUND_BOOST,
  DASH_GROUND_MAX_SPEED: MOVEMENT_CONFIG.DASH_GROUND_MAX_SPEED,
  DASH_AIR_BOOST: MOVEMENT_CONFIG.DASH_AIR_BOOST,
  DASH_AIR_MAX_SPEED: MOVEMENT_CONFIG.DASH_AIR_MAX_SPEED,
  AIR_DASH_LIFT: MOVEMENT_CONFIG.AIR_DASH_LIFT,
  SLIDE_MIN_SPEED: MOVEMENT_CONFIG.SLIDE_MIN_SPEED,
  SLIDE_STOP_SPEED: MOVEMENT_CONFIG.SLIDE_STOP_SPEED,
  SLIDE_IMPULSE: MOVEMENT_CONFIG.SLIDE_IMPULSE,
  SLIDE_MAX_SPEED: MOVEMENT_CONFIG.SLIDE_MAX_SPEED,
  SLIDE_SLOPE_MAX_SPEED: MOVEMENT_CONFIG.SLIDE_SLOPE_MAX_SPEED,
  SLIDE_LOW_FRICTION: MOVEMENT_CONFIG.SLIDE_LOW_FRICTION,
  SLIDE_HIGH_FRICTION: MOVEMENT_CONFIG.SLIDE_HIGH_FRICTION,
  SLIDE_FRICTION_RAMP: MOVEMENT_CONFIG.SLIDE_FRICTION_RAMP,
  SLIDE_COOLDOWN: MOVEMENT_CONFIG.SLIDE_COOLDOWN,
  SLIDE_CARVE_ACCEL: MOVEMENT_CONFIG.SLIDE_CARVE_ACCEL,
  SLIDE_TURN_RATE: MOVEMENT_CONFIG.SLIDE_TURN_RATE,
  SLIDE_THROTTLE_ACCEL: MOVEMENT_CONFIG.SLIDE_THROTTLE_ACCEL,
  SLIDE_BRAKE_ACCEL: MOVEMENT_CONFIG.SLIDE_BRAKE_ACCEL,
  SLIDE_SLOPE_ACCEL: MOVEMENT_CONFIG.SLIDE_SLOPE_ACCEL,
  SLIDE_HOP_BOOST: MOVEMENT_CONFIG.SLIDE_HOP_BOOST,
  SLIDE_FALL_CONVERSION: MOVEMENT_CONFIG.SLIDE_FALL_CONVERSION,
  SLIDE_FALL_CONVERSION_MAX: MOVEMENT_CONFIG.SLIDE_FALL_CONVERSION_MAX,
  SLIDE_EYE_OFFSET: MOVEMENT_CONFIG.SLIDE_EYE_OFFSET,
  CAMERA_HEIGHT_RESPONSE: MOVEMENT_CONFIG.CAMERA_HEIGHT_RESPONSE,
  CAMERA_FOV_RESPONSE: MOVEMENT_CONFIG.CAMERA_FOV_RESPONSE,
  CAMERA_SLIDE_ROLL: MOVEMENT_CONFIG.CAMERA_SLIDE_ROLL,
  BASE_FOV: (90 * Math.PI) / 180,
  MAX_FOV_WIDEN: (12 * Math.PI) / 180,
  FOV_SPEED_START: 6,
  FOV_SPEED_MAX: 17.5,
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
  private dashCharge = 1;
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
    this.charController.enableAutostep(0.5, 0.2, true);
    this.charController.enableSnapToGround(0.5);
    this.charController.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.charController.setMinSlopeSlideAngle((30 * Math.PI) / 180);

    this.input.onMouseDelta = (dx, dy) => this.applyLookDelta(dx, dy);
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
    this.wallRunCooldown = Math.max(0, this.wallRunCooldown - dt);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.dashCharge = Math.min(
      1,
      this.dashCharge + dt / MOVEMENT.DASH_RECHARGE_TIME,
    );

    if (!input.slide) {
      this.slideHeldConsumed = false;
      this.slideRequestBuffered = false;
    } else if (input.slidePressed) {
      this.slideRequestBuffered = true;
    }

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const cameraForward = new BABYLON.Vector3(sin, 0, cos);
    const right = new BABYLON.Vector3(cos, 0, -sin);

    let forward = 0;
    let strafe = 0;
    if (input.forward) forward += 1;
    if (input.backward) forward -= 1;
    if (input.right) strafe += 1;
    if (input.left) strafe -= 1;

    let wishX = forward * sin + strafe * cos;
    let wishZ = forward * cos - strafe * sin;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 0) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    const position = this.body.translation();
    const wasGrounded = this.grounded;
    let slideJumpTriggered = false;

    if (this.grounded) {
      this.detachWallRun();

      if (input.jumpPressed) {
        if (this.sliding) {
          this.endSlide(true);
          this.velX += this.slideDirectionX * MOVEMENT.SLIDE_HOP_BOOST;
          this.velZ += this.slideDirectionZ * MOVEMENT.SLIDE_HOP_BOOST;
          this.vy = MOVEMENT.JUMP_VELOCITY;
          slideJumpTriggered = true;
        }
      }

      if (!input.slide && this.sliding) {
        this.endSlide(false);
      }

      if (
        !input.jumpPressed
        && this.slideRequestBuffered
        && !this.sliding
        && !this.slideHeldConsumed
        && this.slideCooldown <= 0
        && Math.hypot(this.velX, this.velZ) >= MOVEMENT.SLIDE_MIN_SPEED
      ) {
        const direction = this.getSlideEntryDirection(wishX, wishZ, cameraForward);
        this.startSlide(direction.x, direction.z, 0);
      }

      if (this.sliding) {
        this.applySlideMovement(forward, strafe, right, dt);
      } else if (!slideJumpTriggered) {
        this.applyGroundMovement(wishX, wishZ, input.jumpPressed, dt);
      }
    } else {
      if (this.sliding) this.endSlide(true);
      this.applyAirMovement(wishX, wishZ, dt);

      if (this.wallRunning) {
        this.updateWallRun(input.jumpPressed, dt);
      } else if (input.forward && this.wallRunCooldown <= 0) {
        const wallHit = this.detectWall(position, cameraForward, right);
        if (wallHit) this.attachWallRun(wallHit, this.vy > 0);
      }
    }

    if (input.dashPressed && this.dashCharge >= 1) {
      const hasDirection = wishX !== 0 || wishZ !== 0;
      const dashX = hasDirection ? wishX : cameraForward.x;
      const dashZ = hasDirection ? wishZ : cameraForward.z;

      this.endSlide(false);
      if (this.grounded) {
        this.applyGroundDash(dashX, dashZ);
      } else {
        this.applyAirDash(dashX, dashZ);
      }
      this.dashCharge = 0;
    }

    const fallSpeedBeforeLanding = !wasGrounded ? Math.max(0, -this.vy) : 0;
    const movement = {
      x: this.velX * dt,
      y: this.vy * dt,
      z: this.velZ * dt,
    };

    this.charController.computeColliderMovement(this.collider, movement);
    const corrected = this.charController.computedMovement();

    const blockedBelow = movement.y < 0 && corrected.y > movement.y * 0.5;
    this.grounded = blockedBelow || this.charController.computedGrounded();
    if (blockedBelow) {
      this.vy = 0;
    } else if (movement.y < 0) {
      this.vy = corrected.y / dt;
    }

    const justLanded = !wasGrounded && this.grounded;
    if (
      justLanded
      && input.slide
      && !input.jumpPressed
      && !this.sliding
      && !this.slideHeldConsumed
    ) {
      const direction = this.getSlideEntryDirection(wishX, wishZ, cameraForward);
      this.startSlide(direction.x, direction.z, fallSpeedBeforeLanding);
    }

    // Keep the movement velocity independent from Rapier's collision
    // correction. The corrected translation controls the player's position,
    // but copying it back into velocity can erase momentum when the capsule
    // merely brushes a surface (especially the wall-run panels).
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
  }

  private applyGroundMovement(wishX: number, wishZ: number, jumpPressed: boolean, dt: number) {
    const hasMovementInput = wishX !== 0 || wishZ !== 0;
    const speed = Math.hypot(this.velX, this.velZ);

    // Ground friction is applied when the player releases movement input, or
    // when momentum is above the target running speed. While steering, the
    // existing velocity is retained so a stray collision cannot make running
    // feel as though the player suddenly stops dead.
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

    if (jumpPressed) {
      this.vy = MOVEMENT.JUMP_VELOCITY;
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
    const impulse = MOVEMENT.SLIDE_IMPULSE + fallBoost;
    this.velX += this.slideDirectionX * impulse;
    this.velZ += this.slideDirectionZ * impulse;

    const speed = Math.hypot(this.velX, this.velZ);
    if (speed > MOVEMENT.SLIDE_MAX_SPEED) {
      const scale = MOVEMENT.SLIDE_MAX_SPEED / speed;
      this.velX *= scale;
      this.velZ *= scale;
    }
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

    // Steering gradually rotates both the locked slide direction and the
    // current velocity. This preserves momentum while still allowing the
    // player to carve out of a slide instead of being forced into a rail.
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
    const speedCap = MOVEMENT.SLIDE_MAX_SPEED
      + (MOVEMENT.SLIDE_SLOPE_MAX_SPEED - MOVEMENT.SLIDE_MAX_SPEED) * slopeAmount;

    // Project gravity onto the ground plane. On flat ground this is zero;
    // on a slope it produces a downhill acceleration vector.
    const gravity = new BABYLON.Vector3(0, -MOVEMENT.GRAVITY * MOVEMENT.SLIDE_SLOPE_ACCEL, 0);
    const gravityNormalComponent = BABYLON.Vector3.Dot(gravity, groundNormal);
    const slopeAcceleration = gravity.subtract(groundNormal.scale(gravityNormalComponent));
    this.velX += slopeAcceleration.x * dt;
    this.velZ += slopeAcceleration.z * dt;

    const rampProgress = Math.max(0, Math.min(
      1,
      (this.slideElapsed - 0.4) / MOVEMENT.SLIDE_FRICTION_RAMP,
    ));
    const smoothRamp = rampProgress * rampProgress * (3 - 2 * rampProgress);
    const friction = MOVEMENT.SLIDE_LOW_FRICTION
      + (MOVEMENT.SLIDE_HIGH_FRICTION - MOVEMENT.SLIDE_LOW_FRICTION) * smoothRamp;

    const speed = Math.hypot(this.velX, this.velZ);
    if (speed > 0.001) {
      const drop = speed * friction * dt;
      const scale = Math.max(0, speed - drop) / speed;
      this.velX *= scale;
      this.velZ *= scale;
    }

    // The main slide direction remains locked. Only a small lateral carve is
    // allowed, perpendicular to that direction.
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
      const braking = Math.min(
        MOVEMENT.SLIDE_BRAKE_ACCEL * dt,
        forwardSpeed,
      );
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

  private applyGroundDash(directionX: number, directionZ: number) {
    this.velX += directionX * MOVEMENT.DASH_GROUND_BOOST;
    this.velZ += directionZ * MOVEMENT.DASH_GROUND_BOOST;

    const speed = Math.hypot(this.velX, this.velZ);
    if (speed > MOVEMENT.DASH_GROUND_MAX_SPEED) {
      const scale = MOVEMENT.DASH_GROUND_MAX_SPEED / speed;
      this.velX *= scale;
      this.velZ *= scale;
    }
  }

  private applyAirDash(directionX: number, directionZ: number) {
    if (this.wallRunning) {
      this.lastWallColliderHandle = this.wallColliderHandle;
      this.wallRunCooldown = WALL_RUN.COOLDOWN;
      this.detachWallRun();
    }

    this.velX += directionX * MOVEMENT.DASH_AIR_BOOST;
    this.velZ += directionZ * MOVEMENT.DASH_AIR_BOOST;

    const speed = Math.hypot(this.velX, this.velZ);
    if (speed > MOVEMENT.DASH_AIR_MAX_SPEED) {
      const scale = MOVEMENT.DASH_AIR_MAX_SPEED / speed;
      this.velX *= scale;
      this.velZ *= scale;
    }

    // An air dash gives a small, controlled lift so it can cross gaps without
    // turning into a second jump.
    this.vy = Math.max(this.vy, MOVEMENT.AIR_DASH_LIFT);
  }

  private applyAirMovement(wishX: number, wishZ: number, dt: number) {
    // Source-style air steering. The capped acceleration adds a small amount
    // of wish speed, while the turn-rate steering rotates existing momentum
    // toward the requested direction without throwing that momentum away.
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

      // Rapier's ray normal points out of the wall and toward the player.
      // This is the outward gameplay normal used for wall jumps; its negative
      // provides the small inward pull that keeps the capsule against a wall.
      const normal = new BABYLON.Vector3(hit.normal.x, 0, hit.normal.z).normalize();
      const tangent = BABYLON.Vector3.Cross(normal, BABYLON.Axis.Y).normalize();
      if (BABYLON.Vector3.Dot(tangent, cameraForward) < 0) tangent.scaleInPlace(-1);

      const sideSign = BABYLON.Vector3.Dot(normal, right);
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

    // Prefer the wall closest to the capsule. This still allows either side
    // of a parallel-panel corridor to become the active wall.
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
      this.lastWallColliderHandle = this.wallColliderHandle;
      this.wallRunCooldown = WALL_RUN.COOLDOWN;
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

    const speed = Math.hypot(this.velX, this.velZ);
    const fovProgress = Math.max(0, Math.min(
      1,
      (speed - MOVEMENT.FOV_SPEED_START) / (MOVEMENT.FOV_SPEED_MAX - MOVEMENT.FOV_SPEED_START),
    ));
    const targetFov = MOVEMENT.BASE_FOV + MOVEMENT.MAX_FOV_WIDEN * fovProgress;
    const fovBlend = 1 - Math.exp(-MOVEMENT.CAMERA_FOV_RESPONSE * dt);
    this.cameraFov += (targetFov - this.cameraFov) * fovBlend;
    this.camera.fov = this.cameraFov;

    const lateralSpeed = speed > 0.001
      ? BABYLON.Vector3.Dot(new BABYLON.Vector3(this.velX, 0, this.velZ), right) / speed
      : 0;
    const targetSlideRoll = this.sliding
      ? Math.max(-1, Math.min(1, lateralSpeed)) * MOVEMENT.CAMERA_SLIDE_ROLL
      : 0;
    const rollBlend = 1 - Math.exp(-MOVEMENT.CAMERA_FOV_RESPONSE * dt);
    this.slideCameraRoll += (targetSlideRoll - this.slideCameraRoll) * rollBlend;
  }

  private applyCameraRotation() {
    this.camera.rotationQuaternion = null;
    this.camera.rotation.set(this.pitch, this.yaw, this.cameraRoll + this.slideCameraRoll);
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

  get horizontalSpeed(): number {
    return Math.hypot(this.velX, this.velZ);
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
}
