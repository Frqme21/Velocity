import type { LevelEntry } from '../world/levels/campaign';
import { syncThemeButtons, themeSwitcherMarkup } from './theme';

/**
 * Start screen for the eight levels in `levels/`, skinned with the GR-74
 * Material 3 tactical components.
 *
 * "Play all" starts at the first level that actually has a finish ring; the
 * game then chains one ring into the next level. Individual buttons jump
 * straight to a level without the campaign chaining.
 *
 * The only control on the cards is playing a level. Search narrows the grid;
 * every play callback keeps its `data-level` / `data-campaign` contract.
 */
export class LevelSelect {
  private root: HTMLElement;
  private searchInput: HTMLInputElement;
  private searchClear: HTMLButtonElement;
  private countElement: HTMLElement;
  private cards: HTMLButtonElement[] = [];

  constructor(
    entries: LevelEntry[],
    onPlay: (name: string | null, campaign: boolean) => void,
  ) {
    const playable = entries.filter((entry) => entry.hasRing);
    const first = playable[0]?.name ?? entries[0]?.name ?? null;

    this.root = document.createElement('div');
    this.root.id = 'level-select';

    this.root.innerHTML = `
      <div class="app-shell">
        <div class="main-viewport">
          <header class="top-app-bar">
            <div class="brand-block">
              <span class="brand-eyebrow">VELOCITY // MOVEMENT SANDBOX</span>
              <h1 class="brand-title">LEVEL <span>SELECT</span></h1>
            </div>
            <div class="global-search-box">
              <span class="global-search-icon" aria-hidden="true">⌕</span>
              <input id="level-filter-input" class="global-search-input" type="search"
                placeholder="Filter levels (e.g. 06)" autocomplete="off" aria-label="Filter levels">
              <button type="button" id="level-filter-clear" class="global-search-clear" aria-label="Clear filter">×</button>
            </div>
            ${themeSwitcherMarkup()}
            <a class="m3-btn m3-btn-outlined m3-btn-skew editor-link" href="/editor.html">OPEN EDITOR</a>
          </header>

          <main class="content-wrapper">
            <section class="component-section" id="mission-select">
              <div class="section-header">
                <h2 class="section-heading">SELECT A LEVEL</h2>
                <span class="status-pill status-online" id="level-count">${entries.length} LEVELS</span>
              </div>

              <div class="sub-grid-3 level-grid">
                <button type="button" class="level-card m3-card elevated play-all"
                  data-level="${first ?? ''}" data-campaign="1" data-search="play all">
                  <span class="level-number">▶</span>
                  <span class="level-info">
                    <strong>PLAY ALL</strong>
                  </span>
                </button>
                ${entries.map((entry) => this.cardMarkup(entry)).join('')}
              </div>

              <div class="demo-box flex-row">
                <span class="demo-label">CONTROL TIP</span>
                <p class="select-tip">
                  Hold <kbd>W</kbd> first, then tap <kbd>CTRL</kbd> to slide.
                  <kbd>CTRL</kbd> + <kbd>W</kbd> closes the tab.
                </p>
              </div>
            </section>
          </main>
        </div>
      </div>
    `;

    this.searchInput = this.root.querySelector<HTMLInputElement>('#level-filter-input')!;
    this.searchClear = this.root.querySelector<HTMLButtonElement>('#level-filter-clear')!;
    this.countElement = this.root.querySelector<HTMLElement>('#level-count')!;
    this.root.querySelectorAll<HTMLButtonElement>('.level-card').forEach((card) => {
      this.cards.push(card);
    });

    this.root.querySelectorAll<HTMLButtonElement>('button[data-level]').forEach((button) => {
      button.addEventListener('click', () => {
        const name = button.dataset.level || null;
        onPlay(name, button.dataset.campaign === '1');
      });
    });

    this.searchInput.addEventListener('input', () => {
      this.searchClear.classList.toggle('visible', this.searchInput.value.length > 0);
      this.applySearch();
    });
    this.searchClear.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchClear.classList.remove('visible');
      this.applySearch();
      this.searchInput.focus();
    });

    document.body.appendChild(this.root);
    syncThemeButtons();
  }

  private cardMarkup(entry: LevelEntry): string {
    const number = entry.name.replace(/^level/i, '').padStart(2, '0');
    return `
      <button type="button" class="level-card m3-card elevated"
        data-level="${entry.name}" data-search="${entry.name} ${entry.label}">
        <span class="level-number">${number}</span>
        <span class="level-info"><strong>${entry.label}</strong></span>
      </button>
    `;
  }

  private applySearch() {
    const query = this.searchInput.value.trim().toLowerCase();
    let visible = 0;
    for (const card of this.cards) {
      const show = !query || (card.dataset.search ?? '').toLowerCase().includes(query);
      card.classList.toggle('hidden-by-filter', !show);
      if (show) visible++;
    }
    const total = this.cards.length;
    this.countElement.textContent = query
      ? `${visible} OF ${total} LEVELS`
      : `${total} LEVELS`;
  }
}
