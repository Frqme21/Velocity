export class HUD {
  private speedElement: HTMLElement;
  private fpsElement: HTMLElement;
  private dashFillElement: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div id="crosshair" aria-hidden="true"></div>
      <div id="dash-meter" aria-hidden="true">
        <span id="dash-fill"></span>
      </div>
      <div id="movement-stats" aria-live="off">
        <span id="speed">0.00 m/s</span>
        <span id="fps">0 FPS</span>
      </div>
    `;
    this.speedElement = root.querySelector<HTMLElement>('#speed')!;
    this.fpsElement = root.querySelector<HTMLElement>('#fps')!;
    this.dashFillElement = root.querySelector<HTMLElement>('#dash-fill')!;
  }

  update(speed: number, fps: number, dashCharge: number) {
    this.speedElement.textContent = `${speed.toFixed(2)} m/s`;
    this.fpsElement.textContent = `${Math.round(fps)} FPS`;
    this.dashFillElement.style.transform = `scaleX(${Math.max(0, Math.min(1, dashCharge))})`;
  }
}
