import { chebyshev, idx, neighbors4, type Dims } from '../grid';
import type { Rng } from '../rng';
import type { GameMap, Terrain } from '../types';
import { LAKE_MAX_SIZE, STRAIT_MAX_LENGTH, labelComponents } from './straits';

/**
 * "Kapalı denizler" kıta tipi: haritanın kenarı karadır, kara tek parçadır, denizler kara içinde ayrı
 * havzalardır ve birbirine yalnızca boğazlarla bağlanır (Akdeniz, Karadeniz, Marmara gibi).
 *
 * Havzalar birbirinden en az BASIN_GAP kare uzakta büyütülür, sonra en kısa kıstaklardan açılan düz
 * kanallarla birleştirilir. Kara tek parça kalacağı için havza grafiği zorunlu olarak ağaçtır: bir su halkası
 * içinde kalan karayı koparırdı. Bu yüzden her boğaz bir köprüdür; boğazı atlayıp dolaşan yol yoktur.
 */

/** Haritanın kenarından en az bu kadar kare kara kalır */
const EDGE_MARGIN = 2;
/** İki havza arasında en az bu kadar Chebyshev uzaklığı */
const BASIN_GAP = 3;
/** Su kareleri (göller hariç) haritanın bu oranını kaplar */
const SEA_RATIO = 0.4;
/** Bir havza en az bu kadar kare olur (göl sınırının üstünde) */
const MIN_BASIN = LAKE_MAX_SIZE + 6;
/** En fazla bu kadar kara kareyi aşan kanal açılır */
const MAX_LINK = 12;

/** Harita boyutuna ve oyuncu sayısına göre deniz havzası sayısı */
export function basinCount(width: number, height: number, players: number): number {
  const area = width * height;
  const wanted = Math.max(Math.round(area / 260), 2 + Math.ceil(players / 2));
  return Math.max(2, Math.min(wanted, Math.floor(area / 150), 14));
}

interface Link {
  /** Kanalın düz çizgi üzerindeki kara kareleri */
  line: number[];
  a: number;
  b: number;
  /** Çizgiye dik birim adım */
  perp: number;
  score: number;
}

