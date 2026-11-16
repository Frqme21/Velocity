export class HUD {
  private speedElement: HTMLElement;
  private fpsElement: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div id="crosshair" aria-hidden="true">
        <span class="dot"></span>
        <span class="line h"></span>
        <span class="line v"></span>
      </div>
      <div id="movement-stats" aria-live="off">
        <span id="speed">0.00 m/s</span>
        <span id="fps">0 FPS</span>
      </div>
    `;
    this.speedElement = root.querySelector<HTMLElement>('#speed')!;
    this.fpsElement = root.querySelector<HTMLElement>('#fps')!;
  }

  update(speed: number, fps: number) {
    this.speedElement.textContent = `${speed.toFixed(2)} m/s`;
    this.fpsElement.textContent = `${Math.round(fps)} FPS`;
  }
}
