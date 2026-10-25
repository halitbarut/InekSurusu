import { chebyshev, idx, neighbors4, neighbors8, type Dims } from '../grid';
import { createRng, mixSeed, shuffle, type Rng } from '../rng';
import { MINE_TYPES, type GameMap, type MineType, type Terrain } from '../types';
import { STRAIT_DETOUR_LIMIT, buildStraitIndex, detectStraits, waterDistance } from './straits';

export interface MapGenOptions {
  width: number;
  height: number;
  seed: number;
  players: number;
  minesPerTypePerPlayer: number;
  startTerritoryCount: number;
  /** Başkentler arası en az mesafe (yerleşim kontrolü için, varsayılan 5) */
  minCapitalDistance?: number;
  /** Maden düzeni (varsayılan 'spread') */
  mineLayout?: 'spread' | 'random';
  /** 'spread' düzeninde her türün en yakın madenine en fazla uzaklık (varsayılan 10) */
  maxMineDistance?: number;
}

/** Bu büyüklüğe kadar, haritanın kenarına değmeyen su kütleleri göl sayılır */
export const LAKE_MAX_SIZE = 14;
const LAND_RATIO = 0.5;
const MAX_ATTEMPTS = 25;

/**
 * Tohumdan deterministik harita üretir. Gereksinimleri (yeterli kara, en az
 * birkaç boğaz, en az bir göl) sağlamayan denemeler türetilmiş tohumla tekrarlanır.
 */
export function generateMap(opts: MapGenOptions): GameMap {
  let best: GameMap | null = null;
  let bestProblems = Infinity;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const map = tryGenerate(opts, mixSeed(opts.seed, attempt));
    const problems = mapProblems(map, opts).length;
    if (problems === 0) return map;
    // Hiçbiri tam uymazsa en az sorunlu (eşitlikte en çok boğazlı) haritayı kullan
    if (problems < bestProblems || (problems === bestProblems && map.straits.length > best!.straits.length)) {
      best = map;
      bestProblems = problems;
    }
  }
  return best!;
}

/** Harita gereksinimlerini kontrol eder; sorun yoksa boş dizi döner. */
export function mapProblems(
  map: GameMap,
  opts: Pick<MapGenOptions, 'players' | 'startTerritoryCount' | 'minCapitalDistance' | 'mineLayout' | 'maxMineDistance'>,
): string[] {
  const problems: string[] = [];
  const land = map.terrain.filter((t) => t === 'land').length;
  const perPlayer = opts.startTerritoryCount + 1;
  if (land < opts.players * perPlayer * 3) problems.push('Yeterli kara yok');
  const big = labelComponents(map, (i) => map.terrain[i] === 'land').sizes.filter((s) => s >= perPlayer * 2);
  const bigLand = big.reduce((a, b) => a + b, 0);
  if (bigLand < opts.players * perPlayer * 2) problems.push('Başlangıç alanları için yeterli büyük kara parçası yok');
  if (!fitsStartAreas(map, opts.players, opts.startTerritoryCount, opts.minCapitalDistance ?? 5)) {
    problems.push('Her oyuncuya madensiz başlangıç alanı ayrılamıyor');
  }
  if (map.straits.length < 3) problems.push('Yeterli boğaz yok');
  if ((opts.mineLayout ?? 'spread') === 'spread') {
    const far = farthestFromMine(map, opts.startTerritoryCount + 1);
    const limit = opts.maxMineDistance ?? 10;
    for (const t of MINE_TYPES) if (far[t] > limit) problems.push(`${t} madenine ${far[t]} kare uzak kara var (sınır ${limit})`);
  }
  if (!map.terrain.includes('lake')) problems.push('Göl yok');
  return problems;
}

/**
 * Her oyuncunun madensiz kareler üzerinden başkent + `startTerritory` bitişik toprak
 * seçebileceği, birbirinden ayrık alanlar var mı? Açgözlü yerleştirme ile kontrol edilir
 * (alanları sıkı paketlediği için temkinli bir kontroldür).
 */