/** Kara/su dağılımını üretir; göl ve deniz ayrımı da yapılmış olarak döner. */
export function closedTerrain(d: Dims, players: number, rng: Rng, noise: (x: number, y: number) => number): Terrain[] {
  const { width, height } = d;
  const n = width * height;
  const basin = new Int32Array(n).fill(-1);
  const count = basinCount(width, height, players);

  const inner = (x: number, y: number) => x >= EDGE_MARGIN && y >= EDGE_MARGIN && x < width - EDGE_MARGIN && y < height - EDGE_MARGIN;

  // 1) Havza merkezleri: içeride, birbirinden olabildiğince uzak (rastgele adaylar arasından en uzak olan)
  const centers: number[] = [];
  for (let k = 0; k < count; k++) {
    let bestT = -1;
    let bestD = -1;
    for (let tries = 0; tries < 40; tries++) {
      const x = rng.int(EDGE_MARGIN + 2, width - EDGE_MARGIN - 3);
      const y = rng.int(EDGE_MARGIN + 2, height - EDGE_MARGIN - 3);
      const t = idx(d, x, y);
      const dist = centers.length ? Math.min(...centers.map((c) => chebyshev(d, c, t))) : width;
      if (dist > bestD) {
        bestD = dist;
        bestT = t;
      }
    }
    if (bestD >= BASIN_GAP + 1) centers.push(bestT);
  }

  // 2) Havzaları sırayla büyüt: her biri uzaklık + gürültü puanı en düşük komşu kareyi alır
  const total = Math.round(n * SEA_RATIO);
  const weights = centers.map(() => 0.6 + rng.next() * 0.8);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const targets = weights.map((w) => Math.max(MIN_BASIN, Math.round((total * w) / sumW)));
  const aspect = centers.map(() => 0.6 + rng.next() * 0.9);
  const allowed = (t: number, b: number) => {
    const x = t % width;
    const y = Math.floor(t / width);
    if (!inner(x, y) || basin[t] !== -1) return false;
    for (let dy = -BASIN_GAP + 1; dy < BASIN_GAP; dy++) {
      for (let dx = -BASIN_GAP + 1; dx < BASIN_GAP; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const o = basin[idx(d, nx, ny)];
        if (o !== -1 && o !== b) return false;
      }
    }
    return true;
  };
  const score = (t: number, b: number) => {
    const c = centers[b];
    const dx = ((t % width) - (c % width)) * aspect[b];
    const dy = (Math.floor(t / width) - Math.floor(c / width)) / aspect[b];
    return Math.hypot(dx, dy) / 6 + noise(t % width, Math.floor(t / width)) * 2.2;
  };
  const frontier = centers.map((c, b) => {
    basin[c] = b;
    return new Set<number>(neighbors4(d, c));
  });
  const sizes = centers.map(() => 1);
  for (let progress = true; progress; ) {
    progress = false;
    for (let b = 0; b < centers.length; b++) {
      if (sizes[b] >= targets[b]) continue;
      let pick = -1;
      let pickScore = Infinity;
      for (const t of frontier[b]) {
        if (!allowed(t, b)) {
          frontier[b].delete(t);
          continue;
        }
        const sc = score(t, b);
        if (sc < pickScore) {
          pickScore = sc;
          pick = t;
        }
      }
      if (pick < 0) continue;
      basin[pick] = b;
      sizes[b]++;
      frontier[b].delete(pick);
      for (const nb of neighbors4(d, pick)) if (basin[nb] === -1) frontier[b].add(nb);
      progress = true;
    }
  }

  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) water[i] = basin[i] >= 0 ? 1 : 0;
  openThinWater(d, water);
  relabelBasins(d, water, basin);
  fillIslands(d, water, basin);

  // 3) Havzaları en kısa kıstaklardan kanalla birleştir (Kruskal: halka oluşturan kanal açılmaz)
  const links = findLinks(d, basin, rng);
  links.sort((a, b) => a.score - b.score);
  const parent = Array.from({ length: Math.max(0, ...basin) + 1 }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const used: number[] = [];
  for (const l of links) {
    const ra = find(l.a);
    const rb = find(l.b);
    if (ra === rb) continue;
    if (used.some((u) => chebyshev(d, u, l.line[0]) < 5)) continue;
    if (!linkStillClear(d, water, l)) continue;
    carveLink(d, water, l, rng);
    parent[ra] = rb;
    used.push(l.line[0]);
  }

  // 4) Göller: kıyıdan ve kenardan uzak, küçük su kütleleri
  const lakeCount = 2 + Math.floor(n / 1500);
  for (let k = 0; k < lakeCount; k++) carveLake(d, water, rng);

  // 5) Sınıflandırma: küçük kapalı su kütleleri göl, diğerleri deniz
  const comp = labelComponents(d, (i) => water[i] === 1);
  const terrain: Terrain[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (!water[i]) terrain[i] = 'land';
    else terrain[i] = comp.sizes[comp.labels[i]] <= LAKE_MAX_SIZE ? 'lake' : 'sea';
  }
  return terrain;
}

/**
 * Bir kare genişliğindeki su uzantılarını karaya çevirir. Havzaların içinde kalan dar geçitler boğaz
 * olamayacak kadar uzun olabilir; böylece haritadaki bütün dar sular yalnızca açılan kanallardır.
 */
function openThinWater(d: Dims, water: Uint8Array) {
  const { width, height } = d;
  const isW = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && water[idx(d, x, y)] === 1;
  for (let changed = true; changed; ) {
    changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isW(x, y)) continue;
        if ((!isW(x - 1, y) && !isW(x + 1, y)) || (!isW(x, y - 1) && !isW(x, y + 1))) {
          water[idx(d, x, y)] = 0;
          changed = true;
        }
      }
    }
  }
}

