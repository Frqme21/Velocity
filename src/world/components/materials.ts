import * as BABYLON from '@babylonjs/core';

/** Textures that should glow on their own (emissive). */
const EMISSIVE = new Set([
  'sign_neon',
  'window_lit',
  'billboard_ads',
  'circuit_board',
  'server_rack',
]);

/**
 * A shared material registry used by both the editor and the game loader so
 * that a level exported from the editor copies 1:1 into the game.
 *
 * Materials are keyed by texture filename (e.g. `concrete_wall`) and cached,
 * so placing the same prop many times only creates one material and one
 * texture.
 */
export class MaterialRegistry {
  private scene: BABYLON.Scene;
  private materials = new Map<string, BABYLON.StandardMaterial>();
  private plainMaterials = new Map<string, BABYLON.StandardMaterial>();

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  /**
   * Get (or create) a textured material for `/textures/<name>.png`.
   *
   * @param name Texture filename without extension, e.g. `concrete_wall`.
   * @param uScale / vScale Texture tiling (default 1,1).
   * @param emissive Whether the texture is self-illuminated.
   */
  get(
    name: string,
    uScale = 1,
    vScale = 1,
    emissive?: boolean,
  ): BABYLON.StandardMaterial {
    const key = `${name}:${uScale}:${vScale}:${emissive ? 1 : 0}`;
    let mat = this.materials.get(key);
    if (mat) return mat;

    mat = new BABYLON.StandardMaterial(`mat-${name}`, this.scene);
    const tex = new BABYLON.Texture(`/textures/${name}.png`, this.scene);
    tex.uScale = uScale;
    tex.vScale = vScale;
    mat.diffuseTexture = tex;

    if (emissive ?? EMISSIVE.has(name)) {
      mat.emissiveTexture = mat.diffuseTexture;
      mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
      mat.disableLighting = true;
    }
    mat.backFaceCulling = false;
    this.materials.set(key, mat);
    return mat;
  }

  /** Get (or create) a plain solid-colour material (cached by hex string). */
  getPlain(color: string): BABYLON.StandardMaterial {
    let mat = this.plainMaterials.get(color);
    if (mat) return mat;
    mat = new BABYLON.StandardMaterial(`mat-plain-${color}`, this.scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString(color);
    mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    this.plainMaterials.set(color, mat);
    return mat;
  }

  /** Dispose all cached materials and their textures. */
  dispose() {
    for (const mat of this.materials.values()) {
      mat.dispose();
    }
    for (const mat of this.plainMaterials.values()) {
      mat.dispose();
    }
    this.materials.clear();
    this.plainMaterials.clear();
  }
}
