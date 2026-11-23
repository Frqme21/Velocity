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
  /** True only on the frame the attack button is pressed. */
  attackPressed: boolean;
  /** True only on the frame the shuriken key is pressed. */
  throwPressed: boolean;
  mouseDX: number;
  mouseDY: number;
}

type PointerLockRequest = (options?: { unadjustedMovement?: boolean }) => Promise<void> | void;

/** A held-still input snapshot used while a cinematic owns the screen. */
export const EMPTY_INPUT: InputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  leftPressed: false,
  rightPressed: false,
  jump: false,
  jumpPressed: false,
  dashHeld: false,
  dashPressed: false,
  slide: false,
  slidePressed: false,
  attackPressed: false,
  throwPressed: false,
  mouseDX: 0,
  mouseDY: 0,
};

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
  private attackLatch = false;
  private throwLatch = false;
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

  /** Fired when the grapple button (right mouse) is pressed. */
  public onGrapplePressed?: () => void;

  /** Fired when the attack button (left mouse) is pressed. */
  public onAttackPressed?: () => void;

  /** Fired when the shuriken key (Q) is pressed. */
  public onThrowPressed?: () => void;

  /**
   * Fired when the reset key (R) is pressed.
   *
   * This one works even without pointer lock: it is the way out of a bad
   * situation, so it must always be available.
   */
  public onResetPressed?: () => void;

  /**
   * Fired when Space or Enter is pressed during a cinematic so the player can
   * skip the intro. Like reset, it works without pointer lock.
   */
  public onSkipPressed?: () => void;

  /**
   * Fired when Escape is pressed so the game can pause or resume. Like reset,
   * it works without pointer lock because Escape releases the pointer itself.
   */
  public onPausePressed?: () => void;

  /** Fired when H is pressed so the input overlay can be toggled. */
  public onHudTogglePressed?: () => void;

  /**
   * False while a cinematic or a fatal-error state owns the screen.
   *
   * Reset and skip are deliberately handled before this gate, so the player
   * always has a way out. Everything else - movement, look, attack and
   * grapple - stops reaching the controller while this is false.
   */
  public enabled = true;

  private grappleMouseDown = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (event) => {
      // Escape owns pointer lock in the browser. Let the default release happen
      // and give the game a chance to open or close the pause menu.
      if (event.code === 'Escape' && !event.repeat) {
        this.onPausePressed?.();
        return;
      }
      if (event.code === 'KeyH' && !event.repeat) {
        this.onHudTogglePressed?.();
        return;
      }
      // The reset key always works, even when the pointer is not locked.
      if (event.code === 'KeyR' && !event.repeat) {
        this.onResetPressed?.();
      }
      if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) {
        this.onSkipPressed?.();
      }
      if (!this.locked || !this.enabled) return;
      event.preventDefault();
      if (event.code === 'Space' && !event.repeat) this.jumpLatch = true;
      if (event.code === 'KeyQ' && !event.repeat) {
        this.throwLatch = true;
        this.onThrowPressed?.();
      }
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

    // Right mouse fires the grapple.
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('mousedown', (event) => {
      if (!this.locked || !this.enabled) return;
      event.preventDefault();
      if (event.button === 2) {
        this.grappleMouseDown = true;
        this.onGrapplePressed?.();
      } else if (event.button === 0) {
        // Left mouse swings the katana.
        this.attackLatch = true;
        this.onAttackPressed?.();
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 2) this.grappleMouseDown = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.grappleMouseDown = false;
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
      if (!this.locked || !this.enabled) return;

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

  /** Release pointer lock so an overlay can receive clicks. */
  releasePointerLock() {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  get isLocked() {
    return this.locked;
  }

  /** True while the grapple button (right mouse) is held down. */
  get grappleHeld() {
    return this.grappleMouseDown;
  }

  /** Read input and clear the per-frame mouse deltas. */
  read(): InputState {
    const state = this.enabled ? this.buildState() : EMPTY_INPUT;
    this.dx = 0;
    this.dy = 0;
    this.jumpLatch = false;
    this.dashLatch = false;
    this.slideLatch = false;
    this.leftLatch = false;
    this.rightLatch = false;
    this.attackLatch = false;
    this.throwLatch = false;
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
      attackPressed: this.attackLatch,
      throwPressed: this.throwLatch,
      mouseDX: this.dx,
      mouseDY: this.dy,
    };
  }
}
