import * as BABYLON from '@babylonjs/core';

/** Identifiers for the clips the game can play. */
export type SfxId = 'katana-swing' | 'katana-slash';

interface ClipDefinition {
  url: string;
  volume: number;
  /** How many voices to keep, so consecutive hits can overlap. */
  voices: number;
}

const CLIPS: Record<SfxId, ClipDefinition> = {
  // The airy sweep of the blade through the air.
  'katana-swing': { url: '/sounds/katana_swing.wav', volume: 0.5, voices: 2 },
  // The metallic "shing" of the blade cutting through a target.
  'katana-slash': { url: '/sounds/katana_slash.wav', volume: 0.75, voices: 3 },
};

interface Clip {
  definition: ClipDefinition;
  instances: BABYLON.Sound[];
  next: number;
}

/**
 * Tiny sound bank built on Babylon's audio engine.
 *
 * Every clip keeps a small pool of voices so consecutive hits can overlap
 * instead of cutting each other off.
 */
export class AudioManager {
  private scene: BABYLON.Scene;
  private clips = new Map<SfxId, Clip>();

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  /**
   * Preload every clip.
   *
   * Never rejects: a missing or slow sound must not stop the game from
   * starting, so every clip is raced against a timeout.
   */
  async load() {
    await Promise.all(
      (Object.keys(CLIPS) as SfxId[]).map((id) => this.loadClip(id)),
    );
  }

  private loadClip(id: SfxId) {
    const definition = CLIPS[id];
    const instances: BABYLON.Sound[] = [];

    const ready = Promise.all(
      Array.from({ length: definition.voices }, (_, index) =>
        new Promise<void>((resolve) => {
          const sound = new BABYLON.Sound(
            `${id}-${index}`,
            definition.url,
            this.scene,
            () => resolve(),
            { volume: definition.volume, autoplay: false },
          );
          instances.push(sound);
        }),
      ),
    );

    this.clips.set(id, { definition, instances, next: 0 });

    // A sound that never reports ready must not hold the game hostage.
    return Promise.race([ready, delay(4000)]);
  }

  /**
   * Play a clip on the next free voice of its pool.
   *
   * Missing or not-yet-loaded clips are silently ignored.
   */
  play(id: SfxId, options?: { volume?: number; rate?: number }) {
    const clip = this.clips.get(id);
    if (!clip || clip.instances.length === 0) return;

    const instance = clip.instances[clip.next];
    clip.next = (clip.next + 1) % clip.instances.length;
    if (!instance || !instance.isReady()) return;

    instance.setVolume(options?.volume ?? clip.definition.volume);
    if (options?.rate) instance.setPlaybackRate(options.rate);
    instance.play();
  }

  /** Release the audio engine's user-gesture lock (call on the first click). */
  unlock() {
    BABYLON.AbstractEngine.audioEngine?.unlock();
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
