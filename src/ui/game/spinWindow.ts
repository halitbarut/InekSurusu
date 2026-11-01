import { clear, h, sleep, type Child } from '../dom';
import { fmtNum } from '../format';
import { icon } from '../icons';
import { playerSwatch } from '../playerStyle';
import { Spinner } from './spinner';

export interface SpinWindowModel {
  playerId: number;
  name: string;
  color: string;
  /** Bu turun gelir özeti satırları */
  summary: Child[];
  onSpin(): void;
  /** Öğreticide pencere yalnızca harita alanını kaplar (rehber görünsün) */
  mount: HTMLElement;
  inMap: boolean;
}

/**
 * Sıra başındaki büyük topaç penceresi: oyuncu, gelir özeti, büyük topaç ve "Çevir". Topaç durunca sonuç büyük
 * gösterilir, pencere kısa süre sonra kendiliğinden ya da tıklanınca kapanır. "Haritaya bak" geçici olarak küçültür.
 */
export class SpinWindow {
  readonly playerId: number;
  /** Topaç dönüyor ya da sonuç gösteriliyor */
  playing = false;
  private spinner: Spinner;
  private layer: HTMLElement;
  private pill: HTMLElement;
  private result = h('div', { class: 'sw-result', 'aria-live': 'polite' });
  private controls: HTMLElement;
  private spinBtn: HTMLButtonElement;
  private closed = false;

  constructor(model: SpinWindowModel) {
    this.playerId = model.playerId;
    this.spinner = new Spinner(Math.min(250, Math.round(window.innerHeight * 0.32)), model.color);
    this.spinBtn = h('button', { class: 'btn btn-primary btn-big sw-spin', dataset: { spinButton: '1' }, onClick: () => model.onSpin() }, icon('spin'), 'Çevir');
    this.controls = h('div', { class: 'sw-controls' }, this.spinBtn, h('button', { class: 'btn', onClick: () => this.minimize() }, icon('eye'), 'Haritaya bak'));
    const card = h(
      'div',
      { class: 'overlay-card spin-window turn-window', style: { borderTopColor: model.color }, role: 'dialog', 'aria-label': `${model.name}: topaç` },
      h('div', { class: 'tw-head' }, playerSwatch(model.color, model.playerId, 34), h('div', { class: 'tw-name' }, model.name)),
      h('div', { class: 'sw-summary' }, model.summary),
      this.spinner.el,
      this.result,
      this.controls,
      h('div', { class: 'muted small sw-hint' }, 'Boşluk tuşu da çevirir'),
    );
    this.layer = h('div', { class: `spin-layer ${model.inMap ? 'in-map' : ''}` }, card);
    this.pill = h('button', { class: 'btn btn-primary spin-pill hidden', onClick: () => this.restore() }, icon('spin'), 'Topaç penceresine dön');
    model.mount.append(this.layer, this.pill);
    this.spinBtn.focus({ preventScroll: true });
  }

  minimize() {
    this.layer.classList.add('hidden');
    this.pill.classList.remove('hidden');
  }

  restore() {
    this.layer.classList.remove('hidden');
    this.pill.classList.add('hidden');
  }

  get minimized(): boolean {
    return this.layer.classList.contains('hidden');
  }

  /** Topacı döndürür, sonucu büyük gösterir; süre dolunca ya da tıklanınca biter */
  async play(value: number, akce: number, debt: number, f: number) {
    if (this.closed) return;
    this.playing = true;
    this.restore();
    clear(this.controls);
    this.layer.querySelector('.sw-hint')?.remove();
    await this.spinner.spinTo(value, 1500 * f);
    this.result.textContent = `${value} → +${fmtNum(akce)} akçe`;
    if (debt > 0) this.result.append(h('div', { class: 'sw-debt' }, `Borç taksiti: −${fmtNum(debt)} akçe`));
    this.result.classList.add('pop');
    const clicked = new Promise<void>((r) => this.layer.addEventListener('click', () => r(), { once: true }));
    await Promise.race([clicked, sleep(1400 * f)]);
    this.playing = false;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.layer.remove();
    this.pill.remove();
  }
}

/** Başka oyuncuların topacı: ortada küçük, kendiliğinden kapanan, oyunu engellemeyen pencere */
export async function showSmallSpin(name: string, color: string, value: number, akce: number, f: number) {
  const spinner = new Spinner(120, color);
  const result = h('div', { class: 'spin-result small' }, ' ');
  const el = h('div', { class: 'spin-soft' }, h('div', { class: 'overlay-card' }, h('div', { class: 'overlay-title' }, h('span', { class: 'dot', style: { background: color } }), `${name} topacı çeviriyor…`), spinner.el, result));
  document.body.appendChild(el);
  await spinner.spinTo(value, 1100 * f);
  result.textContent = `${value} → +${fmtNum(akce)} akçe`;
  result.classList.add('pop');
  await sleep(800 * f);
  el.remove();
}
