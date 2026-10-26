import { unitsAt, type GameMap, type GameState } from '../../engine';
import { MINE_COLOR, RES_ICON, STRUCT_ICON, straitLabel } from '../format';
import { iconImage, type IconName } from '../icons';
import { hatchShapes, playerHatch } from '../playerStyle';

export type HighlightStyle = 'claim' | 'attack' | 'build' | 'select' | 'pick' | 'guide';

export interface Highlight {
  /** Vurgulanacak hedef kare grupları (her grubun kendi rengi) */
  groups?: { tiles: Set<number>; style: HighlightStyle }[];
  /** Kırmızı taranacak kareler (uçak menzil dışı vb.) */
  danger?: Uint8Array | null;
  selected?: Set<number> | null;
  route?: number[] | null;
  /** Kareye iliştirilmiş küçük etiketler (ör. rotadaki boğaz vergisi) */
  labels?: { tile: number; text: string }[] | null;
}

const PAPER = '#fbf8ef';
const GRID = 'rgba(86, 140, 200, 0.28)';
const SEA = '#cfe2f3';
const LAKE = '#c6e6df';
const PENCIL = '#3b3a36';
const STYLE_COLORS: Record<HighlightStyle, [string, string]> = {
  claim: ['rgba(255, 205, 40, 0.42)', '#b88600'],
  pick: ['rgba(255, 205, 40, 0.42)', '#b88600'],
  attack: ['rgba(235, 60, 50, 0.30)', '#b3261e'],
  build: ['rgba(70, 170, 90, 0.32)', '#1f7a35'],
  select: ['rgba(90, 120, 255, 0.30)', '#2b47c9'],
  guide: ['rgba(160, 60, 220, 0.38)', '#7a1fb8'],
};

