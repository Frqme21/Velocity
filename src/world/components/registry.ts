import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { MaterialRegistry } from './materials';
import { type GrappleAnchorPoint } from '../maps/graybox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentType =
  | 'box'
  | 'wall'
  | 'floor'
  | 'ramp'
  | 'concrete_wall'
  | 'brick_wall'
  | 'corrugated_metal'
  | 'rusted_metal'
  | 'scratched_metal'
  | 'cracked_concrete'
  | 'concrete_floor'
  | 'grate_floor'
  | 'asphalt'
  | 'white_tiles'
  | 'dirty_tiles'
  | 'rooftop_gravel'
  | 'plastic_crate'
  | 'cardboard_box'
  | 'wooden_crate'
  | 'barrel'
  | 'dumpster'
  | 'trash_bag'
  | 'sign_blank'
  | 'sign_neon'
  | 'graffiti'
  | 'poster'
  | 'air_vent'
  | 'duct_metal'
  | 'pipe_metal'
  | 'window_lit'
  | 'window_dark'
  | 'billboard_ads'
  | 'circuit_board'
  | 'server_rack'
  | 'chainlink'
  | 'mesh_fence'
  | 'caution_stripe'
  | 'scaffolding'
  | 'cable_bundle'
  | 'grappleAnchor'
  | 'enemySpawn'
  | 'playerSpawn'
  | 'light';

export interface ComponentProps {
  id: string;
  type: ComponentType;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler (pitch, yaw, roll)
  scale: [number, number, number];
  /** Texture filename without extension, or undefined for plain grey. */
  material?: string;
  uScale?: number;
  vScale?: number;
  collide?: boolean;
}

export interface ComponentBuildResult {
  meshes: BABYLON.AbstractMesh[];
  body?: RAPIER.RigidBody;
  collider?: RAPIER.Collider;
  anchor?: GrappleAnchorPoint;
  spawn?: BABYLON.Vector3;
  light?: BABYLON.Light;
}

export interface ComponentDef {
  type: ComponentType;
  label: string;
  category: string;
  defaultScale: [number, number, number];
  defaultMaterial?: string;
  defaultTiling?: [number, number];
  build(
    scene: BABYLON.Scene,
    physics: RAPIER.World,
    registry: MaterialRegistry,
    props: ComponentProps,
    shadowGenerator?: BABYLON.ShadowGenerator,
  ): ComponentBuildResult;
}

export interface LevelData {
  name: string;
  spawn: [number, number, number];
  gameplaySpawn?: [number, number, number];
  killY: number;
  components: ComponentProps[];
  grappleAnchors: Array<{ position: [number, number, number]; landing: [number, number, number] }>;
  enemySpawns: [number, number, number][];
  lights?: Array<{ position: [number, number, number]; intensity?: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMISSIVE_TEXTURES = new Set([
  'sign_neon',
  'window_lit',
  'billboard_ads',
  'circuit_board',
  'server_rack',
]);

const PLAIN_TYPES = new Set(['box', 'wall', 'floor', 'ramp']);

function defaultMaterialFor(type: ComponentType): string | undefined {
  if (PLAIN_TYPES.has(type)) return undefined;
  return type; // assumes a matching texture exists
}

function isEmissive(material?: string): boolean {
  return Boolean(material && EMISSIVE_TEXTURES.has(material));
}

function tilingFor(props: ComponentProps, def: ComponentDef): [number, number] {
  if (props.uScale !== undefined && props.vScale !== undefined) {
    return [props.uScale, props.vScale];
  }
  const [sx, sy, sz] = props.scale;
  const isSurface = def.category === 'Walls' || def.category === 'Floors'
    || props.type === 'wall' || props.type === 'floor';
  if (isSurface) {
    // Tiling follows the real size of the surface: one texture repeat per
    // 4 metres. Horizontal slabs tile along X/Z, vertical walls along X/Y.
    const horizontal = sy <= 1;
    const u = Math.max(1, Math.round(sx / 4));
    const v = Math.max(1, Math.round((horizontal ? sz : sy) / 4));
    return [u, v];
  }
  if (def.defaultTiling) return def.defaultTiling;
  return [1, 1];
}

function materialFor(
  registry: MaterialRegistry,
  props: ComponentProps,
  def: ComponentDef,
): BABYLON.StandardMaterial {
  const name = props.material ?? def.defaultMaterial;
  const [u, v] = tilingFor(props, def);
  if (!name) return registry.getPlain('#586574');
  return registry.get(name, u, v, isEmissive(name));
}

function eulerToQuat(r: [number, number, number]): { x: number; y: number; z: number; w: number } {
  const q = BABYLON.Quaternion.RotationYawPitchRoll(r[1], r[0], r[2]);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function addStaticCollider(
  physics: RAPIER.World,
  position: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number],
) {
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(position[0], position[1], position[2]),
  );
  // Set rotation on the collider descriptor before attaching (same pattern as
  // graybox.ts addBox), not on the body afterwards.
  const q = eulerToQuat(rotation);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    scale[0] / 2,
    scale[1] / 2,
    scale[2] / 2,
  );
  colliderDesc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  const collider = physics.createCollider(colliderDesc, body);
  return { body, collider };
}

