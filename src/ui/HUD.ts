import { formatTime, type GamePreferences } from '../config/preferences';
import type { InputState } from '../input/InputManager';

export interface HUDState {
  speed: number;
  fps: number;
  dashCharge: number;
  meter: number;
  /** Shuriken energy, 0..1. One throw costs half of this bar. */
  energy: number;
  speedEffect: number;
  dashing: boolean;
  sliding: boolean;
  sensoryBoost: boolean;
  /** Optional run stats, drawn in the bottom HUD panel. */
  run?: RunStats;
  /** Optional input snapshot, drawn in the toggleable input overlay. */
  input?: InputState;
}

export interface RunStats {
  /** Elapsed run time in seconds. */
  elapsed: number;
  bestTime: number | null;
  attempts: number;
  showTimer: boolean;
  showBestTime: boolean;
  showAttempts: boolean;
  showInputOverlay: boolean;
}

export interface CompletionStats {
  time: number;
  bestTime: number | null;
  attempts: number;
  isBest: boolean;
}

export type ToggleKey = 'showTimer' | 'showBestTime' | 'showAttempts' | 'showInputOverlay';

export interface PauseActions {
  resume: () => void;
  restart: () => void;
  quit: () => void;
  settings: GamePreferences;
  onVolumeChange: (volume: number) => void;
  onFovChange: (degrees: number) => void;
  onToggle: (key: ToggleKey, value: boolean) => void;
}

