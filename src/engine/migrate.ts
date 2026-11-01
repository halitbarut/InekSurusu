import { DEFAULT_CONFIG } from './config';
import { refreshStraits } from './helpers';
import type { GameState } from './types';

/**
 * Eski sürümlerin kayıtlarını güncel biçime çevirir. Yalnızca oyun durumunu çevirir: eski tekrar kayıtları
 * yeni kurallarla aynı sonucu vermediği için sürüm farkında kullanılmaz (REPLAY_VERSION).
 */
export function migrateState(raw: GameState): GameState {
  const s = structuredClone(raw) as GameState;
  s.config = { ...DEFAULT_CONFIG, ...s.config };
  s.loans ??= [];
  s.loanRequests ??= [];
  s.nextLoanId ??= 1;
  // Eski boğaz durumu: tek idareci ve doğrudan oyuncu → {allow, toll} ayarları
  for (const st of s.straits as unknown as { controller?: number | null; controllers?: number[]; policies: Record<number, unknown> }[]) {
    if (st.controllers) continue;
    const old = st.policies as Record<number, { allow: boolean; toll: number }>;
    const c = st.controller ?? null;
    st.controllers = [];
    st.policies = {};
    delete st.controller;
    if (c === null) continue;
    st.controllers = [c];
    st.policies[c] = Object.fromEntries(Object.entries(old).map(([p, v]) => [p, v.allow ? { mode: v.toll > 0 ? 'toll' : 'open', toll: v.toll } : { mode: 'closed', toll: 0 }]));
  }
  // Karşılıklı çift kuralıyla söz sahipleri değişmiş olabilir
  refreshStraits(s, []);
  return s;
}
