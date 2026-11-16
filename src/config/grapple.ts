/**
 * Grapple tuning surface.
 *
 * The whole feel of the hook lives in this file. The targeting is forgiving,
 * the pull is a straight high-speed line towards the anchor and the ending is
 * an arcade style ledge vault. Every number the mechanic uses is exposed
 * below, so the feel can be re-tuned without touching the controller.
 */
export const GRAPPLE_CONFIG = {
  // ------------------------------------------------------------------
  // Targeting - "forgiving aim"
  // ------------------------------------------------------------------
  /** Maximum distance to an anchor, in metres. */
  MAX_RANGE: 34,
  /** Half angle of the aim cone, in radians (~36 degrees). */
  AIM_CONE_ANGLE: 0.62,
  /** Score bonus for the anchor that was targeted last frame (sticky aim). */
  AIM_STICKY_SCORE: 0.45,
  /** Radius of the sphere cast used for the line of sight check. */
  LOS_RADIUS: 0.4,
  /** How far the line of sight check stops short of the anchor. */
  LOS_PADDING: 0.5,
  /** Anchors closer than this skip the line of sight check entirely. */
  LOS_EXEMPT_DISTANCE: 3.5,
  /** Minimum time between two grapple attempts, in seconds. */
  COOLDOWN: 0.28,

  // ------------------------------------------------------------------
  // The pull - a straight, fast line to the anchor
  // ------------------------------------------------------------------
  /** Speed of the pull when it starts, in m/s. */
  PULL_SPEED: 22,
  /** Extra speed gained over the course of the pull, in m/s. */
  PULL_SPEED_GAIN: 8,
  /** Hard cap for the pull speed, in m/s. */
  PULL_MAX_SPEED: 34,
  /** How quickly the pull reaches its target speed (higher = snappier). */
  PULL_RESPONSE: 9,
  /** How quickly the velocity snaps onto the pull line (higher = straighter). */
  PULL_BLEND: 18,
  /** Fraction of the horizontal speed the player keeps when the hook fires. */
  MOMENTUM_KEEP: 0.85,
  /** Multiplier applied to that kept momentum while pulling. */
  MOMENTUM_BOOST: 1.1,
  /** The pull eases off over the last metres so the landing is smooth. */
  APPROACH_ZONE: 7,
  /** Speed multiplier at the moment the vault triggers. */
  APPROACH_SPEED_RATIO: 0.45,
  /** Kill the downward velocity the moment the hook fires. */
  CANCEL_FALL_SPEED: true,

  // ------------------------------------------------------------------
  // Ledge vault - the pop that carries the player over the ledge
  // ------------------------------------------------------------------
  /** Distance to the anchor at which the hook releases, in metres. */
  DETACH_DISTANCE: 2.4,
  /** Upward impulse of the vault, in m/s. */
  VAULT_UP_SPEED: 6.2,
  /** Forward impulse of the vault, in m/s (used without a landing platform). */
  VAULT_FORWARD_SPEED: 7.5,
  /** The vault keeps at least this fraction of the pull speed. */
  VAULT_KEEP_SPEED: 0.75,
  /** Lower clamp for the solved vault speed, in m/s. */
  VAULT_FORWARD_MIN: 3,
  /** Upper clamp for the solved vault speed, in m/s. */
  VAULT_FORWARD_MAX: 14,

  // ------------------------------------------------------------------
  // Inputs during the pull - they boost the pull, they never cancel it
  // ------------------------------------------------------------------
  /** Speed multiplier applied to the pull when the player dashes. */
  DASH_BOOST: 1.35,
  /** Seconds the dash boost takes to fade back out. */
  DASH_BOOST_DECAY: 0.5,
  /** Upward kick added to the pull when the player jumps, in m/s. */
  JUMP_KICK: 7,
  /** Seconds the jump kick takes to fade back out. */
  JUMP_KICK_DECAY: 0.35,
  /** Minimum time between two jump kicks during a pull, in seconds. */
  JUMP_KICK_COOLDOWN: 0.3,

  // ------------------------------------------------------------------
  // Juice
  // ------------------------------------------------------------------
  /** Extra field of view while the hook is pulling, in radians. */
  FOV_KICK: 0.09,
  /** Seconds the FOV kick takes to fade back out. */
  FOV_DECAY: 0.28,
  /** Camera lean into the pull, in radians. */
  ROLL: 0.13,
  /** Seconds the launch shake takes to fade. */
  SHAKE_DECAY: 0.3,
} as const;
