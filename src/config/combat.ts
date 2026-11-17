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
} as const;
