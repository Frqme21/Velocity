/**
 * Katana / melee tuning surface.
 *
 * The swing is a fast arcade slash: a 0.20s diagonal animation, a wide
 * forward hit cone and a tiny hit-stop that punches the moment the blade
 * connects. Everything the melee feel needs is exposed here.
 */
export const COMBAT_CONFIG = {
  // ------------------------------------------------------------------
  // The swing
  // ------------------------------------------------------------------
  /** Total length of the swing animation, in seconds. */
  SWING_DURATION: 0.2,
  /** Minimum time between two swings, in seconds. */
  SWING_COOLDOWN: 0.22,
  /**
   * Where in the swing the blade crosses the target (0..1). The hit is
   * resolved on this frame, so it lines up with the slash arc.
   */
  IMPACT_POINT: 0.5,

  // ------------------------------------------------------------------
  // Hit detection - a wide forward cone
  // ------------------------------------------------------------------
  /** Maximum distance to a target, in metres. */
  HIT_RANGE: 3.4,
  /**
   * Full width of the forward hit cone, in degrees. The cone is centred on
   * the look direction, so a target is half this angle off-centre.
   */
  HIT_CONE_ANGLE: 75,

  // ------------------------------------------------------------------
  // Hit feedback
  // ------------------------------------------------------------------
  /** Length of the hit-stop micro freeze, in seconds. */
  HIT_STOP: 0.035,
  /** Dash meter refill after a hit (1 = full meter). */
  DASH_REFILL: 1,

  // ------------------------------------------------------------------
  // The slash itself - the blade is hidden and a laser trail takes over
  // ------------------------------------------------------------------
  /** When the slash starts being painted (normalised swing time). */
  SLASH_START: 0.22,
  /** When the blade tip finishes the cut (normalised swing time). */
  SLASH_END: 0.78,
  /** How long the finished slash keeps glowing, in seconds. */
  SLASH_FADE: 0.14,
  /**
   * How long the steel takes to dissolve into the light at the start of a
   * cut, in seconds. It dissolves where it is - the blade is never yanked
   * across the screen.
   */
  SLASH_DISSOLVE: 0.05,
  /**
   * How long the blade takes to fade back in at the grip, in seconds.
   * It returns to the resting pose instead of flying in from the side.
   */
  SLASH_RECOVER: 0.12,
  /** Width of the light trail, in metres. */
  SLASH_WIDTH: 0.08,
  /** The hot white core of the trail. */
  SLASH_CORE_COLOR: { r: 1, g: 1, b: 1 },
  /** The coloured glow around the core. */
  SLASH_EDGE_COLOR: { r: 0.45, g: 0.92, b: 1 },
  /**
   * Cut the other way on every second slash, and upwards on every fourth
   * one, so a chain of attacks does not look like the same cut repeated.
   */
  SLASH_ALTERNATE: true,
  /**
   * How much the shape of a slash is allowed to wobble from cut to cut
   * (0 = identical every time, 1 = wildly different).
   */
  SLASH_VARIATION: 0.3,

  // ------------------------------------------------------------------
  // Parry - deflecting incoming bolts with the blade
  // ------------------------------------------------------------------
  /**
   * How long after the start of a slash the blade can still deflect a bolt,
   * in seconds. The window is generous on purpose: a parry should feel
   * like a reaction, not like a frame-perfect input.
   */
  PARRY_ACTIVE_WINDOW: 0.18,
  /** How close a bolt has to be to the camera to be deflectable, in metres. */
  PARRY_RADIUS: 3.2,
  /**
   * How far off the crosshair a bolt may be and still be deflected.
   * 1 = dead ahead, 0 = 90 degrees off. 0.35 is a bit more than 70 degrees
   * of total cone, which is wide enough to feel fair.
   */
  PARRY_CONE_DOT: 0.35,
  /** How much faster a deflected bolt flies than an incoming one. */
  DEFLECTED_SPEED_MULTIPLIER: 1.75,
  /** Length of the time-freeze on a successful deflect, in seconds. */
  PARRY_HITSTOP: 0.035,
  /** How much the FOV widens on a deflect, in radians. */
  PARRY_FOV_KICK: 0.035,
  /** How hard the camera shakes on a deflect (1 = a full kick). */
  PARRY_SHAKE: 1,
  /** How long the deflect shake lasts, in seconds. */
  PARRY_SHAKE_DECAY: 0.18,

  // ------------------------------------------------------------------
  // Projectiles
  // ------------------------------------------------------------------
  /** How fast a bolt travels, in metres per second. */
  BOLT_SPEED: 26,
  /** How big a bolt is, in metres. */
  BOLT_RADIUS: 0.12,
  /** How long a bolt lives before it disappears, in seconds. */
  BOLT_LIFETIME: 6,
  /** How close an incoming bolt has to be to hit the player, in metres. */
  PLAYER_HIT_RADIUS: 0.75,
  /** How far the deflected bolt is aimed, in metres, when nothing is hit. */
  DEFLECT_AIM_DISTANCE: 120,

  // ------------------------------------------------------------------
  // The test turret
  // ------------------------------------------------------------------
  /** How long the turret waits between two shots, in seconds. */
  TURRET_FIRE_INTERVAL: 2.2,
  /** How long the red sight line is up before the shot, in seconds. */
  TURRET_TELEGRAPH: 0.6,
  /** How far the turret can reach, in metres. */
  TURRET_RANGE: 45,

  // ------------------------------------------------------------------
  // The pistol enemy
  // ------------------------------------------------------------------
  /** Where the enemy model lives. */
  ENEMY_MODEL_URL: '/models/enemy_pistol.glb',
  /**
   * The model is authored in centimetres, so this puts it at human size.
   */
  ENEMY_MODEL_SCALE: 0.01,
  /**
   * How close the enemy has to be before it turns to face the player, in
   * metres. Beyond this it keeps whatever it was looking at.
   */
  ENEMY_FACE_RANGE: 32,
  /** How fast the enemy turns to face the player, in radians per second. */
  ENEMY_TURN_SPEED: 5.5,
  /**
   * How long the red aiming laser is up before the shot, in seconds.
   * This one is scaled by the world time scale, so the sensory boost
   * stretches the telegraph out as well.
   */
  ENEMY_AIM_TIME: 0.85,
  /** How long the enemy waits between two shots, in seconds. */
  ENEMY_FIRE_INTERVAL: 1.5,
  /** How far the enemy can see and shoot, in metres. */
  ENEMY_RANGE: 45,
  /**
   * How far below the camera the enemy's aim point is, in metres. The
   * lasers go for the chest, not for the eyes.
   */
  ENEMY_AIM_DROP: 0.55,
  /** Height of the enemy, in metres - used for the hit points. */
  ENEMY_HEIGHT: 1.9,

  // ------------------------------------------------------------------
  // The Sword Elite duel
  // ------------------------------------------------------------------
  /** Skinned Sword Elite model. It is already authored in metres. */
  SWORD_ELITE_MODEL_URL: '/models/enemy_sword_elite.glb',
  /** The Elite's own katana, parented to its weapon hand. */
  SWORD_ELITE_KATANA_URL: '/models/enemy_sword_elite_katana.glb',
  /** How close the player has to be before the Elite starts a duel. */
  SWORD_ELITE_AGGRO_RANGE: 20,
  /** How fast the Elite turns toward the player, in radians per second. */
  SWORD_ELITE_TURN_SPEED: 4.5,

  /** Length of the red telegraph before the dash, in seconds. */
  SWORD_TELEGRAPH: 1.15,
  /**
   * How long before the blade lands the BLOCK cue opens, in seconds. This is
   * measured during the dash, not the windup: the Elite commits to the rush
   * and the player has to hit it just before contact. The combat system
   * snapshots the window on the click frame, so the blade connecting later in
   * the swing cannot make a correct input fail.
   */
  SWORD_PERFECT_WINDOW: 0.55,
  /** The short launch clip at the start of the dash, in seconds. */
  SWORD_DASH_STARTUP: 0.107,
  /** How long the Elite keeps moving during the dash, in seconds. */
  SWORD_DASH_DURATION: 0.7,
  /** Dash speed, in metres per second. */
  SWORD_DASH_SPEED: 16,
  /** How close the blade has to get before the player dies, in metres. */
  SWORD_STRIKE_RADIUS: 1.35,
  /** How long a perfect hit keeps the Elite open to a follow-up, in seconds. */
  SWORD_STUN_DURATION: 2.2,
  /** How long the block pose lasts, in seconds. */
  SWORD_BLOCK_DURATION: 0.5,
  /** Recovery after a dash, a block or a stun, in seconds. */
  SWORD_RECOVER_DURATION: 0.85,
  /** Minimum wait before the next duel begins, in seconds. */
  SWORD_ATTACK_COOLDOWN: 1.8,
  /** The enemy katana is authored slightly oversized for readability. */
  SWORD_KATANA_SCALE: 0.9,
  /** Freeze on a perfect stun, in seconds. */
  SWORD_STUN_HITSTOP: 0.045,
  /** Freeze on a blocked hit, in seconds. */
  SWORD_BLOCK_HITSTOP: 0.025,
  /** Knockback speed when the Elite blocks a badly timed hit, in m/s. */
  SWORD_BLOCK_KNOCKBACK: 9,
  /** A small hop with the block shove so it clears the floor. */
  SWORD_BLOCK_LIFT: 3.5,

  // ------------------------------------------------------------------
  // Melee kills
  // ------------------------------------------------------------------
  /**
   * The strike phase of the swing, in seconds after the swing started.
   *
   * The blade is only lethal while it is actually travelling through the
   * target, so the hit window is a slice of the middle of the animation.
   */
  MELEE_ACTIVE_START: 0.04,
  MELEE_ACTIVE_END: 0.16,
  /** How close an enemy has to be to be cut, in metres. */
  MELEE_KILL_RANGE: 3.5,
  /**
   * How far off the crosshair an enemy may be and still be cut.
   * 1 = dead ahead, 0 = 90 degrees off.
   */
  MELEE_KILL_CONE_DOT: 0.45,
  /**
   * Length of the kill hit-stop, in seconds.
   *
   * The whole world holds still for this long - the player, the guards, the
   * bolts and the blade. 0.06s is about four frames at 60 fps, which is
   * the shortest freeze that actually reads as a freeze frame.
   */
  KILL_HITSTOP: 0.06,
  /** How much the FOV punches out on a kill, in radians. */
  KILL_FOV_KICK: 0.07,
  /** How hard the camera shakes on a kill. */
  KILL_SHAKE: 0.8,
  /** How long the kill shake lasts, in seconds. */
  KILL_SHAKE_DECAY: 0.22,

  // ------------------------------------------------------------------
  // Deflected bolt kills
  // ------------------------------------------------------------------
  /**
   * How close a deflected bolt has to pass to an enemy to kill it, in
   * metres.
   */
  DEFLECT_KILL_RADIUS: 0.85,

  // ------------------------------------------------------------------
  // The dash-slash lunge
  // ------------------------------------------------------------------
  /**
   * How close a guard has to be for the slash to lunge, in metres.
   *
   * A slash aimed at a guard several metres away still yanks the player in:
   * the blade has to reach it during the 0.04s - 0.16s hit window, so the
   * pull has to be able to cover this whole distance in that time.
   */
  LUNGE_RANGE: 8,
  /**
   * How far off the crosshair the guard may be and still pull the player
   * in. 1 = dead ahead, 0 = 90 degrees off.
   */
  LUNGE_CONE_DOT: 0.2,
  /**
   * How fast the lunge pulls the player toward the guard, in m/s.
   *
   * Fast enough to close the full lunge range before the blade stops being
   * lethal: at 34 m/s the player covers 5.4m inside the 0.16s hit window.
   */
  LUNGE_PULL_SPEED: 34,
  /**
   * How hard the lunge bends the player's heading toward the guard, per
   * second. 1 closes the whole gap to the guard in about a second, so the
   * cut is almost always on target.
   */
  LUNGE_DIRECTION_BLEND: 0.65,
  /**
   * How long the lunge pulls, in seconds.
   *
   * It has to outlive the strike phase of the swing (0.04s - 0.16s), so
   * the player is still being pulled in while the blade goes through.
   */
  LUNGE_DURATION: 0.26,

  // ------------------------------------------------------------------
  // The slice feedback
  // ------------------------------------------------------------------
  /** How long the bright slice arc lives, in seconds. */
  SLICE_ARC_DURATION: 0.24,
  /** How wide the slice arc opens up, in metres. */
  SLICE_ARC_RADIUS: 1.6,
  /** How thick the slice arc is, in metres. */
  SLICE_ARC_THICKNESS: 0.07,

  // ------------------------------------------------------------------
  // Shuriken (Q)
  // ------------------------------------------------------------------
  /** Throwing-star model, extracted from Ghostrunner. */
  SHURIKEN_MODEL_URL: '/models/shuriken.glb',
  /** The extracted star is ~10cm across; scale it up so it reads in flight. */
  SHURIKEN_MODEL_SCALE: 2.2,
  /** One throw costs half the energy bar. */
  SHURIKEN_COST: 0.5,
  /** How fast the star flies, in metres per second. */
  SHURIKEN_SPEED: 30,
  /** How long a star lives before it disappears, in seconds. */
  SHURIKEN_LIFETIME: 3,
  /** Radius of the hit sphere around a target, in metres. */
  SHURIKEN_HIT_RADIUS: 1.1,
  /** How far the star may be from the crosshair and still acquire a target. */
  SHURIKEN_HOMING_CONE_DOT: 0.45,
  /** Maximum acquisition range, in metres. */
  SHURIKEN_HOMING_RANGE: 26,
  /** How hard the star bends toward its target, per second. */
  SHURIKEN_HOMING_STRENGTH: 9,
  /** Minimum time between throws, in seconds. */
  SHURIKEN_COOLDOWN: 0.18,
  /** Passive energy regen per second. */
  SHURIKEN_REGEN_PASSIVE: 0.14,
  /** Faster regen while an enemy is close and alert, per second. */
  SHURIKEN_REGEN_COMBAT: 0.34,
  /** How close an enemy has to be to count as "in combat", in metres. */
  SHURIKEN_COMBAT_RANGE: 28,
  /** Flat energy refund on a confirmed kill. */
  SHURIKEN_KILL_REFILL: 0.25,
  /** Extra energy per chained kill. */
  SHURIKEN_COMBO_BONUS: 0.12,
  /** Maximum combo bonus. */
  SHURIKEN_COMBO_MAX: 0.5,
  /** How long after a kill the combo stays alive, in seconds. */
  SHURIKEN_COMBO_WINDOW: 3.2,

  // ------------------------------------------------------------------
  // SMG (UZI) enemy
  // ------------------------------------------------------------------
  SMG_MODEL_URL: '/models/enemy_smg.glb',
  /** The SMG model is already authored in metres. */
  SMG_MODEL_SCALE: 1,
  /** How long the red telegraph is before emptying a magazine, in seconds. */
  SMG_AIM_TIME: 0.5,
  /** Time to aim again after a magazine plus the reload pause, in seconds. */
  SMG_FIRE_INTERVAL: 0.9,
  /** Rounds in a full magazine. */
  SMG_BURST_COUNT: 15,
  /** Time between rounds, in seconds. */
  SMG_BURST_GAP: 0.105,
  /** Reload pause after the magazine is empty, in seconds. */
  SMG_RELOAD_TIME: 1.5,
  /** How far the SMG can see and shoot, in metres. */
  SMG_RANGE: 38,
  /** How close before it turns to face the player, in metres. */
  SMG_FACE_RANGE: 30,
  /** Turn speed, in radians per second. */
  SMG_TURN_SPEED: 6.2,
  /** Muzzle offset in the enemy's local space, in metres. */
  SMG_MUZZLE_OFFSET: { x: 0.26, y: 1.36, z: 0.44 },
  /** Height of the enemy's centre, in metres. */
  SMG_CENTER_HEIGHT: 1,
  /** Height the aim laser starts at, in metres. */
  SMG_EYE_HEIGHT: 1.55,

  // ------------------------------------------------------------------
  // Mech (Waver) enemy
  // ------------------------------------------------------------------
  MECH_MODEL_URL: '/models/enemy_mech.glb',
  /** The mech GLB is already authored in metres. */
  MECH_MODEL_SCALE: 1,
  /** How close before the mech starts tracking the player, in metres. */
  MECH_AGGRO_RANGE: 42,
  /** Red head glow / laser buildup before a wave, in seconds. */
  MECH_TELEGRAPH: 1.5,
  /** Time between waves, in seconds. */
  MECH_FIRE_INTERVAL: 3,
  /** How fast the wave travels, in metres per second. */
  MECH_WAVE_SPEED: 17,
  /** Final half-width of the expanding wave wall, in metres. */
  MECH_WAVE_RADIUS: 2.6,
  /** Height of the wave wall, in metres. */
  MECH_WAVE_HEIGHT: 3.4,
  /** How long the wave stays alive, in seconds. */
  MECH_WAVE_LIFETIME: 3.2,
  /** How close the wave must pass to hurt the player, in metres. */
  MECH_WAVE_HIT_RADIUS: 1.5,
  /** Height of the mech's centre, in metres. */
  MECH_CENTER_HEIGHT: 2.3,
  /** Height the wave leaves the mech at, in metres. */
  MECH_MUZZLE_HEIGHT: 2.6,
  /** How long a shuriken stun lasts, in seconds. */
  MECH_STUN_DURATION: 7,
  /** How long the death animation plays, in seconds. */
  MECH_DEATH_DURATION: 1.1,

  // ------------------------------------------------------------------
  // The instant reset
  // ------------------------------------------------------------------
  /**
   * How far below the floor the player has to fall before the run is
   * reset. The trench in the graybox has no floor, so this catches
   * anyone who drops into it.
   */
  KILL_PLANE_Y: -4,
} as const;
