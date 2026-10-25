import type { Rng } from './rng';
import type { SpinRound } from './types';

/** Sekizgen topacı çevirir: 1..faces eşit olasılık. */
export function spinTop(rng: Rng, faces: number): number {
  return rng.int(1, faces);
}

/** Kara (normal) savaşı: A > D ise floor((A − D) / 2) toprak. */
export function landBattleGain(a: number, d: number): number {
  return a > d ? Math.floor((a - d) / 2) : 0;
}

export function resolveLandBattle(rng: Rng, faces: number): { rounds: SpinRound[]; gain: number } {
  const a = spinTop(rng, faces);
  const d = spinTop(rng, faces);
  return { rounds: [{ a, d }], gain: landBattleGain(a, d) };
}

/**
 * Başkent / üs savaşı: saldıran art arda `streak` kez yüksek atmalı.
 * Eşitlikte atış tekrarlanır (seri bozulmaz), savunan yüksek atarsa saldırı biter.
 */
export function resolveSeriesBattle(rng: Rng, faces: number, streak: number): { rounds: SpinRound[]; success: boolean } {
  const rounds: SpinRound[] = [];
  let wins = 0;
  // Eşitlikler sonsuza kadar sürmez; yine de güvenlik sınırı
  for (let guard = 0; guard < 10_000; guard++) {
    const a = spinTop(rng, faces);
    const d = spinTop(rng, faces);
    rounds.push({ a, d });
    if (a > d) {
      wins++;
      if (wins >= streak) return { rounds, success: true };
    } else if (a < d) {
      return { rounds, success: false };
    }
  }
  return { rounds, success: false };
}

/** Seri savaşı kazanma olasılığı (eşitlikler tekrarlandığı için tek atışta p = 1/2). */
export function seriesWinProbability(streak: number): number {
  return Math.pow(0.5, streak);
}

/** Kara savaşında beklenen toprak kazancı. */
export function expectedLandGain(faces: number): number {
  let sum = 0;
  for (let a = 1; a <= faces; a++) for (let d = 1; d <= faces; d++) sum += landBattleGain(a, d);
  return sum / (faces * faces);
}
