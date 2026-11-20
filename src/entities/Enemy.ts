import * as BABYLON from '@babylonjs/core';

/** What happens when a thrown shuriken reaches an enemy. */
export type ShurikenHitResult =
  /** The enemy dies in one hit (pistol guards and SMG gunners). */
  | 'kill'
  /** The enemy is stunned and becomes a grapple target (Mech). */
  | 'stun'
  /** The hit is deflected or absorbed with no kill. */
  | 'block'
  /** The enemy is already in a state that ignores shuriken. */
  | 'ignore';

/**
 * The smallest contract the combat system needs from an enemy.
 *
 * Both the pistol guards and the Sword Elite are registered here. Keeping
 * this structural means neither class has to inherit from the other, while
 * the shared kill / deflect / respawn code can stay in one place.
 */
export interface MeleeEnemy {
  /** True while the enemy is alive and can be affected. */
  readonly isAlive: boolean;
  /** Where the enemy stands, in world space. */
  readonly position: BABYLON.Vector3;
  /** The point a blade or a deflected bolt is tested against. */
  readonly center: BABYLON.Vector3;
  /** False while a cinematic owns the screen. */
  aiEnabled: boolean;
  /** True while a perfect hit would stun this enemy. */
  readonly canBePerfectStunned?: boolean;
  /** True while a follow-up swing should kill instead of being blocked. */
  readonly isStunned?: boolean;

  update(dt: number, timeScale: number, playerPosition: BABYLON.Vector3): void;
  kill(): void;
  respawn(): void;
  dispose(): void;

  /**
   * A perfectly timed katana hit.
   *
   * Returning true consumes the hit: the enemy changes state so the same
   * swing cannot stun it twice. Pistol guards leave this undefined and die
   * normally.
   */
  consumePerfectHit?(guaranteed?: boolean): boolean;

  /**
   * An out-of-time katana hit that the enemy blocks.
   *
   * Returning true consumes the hit and lets the game apply knockback.
   */
  consumeBlockedHit?(forced?: boolean): boolean;

  /**
   * A shuriken reaches the enemy.
   *
   * Guards die in one hit, the Mech is stunned into a grapple window, and the
   * Sword Elite blocks it. Enemies without this method ignore shuriken.
   */
  takeShurikenHit?(): ShurikenHitResult;

  /** True when a shuriken can home onto this enemy at all. */
  readonly canBeShurikenTargeted?: boolean;
}