function configureMesh(
  mesh: BABYLON.AbstractMesh,
  props: ComponentProps,
  material: BABYLON.Material,
  shadowGenerator?: BABYLON.ShadowGenerator,
) {
  mesh.position.copyFrom(
    new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]),
  );
  mesh.rotation.copyFrom(
    new BABYLON.Vector3(props.rotation[0], props.rotation[1], props.rotation[2]),
  );
  // NOTE: the mesh is created with its final dimensions already (see the
  // CreateBox calls), so NO scaling is applied here. Applying it as well
  // would scale the visuals by scale^2 while the collider stays at scale,
  // making the hitbox look far too small.
  mesh.material = material;
  mesh.receiveShadows = true;
  shadowGenerator?.addShadowCaster(mesh);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ComponentRegistry {
  private defs = new Map<ComponentType, ComponentDef>();

  register(def: ComponentDef) {
    this.defs.set(def.type, def);
  }

  has(type: ComponentType) {
    return this.defs.has(type);
  }

  get(type: ComponentType): ComponentDef | undefined {
    return this.defs.get(type);
  }

  types(): ComponentDef[] {
    return Array.from(this.defs.values());
  }

  build(
    scene: BABYLON.Scene,
    physics: RAPIER.World,
    registry: MaterialRegistry,
    props: ComponentProps,
    shadowGenerator?: BABYLON.ShadowGenerator,
  ): ComponentBuildResult {
    const def = this.defs.get(props.type);
    if (!def) {
      throw new Error(`Unknown component type: ${props.type}`);
    }
    return def.build(scene, physics, registry, props, shadowGenerator);
  }
}

// ---------------------------------------------------------------------------
// Built-in component definitions
// ---------------------------------------------------------------------------