/** Daralma sonrası havzaları yeniden numaralar; göl sınırının altında kalan parçalar karaya döner */
function relabelBasins(d: Dims, water: Uint8Array, basin: Int32Array) {
  const comp = labelComponents(d, (i) => water[i] === 1);
  const id = new Map<number, number>();
  for (let i = 0; i < water.length; i++) {
    basin[i] = -1;
    if (!water[i]) continue;
    const l = comp.labels[i];
    if (comp.sizes[l] < MIN_BASIN) {
      water[i] = 0;
      continue;
    }
    if (!id.has(l)) id.set(l, id.size);
    basin[i] = id.get(l)!;
  }
}

/** Ana karadan kopmuş kara parçalarını çevreleyen havzaya katar */
function fillIslands(d: Dims, water: Uint8Array, basin: Int32Array) {
  const comp = labelComponents(d, (i) => water[i] === 0);
  let main = 0;
  comp.sizes.forEach((s, l) => {
    if (s > comp.sizes[main]) main = l;
  });
  for (let i = 0; i < water.length; i++) {
    if (water[i] || comp.labels[i] === main) continue;
    water[i] = 1;
    const nb = neighbors4(d, i).find((x) => basin[x] >= 0);
    basin[i] = nb === undefined ? -2 : basin[nb];
  }
}

/** Farklı havzaları karşılıklı bakan iki su karesi arasındaki düz kıstaklar */
function findLinks(d: Dims, basin: Int32Array, rng: Rng): Link[] {
  const { width, height } = d;
  const links: Link[] = [];
  const isLandAt = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && basin[idx(d, x, y)] === -1;
  const hasSide = (x: number, y: number, px: number, py: number) => {
    const b = basin[idx(d, x, y)];
    const near = (sx: number, sy: number) => sx >= 0 && sy >= 0 && sx < width && sy < height && basin[idx(d, sx, sy)] === b;
    return near(x + px, y + py) || near(x - px, y - py);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = basin[idx(d, x, y)];
      if (a < 0) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const px = dy;
        const py = dx;
        // Kanalın ucundaki su karesi tek kare genişliğinde olmasın: boğaz orada biter
        if (!hasSide(x, y, px, py)) continue;
        const line: number[] = [];
        let cx = x + dx;
        let cy = y + dy;
        let clear = true;
        while (isLandAt(cx, cy) && line.length <= MAX_LINK) {
          if (!isLandAt(cx + px, cy + py) || !isLandAt(cx - px, cy - py)) {
            clear = false;
            break;
          }
          line.push(idx(d, cx, cy));
          cx += dx;
          cy += dy;
        }
        if (!clear || line.length === 0 || line.length > MAX_LINK) continue;
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
        const b = basin[idx(d, cx, cy)];
        if (b < 0 || b === a || !hasSide(cx, cy, px, py)) continue;
        links.push({ line, a, b, perp: idx(d, px, py) - idx(d, 0, 0), score: line.length + rng.next() * 4 });
      }
    }
  }
  return links;
}

/** Önceki kanallar ya da açılan su bu kıstağı değiştirdi mi? */
function linkStillClear(d: Dims, water: Uint8Array, l: Link): boolean {
  return l.line.every((t) => !water[t] && !water[t + l.perp] && !water[t - l.perp]) && l.line.every((t) => neighbors4(d, t).length === 4);
}

/**
 * Kıstağı açar: ortada 1 kare genişliğinde, en fazla STRAIT_MAX_LENGTH uzunluğunda boğaz; kıstak daha
 * uzunsa iki uçtan boğaza doğru 2 kare genişliğinde koy (dar olmadığı için boğaza sayılmaz).
 */