export function fitsStartAreas(map: GameMap, players: number, startTerritory: number, minCapitalDistance: number): boolean {
  const n = map.width * map.height;
  const used = new Uint8Array(n);
  const caps: number[] = [];
  const need = startTerritory + 1;
  const free = (i: number) => map.terrain[i] === 'land' && !map.mines[i] && !used[i];
  for (let placed = 0; placed < players; placed++) {
    let ok = false;
    for (let i = 0; i < n && !ok; i++) {
      if (!free(i) || caps.some((c) => chebyshev(map, c, i) < minCapitalDistance)) continue;
      const area = [i];
      const seen = new Set(area);
      for (let k = 0; k < area.length && area.length < need; k++) {
        for (const nb of neighbors4(map, area[k])) {
          if (area.length >= need) break;
          if (!seen.has(nb) && free(nb)) {
            seen.add(nb);
            area.push(nb);
          }
        }
      }
      if (area.length < need) continue;
      for (const t of area) used[t] = 1;
      caps.push(i);
      ok = true;
    }
    if (!ok) return false;
  }
  return true;
}

function tryGenerate(opts: MapGenOptions, seed: number): GameMap {
  const { width, height } = opts;
  const d: Dims = { width, height };
  const n = width * height;
  const rng = createRng(seed);

  // 1) Yükseklik haritası: fraktal değer gürültüsü + kenarlara doğru batış
  const feature = Math.max(7, Math.min(14, width / 4));
  const h = new Float64Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = fbm(x / feature, y / feature, seed);
      const dx = Math.abs(((x + 0.5) / width) * 2 - 1);
      const dy = Math.abs(((y + 0.5) / height) * 2 - 1);
      const edge = Math.max(0, (Math.max(dx, dy) - 0.68) / 0.32);
      v -= edge * edge * 0.75;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) v = -10;
      h[idx(d, x, y)] = v;
    }
  }
  const sorted = Array.from(h).sort((a, b) => a - b);
  const threshold = sorted[Math.floor((1 - LAND_RATIO) * n)];
  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) water[i] = h[i] < threshold ? 1 : 0;

  // 2) Tek karelik su deliklerini doldur
  {
    const comp = labelComponents(d, (i) => water[i] === 1);
    for (let i = 0; i < n; i++) if (water[i] && comp.sizes[comp.labels[i]] <= 1) water[i] = 0;
  }

  // 3) İç deniz(ler): karanın ortasında kapalı büyük su kütlesi
  const innerSeas = width * height >= 2400 ? 2 : 1;
  for (let k = 0; k < innerSeas; k++) {
    const dist = landDistance(d, water);
    const centers = range(n).filter((i) => dist[i] >= 5);
    if (centers.length === 0) break;
    const target = Math.round(rng.int(16, 30) * Math.sqrt((width * height) / 1200));
    carveBlob(d, water, centers[rng.int(0, centers.length - 1)], target, (i) => dist[i] >= 3, rng);
  }

  // 4) Göller
  const lakeCount = 2 + Math.floor((width * height) / 1500);
  for (let k = 0; k < lakeCount; k++) {
    const dist = landDistance(d, water);
    const centers = range(n).filter((i) => dist[i] >= 3);
    if (centers.length === 0) break;
    carveBlob(d, water, centers[rng.int(0, centers.length - 1)], rng.int(2, 6), (i) => dist[i] >= 2, rng);
  }

  // 5) Boğazlar: büyük su kütlelerini ayıran ince kara şeritlerini 1 kare genişliğinde aç
  const straitTarget = 3 + Math.floor(opts.players / 2);
  const carved: number[] = [];
  for (let k = 0; k < straitTarget; k++) {
    const cand = findStraitCandidate(d, water, carved, rng);
    if (!cand) break;
    for (const t of cand) water[t] = 1;
    carved.push(cand[0]);
  }

  // 6) Su sınıflandırması: küçük ve kapalı su kütleleri göldür
  const terrain: Terrain[] = new Array(n);
  {
    const comp = labelComponents(d, (i) => water[i] === 1);
    for (let i = 0; i < n; i++) {
      if (!water[i]) terrain[i] = 'land';
      else {
        const l = comp.labels[i];
        terrain[i] = comp.sizes[l] <= LAKE_MAX_SIZE && !comp.touchesBorder[l] ? 'lake' : 'sea';
      }
    }
  }

  const straits = detectStraits(d, terrain);
  const perType = opts.players * opts.minesPerTypePerPlayer;
  const mines =
    (opts.mineLayout ?? 'spread') === 'spread'
      ? placeMinesSpread(d, terrain, perType, opts.startTerritoryCount + 1, rng)
      : placeMinesRandom(d, terrain, perType, rng);
  return { width, height, seed: opts.seed, terrain, mines, straits, straitOf: buildStraitIndex(n, straits) };
}

