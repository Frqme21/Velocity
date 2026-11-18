import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { COMBAT_CONFIG } from '../config/combat';
import { SparkBurst } from './SparkBurst';

/**
 * How far a bolt may get from the player before it is culled, squared.
 *
 * Generous on purpose: bolts live for a few seconds and travel quickly, so
 * this is only a safety net for shots that miss into the void. It must not be
 * tied to fixed world coordinates - custom levels place enemies far from the
 * origin, and a tight box would delete their bolts the moment they spawn.
 */
const MAX_BOLT_DISTANCE_SQ = 300 * 300;

/**
 * A single energy bolt in flight.
 *
 * Bolts are plain data plus a mesh - they travel in a straight line and are
 * cheap to test against.
 */
export interface Bolt {
  /** Where the bolt is right now. */
  position: BABYLON.Vector3;
  /** Where the bolt is going, in metres per second. */
  velocity: BABYLON.Vector3;
  /**
   * True once the player has deflected this bolt. Deflected bolts belong to
   * the player: they never hit them and they never get deflected again.
   */
  playerDeflected: boolean;
  /** The glowing head of the bolt. */
  mesh: BABYLON.Mesh;
  /** The fading trail behind the bolt. */
  trail: BABYLON.Mesh;
  /** How much life the bolt has left, in seconds. */
  life: number;
}

/**
 * The bolts flying through the world, and the parry that turns them around.
 *
 * The katana owns the swing, this owns the bullets: while a slash is inside
 * its parry window, every incoming bolt near the crosshair is flipped around
 * and sent back at whatever the player is aiming at.
 */
export class ProjectileManager {
  private scene: BABYLON.Scene;
  private camera: BABYLON.FreeCamera;
  private bolts: Bolt[] = [];
  /** The little bursts of light that mark a deflect. */
  private sparks: SparkBurst;

  /** The physics world, used to test the bolts against the graybox. */
  private world: RAPIER.World;
  /**
   * The player's body.
   *
   * It is left out of the wall test: the player is not a wall, and a bolt
   * that was deflected right in front of the camera would die on the
   * player's own capsule instead of flying back down the lane.
   */
  private playerBody: RAPIER.RigidBody;

  /** The material of an incoming (hostile) bolt. */
  private enemyMaterial: BABYLON.StandardMaterial;
  /** The material of a bolt the player sent back. */
  private deflectedMaterial: BABYLON.StandardMaterial;

  /**
   * How long the current slash has been running, in seconds.
   *
   * The parry window is measured from the start of the swing.
   */
  private slashElapsed = Number.POSITIVE_INFINITY;

  /** Where the player is, in world space. */
  private playerPosition = new BABYLON.Vector3();

  /**
   * Fired when a bolt is deflected.
   *
   * The game listens to this to add the hit-stop, the FOV kick, the shake
   * and the sound.
   */
  public onDeflect?: (point: BABYLON.Vector3) => void;

  /** Fired when an incoming bolt hits the player. */
  public onPlayerHit?: (point: BABYLON.Vector3) => void;

  constructor(
    scene: BABYLON.Scene,
    camera: BABYLON.FreeCamera,
    world: RAPIER.World,
    playerBody: RAPIER.RigidBody,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.playerBody = playerBody;

    // The incoming bolt glows hot orange-red.
    this.enemyMaterial = new BABYLON.StandardMaterial('bolt-enemy', scene);
    this.enemyMaterial.diffuseColor = BABYLON.Color3.Black();
    this.enemyMaterial.specularColor = BABYLON.Color3.Black();
    this.enemyMaterial.emissiveColor = new BABYLON.Color3(1, 0.36, 0.1);
    this.enemyMaterial.disableLighting = true;

    // A deflected bolt is the player's: cold cyan.
    this.deflectedMaterial = new BABYLON.StandardMaterial('bolt-deflected', scene);
    this.deflectedMaterial.diffuseColor = BABYLON.Color3.Black();
    this.deflectedMaterial.specularColor = BABYLON.Color3.Black();
    this.deflectedMaterial.emissiveColor = new BABYLON.Color3(0.35, 0.95, 1);
    this.deflectedMaterial.disableLighting = true;

    // The deflect burst: a gold flash with cyan shards around it.
    this.sparks = new SparkBurst(scene);
  }

  /** Tell the manager that a slash just started. */
  notifySlashStarted() {
    this.slashElapsed = 0;
  }

  /** Tell the manager where the player is right now. */
  setPlayerPosition(position: BABYLON.Vector3) {
    this.playerPosition.copyFrom(position);
  }

  /** How many bolts are currently in flight. */
  get boltCount(): number {
    return this.bolts.length;
  }

  /** How many bolts the player has deflected and still owns. */
  get deflectedCount(): number {
    return this.bolts.filter((bolt) => bolt.playerDeflected).length;
  }

  /**
   * The bolts that are currently in flight.
   *
   * The combat system reads this to see whether a deflected bolt has just
   * passed through an enemy.
   */
  get activeBolts(): readonly Bolt[] {
    return this.bolts;
  }

