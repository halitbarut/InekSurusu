import {
  allAliveAllied,
  attackBlockReason,
  attackableTiles,
  buildableTiles,
  capitalCandidates,
  claimableTiles,
  conquestCandidates,
  expeditionTargets,
  getRelation,
  isAllied,
  isCoastal,
  manhattan,
  neighbors4,
  offerProblem,
  playerStats,
  producibleTiles,
  readyUnits,
  shipRoutes,
  startPickCandidates,
  tileCount,
  validateAction,
  type Action,
  type BuildableStructure,
  type GameEvent,
  type GameState,
  type MineType,
  type Offer,
  type ResourceKey,
} from '../engine';
import type { BotBrain } from './types';

const MINE_VALUE: Record<MineType, number> = { gold: 9, oil: 12, iron: 10, steel: 10 };
const RESOURCE_VALUE: Record<ResourceKey, number> = { akce: 1, gold: 200, oil: 160, iron: 120, steel: 140 };

/** Orta seviye bot ayarları; kolay/zor seviyeler farklı değerlerle türetilebilir. */
export interface BotTuning {
  landAttacksPerTurn: number;
  capitalAttemptsPerTurn: number;
  baseAttemptsPerTurn: number;
  maxShipsBase: number;
  maxPlanesBase: number;
  diplomacyEvery: number;
}

export const MEDIUM_TUNING: BotTuning = {
  landAttacksPerTurn: 4,
  capitalAttemptsPerTurn: 2,
  baseAttemptsPerTurn: 1,
  maxShipsBase: 2,
  maxPlanesBase: 2,
  diplomacyEvery: 3,
};

export class MediumBot implements BotBrain {
  constructor(private tuning: BotTuning = MEDIUM_TUNING) {}

  chooseAction(state: GameState, p: number): Action {
    const a = this.pick(state, p);
    if (validateAction(state, a).ok) return a;
    return fallbackAction(state, p);
  }

  vote(): boolean {
    return true;
  }

  evaluateOffer(state: GameState, p: number, offer: Offer): boolean {
    if (offerProblem(state, offer.from, offer.to, offer.items)) return false;
    const myTiles = tileCount(state, p);
    const fromTiles = tileCount(state, offer.from);
    const strongest = strongestOther(state, p);
    let value = 0;
    for (const it of offer.items) {
      const iGive = (it.kind === 'resource' || it.kind === 'tile' || it.kind === 'strait') && (it.giver === 'to') === (offer.to === p);
      const sign = iGive ? -1 : 1;
      switch (it.kind) {
        case 'resource':
          value += sign * RESOURCE_VALUE[it.resource] * it.amount;
          break;
        case 'tile': {
          let v = 120;
          if (state.map.mines[it.tile]) v += 250;
          if (state.structure[it.tile]) v += 300;
          value += sign * v;
          break;
        }
        case 'strait':
          value += iGive ? -40 - Math.max(0, 50 - it.toll) : 80;
          break;
        case 'alliance': {
          const threat = strongest !== null && strongest !== offer.from && tileCount(state, strongest) > myTiles * 1.2;
          if (fromTiles > myTiles * 1.5) value += 150;
          else if (strongest === null || myTiles >= tileCount(state, strongest)) value -= 200;
          else if (threat) value += 100;
          else value -= 50;
          break;
        }
        case 'peace':
          value += fromTiles > myTiles ? 60 : myTiles > fromTiles * 1.8 ? -100 : -10 * Math.ceil(it.rounds / 5);
          break;
      }
    }
    return value >= 0;
  }

  // ------------------------------------------------------------------

  private pick(state: GameState, p: number): Action {
    const ph = state.phase;
    switch (ph.kind) {
      case 'setup_capital':
        return this.pickCapital(state, p);
      case 'setup_territory': {
        const c = startPickCandidates(state, p);
        if (c.length === 0) return { type: 'SKIP_START_PICKS', player: p };
        return { type: 'PICK_START_TILE', player: p, tile: best(c, (t) => tileScore(state, p, t)) };
      }
      case 'spin':
        return { type: 'SPIN', player: p };
      case 'conquest': {
        const c = conquestCandidates(state);
        if (c.length === 0) return { type: 'END_CONQUEST', player: p };
        return { type: 'CONQUER_TILE', player: p, tile: best(c, (t) => conquestScore(state, p, t)) };
      }
      case 'vote':
        return { type: 'CAST_VOTE', player: p, accept: true };
      case 'actions':
        return this.pickTurnAction(state, p);
      case 'gameover':
        return { type: 'END_TURN', player: p };
    }
  }

