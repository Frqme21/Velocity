/**
 * Shared UI theme switcher for the level picker and the editor.
 *
 * The three modes map directly onto the GR-74 design system tokens in
 * `src/design-system.css`:
 *   tactical  - sharp chamfers, red/cyan (default)
 *   slick     - rounded M3 surfaces, softer glow
 *   daylight  - light M3 surfaces
 *
 * The choice lives in localStorage and is applied to <body>, so the same mode
 * follows the player from the picker into the editor and back.
 */

export type UIMode = 'tactical' | 'slick' | 'daylight';

const STORAGE_KEY = 'velocity-ui-theme';
const MODES: UIMode[] = ['tactical', 'slick', 'daylight'];

function isMode(value: string | null | undefined): value is UIMode {
  return typeof value === 'string' && MODES.includes(value as UIMode);
}

function readStoredMode(): UIMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isMode(value) ? value : 'tactical';
  } catch {
    // Private browsing / storage disabled: fall back to the default theme.
    return 'tactical';
  }
}

/**
 * Apply a mode and reflect it on every visible switcher button.
 *
 * The class is set on both <html> (so the inline head script can avoid a
 * first-paint flash) and <body> (which is what gameplay/HUD CSS also keys on).
 */
export function applyTheme(mode: UIMode) {
  const classes = MODES.map((name) => `mode-${name}`);
  for (const root of [document.documentElement, document.body]) {
    root.classList.remove(...classes);
    root.classList.add(`mode-${mode}`);
  }
  syncThemeButtons();
}

/** Persist and apply a mode. */
export function setTheme(mode: UIMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures; the mode still applies for this session.
  }
  applyTheme(mode);
}

/** Re-sync switcher buttons after markup is inserted into the DOM. */
export function syncThemeButtons() {
  const active = MODES.find((name) => document.body.classList.contains(`mode-${name}`)) ?? 'tactical';
  document.querySelectorAll<HTMLElement>('[data-theme-mode]').forEach((button) => {
    const selected = button.dataset.themeMode === active;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

/**
 * Restore the saved mode and install one delegated click handler for all
 * `[data-theme-mode]` buttons, including ones added later by the picker.
 */
export function initTheme() {
  applyTheme(readStoredMode());

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('[data-theme-mode]');
    if (!button) return;
    const mode = button.dataset.themeMode;
    if (isMode(mode)) setTheme(mode);
  });
}

/** Reusable switcher markup so the picker and editor stay identical. */
export function themeSwitcherMarkup(): string {
  return `
    <div class="theme-switcher" role="group" aria-label="UI theme">
      <button type="button" class="theme-btn" data-theme-mode="tactical">TACTICAL</button>
      <button type="button" class="theme-btn" data-theme-mode="slick">SLICK</button>
      <button type="button" class="theme-btn" data-theme-mode="daylight">DAYLIGHT</button>
    </div>
  `;
}