function findStraitCandidate(d: Dims, water: Uint8Array, carved: number[], rng: Rng): number[] | null {
  const comp = labelComponents(d, (i) => water[i] === 1);
  const isWater = (i: number) => water[i] === 1;
  const isL = (x: number, y: number) => x >= 0 && y >= 0 && x < d.width && y < d.height && water[idx(d, x, y)] === 0;
  const isW = (x: number, y: number) => x >= 0 && y >= 0 && x < d.width && y < d.height && water[idx(d, x, y)] === 1;
  let best: { tiles: number[]; score: number } | null = null;

  const evaluate = (tiles: number[], a: number, b: number) => {
    if (carved.some((c) => chebyshev(d, c, tiles[0]) < 7)) return;
    const la = comp.labels[a];
    const lb = comp.labels[b];
    if (comp.sizes[la] < 20 || comp.sizes[lb] < 20) return;
    const differ = la !== lb;
    if (!differ && waterDistance(d, isWater, a, b, null, STRAIT_DETOUR_LIMIT + 2) !== Infinity) return;
    const score = (differ ? 10 : 0) + (3 - tiles.length) + rng.next() * 4;
    if (!best || score > best.score) best = { tiles, score };
  };

  for (let y = 2; y < d.height - 2; y++) {
    for (let x = 2; x < d.width - 2; x++) {
      for (let len = 1; len <= 3; len++) {
        // Yatay kanal: (x..x+len-1, y) kara, uçlar su, kuzey/güney kara
        if (isW(x - 1, y) && isW(x + len, y)) {
          let ok = true;
          for (let k = 0; k < len && ok; k++) ok = isL(x + k, y) && isL(x + k, y - 1) && isL(x + k, y + 1);
          if (ok) evaluate(rangeFrom(len, (k) => idx(d, x + k, y)), idx(d, x - 1, y), idx(d, x + len, y));
        }
        // Dikey kanal
        if (isW(x, y - 1) && isW(x, y + len)) {
          let ok = true;
          for (let k = 0; k < len && ok; k++) ok = isL(x, y + k) && isL(x - 1, y + k) && isL(x + 1, y + k);
          if (ok) evaluate(rangeFrom(len, (k) => idx(d, x, y + k)), idx(d, x, y - 1), idx(d, x, y + len));
        }
      }
    }
  }
  return best ? (best as { tiles: number[] }).tiles : null;
}

/** Yerleşmeye uygun (en az minSize karelik) kara parçalarının kareleri; hiç yoksa tüm kara */
function settleableLand(d: Dims, terrain: Terrain[], minSize: number): number[] {
  const comp = labelComponents(d, (i) => terrain[i] === 'land');
  const big: number[] = [];
  const all: number[] = [];
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] !== 'land') continue;
    all.push(i);
    if (comp.sizes[comp.labels[i]] >= minSize) big.push(i);
  }
  return big.length ? big : all;
}

const cheb = (w: number, a: number, b: number) => Math.max(Math.abs((a % w) - (b % w)), Math.abs(Math.floor(a / w) - Math.floor(b / w)));

