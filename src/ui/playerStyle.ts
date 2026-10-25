/**
 * Oyuncuları renk dışında da ayırt etmek için desenler: haritada her oyuncunun toprağı kendi
 * tarama deseniyle, grafiklerde kendi çizgi deseniyle çizilir. Renk körlüğüne dayanıklılık için.
 */

/** Renk körlüğü simülasyonuyla seçilmiş varsayılan oyuncu renkleri (docs/ASSUMPTIONS.md) */
export const PLAYER_COLORS = ['#2160c4', '#ea5b1e', '#921f5e', '#129390', '#9977e4', '#7b4704', '#b14e4b', '#e5518a'];

const DASHES = ['', '8 4', '2 4', '10 3 2 3', '5 5', '1 3', '12 4 4 4', '6 2 2 2 2 2'];

export function playerDash(p: number): string {
  return DASHES[p % DASHES.length];
}

export type HatchKind = 'diag' | 'anti' | 'horiz' | 'vert' | 'grid' | 'dots' | 'cross' | 'rings';
// Eğik çizgi (/) denizin taramasına benzediği için en sona kondu
const HATCHES: HatchKind[] = ['anti', 'vert', 'horiz', 'dots', 'grid', 'cross', 'rings', 'diag'];
export const HATCH_NAME: Record<HatchKind, string> = {
  diag: 'eğik çizgili',
  anti: 'ters eğik çizgili',
  horiz: 'yatay çizgili',
  vert: 'dikey çizgili',
  grid: 'kareli',
  dots: 'noktalı',
  cross: 'çarpılı',
  rings: 'halkalı',
};

export function playerHatch(p: number): HatchKind {
  return HATCHES[p % HATCHES.length];
}

/** Desenin 0..1 karesindeki çizgileri (Canvas ve SVG ortak). Noktalar ve halkalar ayrı döner. */
export function hatchShapes(kind: HatchKind): { lines: [number, number, number, number][]; dots: [number, number, number][] } {
  const lines: [number, number, number, number][] = [];
  const dots: [number, number, number][] = [];
  const a = [0.25, 0.5, 0.75];
  switch (kind) {
    case 'diag':
      lines.push([0.08, 0.42, 0.42, 0.08], [0.08, 0.92, 0.92, 0.08], [0.58, 0.92, 0.92, 0.58]);
      break;
    case 'anti':
      lines.push([0.58, 0.08, 0.92, 0.42], [0.08, 0.08, 0.92, 0.92], [0.08, 0.58, 0.42, 0.92]);
      break;
    case 'horiz':
      for (const y of a) lines.push([0.1, y, 0.9, y]);
      break;
    case 'vert':
      for (const x of a) lines.push([x, 0.1, x, 0.9]);
      break;
    case 'grid':
      lines.push([0.1, 0.35, 0.9, 0.35], [0.1, 0.68, 0.9, 0.68], [0.35, 0.1, 0.35, 0.9], [0.68, 0.1, 0.68, 0.9]);
      break;
    case 'dots':
      for (const x of a) for (const y of a) dots.push([x, y, 0.07]);
      break;
    case 'cross':
      lines.push([0.25, 0.25, 0.75, 0.75], [0.75, 0.25, 0.25, 0.75]);
      break;
    case 'rings':
      dots.push([0.5, 0.5, -0.24]);
      break;
  }
  return { lines, dots };
}

/** Oyuncu rengi ve deseniyle küçük kare örnek (oyuncu listesi, lejant) */
export function playerSwatch(color: string, p: number, size = 18): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'swatch-p');
  svg.setAttribute('aria-hidden', 'true');
  const bg = document.createElementNS(NS, 'rect');
  Object.entries({ x: '0.04', y: '0.04', width: '0.92', height: '0.92', rx: '0.18', fill: color, 'fill-opacity': '0.35', stroke: color, 'stroke-width': '0.09' }).forEach(([k, v]) => bg.setAttribute(k, v));
  svg.append(bg);
  const { lines, dots } = hatchShapes(playerHatch(p));
  for (const [x1, y1, x2, y2] of lines) {
    const l = document.createElementNS(NS, 'line');
    Object.entries({ x1, y1, x2, y2, stroke: color, 'stroke-width': '0.09', 'stroke-linecap': 'round' }).forEach(([k, v]) => l.setAttribute(k, String(v)));
    svg.append(l);
  }
  for (const [cx, cy, r] of dots) {
    const c = document.createElementNS(NS, 'circle');
    Object.entries(r > 0 ? { cx, cy, r, fill: color } : { cx, cy, r: -r, fill: 'none', stroke: color, 'stroke-width': '0.09' }).forEach(([k, v]) => c.setAttribute(k, String(v)));
    svg.append(c);
  }
  return svg;
}