function carveLink(d: Dims, water: Uint8Array, l: Link, rng: Rng) {
  const D = l.line.length;
  const pickLen = [1, 2, 2, 3, 3, 4][rng.int(0, 5)];
  const L = Math.min(D, pickLen, STRAIT_MAX_LENGTH);
  const start = Math.floor((D - L) / 2);
  const side = rng.next() < 0.5 ? l.perp : -l.perp;
  for (let k = 0; k < D; k++) {
    const t = l.line[k];
    water[t] = 1;
    if (k >= start && k < start + L) continue;
    // Koyun ikinci sırası; harita içinde ve bir sıra dışında hâlâ kara kalacak yönde
    const partner = t + side;
    if (partner >= 0 && partner < water.length && neighbors4(d, partner).length === 4) water[partner] = 1;
  }
}

function carveLake(d: Dims, water: Uint8Array, rng: Rng) {
  const { width, height } = d;
  const n = width * height;
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
  const safe = (i: number) => {
    const x = i % width;
    const y = Math.floor(i / width);
    return dist[i] >= 3 && x >= 2 && y >= 2 && x < width - 2 && y < height - 2;
  };
  const centers: number[] = [];
  for (let i = 0; i < n; i++) if (safe(i)) centers.push(i);
  if (centers.length === 0) return;
  const size = rng.int(2, 6);
  const blob = new Set<number>([centers[rng.int(0, centers.length - 1)]]);
  const open = new Set<number>();
  for (const nb of neighbors4(d, [...blob][0])) if (safe(nb)) open.add(nb);
  while (blob.size < size && open.size > 0) {
    const arr = [...open];
    const pick = arr[rng.int(0, arr.length - 1)];
    open.delete(pick);
    blob.add(pick);
    for (const nb of neighbors4(d, pick)) if (!blob.has(nb) && safe(nb)) open.add(nb);
  }
  for (const t of blob) water[t] = 1;
}

/** Kapalı denizler haritasının yapısal şartları; sorun yoksa boş dizi. */
export function closedMapProblems(map: GameMap, players: number): string[] {
  const problems: string[] = [];
  const { width, height, terrain } = map;
  const land = labelComponents(map, (i) => terrain[i] === 'land');
  if (land.sizes.length !== 1) problems.push(`Kara ${land.sizes.length} parça`);
  for (let i = 0; i < terrain.length; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && terrain[i] !== 'land') {
      problems.push('Harita kenarında su var');
      break;
    }
  }
  const straitTiles = new Set(map.straits.flatMap((s) => s.tiles));
  const all = labelComponents(map, (i) => terrain[i] === 'sea');
  const basins = labelComponents(map, (i) => terrain[i] === 'sea' && !straitTiles.has(i));
  if (basins.sizes.length < 2) problems.push('Tek deniz havzası var');
  if (all.sizes.length !== 1) problems.push('Havzalar boğazla bağlanamadı');
  for (const s of map.straits) {
    const ends = new Set<number>();
    for (const t of s.tiles) for (const nb of neighbors4(map, t)) if (basins.labels[nb] >= 0) ends.add(basins.labels[nb]);
    if (ends.size !== 2) problems.push(`Boğaz B${s.id + 1} iki ayrı havzayı bağlamıyor`);
  }
  const wanted = basinCount(width, height, players);
  if (basins.sizes.length < wanted) problems.push(`Havza sayısı az (${basins.sizes.length} < ${wanted})`);
  // Her oyuncu kıyıya yakın bir başlangıç alanı bulabilmeli
  const coasts: number[] = [];
  for (let i = 0; i < terrain.length; i++) if (terrain[i] === 'land' && neighbors4(map, i).some((n) => terrain[n] === 'sea')) coasts.push(i);
  const spots: number[] = [];
  for (const c of coasts) if (spots.every((s) => chebyshev(map, s, c) >= 6)) spots.push(c);
  if (spots.length < players) problems.push(`Kıyı az: ${spots.length} oyuncuya yetiyor`);
  return problems;
}
