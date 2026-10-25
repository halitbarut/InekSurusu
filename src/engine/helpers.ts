import { BATTLES_PER_TURN } from './config';
import { chebyshev, neighbors4 } from './grid';
import type { GameEvent, GameState, Relation, StraitPolicy, Unit } from './types';

export function relKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

const EMPTY_RELATION: Relation = { allied: false, peaceUntilRound: null, allianceBrokenAtTurn: null };

export function getRelation(state: GameState, a: number, b: number): Relation {
  return state.relations[relKey(a, b)] ?? EMPTY_RELATION;
}

/** Değiştirilebilir ilişki kaydı (taslak durum üzerinde kullanılır). */
export function mutRelation(state: GameState, a: number, b: number): Relation {
  const k = relKey(a, b);
  if (!state.relations[k]) state.relations[k] = { ...EMPTY_RELATION };
  return state.relations[k];
}

export function isAllied(state: GameState, a: number, b: number): boolean {
  return a !== b && getRelation(state, a, b).allied;
}

export function atPeace(state: GameState, a: number, b: number): boolean {
  const r = getRelation(state, a, b);
  return r.peaceUntilRound !== null && state.round <= r.peaceUntilRound;
}

export const BATTLE_USED = 'Bu tur savaş hakkını kullandın';

/** Oyuncu bu turdaki tek savaş hakkını kullandı mı? */
export function battleUsed(state: GameState, p: number): boolean {
  return state.players[p].battlesThisTurn >= BATTLES_PER_TURN;
}

/** a, b'ye saldırabilir mi? Saldıramazsa nedenini döner. */
export function attackBlockReason(state: GameState, a: number, b: number): string | null {
  if (a === b) return 'Kendinize saldıramazsınız';
  const pb = state.players[b];
  if (!pb || !pb.alive) return 'Bu oyuncu oyunda değil';
  if (battleUsed(state, a)) return BATTLE_USED;
  const r = getRelation(state, a, b);
  if (r.allied) return 'Müttefikinize saldıramazsınız';
  if (atPeace(state, a, b)) return 'Barış anlaşması sürüyor';
  if (r.allianceBrokenAtTurn === state.turnCounter) return 'İttifak bu tur bozuldu; bir tur beklemelisiniz';
  return null;
}

export function alivePlayers(state: GameState): number[] {
  return state.players.filter((p) => p.alive).map((p) => p.id);
}

export function ownedTiles(state: GameState, p: number): number[] {
  const r: number[] = [];
  for (let i = 0; i < state.owner.length; i++) if (state.owner[i] === p) r.push(i);
  return r;
}

export function tileCount(state: GameState, p: number): number {
  let c = 0;
  for (const o of state.owner) if (o === p) c++;
  return c;
}

export function touchesOwn(state: GameState, p: number, tile: number): boolean {
  return neighbors4(state.map, tile).some((n) => state.owner[n] === p);
}

export function unitsAt(state: GameState, tile: number): Unit[] {
  return state.units.filter((u) => u.tile === tile);
}

export function unitCanSortie(state: GameState, u: Unit): boolean {
  const max = state.config.maxSortiesPerUnitPerTurn;
  return max <= 0 || u.sortiesThisTurn < max;
}

/** Karenin sahipliğini değiştirir; üzerindeki yapı ve birimler de yeni sahibine geçer. */
export function transferTile(state: GameState, tile: number, to: number) {
  state.owner[tile] = to;
  for (const u of state.units) if (u.tile === tile) u.owner = to;
}

export function straitController(state: GameState, straitId: number): number | null {
  const s = state.map.straits[straitId];
  const first = state.owner[s.banks[0]];
  if (first === null) return null;
  return s.banks.every((b) => state.owner[b] === first) ? first : null;
}

const OPEN_POLICY: StraitPolicy = { allow: true, toll: 0 };

/** Oyuncu p için boğaz geçiş koşulu. İdare eden yoksa ya da p idare ediyorsa serbest. */
export function straitPolicyFor(state: GameState, straitId: number, p: number): StraitPolicy {
  const st = state.straits[straitId];
  if (st.controller === null || st.controller === p) return OPEN_POLICY;
  return st.policies[p] ?? OPEN_POLICY;
}