export function buildDefaultRegistry(): ComponentRegistry {
  const registry = new ComponentRegistry();

  // --- Surface (wall / floor): thin box, textured, tiled -----------------
  const surface = (
    type: ComponentType,
    label: string,
    category: string,
    defaultScale: [number, number, number],
    defaultMaterial?: string,
    defaultTiling: [number, number] = [1, 1],
  ) => {
    const def: ComponentDef = {
      type,
      label,
      category,
      defaultScale,
      defaultMaterial,
      defaultTiling,
      build: (scene, physics, reg, props, shadowGenerator) => {
        const meshes: BABYLON.AbstractMesh[] = [];
        const mesh = BABYLON.MeshBuilder.CreateBox(props.id, {
          width: props.scale[0],
          height: props.scale[1],
          depth: props.scale[2],
        }, scene);
        configureMesh(mesh, props, materialFor(reg, props, def), shadowGenerator);
        meshes.push(mesh);
        const result: ComponentBuildResult = { meshes };
        if (props.collide !== false) {
          const c = addStaticCollider(physics, props.position, props.scale, props.rotation);
          result.body = c.body;
          result.collider = c.collider;
        }
        return result;
      },
    };
    registry.register(def);
  };

  surface('wall', 'Wall', 'Geometry', [8, 4, 0.4], undefined, [2, 2]);
  surface('concrete_wall', 'Concrete Wall', 'Walls', [8, 4, 0.4], 'concrete_wall', [2, 2]);
  surface('floor', 'Floor', 'Floors', [16, 0.4, 16], undefined, [4, 4]);
  surface('brick_wall', 'Brick Wall', 'Walls', [8, 4, 0.4], 'brick_wall', [2, 2]);
  surface('corrugated_metal', 'Corrugated Metal', 'Walls', [8, 4, 0.4], 'corrugated_metal', [2, 2]);
  surface('rusted_metal', 'Rusted Metal', 'Walls', [8, 4, 0.4], 'rusted_metal', [2, 2]);
  surface('scratched_metal', 'Scratched Metal', 'Walls', [8, 4, 0.4], 'scratched_metal', [2, 2]);
  surface('cracked_concrete', 'Cracked Concrete', 'Walls', [8, 4, 0.4], 'cracked_concrete', [2, 2]);
  surface('graffiti', 'Graffiti Wall', 'Walls', [8, 4, 0.4], 'graffiti', [2, 2]);

  surface('concrete_floor', 'Concrete Floor', 'Floors', [16, 0.4, 16], 'concrete_floor', [4, 4]);
  surface('grate_floor', 'Grate Floor', 'Floors', [16, 0.4, 16], 'grate_floor', [4, 4]);
  surface('asphalt', 'Asphalt', 'Floors', [16, 0.4, 16], 'asphalt', [4, 4]);
  surface('white_tiles', 'White Tiles', 'Floors', [16, 0.4, 16], 'white_tiles', [4, 4]);
  surface('dirty_tiles', 'Dirty Tiles', 'Floors', [16, 0.4, 16], 'dirty_tiles', [4, 4]);
  surface('rooftop_gravel', 'Rooftop Gravel', 'Floors', [16, 0.4, 16], 'rooftop_gravel', [4, 4]);

  // --- Box / ramp ----------------------------------------------------------
  registry.register({
    type: 'box',
    label: 'Box',
    category: 'Geometry',
    defaultScale: [2, 2, 2],
    build: (scene, physics, reg, props, shadowGenerator) => {
      const meshes: BABYLON.AbstractMesh[] = [];
      const mesh = BABYLON.MeshBuilder.CreateBox(props.id, {
        width: props.scale[0], height: props.scale[1], depth: props.scale[2],
      }, scene);
      configureMesh(mesh, props, materialFor(reg, props, defBox), shadowGenerator);
      meshes.push(mesh);
      const result: ComponentBuildResult = { meshes };
      if (props.collide !== false) {
        const c = addStaticCollider(physics, props.position, props.scale, props.rotation);
        result.body = c.body;
        result.collider = c.collider;
      }
      return result;
    },
  });
  const defBox = registry.get('box')!;

  registry.register({
    type: 'ramp',
    label: 'Ramp',
    category: 'Geometry',
    defaultScale: [8, 0.4, 4],
    build: (scene, physics, reg, props, shadowGenerator) => {
      const meshes: BABYLON.AbstractMesh[] = [];
      const angle = Math.atan2(props.scale[1], props.scale[0]);
      const mesh = BABYLON.MeshBuilder.CreateBox(props.id, {
        width: props.scale[0],
        height: 0.25,
        depth: props.scale[2],
      }, scene);
      mesh.position.copyFrom(new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]));
      mesh.rotation.y = props.rotation[1];
      mesh.rotation.z = angle;
      // No extra scaling: the box is already created at its final size.
      mesh.material = materialFor(reg, props, defRamp);
      mesh.receiveShadows = true;
      shadowGenerator?.addShadowCaster(mesh);
      meshes.push(mesh);
      const result: ComponentBuildResult = { meshes };
      if (props.collide !== false) {
        const body = physics.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(props.position[0], props.position[1], props.position[2]),
        );
        const collider = physics.createCollider(
          RAPIER.ColliderDesc.cuboid(props.scale[0] / 2, 0.125, props.scale[2] / 2),
          body,
        );
        collider.setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) });
        result.body = body;
        result.collider = collider;
      }
      return result;
    },
  });
  const defRamp = registry.get('ramp')!;

  // --- Textured box props --------------------------------------------------
  const prop = (
    type: ComponentType,
    label: string,
    defaultScale: [number, number, number],
    category = 'Props',
  ) => {
    const def: ComponentDef = {
      type, label, category, defaultScale, defaultMaterial: type,
      build: (scene, physics, reg, props, shadowGenerator) => {
        const meshes: BABYLON.AbstractMesh[] = [];
        const mesh = BABYLON.MeshBuilder.CreateBox(props.id, {
          width: props.scale[0], height: props.scale[1], depth: props.scale[2],
        }, scene);
        configureMesh(mesh, props, materialFor(reg, props, def), shadowGenerator);
        meshes.push(mesh);
        const result: ComponentBuildResult = { meshes };
        if (props.collide !== false) {
          const c = addStaticCollider(physics, props.position, props.scale, props.rotation);
          result.body = c.body;
          result.collider = c.collider;
        }
        return result;
      },
    };
    registry.register(def);
  };

  prop('plastic_crate', 'Plastic Crate', [1.2, 1.2, 1.2]);
  prop('cardboard_box', 'Cardboard Box', [1.6, 1.2, 1.2]);
  prop('wooden_crate', 'Wooden Crate', [1.6, 1.6, 1.6]);
  prop('barrel', 'Barrel', [1.2, 1.6, 1.2]);
  prop('dumpster', 'Dumpster', [2.4, 1.4, 1.2]);
  prop('trash_bag', 'Trash Bag', [0.8, 1.0, 0.8]);
  prop('pipe_metal', 'Pipe', [4, 1, 1], 'Fixtures');
  prop('duct_metal', 'Duct', [4, 1, 1], 'Fixtures');
  prop('server_rack', 'Server Rack', [0.6, 2, 1], 'Fixtures');
  prop('scaffolding', 'Scaffolding', [2, 4, 1], 'Fixtures');
  prop('cable_bundle', 'Cable Bundle', [0.4, 2, 0.4], 'Fixtures');

  // --- Thin plates (signs, vents, windows, posters, fences) ----------------
  const plate = (
    type: ComponentType,
    label: string,
    defaultScale: [number, number, number],
    category = 'Signs',
  ) => {
    const def: ComponentDef = {
      type, label, category, defaultScale, defaultMaterial: type,
      build: (scene, physics, reg, props, shadowGenerator) => {
        const meshes: BABYLON.AbstractMesh[] = [];
        const thick = Math.max(0.05, props.scale[2] * 0.05);
        const mesh = BABYLON.MeshBuilder.CreateBox(props.id, {
          width: props.scale[0],
          height: props.scale[1],
          depth: thick,
        }, scene);
        configureMesh(mesh, props, materialFor(reg, props, def), shadowGenerator);
        meshes.push(mesh);
        const result: ComponentBuildResult = { meshes };
        if (props.collide !== false) {
          const c = addStaticCollider(
            physics,
            props.position,
            [props.scale[0], props.scale[1], thick],
            props.rotation,
          );
          result.body = c.body;
          result.collider = c.collider;
        }
        return result;
      },
    };
    registry.register(def);
  };

  plate('sign_blank', 'Blank Sign', [3, 2, 0.2]);
  plate('sign_neon', 'Neon Sign', [3, 2, 0.2]);
  plate('poster', 'Poster', [2, 3, 0.1]);
  plate('air_vent', 'Air Vent', [1, 1, 0.2], 'Fixtures');
  plate('window_lit', 'Lit Window', [2, 3, 0.2], 'Fixtures');
  plate('window_dark', 'Dark Window', [2, 3, 0.2], 'Fixtures');
  plate('billboard_ads', 'Billboard', [8, 4, 0.4], 'Fixtures');
  plate('circuit_board', 'Circuit Board', [2, 2, 0.2], 'Fixtures');
  plate('chainlink', 'Chainlink Fence', [4, 3, 0.2], 'Fences');
  plate('mesh_fence', 'Mesh Fence', [4, 3, 0.2], 'Fences');
  plate('caution_stripe', 'Caution Stripe', [2, 0.4, 0.2], 'Fixtures');

  // --- Markers -------------------------------------------------------------
  registry.register({
    type: 'grappleAnchor',
    label: 'Grapple Anchor',
    category: 'Markers',
    defaultScale: [1, 1, 1],
    build: (scene, physics, reg, props, shadowGenerator) => {
      const meshes: BABYLON.AbstractMesh[] = [];
      const ring = BABYLON.MeshBuilder.CreateTorus(props.id, {
        diameter: 0.9, thickness: 0.12, tessellation: 24,
      }, scene);
      ring.position.copyFrom(new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]));
      ring.rotation.copyFrom(new BABYLON.Vector3(props.rotation[0], props.rotation[1], props.rotation[2]));
      ring.scaling.copyFrom(new BABYLON.Vector3(props.scale[0], props.scale[1], props.scale[2]));
      ring.material = reg.getPlain('#8fffb6');
      ring.receiveShadows = true;
      shadowGenerator?.addShadowCaster(ring);
      meshes.push(ring);
      return {
        meshes,
        anchor: {
          position: new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]),
          landing: new BABYLON.Vector3(props.position[0], props.position[1] + 0.5, props.position[2]),
        },
      };
    },
  });

  registry.register({
    type: 'enemySpawn',
    label: 'Enemy Spawn',
    category: 'Markers',
    defaultScale: [1, 1, 1],
    build: (scene, physics, reg, props, shadowGenerator) => {
      const meshes: BABYLON.AbstractMesh[] = [];
      const marker = BABYLON.MeshBuilder.CreateSphere(props.id, { diameter: 0.6, segments: 12 }, scene);
      marker.position.copyFrom(new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]));
      marker.material = reg.getPlain('#ff7bd0');
      marker.receiveShadows = true;
      shadowGenerator?.addShadowCaster(marker);
      meshes.push(marker);
      return {
        meshes,
        spawn: new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]),
      };
    },
  });

  registry.register({
    type: 'playerSpawn',
    label: 'Player Spawn',
    category: 'Markers',
    defaultScale: [1, 1, 1],
    build: (scene, physics, reg, props, shadowGenerator) => {
      const meshes: BABYLON.AbstractMesh[] = [];
      const marker = BABYLON.MeshBuilder.CreateSphere(props.id, { diameter: 0.7, segments: 12 }, scene);
      marker.position.copyFrom(new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]));
      marker.material = reg.getPlain('#7ef4ff');
      marker.receiveShadows = true;
      shadowGenerator?.addShadowCaster(marker);
      meshes.push(marker);
      return {
        meshes,
        spawn: new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]),
      };
    },
  });

  registry.register({
    type: 'light',
    label: 'Point Light',
    category: 'Markers',
    defaultScale: [1, 1, 1],
    build: (scene, _physics, _reg, props) => {
      const light = new BABYLON.PointLight(props.id, new BABYLON.Vector3(props.position[0], props.position[1], props.position[2]), scene);
      light.intensity = (props as any).intensity ?? 1.0;
      return { meshes: [], light };
    },
  });

  return registry;
}
