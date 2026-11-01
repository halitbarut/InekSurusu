import { BATTLES_PER_TURN } from './config';
import { chebyshev, neighbors4 } from './grid';
import type { BattleCost, BattleKind, GameEvent, GameMap, GameState, Relation, Strait, StraitPolicy, Unit } from './types';

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

/** Açılış barışı sürüyor mu? (ilk N tam tur) */
export function openingPeaceActive(state: GameState): boolean {
  return state.config.openingPeace && state.round <= state.config.openingPeaceRounds;
}

const NO_COST: BattleCost = { akce: 0, iron: 0, steel: 0 };

/** Savaş türüne göre başlatma masrafı */
export function battleCost(state: GameState, kind: BattleKind): BattleCost {
  const c = state.config;
  if (!c.battleCostsEnabled) return NO_COST;
  if (kind === 'capital') return { akce: c.capitalBattleAkce, iron: c.capitalBattleIron, steel: c.capitalBattleSteel };
  if (kind === 'base') return { akce: c.baseBattleAkce, iron: c.baseBattleIron, steel: 0 };
  return { akce: c.landBattleAkce, iron: 0, steel: 0 };
}

export function battleCostText(cost: BattleCost): string {
  const parts = [`${cost.akce} akçe`];
  if (cost.iron) parts.push(`${cost.iron} demir`);
  if (cost.steel) parts.push(`${cost.steel} çelik`);
  return parts.join(' + ');
}

/** Savaş masrafı (ve varsa ek akçe, ör. boğaz vergisi) karşılanamıyorsa nedeni */
export function battleCostProblem(state: GameState, p: number, kind: BattleKind, extraAkce = 0): string | null {
  const cost = battleCost(state, kind);
  const r = state.players[p].resources;
  if (r.akce < cost.akce + extraAkce || r.iron < cost.iron || r.steel < cost.steel) {
    const name = kind === 'capital' ? 'Başkent savaşı' : kind === 'base' ? 'Askeri üs savaşı' : 'Savaş';
    return `${name} için ${battleCostText({ ...cost, akce: cost.akce + extraAkce })} gerekli${extraAkce ? ' (vergi dahil)' : ''}`;
  }
  return null;
}

/** Zayıflık şartı açıksa başkent saldırısı için sorun */
export function weaknessProblem(state: GameState, attacker: number, defender: number): string | null {
  if (!state.config.weaknessRule) return null;
  const a = tileCount(state, attacker);
  const d = tileCount(state, defender);
  return d * 2 < a ? null : `Zayıflık şartı: başkente saldırmak için savunanın toprağı (${d}) seninkinin (${a}) yarısından az olmalı`;
}

/** Oyuncunun tur başı bakım borcu */
export function upkeepDue(state: GameState, p: number): number {
  const c = state.config;
  if (!c.upkeepEnabled) return 0;
  let due = 0;
  for (const u of state.units) if (u.owner === p) due += u.kind === 'ship' ? c.shipUpkeep : c.planeUpkeep;
  for (let i = 0; i < state.owner.length; i++) if (state.owner[i] === p && state.structure[i] === 'base') due += c.baseUpkeep;
  return due;
}

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
  if (openingPeaceActive(state)) return `Açılış barışı: ${state.config.openingPeaceRounds}. tur sonuna kadar oyuncu topraklarına saldırılamaz`;
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

/** Boğazın her karesinin iki yanında birbirinin tam karşısında duran kara kareleri */
export function straitPairs(map: GameMap, s: Strait): [number, number][] {
  const step = s.orientation === 'h' ? map.width : 1;
  return s.tiles.map((t) => [t - step, t + step]);
}

/** p'nin bu boğazda iki karesine de sahip olduğu karşılıklı çiftler */
export function straitPairsOf(state: GameState, straitId: number, p: number): [number, number][] {
  return straitPairs(state.map, state.map.straits[straitId]).filter(([a, b]) => state.owner[a] === p && state.owner[b] === p);
}

/** Boğazın söz sahipleri: karşılıklı bir kare çiftine sahip oyuncular */
export function straitControllers(state: GameState, straitId: number): number[] {
  const out = new Set<number>();
  for (const [a, b] of straitPairs(state.map, state.map.straits[straitId])) {
    const o = state.owner[a];
    if (o !== null && o === state.owner[b]) out.add(o);
  }
  return [...out].sort((x, y) => x - y);
}

/** Yeni söz sahibi olunan boğazda herkes için başlangıç ayarı */
export const DEFAULT_STRAIT_POLICY: StraitPolicy = { mode: 'open', toll: 0 };

/** Söz sahibi c'nin p oyuncusu için ayarı */
export function straitPolicyOf(state: GameState, straitId: number, c: number, p: number): StraitPolicy {
  return state.straits[straitId].policies[c]?.[p] ?? DEFAULT_STRAIT_POLICY;
}

/** p oyuncusunun bu boğazdan geçişi: her söz sahibinden ayrı izin ve ayrı vergi */
export interface StraitPassage {
  /** Geçişi kapatan söz sahipleri */
  closedBy: number[];
  /** İzin sorulacak söz sahipleri */
  asks: number[];
  /** Vergi isteyen söz sahipleri */
  tolls: { controller: number; amount: number }[];
  /** Toplam vergi */
  toll: number;
}

export function straitPassage(state: GameState, straitId: number, p: number): StraitPassage {
  const r: StraitPassage = { closedBy: [], asks: [], tolls: [], toll: 0 };
  for (const c of state.straits[straitId].controllers) {
    if (c === p) continue;
    const pol = straitPolicyOf(state, straitId, c, p);
    if (pol.mode === 'closed') r.closedBy.push(c);
    else if (pol.mode === 'ask') r.asks.push(c);
    else if (pol.mode === 'toll' && pol.toll > 0) {
      r.tolls.push({ controller: c, amount: pol.toll });
      r.toll += pol.toll;
    }
  }
  return r;
}

/** Geçişin p için durumu: en kısıtlayıcı söz sahibi belirler */
export function straitStatusFor(state: GameState, straitId: number, p: number): 'open' | 'ask' | 'toll' | 'closed' {
  const pass = straitPassage(state, straitId, p);
  return pass.closedBy.length ? 'closed' : pass.asks.length ? 'ask' : pass.toll > 0 ? 'toll' : 'open';
}

/** Boğazların söz sahiplerini yeniden hesaplar: söz hakkını kaybedenin ayarları silinir. */
export function refreshStraits(state: GameState, events: GameEvent[]) {
  for (const s of state.map.straits) {
    const st = state.straits[s.id];
    const now = straitControllers(state, s.id);
    for (const c of st.controllers) {
      if (now.includes(c)) continue;
      delete st.policies[c];
      events.push({ type: 'strait_control', straitId: s.id, player: c, gained: false });
    }
    for (const c of now) if (!st.controllers.includes(c)) events.push({ type: 'strait_control', straitId: s.id, player: c, gained: true });
    st.controllers = now;
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
