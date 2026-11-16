import * as BABYLON from '@babylonjs/core';
import * as RAPIER from '@dimforge/rapier3d-compat';

export interface GrayboxWorld {
  spawn: BABYLON.Vector3;
  meshes: BABYLON.AbstractMesh[];
  /** Tips of the cranes, used as grapple anchors. */
  grappleAnchors: GrappleAnchorPoint[];
}

/** A grapple ring plus the spot its vault should land the player on. */
export interface GrappleAnchorPoint {
  /** Where the ring is. */
  position: BABYLON.Vector3;
  /** The platform surface the vault should carry the player onto. */
  landing: BABYLON.Vector3;
}

interface BoxOptions {
  yaw?: number;
  /** Roll around the box's long axis, used to tilt the crane beams. */
  roll?: number;
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
  const grappleAnchors: GrappleAnchorPoint[] = [];
  const floorMaterial = makeMaterial(scene, 'floor', '#3d4650');
  const platformMaterial = makeMaterial(scene, 'platform', '#586574');
  const accentMaterial = makeMaterial(scene, 'accent', '#d69b42');
  const obstacleMaterial = makeMaterial(scene, 'obstacle', '#7b8794');
  const craneMaterial = makeMaterial(scene, 'crane', '#c8a13a');

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
    mesh.rotation.z = options.roll ?? 0;
    mesh.material = options.color === 'accent'
      ? accentMaterial
      : options.color === 'obstacle'
        ? obstacleMaterial
        : options.color === 'crane'
          ? craneMaterial
          : platformMaterial;
    mesh.receiveShadows = true;
    shadowGenerator?.addShadowCaster(mesh);
    meshes.push(mesh);

    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
    const collider = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
    if (options.yaw || options.roll) {
      // Same composition as Babylon's yaw/pitch/roll euler order.
      const rotation = BABYLON.Quaternion.RotationYawPitchRoll(
        options.yaw ?? 0,
        0,
        options.roll ?? 0,
      );
      collider.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
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

  /**
   * A crane: a vertical mast with a slightly tilted jib and a landing
   * platform cantilevered past the tip.
   *
   * The jib stops short of the anchor, so the green grapple ring is the clean
   * visible tip. The platform hangs past the tip, which means a grapple that
   * vaults over the anchor lands on the platform instead of dropping into the
   * void. The platform also starts past the anchor, so it never blocks the
   * line of sight to the ring.
   */
  const addCrane = (
    name: string,
    base: BABYLON.Vector3,
    height: number,
    armLength: number,
    armYaw: number,
  ) => {
    const mast = addBox(
      `${name}-mast`,
      new BABYLON.Vector3(base.x, base.y + height / 2, base.z),
      new BABYLON.Vector3(0.9, height, 0.9),
      { color: 'crane' },
    );
    mast.receiveShadows = true;

    // A small tilt gives the cranes a less rigid silhouette.
    const tilt = 0.055;
    const armDirection = new BABYLON.Vector3(Math.sin(armYaw), 0, Math.cos(armYaw));

    // The beam stops short of the anchor: the ring is the clean visible tip.
    const tipGap = 0.3;
    const jibLength = armLength - tipGap;
    const jibAxis = new BABYLON.Vector3(
      armDirection.x * Math.cos(tilt),
      -Math.sin(tilt),
      armDirection.z * Math.cos(tilt),
    );
    const armCenter = new BABYLON.Vector3(
      base.x + jibAxis.x * (jibLength / 2),
      base.y + height + jibAxis.y * (jibLength / 2),
      base.z + jibAxis.z * (jibLength / 2),
    );
    addBox(`${name}-jib`, armCenter, new BABYLON.Vector3(jibLength, 0.45, 0.45), {
      yaw: armYaw,
      roll: -tilt,
      color: 'crane',
    });

    // A counterweight box on the opposite side keeps the silhouette readable.
    addBox(
      `${name}-counterweight`,
      new BABYLON.Vector3(
        base.x - Math.sin(armYaw) * 1.1,
        base.y + height,
        base.z - Math.cos(armYaw) * 1.1,
      ),
      new BABYLON.Vector3(1.6, 1.1, 1.1),
      { yaw: armYaw, color: 'crane' },
    );

    // Landing platform past the tip. The grapple vault carries the player up
    // and over the anchor, and this is what they land on.
    const deckLength = 6;
    const deckTop = height - 2.2;
    const deckStart = armLength + 0.6;
    const deckCenterDistance = deckStart + deckLength / 2;
    addBox(
      `${name}-deck`,
      new BABYLON.Vector3(
        base.x + armDirection.x * deckCenterDistance,
        base.y + deckTop - 0.175,
        base.z + armDirection.z * deckCenterDistance,
      ),
      new BABYLON.Vector3(deckLength, 0.35, 3),
      { yaw: armYaw, color: 'crane' },
    );

    // A slim strut under the outer edge of the platform.
    const strutDistance = deckStart + deckLength - 0.5;
    addBox(
      `${name}-strut`,
      new BABYLON.Vector3(
        base.x + armDirection.x * strutDistance,
        base.y + (deckTop - 0.35) / 2,
        base.z + armDirection.z * strutDistance,
      ),
      new BABYLON.Vector3(0.3, deckTop - 0.35, 0.3),
      { color: 'crane' },
    );

    // The anchor sits at the tilted tip of the jib.
    const anchor = new BABYLON.Vector3(
      base.x + jibAxis.x * armLength,
      base.y + height + jibAxis.y * armLength,
      base.z + jibAxis.z * armLength,
    );

    // The vault should drop the player onto the platform, not into the void.
    const landing = new BABYLON.Vector3(
      base.x + armDirection.x * deckCenterDistance,
      base.y + deckTop,
      base.z + armDirection.z * deckCenterDistance,
    );

    grappleAnchors.push({ position: anchor, landing });
    return anchor;
  };

  // The floor is split into a 6.2m-wide trench. The two wall-run panels sit
  // directly over this trench, leaving an unobstructed route underneath them.
  addBox('main-floor-west', new BABYLON.Vector3(-16.125, -0.25, 0), new BABYLON.Vector3(47.75, 0.5, 80), {
    color: 'floor',
  });
  addBox('main-floor-east', new BABYLON.Vector3(26.975, -0.25, 0), new BABYLON.Vector3(26.05, 0.5, 80), {
    color: 'floor',
  });
  addBox('main-floor-gap-south', new BABYLON.Vector3(10.85, -0.25, -16), new BABYLON.Vector3(6.2, 0.5, 48), {
    color: 'floor',
  });
  addBox('main-floor-gap-north', new BABYLON.Vector3(10.85, -0.25, 31), new BABYLON.Vector3(6.2, 0.5, 18), {
    color: 'floor',
  });

  addBox('wall-north', new BABYLON.Vector3(0, 3, 40), new BABYLON.Vector3(80, 6, 0.5));
  addBox('wall-south', new BABYLON.Vector3(0, 3, -40), new BABYLON.Vector3(80, 6, 0.5));
  addBox('wall-east', new BABYLON.Vector3(40, 3, 0), new BABYLON.Vector3(0.5, 6, 80));
  addBox('wall-west', new BABYLON.Vector3(-40, 3, 0), new BABYLON.Vector3(0.5, 6, 80));

  // Low and high platforms.
  addBox('platform-low', new BABYLON.Vector3(-14, 1, 8), new BABYLON.Vector3(9, 2, 7));
  addBox('platform-high', new BABYLON.Vector3(14, 2.5, -14), new BABYLON.Vector3(10, 5, 8));

  // Stairs to the low platform.
  for (let step = 0; step < 6; step++) {
    const height = (step + 1) * 0.25;
    addBox(
      `stairs-${step}`,
      new BABYLON.Vector3(-9.875 - step * 0.75, height / 2, 8),
      new BABYLON.Vector3(0.75, height, 2.4),
    );
  }

  // Ramp to the high platform.
  addRamp('ramp-high', new BABYLON.Vector3(14, 2.5, -6.2), 6, 10, 5);

  // Pillars and cover for general collision and movement testing.
  addBox('pillar-1', new BABYLON.Vector3(-4, 2.5, -2), new BABYLON.Vector3(1.2, 5, 1.2), {
    color: 'obstacle',
  });
  addBox('pillar-2', new BABYLON.Vector3(2, 3, -8), new BABYLON.Vector3(1.2, 6, 1.2), {
    color: 'obstacle',
  });
  addBox('cover-1', new BABYLON.Vector3(-8, 0.65, -20), new BABYLON.Vector3(5, 1.3, 0.8), {
    color: 'accent',
  });
  addBox('cover-2', new BABYLON.Vector3(24, 0.9, 4), new BABYLON.Vector3(4, 1.8, 3), {
    color: 'obstacle',
  });
  addBox('cover-3', new BABYLON.Vector3(-20, 0.9, -28), new BABYLON.Vector3(4, 1.8, 3), {
    color: 'obstacle',
  });

  // Mantle test ledges at varying heights.
  addBox('mantle-low', new BABYLON.Vector3(-28, 0.5, -18), new BABYLON.Vector3(4, 1, 3), {
    color: 'accent',
  });
  addBox('mantle-mid', new BABYLON.Vector3(-28, 0.7, -14), new BABYLON.Vector3(4, 1.4, 3), {
    color: 'accent',
  });
  addBox('mantle-high', new BABYLON.Vector3(-28, 0.9, -10), new BABYLON.Vector3(4, 1.8, 3), {
    color: 'obstacle',
  });

  // Downhill slide ramp for slope-acceleration testing.
  addRamp('slide-slope', new BABYLON.Vector3(-22, 2.4, 14), 5, 14, 4.8, {
    color: 'accent',
  });
  addBox('slide-slope-platform', new BABYLON.Vector3(-15.5, 4.8, 14), new BABYLON.Vector3(2.5, 0.25, 5), {
    color: 'accent',
  });
  addBox('slide-slope-runout', new BABYLON.Vector3(-30, 0.125, 14), new BABYLON.Vector3(4, 0.25, 5));

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

  // Cranes with grapple anchors on their jib tips.
  addCrane('crane-west', new BABYLON.Vector3(-22, 0, 6), 9, 5.5, Math.PI / 2);
  addCrane('crane-east', new BABYLON.Vector3(24, 0, -10), 12, 6.5, -Math.PI / 2);
  addCrane('crane-north', new BABYLON.Vector3(-4, 0, 28), 11, 6, Math.PI);
  addCrane('crane-south', new BABYLON.Vector3(8, 0, -30), 8, 5, 0);

  return {
    spawn: new BABYLON.Vector3(13.05, 1, 2),
    meshes,
    grappleAnchors,
  };
}

function makeMaterial(scene: BABYLON.Scene, name: string, color: string): BABYLON.StandardMaterial {
  const material = new BABYLON.StandardMaterial(name, scene);
  material.diffuseColor = BABYLON.Color3.FromHexString(color);
  material.specularColor = BABYLON.Color3.Black();
  return material;
}
