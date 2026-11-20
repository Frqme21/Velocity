import * as BABYLON from '@babylonjs/core';

/** Identifiers for the clips the game can play. */
export type SfxId =
  | 'katana-swing'
  | 'katana-slash'
  | 'parry'
  | 'enemy-shot'
  | 'sword-block'
  | 'sword-strike'
  | 'shuriken-throw'
  | 'mech-wave';

interface ClipDefinition {
  url: string;
  volume: number;
  /** How many voices to keep, so consecutive hits can overlap. */
  voices: number;
  /**
   * Used when the file could not be loaded.
   *
   * The parry needs a clang no matter what, so it synthesizes a metallic
   * ping with the Web Audio API when the sample is unavailable.
   */
  fallback?: () => void;
}

const CLIPS: Record<SfxId, ClipDefinition> = {
  // The airy sweep of the blade through the air.
  'katana-swing': { url: '/sounds/katana_swing.wav', volume: 0.5, voices: 2 },
  // The metallic "shing" of the blade cutting through a target.
  'katana-slash': { url: '/sounds/katana_slash.wav', volume: 0.75, voices: 3 },
  // The clang of a bolt deflected off the blade.
  'parry': {
    url: '/sounds/parry.wav',
    volume: 0.85,
    voices: 2,
    fallback: () => playMetallicPing(),
  },
  // The pistol of a guard. Several can fire at once, so it gets voices.
  'enemy-shot': { url: '/sounds/enemy_shot.wav', volume: 0.5, voices: 4 },
  // A katana hitting another katana: a harder clang than a bolt parry.
  'sword-block': {
    url: '/sounds/parry.wav',
    volume: 1,
    voices: 2,
    fallback: () => playMetallicPing(0.7),
  },
  // The Elite's own slash as its dash connects.
  'sword-strike': { url: '/sounds/katana_slash.wav', volume: 0.85, voices: 2 },
  // The spin of a thrown star: a bright, short metallic sweep.
  'shuriken-throw': {
    url: '/sounds/katana_swing.wav',
    volume: 0.55,
    voices: 3,
    fallback: () => playMetallicPing(1.4),
  },
  // The Mech's wave launching: a heavier, lower metallic hit.
  'mech-wave': {
    url: '/sounds/katana_slash.wav',
    volume: 0.6,
    voices: 2,
    fallback: () => playMetallicPing(0.45),
  },
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
   * A clip that is missing or not-yet-loaded falls back to its synthesized
   * version, if it has one.
   */
  play(id: SfxId, options?: { volume?: number; rate?: number }) {
    const clip = this.clips.get(id);
    if (!clip || clip.instances.length === 0) {
      clip?.definition.fallback?.();
      return;
    }

    const instance = clip.instances[clip.next];
    clip.next = (clip.next + 1) % clip.instances.length;
    if (!instance || !instance.isReady()) {
      clip.definition.fallback?.();
      return;
    }

    instance.setVolume(options?.volume ?? clip.definition.volume);
    if (options?.rate) instance.setPlaybackRate(options.rate);
    instance.play();
  }

  /** Release the audio engine's user-gesture lock (call on the first click). */
  unlock() {
    BABYLON.AbstractEngine.audioEngine?.unlock();
  }
}

/**
 * A crisp metallic ping, synthesized with the Web Audio API.
 *
 * Used as the parry fallback when the clang sample cannot be loaded: a
 * short noise strike for the contact, plus three detuned partials for the
 * ring of the blade.
 */
function playMetallicPing(volume = 0.55) {
  const context = BABYLON.AbstractEngine.audioEngine?.audioContext;
  if (!context) return;
  if (context.state === 'suspended') void context.resume();

  const now = context.currentTime;

  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);

  // The strike itself: a very short band of noise.
  const noiseLength = Math.floor(context.sampleRate * 0.05);
  const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
  }

  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 3200;
  noiseFilter.Q.value = 2;
  const noiseGain = context.createGain();
  noiseGain.gain.value = 0.55;
  noise.connect(noiseFilter).connect(noiseGain).connect(master);
  noise.start(now);

  // The ring: a few inharmonic partials, like a struck blade.
  const partials = [1860, 2790, 4180];
  partials.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4 / (index + 1), now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35 + index * 0.08);

    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.7);
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
