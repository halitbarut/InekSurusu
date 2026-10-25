import { sleep } from '../dom';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FACE_COLORS = ['#ffe08a', '#ffc9c9', '#c9e4ff', '#d4f2c4', '#f3d1ff', '#ffd9b0', '#c7f0ea', '#e9e3c6'];

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * Sekizgen topaç: yukarıdan görünen, 8 yüzlü, dönüp bir yüzde duran topaç.
 * Üstteki ok, gelen sayıyı gösterir.
 */
export class Spinner {
  readonly el: HTMLDivElement;
  private rotor: SVGGElement;
  private rotation = 0;
  private faces = 8;

  constructor(size = 180, accent = '#333') {
    this.el = document.createElement('div');
    this.el.className = 'spinner';
    this.el.style.width = `${size}px`;
    this.el.style.height = `${size + 14}px`;
    const root = svg('svg', { viewBox: '-110 -122 220 234', width: size, height: size + 14 });
    // Gölge
    root.appendChild(svg('ellipse', { cx: 6, cy: 102, rx: 70, ry: 9, fill: 'rgba(0,0,0,0.12)' }));
    this.rotor = svg('g', { class: 'spinner-rotor' });
    const R = 96;
    const pt = (k: number, r: number) => {
      // Köşeler yüzlerin arasında: yüz k merkezi k*45° (0 = yukarı)
      const ang = ((k * 360) / this.faces - 90 - 180 / this.faces) * (Math.PI / 180);
      return [Math.cos(ang) * r, Math.sin(ang) * r];
    };
    for (let k = 0; k < this.faces; k++) {
      const [x1, y1] = pt(k, R);
      const [x2, y2] = pt(k + 1, R);
      this.rotor.appendChild(
        svg('polygon', {
          points: `0,0 ${x1},${y1} ${x2},${y2}`,
          fill: FACE_COLORS[k % FACE_COLORS.length],
          stroke: '#3a3a3a',
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
        }),
      );
      const mid = ((k * 360) / this.faces - 90) * (Math.PI / 180);
      const tx = Math.cos(mid) * 64;
      const ty = Math.sin(mid) * 64;
      const label = svg('text', {
        x: tx,
        y: ty,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': 38,
        'font-family': 'Caveat, "Patrick Hand", cursive',
        'font-weight': 700,
        fill: '#222',
        transform: `rotate(${(k * 360) / this.faces} ${tx} ${ty})`,
      });
      label.textContent = String(k + 1);
      this.rotor.appendChild(label);
    }
    // Topacın sapı
    this.rotor.appendChild(svg('circle', { r: 17, fill: '#8a5a2b', stroke: '#3a3a3a', 'stroke-width': 2.5 }));
    this.rotor.appendChild(svg('circle', { r: 6, cx: -4, cy: -4, fill: 'rgba(255,255,255,0.5)' }));
    root.appendChild(this.rotor);
    // Gösterge oku
    root.appendChild(svg('polygon', { points: '-14,-120 14,-120 0,-96', fill: accent, stroke: '#222', 'stroke-width': 2 }));
    this.el.appendChild(root);
    this.setRotation(-(Math.floor(Math.random() * 8) * 45), 0);
  }

  private setRotation(deg: number, ms: number) {
    this.rotation = deg;
    this.rotor.style.transition = ms > 0 ? `transform ${ms}ms cubic-bezier(0.12, 0.7, 0.18, 1)` : 'none';
    this.rotor.style.transform = `rotate(${deg}deg)`;
  }

  /** value (1..8) yüzünde duracak şekilde döndürür. */
  async spinTo(value: number, ms: number): Promise<void> {
    const mod = (a: number) => ((a % 360) + 360) % 360;
    const target = mod(-((value - 1) * 360) / this.faces);
    this.el.classList.remove('settled');
    if (ms <= 0) {
      this.setRotation(target, 0);
      return;
    }
    // Açıyı görsel fark olmadan normalize et, sonra hep aynı yöne birkaç tur dön
    const base = mod(this.rotation);
    this.setRotation(base, 0);
    void this.rotor.getBoundingClientRect();
    const turns = Math.max(2, Math.round(ms / 380));
    const next = target - 360 * turns - (target > base ? 360 : 0);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    this.setRotation(next, ms);
    await sleep(ms);
    this.el.classList.add('settled');
  }
}
