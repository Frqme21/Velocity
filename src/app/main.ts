import '../style.css';
import { Game } from './Game';

async function init() {
  const canvas = document.getElementById('app') as HTMLCanvasElement;
  const loading = document.getElementById('loading')!;
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
