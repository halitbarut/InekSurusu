import {
  allAliveAllied,
  battleCost,
  battleUsed,
  targetBattleKind,
  upkeepDue,
  landOutcomes,
  seriesWinProbability,
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
  type BattleCost,
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
  /** Savaşa girmek için gereken en düşük beklenen net kazanç (toprak değeri cinsinden) */
  minBattleValue: number;
  /** Toplam bakım, beklenen tur gelirinin en fazla bu oranı olabilir (+ akçe stokunun küçük bir payı) */
  maxUpkeepShare: number;
  /** Stok ne olursa olsun bakımın gelire oranı bu tavanı aşmaz */
  upkeepCap: number;
  /** Bakım gelirin bu oranını aşarsa fazla birim dağıtılır (tavandan büyük olmalı) */
  upkeepExcessShare: number;
  /** Başkent savaşı için masrafın en az bu katı kaynak olmalı */
  capitalCostCushion: number;
  /** Başkent savaşında akçe, masrafa ek olarak bir sonraki turun bakımını da karşılamalı */
  capitalReserveUpkeep: boolean;
  /** Başkent savaşı için savunanın toprağı en fazla bizimkinin bu oranı olmalı */
  capitalWeakRatio: number;
  maxShipsBase: number;
  maxPlanesBase: number;
  diplomacyEvery: number;
  /** Kara savaşında rakip başkentine doğru ilerlemenin alınan toprak başına ek değeri */
  pushBonus: number;
}

export const MEDIUM_TUNING: BotTuning = {
  minBattleValue: 0.05,
  maxUpkeepShare: 0.3,
  upkeepCap: 0.45,
  upkeepExcessShare: 0.6,
  capitalCostCushion: 1,
  capitalReserveUpkeep: true,
  capitalWeakRatio: 1,
  maxShipsBase: 2,
  maxPlanesBase: 2,
  diplomacyEvery: 3,
  pushBonus: 0.5,
};

export class MediumBot implements BotBrain {
  constructor(protected tuning: BotTuning = MEDIUM_TUNING) {}

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

  protected pick(state: GameState, p: number): Action {
    const ph = state.phase;
    switch (ph.kind) {
      case 'setup_capital':
        return this.pickCapital(state, p);
      case 'setup_territory': {
        // Madenler başlangıçta seçilemez: madenlerin yanına yerleşmeyi tercih et
        const c = startPickCandidates(state, p);
        if (c.length === 0) return { type: 'SKIP_START_PICKS', player: p };
        return { type: 'PICK_START_TILE', player: p, tile: best(c, (t) => tileScore(state, p, t) + 2 * unownedMinesAround(state, t)) };
      }
      case 'spin':
        return { type: 'SPIN', player: p };
      case 'conquest': {
        // Seçen taraf: saldıran ya da karşı saldırıdaki savunan
        const c = conquestCandidates(state);
        if (c.length === 0) return { type: 'END_CONQUEST', player: ph.taker };
        return { type: 'CONQUER_TILE', player: ph.taker, tile: this.pickConquest(state, ph.taker, ph.victim, ph.counter, c) };
      }
      case 'vote':
        return { type: 'CAST_VOTE', player: p, accept: true };
      case 'upkeep':
        return this.pickUpkeep(state, p);
      case 'actions':
        return this.pickTurnAction(state, p);
      case 'gameover':
        return { type: 'END_TURN', player: p };
    }
  }

  /** Fetihte alınacak toprak */
  protected pickConquest(state: GameState, taker: number, victim: number, counter: boolean, cands: number[]): number {
    // Saldıran rakip başkentine doğru koridor açar; karşı saldırıda savunan kendi başkentine yakın cepheyi geri iter
    const focus = counter ? state.players[taker].capital : state.players[victim].capital;
    return best(cands, (t) => conquestScore(state, taker, t) - (focus === null ? 0 : CORRIDOR_WEIGHT * manhattan(state.map, t, focus)));
  }

  /** Gemi üretiminde demir harcanabilir mi? (zor bot başkent savaşı için demir saklar) */
  protected canSpendIron(_state: GameState, _p: number, _amount: number): boolean {
    return true;
  }

