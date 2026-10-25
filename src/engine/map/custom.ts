import { MAX_PLAYERS, MIN_PLAYERS } from '../config';
import { toSeed } from '../rng';
import { MINE_TYPES, type GameMap, type MineType, type Terrain } from '../types';
import { LAKE_MAX_SIZE, farthestFromMine, fitsStartAreas, labelComponents } from './generate';
import { buildStraitIndex, detectStraits } from './straits';

/**
 * Elle çizilen haritalar. Kullanıcı yalnızca kara/su ve madenleri belirler; göller ve boğazlar
 * oyunun kendi kurallarıyla otomatik bulunur.
 *
 * Metin biçimi (satır başına bir dize): `.` su, `#` kara, `G` altın, `O` petrol, `I` demir, `S` çelik.
 */
export interface MapDraft {
  width: number;
  height: number;
  /** true = kara */
  land: boolean[];
  mines: (MineType | null)[];
}

const MINE_CHAR: Record<MineType, string> = { gold: 'G', oil: 'O', iron: 'I', steel: 'S' };
const CHAR_MINE: Record<string, MineType> = { G: 'gold', O: 'oil', I: 'iron', S: 'steel' };

export const MAP_MIN_SIZE = 12;
export const MAP_MAX_SIZE = 90;

export function emptyDraft(width: number, height: number): MapDraft {
  return { width, height, land: new Array(width * height).fill(false), mines: new Array(width * height).fill(null) };
}

export function draftFromMap(map: GameMap): MapDraft {
  return { width: map.width, height: map.height, land: map.terrain.map((t) => t === 'land'), mines: map.mines.map((m, i) => (map.terrain[i] === 'land' ? m : null)) };
}

export function draftToRows(d: MapDraft): string[] {
  const rows: string[] = [];
  for (let y = 0; y < d.height; y++) {
    let r = '';
    for (let x = 0; x < d.width; x++) {
      const i = y * d.width + x;
      const m = d.mines[i];
      r += !d.land[i] ? '.' : m ? MINE_CHAR[m] : '#';
    }
    rows.push(r);
  }
  return rows;
}

/** Metin satırlarından taslak; biçim bozuksa hata fırlatır. */
export function draftFromRows(rows: string[]): MapDraft {
  if (!Array.isArray(rows) || rows.length < MAP_MIN_SIZE || rows.length > MAP_MAX_SIZE) throw new Error(`Harita yüksekliği ${MAP_MIN_SIZE}–${MAP_MAX_SIZE} olmalı`);
  const width = rows[0]?.length ?? 0;
  if (width < MAP_MIN_SIZE || width > MAP_MAX_SIZE) throw new Error(`Harita genişliği ${MAP_MIN_SIZE}–${MAP_MAX_SIZE} olmalı`);
  const d = emptyDraft(width, rows.length);
  rows.forEach((r, y) => {
    if (typeof r !== 'string' || r.length !== width) throw new Error('Harita satırlarının uzunlukları farklı');
    for (let x = 0; x < width; x++) {
      const ch = r[x];
      const i = y * width + x;
      if (ch === '.' || ch === '~') continue;
      if (ch !== '#' && !CHAR_MINE[ch]) throw new Error(`Haritada bilinmeyen karakter: "${ch}"`);
      d.land[i] = true;
      d.mines[i] = CHAR_MINE[ch] ?? null;
    }
  });
  return d;
}

/**
 * Taslaktan oyun haritası. Kenara değmeyen ve en fazla LAKE_MAX_SIZE karelik su kütleleri göl,
 * diğer sular denizdir (rastgele haritalardaki kuralın aynısı); boğazlar yeniden tespit edilir.
 * Haritanın kenarı karaysa bile kurallar değişmez: harita dışı yürünemez.
 */
export function buildMap(d: MapDraft, name?: string): GameMap {
  const n = d.width * d.height;
  const comp = labelComponents(d, (i) => !d.land[i]);
  const terrain: Terrain[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (d.land[i]) terrain[i] = 'land';
    else {
      const l = comp.labels[i];
      terrain[i] = comp.sizes[l] <= LAKE_MAX_SIZE && !comp.touchesBorder[l] ? 'lake' : 'sea';
    }
  }
  const straits = detectStraits(d, terrain);
  const mines = d.mines.map((m, i) => (d.land[i] ? m : null));
  const seed = toSeed(`${name ?? ''}|${draftToRows(d).join('/')}`);
  const map: GameMap = { width: d.width, height: d.height, seed, terrain, mines, straits, straitOf: buildStraitIndex(n, straits) };
  if (name) map.name = name;
  return map;
}