  private pickCapital(state: GameState, p: number): Action {
    const cands = capitalCandidates(state, p);
    const map = state.map;
    const others = state.players.filter((pl) => pl.capital !== null).map((pl) => pl.capital!);
    const score = (c: number) => {
      const cx = c % map.width;
      const cy = Math.floor(c / map.width);
      let s = 0;
      let coast = false;
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          if (d > 4) continue;
          const t = y * map.width + x;
          if (map.terrain[t] !== 'land' || state.owner[t] !== null) continue;
          s += 0.25;
          const m = map.mines[t];
          if (m && d <= 3) s += m === 'oil' ? 4 : 3;
          if (d <= 2 && isCoastal(map, t)) coast = true;
        }
      }
      if (coast) s += 2;
      const nearest = others.length ? Math.min(...others.map((o) => manhattan(map, o, c))) : 20;
      return s + Math.min(nearest, 14) * 0.4;
    };
    return { type: 'PLACE_CAPITAL', player: p, tile: best(cands, score) };
  }

  private pickTurnAction(state: GameState, p: number): Action {
    const me = state.players[p];
    const res = me.resources;
    const cfg = state.config;
    const turnEvents = eventsThisTurn(state);
    const stats = playerStats(state, p);
    const end: Action = { type: 'END_TURN', player: p };

    // 1) Kalan herkes müttefikse oyunu bitirmeyi öner
    if (allAliveAllied(state) && !turnEvents.some((e) => e.type === 'victory_proposed')) {
      return { type: 'PROPOSE_VICTORY', player: p };
    }

    // 2) Akçe azsa altını bozdur
    if (res.gold > 0 && res.akce < 800) return { type: 'EXCHANGE_GOLD', player: p, amount: res.gold };

    // 3) Yapılar
    const enemyBorder = attackableTiles(state, p).length > 0;
    const wants: BuildableStructure[] = [];
    if (stats.structures.shipyard === 0 && (res.iron >= cfg.shipIronCost || stats.mines.iron > 0) && state.round >= 2) wants.push('shipyard');
    if (stats.structures.factory === 0 && (res.steel >= cfg.planeSteelCost || stats.mines.steel > 0) && state.round >= 3) wants.push('factory');
    if (enemyBorder && stats.structures.base < 1 + Math.floor(stats.tiles / 25) && state.round >= 4) wants.push('base');
    let reserve = 0;
    for (const s of wants) {
      const tiles = buildableTiles(state, p, s);
      if (tiles.length > 0) {
        const tile = this.pickBuildTile(state, p, s, tiles);
        if (tile !== null) return { type: 'BUILD', player: p, tile, structure: s };
      } else if (reserve === 0 && hasStructureSpot(state, p, s)) {
        reserve = s === 'shipyard' ? cfg.shipyardCost : s === 'factory' ? cfg.factoryCost : cfg.baseCost;
      }
    }

    // 4) Üretim
    const maxShips = this.tuning.maxShipsBase + Math.floor(stats.tiles / 30);
    const maxPlanes = this.tuning.maxPlanesBase + Math.floor(stats.tiles / 30);
    if (stats.ships < maxShips && res.akce >= cfg.shipAkceCost + reserve) {
      const t = producibleTiles(state, p, 'ship');
      if (t.length) return { type: 'PRODUCE', player: p, tile: t[0], unit: 'ship' };
    }
    if (stats.planes < maxPlanes && res.akce >= cfg.planeAkceCost + reserve) {
      const t = producibleTiles(state, p, 'plane');
      if (t.length) return { type: 'PRODUCE', player: p, tile: t[0], unit: 'plane' };
    }

    // 5) Sahipsiz komşu toprak al (madenler ve kıyılar öncelikli)
    const claimable = claimableTiles(state, p);
    if (claimable.length > 0) {
      const tile = best(claimable, (t) => tileScore(state, p, t));
      if (res.akce >= cfg.claimCost + reserve || state.map.mines[tile]) return { type: 'CLAIM_TILE', player: p, tile };
    }

    // 6) Seferler: uzak sahipsiz topraklar, madenlerin yanı ya da zayıf rakipler
    const exp = this.pickExpedition(state, p, reserve, claimable.length);
    if (exp) return exp;

    // 7) Kara saldırıları
    const atk = this.pickAttack(state, p, turnEvents);
    if (atk) return atk;

    // 8) Diplomasi
    const dip = this.pickDiplomacy(state, p, turnEvents);
    if (dip) return dip;

    return end;
  }

  private pickBuildTile(state: GameState, p: number, s: BuildableStructure, tiles: number[]): number | null {
    const map = state.map;
    const cap = state.players[p].capital ?? tiles[0];
    const enemyAdj = (t: number) => neighbors4(map, t).filter((n) => state.owner[n] !== null && state.owner[n] !== p).length;
    if (s === 'base') {
      return best(tiles, (t) => (enemyAdj(t) > 0 ? 5 : 0) - manhattan(map, t, cap) * 0.5 - (map.mines[t] ? 1 : 0));
    }
    const safe = (t: number) => -enemyAdj(t) * 3 - manhattan(map, t, cap) * 0.3 - (map.mines[t] ? 2 : 0);
    if (s === 'factory') return best(tiles, safe);
    // Tersane: güvenli adaylardan en çok kıyıya ulaşanı seç
    const top = [...tiles].sort((a, b) => safe(b) - safe(a)).slice(0, 5);
    return best(top, (t) => shipRoutes(state, p, t).targets.size * 0.05 + safe(t));
  }

  private pickExpedition(state: GameState, p: number, reserve: number, claimableCount: number): Action | null {
    const me = state.players[p];
    const myTiles = tileCount(state, p);
    for (const kind of ['ship', 'plane'] as const) {
      const units = readyUnits(state, p, kind);
      if (units.length === 0) continue;
      const unit = units[0];
      const targets = expeditionTargets(state, p, unit.id);
      let bestT: number | null = null;
      let bestS = -Infinity;
      for (const t of targets.values()) {
        let s: number;
        if (t.kind === 'claim') {
          if (me.resources.akce < t.cost + reserve) continue;
          const nearMine = neighbors4(state.map, t.tile).some((n) => state.map.mines[n] && state.owner[n] === null);
          if (claimableCount >= 3 && !nearMine) continue;
          s = tileScore(state, p, t.tile) + (nearMine ? 6 : 0) - t.cost / 100;
        } else {
          const o = state.owner[t.tile]!;
          const oTiles = tileCount(state, o);
          if (me.resources.akce < t.cost) continue;
          if (t.kind === 'base') continue;
          if (t.kind === 'capital' && oTiles > 12) continue;
          if (oTiles >= myTiles) continue;
          if (attackBlockReason(state, p, o)) continue;
          s = (t.kind === 'capital' ? 8 : 2) + (myTiles - oTiles) * 0.05;
        }
        if (s > bestS) {
          bestS = s;
          bestT = t.tile;
        }
      }
      if (bestT !== null) {
        return { type: kind === 'ship' ? 'SHIP_EXPEDITION' : 'PLANE_EXPEDITION', player: p, unitId: unit.id, target: bestT };
      }
    }
    return null;
  }

  private pickAttack(state: GameState, p: number, turnEvents: GameEvent[]): Action | null {
    const t = this.tuning;
    const battles = turnEvents.filter((e): e is Extract<GameEvent, { type: 'battle' }> => e.type === 'battle' && e.attacker === p);
    const tiles = attackableTiles(state, p);
    if (tiles.length === 0) return null;
    const myTiles = tileCount(state, p);
    const byOwner = new Map<number, number[]>();
    for (const tile of tiles) {
      const o = state.owner[tile]!;
      if (!byOwner.has(o)) byOwner.set(o, []);
      byOwner.get(o)!.push(tile);
    }
    // Başkent savaşı: kazanma olasılığı düşük (1/8), yalnızca rakip zayıfsa dene
    if (battles.filter((b) => b.kind === 'capital').length < t.capitalAttemptsPerTurn) {
      for (const [o, ts] of byOwner) {
        const cap = state.players[o].capital;
        if (cap === null || !ts.includes(cap)) continue;
        const oTiles = tileCount(state, o);
        if (oTiles <= myTiles * 1.5 || oTiles <= 15) return { type: 'ATTACK', player: p, target: cap };
      }
    }
    // Askeri üs savaşı (1/4)
    if (battles.filter((b) => b.kind === 'base').length < t.baseAttemptsPerTurn) {
      const base = tiles.find((tile) => state.structure[tile] === 'base');
      if (base !== undefined) return { type: 'ATTACK', player: p, target: base };
    }
    if (battles.filter((b) => b.kind === 'land').length >= t.landAttacksPerTurn) return null;
    let bestOwner: number | null = null;
    let bestScore = -Infinity;
    for (const [o, ts] of byOwner) {
      const normal = ts.filter((tile) => state.structure[tile] !== 'capital' && state.structure[tile] !== 'base');
      if (normal.length === 0) continue;
      const score = normal.length * (myTiles / (tileCount(state, o) + 1));
      if (score > bestScore) {
        bestScore = score;
        bestOwner = o;
      }
    }
    if (bestOwner === null) return null;
    const target = byOwner.get(bestOwner)!.find((tile) => state.structure[tile] !== 'capital' && state.structure[tile] !== 'base')!;
    return { type: 'ATTACK', player: p, target };
  }

  private pickDiplomacy(state: GameState, p: number, turnEvents: GameEvent[]): Action | null {
    if (turnEvents.some((e) => e.type === 'offer_made' && e.offer.from === p)) return null;
    if (state.round % this.tuning.diplomacyEvery !== p % this.tuning.diplomacyEvery) return null;
    const myTiles = tileCount(state, p);
    const S = strongestOther(state, p);
    if (S === null) return null;
    const sTiles = tileCount(state, S);
    const pending = (q: number) => state.offers.some((o) => (o.from === p && o.to === q) || (o.from === q && o.to === p));
    if (sTiles > myTiles * 1.3) {
      // Güçlü rakibe karşı ittifak ara
      const partners = state.players
        .filter((pl) => pl.alive && pl.id !== p && pl.id !== S && !isAllied(state, p, pl.id) && !isAllied(state, pl.id, S) && !pending(pl.id))
        .sort((a, b) => tileCount(state, b.id) - tileCount(state, a.id));
      if (partners.length > 0) return { type: 'PROPOSE_OFFER', player: p, to: partners[0].id, items: [{ kind: 'alliance' }] };
      // Ya da güçlü rakiple barış
      const rel = getRelation(state, p, S);
      if (!rel.allied && (rel.peaceUntilRound === null || rel.peaceUntilRound < state.round) && !pending(S)) {
        return { type: 'PROPOSE_OFFER', player: p, to: S, items: [{ kind: 'peace', rounds: 5 }] };
      }
    }
    return null;
  }
}

