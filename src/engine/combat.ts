import type { Rng } from './rng';
import type { SpinRound } from './types';

/** Sekizgen topacı çevirir: 1..faces eşit olasılık. */
export function spinTop(rng: Rng, faces: number): number {
  return rng.int(1, faces);
}

export interface LandOutcome {
  /** Saldıranın alacağı toprak (A > D ise A − D) */
  gain: number;
  /** Savunanın karşı saldırıyla alacağı toprak (A < D ise ceil((D − A) / 2)) */
  loss: number;
}

/** Kara (normal) savaşı sonucu. Eşitlikte ikisi de 0. */
export function landBattleOutcome(a: number, d: number): LandOutcome {
  if (a > d) return { gain: a - d, loss: 0 };
  if (a < d) return { gain: 0, loss: Math.ceil((d - a) / 2) };
  return { gain: 0, loss: 0 };
}

export function resolveLandBattle(rng: Rng, faces: number): { rounds: SpinRound[] } & LandOutcome {
  const a = spinTop(rng, faces);
  const d = spinTop(rng, faces);
  return { rounds: [{ a, d }], ...landBattleOutcome(a, d) };
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

/** Tüm topaç sonuçları üzerinden kara savaşı sonuç dağılımı (her biri 1/faces² olasılıklı). */
export function landOutcomes(faces: number): LandOutcome[] {
  const r: LandOutcome[] = [];
  for (let a = 1; a <= faces; a++) for (let d = 1; d <= faces; d++) r.push(landBattleOutcome(a, d));
  return r;
}

/** Kara savaşında beklenen kazanç ve kayıp (toprak sınırı olmadan). */
export function expectedLandResult(faces: number): LandOutcome {
  const all = landOutcomes(faces);
  return {
    gain: all.reduce((s, o) => s + o.gain, 0) / all.length,
    loss: all.reduce((s, o) => s + o.loss, 0) / all.length,
  };
}
