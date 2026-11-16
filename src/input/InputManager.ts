export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  /** True only on the frame A is pressed. */
  leftPressed: boolean;
  /** True only on the frame D is pressed. */
  rightPressed: boolean;
  jump: boolean;
  /** True only on the frame Space is pressed. */
  jumpPressed: boolean;
  /** True while a dash/sensory key is held. */
  dashHeld: boolean;
  /** True only on the frame a dash key is pressed. */
  dashPressed: boolean;
  /** True while a slide key is held. */
  slide: boolean;
  /** True only on the frame a slide key is pressed. */
  slidePressed: boolean;
  mouseDX: number;
  mouseDY: number;
}

type PointerLockRequest = (options?: { unadjustedMovement?: boolean }) => Promise<void> | void;

/** Keyboard and pointer-lock mouse input for the movement sandbox. */
export class InputManager {
  private keys = new Set<string>();
  private dx = 0;
  private dy = 0;
  private jumpLatch = false;
  private dashLatch = false;
  private slideLatch = false;
  private leftLatch = false;
  private rightLatch = false;
  private locked = false;
  private canvas: HTMLCanvasElement;

  /**
   * Called immediately for every raw pointer-lock mouse event.
   *
   * The camera uses this path instead of waiting for the next physics or
   * render update. The accumulated dx/dy values are still reset by read()
   * so no stale mouse input is carried between frames.
   */
  public onMouseDelta?: (dx: number, dy: number) => void;

  /** Fired whenever pointer lock is gained or lost. */
  public onPointerLockChange?: (locked: boolean) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (event) => {
      if (!this.locked) return;
      event.preventDefault();
      if (event.code === 'Space' && !event.repeat) this.jumpLatch = true;
      if (event.code === 'KeyA' && !event.repeat) this.leftLatch = true;
      if (event.code === 'KeyD' && !event.repeat) this.rightLatch = true;
      if ((event.code === 'ShiftLeft' || event.code === 'ShiftRight') && !event.repeat) {
        this.dashLatch = true;
      }
      if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && !event.repeat) {
        this.slideLatch = true;
      }
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      // Remove the key immediately so the next movement frame can zero out
      // velocity without waiting for browser key-repeat or another event.
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (!this.locked) this.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.keys.clear();
        this.dx = 0;
        this.dy = 0;
      }
      this.onPointerLockChange?.(this.locked);
    });

    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;

      // movementX/movementY are raw pointer-lock deltas. Apply the look change
      // now, before the next animation frame, rather than during physics.
      this.onMouseDelta?.(event.movementX, event.movementY);

      // Keep an accumulated snapshot as well. read() consumes and resets it
      // once per render frame without dropping events received between frames.
      this.dx += event.movementX;
      this.dy += event.movementY;
    });
  }

  /** Must be called from a user gesture (a canvas click does this). */
  requestPointerLock() {
    const request = this.canvas.requestPointerLock as unknown as PointerLockRequest;

    try {
      const result = request.call(this.canvas, { unadjustedMovement: true });
      if (result && typeof result.catch === 'function') {
        result.catch(() => this.requestPointerLockFallback());
      }
    } catch {
      // Older browsers do not accept the options argument.
      this.requestPointerLockFallback();
    }
  }

  private requestPointerLockFallback() {
    if (this.locked) return;

    try {
      const request = this.canvas.requestPointerLock as unknown as PointerLockRequest;
      const result = request.call(this.canvas);
      result?.catch?.(() => {});
    } catch {
      // Pointer lock may be unavailable in an embedded browser.
    }
  }

  get isLocked() {
    return this.locked;
  }

  /** Read input and clear the per-frame mouse deltas. */
  read(): InputState {
    const state = this.buildState();
    this.dx = 0;
    this.dy = 0;
    this.jumpLatch = false;
    this.dashLatch = false;
    this.slideLatch = false;
    this.leftLatch = false;
    this.rightLatch = false;
    return state;
  }

  private buildState(): InputState {
    const dashHeld = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    return {
      forward: this.keys.has('KeyW'),
      backward: this.keys.has('KeyS'),
      left: this.keys.has('KeyA'),
      right: this.keys.has('KeyD'),
      leftPressed: this.leftLatch,
      rightPressed: this.rightLatch,
      jump: this.keys.has('Space'),
      jumpPressed: this.jumpLatch,
      dashHeld,
      dashPressed: this.dashLatch,
      slide: this.keys.has('ControlLeft') || this.keys.has('ControlRight'),
      slidePressed: this.slideLatch,
      mouseDX: this.dx,
      mouseDY: this.dy,
    };
  }
}