/** Deterministik küçük titreşim (el çizimi hissi) */
function jitter(i: number, k: number): number {
  let x = (i * 374761393 + k * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (((x ^ (x >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.12;
}

interface Flash {
  tiles: number[];
  color: string;
  start: number;
}

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState | null = null;
  private map: GameMap | null = null;
  private hl: Highlight = {};
  private scale = 20;
  private offX = 0;
  private offY = 0;
  private dpr = 1;
  private hover = -1;
  private dirty = true;
  private raf = 0;
  private seaPath = new Path2D();
  private lakePath = new Path2D();
  private coastPath = new Path2D();
  private hatch: CanvasPattern | null = null;
  private flashes: Flash[] = [];
  private mover: { x: number; y: number; icon: IconName } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; moved: boolean } | null = null;
  private pinchDist = 0;
  private resizeObs: ResizeObserver;
  private fitted = false;
  /** Kullanıcı kaydırdı/yakınlaştırdıysa boyut değişince otomatik sığdırma yapılmaz */
  private userMoved = false;

  onTileClick: ((tile: number, clientX: number, clientY: number) => void) | null = null;
  onHover: ((tile: number, clientX: number, clientY: number) => void) | null = null;
  /** Harita kaydırıldı ya da yakınlaştırıldı */
  onViewChange: (() => void) | null = null;

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.bindInput();
    this.resize();
    this.loop();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.canvas.remove();
  }

  setState(state: GameState) {
    // Harita oyun boyunca değişmez; durum her eylemde kopyalandığı için içeriğe bakarak karşılaştır
    const m = state.map;
    if (!this.map || this.map.seed !== m.seed || this.map.width !== m.width || this.map.height !== m.height) {
      this.fitted = false;
      this.map = m;
      this.buildStatic();
    }
    this.state = state;
    if (!this.fitted) this.fit();
    this.dirty = true;
  }

  setHighlight(hl: Highlight) {
    this.hl = hl;
    this.dirty = true;
  }

  flash(tiles: number[], color: string) {
    if (tiles.length === 0) return;
    this.flashes.push({ tiles, color, start: performance.now() });
    this.dirty = true;
  }

  fit() {
    if (!this.map) return;
    const w = this.host.clientWidth || 800;
    const h = this.host.clientHeight || 600;
    this.scale = Math.max(4, Math.min(w / this.map.width, h / this.map.height) * 0.96);
    this.offX = (w - this.map.width * this.scale) / 2;
    this.offY = (h - this.map.height * this.scale) / 2;
    this.fitted = true;
    this.userMoved = false;
    this.dirty = true;
  }

  zoomBy(factor: number) {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.zoomAt(w / 2, h / 2, factor);
  }

  centerOn(tile: number) {
    if (!this.map) return;
    const x = (tile % this.map.width) + 0.5;
    const y = Math.floor(tile / this.map.width) + 0.5;
    this.offX = this.host.clientWidth / 2 - x * this.scale;
    this.offY = this.host.clientHeight / 2 - y * this.scale;
    this.userMoved = true;
    this.dirty = true;
  }

  /** Bir birim simgesini rota boyunca hareket ettirir. */
  async animatePath(from: number, path: number[], icon: IconName, msPerTile: number): Promise<void> {
    if (!this.map || msPerTile <= 0 || path.length === 0) return;
    const w = this.map.width;
    const pts = [from, ...path].map((t) => [(t % w) + 0.5, Math.floor(t / w) + 0.5]);
    const total = (pts.length - 1) * msPerTile;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const tt = Math.min(1, (performance.now() - start) / total);
        const f = tt * (pts.length - 1);
        const k = Math.min(pts.length - 2, Math.floor(f));
        const local = f - k;
        this.mover = {
          x: pts[k][0] + (pts[k + 1][0] - pts[k][0]) * local,
          y: pts[k][1] + (pts[k + 1][1] - pts[k][1]) * local,
          icon,
        };
        this.dirty = true;
        if (tt < 1) requestAnimationFrame(step);
        else {
          this.mover = null;
          this.dirty = true;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  // ------------------------------------------------------------------

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if ((!this.fitted || !this.userMoved) && this.map) this.fit();
    this.dirty = true;
  }

  private buildStatic() {
    const m = this.map!;
    this.seaPath = new Path2D();
    this.lakePath = new Path2D();
    this.coastPath = new Path2D();
    for (let i = 0; i < m.terrain.length; i++) {
      const x = i % m.width;
      const y = Math.floor(i / m.width);
      if (m.terrain[i] === 'sea') this.seaPath.rect(x, y, 1, 1);
      else if (m.terrain[i] === 'lake') this.lakePath.rect(x, y, 1, 1);
      else {
        // Kıyı çizgileri: karanın suya bakan kenarları, hafif titrek
        const edges: [number, number, number, number, number][] = [
          [i - m.width, x, y, x + 1, y],
          [i + 1, x + 1, y, x + 1, y + 1],
          [i + m.width, x, y + 1, x + 1, y + 1],
          [i - 1, x, y, x, y + 1],
        ];
        edges.forEach(([n, x1, y1, x2, y2], k) => {
          const inside =
            (k === 0 && y > 0) || (k === 1 && x < m.width - 1) || (k === 2 && y < m.height - 1) || (k === 3 && x > 0);
          if (inside && m.terrain[n] === 'land') return;
          this.coastPath.moveTo(x1 + jitter(i, k), y1 + jitter(i, k + 7));
          this.coastPath.quadraticCurveTo((x1 + x2) / 2 + jitter(i, k + 3), (y1 + y2) / 2 + jitter(i, k + 5), x2 + jitter(n, k + 1), y2 + jitter(n, k + 9));
        });
      }
    }
    // Su taraması deseni
    const pc = document.createElement('canvas');
    pc.width = pc.height = 16;
    const p = pc.getContext('2d')!;
    p.strokeStyle = 'rgba(40, 90, 160, 0.26)';
    p.lineWidth = 1.2;
    p.beginPath();
    p.moveTo(-4, 4);
    p.lineTo(4, -4);
    p.moveTo(0, 16);
    p.lineTo(16, 0);
    p.moveTo(12, 20);
    p.lineTo(20, 12);
    p.stroke();
    this.hatch = this.ctx.createPattern(pc, 'repeat');
  }

  private tileAt(clientX: number, clientY: number): number {
    if (!this.map) return -1;
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - r.left - this.offX) / this.scale);
    const y = Math.floor((clientY - r.top - this.offY) / this.scale);
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return -1;
    return y * this.map.width + x;
  }

  private zoomAt(sx: number, sy: number, factor: number) {
    const ns = Math.max(4, Math.min(90, this.scale * factor));
    const f = ns / this.scale;
    this.offX = sx - (sx - this.offX) * f;
    this.offY = sy - (sy - this.offY) * f;
    this.scale = ns;
    this.userMoved = true;
    this.dirty = true;
    this.onViewChange?.();
  }

  private bindInput() {
    const c = this.canvas;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.dragStart = { x: e.clientX, y: e.clientY, moved: false };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.dragStart) this.dragStart.moved = true;
      }
    });
    c.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (prev) {
        if (this.pointers.size === 1) {
          const dx = e.clientX - prev.x;
          const dy = e.clientY - prev.y;
          if (this.dragStart && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 5) this.dragStart.moved = true;
          if (this.dragStart?.moved) {
            this.offX += dx;
            this.offY += dy;
            this.userMoved = true;
            this.dirty = true;
            this.onViewChange?.();
          }
        } else if (this.pointers.size === 2) {
          this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const [a, b] = [...this.pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const r = c.getBoundingClientRect();
          if (this.pinchDist > 0) this.zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / this.pinchDist);
          this.pinchDist = d;
        }
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      const t = this.tileAt(e.clientX, e.clientY);
      if (t !== this.hover) {
        this.hover = t;
        this.dirty = true;
      }
      this.onHover?.(t, e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      const wasSingle = this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (wasSingle && this.dragStart && !this.dragStart.moved && e.type === 'pointerup') {
        const t = this.tileAt(e.clientX, e.clientY);
        if (t >= 0) this.onTileClick?.(t, e.clientX, e.clientY);
      }
      if (this.pointers.size === 0) this.dragStart = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      this.hover = -1;
      this.dirty = true;
      this.onHover?.(-1, 0, 0);
    });
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.flashes.length) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
  };

  private draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    const s = this.state;
    const m = this.map;
    if (!s || !m) return;
    const sc = this.scale * this.dpr;
    ctx.setTransform(sc, 0, 0, sc, this.offX * this.dpr, this.offY * this.dpr);
    const px = 1 / this.scale; // 1 ekran pikseli, dünya biriminde

    // Görünen kare aralığı
    const x0 = Math.max(0, Math.floor(-this.offX / this.scale) - 1);
    const y0 = Math.max(0, Math.floor(-this.offY / this.scale) - 1);
    const x1 = Math.min(m.width - 1, Math.ceil((W / this.dpr - this.offX) / this.scale) + 1);
    const y1 = Math.min(m.height - 1, Math.ceil((H / this.dpr - this.offY) / this.scale) + 1);

    // Defter kareleri (haritanın dışına da taşar)
    const gx0 = Math.floor(-this.offX / this.scale) - 1;
    const gy0 = Math.floor(-this.offY / this.scale) - 1;
    const gx1 = Math.ceil((W / this.dpr - this.offX) / this.scale) + 1;
    const gy1 = Math.ceil((H / this.dpr - this.offY) / this.scale) + 1;
    if (this.scale >= 6) {
      ctx.strokeStyle = GRID;
      ctx.lineWidth = px;
      ctx.beginPath();
      for (let x = gx0; x <= gx1; x++) {
        ctx.moveTo(x, gy0);
        ctx.lineTo(x, gy1);
      }
      for (let y = gy0; y <= gy1; y++) {
        ctx.moveTo(gx0, y);
        ctx.lineTo(gx1, y);
      }
      ctx.stroke();
    }

    // Su
    ctx.fillStyle = SEA;
    ctx.fill(this.seaPath);
    ctx.fillStyle = LAKE;
    ctx.fill(this.lakePath);
    if (this.hatch) {
      const mat = new DOMMatrix().scale(1 / 22, 1 / 22);
      this.hatch.setTransform(mat);
      ctx.fillStyle = this.hatch;
      ctx.fill(this.seaPath);
      ctx.fill(this.lakePath);
    }

    // Sahiplik boyaması (yarı saydam + pastel boya çizgileri)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * m.width + x;
        const o = s.owner[i];
        if (o === null) continue;
        const col = s.players[o].color;
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
        if (this.scale >= 8) {
          // Oyuncuya özgü tarama deseni: renkleri ayırt edemeyenler için
          const shape = hatchShapes(playerHatch(o));
          ctx.globalAlpha = 0.6;
          ctx.strokeStyle = col;
          ctx.fillStyle = col;
          ctx.lineWidth = 0.08;
          ctx.beginPath();
          for (const [x1, y1, x2, y2] of shape.lines) {
            ctx.moveTo(x + x1 + jitter(i, 1) * 0.3, y + y1);
            ctx.lineTo(x + x2, y + y2 + jitter(i, 2) * 0.3);
          }
          ctx.stroke();
          for (const [cx, cy, r] of shape.dots) {
            ctx.beginPath();
            ctx.arc(x + cx, y + cy, Math.abs(r), 0, Math.PI * 2);
            if (r > 0) ctx.fill();
            else ctx.stroke();
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // Kıyılar
    ctx.strokeStyle = PENCIL;
    ctx.lineWidth = Math.max(1.4 * px, 0.06);
    ctx.lineCap = 'round';
    ctx.stroke(this.coastPath);

    // Sınırlar: farklı sahipli komşu karalar arasında kalın çizgi
    ctx.lineWidth = Math.max(2.2 * px, 0.1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i: number = y * m.width + x;
        const o = s.owner[i];
        if (o === null) continue;
        ctx.strokeStyle = s.players[o].color;
        ctx.beginPath();
        const right = x < m.width - 1 ? i + 1 : -1;
        const down = y < m.height - 1 ? i + m.width : -1;
        const up = y > 0 ? i - m.width : -1;
        const left = x > 0 ? i - 1 : -1;
        const e = 0.07;
        if (up < 0 || s.owner[up] !== o) {
          ctx.moveTo(x + e, y + e);
          ctx.lineTo(x + 1 - e, y + e);
        }
        if (right < 0 || s.owner[right] !== o) {
          ctx.moveTo(x + 1 - e, y + e);
          ctx.lineTo(x + 1 - e, y + 1 - e);
        }
        if (down < 0 || s.owner[down] !== o) {
          ctx.moveTo(x + e, y + 1 - e);
          ctx.lineTo(x + 1 - e, y + 1 - e);
        }
        if (left < 0 || s.owner[left] !== o) {
          ctx.moveTo(x + e, y + e);
          ctx.lineTo(x + e, y + 1 - e);
        }
        ctx.stroke();
      }
    }

    // Boğazlar: kanalın ortasından yakadan yakaya kesikli çizgi
    for (const st of m.straits) {
      const ctl = s.straits[st.id]?.controller ?? null;
      ctx.strokeStyle = ctl === null ? '#7a6f5a' : s.players[ctl].color;
      ctx.lineWidth = Math.max(2.5 * px, 0.12);
      ctx.setLineDash([0.18, 0.12]);
      ctx.beginPath();
      for (const t of st.tiles) {
        const tx = t % m.width;
        const ty = Math.floor(t / m.width);
        if (st.orientation === 'h') {
          ctx.moveTo(tx + 0.5, ty + 0.05);
          ctx.lineTo(tx + 0.5, ty + 0.95);
        } else {
          ctx.moveTo(tx + 0.05, ty + 0.5);
          ctx.lineTo(tx + 0.95, ty + 0.5);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (this.scale >= 12) {
        const t = st.tiles[Math.floor(st.tiles.length / 2)];
        ctx.fillStyle = '#5a4a2a';
        ctx.font = `bold 0.42px "Patrick Hand", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(straitLabel(st.id), (t % m.width) + 0.5, Math.floor(t / m.width) + 0.5);
      }
    }

    // Tehlike (uçak engel alanı)
    if (this.hl.danger) {
      ctx.fillStyle = 'rgba(220, 30, 30, 0.2)';
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) if (this.hl.danger[y * m.width + x]) ctx.fillRect(x, y, 1, 1);
      }
    }

    // Hedef vurgusu
    for (const g of this.hl.groups ?? []) {
      if (g.tiles.size === 0) continue;
      const [fill, stroke] = STYLE_COLORS[g.style];
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 260);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(2 * px, 0.08);
      ctx.globalAlpha = pulse;
      for (const t of g.tiles) {
        const x = t % m.width;
        const y = Math.floor(t / m.width);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        ctx.fillRect(x, y, 1, 1);
        ctx.strokeRect(x + 0.12, y + 0.12, 0.76, 0.76);
        if (g.style === 'attack') {
          // Saldırı hedefleri sahip rengi üstünde de seçilsin diye çarpı
          ctx.beginPath();
          ctx.moveTo(x + 0.28, y + 0.28);
          ctx.lineTo(x + 0.72, y + 0.72);
          ctx.moveTo(x + 0.72, y + 0.28);
          ctx.lineTo(x + 0.28, y + 0.72);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      this.dirty = true; // nabız animasyonu
    }

    // Maden simgeleri: renkli daire içinde ikon (çok uzaktan yalnızca daire)
    const ready = () => (this.dirty = true);
    if (this.scale >= 7) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * m.width + x;
          const mine = m.mines[i];
          if (!mine) continue;
          const hasStruct = s.structure[i] !== null;
          const cx = hasStruct ? x + 0.24 : x + 0.5;
          const cy = hasStruct ? y + 0.24 : y + 0.5;
          const r = hasStruct ? 0.2 : 0.32;
          ctx.fillStyle = MINE_COLOR[mine];
          ctx.strokeStyle = PENCIL;
          ctx.lineWidth = 0.05;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (this.scale * r >= 5) {
            const img = iconImage(RES_ICON[mine], mine === 'gold' ? '#3a2a00' : '#ffffff', ready);
            if (img) ctx.drawImage(img, cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
          }
        }
      }
    }

    // Yapılar ve birimler
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * m.width + x;
        const st = s.structure[i];
        if (!st) continue;
        const o = s.owner[i];
        // Kâğıt rengi zemin, sahibinin renginde çerçeve
        ctx.fillStyle = 'rgba(255, 253, 246, 0.92)';
        ctx.strokeStyle = o !== null ? s.players[o].color : PENCIL;
        ctx.lineWidth = st === 'capital' ? 0.1 : 0.06;
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.52, st === 'capital' ? 0.46 : 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const img = iconImage(STRUCT_ICON[st], PENCIL, ready);
        const sz = st === 'capital' ? 0.72 : 0.62;
        if (img) ctx.drawImage(img, x + 0.5 - sz / 2, y + 0.52 - sz / 2, sz, sz);
        if (st === 'shipyard' || st === 'factory') {
          const n = unitsAt(s, i).length;
          if (n > 0 && this.scale >= 9) {
            ctx.fillStyle = PENCIL;
            ctx.beginPath();
            ctx.arc(x + 0.84, y + 0.82, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `bold 0.3px "Patrick Hand", sans-serif`;
            ctx.fillText(String(n), x + 0.84, y + 0.84);
          }
        }
      }
    }

    // Seçili kareler
    if (this.hl.selected && this.hl.selected.size) {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(2.5 * px, 0.1);
      ctx.setLineDash([0.2, 0.12]);
      for (const t of this.hl.selected) ctx.strokeRect((t % m.width) + 0.06, Math.floor(t / m.width) + 0.06, 0.88, 0.88);
      ctx.setLineDash([]);
    }

    // Rota
    if (this.hl.route && this.hl.route.length > 1) {
      ctx.strokeStyle = 'rgba(30, 30, 30, 0.7)';
      ctx.lineWidth = Math.max(2 * px, 0.08);
      ctx.setLineDash([0.25, 0.15]);
      ctx.beginPath();
      this.hl.route.forEach((t, k) => {
        const cx = (t % m.width) + 0.5;
        const cy = Math.floor(t / m.width) + 0.5;
        if (k === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      // Uç: hedef karesine ok başı yerine halka
      const end = this.hl.route[this.hl.route.length - 1];
      ctx.beginPath();
      ctx.arc((end % m.width) + 0.5, Math.floor(end / m.width) + 0.5, 0.38, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const l of this.hl.labels ?? []) {
      const lx = (l.tile % m.width) + 0.5;
      const ly = Math.floor(l.tile / m.width) - 0.15;
      ctx.font = `bold 0.5px "Patrick Hand", sans-serif`;
      const w = ctx.measureText(l.text).width + 0.3;
      ctx.fillStyle = '#fff8c9';
      ctx.strokeStyle = PENCIL;
      ctx.lineWidth = 0.05;
      ctx.fillRect(lx - w / 2, ly - 0.32, w, 0.62);
      ctx.strokeRect(lx - w / 2, ly - 0.32, w, 0.62);
      ctx.fillStyle = PENCIL;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.text, lx, ly);
    }

    // Değişen kareler için parlama
    const now = performance.now();
    this.flashes = this.flashes.filter((f) => now - f.start < 900);
    for (const f of this.flashes) {
      const a = 1 - (now - f.start) / 900;
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 0.14;
      for (const t of f.tiles) {
        const grow = (1 - a) * 0.3;
        ctx.strokeRect((t % m.width) - grow, Math.floor(t / m.width) - grow, 1 + grow * 2, 1 + grow * 2);
      }
    }
    ctx.globalAlpha = 1;

    // Fare altındaki kare
    if (this.hover >= 0) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(2 * px, 0.07);
      ctx.strokeRect(this.hover % m.width, Math.floor(this.hover / m.width), 1, 1);
    }

    // Hareket eden birim
    if (this.mover) {
      const img = iconImage(this.mover.icon, PENCIL);
      ctx.fillStyle = 'rgba(255, 253, 246, 0.9)';
      ctx.beginPath();
      ctx.arc(this.mover.x, this.mover.y, 0.5, 0, Math.PI * 2);
      ctx.fill();
      if (img) ctx.drawImage(img, this.mover.x - 0.42, this.mover.y - 0.42, 0.84, 0.84);
    }

    // Harita çerçevesi
    ctx.strokeStyle = PENCIL;
    ctx.lineWidth = Math.max(2 * px, 0.08);
    ctx.strokeRect(0, 0, m.width, m.height);
  }
}
