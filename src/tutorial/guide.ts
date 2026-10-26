import { TutorialBot } from '../bot/tutorial';
import type { BotBrain } from '../bot';
import type { Action, GameState } from '../engine';
import { append, clear, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { ME } from './scenario';
import { STEPS, TOPICS } from './steps';

/** Oyun ekranının öğreticiye açtığı yüz */
export interface GuideHost {
  /** Güncel oyun durumu */
  state(): GameState;
  /** Eylemi oyuncu adına yap (önizleme sormadan) */
  act(a: Action): Promise<boolean>;
  toMenu(): void;
  newGame(): void;
}

/** Oyun ekranına takılan rehber: izin verilen eylemler, vurgulanan kareler, botların beyni */
export interface GameGuide {
  readonly el: HTMLElement;
  attach(host: GuideHost): void;
  /** Bu eyleme izin yoksa oyuncuya söylenecek ipucu */
  check(state: GameState, action: Action): string | null;
  /** Her durum değişikliğinden sonra */
  after(state: GameState): void;
  targets(state: GameState): number[];
  brain(player: number): BotBrain | null;
}

// ------------------------------------------------------------------
// İlerleme (kaldığı yerden devam)
// ------------------------------------------------------------------

const KEY = 'inek-surusu-tutorial';

export interface TutorialProgress {
  /** Sıradaki adım */
  step: number;
  /** O adımın başındaki durum */
  state: GameState | null;
  done: boolean;
  /** Ana menüdeki öneri görüldü/kapatıldı */
  seen: boolean;
}

export function loadProgress(): TutorialProgress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<TutorialProgress> | null;
    if (p && typeof p === 'object') return { step: p.step ?? 0, state: p.state ?? null, done: !!p.done, seen: !!p.seen };
  } catch {
    // yoksay
  }
  return { step: 0, state: null, done: false, seen: false };
}

export function saveProgress(patch: Partial<TutorialProgress>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadProgress(), ...patch }));
  } catch {
    // depolama yoksa yalnızca bu oturumda
  }
}

// ------------------------------------------------------------------

/** Öğretici: 11 konu, her adımda kısa açıklama, vurgulanan hedef ve tek eylem */
export class TutorialGuide implements GameGuide {
  readonly el = h('section', { class: 'tutorial-box', 'aria-live': 'polite', 'aria-label': 'Öğretici' });
  private host: GuideHost | null = null;
  private bot = new TutorialBot();
  private doing = false;

  constructor(private step: number) {}

  attach(host: GuideHost) {
    this.host = host;
    this.render();
  }

  check(state: GameState, action: Action): string | null {
    if (action.player !== ME || this.step >= STEPS.length) return null;
    // Teklif yanıtı, oylama gibi sırası olmayan eylemler botlara aittir
    return STEPS[this.step].allow(action, state) ? null : `Öğretici: ${STEPS[this.step].todo}`;
  }

  after(state: GameState) {
    const before = this.step;
    while (this.step < STEPS.length && STEPS[this.step].done(state)) this.step++;
    if (this.step !== before) {
      saveProgress({ step: this.step, state: this.step < STEPS.length ? state : null, done: this.step >= STEPS.length, seen: true });
      this.render();
    }
  }

  targets(state: GameState): number[] {
    return this.step < STEPS.length ? (STEPS[this.step].targets?.(state) ?? []) : [];
  }

  brain(): BotBrain {
    return this.bot;
  }

  private render() {
    clear(this.el);
    const host = this.host;
    if (this.step >= STEPS.length) {
      append(this.el, [
        h('div', { class: 'tb-head' }, icon('trophy'), h('b', {}, 'Öğretici bitti!')),
        h('p', {}, 'Tebrikler: topaç, toprak, madenler, inşa, üretim, bakım, savaş, sefer, boğaz, üs ve başkent savaşı, diplomasi ve kazanmayı gördün. Artık gerçek bir oyuna hazırsın. İlk oyunlarda karşına çıkan ipuçları ayarlardan kapatılabilir.'),
        h('div', { class: 'row-buttons' }, h('button', { class: 'btn', onClick: () => host?.toMenu() }, 'Ana menü'), h('button', { class: 'btn btn-primary', onClick: () => host?.newGame() }, icon('newGame'), 'Yeni oyun')),
      ]);
      return;
    }
    const st = STEPS[this.step];
    append(this.el, [
      h(
        'div',
        { class: 'tb-head' },
        icon('book'),
        h('b', {}, `Öğretici · ${st.topic}/${TOPICS.length}`),
        h('span', { class: 'muted small' }, TOPICS[st.topic - 1]),
        // Dar ekranda açıklama varsayılan olarak gizli
        h('button', { class: 'btn btn-small tb-more', 'aria-expanded': String(this.el.classList.contains('expanded')), onClick: () => this.el.classList.toggle('expanded') }, 'Açıklama'),
        h('button', { class: 'icon-btn', title: 'Öğreticiden çık (kaldığın yer kaydedilir)', 'aria-label': 'Öğreticiden çık', onClick: () => host?.toMenu() }, icon('close')),
      ),
      h('div', { class: 'tb-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': STEPS.length, 'aria-valuenow': this.step }, h('span', { style: { width: `${(this.step / STEPS.length) * 100}%` } })),
      h('h3', {}, st.title),
      h('p', { class: 'tb-text' }, st.text),
      h('p', { class: 'tb-todo' }, icon('check'), h('span', {}, st.todo)),
      h(
        'div',
        { class: 'row-buttons' },
        h('button', { class: 'btn btn-small', onClick: () => host?.toMenu() }, 'Öğreticiden çık'),
        h(
          'button',
          {
            class: 'btn btn-small',
            title: 'Bu adımın eylemini senin yerine yapar',
            onClick: async () => {
              if (!host || this.doing) return;
              this.doing = true;
              try {
                await host.act(st.script(host.state()));
              } finally {
                this.doing = false;
              }
            },
          },
          'Benim yerime yap',
        ),
      ),
    ]);
  }
}
