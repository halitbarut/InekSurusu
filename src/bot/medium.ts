import {
  alivePlayers,
  allAliveAllied,
  atPeace,
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
  loanTotal,
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
  type LoanRequest,
  type MineType,
  type Offer,
  type ResourceKey,
  type StraitPolicy,
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
  /** Reddedilen boğaz izni kaç tam tur sonra yeniden sorulur */
  permitRetryRounds: number;
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
  permitRetryRounds: 4,
};

export class MediumBot implements BotBrain {
  constructor(protected tuning: BotTuning = MEDIUM_TUNING) {}

  chooseAction(state: GameState, p: number): Action {
    const a = this.pick(state, p);
    if (validateAction(state, a).ok) return a;
    return fallbackAction(state, p);
  }

  vote(_state: GameState, _p: number): boolean {
    return true;
  }

  evaluateOffer(state: GameState, p: number, offer: Offer): boolean {
    if (offerProblem(state, offer.from, offer.to, offer.items)) return false;
    return this.offerValue(state, p, offer) >= 0;
  }

  /** Hedef oyuncuya kişisel tercih (Orta botta yok; Gerçekçi botta kin, fırsat, sezgi) */
  protected targetBias(_state: GameState, _p: number, _q: number): number {
    return 0;
  }

  /** Teklifin bu bot için akçe cinsinden kabaca değeri */
  protected offerValue(state: GameState, p: number, offer: Offer): number {
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
    return value;
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
      case 'permit':
        return this.pickPermit(state, p);
      case 'upkeep':
        return this.pickUpkeep(state, p);
      case 'actions':
        return this.pickTurnAction(state, p);
      case 'gameover':
        return { type: 'END_TURN', player: p };
    }
  }

  /** İzin aşaması: söz sahibiyse cevap verir, sıra sahibiyse istenen vergiyi değerlendirir */
  protected pickPermit(state: GameState, p: number): Action {
    const ph = state.phase;
    if (ph.kind !== 'permit') return fallbackAction(state, p);
    if (ph.player === p) {
      const total = ph.requests.reduce((a, r) => a + r.toll, 0);
      return { type: 'CONFIRM_PERMIT', player: p, accept: ph.stage === 'confirm' && total <= state.players[p].resources.akce * 0.5 };
    }
    const req = ph.requests.find((r) => r.controller === p && !r.answered);
    if (!req) return fallbackAction(state, p);
    const stance = this.straitStance(state, p, ph.player);
    return { type: 'RESPOND_PERMIT', player: p, straitId: req.straitId, decision: stance.mode === 'ask' ? 'once' : stance.mode, toll: stance.toll };
  }

  /** Bu oyuncuya boğazda nasıl davranılır: düşmana kapalı, müttefike açık, diğerlerinden vergi */
  protected straitStance(state: GameState, p: number, q: number): StraitPolicy {
    if (isAllied(state, p, q)) return { mode: 'open', toll: 0 };
    if (hostileRecently(state, p, q)) return { mode: 'closed', toll: 0 };
    return { mode: 'toll', toll: atPeace(state, p, q) ? 50 : 100 };
  }

  /** İlişki değiştiyse kalıcı boğaz ayarını güncelle (henüz sorulmamış oyunculara dokunmaz) */
  protected pickStraitPolicy(state: GameState, p: number): Action | null {
    for (const st of state.map.straits) {
      const live = state.straits[st.id];
      if (!live.controllers.includes(p)) continue;
      for (const [q, pol] of Object.entries(live.policies[p] ?? {})) {
        const want = this.straitStance(state, p, Number(q));
        if (state.players[Number(q)]?.alive && (want.mode !== pol.mode || want.toll !== pol.toll)) {
          return { type: 'SET_STRAIT_POLICY', player: p, straitId: st.id, target: Number(q), mode: want.mode, toll: want.toll };
        }
      }
    }
    return null;
  }

  /** Bu rota yakın zamanda reddedilmiş bir izin gerektiriyor mu? (aynı soru her tur tekrarlanmasın) */
  protected routeRefused(state: GameState, p: number, asks: { straitId: number }[]): boolean {
    const denied = state.players[p].permitDenied;
    if (!denied) return false;
    const window = alivePlayers(state).length * this.tuning.permitRetryRounds;
    return asks.some((a) => denied[a.straitId] !== undefined && state.turnCounter - denied[a.straitId] < window);
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

    // 2b') İşe yaramayan yapıyı yık
    const demolish = this.pickDemolish(state, p);
    if (demolish) return demolish;

    // 2c) İlişkisi değişen oyuncuların boğaz ayarı
    const strait = this.pickStraitPolicy(state, p);
    if (strait) return strait;

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

    // 9) Borç: başkent savaşı masrafına az kaldıysa iste; varlıklıysa güvendiğine teklif et
    const loan = this.pickLoan(state, p);
    if (loan) return loan;

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

  /**
   * Yapı yıkma: bakım isteyen ve düşmandan uzak üs ile gidecek yeri kalmamış, boş tersane. Ücret akçenin
   * küçük bir payıysa; yeni tersane kurmaktansa eskisini tutmak daha ucuz olduğu için başka durumda yıkılmaz.
   */
  protected pickDemolish(state: GameState, p: number): Action | null {
    const cfg = state.config;
    if (state.players[p].resources.akce < cfg.demolishCost * 4) return null;
    if (cfg.upkeepEnabled && cfg.baseUpkeep > 0) {
      for (const t of ownedStructures(state, p, 'base')) {
        let near = false;
        for (let i = 0; i < state.owner.length && !near; i++) {
          const o = state.owner[i];
          near = o !== null && o !== p && !isAllied(state, o, p) && manhattan(state.map, i, t) <= 6;
        }
        if (!near) return { type: 'DEMOLISH', player: p, tile: t };
      }
    }
    for (const t of ownedStructures(state, p, 'shipyard')) {
      if (state.units.some((u) => u.tile === t)) continue;
      const reach = [...shipRoutes(state, p, t).targets].some((x) => state.owner[x] !== p);
      if (!reach) return { type: 'DEMOLISH', player: p, tile: t };
    }
    return null;
  }

  /** Bakım ödenemiyor: altın da yetmeyecekse önce birinden borç ister, olmazsa otomatik dağıtır. */
  protected pickUpkeep(state: GameState, p: number): Action {
    const ph = state.phase;
    const me = state.players[p];
    if (ph.kind === 'upkeep' && ph.due > me.resources.akce + me.resources.gold * state.config.goldToAkce) {
      const ask = this.pickLoanRequest(state, p, ph.due - me.resources.akce - me.resources.gold * state.config.goldToAkce);
      if (ask) return ask;
    }
    return autoUpkeepAction(state, p);
  }

  /** Güven: müttefik 2, barış 1, nötr 0, son zamanda saldıran ya da borcunu ödemeyen -1 */
  protected trust(state: GameState, p: number, q: number): number {
    if (state.loans.some((l) => l.borrower === q && l.lender === p && l.overdue)) return -1;
    if (hostileRecently(state, p, q)) return -1;
    if (isAllied(state, p, q)) return 2;
    return atPeace(state, p, q) ? 1 : 0;
  }

  /** Bu turda borç istenecek oyuncu: güvenilen ve akçesi yeten; aynı tur bir kez */
  protected pickLoanRequest(state: GameState, p: number, gap: number): Action | null {
    if (eventsThisTurn(state).some((e) => e.type === 'loan_requested' && e.borrower === p)) return null;
    if (state.loanRequests.some((r) => r.borrower === p)) return null;
    const amount = Math.ceil(gap / 100) * 100;
    const others = state.players.filter((q) => q.alive && q.id !== p && q.resources.akce >= amount + 200 && this.trust(state, p, q.id) >= 0);
    if (others.length === 0) return null;
    const lender = best(others, (q) => this.trust(state, p, q.id) * 1000 + q.resources.akce);
    return { type: 'REQUEST_LOAN', player: p, to: lender.id, amount, term: 5 };
  }

  /** Borç isteğine ya da gelen koşullara cevap. Güvene göre: güvenmediğine vermez, tanımadığına faizli verir. */
  answerLoan(state: GameState, p: number, r: LoanRequest): Action {
    if (r.stage === 'asked') {
      const t = this.trust(state, p, r.borrower);
      const left = state.players[p].resources.akce - r.amount;
      const ok = t >= 0 && left >= 400 && r.amount <= state.players[p].resources.akce * (t === 2 ? 0.6 : 0.35);
      return { type: 'RESPOND_LOAN', player: p, requestId: r.id, accept: ok, rate: ok ? loanRateFor(t) : 0 };
    }
    // Faiz çok yüksek değilse ve vadede ödenebilecekse kabul
    const income = this.expectedIncome(state, p);
    const total = loanTotal(r.amount, r.rate ?? 0);
    return { type: 'CONFIRM_LOAN', player: p, requestId: r.id, accept: (r.rate ?? 0) <= 30 && total <= income * r.term };
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
        if (t.kind !== 'claim' || me.resources.akce < t.cost + reserve || this.routeRefused(state, p, t.route.asks)) continue;
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
        if (t.kind === 'claim' || this.routeRefused(state, p, t.route.asks)) continue;
        const q = state.owner[t.tile]!;
        if (!enemies.includes(q)) continue;
        const type = kind === 'ship' ? ('SHIP_EXPEDITION' as const) : ('PLANE_EXPEDITION' as const);
        const action: Action = { type, player: p, unitId: unit.id, target: t.tile };
        let value: number;
        if (t.kind === 'base') value = seriesWinProbability(cfg.baseStreak) * tileValue(state, t.tile);
        else {
          const around = [t.tile, ...neighbors4(state.map, t.tile)].filter((x) => state.owner[x] === q && isNormal(state, x));
          // Seçim alınan karelerin komşularına doğru genişler: rakibin bütün sıradan toprağına kadar
          const gainPool = poolValues(state, around, normalTiles(state, q).length);
          // Karşı saldırıda yalnızca savunanla sınırı olan topraklar kaybedilebilir
          const lossPool = poolValues(state, myNormal.filter((x) => touchesPlayer(state, q, x)), myNormal.length);
          value = landValue(outcomes, gainPool, lossPool);
        }
        // Sorulacak izin belirsizdir: açık yol tercih edilir
        options.push({ action, value: value - oilCost * 0.3 - t.cost / 500 - t.route.asks.length * 0.25 });
      }
    }
    let bestOpt: { action: Action; value: number } | null = null;
    for (const o of options) {
      if (!validateAction(state, o.action).ok) continue; // masraf yetmiyor vb.
      const target = o.action.type === 'ATTACK' || o.action.type === 'SHIP_EXPEDITION' || o.action.type === 'PLANE_EXPEDITION' ? o.action.target : -1;
      o.value -= this.costValue(state, p, battleCost(state, targetBattleKind(state, target)));
      o.value += this.targetBias(state, p, state.owner[target]!);
      if (!bestOpt || o.value > bestOpt.value) bestOpt = o;
    }
    return bestOpt && bestOpt.value > this.tuning.minBattleValue ? bestOpt.action : null;
  }

  protected pickLoan(state: GameState, p: number): Action | null {
    const me = state.players[p];
    const cost = battleCost(state, 'capital');
    if (this.capitalTarget(state, p) !== null && !battleUsed(state, p) && me.resources.akce < cost.akce && cost.akce - me.resources.akce <= 300) {
      return this.pickLoanRequest(state, p, cost.akce - me.resources.akce);
    }
    if (me.resources.akce < 2500 || (state.round + p) % 4 !== 0) return null;
    if (eventsThisTurn(state).some((e) => e.type === 'loan_requested')) return null;
    const friend = state.players.find((q) => q.alive && q.id !== p && this.trust(state, p, q.id) >= 1 && q.resources.akce < 300 && !state.loanRequests.some((r) => r.borrower === q.id && r.lender === p) && !state.loans.some((l) => l.borrower === q.id && l.lender === p));
    if (!friend) return null;
    return { type: 'OFFER_LOAN', player: p, to: friend.id, amount: 500, term: 5, rate: loanRateFor(this.trust(state, p, friend.id)) };
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

export function fallbackAction(state: GameState, p: number): Action {
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
    case 'permit': {
      const ph = state.phase;
      if (ph.player === p) return { type: 'CONFIRM_PERMIT', player: p, accept: false };
      const req = ph.requests.find((r) => r.controller === p && !r.answered);
      return { type: 'RESPOND_PERMIT', player: p, straitId: req?.straitId ?? -1, decision: 'deny', toll: 0 };
    }
    case 'upkeep':
      return autoUpkeepAction(state, p);
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

/** Güvene göre faiz yüzdesi */
export function loanRateFor(trust: number): number {
  return trust >= 2 ? 5 : trust === 1 ? 10 : 20;
}

/** Bakım otomatik kuralı: açık kapandıysa öde, önce gereken kadar altın boz, sonra birim terhis et, en son üs yık */
export function autoUpkeepAction(state: GameState, p: number): Action {
  const ph = state.phase;
  const me = state.players[p];
  const due = ph.kind === 'upkeep' ? ph.due : 0;
  if (due <= me.resources.akce) return { type: 'PAY_UPKEEP', player: p };
  if (me.resources.gold > 0) {
    const need = Math.ceil((due - me.resources.akce) / Math.max(1, state.config.goldToAkce));
    return { type: 'EXCHANGE_GOLD', player: p, amount: Math.min(me.resources.gold, need) };
  }
  const mine = state.units.filter((u) => u.owner === p);
  const ships = mine.filter((u) => u.kind === 'ship');
  const planes = mine.filter((u) => u.kind === 'plane');
  const pool = planes.length >= ships.length ? planes : ships;
  if (pool.length) return { type: 'DISBAND_UNIT', player: p, unitId: pool[pool.length - 1].id };
  const bases = ownedStructures(state, p, 'base');
  const cap = me.capital;
  // Başkentten en uzak üs en az değerlidir
  return { type: 'DEMOLISH_BASE', player: p, tile: best(bases, (t) => (cap === null ? 0 : manhattan(state.map, t, cap))) };
}

/** q, son rauntlarda p'ye saldırdı mı ya da ittifakı bozdu mu? (herkese açık günlükten) */
export function hostileRecently(state: GameState, p: number, q: number, rounds = 8): boolean {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const l = state.log[i];
    if (state.round - l.round > rounds) break;
    const e = l.event;
    if (e.type === 'battle' && e.attacker === q && e.defender === p) return true;
    if (e.type === 'alliance_broken' && e.player === q && e.target === p) return true;
  }
  return false;
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
