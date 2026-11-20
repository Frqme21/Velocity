import type { LevelData } from '../components/registry';

/**
 * The levels in `levels/`, in play order. Nothing here edits those files:
 * they are read at runtime, and an editor save in localStorage can override
 * the copy on disk (the same rule the game already used for `?level=`).
 */
/** The hand-authored opening course fills the level 1 slot for now. */
export const ORIGINAL_LEVEL = 'level1';

export const CAMPAIGN_LEVELS = [
  ORIGINAL_LEVEL,
  'level2',
  'level3',
  'level4',
  'level5',
  'level6',
  'level7',
  'level8',
] as const;

export type CampaignName = (typeof CAMPAIGN_LEVELS)[number];

export interface LevelEntry {
  name: string;
  /** Short display name, e.g. "LEVEL 03". */
  label: string;
  /** True when the level has a finish ring (or an explicit finish zone). */
  hasRing: boolean;
  /** Where the data came from, for the level picker. */
  source: 'original' | 'browser' | 'disk' | null;
}

export function isCampaignLevel(name: string): name is CampaignName {
  return (CAMPAIGN_LEVELS as readonly string[]).includes(name);
}

/** Next name in the campaign, or null at the end. */
export function nextLevelName(name: string): string | null {
  const index = CAMPAIGN_LEVELS.indexOf(name as CampaignName);
  if (index < 0 || index + 1 >= CAMPAIGN_LEVELS.length) return null;
  return CAMPAIGN_LEVELS[index + 1];
}

export function levelLabel(name: string): string {
  const number = name.replace(/^level/i, '');
  return /^\d+$/.test(number) ? `LEVEL ${number.padStart(2, '0')}` : name;
}

function browserLevel(name: string): LevelData | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`velocity-level-${name}`);
    return raw ? (JSON.parse(raw) as LevelData) : null;
  } catch {
    return null;
  }
}

/** Read the authoritative exported JSON from `levels/`. */
async function diskLevel(name: string): Promise<LevelData | null> {
  for (const url of [`/levels/${name}.json`, `/src/world/levels/${name}.json`]) {
    try {
      const response = await fetch(url);
      if (response.ok) return (await response.json()) as LevelData;
    } catch {
      // Missing path or offline - try the next one.
    }
  }
  return null;
}

function hasFinishRing(data: LevelData): boolean {
  if ((data.finishZones?.length ?? 0) > 0) return true;
  return data.components.some((component) => component.type === 'levelEnd');
}

/**
 * An editor save made before the ring was placed must not erase the ring from
 * the exported JSON. Keep every other editor change, but restore the missing
 * `levelEnd` component so the level actually completes.
 */
function withDiskFinishRing(name: string, data: LevelData, disk: LevelData | null): LevelData {
  if (!disk || hasFinishRing(data)) return data;

  const endComponents = disk.components.filter((component) => component.type === 'levelEnd');
  const diskFinishZones = disk.finishZones ?? [];
  if (!endComponents.length && !diskFinishZones.length) return data;

  console.info(`[campaign] Restored finish ring from ${name}.json into browser save`);
  return {
    ...data,
    components: [...data.components, ...endComponents],
    finishZones: [...(data.finishZones ?? []), ...diskFinishZones],
  };
}

interface ResolvedLevel {
  data: LevelData | null;
  source: LevelEntry['source'];
}

async function resolveLevelData(name: string, preferBrowser: boolean): Promise<ResolvedLevel> {
  const stored = browserLevel(name);
  const disk = await diskLevel(name);

  if (preferBrowser && stored) {
    // Editor Play in Game still uses the current editor state. Only the finish
    // ring is borrowed from disk when that save predates the ring.
    return { data: withDiskFinishRing(name, stored, disk), source: 'browser' };
  }
  if (disk) return { data: disk, source: 'disk' };
  return { data: stored, source: stored ? 'browser' : null };
}

/**
 * Read one level. `preferBrowser` matches the editor's `fromEditor=1` flow:
 * the copy just saved in the browser wins over an older exported JSON, except
 * that a ringless save borrows the finish ring from the exported level.
 */
export async function fetchLevelData(
  name: string,
  preferBrowser = false,
): Promise<LevelData | null> {
  return (await resolveLevelData(name, preferBrowser)).data;
}

/**
 * Scan all eight levels so the picker and the campaign can tell which ones
 * actually have an end ring. Levels still being built (no ring yet) are kept
 * in the list but left out of "play all".
 */
export async function discoverLevels(preferBrowser = true): Promise<LevelEntry[]> {
  return Promise.all(CAMPAIGN_LEVELS.map(async (name) => {
    // Level 1 is the code-built original course (it has its own finish zone).
    // The JSON file in levels/ is only a placeholder while it is being remade.
    if (name === ORIGINAL_LEVEL) {
      return { name, label: levelLabel(name), hasRing: true, source: 'original' as const };
    }
    const { data, source } = await resolveLevelData(name, preferBrowser);
    return {
      name,
      label: levelLabel(name),
      hasRing: data ? hasFinishRing(data) : false,
      source,
    };
  }));
}
