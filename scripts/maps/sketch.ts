import { DEFAULT_CONFIG, autoPlaceMines, buildMap, checkMap, draftToRows, emptyDraft, type GameMap, type MapDraft, type MineType } from '../../src/engine';

/**
 * Hazır haritaları çizmek için küçük bir şekil dili. Haritalar kare kare elle değil, kaba şekillerle
 * (çokgen, elips, kanal) tarif edilir, sonra ince ayarlar (tek kare kara/su, elle maden) yapılır.
 * Sonuç, harita editörünün metin biçiminde (`.` su, `#` kara, `G/O/I/S` maden) dondurulur.
 */
export class Sketch {
  readonly d: MapDraft;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.d = emptyDraft(width, height);
  }

  private set(x: number, y: number, land: boolean) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    this.d.land[i] = land;
    if (!land) this.d.mines[i] = null;
  }

  /** Kare merkezi çokgenin içindeyse (çift-tek kuralı) */
  poly(points: [number, number][], land = true): this {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i];
          const [xj, yj] = points[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, land);
      }
    }
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, land = true): this {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, land);
      }
    }
    return this;
  }

  rect(x0: number, y0: number, x1: number, y1: number, land = true): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, land);
    return this;
  }

  /** Tek tek kareler: [x, y] listesi */
  tiles(list: [number, number][], land: boolean): this {
    for (const [x, y] of list) this.set(x, y, land);
    return this;
  }

  /** Elle madenler: her kare kara olmalı ve başka bir madene (çapraz dahil) bitişik olmamalı */
  mines(list: Partial<Record<MineType, [number, number][]>>): this {
    for (const [m, pts] of Object.entries(list) as [MineType, [number, number][]][]) {
      for (const [x, y] of pts) {
        const i = y * this.width + x;
        if (!this.d.land[i]) throw new Error(`${m} madeni (${x}, ${y}) karada değil`);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * this.width + x + dx;
          if ((dx || dy) && this.d.mines[j]) throw new Error(`${m} madeni (${x}, ${y}) başka bir madene bitişik`);
        }
        this.d.mines[i] = m;
      }
    }
    return this;
  }

  /** Elle maden */
  mine(x: number, y: number, m: MineType): this {
    this.set(x, y, true);
    this.d.mines[y * this.width + x] = m;
    return this;
  }

  /**
   * Madenler: önce elle konanlar korunur, sonra her türden `perType` olana kadar dengeli otomatik yerleşim
   * (oyunun kendi yayma algoritması) eklenir. Otomatik madenler elle konanlara bitişik olmaz.
   */
  autoMines(perType: number, seed: number): this {
    const draftMap = buildMap(this.d);
    const auto = autoPlaceMines(draftMap, draftMap.terrain, perType, 1, DEFAULT_CONFIG.startTerritoryCount, seed);
    const counts: Record<MineType, number> = { gold: 0, oil: 0, iron: 0, steel: 0 };
    for (const m of this.d.mines) if (m) counts[m]++;
    const near = (i: number) => {
      const x = i % this.width;
      const y = Math.floor(i / this.width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < this.width && yy < this.height && this.d.mines[yy * this.width + xx]) return true;
      }
      return false;
    };
    auto.forEach((m, i) => {
      if (!m || counts[m] >= perType || near(i)) return;
      this.d.mines[i] = m;
      counts[m]++;
    });
    return this;
  }

  rows(): string[] {
    return draftToRows(this.d);
  }
}

/** Haritayı varsayılan kurallarla denetleyip özetini yazdırır */
export function report(name: string, map: GameMap): void {
  const c = DEFAULT_CONFIG;
  const chk = checkMap(map, { startTerritoryCount: c.startTerritoryCount, minCapitalDistance: c.minCapitalDistance, maxMineDistance: c.maxMineDistance });
  const land = map.terrain.filter((t) => t === 'land').length;
  console.log(`\n== ${name} ${map.width}×${map.height} · kara ${land} (%${Math.round((land / map.terrain.length) * 100)}) · en fazla ${chk.maxPlayers} oyuncu · boğaz ${chk.straits} · göl ${chk.lakes} · maden ${JSON.stringify(chk.mines)}`);
  for (const st of map.straits) {
    const t = st.tiles[0];
    console.log(`   boğaz B${st.id + 1}: (${t % map.width}, ${Math.floor(t / map.width)}) uzunluk ${st.tiles.length} ${st.orientation}`);
  }
  for (const e of chk.errors) console.log('   HATA:', e);
  for (const w of chk.warnings) console.log('   uyarı:', w);
}

/** Su/göl/boğaz ayrımıyla metin önizleme */
export function preview(map: GameMap): string {
  const out: string[] = [];
  for (let y = 0; y < map.height; y++) {
    let r = '';
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const t = map.terrain[i];
      r += t === 'land' ? (map.mines[i] ? { gold: 'G', oil: 'O', iron: 'I', steel: 'S' }[map.mines[i]!] : '#') : map.straitOf[i] >= 0 ? '=' : t === 'lake' ? '~' : '.';
    }
    out.push(r);
  }
  return out.join('\n');
}

/** Her maden türü için en yakın madene en uzak kara karesi (yerleşilebilir parçalarda) */
export function worstMineGaps(map: GameMap): string {
  const w = map.width;
  const out: string[] = [];
  for (const type of ['gold', 'oil', 'iron', 'steel'] as MineType[]) {
    const ms: number[] = [];
    map.mines.forEach((m, i) => m === type && ms.push(i));
    let worst = -1;
    let at = -1;
    map.terrain.forEach((t, i) => {
      if (t !== 'land') return;
      const d = Math.min(...ms.map((m) => Math.max(Math.abs((m % w) - (i % w)), Math.abs(Math.floor(m / w) - Math.floor(i / w)))));
      if (d > worst) {
        worst = d;
        at = i;
      }
    });
    out.push(`${type} ${worst} @(${at % w},${Math.floor(at / w)})`);
  }
  return out.join(' · ');
}
