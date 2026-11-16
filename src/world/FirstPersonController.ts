import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { MOVEMENT_CONFIG } from '../config/movement';

const MOVEMENT = {
  RUN_SPEED: MOVEMENT_CONFIG.RUN_SPEED,
  GROUND_ACCEL: MOVEMENT_CONFIG.ACCELERATE,
  AIR_ACCEL: MOVEMENT_CONFIG.AIR_ACCELERATE,
  AIR_SPEED_CAP: MOVEMENT_CONFIG.AIR_CAP,
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
    this.dashCharge = Math.min(
      1,
      this.dashCharge + dt / MOVEMENT.DASH_RECHARGE_TIME,
    );

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

    if (this.grounded) {
      this.detachWallRun();
      this.applyGroundMovement(wishX, wishZ, input.jumpPressed, dt);
    } else {
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

      if (this.grounded) {
        this.applyGroundDash(dashX, dashZ);
      } else {
        this.applyAirDash(dashX, dashZ);
      }
      this.dashCharge = 0;
    }

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

    // Keep the movement velocity independent from Rapier's collision
    // correction. The corrected translation controls the player's position,
    // but copying it back into velocity can erase momentum when the capsule
    // merely brushes a surface (especially the wall-run panels).
    this.body.setNextKinematicTranslation({
      x: position.x + corrected.x,
      y: position.y + corrected.y,
      z: position.z + corrected.z,
    });

    // The camera should lean away from the attached wall rather than toward
    // it. wallSideSign is positive for a wall on the player's right.
    const rollTarget = this.wallRunning ? -this.wallSideSign * WALL_RUN.ROLL : 0;
    const rollBlend = 1 - Math.exp(-WALL_RUN.ROLL_RESPONSE * dt);
    this.cameraRoll += (rollTarget - this.cameraRoll) * rollBlend;

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
    // Source-style air steering: add only the capped projected wish speed,
    // then preserve the unprojected component of the existing momentum.
    if (wishX !== 0 || wishZ !== 0) {
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

  private applyCameraRotation() {
    this.camera.rotationQuaternion = null;
    this.camera.rotation.set(this.pitch, this.yaw, this.cameraRoll);
  }

  /** Write the final camera transform immediately before rendering. */
  syncCamera(x: number, y: number, z: number) {
    this.camera.position.set(x, y + MOVEMENT.EYE_OFFSET, z);
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
