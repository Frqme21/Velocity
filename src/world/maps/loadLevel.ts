import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { ComponentRegistry, buildDefaultRegistry, type LevelData, type ComponentProps } from '../components/registry';
import { MaterialRegistry } from '../components/materials';

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
  /** Disposable static bodies/colliders created for collidable components. */
  bodies: RAPIER.RigidBody[];
  lights: BABYLON.Light[];
  /** Pairs of overlapping level pieces (empty by construction for JSON levels). */
  layoutOverlaps: string[];
  /** Colliders that may be wall-run (none by default for JSON levels). */
  wallRunColliders: number[];
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

  const meshes: BABYLON.AbstractMesh[] = [];
  const bodies: RAPIER.RigidBody[] = [];
  const debugMeshes: BABYLON.Mesh[] = [];
  const lights: BABYLON.Light[] = [];
  const grappleAnchors: { position: BABYLON.Vector3; landing: BABYLON.Vector3 }[] = [];
  const enemySpawns: BABYLON.Vector3[] = [];

  const spawn = new BABYLON.Vector3(data.spawn[0], Math.max(data.spawn[1], 0.92), data.spawn[2]);
  const gs = data.gameplaySpawn ?? data.spawn;
  const gameplaySpawn = new BABYLON.Vector3(gs[0], Math.max(gs[1], 0.92), gs[2]);

  // --- Components -----------------------------------------------------------
  for (const props of data.components) {
    const result = registry.build(scene, physics, materials, props, shadowGenerator);
    for (const mesh of result.meshes) {
      meshes.push(mesh);
      shadowGenerator?.addShadowCaster(mesh);
    }
    if (result.body) {
      bodies.push(result.body);
      const pos = result.body.translation();
      console.log(`[loadLevel] collider: ${props.id} type=${props.type} pos=(${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}) scale=[${props.scale.join(',')}] collide=${props.collide}`);
      // Debug wireframe: show the ACTUAL collider bounds in lime green.
      // Use the collider's own half-extents when available so the box matches
      // the hitbox exactly (plates and ramps have custom thicknesses).
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
      dbgMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
      dbgMat.wireframe = true;
      dbgMat.disableLighting = true;
      dbg.material = dbgMat;
      debugMeshes.push(dbg);
    }
    if (result.anchor) grappleAnchors.push(result.anchor);
    if (result.spawn) enemySpawns.push(result.spawn);
    if (result.light) lights.push(result.light);
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
    bodies,
    lights,
    layoutOverlaps: [],
    wallRunColliders: [],
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
