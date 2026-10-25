import { SPEND_KEYS, type GameState, type PlayerSnapshot, type SpendKey } from '../../engine';
import { clear, download, h } from '../dom';
import { fmtNum } from '../format';
import { playerDash } from '../playerStyle';

const SPEND_NAME: Record<SpendKey, string> = {
  claim: 'Toprak',
  build: 'İnşa',
  produce: 'Üretim',
  battle: 'Savaş masrafı',
  upkeep: 'Bakım',
  toll: 'Boğaz vergisi',
};

const SVG = 'http://www.w3.org/2000/svg';

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...children: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

interface Series {
  name: string;
  color: string;
  dash: string;
  /** Tur sırasına göre değer; elendikten sonra null */
  values: (number | null)[];
  elimIndex: number | null;
}

/** Elenme anlarını işaretleyen, üzerine gelince tur değerlerini gösteren çizgi grafiği */
function lineChart(rounds: number[], series: Series[], unit: string): HTMLElement {
  const W = 720;
  const H = 300;
  const m = { l: 56, r: 92, t: 14, b: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const maxV = Math.max(1, ...series.flatMap((x) => x.values.filter((v): v is number => v !== null)));
  const step = niceStep(maxV / 4);
  const top = Math.ceil(maxV / step) * step;
  const n = Math.max(1, rounds.length - 1);
  const X = (i: number) => m.l + (i / n) * iw;
  const Y = (v: number) => m.t + ih - (v / top) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });
  // Izgara ve eksenler (soluk)
  for (let v = 0; v <= top; v += step) {
    svg.append(s('line', { x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v), class: 'chart-grid' }));
    svg.append(s('text', { x: m.l - 8, y: Y(v) + 4, class: 'chart-tick', 'text-anchor': 'end' }, fmtNum(v)));
  }
  const xStep = Math.max(1, Math.ceil(rounds.length / 8));
  for (let i = 0; i < rounds.length; i += xStep) svg.append(s('text', { x: X(i), y: H - 12, class: 'chart-tick', 'text-anchor': 'middle' }, String(rounds[i])));
  svg.append(s('text', { x: m.l + iw / 2, y: H - 0, class: 'chart-axis-label', 'text-anchor': 'middle' }, 'tur'));
  // Çizgiler
  const labels: { y: number; text: string; color: string }[] = [];
  for (const sr of series) {
    let d = '';
    let pen = false;
    sr.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      pen = true;
    });
    svg.append(s('path', { d, class: 'chart-line', stroke: sr.color, 'stroke-dasharray': sr.dash }));
    if (sr.elimIndex !== null) {
      // Elenme: çizginin sıfıra indiği yerde çarpı
      const x = X(sr.elimIndex);
      const y = Y(0);
      svg.append(s('path', { d: `M${x - 6},${y - 6}L${x + 6},${y + 6}M${x + 6},${y - 6}L${x - 6},${y + 6}`, class: 'chart-elim', stroke: sr.color }, s('title', {}, `${sr.name} ${rounds[sr.elimIndex]}. turda elendi`)));
    } else {
      const lastI = sr.values.length - 1;
      const v = sr.values[lastI];
      if (v !== null) labels.push({ y: Y(v), text: sr.name, color: sr.color });
    }
  }
  // Doğrudan etiketler (yalnızca hayatta kalanlar, üst üste binmesin)
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
  for (const l of labels) {
    svg.append(s('circle', { cx: m.l + iw + 8, cy: l.y - 4, r: 4, fill: l.color }));
    svg.append(s('text', { x: m.l + iw + 16, y: l.y, class: 'chart-label' }, l.text));
  }
  // Üzerine gelme: dikey çizgi + ipucu
  const cross = s('line', { y1: m.t, y2: m.t + ih, class: 'chart-cross', visibility: 'hidden' });
  svg.append(cross);
  const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
  svg.append(hit);
  const tip = h('div', { class: 'chart-tip hidden' });
  const wrap = h('div', { class: 'chart-wrap' }, svg, tip);
  hit.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(rounds.length - 1, Math.round(((px - m.l) / iw) * n)));
    cross.setAttribute('x1', String(X(i)));
    cross.setAttribute('x2', String(X(i)));
    cross.setAttribute('visibility', 'visible');
    clear(tip);
    tip.append(h('div', { class: 'tip-head' }, `${rounds[i]}. tur`));
    const rows = series.map((sr) => ({ sr, v: sr.values[i] })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
    for (const { sr, v } of rows) tip.append(h('div', {}, h('span', { class: 'dot small', style: { background: sr.color } }), ` ${sr.name}: `, h('b', {}, v === null ? 'elendi' : `${fmtNum(v)}${unit}`)));
    tip.classList.remove('hidden');
    const left = ((X(i) / W) * r.width) + 14;
    tip.style.left = `${Math.min(left, r.width - tip.offsetWidth - 4)}px`;
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    tip.classList.add('hidden');
  });
  return wrap;
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= raw) return k * p;
  return 10 * p;
}

function seriesFor(state: GameState, key: keyof PlayerSnapshot): { rounds: number[]; series: Series[] } {
  const st = state.stats;
  const snaps = st?.rounds ?? [];
  const rounds = snaps.map((r) => r.round);
  const series = state.players.map((p) => {
    const elim = st?.eliminations.find((e) => e.player === p.id);
    // Elendiği turun kaydında değer 0'dır; sonrası çizilmez
    const elimIndex = elim ? snaps.findIndex((r) => r.round >= elim.round) : -1;
    return {
      name: p.name,
      color: p.color,
      dash: playerDash(p.id),
      values: snaps.map((r, i) => (elimIndex >= 0 && i > elimIndex ? null : (r.players[p.id]?.[key] ?? 0))),
      elimIndex: elimIndex >= 0 ? elimIndex : null,
    };
  });
  return { rounds, series };
}

