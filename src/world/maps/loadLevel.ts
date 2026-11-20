import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import {
  ComponentRegistry,
  EDITOR_ONLY_TYPES,
  buildDefaultRegistry,
  type LevelData,
  type ComponentProps,
} from '../components/registry';
import { MaterialRegistry } from '../components/materials';
import { type LaserWall } from './graybox';

export interface LoadedLevel {
  name: string;
  spawn: BABYLON.Vector3;
  /** Where the player starts after the intro cinematic hands back control. */
  gameplaySpawn: BABYLON.Vector3;
  /** Fall below this and the run resets. */
  killY: number;
  meshes: BABYLON.AbstractMesh[];
  grappleAnchors: { position: BABYLON.Vector3; landing: BABYLON.Vector3 }[];
  enemySpawns: BABYLON.Vector3[];
  /** Initial yaw (radians) for each enemy spawn, in the same order. */
  enemyFacings: number[];
  /** Katana duelists placed with the Sword Elite Spawn marker. */
  swordEliteSpawns: BABYLON.Vector3[];
  /** Initial yaw (radians) for each Sword Elite spawn, in the same order. */
  swordEliteFacings: number[];
  /** UZI gunners placed with the SMG Spawn marker. */
  smgSpawns: BABYLON.Vector3[];
  /** Initial yaw (radians) for each SMG spawn, in the same order. */
  smgFacings: number[];
  /** Mech robots placed with the Mech Spawn marker. */
  mechSpawns: BABYLON.Vector3[];
  /** Initial yaw (radians) for each Mech spawn, in the same order. */
  mechFacings: number[];
  /** Initial yaw (radians) for the player spawn marker. */
  playerFacing: number;
  /** Finish zones; entering one completes the level. */
  finishZones: Array<{ position: BABYLON.Vector3; radius: number }>;
  /** Lethal laser volumes; touching one kills and respawns the player. */
  laserWalls: LaserWall[];
  /** Disposable static bodies/colliders created for collidable components. */
  bodies: RAPIER.RigidBody[];
  lights: BABYLON.Light[];
  /** Pairs of overlapping level pieces (empty by construction for JSON levels). */
  layoutOverlaps: string[];
  /** Colliders that may be wall-run (none by default for JSON levels). */
  wallRunColliders: number[];
  /**
   * True when the level explicitly tags its wall-run surfaces. Only tagged
   * colliders can then be wall-run; untagged levels allow any wall.
   */
  wallRunStrict: boolean;
  /** Colliders that may be mantled (ledge grab). */
  mantleColliders: number[];
  /** True when only tagged colliders may be mantled. */
  mantleStrict: boolean;
  update(dt: number): void;
  dispose(): void;
}

/**
 * Build a level from JSON using the shared component registry. This is the
 * same code path the editor uses to preview, so an exported level copies
 * 1:1 into the game.
 */
