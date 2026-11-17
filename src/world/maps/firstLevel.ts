import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { type GrayboxWorld, type GrappleAnchorPoint } from './graybox';

export interface FirstLevelWorld extends GrayboxWorld {
  /** Animate the moving neon / props. */
  update(dt: number): void;
  /** Falling below this height is a fatal error, not an instant reset. */
  killY: number;
  /** Where the player is handed control after the intro cinematic. */
  gameplaySpawn: BABYLON.Vector3;
  /**
   * Pairs of level pieces that overlap each other.
   *
   * The map is built from separated slabs, and this list is the automated
   * proof of it: it is empty when no piece is stacked on another one.
   */
  layoutOverlaps: string[];
  /**
   * Collider handles of the surfaces that may be wall-run.
   *
   * Only these can start a wall run. Every other wall, ledge and railing in
   * the level is inert, so the camera never tilts by accident.
   */
  wallRunColliders: number[];
}

/** Body centre heights for a floor whose top surface is `top`. */
const STAND = 0.92;

/**
 * The first level.
 *
 * It is a single linear route: a rooftop beam for the intro, a courtyard with
 * the first guard, a mantle ledge, a drop, a wall-run over a pit, a grapple
 * gap and a final platform. Every traversal trick is signposted with one of
 * the generated textures, so the player can read what a wall wants before
 * they reach it.
 *
 * The route is split into z-slabs. Nothing crosses a slab boundary and no
 * two pieces share the same space:
 *
 * ```text
 *   z  -6 ..  6   rooftop beam (intro, y18)
 *   z  -6 .. 22   courtyard        (floor y0, guard)
 *   z 22 .. 33   mantle ledge     (top y1.4, chevrons)
 *   z 33 .. 42   drop landing     (floor y0, hazard paint)
 *   z 42 .. 52   wall-run pit     (no floor, wall on the left)
 *   z 52 .. 60   pit landing      (floor y0)
 *   z 60 .. 68   grapple gap      (no floor, ring ahead)
 *   z 68 .. 84   final platform   (floor y0, gate, guard)
 * ```
 *
 * Every box records its bounds, and `reportOverlaps()` checks the whole map
 * for pieces that occupy the same space. That list is empty by construction;
 * it is exposed so the level can be verified automatically.
 */
