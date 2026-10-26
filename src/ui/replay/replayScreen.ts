import { BOT_LEVEL_NAME } from '../../bot';
import { applyReplayStep, playerStats, type GameState, type ReplayData } from '../../engine';
import { eventVisibleTo } from '../../net/protocol';
import { append, clear, download, h, toast } from '../dom';
import { eventIcon, fmtNum, formatEvent, pname } from '../format';
import { icon } from '../icons';
import { MapView } from '../game/mapView';
import { renderSummary } from '../game/summary';
import { playerSwatch } from '../playerStyle';
import { exportReplay } from '../storage';

export interface ReplayOptions {
  data: ReplayData;
  /** Günlükteki teklif satırları kimin gözünden: 'all' hepsi (yerel oyun), koltuk ya da null (izleyici) */
  viewer: number | null | 'all';
  /** Açılınca bu turun başına git */
  startRound?: number;
  onClose(): void;
}

/** Geri sarmak için her bu kadar adımda bir ara durum saklanır */
const CHECKPOINT_EVERY = 40;
const SPEEDS = [1, 2, 4, 8] as const;
/** 1x hızda iki adım arası (ms) */
const BASE_DELAY = 650;

/**
 * Oyun tekrarı oynatıcısı. Kayıt bir kez baştan sona uygulanır (ara durumlar, tur başları ve son durum
 * çıkarılır); sonra her konum en yakın ara durumdan ileri doğru hesaplanır.
 */
export class ReplayScreen {
  readonly el: HTMLElement;
  private map: MapView;
  private steps: ReplayData['steps'];
  private checkpoints = new Map<number, GameState>();
  /** Tur → o turun ilk adımının konumu */
  private roundStart = new Map<number, number>();
  /** Konum: uygulanmış adım sayısı (0 = başlangıç) */
  private pos = 0;
  private cur: GameState;
  private playing = false;
  private speed: (typeof SPEEDS)[number] = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private ready = false;

