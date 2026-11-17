import * as BABYLON from '@babylonjs/core';

/** One bright arc in flight. */
interface SliceArcEntry {
  mesh: BABYLON.Mesh;
  life: number;
  maxLife: number;
  /** How much the arc has grown, 0 = just spawned, 1 = fully open. */
  growth: number;
}

/** How a slice arc should look. */
export interface SliceArcOptions {
  /** The colour of the hot core. */
  color?: BABYLON.Color3;
  /** How wide the arc opens, in metres. */
  radius?: number;
  /** How thick the arc is, in metres. */
  thickness?: number;
  /** How long the arc lives, in seconds. */
  duration?: number;
  /** How far the arc sweeps, in degrees. */
  sweep?: number;
}

/**
 * The bright arc that flashes where the blade went through something.
 *
 * A slash on its own is hard to read at speed, so a hit gets its own
 * light: a hot crescent that opens up and fades in a fraction of a
 * second. It sits in the plane the player is looking along, so it always
 * reads as a cut across the target.
 */
export class SliceArc {
  private scene: BABYLON.Scene;
  private arcs: SliceArcEntry[] = [];
  private material: BABYLON.StandardMaterial;

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;

    this.material = new BABYLON.StandardMaterial('slice-arc', scene);
    this.material.diffuseColor = BABYLON.Color3.Black();
    this.material.specularColor = BABYLON.Color3.Black();
    this.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
    this.material.disableLighting = true;
    this.material.alphaMode = BABYLON.Constants.ALPHA_ADD;
  }

  /**
   * Flash a slice arc.
   *
   * @param point where the cut happened, in world space
   * @param right the camera's right vector - the arc sweeps across it
   * @param up the camera's up vector
   */
  pop(
    point: BABYLON.Vector3,
    right: BABYLON.Vector3,
    up: BABYLON.Vector3,
    options: SliceArcOptions = {},
  ) {
    const color = options.color ?? new BABYLON.Color3(1, 1, 1);
    const radius = options.radius ?? 1.4;
    const thickness = options.thickness ?? 0.06;
    const duration = options.duration ?? 0.22;
    const sweep = options.sweep ?? 150;

    // The arc sweeps from the lower right up to the upper left, the same
    // way the katana does.
    const half = (sweep * Math.PI) / 360;
    const path: BABYLON.Vector3[] = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = -half + t * half * 2;
      const pointOnArc = point
        .add(right.scale(Math.sin(angle) * radius))
        .add(up.scale(Math.cos(angle) * radius));
      path.push(pointOnArc);
    }

    const material = this.material.clone(`slice-arc-${Date.now()}`);
    material.emissiveColor = color.clone();

    const mesh = BABYLON.MeshBuilder.CreateTube(
      'slice-arc',
      {
        path,
        radius: thickness,
        tessellation: 8,
        cap: BABYLON.Mesh.NO_CAP,
      },
      this.scene,
    );
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;

    this.arcs.push({ mesh, life: duration, maxLife: duration, growth: 0 });
  }

  /** Advance the arcs and clean up the dead ones. */
  update(dt: number) {
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const arc = this.arcs[i];
      arc.life -= dt;

      if (arc.life <= 0) {
        arc.mesh.material?.dispose();
        arc.mesh.dispose();
        this.arcs.splice(i, 1);
        continue;
      }

      // The arc opens up quickly and then melts away.
      const t = 1 - arc.life / arc.maxLife;
      arc.growth = Math.min(1, t * 3);
      arc.mesh.scaling.setAll(0.6 + arc.growth * 0.6);
      arc.mesh.visibility = Math.max(0, 1 - t * t);
    }
  }

  /** Remove every arc. */
  clear() {
    for (const arc of this.arcs) {
      arc.mesh.material?.dispose();
      arc.mesh.dispose();
    }
    this.arcs = [];
  }
}