  /**
   * Spawn a bolt.
   *
   * @param position where the bolt starts
   * @param direction the direction it flies in
   * @param speed how fast it flies, in metres per second
   * @param playerDeflected true for a bolt the player owns
   */
  spawnBolt(
    position: BABYLON.Vector3,
    direction: BABYLON.Vector3,
    speed = COMBAT_CONFIG.BOLT_SPEED,
    playerDeflected = false,
  ) {
    const dir = direction.clone().normalize();
    if (dir.lengthSquared() < 0.5) return;

    const mesh = BABYLON.MeshBuilder.CreateSphere(
      'bolt',
      { diameter: COMBAT_CONFIG.BOLT_RADIUS * 2, segments: 8 },
      this.scene,
    );
    mesh.material = playerDeflected ? this.deflectedMaterial : this.enemyMaterial;
    mesh.position.copyFrom(position);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;

    // A short streak behind the head, stretched along the flight direction.
    const trail = BABYLON.MeshBuilder.CreateCylinder(
      'bolt-trail',
      { height: 1, diameter: COMBAT_CONFIG.BOLT_RADIUS * 1.5, tessellation: 6 },
      this.scene,
    );
    trail.material = mesh.material;
    trail.isPickable = false;
    trail.alwaysSelectAsActiveMesh = true;

    this.bolts.push({
      position: position.clone(),
      velocity: dir.scale(speed),
      playerDeflected,
      mesh,
      trail,
      life: COMBAT_CONFIG.BOLT_LIFETIME,
    });
  }

  /**
   * Advance every bolt.
   *
   * @param dt the real time step, in seconds
   * @param timeScale the world time scale (sensory boost slows bullets down)
   */
  update(dt: number, timeScale = 1) {
    this.slashElapsed += dt;

    const scaledDt = dt * timeScale;
    const forward = this.camera.getForwardRay().direction;

    // The player hit is handed over after the loop: the callback resets
    // the run, and that empties the bolt list while it is being walked.
    let playerHit: BABYLON.Vector3 | null = null;

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      if (!bolt) continue;
      bolt.life -= dt;

      // The parry: a slash in its active window turns incoming bolts around.
      if (!bolt.playerDeflected && this.canParry(bolt, forward)) {
        this.deflect(bolt);
        // The bolt leaves in its new direction right away, so the cyan streak
        // shows the new heading on the very same frame.
        this.syncBoltMesh(bolt);
        continue;
      }

      // Where the bolt was before this step, so the wall test can look at
      // the whole stretch it just travelled.
      const previous = bolt.position.clone();
      bolt.position.addInPlace(bolt.velocity.scale(scaledDt));

      // Walls stop bolts. Without this the shots of the guards sail
      // straight through the graybox and land behind it.
      if (this.hitsWorld(previous, bolt.position)) {
        this.removeBolt(i);
        continue;
      }

      // An incoming bolt that reaches the player hurts.
      if (!bolt.playerDeflected && this.hitsPlayer(bolt)) {
        playerHit = bolt.position.clone();
        this.removeBolt(i);
        continue;
      }

      // A bolt that flies past everything is gone. These limits are relative
      // to the player, not fixed world coordinates: custom levels can place
      // enemies anywhere, and a hard-coded +/-60 box used to delete a bolt on
      // its first frame when the shooter stood outside that box (the shot
      // sound played, but the projectile never rendered).
      const distanceFromPlayerSq = BABYLON.Vector3.DistanceSquared(
        bolt.position,
        this.playerPosition,
      );
      const gone = bolt.life <= 0
        || bolt.position.y < this.playerPosition.y - 60
        || distanceFromPlayerSq > MAX_BOLT_DISTANCE_SQ;
      if (gone) {
        this.removeBolt(i);
        continue;
      }

      this.syncBoltMesh(bolt);
    }

    if (playerHit) {
      this.onPlayerHit?.(playerHit);
    }