/** İndirilebilir özet */
export function summaryJson(state: GameState) {
  const st = state.stats;
  return {
    app: 'inek-surusu-summary',
    exportedAt: new Date().toISOString(),
    map: state.map.name ?? `seed ${state.map.seed}`,
    rounds: state.round,
    winners: (state.winners ?? []).map((w) => state.players[w].name),
    players: state.players.map((p) => {
      const t = st?.totals[p.id];
      const elim = st?.eliminations.find((e) => e.player === p.id);
      return {
        name: p.name,
        kind: p.kind,
        botLevel: p.kind === 'bot' ? p.botLevel : undefined,
        eliminatedRound: elim?.round ?? null,
        eliminatedBy: elim ? state.players[elim.by].name : null,
        spend: t?.spend ?? null,
        battlesWon: t?.battlesWon ?? 0,
        battlesLost: t?.battlesLost ?? 0,
        battlesTied: t?.battlesTied ?? 0,
        capitalAttempts: t?.capitalAttempts ?? 0,
      };
    }),
    history: (st?.rounds ?? []).map((r) => ({ round: r.round, players: r.players })),
  };
}

/** Zafer ekranının özet bölümü: sekmeli grafikler ve tablo */
export function renderSummary(state: GameState): HTMLElement {
  const st = state.stats;
  const body = h('div', { class: 'summary-body' });
  const tabs: [string, () => HTMLElement][] = [
    ['Toprak', () => chartPanel(state, 'tiles', '', 'Her oyuncunun tur sonundaki toprak sayısı. × elenme anı.')],
    ['Akçe', () => chartPanel(state, 'akce', ' akçe', 'Tur sonundaki akçe stoku.')],
    ['Özet tablo', () => table(state)],
  ];
  const tabBar = h('div', { class: 'tabs', role: 'tablist' });
  const show = (k: number) => {
    clear(body);
    body.append(tabs[k][1]());
    [...tabBar.children].forEach((b, i) => {
      b.classList.toggle('active', i === k);
      b.setAttribute('aria-selected', String(i === k));
    });
  };
  tabs.forEach(([name], i) => tabBar.append(h('button', { class: 'tab', role: 'tab', onClick: () => show(i) }, name)));
  show(0);
  const noData = !st || st.rounds.length < 2;
  return h(
    'div',
    { class: 'summary' },
    noData ? h('p', { class: 'muted small' }, 'Bu kayıtta tur geçmişi eksik (eski bir sürümde başlamış olabilir); grafikler kısmi.') : null,
    tabBar,
    body,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn btn-small', onClick: () => download(`inek-surusu-ozet-${state.map.seed}.json`, JSON.stringify(summaryJson(state), null, 1)) }, 'Özeti JSON indir'),
    ),
  );
}

function chartPanel(state: GameState, key: keyof PlayerSnapshot, unit: string, caption: string): HTMLElement {
  const { rounds, series } = seriesFor(state, key);
  const legend = h(
    'div',
    { class: 'chart-legend' },
    series.map((sr) => h('span', { class: 'legend-item' }, legendSwatch(sr.color, sr.dash), sr.name)),
  );
  return h('div', {}, h('p', { class: 'muted small' }, caption), legend, rounds.length ? lineChart(rounds, series, unit) : h('p', { class: 'muted' }, 'Veri yok.'));
}

function legendSwatch(color: string, dash: string): SVGElement {
  return s('svg', { width: 28, height: 10, class: 'legend-swatch' }, s('line', { x1: 1, x2: 27, y1: 5, y2: 5, stroke: color, 'stroke-width': 2.5, 'stroke-dasharray': dash }));
}

function table(state: GameState): HTMLElement {
  const st = state.stats;
  const head = h('tr', {}, h('th', {}, 'Oyuncu'), h('th', {}, 'Elendi'), SPEND_KEYS.map((k) => h('th', { class: 'num-col' }, SPEND_NAME[k])), h('th', { class: 'num-col' }, 'Toplam'), h('th', { class: 'num-col' }, 'Kazandığı savaş'), h('th', { class: 'num-col' }, 'Kaybettiği'), h('th', { class: 'num-col' }, 'Başkent savaşı denemesi'));
  const rows = state.players.map((p) => {
    const t = st?.totals[p.id];
    const elim = st?.eliminations.find((e) => e.player === p.id);
    const total = t ? SPEND_KEYS.reduce((a, k) => a + t.spend[k], 0) : 0;
    return h(
      'tr',
      { class: p.alive ? '' : 'dead' },
      h('td', {}, h('span', { class: 'dot small', style: { background: p.color } }), ` ${p.name}`),
      h('td', {}, elim ? `${elim.round}. tur (${state.players[elim.by].name})` : '—'),
      SPEND_KEYS.map((k) => h('td', { class: 'num-col' }, t ? fmtNum(t.spend[k]) : '—')),
      h('td', { class: 'num-col' }, h('b', {}, fmtNum(total))),
      h('td', { class: 'num-col' }, t ? t.battlesWon : '—'),
      h('td', { class: 'num-col' }, t ? t.battlesLost : '—'),
      h('td', { class: 'num-col' }, t ? t.capitalAttempts : '—'),
    );
  });
  return h(
    'div',
    {},
    h('p', { class: 'muted small' }, `Toplam ${state.round} tur. Harcamalar akçe cinsinden; teklifle verilen akçe harcama sayılmaz. Eşitlikle biten savaşlar kazanılan ya da kaybedilen sayılmaz.`),
    h('div', { class: 'table-scroll' }, h('table', { class: 'table summary-table' }, h('thead', {}, head), h('tbody', {}, rows))),
  );
}
