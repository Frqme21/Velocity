export interface HUDState {
  speed: number;
  fps: number;
  dashCharge: number;
  meter: number;
  speedEffect: number;
  dashing: boolean;
  sliding: boolean;
  sensoryBoost: boolean;
}

export class HUD {
  private speedElement: HTMLElement;
  private fpsElement: HTMLElement;
  private dashFillElement: SVGPathElement;
  private speedLinesElement: HTMLElement;
  private sensoryOverlayElement: HTMLElement;
  private damageFlashElement: HTMLElement;
  private hitFlashElement: HTMLElement;
  /** The pending fade-out timers of the screen flashes. */
  private timers = new Map<'damage' | 'hit', number>();

  constructor(root: HTMLElement) {
    root.innerHTML = `
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
      <div id="movement-stats" aria-live="off">
        <span id="speed">0.00 m/s</span>
        <span id="fps">0 FPS</span>
      </div>
    `;
    this.speedElement = root.querySelector<HTMLElement>('#speed')!;
    this.fpsElement = root.querySelector<HTMLElement>('#fps')!;
    this.dashFillElement = root.querySelector<SVGPathElement>('#dash-fill')!;
    this.speedLinesElement = root.querySelector<HTMLElement>('#speed-lines')!;
    this.sensoryOverlayElement = root.querySelector<HTMLElement>('#sensory-overlay')!;
    this.damageFlashElement = root.querySelector<HTMLElement>('#damage-flash')!;
    this.hitFlashElement = root.querySelector<HTMLElement>('#hit-flash')!;
  }

  update(state: HUDState) {
    const meter = Math.max(0, Math.min(1, state.meter));
    const speedEffect = Math.max(0, Math.min(1, state.speedEffect));

    this.speedElement.textContent = `${state.speed.toFixed(2)} m/s`;
    this.fpsElement.textContent = `${Math.round(state.fps)} FPS`;
    this.dashFillElement.style.strokeDashoffset = `${(1 - meter) * 100}`;

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