    this.updateSparks(dt);
  }

  /** Advance the sparks and clean up the dead ones. */
  private updateSparks(dt: number) {
    this.sparks.update(dt);
  }

  /**
   * Can this bolt be deflected right now?
   *
   * The slash has to be inside its parry window, the bolt has to be close
   * to the camera, in front of it, and actually coming towards the player.
   */
  private canParry(bolt: Bolt, forward: BABYLON.Vector3): boolean {
    if (this.slashElapsed > COMBAT_CONFIG.PARRY_ACTIVE_WINDOW) return false;

    const toBolt = bolt.position.subtract(this.camera.position);
    const distance = toBolt.length();
    if (distance > COMBAT_CONFIG.PARRY_RADIUS || distance < 0.0001) return false;

    const direction = toBolt.scale(1 / distance);
    // Only bolts near the crosshair may be deflected.
    if (BABYLON.Vector3.Dot(direction, forward) <= COMBAT_CONFIG.PARRY_CONE_DOT) {
      return false;
    }

    // A bolt that is already flying away cannot be caught.
    const boltDirection = bolt.velocity.clone().normalize();
    return BABYLON.Vector3.Dot(boltDirection, direction) < 0;
  }

  /**
   * Turn a bolt around and send it at whatever the player is aiming at.
   */
  private deflect(bolt: Bolt) {
    bolt.playerDeflected = true;

    // Aim at the exact point under the crosshair. If the player is looking
    // at the sky, the bolt simply flies along the look direction.
    const aim = this.getAimPoint();
    const toTarget = aim.subtract(bolt.position);
    if (toTarget.lengthSquared() < 0.0001) {
      toTarget.copyFrom(this.camera.getForwardRay().direction);
    }
    toTarget.normalize();

    bolt.velocity.copyFrom(
      toTarget.scale(
        COMBAT_CONFIG.BOLT_SPEED * COMBAT_CONFIG.DEFLECTED_SPEED_MULTIPLIER,
      ),
    );
    bolt.mesh.material = this.deflectedMaterial;
    bolt.trail.material = this.deflectedMaterial;
    bolt.life = COMBAT_CONFIG.BOLT_LIFETIME;

    // The clash happens where the bolt was caught.
    const point = bolt.position.clone();
    this.spawnSparkBurst(point);
    this.onDeflect?.(point);
  }

  /**
   * The world point under the crosshair.
   *
   * Falls back to a point far along the look direction when nothing is hit,
   * so aiming at the sky still sends the bolt away from the player.
   */
  private getAimPoint(): BABYLON.Vector3 {
    const ray = this.camera.getForwardRay(COMBAT_CONFIG.DEFLECT_AIM_DISTANCE);
    const pick = this.scene.pickWithRay(
      ray,
      (mesh) => mesh.isPickable && mesh.isEnabled() && mesh.getTotalVertices() > 0,
    );
    if (pick?.hit && pick.pickedPoint) return pick.pickedPoint.clone();

    return this.camera.position
      .add(this.camera.getForwardRay().direction.scale(COMBAT_CONFIG.DEFLECT_AIM_DISTANCE));
  }

  /** Is an incoming bolt close enough to the player to hurt? */
  private hitsPlayer(bolt: Bolt): boolean {
    return BABYLON.Vector3.Distance(bolt.position, this.playerPosition)
      < COMBAT_CONFIG.PLAYER_HIT_RADIUS;
  }

  /**
   * Is there geometry between the two points?
   *
   * The ray is cast through the physics world, so the bolts obey exactly
   * the same graybox the player does. The player's own body is left out of
   * the query: the player is not a wall, and a bolt that was just turned
   * around would otherwise die on their own capsule.
   */
  private hitsWorld(from: BABYLON.Vector3, to: BABYLON.Vector3): boolean {
    const delta = to.subtract(from);
    const distance = delta.length();
    if (distance < 0.0001) return false;

    const direction = delta.scale(1 / distance);

    // The ray starts a hair behind the bolt and reaches a bit past it, so
    // a bolt that is already touching a wall counts as stopped.
    const origin = from.subtract(direction.scale(COMBAT_CONFIG.BOLT_RADIUS));
    const reach = distance + COMBAT_CONFIG.BOLT_RADIUS * 2;

    const hit = this.world.castRay(
      new RAPIER.Ray(origin, direction),
      reach,
      true,
      undefined,
      undefined,
      undefined,
      this.playerBody,
    );

    return hit !== null;
  }

  /** Keep the mesh and its streak in sync with the bolt. */
  private syncBoltMesh(bolt: Bolt) {
    bolt.mesh.position.copyFrom(bolt.position);

    // The streak sits behind the head, pointing back along the flight path.
    const direction = bolt.velocity.clone().normalize();
    const length = Math.min(1.1, bolt.velocity.length() * 0.035);
    bolt.trail.position.copyFrom(bolt.position.subtract(direction.scale(length * 0.5)));
    bolt.trail.scaling.set(1, length, 1);
    const rotation = BABYLON.Quaternion.Identity();
    BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Axis.Y, direction, rotation);
    bolt.trail.rotationQuaternion = rotation;
  }

  /** Remove a bolt and free its meshes. */
  private removeBolt(index: number) {
    const bolt = this.bolts[index];
    if (!bolt) return;
    bolt.mesh.dispose();
    bolt.trail.dispose();
    this.bolts.splice(index, 1);
  }

  /**
   * Spawn the burst of sparks at a deflection.
   *
   * A bright flash plus a handful of shards that fly out and fade - all
   * plain meshes, so no particle texture is needed.
   */
  private spawnSparkBurst(point: BABYLON.Vector3) {
    this.sparks.burst(point, {
      flashColor: new BABYLON.Color3(1, 0.85, 0.4),
      shardColors: [new BABYLON.Color3(0.35, 0.95, 1)],
      shardCount: 8,
      speed: 4,
      life: 0.3,
    });
  }

  /** Remove every bolt and spark. */
  clear() {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.removeBolt(i);
    }
    this.sparks.clear();
  }
}
