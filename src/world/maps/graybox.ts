import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';

export interface GrayboxWorld {
  spawn: BABYLON.Vector3;
  meshes: BABYLON.AbstractMesh[];
}

interface BoxOptions {
  yaw?: number;
  color?: string;
}

interface RampOptions {
  color?: string;
}

/** Creates the lightweight graybox and matching Rapier static colliders. */
export function createGraybox(
  scene: BABYLON.Scene,
  physics: RAPIER.World,
  shadowGenerator?: BABYLON.ShadowGenerator,
): GrayboxWorld {
  const meshes: BABYLON.AbstractMesh[] = [];
  const floorMaterial = makeMaterial(scene, 'floor', '#3d4650');
  const platformMaterial = makeMaterial(scene, 'platform', '#586574');
  const accentMaterial = makeMaterial(scene, 'accent', '#d69b42');
  const obstacleMaterial = makeMaterial(scene, 'obstacle', '#7b8794');

  const addBox = (
    name: string,
    position: BABYLON.Vector3,
    size: BABYLON.Vector3,
    options: BoxOptions = {},
  ) => {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width: size.x,
      height: size.y,
      depth: size.z,
    }, scene);
    mesh.position.copyFrom(position);
    mesh.rotation.y = options.yaw ?? 0;
    mesh.material = options.color === 'accent'
      ? accentMaterial
      : options.color === 'obstacle'
        ? obstacleMaterial
        : platformMaterial;
    mesh.receiveShadows = true;
    shadowGenerator?.addShadowCaster(mesh);
    meshes.push(mesh);

    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
    const collider = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
    if (options.yaw) {
      collider.setRotation({ x: 0, y: Math.sin(options.yaw / 2), z: 0, w: Math.cos(options.yaw / 2) });
    }
    physics.createCollider(collider, body);
    return mesh;
  };

  const addRamp = (
    name: string,
    position: BABYLON.Vector3,
    width: number,
    length: number,
    rise: number,
    options: RampOptions = {},
  ) => {
    const angle = Math.atan2(rise, length);
    const thickness = 0.25;
    const mesh = BABYLON.MeshBuilder.CreateBox(name, {
      width: length,
      height: thickness,
      depth: width,
    }, scene);
    mesh.position.copyFrom(position);
    mesh.rotation.z = angle;
    mesh.material = options.color === 'accent' ? accentMaterial : platformMaterial;
    mesh.receiveShadows = true;
    shadowGenerator?.addShadowCaster(mesh);
    meshes.push(mesh);

    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
    const collider = RAPIER.ColliderDesc.cuboid(length / 2, thickness / 2, width / 2);
    collider.setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) });
    physics.createCollider(collider, body);
    return mesh;
  };

  // The floor is split into a 6.2m-wide trench. The two wall-run panels sit
  // directly over this trench, leaving an unobstructed route underneath them.
  addBox('main-floor-west', new BABYLON.Vector3(-8.125, -0.25, 0), new BABYLON.Vector3(31.75, 0.5, 48), {
    color: 'floor',
  });
  addBox('main-floor-east', new BABYLON.Vector3(18.975, -0.25, 0), new BABYLON.Vector3(10.05, 0.5, 48), {
    color: 'floor',
  });
  addBox('main-floor-gap-south', new BABYLON.Vector3(10.85, -0.25, -8), new BABYLON.Vector3(6.2, 0.5, 32), {
    color: 'floor',
  });
  addBox('main-floor-gap-north', new BABYLON.Vector3(10.85, -0.25, 23), new BABYLON.Vector3(6.2, 0.5, 2), {
    color: 'floor',
  });

  addBox('wall-north', new BABYLON.Vector3(0, 2, 24), new BABYLON.Vector3(48, 4, 0.5));
  addBox('wall-south', new BABYLON.Vector3(0, 2, -24), new BABYLON.Vector3(48, 4, 0.5));
  addBox('wall-east', new BABYLON.Vector3(24, 2, 0), new BABYLON.Vector3(0.5, 4, 48));
  addBox('wall-west', new BABYLON.Vector3(-24, 2, 0), new BABYLON.Vector3(0.5, 4, 48));

  // Low and high platforms.
  addBox('platform-low', new BABYLON.Vector3(-9, 1, 7), new BABYLON.Vector3(7, 2, 6));
  addBox('platform-high', new BABYLON.Vector3(10, 2.5, -9), new BABYLON.Vector3(8, 5, 7));

  // Stairs to the low platform.
  for (let step = 0; step < 6; step++) {
    const height = (step + 1) * 0.25;
    addBox(
      `stairs-${step}`,
      new BABYLON.Vector3(-5.25 + step * 0.75, height / 2, 10.4),
      new BABYLON.Vector3(0.75, height, 2.2),
    );
  }

  // Ramp to the high platform.
  addRamp('ramp-high', new BABYLON.Vector3(10, 2.5, -2.7), 5, 9, 5);

  // Pillars and cover for general collision and movement testing.
  addBox('pillar-1', new BABYLON.Vector3(-1, 2.5, 1), new BABYLON.Vector3(1.2, 5, 1.2), {
    color: 'obstacle',
  });
  addBox('pillar-2', new BABYLON.Vector3(4, 3, -3), new BABYLON.Vector3(1.2, 6, 1.2), {
    color: 'obstacle',
  });
  addBox('cover-1', new BABYLON.Vector3(-4, 0.65, -7), new BABYLON.Vector3(4, 1.3, 0.8), {
    color: 'accent',
  });
  addBox('cover-2', new BABYLON.Vector3(17, 0.9, 3), new BABYLON.Vector3(3, 1.8, 3), {
    color: 'obstacle',
  });

  // Exactly two parallel vertical panels form the wall-run test bay. Their
  // inner faces are 5.2m apart, so a wall jump can chain from one to the
  // other while both panels remain above the open trench.
  addBox('wall-run-panel-left', new BABYLON.Vector3(8, 4, 15), new BABYLON.Vector3(0.5, 8, 12), {
    color: 'accent',
  });
  addBox('wall-run-panel-right', new BABYLON.Vector3(13.7, 4, 15), new BABYLON.Vector3(0.5, 8, 12), {
    color: 'accent',
  });

  // Paint the right-hand approach lane without adding another collider-heavy
  // structure. Spawn aligns with this lane, making the first panel reachable
  // after a short run and jump.
  addBox('wall-run-lane-paint', new BABYLON.Vector3(13.05, 0.03, 5), new BABYLON.Vector3(0.5, 0.06, 6), {
    color: 'accent',
  });

  return {
    spawn: new BABYLON.Vector3(13.05, 1, 2),
    meshes,
  };
}

function makeMaterial(scene: BABYLON.Scene, name: string, color: string): BABYLON.StandardMaterial {
  const material = new BABYLON.StandardMaterial(name, scene);
  material.diffuseColor = BABYLON.Color3.FromHexString(color);
  material.specularColor = BABYLON.Color3.Black();
  return material;
}