  private elInfo = h('div', { class: 'replay-info' });
  private elPlayers = h('div', { class: 'player-list' });
  private elLog = h('div', { class: 'log' });
  private elCharts = h('div', { class: 'replay-charts hidden' });
  private playBtn = h('button', { class: 'btn btn-primary btn-icon', title: 'Oynat (Boşluk)', 'aria-label': 'Oynat', onClick: () => this.toggle() }, icon('play'));
  private slider = h('input', { type: 'range', min: 0, max: 0, value: 0, step: 1, class: 'replay-slider', 'aria-label': 'Tur' });
  private sliderLabel = h('span', { class: 'replay-slider-label' });
  private progress = h('div', { class: 'replay-progress muted small' }, 'Tekrar hazırlanıyor…');
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    host: HTMLElement,
    private opts: ReplayOptions,
  ) {
    this.steps = opts.data.steps;
    this.cur = opts.data.initial;
    this.checkpoints.set(0, opts.data.initial);
    const mapHost = h('div', { class: 'map-host' });
    const speedSel = h(
      'select',
      { 'aria-label': 'Hız', title: 'Oynatma hızı', onChange: (e: Event) => (this.speed = Number((e.target as HTMLSelectElement).value) as (typeof SPEEDS)[number]) },
      SPEEDS.map((v) => h('option', { value: v, selected: v === 1 }, `${v}x`)),
    );
    this.slider.addEventListener('input', () => this.jumpToRound(Number(this.slider.value)));
    this.el = h(
      'div',
      { class: 'game-screen replay-screen' },
      h(
        'header',
        { class: 'topbar' },
        h('span', { class: 'brand' }, icon('replay'), h('span', { class: 'brand-text' }, 'Oyun tekrarı')),
        this.elInfo,
        h(
          'div',
          { class: 'top-controls' },
          h('button', { class: 'btn btn-small', title: 'Tur tur grafikler; bir tura tıklayınca oraya gider', onClick: () => this.elCharts.classList.toggle('hidden') }, 'Grafikler'),
          h('button', { class: 'btn btn-small', title: 'Tekrar dosyasını indir', onClick: () => this.download() }, icon('download'), 'İndir'),
          h('button', { class: 'btn btn-icon', title: 'Kapat (Esc)', 'aria-label': 'Tekrarı kapat', onClick: () => this.close() }, icon('close')),
        ),
      ),
      h(
        'main',
        { class: 'game-main' },
        h('div', { class: 'map-wrap' }, mapHost, this.elCharts),
        h(
          'aside',
          { class: 'sidebar' },
          h('section', {}, h('h3', {}, 'Devletler'), this.elPlayers),
          h('section', { class: 'log-section' }, h('h3', {}, 'Olay günlüğü'), this.elLog),
        ),
      ),
      h(
        'footer',
        {},
        h(
          'div',
          { class: 'replay-controls' },
          h('button', { class: 'btn btn-icon', title: 'Geri adım (←)', 'aria-label': 'Geri adım', onClick: () => this.stepBy(-1) }, icon('stepBack')),
          this.playBtn,
          h('button', { class: 'btn btn-icon', title: 'İleri adım (→)', 'aria-label': 'İleri adım', onClick: () => this.stepBy(1) }, icon('stepFwd')),
          h('label', { class: 'replay-speed' }, 'Hız ', speedSel),
          h('div', { class: 'replay-bar' }, this.slider, this.sliderLabel),
          this.progress,
        ),
      ),
    );
    host.appendChild(this.el);
    this.map = new MapView(mapHost);
    document.addEventListener('keydown', this.keyHandler);
    if (opts.data.partial) toast(`Bu kayıt oyunun ortasından (${opts.data.initial.round}. tur) başlıyor.`, 'info', 4000);
    this.render();
    void this.prepare();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    document.removeEventListener('keydown', this.keyHandler);
    this.map.destroy();
    this.el.remove();
  }

  private close() {
    this.destroy();
    this.opts.onClose();
  }

  /** Kaydı bir kez baştan sona uygular: ara durumlar, tur başları, son durum */
  private async prepare() {
    let s = this.opts.data.initial;
    this.roundStart.set(s.round, 0);
    try {
      for (let i = 0; i < this.steps.length; i++) {
        s = applyReplayStep(s, this.steps[i]).state;
        const at = i + 1;
        if (!this.roundStart.has(s.round)) {
          this.roundStart.set(s.round, at);
          this.checkpoints.set(at, s);
        } else if (at % CHECKPOINT_EVERY === 0) this.checkpoints.set(at, s);
        if (i % 300 === 299) {
          this.progress.textContent = `Tekrar hazırlanıyor… %${Math.round((at / this.steps.length) * 100)}`;
          await new Promise((r) => setTimeout(r, 0));
          if (this.destroyed) return;
        }
      }
    } catch (e) {
      this.progress.textContent = `Kayıt bu noktadan sonra oynatılamıyor: ${(e as Error).message}`;
      this.steps = this.steps.slice(0, Math.max(0, [...this.checkpoints.keys()].pop() ?? 0));
    }
    this.ready = true;
    const rounds = [...this.roundStart.keys()];
    this.slider.min = String(Math.min(...rounds));
    this.slider.max = String(Math.max(...rounds));
    this.progress.textContent = '';
    this.elCharts.append(
      h('div', { class: 'replay-charts-head' }, h('b', {}, 'Grafikler'), h('span', { class: 'muted small' }, ' — bir tura tıkla, tekrar o tura gitsin'), h('button', { class: 'icon-btn', 'aria-label': 'Kapat', onClick: () => this.elCharts.classList.add('hidden') }, icon('close'))),
      renderSummary(s, (round) => this.jumpToRound(round, true)),
    );
    if (this.opts.startRound !== undefined) this.jumpToRound(this.opts.startRound);
    this.render();
  }

  /** pos konumundaki durum (en yakın ara durumdan ileri) */
  private stateAt(pos: number): GameState {
    let base = 0;
    for (const k of this.checkpoints.keys()) if (k <= pos && k > base) base = k;
    let s = this.checkpoints.get(base)!;
    for (let i = base; i < pos; i++) s = applyReplayStep(s, this.steps[i]).state;
    return s;
  }

  private goTo(pos: number, flash = false) {
    pos = Math.max(0, Math.min(this.steps.length, pos));
    if (pos === this.pos) return;
    const prev = this.cur;
    this.cur = pos === this.pos + 1 ? applyReplayStep(this.cur, this.steps[this.pos]).state : this.stateAt(pos);
    this.pos = pos;
    if (flash) {
      // Değişen kareler kısa süre parlasın
      const changed: number[] = [];
      for (let i = 0; i < this.cur.owner.length; i++) if (this.cur.owner[i] !== prev.owner[i] || this.cur.structure[i] !== prev.structure[i]) changed.push(i);
      const o = changed.length ? this.cur.owner[changed[0]] : null;
      if (changed.length) this.map.flash(changed, o !== null ? this.cur.players[o].color : '#000');
    }
    this.render();
  }

  private stepBy(d: number) {
    if (!this.ready) return;
    this.stop();
    this.goTo(this.pos + d, d > 0);
  }

  jumpToRound(round: number, closeCharts = false) {
    if (!this.ready) return;
    const keys = [...this.roundStart.keys()];
    const r = keys.includes(round) ? round : keys.reduce((a, b) => (Math.abs(b - round) < Math.abs(a - round) ? b : a), keys[0]);
    this.stop();
    this.goTo(this.roundStart.get(r)!);
    if (closeCharts) this.elCharts.classList.add('hidden');
  }

  private toggle() {
    if (this.playing) this.stop();
    else this.play();
  }

  private play() {
    if (!this.ready) return;
    if (this.pos >= this.steps.length) this.goTo(0);
    this.playing = true;
    this.updatePlayBtn();
    const tick = () => {
      if (!this.playing || this.destroyed) return;
      if (this.pos >= this.steps.length) {
        this.stop();
        return;
      }
      this.goTo(this.pos + 1, true);
      this.timer = setTimeout(tick, BASE_DELAY / this.speed);
    };
    this.timer = setTimeout(tick, 0);
  }

  private stop() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.updatePlayBtn();
  }

  private updatePlayBtn() {
    clear(this.playBtn);
    this.playBtn.append(icon(this.playing ? 'pause' : 'play'));
    this.playBtn.setAttribute('aria-label', this.playing ? 'Duraklat' : 'Oynat');
    this.playBtn.title = this.playing ? 'Duraklat (Boşluk)' : 'Oynat (Boşluk)';
  }

  private onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
    if (document.querySelector('.modal-backdrop')) return;
    if (e.key === ' ') {
      e.preventDefault();
      this.toggle();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.stepBy(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.stepBy(-1);
    } else if (e.key === 'Escape') this.close();
  }

  private download() {
    const s = this.opts.data.initial;
    download(`inek-surusu-tekrar-${s.map.name ? s.map.name.replace(/\s+/g, '-') : s.map.seed}.json`, exportReplay(this.opts.data));
  }

  private render() {
    const s = this.cur;
    this.map.setState(s);
    // Üst bilgi
    clear(this.elInfo);
    const actor = s.phase.kind === 'conquest' ? s.phase.taker : s.currentPlayer;
    const p = s.players[actor];
    append(this.elInfo, [
      h('span', { class: 'turn-card', style: { borderColor: p.color } }, playerSwatch(p.color, p.id, 22), h('b', {}, p.name)),
      h('span', {}, s.round > 0 ? `${s.round}. tur` : 'Kurulum'),
      h('span', { class: 'muted small' }, `Adım ${this.pos} / ${this.steps.length}`),
      s.phase.kind === 'gameover' ? h('span', { class: 'tag' }, icon('trophy'), 'Oyun bitti') : null,
    ]);
    this.slider.value = String(s.round);
    this.sliderLabel.textContent = s.round > 0 ? `${s.round}. tur` : 'Kurulum';
    // Oyuncular
    clear(this.elPlayers);
    for (const pl of s.players) {
      const st = playerStats(s, pl.id);
      this.elPlayers.append(
        h(
          'div',
          { class: `player-row ${pl.id === actor ? 'current' : ''} ${pl.alive ? '' : 'dead'}`, style: pl.id === actor ? { borderLeftColor: pl.color } : {} },
          playerSwatch(pl.color, pl.id, 20),
          h(
            'div',
            { class: 'pr-main' },
            h('div', { class: 'pr-name' }, pl.name, pl.kind === 'bot' ? h('span', { class: 'tag' }, icon('bot'), BOT_LEVEL_NAME[pl.botLevel]) : null),
            pl.alive
              ? h('div', { class: 'pr-stats' }, h('span', { class: 'mini-stat' }, icon('tiles'), st.tiles), h('span', { class: 'mini-stat' }, icon('akce'), fmtNum(pl.resources.akce)), h('span', { class: 'mini-stat' }, icon('ship'), st.ships), h('span', { class: 'mini-stat' }, icon('plane'), st.planes))
              : h('div', { class: 'pr-stats' }, icon('eliminated'), `Elendi${pl.eliminatedBy !== null ? ` (${pname(s, pl.eliminatedBy)})` : ''}`),
          ),
        ),
      );
    }
    // Günlük (tekrarla birlikte ilerler)
    clear(this.elLog);
    const viewer = this.opts.viewer;
    const lines = s.log.filter((l) => viewer === 'all' || eventVisibleTo(l.event, viewer)).slice(-160).reverse();
    for (const l of lines) {
      const text = formatEvent(s, l.event);
      if (!text) continue;
      const cls = l.event.type === 'turn_start' ? 'log-turn' : l.event.type === 'battle' || l.event.type === 'eliminated' ? 'log-war' : '';
      const ic = eventIcon(l.event);
      this.elLog.append(h('div', { class: `log-line ${cls}` }, ic ? icon(ic) : null, h('span', {}, text)));
    }
  }
}