/**
 * Dengeli yerleşim: her maden türü için önce açgözlü "en uzak nokta" (k-merkez) seçimi yapılır
 * (ilk maden rastgele, sonrakiler o türün madenlerine en uzak yerleşilebilir kareye), ardından
 * her maden kendisine en yakın karelerin en kötü uzaklığını küçültecek kareye kaydırılır.
 * Uzaklık Chebyshev'dir (başkent mesafesi ve üs yarıçapıyla aynı ölçü). Madenler birbirine bitişik olmaz.
 */
function placeMinesSpread(d: Dims, terrain: Terrain[], perType: number, minSize: number, rng: Rng): (MineType | null)[] {
  const n = d.width * d.height;
  const mines: (MineType | null)[] = new Array(n).fill(null);
  const land = shuffle(settleableLand(d, terrain, minSize), rng);
  for (const type of MINE_TYPES) {
    // Birkaç farklı başlangıç dene, en kötü uzaklığı en küçük olanı tut
    let best: number[] = [];
    let bestWorst = Infinity;
    for (let attempt = 0; attempt < SPREAD_RESTARTS; attempt++) {
      const start = land[rng.int(0, land.length - 1)];
      const placed = spreadType(d, land, mines, perType, start);
      const worst = land.reduce((a, t) => Math.max(a, placed.reduce((b, m) => Math.min(b, cheb(d.width, t, m)), Infinity)), 0);
      if (worst < bestWorst) {
        bestWorst = worst;
        best = placed;
      }
    }
    for (const m of best) mines[m] = type;
  }
  return mines;
}

const SPREAD_RESTARTS = 6;

/** Tek bir maden türü için k-merkez + 1-merkez iyileştirmesi; mines dizisini değiştirmez, yerleri döner. */
function spreadType(d: Dims, land: number[], mines: (MineType | null)[], perType: number, start: number): number[] {
  const n = d.width * d.height;
  const w = d.width;
  const taken = new Set<number>();
  const isMine = (t: number) => mines[t] !== null || taken.has(t);
  // Başka bir madene bitişik olmayan boş kare (ignore: yeri değiştirilen madenin kendisi)
  const free = (t: number, ignore = -1) => !isMine(t) && !neighbors8(d, t).some((nb) => nb !== ignore && isMine(nb));
  const placed: number[] = [];
  const dist = new Float64Array(n).fill(Infinity);
  for (let k = 0; k < perType; k++) {
    let pick = -1;
    if (k === 0 && free(start)) pick = start;
    else {
      let best = -1;
      for (const t of land) {
        if (!free(t)) continue;
        if (dist[t] > best) {
          best = dist[t];
          pick = t;
        }
      }
    }
    if (pick < 0) pick = land.find((t) => !isMine(t)) ?? -1;
    if (pick < 0) break;
    taken.add(pick);
    placed.push(pick);
    for (const t of land) dist[t] = Math.min(dist[t], cheb(w, t, pick));
  }
  // İyileştirme: her madeni kendi bölgesinin "1-merkezine" kaydır
  for (let iter = 0; iter < 6; iter++) {
    const owner = new Map<number, number[]>(placed.map((m) => [m, []]));
    for (const t of land) {
      let bm = placed[0];
      let bd = Infinity;
      for (const m of placed) {
        const dd = cheb(w, t, m);
        if (dd < bd) {
          bd = dd;
          bm = m;
        }
      }
      owner.get(bm)!.push(t);
    }
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      const m = placed[i];
      const region = owner.get(m)!;
      const radius = (c: number) => region.reduce((a, t) => Math.max(a, cheb(w, t, c)), 0);
      let bestC = m;
      let bestR = radius(m);
      for (const c of region) {
        if (c !== m && !free(c, m)) continue;
        const r = radius(c);
        if (r < bestR) {
          bestR = r;
          bestC = c;
        }
      }
      if (bestC !== m) {
        taken.delete(m);
        taken.add(bestC);
        placed[i] = bestC;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return placed;
}

/** Yerleşilebilir karelerden her türün en yakın madenine olan en büyük uzaklık (Chebyshev) */
export function farthestFromMine(map: GameMap, minSize: number): Record<MineType, number> {
  const land = settleableLand(map, map.terrain, minSize);
  const out = {} as Record<MineType, number>;
  for (const type of MINE_TYPES) {
    const ms: number[] = [];
    for (let i = 0; i < map.mines.length; i++) if (map.mines[i] === type) ms.push(i);
    let worst = 0;
    for (const t of land) {
      let best = Infinity;
      for (const m of ms) best = Math.min(best, cheb(map.width, t, m));
      worst = Math.max(worst, best);
    }
    out[type] = worst;
  }
  return out;
}

/** Eski düzen: madenler karışık kara listesine sırayla, mümkünse birbirine bitişik olmadan konur. */
function placeMinesRandom(d: Dims, terrain: Terrain[], perType: number, rng: Rng): (MineType | null)[] {
  const n = d.width * d.height;
  const mines: (MineType | null)[] = new Array(n).fill(null);
  const land = shuffle(range(n).filter((i) => terrain[i] === 'land'), rng);
  const wanted: MineType[] = [];
  for (let k = 0; k < perType; k++) wanted.push(...MINE_TYPES);
  let w = 0;
  // Önce aralıklı yerleştir, kalırsa aralık kuralını gevşet
  for (const spaced of [true, false]) {
    for (const t of land) {
      if (w >= wanted.length) break;
      if (mines[t]) continue;
      if (spaced && neighbors8(d, t).some((nb) => mines[nb])) continue;
      mines[t] = wanted[w++];
    }
  }
  return mines;
}

// ---------- yardımcılar ----------

export function labelComponents(d: Dims, pred: (i: number) => boolean) {
  const n = d.width * d.height;
  const labels = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const touchesBorder: boolean[] = [];
  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1 || !pred(i)) continue;
    const l = sizes.length;
    let size = 0;
    let border = false;
    const stack = [i];
    labels[i] = l;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % d.width;
      const y = Math.floor(c / d.width);
      if (x === 0 || y === 0 || x === d.width - 1 || y === d.height - 1) border = true;
      for (const nb of neighbors4(d, c)) {
        if (labels[nb] === -1 && pred(nb)) {
          labels[nb] = l;
          stack.push(nb);
        }
      }
    }
    sizes.push(size);
    touchesBorder.push(border);
  }
  return { labels, sizes, touchesBorder };
}

