import * as BABYLON from '@babylonjs/core';

/** How many samples the trail ribbon can hold. */
const MAX_SAMPLES = 40;

const VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void) {
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

/**
 * The slash shader.
 *
 * `v` runs across the ribbon (0 and 1 are the two edges of the light) and
 * `u` runs along the trail (0 = the faded tail, 1 = the hot head). That
 * gives a thin white core with a coloured glow around it, brightest at the
 * blade tip and fading out behind it.
 */
const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUV;
uniform vec3 uCoreColor;
uniform vec3 uEdgeColor;
uniform float uAlpha;
void main(void) {
  float across = clamp(abs(vUV.y * 2.0 - 1.0), 0.0, 1.0);
  float along = clamp(vUV.x, 0.0, 1.0);

  float core = pow(1.0 - across, 6.0);
  float glow = pow(1.0 - across, 1.7);
  float tail = pow(along, 0.9);
  float flash = smoothstep(0.82, 1.0, along) * core;

  vec3 color = mix(uEdgeColor, uCoreColor, core);
  float intensity = (glow * 0.30 + core * 1.8 + flash * 1.4) * tail;

  gl_FragColor = vec4(color * intensity, uAlpha);
}
`;

/**
 * The laser-like slash the katana paints through the air.
 *
 * The trail is a ribbon built from scratch every frame: two edges around
 * the path the blade tip travelled, with a shader that turns it into a
 * hot white core with a coloured glow. No extra model files involved.
 */
export class SlashTrail {
  private scene: BABYLON.Scene;
  private mesh: BABYLON.Mesh;
  private material: BABYLON.ShaderMaterial;
  private positions = new Float32Array(MAX_SAMPLES * 2 * 3);
  private uvs = new Float32Array(MAX_SAMPLES * 2 * 2);
  private width: number;

  constructor(
    scene: BABYLON.Scene,
    camera: BABYLON.Camera,
    width: number,
    coreColor: BABYLON.Color3,
    edgeColor: BABYLON.Color3,
  ) {
    this.scene = scene;
    this.width = width;

    const material = new BABYLON.ShaderMaterial(
      'katana-slash-trail-material',
      scene,
      { vertexSource: VERTEX_SHADER, fragmentSource: FRAGMENT_SHADER },
      {
        attributes: ['position', 'uv'],
        uniforms: ['worldViewProjection', 'uCoreColor', 'uEdgeColor', 'uAlpha'],
        needAlphaBlending: true,
      },
    );
    material.setColor3('uCoreColor', coreColor);
    material.setColor3('uEdgeColor', edgeColor);
    material.setFloat('uAlpha', 0);
    material.backFaceCulling = false;
    // Additive blending: the trail adds light to whatever is behind it.
    material.alphaMode = BABYLON.Constants.ALPHA_ADD;

    const mesh = new BABYLON.Mesh('katana-slash-trail', scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = this.positions;
    vertexData.uvs = this.uvs;
    vertexData.indices = buildIndices();
    vertexData.applyToMesh(mesh, true);

    mesh.material = material;
    // The trail lives in camera space, exactly like the viewmodel.
    mesh.parent = camera;
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.setEnabled(false);

    this.mesh = mesh;
    this.material = material;
  }

  /**
   * Draw the trail through the given points.
   *
   * The points are in camera space and ordered from the tail of the slash
   * to the head (the current blade tip).
   */
  setPath(points: BABYLON.Vector3[], alpha: number) {
    const count = Math.min(points.length, MAX_SAMPLES);
    if (count < 2 || alpha <= 0) {
      this.hide();
      return;
    }

    const positions = this.positions;
    const uvs = this.uvs;
    const half = this.width * 0.5;

    let previous = points[0];
    for (let i = 0; i < count; i++) {
      const point = points[i];
      const next = points[Math.min(i + 1, count - 1)];

      // The band is always perpendicular to the path inside the screen
      // plane, so the trail always faces the player.
      let dx = next.x - previous.x;
      let dy = next.y - previous.y;
      const length = Math.hypot(dx, dy);
      if (length > 1e-6) {
        dx /= length;
        dy /= length;
      } else {
        dx = 1;
        dy = 0;
      }
      const offsetX = -dy * half;
      const offsetY = dx * half;

      const vertex = i * 6;
      positions[vertex] = point.x - offsetX;
      positions[vertex + 1] = point.y - offsetY;
      positions[vertex + 2] = point.z;
      positions[vertex + 3] = point.x + offsetX;
      positions[vertex + 4] = point.y + offsetY;
      positions[vertex + 5] = point.z;

      const u = i / (count - 1);
      const uv = i * 4;
      uvs[uv] = u;
      uvs[uv + 1] = 0;
      uvs[uv + 2] = u;
      uvs[uv + 3] = 1;

      previous = point;
    }

    // Collapse the unused samples onto the head so the ribbon keeps its
    // shape while it is still short.
    const head = points[count - 1];
    for (let i = count; i < MAX_SAMPLES; i++) {
      const vertex = i * 6;
      positions[vertex] = head.x;
      positions[vertex + 1] = head.y;
      positions[vertex + 2] = head.z;
      positions[vertex + 3] = head.x;
      positions[vertex + 4] = head.y;
      positions[vertex + 5] = head.z;

      const uv = i * 4;
      uvs[uv] = 1;
      uvs[uv + 1] = 0;
      uvs[uv + 2] = 1;
      uvs[uv + 3] = 1;
    }

    this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions, false, false);
    this.mesh.updateVerticesData(BABYLON.VertexBuffer.UVKind, uvs, false, false);
    this.material.setFloat('uAlpha', alpha);
    this.mesh.setEnabled(true);
  }

  /** Hide the trail. */
  hide() {
    this.mesh.setEnabled(false);
  }

  /** Release the trail. */
  dispose() {
    this.mesh.dispose();
    this.material.dispose();
    this.scene = null as unknown as BABYLON.Scene;
  }
}

/** Two triangles per segment of the ribbon. */
function buildIndices(): number[] {
  const indices: number[] = [];
  for (let i = 0; i < MAX_SAMPLES - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return indices;
}
