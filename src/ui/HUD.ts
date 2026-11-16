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

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div id="sensory-overlay" aria-hidden="true"></div>
      <div id="speed-lines" aria-hidden="true"></div>
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
}