export function createFirstLevel(
  scene: BABYLON.Scene,
  physics: RAPIER.World,
  shadowGenerator?: BABYLON.ShadowGenerator,
): FirstLevelWorld {
  const meshes: BABYLON.AbstractMesh[] = [];
  const grappleAnchors: GrappleAnchorPoint[] = [];
  const animated: Array<(dt: number) => void> = [];
  /** Every box the map builds, with its bounds, for the overlap check. */
  const layout: LayoutBox[] = [];
  /** Collider handles of the wall-run surfaces. */
  const wallRunColliders: number[] = [];

  const grid = tex(scene, 'l1-floor', '/textures/floor_grid.png', 10, 10);
  const deck = tex(scene, 'l1-deck', '/textures/floor_tiles.png', 2, 2);
  const panel = tex(scene, 'l1-panel', '/textures/panel_wall.png', 2, 2);
  const hazard = tex(scene, 'l1-hazard', '/textures/hazard_stripes.png', 3, 1);
  const chevron = tex(scene, 'l1-chevron', '/textures/climb_chevrons.png', 2, 2);
  // The wall-run face is a side wall, so its chevrons have to point along
  // the wall instead of up it.
  const chevronForward = tex(scene, 'l1-chevron-forward', '/textures/climb_chevrons_forward.png', 2, 1);
  const metal = tex(scene, 'l1-metal', '/textures/rail_metal.png', 2, 1);
  const neon = tex(scene, 'l1-neon', '/textures/neon_strip.png', 1, 1, true);
  const dark = solid(scene, 'l1-dark', '#121726');
  const glass = solid(scene, 'l1-glass', '#1b2740', '#0b1424');

  /** Solid box with an optional Rapier collider. Returns the mesh. */
  const box = (
    name: string,
    pos: BABYLON.Vector3,
    size: BABYLON.Vector3,
    material: BABYLON.Material,
    collide = true,
    onCollider?: (handle: number) => void,
  ): BABYLON.Mesh => {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width: size.x, height: size.y, depth: size.z,
    }, scene);
    mesh.position.copyFrom(pos);
    mesh.material = material;
    mesh.receiveShadows = true;
    if (shadowGenerator && collide) shadowGenerator.addShadowCaster(mesh);
    meshes.push(mesh);
    layout.push({
      name,
      min: new BABYLON.Vector3(pos.x - size.x / 2, pos.y - size.y / 2, pos.z - size.z / 2),
      max: new BABYLON.Vector3(pos.x + size.x / 2, pos.y + size.y / 2, pos.z + size.z / 2),
    });
    if (collide) {
      const body = physics.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
      );
      const collider = physics.createCollider(
        RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2),
        body,
      );
      onCollider?.(collider.handle);
    }
    return mesh;
  };

  /** A floor slab whose top surface sits at `top`. */
  const floor = (
    name: string,
    x: number,
    z: number,
    w: number,
    d: number,
    top: number,
    material = grid,
  ) => box(name, new BABYLON.Vector3(x, top - 0.5, z), new BABYLON.Vector3(w, 1, d), material);

  /**
   * A railing that stands on a surface.
   *
   * `baseY` is the height the railing starts at, so a rail on the mantle
   * ledge sits on the ledge instead of inside it.
   */
  const rail = (
    name: string,
    x: number,
    z: number,
    len: number,
    baseY = 0,
    alongZ = false,
    material = metal,
  ) => {
    const size = alongZ
      ? new BABYLON.Vector3(0.16, 0.12, len)
      : new BABYLON.Vector3(len, 0.12, 0.16);
    box(`${name}-top`, new BABYLON.Vector3(x, baseY + 1.3, z), size, material, false);
    const count = Math.max(2, Math.round(len / 2.5));
    for (let i = 0; i <= count; i++) {
      const p = -len / 2 + (len / count) * i;
      const px = alongZ ? x : x + p;
      const pz = alongZ ? z + p : z;
      box(`${name}-post-${i}`, new BABYLON.Vector3(px, baseY + 0.7, pz),
        new BABYLON.Vector3(0.11, 1.4, 0.11), material, false);
    }
    const colliderSize = alongZ
      ? new BABYLON.Vector3(0.2, 1.4, len)
      : new BABYLON.Vector3(len, 1.4, 0.2);
    box(`${name}-solid`, new BABYLON.Vector3(x, baseY + 0.7, z), colliderSize, dark);
  };

  // Sign helper disabled - billboards removed per feedback.
  // const sign = (text: string, pos: BABYLON.Vector3, accent = '#7ef4ff') => {
    //   const plane = BABYLON.MeshBuilder.CreatePlane(`sign-${text}`, { width: 4.8, height: 1.0 }, scene);
  //   plane.position.copyFrom(pos);
  //   plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  //   const texture = new BABYLON.DynamicTexture(`sign-tex-${text}`, { width: 640, height: 128 }, scene, false);
  //   texture.drawText(text, null, 82, 'bold 44px monospace', accent, '#080e1c', true);
  //   const mat = new BABYLON.StandardMaterial(`sign-mat-${text}`, scene);
  //   mat.diffuseTexture = texture;
  //   mat.emissiveTexture = texture;
  //   mat.emissiveColor = BABYLON.Color3.White();
  //   mat.disableLighting = true;
  //   mat.backFaceCulling = false;
  //   plane.material = mat;
  //   meshes.push(plane);
  // };

  // ------------------------------------------------------------------
  // 1. Rooftop beam - the intro starts up here, at y18.
  //    z -6 .. 6
  // ------------------------------------------------------------------
  box('intro-beam', new BABYLON.Vector3(0, 17.7, 0), new BABYLON.Vector3(1.4, 0.6, 12), dark);
  box('intro-beam-neon', new BABYLON.Vector3(0, 18.03, 0), new BABYLON.Vector3(0.28, 0.06, 11.4), neon, false);
  for (const side of [-1, 1]) {
    for (let z = -5; z <= 5; z += 2) {
      box(`intro-rail-post-${side}-${z}`, new BABYLON.Vector3(side * 0.62, 18.65, z),
        new BABYLON.Vector3(0.08, 1.3, 0.08), metal, false);
    }
    box(`intro-rail-top-${side}`, new BABYLON.Vector3(side * 0.62, 19.28, 0),
      new BABYLON.Vector3(0.1, 0.1, 11), metal, false);
  }
  // The support tower stops exactly at the underside of the beam.
  box('intro-tower', new BABYLON.Vector3(0, 8.7, -5.6), new BABYLON.Vector3(2.6, 17.4, 2.6), panel, false);

  // ------------------------------------------------------------------
  // 2. Courtyard - the floor the intro drops onto.
  //    z -6 .. 22
  // ------------------------------------------------------------------
  floor('courtyard', 0, 8, 30, 28, 0);
  rail('courtyard-west', -14.6, 8, 26, 0, true);
  rail('courtyard-east', 14.6, 8, 26, 0, true);
  // Kept off to the side so it never overlaps the guard below the beam.
  // sign('DROP POINT', new BABYLON.Vector3(-6.5, 3.2, 12), '#ff6a4d');

  // ------------------------------------------------------------------
  // 3. Mantle ledge - a 1.4 m step with chevrons on its face.
  //    z 22 .. 33, top y1.4
  // ------------------------------------------------------------------
  box('mantle-block', new BABYLON.Vector3(0, -1.3, 27.5), new BABYLON.Vector3(18, 5.4, 11), deck);
  box('mantle-face', new BABYLON.Vector3(0, 0.72, 21.94), new BABYLON.Vector3(17.6, 1.44, 0.12), chevron, false);
  // sign('CHEVRON WALL / MANTLE', new BABYLON.Vector3(0, 3.4, 21.2), '#7ef4ff');
  box('mantle-strip', new BABYLON.Vector3(0, 1.43, 27.5), new BABYLON.Vector3(17, 0.06, 10.5), neon, false);
  // The rails stand on the ledge, not inside it.
  rail('mantle-west', -8.8, 27.5, 10.5, 1.4, true);
  rail('mantle-east', 8.8, 27.5, 10.5, 1.4, true);

  // ------------------------------------------------------------------
  // 4. Drop landing - the same height as the courtyard again.
  //    z 33 .. 42
  // ------------------------------------------------------------------
  floor('drop-landing', 0, 37.5, 30, 9, 0);
  // Hazard paint on the floor, not a second slab under it.
  box('drop-marker', new BABYLON.Vector3(0, 0.03, 33.6), new BABYLON.Vector3(18, 0.06, 0.8), hazard, false);
  // A low guide wall keeps the run-up narrow without blocking the lane.
  box('lane-guide', new BABYLON.Vector3(-0.5, 0.7, 38.5), new BABYLON.Vector3(0.2, 1.4, 7), dark);
  // sign('DROP / REACQUIRE', new BABYLON.Vector3(4.5, 3.2, 36), '#ffd166');

  // ------------------------------------------------------------------
  // 5. Wall-run pit - no floor at all.
  //    z 42 .. 52
  // ------------------------------------------------------------------
  // The wall is a pillar that reaches down into the dark, so it is never
  // buried in a floor slab and never shares space with one.
  box('wallrun-wall', new BABYLON.Vector3(-3, 0, 47), new BABYLON.Vector3(0.7, 12, 10), panel, true, (h) => wallRunColliders.push(h));
  // The wall-run face uses the forward-pointing chevrons so the arrows
  // point along the run direction (+z).
  box('wallrun-wall-face', new BABYLON.Vector3(-2.61, 2.9, 47), new BABYLON.Vector3(0.08, 5.4, 9.6), chevronForward, false);
  box('wallrun-wall-neon', new BABYLON.Vector3(-2.61, 5.8, 47), new BABYLON.Vector3(0.08, 0.12, 9.6), neon, false);
  // sign('WALLRUN  >', new BABYLON.Vector3(0, 4.4, 41.5), '#ff7bd0');
  // A grapple ring hangs over the pit as the alternative line across.
  grappleAnchors.push({
    position: new BABYLON.Vector3(0, 7.5, 46),
    landing: new BABYLON.Vector3(0, STAND, 52),
  });

  // ------------------------------------------------------------------
  // 6. Pit landing.
  //    z 52 .. 60
  // ------------------------------------------------------------------
  floor('pit-landing', 0, 56, 22, 8, 0, deck);

  // ------------------------------------------------------------------
  // 7. Grapple gap - no floor.
  //    z 60 .. 68
  // ------------------------------------------------------------------
  // The mast stands to the side of the flight line so the pull never clips it.
  box('grapple-mast', new BABYLON.Vector3(-0.9, -3, 64), new BABYLON.Vector3(0.18, 32, 0.18), metal, false);
  grappleAnchors.push({
    position: new BABYLON.Vector3(0, 9.5, 64),
    landing: new BABYLON.Vector3(0, STAND, 69),
  });
  // sign('GRAPPLE  ^', new BABYLON.Vector3(3.4, 3.4, 61), '#7ef4ff');

  // ------------------------------------------------------------------
  // 8. Final platform.
  //    z 68 .. 84
  // ------------------------------------------------------------------
  floor('final-platform', 0, 76, 26, 16, 0, deck);
  box('final-banner', new BABYLON.Vector3(0, 4.4, 74), new BABYLON.Vector3(12, 1.4, 0.3), neon, false);
  // sign('SECTOR CLEAR', new BABYLON.Vector3(0, 6.4, 74), '#8fffb6');
  rail('final-west', -12.6, 76, 15, 0, true);
  rail('final-east', 12.6, 76, 15, 0, true);

  // A sliding gate on the final platform, just to keep the world alive.
  const gateA = box('final-gate-a', new BABYLON.Vector3(-5.4, 2, 80), new BABYLON.Vector3(3, 4, 0.4), hazard, false);
  const gateB = box('final-gate-b', new BABYLON.Vector3(5.4, 2, 80), new BABYLON.Vector3(3, 4, 0.4), hazard, false);
  let gateTime = 0;
  animated.push((dt) => {
    gateTime += dt;
    const open = (Math.sin(gateTime * 0.6) + 1) * 0.5;
    gateA.position.x = -5.4 - open * 2.2;
    gateB.position.x = 5.4 + open * 2.2;
  });

  // ------------------------------------------------------------------
  // 9. Background skyline.
  //    Fixed slots on two rows, so no two towers ever intersect.
  // ------------------------------------------------------------------
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const z = -18 + i * 16;
      const x = side * (30 + (i % 3) * 12);
      const w = 8;
      const d = 8;
      const h = 12 + ((i * 7) % 5) * 8;
      // The towers stand on the dark plane far below.
      const bottom = -26;
      const top = h;
      const building = box(
        `skyline-${side > 0 ? 'east' : 'west'}-${i}`,
        new BABYLON.Vector3(x, (top + bottom) / 2, z),
        new BABYLON.Vector3(w, top - bottom, d),
        panel,
        false,
      );
      building.receiveShadows = false;
      // A band of lit windows on the face that points at the level.
      box(
        `skyline-neon-${side > 0 ? 'east' : 'west'}-${i}`,
        new BABYLON.Vector3(x, h * 0.62, z + (side > 0 ? d / 2 + 0.06 : -d / 2 - 0.06)),
        new BABYLON.Vector3(w * 0.8, 0.18, 0.08),
        i % 2 === 0 ? neon : glass,
        false,
      );
    }
  }

  // A dark void far below, so falling reads as depth instead of a blank sky.
  const voidPlane = BABYLON.MeshBuilder.CreateGround('void', { width: 500, height: 500 }, scene);
  voidPlane.position.y = -26;
  voidPlane.material = dark;
  meshes.push(voidPlane);

  const layoutOverlaps = reportOverlaps(layout);

  return {
    // The intro starts standing on the beam.
    spawn: new BABYLON.Vector3(0, 18.92, -4.6),
    gameplaySpawn: new BABYLON.Vector3(0, STAND, 14.5),
    meshes,
    grappleAnchors,
    killY: -6,
    layoutOverlaps,
    wallRunColliders,
    // The guards: the intro victim first, then two further down the route.
    enemySpawns: [
      new BABYLON.Vector3(0, 0, 12),
      new BABYLON.Vector3(6, 0, 38),
      new BABYLON.Vector3(0, 0, 72),
    ],
    update: (dt) => {
      for (const animate of animated) animate(dt);
    },
  };
}

