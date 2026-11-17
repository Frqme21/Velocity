import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { type GrayboxWorld, type GrappleAnchorPoint } from './graybox';

export interface AssetViewerWorld extends GrayboxWorld {
  /** Animate the moving showcase props. */
  update(dt: number): void;
}

/**
 * A clean, empty showroom: one flat floor and a row of individually labelled
 * assets. Nothing here is the final city — it is the place to approve each
 * texture and prop before they are assembled into a level.
 */
export function createAssetViewer(
  scene: BABYLON.Scene,
  physics: RAPIER.World,
  shadowGenerator?: BABYLON.ShadowGenerator,
): AssetViewerWorld {
  const meshes: BABYLON.AbstractMesh[] = [];
  const grappleAnchors: GrappleAnchorPoint[] = [];
  const animated: Array<(dt: number) => void> = [];

  const gridMat = textured(scene, 'viewer-floor-grid', '/textures/floor_grid.png', 24, 24);
  const tileMat = textured(scene, 'viewer-deck', '/textures/floor_tiles.png', 2, 2);
  const panelMat = textured(scene, 'viewer-panel-wall', '/textures/panel_wall.png', 2, 1);
  const hazardMat = textured(scene, 'viewer-hazard', '/textures/hazard_stripes.png', 2, 1);
  const climbMat = textured(scene, 'viewer-climb', '/textures/climb_chevrons.png', 2, 1);
  const metalMat = textured(scene, 'viewer-metal', '/textures/rail_metal.png', 2, 1);
  const neonMat = textured(scene, 'viewer-neon', '/textures/neon_strip.png', 1, 1, true);
  const darkMat = plain(scene, 'viewer-dark', '#151b2b');

  // --- The one and only floor ---------------------------------------------
  const floor = BABYLON.MeshBuilder.CreateGround('viewer-floor', { width: 200, height: 200 }, scene);
  floor.material = gridMat;
  floor.receiveShadows = true;
  meshes.push(floor);
  const floorBody = physics.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0),
  );
  physics.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.1, 100), floorBody);

  const box = (
    name: string,
    pos: BABYLON.Vector3,
    size: BABYLON.Vector3,
    material: BABYLON.Material,
    collide = true,
  ) => {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width: size.x,
      height: size.y,
      depth: size.z,
    }, scene);
    mesh.position.copyFrom(pos);
    mesh.material = material;
    mesh.receiveShadows = true;
    shadowGenerator?.addShadowCaster(mesh);
    meshes.push(mesh);

    if (collide) {
      const body = physics.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
      );
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2),
        body,
      );
    }
    return mesh;
  };

  const cylinder = (
    name: string,
    pos: BABYLON.Vector3,
    height: number,
    diameter: number,
    material: BABYLON.Material,
  ) => {
    const mesh = BABYLON.MeshBuilder.CreateCylinder(name, {
      height,
      diameter,
      tessellation: 12,
    }, scene);
    mesh.position.copyFrom(pos);
    mesh.material = material;
    shadowGenerator?.addShadowCaster(mesh);
    meshes.push(mesh);
    return mesh;
  };

  const label = (text: string, pos: BABYLON.Vector3) => {
    const plane = BABYLON.MeshBuilder.CreatePlane(`label-${text}`, {
      width: 5.2,
      height: 1.05,
    }, scene);
    plane.position.copyFrom(pos);
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    const texture = new BABYLON.DynamicTexture(`label-tex-${text}`, {
      width: 640,
      height: 128,
    }, scene, false);
    texture.drawText(text, null, 82, 'bold 42px monospace', '#d9faff', '#0b1424', true);
    const mat = new BABYLON.StandardMaterial(`label-mat-${text}`, scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.emissiveColor = BABYLON.Color3.White();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    plane.material = mat;
    meshes.push(plane);
  };

  // --- Railings ------------------------------------------------------------
  const railing = (name: string, x: number, z: number, length: number, neon: boolean) => {
    const mat = neon ? neonMat : metalMat;
    box(`${name}-top`, new BABYLON.Vector3(x, 1.2, z), new BABYLON.Vector3(length, 0.12, 0.16), mat, false);
    box(`${name}-mid`, new BABYLON.Vector3(x, 0.7, z), new BABYLON.Vector3(length, 0.08, 0.10), mat, false);
    for (let i = 0; i <= 4; i++) {
      const px = x - length / 2 + (length / 4) * i;
      box(`${name}-post-${i}`, new BABYLON.Vector3(px, 0.6, z), new BABYLON.Vector3(0.12, 1.2, 0.12), metalMat, false);
    }
    // One low collider keeps the player from walking through the showcase.
    box(`${name}-collider`, new BABYLON.Vector3(x, 0.7, z), new BABYLON.Vector3(length, 1.4, 0.2), darkMat);
  };
  railing('neon-railing', -13, -8, 9, true);
  railing('industrial-railing', 13, 4, 9, false);
  label('1  NEON RAILING', new BABYLON.Vector3(-13, 3.2, -8));
  label('6  INDUSTRIAL RAILING', new BABYLON.Vector3(13, 3.2, 4));

  // --- Special walls: texture tells you what to do with them --------------
  box('hazard-wall', new BABYLON.Vector3(0, 1.75, -8), new BABYLON.Vector3(7, 3.5, 0.5), hazardMat);
  label('2  HAZARD WALL - DO NOT CLIMB', new BABYLON.Vector3(0, 4.4, -8));

  box('panel-wall', new BABYLON.Vector3(-13, 2, 4), new BABYLON.Vector3(7, 4, 0.5), panelMat);
  label('5  CYBER PANEL WALL', new BABYLON.Vector3(-13, 4.6, 4));

  const climbWall = box('climb-wall', new BABYLON.Vector3(0, 2.5, 4), new BABYLON.Vector3(7, 5, 0.5), climbMat);
  label('4  CHEVRON WALL - MANTLE / WALLRUN', new BABYLON.Vector3(0, 5.6, 4));
  // A step in front of the chevron wall makes the mantle readable.
  box('climb-step', new BABYLON.Vector3(0, 0.75, 6.2), new BABYLON.Vector3(3, 1.5, 1.6), tileMat);
  climbWall.receiveShadows = true;

  // --- Zipline: two poles, a cable and grapple rings ----------------------
  const zipStart = new BABYLON.Vector3(9, 6, -8);
  const zipEnd = new BABYLON.Vector3(17, 6, -8);
  cylinder('zip-pole-a', new BABYLON.Vector3(9, 3, -8), 6, 0.35, metalMat);
  cylinder('zip-pole-b', new BABYLON.Vector3(17, 3, -8), 6, 0.35, metalMat);
  const cable = BABYLON.MeshBuilder.CreateTube('zip-cable', {
    path: [zipStart, zipEnd],
    radius: 0.045,
    tessellation: 8,
  }, scene);
  cable.material = metalMat;
  meshes.push(cable);
  const trolley = box('zip-trolley', new BABYLON.Vector3(13, 5.65, -8), new BABYLON.Vector3(0.7, 0.35, 0.35), neonMat, false);
  animated.push((dt) => {
    trolley.position.x = 13 + Math.sin(performance.now() * 0.0009) * 3;
  });
  grappleAnchors.push(
    { position: zipStart.clone(), landing: new BABYLON.Vector3(9, 0, -5) },
    { position: zipEnd.clone(), landing: new BABYLON.Vector3(17, 0, -5) },
  );
  label('3  ZIPLINE + GRAPPLE RINGS', new BABYLON.Vector3(13, 7.6, -8));

  // --- Moving props --------------------------------------------------------
  const fanHub = cylinder('fan-hub', new BABYLON.Vector3(-13, 2.6, 16), 0.4, 0.7, darkMat);
  const blades: BABYLON.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const blade = box(`fan-blade-${i}`, new BABYLON.Vector3(-13, 2.6, 16), new BABYLON.Vector3(0.35, 3.2, 0.2), metalMat, false);
    blade.rotation.z = (i * Math.PI) / 4;
    blades.push(blade);
  }
  animated.push((_dt) => {
    const spin = performance.now() * 0.0016;
    for (const blade of blades) blade.rotation.z = spin + blades.indexOf(blade) * (Math.PI / 4);
  });
  fanHub.receiveShadows = true;
  label('7  SPINNING FAN (MOVING)', new BABYLON.Vector3(-13, 5.2, 16));

  const gateA = box('gate-a', new BABYLON.Vector3(10.6, 2, 16), new BABYLON.Vector3(2.4, 4, 0.4), hazardMat, false);
  const gateB = box('gate-b', new BABYLON.Vector3(15.4, 2, 16), new BABYLON.Vector3(2.4, 4, 0.4), hazardMat, false);
  animated.push((_dt) => {
    const open = (Math.sin(performance.now() * 0.0012) + 1) * 0.5;
    gateA.position.x = 10.6 - open * 2.4;
    gateB.position.x = 15.4 + open * 2.4;
  });
  label('8  SLIDING GATE (MOVING)', new BABYLON.Vector3(13, 5.2, 16));

  // --- Different floor: a raised deck with a ramp up to it ----------------
  box('raised-deck', new BABYLON.Vector3(0, 1.4, 16), new BABYLON.Vector3(8, 0.4, 8), tileMat);
  const ramp = box('deck-ramp', new BABYLON.Vector3(0, 0.75, 21), new BABYLON.Vector3(4, 0.25, 4), tileMat, false);
  ramp.rotation.x = -0.35;
  grappleAnchors.push({
    position: new BABYLON.Vector3(0, 6, 16),
    landing: new BABYLON.Vector3(0, 1.6, 16),
  });
  label('9  RAISED DECK + GRAPPLE RING', new BABYLON.Vector3(0, 4.2, 16));

  // --- A neon strip to judge the emissive texture -------------------------
  box('neon-banner', new BABYLON.Vector3(0, 3.4, 28), new BABYLON.Vector3(9, 1.2, 0.3), neonMat, false);
  label('10  EMISSIVE NEON STRIP', new BABYLON.Vector3(0, 5.2, 28));

  return {
    spawn: new BABYLON.Vector3(0, 1, -25),
    meshes,
    grappleAnchors,
    enemySpawns: [],
    update: (dt: number) => {
      for (const animate of animated) animate(dt);
    },
  };
}

function textured(
  scene: BABYLON.Scene,
  name: string,
  url: string,
  uScale: number,
  vScale: number,
  emissive = false,
): BABYLON.StandardMaterial {
  const material = new BABYLON.StandardMaterial(name, scene);
  const texture = new BABYLON.Texture(url, scene);
  texture.uScale = uScale;
  texture.vScale = vScale;
  material.diffuseTexture = texture;
  if (emissive) {
    material.emissiveTexture = texture;
    material.emissiveColor = BABYLON.Color3.White();
  }
  material.specularColor = new BABYLON.Color3(0.08, 0.1, 0.14);
  return material;
}

function plain(scene: BABYLON.Scene, name: string, color: string): BABYLON.StandardMaterial {
  const material = new BABYLON.StandardMaterial(name, scene);
  material.diffuseColor = BABYLON.Color3.FromHexString(color);
  material.specularColor = BABYLON.Color3.Black();
  return material;
}
