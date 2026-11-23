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
}

export interface PauseActions {
  resume: () => void;
  restart: () => void;
  quit: () => void;
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
  private warningElement: HTMLElement;
  private warningButton: HTMLButtonElement;
  private pauseElement: HTMLElement;
  private pauseResumeButton: HTMLButtonElement;
  private pauseRestartButton: HTMLButtonElement;
  private pauseQuitButton: HTMLButtonElement;
  /** Called once, when the first-level warning is dismissed. */
  private warningDismiss: (() => void) | null = null;
  /** Button callbacks for the currently open pause menu. */
  private pauseActions: PauseActions | null = null;
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
          <div class="complete-sub">PRESS <kbd>R</kbd> TO RUN IT AGAIN</div>
        </div>
      </div>
      <div id="ctrl-warning" aria-live="assertive">
        <div class="warning-card">
          <div class="warning-kicker">BEFORE YOU RUN</div>
          <div class="warning-title">WATCH OUT FOR <kbd>CTRL</kbd> + <kbd>W</kbd></div>
          <p class="warning-body">
            Watch out for <kbd>CTRL</kbd> + <kbd>W</kbd> — it closes the tab.
            <strong>Hold <kbd>W</kbd> first, then tap <kbd>CTRL</kbd>.</strong>
          </p>
          <button type="button" id="warning-continue">GOT IT — CLICK TO PLAY</button>
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
          <div class="pause-hint"><kbd>ESC</kbd> RESUME <span>/</span> <kbd>R</kbd> RESTART</div>
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

  /** Show the pause overlay and wire its three actions. */
  showPause(actions: PauseActions) {
    if (this.pauseActive) {
      this.pauseActions = actions;
      return;
    }
    this.pauseActions = actions;
    document.body.classList.add('paused');
    this.pauseElement.classList.add('active');
    this.pauseResumeButton.focus();
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
  ) {
    this.completeTitleElement.textContent = title;
    this.completeSubElement.innerHTML = sub;
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
   * The class has to be dropped after the flash, otherwise the overlay
   * would stay at full opacity forever and the vignette would never go
   * away again.
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
