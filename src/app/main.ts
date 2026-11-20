import '../style.css';
import { Game } from './Game';
import { LevelSelect } from '../ui/LevelSelect';
import { initTheme } from '../ui/theme';
import { discoverLevels, type LevelEntry } from '../world/levels/campaign';

initTheme();

async function init() {
  const canvas = document.getElementById('app') as HTMLCanvasElement;
  const loading = document.getElementById('loading')!;
  const params = new URLSearchParams(window.location.search);
  const level = params.get('level');
  const intro = params.get('intro') === '1';

  // The root URL is a level picker for the eight levels in `levels/`.
  // ?intro=1 keeps the original hand-authored course available.
  if (!level && !intro) {
    loading.classList.add('hidden');
    let entries: LevelEntry[] = [];
    try {
      entries = await discoverLevels(true);
    } catch (error) {
      console.warn('Could not scan levels/', error);
    }
    new LevelSelect(entries, (name, campaign) => {
      const next = new URLSearchParams();
      if (name) {
        next.set('level', name);
        // The badge came from the browser copy, so play that same copy rather
        // than a possibly older export sitting on disk.
        if (entries.find((entry) => entry.name === name)?.source === 'browser') {
          next.set('fromEditor', '1');
        }
      } else {
        next.set('intro', '1');
      }
      if (campaign) next.set('campaign', '1');
      window.location.href = `/?${next.toString()}`;
    });
    return;
  }

  const game = new Game(canvas);
  await game.init();
  loading.classList.add('hidden');
}

init().catch((error) => {
  console.error(error);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.display = 'block';
    loading.textContent = `Failed to start: ${(error as Error).message}`;
  }
});
