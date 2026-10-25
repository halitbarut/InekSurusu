import { idx, inBounds, neighbors4, type Dims } from '../grid';
import type { Strait, Terrain } from '../types';

/** Boğaz en fazla bu kadar kare uzunluğunda olabilir */
export const STRAIT_MAX_LENGTH = 4;
/** Boğaz kapatıldığında iki uç arasında bundan kısa bir su yolu varsa boğaz sayılmaz */
export const STRAIT_DETOUR_LIMIT = 30;
/** Boğazın bağladığı her su kütlesi en az bu büyüklükte olmalı */
export const STRAIT_MIN_BODY = 10;

type Pred = (i: number) => boolean;

/** Su üzerinde BFS mesafesi; limit aşılırsa Infinity. */
export function waterDistance(
  d: Dims,
  isWater: Pred,
  from: number,
  to: number,
  excluded: Set<number> | null,
  limit: number,
): number {
  if (from === to) return 0;
  const dist = new Map<number, number>([[from, 0]]);
  let frontier = [from];
  for (let step = 1; step <= limit && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const c of frontier) {
      for (const n of neighbors4(d, c)) {
        if (dist.has(n) || !isWater(n) || excluded?.has(n)) continue;
        if (n === to) return step;
        dist.set(n, step);
        next.push(n);
      }
    }
    frontier = next;
  }
  return Infinity;
}

/** from karesinden ulaşılabilen su kütlesi en az min kare mi? */
export function bodyAtLeast(d: Dims, isWater: Pred, from: number, excluded: Set<number> | null, min: number): boolean {
  const seen = new Set<number>([from]);
  const stack = [from];
  while (stack.length > 0) {
    const c = stack.pop()!;
    for (const n of neighbors4(d, c)) {
      if (seen.has(n) || !isWater(n) || excluded?.has(n)) continue;
      seen.add(n);
      if (seen.size >= min) return true;
      stack.push(n);
    }
  }
  return seen.size >= min;
}

/**
 * Boğazları tespit eder: iki yanında kara olan, 1 kare genişliğinde, en fazla
 * STRAIT_MAX_LENGTH uzunluğunda deniz geçitleri. Geçit kapatıldığında iki ucu
 * arasında kısa bir su yolu kalmamalı ve iki uç da büyük su kütlelerine açılmalı.
 */
export function detectStraits(d: Dims, terrain: Terrain[]): Strait[] {
  const sea = (x: number, y: number) => inBounds(d, x, y) && terrain[idx(d, x, y)] === 'sea';
  const land = (x: number, y: number) => inBounds(d, x, y) && terrain[idx(d, x, y)] === 'land';
  const isSea: Pred = (i) => terrain[i] === 'sea';
  const straits: Strait[] = [];

  const consider = (tiles: number[], endA: number, endB: number, banks: number[], orientation: 'h' | 'v') => {
    if (tiles.length > STRAIT_MAX_LENGTH) return;
    const ex = new Set(tiles);
    if (waterDistance(d, isSea, endA, endB, ex, STRAIT_DETOUR_LIMIT) !== Infinity) return;
    if (!bodyAtLeast(d, isSea, endA, ex, STRAIT_MIN_BODY)) return;
    if (!bodyAtLeast(d, isSea, endB, ex, STRAIT_MIN_BODY)) return;
    straits.push({ id: straits.length, tiles, banks, orientation });
  };

  // Yatay geçitler: kuzey ve güney kara, doğu ve batı deniz
  const narrowH = (x: number, y: number) => sea(x, y) && land(x, y - 1) && land(x, y + 1) && sea(x - 1, y) && sea(x + 1, y);
  for (let y = 0; y < d.height; y++) {
    let x = 0;
    while (x < d.width) {
      if (!narrowH(x, y)) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < d.width && narrowH(x, y)) x++;
      const tiles: number[] = [];
      const banks: number[] = [];
      for (let k = x0; k < x; k++) {
        tiles.push(idx(d, k, y));
        banks.push(idx(d, k, y - 1), idx(d, k, y + 1));
      }
      consider(tiles, idx(d, x0 - 1, y), idx(d, x, y), banks, 'h');
    }
  }

  // Dikey geçitler: doğu ve batı kara, kuzey ve güney deniz
  const narrowV = (x: number, y: number) => sea(x, y) && land(x - 1, y) && land(x + 1, y) && sea(x, y - 1) && sea(x, y + 1);
  for (let x = 0; x < d.width; x++) {
    let y = 0;
    while (y < d.height) {
      if (!narrowV(x, y)) {
        y++;
        continue;
      }
      const y0 = y;
      while (y < d.height && narrowV(x, y)) y++;
      const tiles: number[] = [];
      const banks: number[] = [];
      for (let k = y0; k < y; k++) {
        tiles.push(idx(d, x, k));
        banks.push(idx(d, x - 1, k), idx(d, x + 1, k));
      }
      consider(tiles, idx(d, x, y0 - 1), idx(d, x, y), banks, 'v');
    }
  }

  return straits;
}

export function buildStraitIndex(size: number, straits: Strait[]): number[] {
  const straitOf = new Array<number>(size).fill(-1);
  for (const s of straits) for (const t of s.tiles) straitOf[t] = s.id;
  return straitOf;
}