/** Her kara karesinin en yakın suya 4-yönlü uzaklığı (su kareleri 0). */
function landDistance(d: Dims, water: Uint8Array): Int32Array {
  const n = d.width * d.height;
  const dist = new Int32Array(n).fill(-1);
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) {
    if (water[i]) {
      dist[i] = 0;
      frontier.push(i);
    }
  }
  while (frontier.length) {
    const next: number[] = [];
    for (const c of frontier) {
      for (const nb of neighbors4(d, c)) {
        if (dist[nb] === -1) {
          dist[nb] = dist[c] + 1;
          next.push(nb);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

function carveBlob(d: Dims, water: Uint8Array, start: number, size: number, allowed: (i: number) => boolean, rng: Rng) {
  const blob = new Set<number>([start]);
  const frontier = new Set<number>(neighbors4(d, start).filter(allowed));
  while (blob.size < size && frontier.size > 0) {
    const arr = Array.from(frontier);
    const pick = arr[rng.int(0, arr.length - 1)];
    frontier.delete(pick);
    blob.add(pick);
    for (const nb of neighbors4(d, pick)) if (!blob.has(nb) && allowed(nb)) frontier.add(nb);
  }
  for (const t of blob) water[t] = 1;
}

function fbm(x: number, y: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(x * freq, y * freq, mixSeed(seed, o + 101));
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

function hash2(x: number, y: number, seed: number): number {
  return mixSeed(mixSeed(seed, x + 7919), y + 104729) / 4294967296;
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function rangeFrom(n: number, f: (k: number) => number): number[] {
  return Array.from({ length: n }, (_, k) => f(k));
}