export interface MapCheck {
  /** En fazla kaç oyuncuya madensiz başkent + başlangıç toprağı alanı ayrılabiliyor (0 = hiç) */
  maxPlayers: number;
  /** Oyunu engelleyen sorunlar */
  errors: string[];
  /** Oynanabilir ama dikkat edilmesi gerekenler */
  warnings: string[];
  land: number;
  lakes: number;
  straits: number;
  mines: Record<MineType, number>;
}

/** Haritanın oyuncu sayısına uygunluğu ve sorunları */
export function checkMap(map: GameMap, opts: { startTerritoryCount: number; minCapitalDistance: number; maxMineDistance?: number }): MapCheck {
  const land = map.terrain.filter((t) => t === 'land').length;
  let maxPlayers = 0;
  for (let p = MAX_PLAYERS; p >= 1; p--) {
    if (fitsStartAreas(map, p, opts.startTerritoryCount, opts.minCapitalDistance)) {
      maxPlayers = p;
      break;
    }
  }
  const lakeComp = labelComponents(map, (i) => map.terrain[i] === 'lake');
  const mines = Object.fromEntries(MINE_TYPES.map((m) => [m, 0])) as Record<MineType, number>;
  for (const m of map.mines) if (m) mines[m]++;
  const errors: string[] = [];
  const warnings: string[] = [];
  const need = opts.startTerritoryCount + 1;
  if (land === 0) errors.push('Haritada hiç kara yok.');
  else if (maxPlayers < MIN_PLAYERS) {
    errors.push(
      maxPlayers === 0
        ? `Hiçbir oyuncuya madensiz başkent + ${opts.startTerritoryCount} bitişik toprak (${need} kare) ayrılamıyor.`
        : `Yalnızca ${maxPlayers} oyuncuya başlangıç alanı ayrılabiliyor; en az ${MIN_PLAYERS} gerekir. Karayı büyüt ya da madenleri kenara çek.`,
    );
  }
  for (const m of MINE_TYPES) if (mines[m] === 0) warnings.push(`Hiç ${MINE_NAME[m]} madeni yok.`);
  if (map.straits.length === 0) warnings.push('Boğaz yok: hiçbir oyuncu boğaz idare edemez.');
  if (lakeComp.sizes.length === 0) warnings.push('Göl yok.');
  if (!map.terrain.includes('sea')) warnings.push('Deniz yok: gemiler hiçbir yere gidemez.');
  if (land > 0 && MINE_TYPES.every((m) => mines[m] > 0)) {
    const far = farthestFromMine(map, need);
    const worst = Math.max(...MINE_TYPES.map((m) => far[m]));
    if (opts.maxMineDistance !== undefined && worst > opts.maxMineDistance * 1.5) warnings.push(`Bazı yerlerden en yakın madene ${worst} kare var; madenler dengesiz dağılmış olabilir.`);
  }
  return { maxPlayers, errors, warnings, land, lakes: lakeComp.sizes.length, straits: map.straits.length, mines };
}

const MINE_NAME: Record<MineType, string> = { gold: 'altın', oil: 'petrol', iron: 'demir', steel: 'çelik' };

/** Aynı türden olmayan iki kara rengi arasında 4 yönlü doldurma: start ile aynı kara/su türündeki bağlı alan */
export function fillRegion(d: MapDraft, start: number): number[] {
  const want = d.land[start];
  const seen = new Uint8Array(d.width * d.height);
  const out: number[] = [];
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    out.push(c);
    const x = c % d.width;
    const y = Math.floor(c / d.width);
    const nb = [y > 0 ? c - d.width : -1, x < d.width - 1 ? c + 1 : -1, y < d.height - 1 ? c + d.width : -1, x > 0 ? c - 1 : -1];
    for (const n of nb) {
      if (n < 0 || seen[n] || d.land[n] !== want) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return out;
}