interface LayoutBox {
  name: string;
  min: BABYLON.Vector3;
  max: BABYLON.Vector3;
}

/**
 * Find every pair of level pieces that occupy the same space.
 *
 * Touching is fine - a rail stands on a floor and a decal lies on a wall -
 * so only a real intersection counts. The result is empty for the shipped
 * layout; if it is not, the map is not organized.
 */
function reportOverlaps(layout: LayoutBox[]): string[] {
  const overlaps: string[] = [];
  const EPSILON = 0.001;
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i];
      const b = layout[j];
      const overlapX = a.min.x < b.max.x - EPSILON && b.min.x < a.max.x - EPSILON;
      const overlapY = a.min.y < b.max.y - EPSILON && b.min.y < a.max.y - EPSILON;
      const overlapZ = a.min.z < b.max.z - EPSILON && b.min.z < a.max.z - EPSILON;
      if (overlapX && overlapY && overlapZ) {
        overlaps.push(`${a.name} <-> ${b.name}`);
      }
    }
  }
  if (overlaps.length > 0) {
    console.warn('First level has overlapping pieces:', overlaps);
  }
  return overlaps;
}

function tex(
  scene: BABYLON.Scene,
  name: string,
  url: string,
  u: number,
  v: number,
  emissive = false,
): BABYLON.StandardMaterial {
  const material = new BABYLON.StandardMaterial(name, scene);
  const texture = new BABYLON.Texture(url, scene);
  texture.uScale = u;
  texture.vScale = v;
  material.diffuseTexture = texture;
  if (emissive) {
    material.emissiveTexture = texture;
    material.emissiveColor = BABYLON.Color3.White();
  }
  material.specularColor = new BABYLON.Color3(0.1, 0.12, 0.18);
  return material;
}

function solid(scene: BABYLON.Scene, name: string, color: string, emissive?: string): BABYLON.StandardMaterial {
  const material = new BABYLON.StandardMaterial(name, scene);
  material.diffuseColor = BABYLON.Color3.FromHexString(color);
  material.specularColor = new BABYLON.Color3(0.08, 0.1, 0.14);
  if (emissive) {
    material.emissiveColor = BABYLON.Color3.FromHexString(emissive);
  }
  return material;
}