export function loadLevel(
  data: LevelData,
  scene: BABYLON.Scene,
  physics: RAPIER.World,
  shadowGenerator?: BABYLON.ShadowGenerator,
): LoadedLevel {
  const registry = buildDefaultRegistry();
  const materials = new MaterialRegistry(scene);

  // Collider wireframes are a debugging aid, never part of the shipped level.
  // Add ?debugColliders to the URL when you actually want to see them.
  const showColliderDebug = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('debugColliders');

  const meshes: BABYLON.AbstractMesh[] = [];
  const bodies: RAPIER.RigidBody[] = [];
  const debugMeshes: BABYLON.Mesh[] = [];
  const lights: BABYLON.Light[] = [];
  const grappleAnchors: { position: BABYLON.Vector3; landing: BABYLON.Vector3 }[] = [];
  const enemySpawns: BABYLON.Vector3[] = [];
  const enemyFacings: number[] = [];
  const swordEliteSpawns: BABYLON.Vector3[] = [];
  const swordEliteFacings: number[] = [];
  const smgSpawns: BABYLON.Vector3[] = [];
  const smgFacings: number[] = [];
  const mechSpawns: BABYLON.Vector3[] = [];
  const mechFacings: number[] = [];
  let playerFacing = 0;
  const wallRunColliders: number[] = [];
  const mantleColliders: number[] = [];
  const finishZones: Array<{ position: BABYLON.Vector3; radius: number }> = [];
  const laserWalls: LaserWall[] = [];

  const spawn = new BABYLON.Vector3(data.spawn[0], Math.max(data.spawn[1], 0.92), data.spawn[2]);
  const gs = data.gameplaySpawn ?? data.spawn;
  const gameplaySpawn = new BABYLON.Vector3(gs[0], Math.max(gs[1], 0.92), gs[2]);
  let playerMarker: BABYLON.Vector3 | null = null;

  /**
   * Enemy spawn markers have no physics body, so a marker left in mid-air
   * used to leave the guard floating there forever. Drop each spawn onto the
   * closest surface below it once all the level colliders exist.
   */
  const snapSpawnToFloor = (point: BABYLON.Vector3) => {
    const origin = point.add(new BABYLON.Vector3(0, 1, 0));
    const ray = new RAPIER.Ray(origin, new BABYLON.Vector3(0, -1, 0));
    const hit = physics.castRay(ray, 100, true);
    if (hit) point.y = origin.y - hit.timeOfImpact + 0.02;
  };

  // --- Components -----------------------------------------------------------
  for (const props of data.components) {
    const result = registry.build(scene, physics, materials, props, shadowGenerator);
    const editorOnly = EDITOR_ONLY_TYPES.has(props.type);
    for (const mesh of result.meshes) {
      meshes.push(mesh);
      if (editorOnly) {
        // Keep the data the marker produced (spawn point, finish zone) but
        // never let the editor's helper geometry into the game world.
        mesh.setEnabled(false);
        mesh.isPickable = false;
      } else {
        shadowGenerator?.addShadowCaster(mesh);
      }
    }
    if (result.body) {
      bodies.push(result.body);
      // Parkour triggers: only colliders explicitly tagged by the editor are
      // registered as wall-run surfaces.
      if (props.wallRun && result.colliderHandle !== undefined) {
        wallRunColliders.push(result.colliderHandle);
      }
      if (props.mantle && result.colliderHandle !== undefined) {
        mantleColliders.push(result.colliderHandle);
      }
      const pos = result.body.translation();
      console.log(`[loadLevel] collider: ${props.id} type=${props.type} pos=(${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}) scale=[${props.scale.join(',')}] collide=${props.collide}`);
      // Debug wireframe: show the ACTUAL collider bounds in lime green.
      // Only built for ?debugColliders - in a normal run these boxes used to
      // cover the whole level in green wireframe.
      if (showColliderDebug) {
        let hx = props.scale[0] / 2;
        let hy = props.scale[1] / 2;
        let hz = props.scale[2] / 2;
        try {
          const he = result.collider?.halfExtents();
          if (he) { hx = he.x; hy = he.y; hz = he.z; }
        } catch { /* fall back to props */ }
        const dbg = BABYLON.MeshBuilder.CreateBox(`dbg-${props.id}`, {
          width: hx * 2, height: hy * 2, depth: hz * 2,
        }, scene);
        dbg.position.copyFrom(new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]));
        dbg.rotation.copyFrom(new BABYLON.Vector3(props.rotation[0], props.rotation[1], props.rotation[2]));
        const dbgMat = new BABYLON.StandardMaterial(`dbg-mat-${props.id}`, scene);
        dbgMat.emissiveColor = props.wallRun
          ? new BABYLON.Color3(0.2, 0.85, 1)
          : new BABYLON.Color3(0, 1, 0);
        dbgMat.wireframe = true;
        dbgMat.disableLighting = true;
        dbg.material = dbgMat;
        debugMeshes.push(dbg);
      }
    }
    if (result.anchor) grappleAnchors.push(result.anchor);
    if (result.finish) finishZones.push(result.finish);
    // Laser walls are lethal on contact. Store their oriented box so the game
    // can test the player against them every frame (see Game.touchesLaserWall).
    if (props.type === 'laserWall') {
      const rotation = BABYLON.Quaternion.RotationYawPitchRoll(
        props.rotation[1], props.rotation[0], props.rotation[2],
      );
      laserWalls.push({
        position: new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]),
        halfExtents: new BABYLON.Vector3(
          props.scale[0] / 2, props.scale[1] / 2, props.scale[2] / 2,
        ),
        inverseRotation: rotation.conjugate(),
      });
    }
    // Only an ENEMY Spawn marker creates an enemy. A Player Spawn marker
    // previously fell into this branch too, so every player marker spawned a
    // stray guard. Player markers instead set the gameplay spawn below.
    if (result.spawn && props.type === 'enemySpawn') {
      enemySpawns.push(result.spawn);
      enemyFacings.push(((props.facing ?? 0) * Math.PI) / 180);
    }
    if (result.spawn && props.type === 'swordEliteSpawn') {
      swordEliteSpawns.push(result.spawn);
      swordEliteFacings.push(((props.facing ?? 0) * Math.PI) / 180);
    }
    if (result.spawn && props.type === 'smgSpawn') {
      smgSpawns.push(result.spawn);
      smgFacings.push(((props.facing ?? 0) * Math.PI) / 180);
    }
    if (result.spawn && props.type === 'mechSpawn') {
      mechSpawns.push(result.spawn);
      mechFacings.push(((props.facing ?? 0) * Math.PI) / 180);
    }
    if (result.spawn && props.type === 'playerSpawn') {
      playerMarker = new BABYLON.Vector3(
        result.spawn.x,
        Math.max(result.spawn.y, 0.92),
        result.spawn.z,
      );
      playerFacing = ((props.facing ?? 0) * Math.PI) / 180;
    }
    if (result.light) lights.push(result.light);
  }
  // All static colliders now exist, so the spawn markers can be grounded.
  for (const point of [...enemySpawns, ...swordEliteSpawns, ...smgSpawns, ...mechSpawns]) {
    snapSpawnToFloor(point);
  }

  if (playerMarker) {
    gameplaySpawn.copyFrom(playerMarker);
    spawn.copyFrom(playerMarker);
  }
  console.log(`[loadLevel] created ${bodies.length} static colliders for level "${data.name}"`);

  // --- Explicit grapple anchors --------------------------------------------
  for (const anchor of data.grappleAnchors) {
    grappleAnchors.push({
      position: new BABYLON.Vector3(anchor.position[0], anchor.position[1], anchor.position[2]),
      landing: new BABYLON.Vector3(anchor.landing[0], anchor.landing[1], anchor.landing[2]),
    });
  }

  // --- Explicit enemy spawns -----------------------------------------------
  for (const s of data.enemySpawns) {
    enemySpawns.push(new BABYLON.Vector3(s[0], s[1], s[2]));
    enemyFacings.push(0); // explicit array entries have no facing data
  }

  // --- Explicit finish zones ------------------------------------------------
  for (const f of data.finishZones ?? []) {
    finishZones.push({
      position: new BABYLON.Vector3(f.position[0], f.position[1], f.position[2]),
      radius: f.radius ?? 3,
    });
  }

  // --- Lights ---------------------------------------------------------------
  for (const l of data.lights ?? []) {
    const light = new BABYLON.PointLight(
      `level-light-${lights.length}`,
      new BABYLON.Vector3(l.position[0], l.position[1], l.position[2]),
      scene,
    );
    light.intensity = l.intensity ?? 1.0;
    lights.push(light);
  }

  let disposed = false;

  return {
    name: data.name,
    spawn,
    gameplaySpawn,
    killY: data.killY,
    meshes,
    grappleAnchors,
    enemySpawns,
    enemyFacings,
    swordEliteSpawns,
    swordEliteFacings,
    smgSpawns,
    smgFacings,
    mechSpawns,
    mechFacings,
    playerFacing,
    finishZones,
    laserWalls,
    bodies,
    lights,
    layoutOverlaps: [],
    wallRunColliders,
    wallRunStrict: data.parkour?.wallRunStrict === true,
    mantleColliders,
    mantleStrict: data.parkour?.mantleStrict === true,
    update(_dt: number) {
      // No per-frame simulation for static levels by default. Components that
      // need animation can hook in here later.
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) mesh.dispose();
      for (const mesh of debugMeshes) mesh.dispose();
      for (const light of lights) light.dispose();
      materials.dispose();
    },
  };
}

/** Default empty level for when no level data is available. */
export function emptyLevel(name = 'untitled'): LevelData {
  return {
    name,
    spawn: [0, 0.92, 0],
    gameplaySpawn: [0, 0.92, 0],
    killY: -6,
    components: [],
    grappleAnchors: [],
    enemySpawns: [],
  };
}

/** Convert a LoadedLevel back into LevelData (for editor export). */
export function levelToData(world: LoadedLevel): LevelData {
  return {
    name: world.name,
    spawn: [world.spawn.x, world.spawn.y, world.spawn.z],
    gameplaySpawn: [world.gameplaySpawn.x, world.gameplaySpawn.y, world.gameplaySpawn.z],
    killY: world.killY,
    components: [],
    grappleAnchors: world.grappleAnchors.map((a) => ({
      position: [a.position.x, a.position.y, a.position.z],
      landing: [a.landing.x, a.landing.y, a.landing.z],
    })),
    enemySpawns: world.enemySpawns.map((s) => [s.x, s.y, s.z]),
  };
}