// ------------------------------------------------------------------

function fallbackAction(state: GameState, p: number): Action {
  switch (state.phase.kind) {
    case 'setup_capital': {
      const c = capitalCandidates(state, p);
      return { type: 'PLACE_CAPITAL', player: p, tile: c[0] ?? 0 };
    }
    case 'setup_territory':
      return { type: 'SKIP_START_PICKS', player: p };
    case 'spin':
      return { type: 'SPIN', player: p };
    case 'conquest':
      return { type: 'END_CONQUEST', player: p };
    case 'vote':
      return { type: 'CAST_VOTE', player: p, accept: true };
    default:
      return { type: 'END_TURN', player: p };
  }
}

function eventsThisTurn(state: GameState): GameEvent[] {
  const r: GameEvent[] = [];
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i];
    if (e.turn !== state.turnCounter) break;
    r.push(e.event);
  }
  return r;
}

function strongestOther(state: GameState, p: number): number | null {
  let bestId: number | null = null;
  let bestTiles = -1;
  for (const pl of state.players) {
    if (!pl.alive || pl.id === p) continue;
    const t = tileCount(state, pl.id);
    if (t > bestTiles) {
      bestTiles = t;
      bestId = pl.id;
    }
  }
  return bestId;
}

function hasStructureSpot(state: GameState, p: number, s: BuildableStructure): boolean {
  for (let i = 0; i < state.owner.length; i++) {
    if (state.owner[i] !== p || state.structure[i] !== null) continue;
    if (s !== 'shipyard' || isCoastal(state.map, i)) return true;
  }
  return false;
}

function tileScore(state: GameState, p: number, t: number): number {
  const map = state.map;
  let s = 1;
  const m = map.mines[t];
  if (m) s += MINE_VALUE[m];
  if (isCoastal(map, t)) s += 1.5;
  for (const n of neighbors4(map, t)) {
    const o = state.owner[n];
    if (o === p) s += 1;
    else if (o !== null) s -= 0.5;
    else if (map.mines[n] && map.terrain[n] === 'land') s += 2;
  }
  const cap = state.players[p].capital;
  if (cap !== null) s -= manhattan(map, cap, t) * 0.08;
  return s;
}

function conquestScore(state: GameState, p: number, t: number): number {
  let s = tileScore(state, p, t);
  if (state.map.mines[t]) s += 5;
  if (state.structure[t]) s += 8;
  if (state.units.some((u) => u.tile === t)) s += 5;
  return s;
}

function best<T>(items: T[], score: (x: T) => number): T {
  let bi = items[0];
  let bs = -Infinity;
  for (const it of items) {
    const s = score(it);
    if (s > bs) {
      bs = s;
      bi = it;
    }
  }
  return bi;
}
