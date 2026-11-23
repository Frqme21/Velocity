/** Persistent UI and audio preferences for the in-game HUD. */
export interface GamePreferences {
  volume: number;
  /** Vertical field of view in degrees. */
  fov: number;
  showTimer: boolean;
  showBestTime: boolean;
  showAttempts: boolean;
  showInputOverlay: boolean;
}

const SETTINGS_KEY = 'velocity:settings';
const BEST_TIME_PREFIX = 'velocity:best:';

export const DEFAULT_PREFERENCES: GamePreferences = {
  volume: 0.7,
  fov: 90,
  showTimer: true,
  showBestTime: true,
  showAttempts: true,
  showInputOverlay: false,
};

/** Load saved preferences, falling back to defaults on storage errors. */
export function loadPreferences(): GamePreferences {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const saved = JSON.parse(raw) as Partial<GamePreferences>;
    return {
      volume: clamp(saved.volume, 0, 1, DEFAULT_PREFERENCES.volume),
      fov: clamp(saved.fov, 70, 110, DEFAULT_PREFERENCES.fov),
      showTimer: typeof saved.showTimer === 'boolean'
        ? saved.showTimer
        : DEFAULT_PREFERENCES.showTimer,
      showBestTime: typeof saved.showBestTime === 'boolean'
        ? saved.showBestTime
        : DEFAULT_PREFERENCES.showBestTime,
      showAttempts: typeof saved.showAttempts === 'boolean'
        ? saved.showAttempts
        : DEFAULT_PREFERENCES.showAttempts,
      showInputOverlay: typeof saved.showInputOverlay === 'boolean'
        ? saved.showInputOverlay
        : DEFAULT_PREFERENCES.showInputOverlay,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Save preferences without letting privacy modes break gameplay. */
export function savePreferences(preferences: GamePreferences) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be disabled; the settings still work for this session.
  }
}

/** Load the best time for one level, in seconds. */
export function loadBestTime(levelKey: string): number | null {
  try {
    const raw = window.localStorage.getItem(`${BEST_TIME_PREFIX}${levelKey}`);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Save a new best time for one level. */
export function saveBestTime(levelKey: string, seconds: number) {
  try {
    window.localStorage.setItem(`${BEST_TIME_PREFIX}${levelKey}`, String(seconds));
  } catch {
    // Best times are a convenience, not a requirement for play.
  }
}

/** Format seconds as minutes:seconds.hundredths. */
export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const hundredths = Math.floor((safe % 1) * 100);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