  protected pickCapital(state: GameState, p: number): Action {
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
          // Madenler başlangıçta alınamaz ama yakında olmaları sonradan almayı kolaylaştırır
          const m = map.mines[t];
          if (m && d <= 3) s += (m === 'oil' ? 4 : 3) * (d <= 2 ? 1.3 : 1);
          if (d <= 2 && isCoastal(map, t)) coast = true;
        }
      }
      if (coast) s += 2;
      const nearest = others.length ? Math.min(...others.map((o) => manhattan(map, o, c))) : 20;
      return s + Math.min(nearest, 14) * 0.4;
    };
    return { type: 'PLACE_CAPITAL', player: p, tile: best(cands, score) };
  }

  protected pickTurnAction(state: GameState, p: number): Action {
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

    // 2b) Bakım gelirin çoğunu yiyorsa (ör. fetihle gelen birimler) fazlasını dağıt
    const excess = this.excessUnit(state, p);
    if (excess !== null) return { type: 'DISBAND_UNIT', player: p, unitId: excess };

    // 3) Yapılar
    const enemyBorder = attackableTiles(state, p).length > 0;
    const wants: BuildableStructure[] = [];
    if (stats.structures.shipyard === 0 && (res.iron >= cfg.shipIronCost || stats.mines.iron > 0) && state.round >= 2) wants.push('shipyard');
    if (stats.structures.factory === 0 && (res.steel >= cfg.planeSteelCost || stats.mines.steel > 0) && state.round >= 3) wants.push('factory');
    // Bakım varken üs sayısını sınırlı tut
    const maxBases = 1 + Math.floor(stats.tiles / (cfg.upkeepEnabled ? 80 : 25));
    if (enemyBorder && stats.structures.base < maxBases && state.round >= 4 && this.upkeepRoom(state, p, cfg.baseUpkeep)) wants.push('base');
    // Başkent savaşı planı varsa kaynak biriktir
    let reserve = this.capitalReserve(state, p);
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
    if (stats.ships < maxShips && res.akce >= cfg.shipAkceCost + reserve && this.upkeepRoom(state, p, cfg.shipUpkeep) && this.canSpendIron(state, p, cfg.shipIronCost)) {
      const t = producibleTiles(state, p, 'ship');
      if (t.length) return { type: 'PRODUCE', player: p, tile: t[0], unit: 'ship' };
    }
    if (stats.planes < maxPlanes && res.akce >= cfg.planeAkceCost + reserve && this.upkeepRoom(state, p, cfg.planeUpkeep)) {
      const t = producibleTiles(state, p, 'plane');
      if (t.length) return { type: 'PRODUCE', player: p, tile: t[0], unit: 'plane' };
    }

    // 5) Sahipsiz komşu toprak al (madenler ve kıyılar öncelikli)
    const claimable = claimableTiles(state, p);
    if (claimable.length > 0) {
      const tile = best(claimable, (t) => this.claimScore(state, p, t));
      if (res.akce >= cfg.claimCost + reserve || state.map.mines[tile]) return { type: 'CLAIM_TILE', player: p, tile };
    }

    // 6) Seferle sahipsiz toprak: uzak topraklar ve madenlerin yanı (savaş sayılmaz)
    const exp = this.pickExpeditionClaim(state, p, reserve, claimable.length);
    if (exp) return exp;

    // 7) Turdaki tek savaş: beklenen net kazancı en yüksek seçenek
    const battle = this.pickBattle(state, p);
    if (battle) return battle;

    // 8) Diplomasi
    const dip = this.pickDiplomacy(state, p, turnEvents);
    if (dip) return dip;

    return end;
  }

  /** Sahipsiz toprak seçimi puanı (agresif botlar başkente yönelir) */
  protected claimScore(state: GameState, p: number, t: number): number {
    return tileScore(state, p, t);
  }

  /** Beklenen tur geliri: ortalama topaç + altın madenleri */
  protected expectedIncome(state: GameState, p: number): number {
    const c = state.config;
    return ((c.spinFaces + 1) / 2) * c.spinMultiplier + playerStats(state, p).mines.gold * c.goldToAkce;
  }

  /** Yeni bir bakım kalemi eklenince toplam bakım gelirin makul payını aşar mı? */
  protected upkeepRoom(state: GameState, p: number, extra: number): boolean {
    if (!state.config.upkeepEnabled) return true;
    const income = this.expectedIncome(state, p);
    // Dağıtma eşiğinin altında kal ki üret-dağıt döngüsü olmasın
    const limit = Math.min(this.tuning.maxUpkeepShare * income + state.players[p].resources.akce / 50, this.tuning.upkeepCap * income);
    return upkeepDue(state, p) + extra <= limit;
  }

  /** Bakım beklenen gelirin upkeepExcessShare oranını aşıyorsa dağıtılacak birim */
  protected excessUnit(state: GameState, p: number): number | null {
    if (!state.config.upkeepEnabled) return null;
    if (upkeepDue(state, p) <= this.tuning.upkeepExcessShare * this.expectedIncome(state, p)) return null;
    const mine = state.units.filter((u) => u.owner === p);
    if (mine.length <= 1) return null;
    const ships = mine.filter((u) => u.kind === 'ship');
    const planes = mine.filter((u) => u.kind === 'plane');
    const pool = planes.length >= ships.length ? planes : ships;
    return pool[pool.length - 1].id;
  }

  /** Bakım ödenemiyor: önce altını boz, sonra en az işe yarayanı dağıt. */
  protected pickUpkeep(state: GameState, p: number): Action {
    const me = state.players[p];
    if (me.resources.gold > 0) return { type: 'EXCHANGE_GOLD', player: p, amount: me.resources.gold };
    const mine = state.units.filter((u) => u.owner === p);
    const ships = mine.filter((u) => u.kind === 'ship');
    const planes = mine.filter((u) => u.kind === 'plane');
    const pool = planes.length >= ships.length ? planes : ships;
    if (pool.length) return { type: 'DISBAND_UNIT', player: p, unitId: pool[pool.length - 1].id };
    const bases = ownedStructures(state, p, 'base');
    const cap = me.capital;
    // Başkentten en uzak üs en az değerlidir
    const base = best(bases, (t) => (cap === null ? 0 : manhattan(state.map, t, cap)));
    return { type: 'DEMOLISH_BASE', player: p, tile: base };
  }

  /** Başkent savaşı makulse (komşu, zayıf hedef, demir/çelik var) biriktirilecek akçe */
  protected capitalReserve(state: GameState, p: number): number {
    if (!state.config.battleCostsEnabled) return 0;
    const target = this.capitalTarget(state, p);
    if (target === null) return 0;
    return Math.ceil(state.config.capitalBattleAkce * this.tuning.capitalCostCushion) + (this.tuning.capitalReserveUpkeep ? upkeepDue(state, p) : 0);
  }

  /** Saldırılabilecek, zayıflamış ve masrafı karşılanabilecek komşu başkent */
  protected capitalTarget(state: GameState, p: number): number | null {
    const cost = battleCost(state, 'capital');
    const res = state.players[p].resources;
    const k = this.tuning.capitalCostCushion;
    if (res.iron < cost.iron * k || res.steel < cost.steel * k) return null;
    const myTiles = tileCount(state, p);
    for (const q of state.players) {
      if (!q.alive || q.id === p || q.capital === null || attackBlockReason(state, p, q.id)) continue;
      if (!neighbors4(state.map, q.capital).some((n) => state.owner[n] === p)) continue;
      if (tileCount(state, q.id) > myTiles * this.tuning.capitalWeakRatio) continue;
      return q.capital;
    }
    return null;
  }

  /** Akçe masrafı (gerekirse bir sonraki turun bakımıyla birlikte) karşılanıyor mu? */
  protected canFundCapitalBattle(state: GameState, p: number): boolean {
    const need = battleCost(state, 'capital').akce * this.tuning.capitalCostCushion + (this.tuning.capitalReserveUpkeep ? upkeepDue(state, p) : 0);
    return state.players[p].resources.akce >= need;
  }

  /** Kaynak harcamasının toprak değeri cinsinden karşılığı */
  protected costValue(state: GameState, p: number, cost: BattleCost): number {
    // Alınabilecek sahipsiz toprak varken 100 akçe ≈ 1 toprak; yokken akçenin başka kullanımı az
    const akcePer100 = claimableTiles(state, p).length > 0 ? 1 : 0.35;
    return (cost.akce / 100) * akcePer100 + cost.iron * 0.4 + cost.steel * 0.4;
  }

  protected pickBuildTile(state: GameState, p: number, s: BuildableStructure, tiles: number[]): number | null {
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

  protected pickExpeditionClaim(state: GameState, p: number, reserve: number, claimableCount: number): Action | null {
    const me = state.players[p];
    for (const kind of ['ship', 'plane'] as const) {
      const units = readyUnits(state, p, kind);
      if (units.length === 0) continue;
      const unit = units[0];
      let bestT: number | null = null;
      let bestS = -Infinity;
      for (const t of expeditionTargets(state, p, unit.id).values()) {
        if (t.kind !== 'claim' || me.resources.akce < t.cost + reserve) continue;
        const nearMine = unownedMinesAround(state, t.tile) > 0;
        if (claimableCount >= 3 && !nearMine) continue;
        const s = tileScore(state, p, t.tile) + (nearMine ? 6 : 0) - t.cost / 100;
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

  /**
   * Turdaki tek savaş hakkı için en iyi seçeneği bulur. Kara savaşında beklenen değer
   * = E[alınacak toprakların değeri] − E[karşı saldırıda kaybedileceklerin değeri];
   * başkent/üs savaşında kayıp yoktur, kazanma olasılığı 1/2^seri.
   */
  protected pickBattle(state: GameState, p: number): Action | null {
    if (battleUsed(state, p)) return null;
    const cfg = state.config;
    const outcomes = landOutcomes(cfg.spinFaces);
    const options: { action: Action; value: number }[] = [];
    const enemies = state.players.filter((q) => q.alive && q.id !== p && !attackBlockReason(state, p, q.id)).map((q) => q.id);
    if (enemies.length === 0) return null;

    const myNormal = normalTiles(state, p);
    for (const q of enemies) {
      const qNormal = normalTiles(state, q);
      const lossPool = poolValues(state, myNormal.filter((t) => touchesPlayer(state, q, t)), myNormal.length);
      const allValue = ownedValue(state, q);
      // Kara yoluyla
      const border = attackableTiles(state, p).filter((t) => state.owner[t] === q);
      if (border.length) {
        const normalBorder = border.filter((t) => isNormal(state, t));
        if (normalBorder.length) {
          const gainPool = poolValues(state, normalBorder, qNormal.length);
          // Başkent yalnızca karadan alınabildiği için başkente doğru ilerlemek ayrıca değerli
          const push = border.includes(state.players[q].capital ?? -1) ? 0 : this.tuning.pushBonus * expectedGain(outcomes, gainPool.length);
          options.push({ action: { type: 'ATTACK', player: p, target: nearestToCapital(state, normalBorder, q) }, value: landValue(outcomes, gainPool, lossPool) + push });
        }
        const cap = state.players[q].capital;
        // Başkent: olasılık 1/8; yalnızca masraf rahatça karşılanıyor ve hedef zayıfsa
        if (cap !== null && border.includes(cap) && this.capitalTarget(state, p) === cap && this.canFundCapitalBattle(state, p)) {
          options.push({ action: { type: 'ATTACK', player: p, target: cap }, value: seriesWinProbability(cfg.capitalStreak) * allValue });
        }
        const base = border.find((t) => state.structure[t] === 'base');
        if (base !== undefined) {
          options.push({ action: { type: 'ATTACK', player: p, target: base }, value: seriesWinProbability(cfg.baseStreak) * tileValue(state, base) });
        }
      }
    }
    // Gemi / uçakla
    for (const kind of ['ship', 'plane'] as const) {
      const unit = readyUnits(state, p, kind)[0];
      if (!unit) continue;
      const oilCost = kind === 'ship' ? cfg.shipOilCost : cfg.planeOilCost;
      for (const t of expeditionTargets(state, p, unit.id).values()) {
        if (t.kind === 'claim') continue;
        const q = state.owner[t.tile]!;
        if (!enemies.includes(q)) continue;
        const type = kind === 'ship' ? ('SHIP_EXPEDITION' as const) : ('PLANE_EXPEDITION' as const);
        const action: Action = { type, player: p, unitId: unit.id, target: t.tile };
        let value: number;
        if (t.kind === 'base') value = seriesWinProbability(cfg.baseStreak) * tileValue(state, t.tile);
        else {
          const around = [t.tile, ...neighbors4(state.map, t.tile)].filter((x) => state.owner[x] === q && isNormal(state, x));
          const gainPool = poolValues(state, around, around.length);
          // Karşı saldırıda yalnızca savunanla sınırı olan topraklar kaybedilebilir
          const lossPool = poolValues(state, myNormal.filter((x) => touchesPlayer(state, q, x)), myNormal.length);
          value = landValue(outcomes, gainPool, lossPool);
        }
        options.push({ action, value: value - oilCost * 0.3 - t.cost / 500 });
      }
    }
    let bestOpt: { action: Action; value: number } | null = null;
    for (const o of options) {
      if (!validateAction(state, o.action).ok) continue; // masraf yetmiyor vb.
      const target = o.action.type === 'ATTACK' || o.action.type === 'SHIP_EXPEDITION' || o.action.type === 'PLANE_EXPEDITION' ? o.action.target : -1;
      o.value -= this.costValue(state, p, battleCost(state, targetBattleKind(state, target)));
      if (!bestOpt || o.value > bestOpt.value) bestOpt = o;
    }
    return bestOpt && bestOpt.value > this.tuning.minBattleValue ? bestOpt.action : null;
  }

  protected pickDiplomacy(state: GameState, p: number, turnEvents: GameEvent[]): Action | null {
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
    case 'upkeep': {
      const u = state.units.find((x) => x.owner === p);
      if (u) return { type: 'DISBAND_UNIT', player: p, unitId: u.id };
      const b = state.structure.findIndex((x, i) => x === 'base' && state.owner[i] === p);
      return { type: 'DEMOLISH_BASE', player: p, tile: b };
    }
    default:
      return { type: 'END_TURN', player: p };
  }
}

export function eventsThisTurn(state: GameState): GameEvent[] {
  const r: GameEvent[] = [];
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i];
    if (e.turn !== state.turnCounter) break;
    r.push(e.event);
  }
  return r;
}

export function strongestOther(state: GameState, p: number): number | null {
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

export function tileScore(state: GameState, p: number, t: number): number {
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

export function conquestScore(state: GameState, p: number, t: number): number {
  let s = tileScore(state, p, t);
  // Kendi bölgesini birleştiren kareler değerli
  s += neighbors4(state.map, t).filter((n) => state.owner[n] === p).length * 0.8;
  if (isCoastal(state.map, t)) s += 1;
  if (state.map.mines[t]) s += 5;
  if (state.structure[t]) s += 8;
  if (state.units.some((u) => u.tile === t)) s += 5;
  return s;
}

function ownedStructures(state: GameState, p: number, s: BuildableStructure): number[] {
  const r: number[] = [];
  for (let i = 0; i < state.owner.length; i++) if (state.owner[i] === p && state.structure[i] === s) r.push(i);
  return r;
}

export function unownedMinesAround(state: GameState, t: number): number {
  return neighbors4(state.map, t).filter((n) => state.map.mines[n] && state.owner[n] === null).length;
}

function isNormal(state: GameState, t: number): boolean {
  const s = state.structure[t];
  return s !== 'capital' && s !== 'base';
}

function normalTiles(state: GameState, p: number): number[] {
  const r: number[] = [];
  for (let i = 0; i < state.owner.length; i++) if (state.owner[i] === p && isNormal(state, i)) r.push(i);
  return r;
}

function touchesPlayer(state: GameState, q: number, t: number): boolean {
  return neighbors4(state.map, t).some((n) => state.owner[n] === q);
}

/** Savaşta el değiştirebilecek bir toprağın kabaca değeri */
export function tileValue(state: GameState, t: number): number {
  let v = 1;
  if (state.map.mines[t]) v += 2;
  if (state.structure[t]) v += 2;
  if (state.units.some((u) => u.tile === t)) v += 2;
  return v;
}

export function ownedValue(state: GameState, p: number): number {
  let v = 0;
  for (let i = 0; i < state.owner.length; i++) if (state.owner[i] === p) v += tileValue(state, i);
  return v;
}

/**
 * Seçilebilecek toprakların değerleri, büyükten küçüğe. Önce sınırdakiler, sonra (içeri doğru
 * ilerleme ile) `total` sayısına kadar 1 değerli sıradan topraklar.
 */
function poolValues(state: GameState, frontier: number[], total: number): number[] {
  const vals = frontier.map((t) => tileValue(state, t)).sort((a, b) => b - a);
  while (vals.length < total) vals.push(1);
  return vals;
}

/** Fetihte başkente uzaklığın kare başına ceza ağırlığı */
const CORRIDOR_WEIGHT = 1.5;

function expectedGain(outcomes: { gain: number }[], cap: number): number {
  return outcomes.reduce((sum, o) => sum + Math.min(o.gain, cap), 0) / outcomes.length;
}

/** Rakibin başkentine en yakın sınır karesi (saldırı hedefi olarak) */
function nearestToCapital(state: GameState, tiles: number[], q: number): number {
  const cap = state.players[q].capital;
  if (cap === null) return tiles[0];
  return best(tiles, (t) => -manhattan(state.map, t, cap));
}

function landValue(outcomes: { gain: number; loss: number }[], gainPool: number[], lossPool: number[]): number {
  const prefix = (arr: number[]) => {
    const r = [0];
    for (const v of arr) r.push(r[r.length - 1] + v);
    return r;
  };
  const g = prefix(gainPool);
  const l = prefix(lossPool);
  let sum = 0;
  for (const o of outcomes) sum += g[Math.min(o.gain, gainPool.length)] - l[Math.min(o.loss, lossPool.length)];
  return sum / outcomes.length;
}

export function best<T>(items: T[], score: (x: T) => number): T {
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
