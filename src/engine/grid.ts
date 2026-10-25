import type { GameMap } from './types';

export interface Dims {
  width: number;
  height: number;
}

export function idx(d: Dims, x: number, y: number): number {
  return y * d.width + x;
}

export function xy(d: Dims, i: number): [number, number] {
  return [i % d.width, Math.floor(i / d.width)];
}

export function inBounds(d: Dims, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < d.width && y < d.height;
}

/** 4 yönlü komşular (yukarı, sağ, aşağı, sol) */
export function neighbors4(d: Dims, i: number): number[] {
  const w = d.width;
  const x = i % w;
  const y = Math.floor(i / w);
  const r: number[] = [];
  if (y > 0) r.push(i - w);
  if (x < w - 1) r.push(i + 1);
  if (y < d.height - 1) r.push(i + w);
  if (x > 0) r.push(i - 1);
  return r;
}

export function neighbors8(d: Dims, i: number): number[] {
  const [x, y] = xy(d, i);
  const r: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(d, nx, ny)) r.push(idx(d, nx, ny));
    }
  }
  return r;
}

export function chebyshev(d: Dims, a: number, b: number): number {
  const [ax, ay] = xy(d, a);
  const [bx, by] = xy(d, b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function manhattan(d: Dims, a: number, b: number): number {
  const [ax, ay] = xy(d, a);
  const [bx, by] = xy(d, b);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function isLand(map: GameMap, i: number): boolean {
  return map.terrain[i] === 'land';
}

/** Denize (göl değil) kıyısı olan kara karesi mi? */
export function isCoastal(map: GameMap, i: number): boolean {
  if (map.terrain[i] !== 'land') return false;
  return neighbors4(map, i).some((n) => map.terrain[n] === 'sea');
}
