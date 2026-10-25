import { neighbors4, neighbors8 } from './grid';
import { planeBlockedTiles, straitPolicyFor } from './helpers';
import type { GameState } from './types';

/** Vergi her zaman mesafeden önce gelir: önce en ucuz, sonra en kısa rota */
const TOLL_WEIGHT = 1_000_000;

export interface TollCharge {
  straitId: number;
  controller: number;
  amount: number;
}

export interface Route {
  target: number;
  /** Başlangıç karesi (tersane/fabrika) hariç, hedef dahil */
  path: number[];
  toll: number;
  tolls: TollCharge[];
}

export interface RouteMap {
  /** Ulaşılabilir hedef kara kareleri */
  targets: Set<number>;
  routeTo(target: number): Route | null;
}

class MinHeap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(cost: number, node: number) {
    const a = this.items;
    a.push([cost, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Gemi rotaları: tersaneden deniz kareleri (göl değil) üzerinden kıyı karelerine.
 * Kapalı boğazlar geçilemez; vergili boğazlarda en ucuz rota seçilir.
 */
export function shipRoutes(state: GameState, player: number, from: number): RouteMap {
  const map = state.map;
  const n = map.terrain.length;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-2);
  const heap = new MinHeap();

  const enterCost = (fromTile: number, to: number): number => {
    const sid = map.straitOf[to];
    if (sid < 0 || (fromTile >= 0 && map.straitOf[fromTile] === sid)) return 1;
    const pol = straitPolicyFor(state, sid, player);
    if (!pol.allow) return Infinity;
    return 1 + pol.toll * TOLL_WEIGHT;
  };

  for (const s of neighbors4(map, from)) {
    if (map.terrain[s] !== 'sea') continue;
    const c = enterCost(-1, s);
    if (c < cost[s]) {
      cost[s] = c;
      prev[s] = -1;
      heap.push(c, s);
    }
  }
  while (heap.size > 0) {
    const [c, u] = heap.pop();
    if (c > cost[u]) continue;
    for (const v of neighbors4(map, u)) {
      if (map.terrain[v] !== 'sea') continue;
      const nc = c + enterCost(u, v);
      if (nc < cost[v]) {
        cost[v] = nc;
        prev[v] = u;
        heap.push(nc, v);
      }
    }
  }

  // Her kıyı karesi için en ucuz komşu deniz karesi
  const via = new Map<number, number>();
  for (let s = 0; s < n; s++) {
    if (cost[s] === Infinity) continue;
    for (const t of neighbors4(map, s)) {
      if (map.terrain[t] !== 'land' || t === from) continue;
      const cur = via.get(t);
      if (cur === undefined || cost[s] < cost[cur]) via.set(t, s);
    }
  }

  return {
    targets: new Set(via.keys()),
    routeTo(target) {
      const s = via.get(target);
      if (s === undefined) return null;
      const sea: number[] = [];
      for (let c = s; c !== -1; c = prev[c]) sea.push(c);
      sea.reverse();
      const tolls: TollCharge[] = [];
      let last = -1;
      for (const t of sea) {
        const sid = map.straitOf[t];
        if (sid >= 0 && (last < 0 || map.straitOf[last] !== sid)) {
          const pol = straitPolicyFor(state, sid, player);
          const controller = state.straits[sid].controller;
          if (pol.toll > 0 && controller !== null) tolls.push({ straitId: sid, controller, amount: pol.toll });
        }
        last = t;
      }
      return { target, path: [...sea, target], toll: tolls.reduce((a, b) => a + b.amount, 0), tolls };
    },
  };
}

/**
 * Uçak rotaları: fabrikadan haritanın her yerine (8 yönlü), ancak müttefik
 * olmayan askeri üslerin engel alanlarına girmeden ve içinden geçmeden.
 */
export function planeRoutes(state: GameState, player: number, from: number): RouteMap {
  const map = state.map;
  const n = map.terrain.length;
  const blocked = planeBlockedTiles(state, player);
  const prev = new Int32Array(n).fill(-2);
  const targets = new Set<number>();
  if (!blocked[from]) {
    prev[from] = -1;
    let frontier = [from];
    while (frontier.length) {
      const next: number[] = [];
      for (const c of frontier) {
        for (const v of neighbors8(map, c)) {
          if (prev[v] !== -2 || blocked[v]) continue;
          prev[v] = c;
          next.push(v);
          if (map.terrain[v] === 'land') targets.add(v);
        }
      }
      frontier = next;
    }
  }
  return {
    targets,
    routeTo(target) {
      if (!targets.has(target)) return null;
      const path: number[] = [];
      for (let c = target; c !== from; c = prev[c]) path.push(c);
      path.reverse();
      return { target, path, toll: 0, tolls: [] };
    },
  };
}