/** Boğazların idaresini yeniden hesaplar; idare değişirse ayarlar sıfırlanır. */
export function refreshStraits(state: GameState, events: GameEvent[]) {
  for (const s of state.map.straits) {
    const c = straitController(state, s.id);
    const st = state.straits[s.id];
    if (st.controller !== c) {
      st.controller = c;
      st.policies = {};
      events.push({ type: 'strait_control', straitId: s.id, controller: c });
    }
  }
}

/** Uçakları engelleyen alanlar: p'nin müttefiki olmayan oyuncuların üsleri çevresi. */
export function planeBlockedTiles(state: GameState, p: number): Uint8Array {
  const n = state.owner.length;
  const blocked = new Uint8Array(n);
  const { baseBlockRadius: r, baseBlockMetric } = state.config;
  const bases: number[] = [];
  for (let i = 0; i < n; i++) {
    if (state.structure[i] !== 'base') continue;
    const o = state.owner[i];
    if (o === null || o === p || isAllied(state, o, p)) continue;
    bases.push(i);
  }
  if (bases.length === 0) return blocked;
  const w = state.map.width;
  const h = state.map.height;
  for (const b of bases) {
    const bx = b % w;
    const by = Math.floor(b / w);
    for (let y = Math.max(0, by - r); y <= Math.min(h - 1, by + r); y++) {
      for (let x = Math.max(0, bx - r); x <= Math.min(w - 1, bx + r); x++) {
        const dist = baseBlockMetric === 'manhattan' ? Math.abs(x - bx) + Math.abs(y - by) : Math.max(Math.abs(x - bx), Math.abs(y - by));
        if (dist <= r) blocked[y * w + x] = 1;
      }
    }
  }
  return blocked;
}

/** Başkent yeri için sorun varsa nedenini döner. Mesafe kuralı, uygun yer kalmadıysa gevşetilir. */
export function capitalProblem(state: GameState, p: number, tile: number, ignoreDistance = false): string | null {
  const { map, config } = state;
  if (tile < 0 || tile >= map.terrain.length) return 'Geçersiz kare';
  if (map.terrain[tile] !== 'land') return 'Başkent karada olmalı';
  if (state.owner[tile] !== null) return 'Bu kare sahipli';
  if (map.mines[tile]) return 'Başkent maden karesine kurulamaz';
  for (const pl of state.players) {
    if (ignoreDistance) break;
    if (pl.id !== p && pl.capital !== null && chebyshev(map, pl.capital, tile) < config.minCapitalDistance) {
      return `Başka bir başkente çok yakın (en az ${config.minCapitalDistance} kare)`;
    }
  }
  // Başlangıç toprakları için yeterli boş alan olmalı
  const need = config.startTerritoryCount + 1;
  const seen = new Set<number>([tile]);
  const stack = [tile];
  while (stack.length && seen.size < need) {
    const c = stack.pop()!;
    for (const nb of neighbors4(map, c)) {
      if (!seen.has(nb) && map.terrain[nb] === 'land' && state.owner[nb] === null && !map.mines[nb]) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  if (seen.size < need) return 'Çevresinde başlangıç toprakları için yeterli madensiz boş kara yok';
  return null;
}

/** Fetih aşamasında seçilebilecek kareler (seçen: taker, kaybeden: victim). */
export function conquestCandidates(state: GameState): number[] {
  const ph = state.phase;
  if (ph.kind !== 'conquest') return [];
  const { taker, victim, anchor } = ph;
  const map = state.map;
  const pool = anchor === null ? ownedTiles(state, victim) : [anchor, ...neighbors4(map, anchor)];
  return pool.filter((t) => {
    if (state.owner[t] !== victim) return false;
    const s = state.structure[t];
    if (s === 'capital' || s === 'base') return false;
    if (anchor === null) return touchesOwn(state, taker, t);
    if (t === anchor) return true;
    // Maden kareleri seferle doğrudan alınamaz: seçenin toprağına komşu olmalı
    if (map.mines[t]) return touchesOwn(state, taker, t);
    return true;
  });
}

export function allAliveAllied(state: GameState): boolean {
  const alive = alivePlayers(state);
  if (alive.length < 2) return false;
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) if (!isAllied(state, alive[i], alive[j])) return false;
  }
  return true;
}
