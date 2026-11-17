import * as BABYLON from '@babylonjs/core';

/** A short lived spark in a burst. */
interface Spark {
  mesh: BABYLON.Mesh;
  velocity: BABYLON.Vector3;
  life: number;
  maxLife: number;
  /** True for the round flash in the middle of the burst. */
  isFlash: boolean;
}

/** How a burst should look. */
export interface SparkBurstOptions {
  /** The hot flash in the middle. */
  flashColor?: BABYLON.Color3;
  /**
   * The colours the shards are drawn from. A single colour makes every
   * shard the same, several colours mix them.
   */
  shardColors?: BABYLON.Color3[];
  /** How many shards there are. */
  shardCount?: number;
  /** How fast the shards fly out, in metres per second. */
  speed?: number;
  /** How long the shards live, in seconds. */
  life?: number;
  /** The diameter of the flash, in metres. */
  flashSize?: number;
}

/**
 * The little bursts of light that mark an impact.
 *
 * A bright flash with a handful of shards flying out of it - all plain
 * meshes, so no particle texture is needed. The parry and the enemy kills
 * share this, so both look like they belong to the same game.
 */
export class SparkBurst {
  private scene: BABYLON.Scene;
  private sparks: Spark[] = [];

  private flashMaterial: BABYLON.StandardMaterial;
  private shardMaterial: BABYLON.StandardMaterial;

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;

    this.flashMaterial = new BABYLON.StandardMaterial('spark-flash', scene);
    this.flashMaterial.diffuseColor = BABYLON.Color3.Black();
    this.flashMaterial.specularColor = BABYLON.Color3.Black();
    this.flashMaterial.emissiveColor = new BABYLON.Color3(1, 0.85, 0.4);
    this.flashMaterial.disableLighting = true;

    this.shardMaterial = new BABYLON.StandardMaterial('spark-shard', scene);
    this.shardMaterial.diffuseColor = BABYLON.Color3.Black();
    this.shardMaterial.specularColor = BABYLON.Color3.Black();
    this.shardMaterial.emissiveColor = new BABYLON.Color3(0.6, 1, 1);
    this.shardMaterial.disableLighting = true;
  }

  /**
   * Pop a burst of sparks at a point.
   */
  burst(point: BABYLON.Vector3, options: SparkBurstOptions = {}) {
    const flashColor = options.flashColor ?? new BABYLON.Color3(1, 0.85, 0.4);
    const shardColors = options.shardColors ?? [new BABYLON.Color3(0.6, 1, 1)];
    const shardCount = options.shardCount ?? 8;
    const speed = options.speed ?? 4;
    const life = options.life ?? 0.3;
    const flashSize = options.flashSize ?? 0.3;

    // The flash. Its own material, so a burst can have its own colour.
    const flashMaterial = this.flashMaterial.clone(`spark-flash-${Date.now()}`);
    flashMaterial.emissiveColor = flashColor.clone();

    const flash = BABYLON.MeshBuilder.CreateSphere(
      'spark-flash',
      { diameter: flashSize, segments: 8 },
      this.scene,
    );
    flash.material = flashMaterial;
    flash.position.copyFrom(point);
    flash.isPickable = false;
    flash.alwaysSelectAsActiveMesh = true;
    this.sparks.push({
      mesh: flash,
      velocity: BABYLON.Vector3.Zero(),
      life: 0.18,
      maxLife: 0.18,
      isFlash: true,
    });

    // The shards. Every shard gets its own material, so a burst can mix
    // several colours.
    for (let i = 0; i < shardCount; i++) {
      const color = shardColors[i % shardColors.length];
      const shardMaterial = this.shardMaterial.clone(`spark-shard-${Date.now()}-${i}`);
      shardMaterial.emissiveColor = color.clone();

      const shard = BABYLON.MeshBuilder.CreateBox(
        'spark-shard',
        { width: 0.05, height: 0.05, depth: 0.22 },
        this.scene,
      );
      shard.material = shardMaterial;
      shard.position.copyFrom(point);
      shard.isPickable = false;
      shard.alwaysSelectAsActiveMesh = true;

      // The shards fly out in a flat ring around the burst.
      const angle = (i / shardCount) * Math.PI * 2;
      const shardSpeed = speed * (0.75 + Math.random() * 0.5);
      const velocity = new BABYLON.Vector3(
        Math.cos(angle) * shardSpeed,
        (Math.random() - 0.3) * shardSpeed * 0.7,
        Math.sin(angle) * shardSpeed,
      );

      this.sparks.push({
        mesh: shard,
        velocity,
        life: life * (0.75 + Math.random() * 0.5),
        maxLife: life * 1.5,
        isFlash: false,
      });
    }
  }

  /** Advance the sparks and clean up the dead ones. */
  update(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.life -= dt;

      if (spark.life <= 0) {
        // The burst owns its materials, so they go with it.
        spark.mesh.material?.dispose();
        spark.mesh.dispose();
        this.sparks.splice(i, 1);
        continue;
      }

      spark.velocity.y -= 9 * dt;
      spark.mesh.position.addInPlace(spark.velocity.scale(dt));

      // The sparks fade out through their own visibility, so every burst can
      // share one material.
      spark.mesh.visibility = Math.max(0, spark.life / spark.maxLife);

      // The flash grows as it fades.
      if (spark.isFlash) {
        const grow = 1 + (1 - spark.life / spark.maxLife) * 2.5;
        spark.mesh.scaling.setAll(grow);
      }
    }
  }

  /** Remove every spark. */
  clear() {
    for (const spark of this.sparks) {
      spark.mesh.material?.dispose();
      spark.mesh.dispose();
    }
    this.sparks = [];
  }
}