export class HUD {
  private speedElement: HTMLElement;
  private fpsElement: HTMLElement;
  private dashFillElement: SVGPathElement;
  private energyFillElement: HTMLElement;
  private speedLinesElement: HTMLElement;
  private sensoryOverlayElement: HTMLElement;
  private damageFlashElement: HTMLElement;
  private hitFlashElement: HTMLElement;
  private cinematicBlurElement: HTMLElement;
  private cinematicBarsElement: HTMLElement;
  private cinematicCaptionElement: HTMLElement;
  private fatalElement: HTMLElement;
  private completeElement: HTMLElement;
  private completeTitleElement: HTMLElement;
  private completeSubElement: HTMLElement;
  private completeStatsElement: HTMLElement;
  private warningElement: HTMLElement;
  private warningButton: HTMLButtonElement;
  private pauseElement: HTMLElement;
  private pauseResumeButton: HTMLButtonElement;
  private pauseRestartButton: HTMLButtonElement;
  private pauseQuitButton: HTMLButtonElement;
  private runStatsElement: HTMLElement;
  private runTimeElement: HTMLElement;
  private runBestElement: HTMLElement;
  private runAttemptsElement: HTMLElement;
  private inputOverlayElement: HTMLElement;
  private inputKeys = new Map<string, HTMLElement>();
  private volumeInput: HTMLInputElement;
  private volumeValue: HTMLOutputElement;
  private fovInput: HTMLInputElement;
  private fovValue: HTMLOutputElement;
  /** Checkboxes inside the pause settings panel. */
  private toggleInputs: Record<ToggleKey, HTMLInputElement>;
  /** Called once, when the first-level warning is dismissed. */
  private warningDismiss: (() => void) | null = null;
  /** Button callbacks for the currently open pause menu. */
  private pauseActions: PauseActions | null = null;
  /** Current HUD visibility settings, mirrored into the pause controls. */
  private preferences: GamePreferences | null = null;
  /** The pending fade-out timers of the screen flashes. */
  private timers = new Map<'damage' | 'hit', number>();

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div id="cinematic-blur" aria-hidden="true"></div>
      <div id="sensory-overlay" aria-hidden="true"></div>
      <div id="speed-lines" aria-hidden="true"></div>
      <div id="damage-flash" aria-hidden="true"></div>
      <div id="hit-flash" aria-hidden="true"></div>
      <div id="crosshair" aria-hidden="true"></div>
      <div id="dash-meter" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <path id="dash-track" d="M 14.68 42 A 20 20 0 0 0 49.32 42" pathLength="100"></path>
          <path id="dash-fill" d="M 14.68 42 A 20 20 0 0 0 49.32 42" pathLength="100"></path>
        </svg>
      </div>
      <div id="shuriken-energy" aria-hidden="true">
        <div id="shuriken-energy-track">
          <div id="shuriken-energy-fill"></div>
          <div id="shuriken-energy-split"></div>
        </div>
        <span id="shuriken-key">Q</span>
      </div>
      <div id="run-stats" aria-live="off">
        <div class="run-stat run-timer">
          <span class="run-label">TIME</span>
          <span id="run-time">0:00.00</span>
        </div>
        <div class="run-stat run-best">
          <span class="run-label">BEST</span>
          <span id="run-best">--:--.--</span>
        </div>
        <div class="run-stat run-attempts">
          <span class="run-label">TRY</span>
          <span id="run-attempts">01</span>
        </div>
      </div>
      <div id="input-overlay" aria-hidden="true">
        <div class="input-line">
          <span class="input-key" data-key="forward">W</span>
        </div>
        <div class="input-line">
          <span class="input-key" data-key="left">A</span>
          <span class="input-key" data-key="backward">S</span>
          <span class="input-key" data-key="right">D</span>
        </div>
        <div class="input-line">
          <span class="input-key input-key-wide" data-key="dash">SHIFT</span>
          <span class="input-key" data-key="slide">CTRL</span>
          <span class="input-key input-key-wide" data-key="jump">SPACE</span>
        </div>
        <div class="input-line">
          <span class="input-key" data-key="attack">LMB</span>
          <span class="input-key" data-key="throw">Q</span>
        </div>
      </div>
      <div id="movement-stats" aria-live="off">
        <span id="speed">0.00 m/s</span>
        <span id="fps">0 FPS</span>
      </div>
      <div id="cinematic-bars" aria-hidden="true"></div>
      <div id="cinematic-caption" aria-live="polite"></div>
      <div id="fatal-error" aria-live="assertive">
        <div class="result-dialog fatal-dialog">
          <span class="section-index">RUN TERMINATED</span>
          <div class="fatal-title">FATAL ERROR</div>
          <div class="fatal-sub">PRESS <kbd>R</kbd> TO RESTART</div>
        </div>
      </div>
      <div id="level-complete" aria-live="assertive">
        <div class="result-dialog complete-dialog">
          <span class="section-index">SECTOR CLEARED</span>
          <div class="complete-title">LEVEL COMPLETE</div>
          <div id="complete-stats" class="complete-stats"></div>
          <div class="complete-sub">PRESS <kbd>R</kbd> TO RUN IT AGAIN</div>
        </div>
      </div>
      <div id="ctrl-warning" aria-live="assertive">
        <div class="warning-card">
          <div class="warning-kicker">BEFORE YOU RUN</div>
          <div class="warning-title">WATCH OUT FOR <kbd>CTRL</kbd> + <kbd>W</kbd></div>
          <p class="warning-body">
            Watch out for <kbd>CTRL</kbd> + <kbd>W</kbd>, it closes the tab.
            <strong>Hold <kbd>W</kbd> first, then tap <kbd>CTRL</kbd>.</strong>
          </p>
          <button type="button" id="warning-continue">GOT IT - CLICK TO PLAY</button>
          <div class="warning-foot">or press <kbd>ENTER</kbd> / <kbd>SPACE</kbd></div>
        </div>
      </div>
      <div id="pause-menu" aria-live="polite">
        <div class="pause-card result-dialog">
          <span class="section-index">SYSTEM HALTED</span>
          <div class="pause-title">PAUSED</div>
          <div class="pause-sub">PRESS <kbd>ESC</kbd> TO RESUME</div>
          <div class="pause-actions">
            <button type="button" id="pause-resume" class="m3-btn m3-btn-filled">RESUME</button>
            <button type="button" id="pause-restart" class="m3-btn m3-btn-tonal">RESTART RUN</button>
            <button type="button" id="pause-quit" class="m3-btn m3-btn-outlined">LEVEL SELECT</button>
          </div>
          <div class="pause-settings">
            <div class="settings-title">SETTINGS</div>
            <label class="setting-row" for="setting-volume">
              <span>VOLUME</span>
              <input type="range" id="setting-volume" min="0" max="1" step="0.05">
              <output id="volume-value" for="setting-volume">70%</output>
            </label>
            <label class="setting-row" for="setting-fov">
              <span>FOV</span>
              <input type="range" id="setting-fov" min="70" max="110" step="1">
              <output id="fov-value" for="setting-fov">90&deg;</output>
            </label>
            <div class="settings-toggles">
              <label><input type="checkbox" id="setting-showTimer"><span>TIMER</span></label>
              <label><input type="checkbox" id="setting-showBestTime"><span>BEST</span></label>
              <label><input type="checkbox" id="setting-showAttempts"><span>ATTEMPTS</span></label>
              <label><input type="checkbox" id="setting-showInputOverlay"><span>INPUTS (H)</span></label>
            </div>
          </div>
          <div class="pause-hint"><kbd>ESC</kbd> RESUME <span>/</span> <kbd>R</kbd> RESTART <span>/</span> <kbd>H</kbd> INPUTS</div>
        </div>
      </div>
    `;
    this.speedElement = root.querySelector<HTMLElement>('#speed')!;
    this.fpsElement = root.querySelector<HTMLElement>('#fps')!;
    this.dashFillElement = root.querySelector<SVGPathElement>('#dash-fill')!;
    this.energyFillElement = root.querySelector<HTMLElement>('#shuriken-energy-fill')!;
    this.speedLinesElement = root.querySelector<HTMLElement>('#speed-lines')!;
    this.sensoryOverlayElement = root.querySelector<HTMLElement>('#sensory-overlay')!;
    this.damageFlashElement = root.querySelector<HTMLElement>('#damage-flash')!;
    this.hitFlashElement = root.querySelector<HTMLElement>('#hit-flash')!;
    this.cinematicBlurElement = root.querySelector<HTMLElement>('#cinematic-blur')!;
    this.cinematicBarsElement = root.querySelector<HTMLElement>('#cinematic-bars')!;
    this.cinematicCaptionElement = root.querySelector<HTMLElement>('#cinematic-caption')!;
    this.fatalElement = root.querySelector<HTMLElement>('#fatal-error')!;
    this.completeElement = root.querySelector<HTMLElement>('#level-complete')!;
    this.completeTitleElement = root.querySelector<HTMLElement>('.complete-title')!;
    this.completeStatsElement = root.querySelector<HTMLElement>('#complete-stats')!;
    this.completeSubElement = root.querySelector<HTMLElement>('.complete-sub')!;
    this.warningElement = root.querySelector<HTMLElement>('#ctrl-warning')!;
    this.warningButton = root.querySelector<HTMLButtonElement>('#warning-continue')!;
    this.warningButton.addEventListener('click', () => this.dismissControlWarning());
    this.pauseElement = root.querySelector<HTMLElement>('#pause-menu')!;
    this.pauseResumeButton = root.querySelector<HTMLButtonElement>('#pause-resume')!;
    this.pauseRestartButton = root.querySelector<HTMLButtonElement>('#pause-restart')!;
    this.pauseQuitButton = root.querySelector<HTMLButtonElement>('#pause-quit')!;
    this.pauseResumeButton.addEventListener('click', () => this.pauseActions?.resume());
    this.pauseRestartButton.addEventListener('click', () => this.pauseActions?.restart());
    this.pauseQuitButton.addEventListener('click', () => this.pauseActions?.quit());

    this.runStatsElement = root.querySelector<HTMLElement>('#run-stats')!;
    this.runTimeElement = root.querySelector<HTMLElement>('#run-time')!;
    this.runBestElement = root.querySelector<HTMLElement>('#run-best')!;
    this.runAttemptsElement = root.querySelector<HTMLElement>('#run-attempts')!;
    this.inputOverlayElement = root.querySelector<HTMLElement>('#input-overlay')!;
    for (const element of root.querySelectorAll<HTMLElement>('.input-key[data-key]')) {
      this.inputKeys.set(element.dataset.key!, element);
    }

    this.volumeInput = root.querySelector<HTMLInputElement>('#setting-volume')!;
    this.volumeValue = root.querySelector<HTMLOutputElement>('#volume-value')!;
    this.fovInput = root.querySelector<HTMLInputElement>('#setting-fov')!;
    this.fovValue = root.querySelector<HTMLOutputElement>('#fov-value')!;
    this.toggleInputs = {
      showTimer: root.querySelector<HTMLInputElement>('#setting-showTimer')!,
      showBestTime: root.querySelector<HTMLInputElement>('#setting-showBestTime')!,
      showAttempts: root.querySelector<HTMLInputElement>('#setting-showAttempts')!,
      showInputOverlay: root.querySelector<HTMLInputElement>('#setting-showInputOverlay')!,
    };

    this.volumeInput.addEventListener('input', () => {
      const value = Number(this.volumeInput.value);
      this.volumeValue.textContent = `${Math.round(value * 100)}%`;
      this.pauseActions?.onVolumeChange(value);
    });
    this.fovInput.addEventListener('input', () => {
      const value = Number(this.fovInput.value);
      this.fovValue.textContent = `${value}°`;
      this.pauseActions?.onFovChange(value);
    });
    for (const key of Object.keys(this.toggleInputs) as ToggleKey[]) {
      this.toggleInputs[key].addEventListener('change', () => {
        const value = this.toggleInputs[key].checked;
        this.pauseActions?.onToggle(key, value);
      });
    }
  }

  /** Apply saved settings to the HUD panels and pause controls. */
  applyPreferences(preferences: GamePreferences) {
    this.preferences = { ...preferences };
    this.runStatsElement.classList.toggle('hide-timer', !preferences.showTimer);
    this.runStatsElement.classList.toggle('hide-best', !preferences.showBestTime);
    this.runStatsElement.classList.toggle('hide-attempts', !preferences.showAttempts);
    this.inputOverlayElement.classList.toggle('visible', preferences.showInputOverlay);

    this.volumeInput.value = String(preferences.volume);
    this.volumeValue.textContent = `${Math.round(preferences.volume * 100)}%`;
    this.fovInput.value = String(preferences.fov);
    this.fovValue.textContent = `${Math.round(preferences.fov)}°`;
    for (const key of Object.keys(this.toggleInputs) as ToggleKey[]) {
      this.toggleInputs[key].checked = preferences[key];
    }
  }

  /** Show the first-level Ctrl+W tip and call back once when dismissed. */
  showControlWarning(onDismiss: () => void) {
    if (this.controlWarningActive) return;
    this.warningDismiss = onDismiss;
    document.body.classList.add('warning');
    this.warningElement.classList.add('active');
    this.warningButton.focus();
  }

  /** Dismiss the warning from the button, Enter or Space. */
  dismissControlWarning() {
    if (!this.controlWarningActive) return;
    document.body.classList.remove('warning');
    this.warningElement.classList.remove('active');
    const dismiss = this.warningDismiss;
    this.warningDismiss = null;
    dismiss?.();
  }

  get controlWarningActive() {
    return this.warningElement.classList.contains('active');
  }

  /** Show the pause overlay and wire its actions and settings. */
  showPause(actions: PauseActions) {
    this.pauseActions = actions;
    this.applyPreferences(actions.settings);
    if (!this.pauseActive) {
      document.body.classList.add('paused');
      this.pauseElement.classList.add('active');
      this.pauseResumeButton.focus();
    }
  }

  hidePause() {
    if (!this.pauseActive) return;
    document.body.classList.remove('paused');
    this.pauseElement.classList.remove('active');
    this.pauseActions = null;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  get pauseActive() {
    return this.pauseElement.classList.contains('active');
  }

  /** Enter or leave the scripted intro: letterbox, caption and hidden HUD. */
  setCinematic(active: boolean) {
    document.body.classList.toggle('cinematic', active);
    this.cinematicBarsElement.classList.toggle('active', active);
    if (!active) {
      this.cinematicCaptionElement.textContent = '';
      this.setCinematicBlur(0);
    }
  }

  /** Blur the world behind the HUD, in CSS pixels (the intro starts at 22). */
  setCinematicBlur(pixels: number) {
    this.cinematicBlurElement.style.setProperty('--cinematic-blur', `${pixels.toFixed(2)}px`);
  }

  /** Set the opening cinematic's subtitle line. */
  setCinematicCaption(text: string) {
    this.cinematicCaptionElement.textContent = text;
    this.cinematicCaptionElement.classList.toggle('visible', text.length > 0);
  }

  /** Show the death screen after falling out of the level. */
  showFatalError() {
    document.body.classList.add('fatal');
    this.fatalElement.classList.add('active');
  }

  hideFatalError() {
    document.body.classList.remove('fatal');
    this.fatalElement.classList.remove('active');
  }

  /** Show the completion screen after the player enters a finish zone. */
  showLevelComplete(
    title = 'LEVEL COMPLETE',
    sub = 'PRESS <kbd>R</kbd> TO RUN IT AGAIN',
    stats?: CompletionStats,
  ) {
    this.completeTitleElement.textContent = title;
    this.completeSubElement.innerHTML = sub;
    if (stats) {
      const best = stats.bestTime === null ? '--:--.--' : formatTime(stats.bestTime);
      this.completeStatsElement.innerHTML = `
        <div class="complete-stat"><span>TIME</span><strong>${formatTime(stats.time)}</strong></div>
        <div class="complete-stat"><span>BEST</span><strong>${best}</strong></div>
        <div class="complete-stat"><span>ATTEMPTS</span><strong>${String(stats.attempts).padStart(2, '0')}</strong></div>
      `;
      this.completeStatsElement.classList.toggle('new-best', stats.isBest);
      this.completeStatsElement.classList.add('visible');
    } else {
      this.completeStatsElement.classList.remove('visible', 'new-best');
      this.completeStatsElement.innerHTML = '';
    }
    document.body.classList.add('complete');
    this.completeElement.classList.add('active');
  }

  hideLevelComplete() {
    document.body.classList.remove('complete');
    this.completeElement.classList.remove('active');
  }

  update(state: HUDState) {
    const meter = Math.max(0, Math.min(1, state.meter));
    const speedEffect = Math.max(0, Math.min(1, state.speedEffect));

    this.speedElement.textContent = `${state.speed.toFixed(2)} m/s`;
    this.fpsElement.textContent = `${Math.round(state.fps)} FPS`;
    this.dashFillElement.style.strokeDashoffset = `${(1 - meter) * 100}`;
    const energy = Math.max(0, Math.min(1, state.energy));
    this.energyFillElement.style.width = `${energy * 100}%`;
    this.energyFillElement.classList.toggle('ready', energy >= 0.5);

    this.speedLinesElement.style.opacity = `${speedEffect * 0.85}`;
    this.speedLinesElement.style.setProperty('--speed-scale', `${0.85 + speedEffect * 0.45}`);
    this.speedLinesElement.classList.toggle('active', speedEffect > 0.05);
    this.speedLinesElement.classList.toggle('dashing', state.dashing || state.sensoryBoost);
    this.speedLinesElement.classList.toggle('sliding', state.sliding);

    document.body.classList.toggle('sensory-boost', state.sensoryBoost);
    this.sensoryOverlayElement.style.opacity = state.sensoryBoost ? '1' : '0';

    if (state.run) this.updateRunStats(state.run);
    if (state.input) this.updateInputOverlay(state.input);
  }

  private updateRunStats(run: RunStats) {
    this.runTimeElement.textContent = formatTime(run.elapsed);
    this.runBestElement.textContent = run.bestTime === null
      ? '--:--.--'
      : formatTime(run.bestTime);
    this.runAttemptsElement.textContent = String(run.attempts).padStart(2, '0');
    if (this.preferences) {
      this.preferences.showTimer = run.showTimer;
      this.preferences.showBestTime = run.showBestTime;
      this.preferences.showAttempts = run.showAttempts;
      this.preferences.showInputOverlay = run.showInputOverlay;
    }
    this.runStatsElement.classList.toggle('hide-timer', !run.showTimer);
    this.runStatsElement.classList.toggle('hide-best', !run.showBestTime);
    this.runStatsElement.classList.toggle('hide-attempts', !run.showAttempts);
    this.inputOverlayElement.classList.toggle('visible', run.showInputOverlay);
  }

  private updateInputOverlay(input: InputState) {
    const active: Record<string, boolean> = {
      forward: input.forward,
      backward: input.backward,
      left: input.left,
      right: input.right,
      dash: input.dashHeld,
      slide: input.slide,
      jump: input.jump,
      attack: input.attackPressed,
      throw: input.throwPressed,
    };
    for (const [key, element] of this.inputKeys) {
      element.classList.toggle('active', active[key] ?? false);
    }
  }

  /**
   * Flash the screen red.
   *
   * Used when an incoming bolt hits the player. The flash snaps on and then
   * fades out on its own, so it can be triggered again right away.
   */
  flashDamage() {
    this.pulse(this.damageFlashElement, 'damage', 70);
  }

  /**
   * Pop a bright flash over the screen.
   *
   * This is the half of the hit-stop that the eye actually reads: the world
   * holds still for a few milliseconds and the screen goes white in the
   * middle, so the cut lands like a punch.
   */
  flashHit() {
    this.pulse(this.hitFlashElement, 'hit', 50);
  }

  /**
   * Snap an overlay on and take it off again.
   *
   * The class has to be dropped after the flash, otherwise the overlay would
   * stay at full opacity forever and the vignette would never go away.
   */
  private pulse(element: HTMLElement, key: 'damage' | 'hit', hold: number) {
    const previous = this.timers.get(key);
    if (previous !== undefined) window.clearTimeout(previous);

    // Drop the class and force a reflow, so a second hit restarts the
    // transition instead of being swallowed by the first one.
    element.classList.remove('active');
    void element.offsetWidth;
    element.classList.add('active');

    // Let it burn for a moment, then let the CSS fade it back out.
    this.timers.set(key, window.setTimeout(() => {
      element.classList.remove('active');
    }, hold));
  }
}
