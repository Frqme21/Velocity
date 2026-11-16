import * as RAPIER from '@dimforge/rapier3d-compat';

/** Thin wrapper around the Rapier world used by the sandbox. */
export class PhysicsWorld {
  private world!: RAPIER.World;
  private eventQueue!: RAPIER.EventQueue;
  private initialized = false;

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -20.32, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);
    this.initialized = true;
  }

  createGround() {
    if (!this.initialized) return;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.1, 50), body);
  }

  createBox(x: number, y: number, z: number, width: number, height: number, depth: number) {
    if (!this.initialized) return;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + height / 2, z),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2),
      body,
    );
  }

  step() {
    if (!this.initialized) return;
    this.world.step(this.eventQueue);
  }

  getWorld(): RAPIER.World {
    return this.world;
  }
}
