/** Tohumlanabilir rastgele sayı üreteci (mulberry32). */
export interface Rng {
  /** [0, 1) aralığında sayı */
  next(): number;
  /** [min, max] aralığında tam sayı (iki uç dahil) */
  int(min: number, max: number): number;
  /** Mevcut iç durum; createRng'ye verilirse kaldığı yerden devam eder */
  getState(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const rng: Rng = {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    getState() {
      return a;
    },
  };
  return rng;
}

/** Metin ya da sayıyı 32 bit tohuma çevirir. Saf sayı ise olduğu gibi kullanılır. */
export function toSeed(input: string | number): number {
  if (typeof input === 'number') return input >>> 0;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** İki tam sayıyı karıştırarak yeni bir tohum üretir. */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
