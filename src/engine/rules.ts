import { resolveLandBattle, resolveSeriesBattle, spinTop } from './combat';
import { executeOffer, offerProblem } from './diplomacy';
import { isCoastal, neighbors4 } from './grid';
import {
  allAliveAllied,
  attackBlockReason,
  battleCost,
  battleCostProblem,
  upkeepDue,
  weaknessProblem,
  capitalProblem,
  conquestCandidates,
  isAllied,
  mutRelation,
  refreshStraits,
  touchesOwn,
  transferTile,
  unitCanSortie,
} from './helpers';
import { planeRoutes, shipRoutes, type Route, type RouteMap } from './movement';
import { createRng, type Rng } from './rng';
import {
  MINE_TYPES,
  type Action,
  type ApplyResult,
  type AttackVia,
  type BattleKind,
  type BuildableStructure,
  type GameEvent,
  type GameState,
  type Resources,
  type ValidationResult,
} from './types';

const MAX_LOG = 600;
const OK: ValidationResult = { ok: true };
const fail = (reason: string): ValidationResult => ({ ok: false, reason });

export function structureCost(state: GameState, s: BuildableStructure): number {
  const c = state.config;
  return s === 'shipyard' ? c.shipyardCost : s === 'factory' ? c.factoryCost : c.baseCost;
}

function validTile(state: GameState, t: number): boolean {
  return Number.isInteger(t) && t >= 0 && t < state.owner.length;
}

// ------------------------------------------------------------------
// Doğrulama
// ------------------------------------------------------------------

export function validateAction(state: GameState, action: Action): ValidationResult {
  if (state.phase.kind === 'gameover') return fail('Oyun bitti');
  const p = state.players[action.player];
  if (!p) return fail('Geçersiz oyuncu');
  if (!p.alive) return fail('Bu oyuncu elendi');
  const ph = state.phase;
  const myTurn = state.currentPlayer === action.player;
  const res = p.resources;
  const cfg = state.config;

  if (ph.kind === 'vote' && action.type !== 'CAST_VOTE' && action.type !== 'SET_STRAIT_POLICY') {
    return fail('Önce oylama tamamlanmalı');
  }

  switch (action.type) {
    case 'PLACE_CAPITAL': {
      if (ph.kind !== 'setup_capital') return fail('Şu an başkent seçilmiyor');
      if (!myTurn) return fail('Sıra sizde değil');
      if (!validTile(state, action.tile)) return fail('Geçersiz kare');
      let prob = capitalProblem(state, action.player, action.tile);
      // Mesafe kuralına uyan hiçbir yer kalmadıysa kural gevşer
      if (prob && !capitalProblem(state, action.player, action.tile, true) && !anyStrictCapitalSpot(state, action.player)) prob = null;
      return prob ? fail(prob) : OK;
    }
    case 'PICK_START_TILE': {
      if (ph.kind !== 'setup_territory') return fail('Şu an başlangıç toprağı seçilmiyor');
      if (!myTurn) return fail('Sıra sizde değil');
      if (!validTile(state, action.tile)) return fail('Geçersiz kare');
      if (state.map.terrain[action.tile] !== 'land') return fail('Sadece kara kareleri seçilebilir');
      if (state.owner[action.tile] !== null) return fail('Bu kare sahipli');
      if (state.map.mines[action.tile]) return fail('Başlangıçta maden kareleri seçilemez');
      if (!touchesOwn(state, action.player, action.tile)) return fail('Toprağınıza komşu olmalı');
      return OK;
    }
    case 'SKIP_START_PICKS':
      if (ph.kind !== 'setup_territory') return fail('Şu an başlangıç toprağı seçilmiyor');
      return myTurn ? OK : fail('Sıra sizde değil');
    case 'SPIN':
      if (ph.kind !== 'spin') return fail('Topaç zaten çevrildi');
      return myTurn ? OK : fail('Sıra sizde değil');
    case 'CLAIM_TILE': {
      if (ph.kind !== 'actions') return fail('Şu an eylem yapılamaz');
      if (!myTurn) return fail('Sıra sizde değil');
      if (!validTile(state, action.tile)) return fail('Geçersiz kare');
      if (state.map.terrain[action.tile] !== 'land') return fail('Sadece kara kareleri alınabilir');
      if (state.owner[action.tile] !== null) return fail('Bu kare sahipli');
      if (!touchesOwn(state, action.player, action.tile)) return fail('Toprağınıza sınır komşusu olmalı');
      if (res.akce < cfg.claimCost) return fail(`${cfg.claimCost} akçe gerekli`);
      return OK;
    }
    case 'EXCHANGE_GOLD':
      if (ph.kind !== 'actions' && ph.kind !== 'spin' && ph.kind !== 'conquest' && ph.kind !== 'upkeep') return fail('Şu an bozdurulamaz');
      if (!myTurn) return fail('Sıra sizde değil');
      if (!Number.isInteger(action.amount) || action.amount < 1) return fail('Miktar pozitif tam sayı olmalı');
      if (res.gold < action.amount) return fail('Yeterli altın yok');
      return OK;
    case 'BUILD': {
      if (ph.kind !== 'actions') return fail('Şu an eylem yapılamaz');
      if (!myTurn) return fail('Sıra sizde değil');
      if (!validTile(state, action.tile)) return fail('Geçersiz kare');
      if (!['shipyard', 'factory', 'base'].includes(action.structure)) return fail('Geçersiz yapı');
      if (state.owner[action.tile] !== action.player) return fail('Kendi toprağınızda inşa edebilirsiniz');
      if (state.structure[action.tile] !== null) return fail('Bu karede zaten bir yapı var');
      if (action.structure === 'shipyard' && !isCoastal(state.map, action.tile)) return fail('Tersane denize kıyısı olan bir toprağa kurulur');
      const cost = structureCost(state, action.structure);
      if (res.akce < cost) return fail(`${cost} akçe gerekli`);
      return OK;
    }
    case 'PRODUCE': {
      if (ph.kind !== 'actions') return fail('Şu an eylem yapılamaz');
      if (!myTurn) return fail('Sıra sizde değil');
      if (!validTile(state, action.tile)) return fail('Geçersiz kare');
      if (state.owner[action.tile] !== action.player) return fail('Bu yapı sizin değil');
      if (action.unit === 'ship') {
        if (state.structure[action.tile] !== 'shipyard') return fail('Gemi tersanede üretilir');
        if (res.iron < cfg.shipIronCost || res.akce < cfg.shipAkceCost) return fail(`${cfg.shipIronCost} demir + ${cfg.shipAkceCost} akçe gerekli`);
      } else if (action.unit === 'plane') {
        if (state.structure[action.tile] !== 'factory') return fail('Uçak, uçak fabrikasında üretilir');
        if (res.steel < cfg.planeSteelCost || res.akce < cfg.planeAkceCost) return fail(`${cfg.planeSteelCost} çelik + ${cfg.planeAkceCost} akçe gerekli`);
      } else return fail('Geçersiz birim');
      return OK;
    }
    case 'ATTACK': {
      if (ph.kind !== 'actions') return fail('Şu an eylem yapılamaz');
      if (!myTurn) return fail('Sıra sizde değil');
      if (!validTile(state, action.target)) return fail('Geçersiz kare');
      const o = state.owner[action.target];
      if (o === null) return fail('Sahipsiz topraklar savaşla değil, ele geçirilerek alınır');
      if (o === action.player) return fail('Bu toprak zaten sizin');
      if (!touchesOwn(state, action.player, action.target)) return fail('Saldırmak için sınır komşuluğu gerekli');
      const block = attackBlockReason(state, action.player, o);
      if (block) return fail(block);
      const kind = targetBattleKind(state, action.target);
      if (kind === 'capital') {
        const weak = weaknessProblem(state, action.player, o);
        if (weak) return fail(weak);
      }
      const costProb = battleCostProblem(state, action.player, kind);
      return costProb ? fail(costProb) : OK;
    }
    case 'DISBAND_UNIT': {
      if (ph.kind !== 'upkeep' && ph.kind !== 'actions') return fail('Birimler bakım ya da eylem aşamasında dağıtılır');
      if (!myTurn) return fail('Sıra sizde değil');
      const u = state.units.find((x) => x.id === action.unitId);
      if (!u || u.owner !== action.player) return fail('Birim bulunamadı');
      return OK;
    }
    case 'DEMOLISH_BASE':
      if (ph.kind !== 'upkeep' && ph.kind !== 'actions') return fail('Üsler bakım ya da eylem aşamasında yıkılır');
      if (!myTurn) return fail('Sıra sizde değil');
      if (!validTile(state, action.tile) || state.owner[action.tile] !== action.player || state.structure[action.tile] !== 'base') return fail('Burada senin askeri üssün yok');
      return OK;
    case 'SHIP_EXPEDITION':
    case 'PLANE_EXPEDITION': {
      const r = expeditionCheck(state, action);
      return r.ok ? OK : fail(r.reason);
    }
    case 'CONQUER_TILE':
      if (ph.kind !== 'conquest' || ph.taker !== action.player) return fail('Toprak seçme sırası sizde değil');
      if (!conquestCandidates(state).includes(action.tile)) return fail('Bu toprak alınamaz');
      return OK;
    case 'END_CONQUEST':
      if (ph.kind !== 'conquest' || ph.taker !== action.player) return fail('Toprak seçme sırası sizde değil');
      return OK;
    case 'SET_STRAIT_POLICY': {
      const st = state.straits[action.straitId];
      if (!st) return fail('Geçersiz boğaz');
      if (st.controller !== action.player) return fail('Bu boğazı idare etmiyorsunuz');
      if (!state.players[action.target] || action.target === action.player) return fail('Geçersiz oyuncu');
      if (!Number.isInteger(action.toll) || action.toll < 0 || action.toll > 1_000_000) return fail('Vergi 0 veya pozitif tam sayı olmalı');
      return OK;
    }
    case 'PROPOSE_OFFER': {
      if (ph.kind !== 'actions') return fail('Teklif eylem aşamasında yapılır');
      if (!myTurn) return fail('Sıra sizde değil');
      const prob = offerProblem(state, action.player, action.to, action.items);
      return prob ? fail(prob) : OK;
    }
    case 'RESPOND_OFFER': {
      const offer = state.offers.find((o) => o.id === action.offerId);
      if (!offer) return fail('Teklif bulunamadı');
      if (offer.to !== action.player) return fail('Bu teklif size yapılmadı');
      return OK;
    }
    case 'CANCEL_OFFER': {
      const offer = state.offers.find((o) => o.id === action.offerId);
      if (!offer) return fail('Teklif bulunamadı');
      if (offer.from !== action.player) return fail('Bu teklifi siz yapmadınız');
      return OK;
    }
    case 'BREAK_ALLIANCE':
      if (ph.kind !== 'actions') return fail('Şu an eylem yapılamaz');
      if (!myTurn) return fail('İttifak yalnızca kendi turunuzda bozulabilir');
      if (!isAllied(state, action.player, action.target)) return fail('Bu oyuncuyla ittifakınız yok');
      return OK;
    case 'PROPOSE_VICTORY':
      if (ph.kind !== 'actions') return fail('Şu an eylem yapılamaz');
      if (!myTurn) return fail('Sıra sizde değil');
      if (!allAliveAllied(state)) return fail('Kalan tüm devletler aynı ittifakta olmalı');
      return OK;
    case 'CAST_VOTE':
      if (ph.kind !== 'vote') return fail('Oylama yok');
      if (action.player in ph.votes) return fail('Zaten oy verdiniz');
      return OK;
    case 'END_TURN':
      if (ph.kind !== 'actions') return fail(ph.kind === 'conquest' ? 'Önce fethi tamamlayın' : 'Şu an tur bitirilemez');
      return myTurn ? OK : fail('Sıra sizde değil');
  }
}

function anyStrictCapitalSpot(state: GameState, p: number): boolean {
  for (let i = 0; i < state.owner.length; i++) if (state.map.terrain[i] === 'land' && !capitalProblem(state, p, i)) return true;
  return false;
}

/** Hedef karedeki savaş türü */
export function targetBattleKind(state: GameState, tile: number): BattleKind {
  const st = state.structure[tile];
  return st === 'capital' ? 'capital' : st === 'base' ? 'base' : 'land';
}

type ExpeditionAction = Extract<Action, { type: 'SHIP_EXPEDITION' | 'PLANE_EXPEDITION' }>;

/** Sefer kontrolü; geçerliyse rota bilgisini de döner. */
export function expeditionCheck(
  state: GameState,
  action: ExpeditionAction,
  precomputed?: RouteMap,
): { ok: true; route: Route; claimCost: number } | { ok: false; reason: string } {
  const bad = (reason: string) => ({ ok: false as const, reason });
  if (state.phase.kind !== 'actions') return bad('Şu an eylem yapılamaz');
  if (state.currentPlayer !== action.player) return bad('Sıra sizde değil');
  const isShip = action.type === 'SHIP_EXPEDITION';
  const unit = state.units.find((u) => u.id === action.unitId);
  if (!unit || unit.owner !== action.player) return bad('Birim bulunamadı');
  if (unit.kind !== (isShip ? 'ship' : 'plane')) return bad('Yanlış birim türü');
  if (!unitCanSortie(state, unit)) return bad('Bu birim bu tur yeterince sefer yaptı');
  const cfg = state.config;
  const res = state.players[action.player].resources;
  const oil = isShip ? cfg.shipOilCost : cfg.planeOilCost;
  if (res.oil < oil) return bad(`${oil} petrol gerekli`);
  const t = action.target;
  if (!validTile(state, t)) return bad('Geçersiz kare');
  if (state.map.terrain[t] !== 'land') return bad('Hedef kara olmalı');
  if (isShip && !isCoastal(state.map, t)) return bad('Gemi yalnızca denize kıyısı olan topraklara gidebilir');
  if (state.map.mines[t]) return bad('Maden kareleri gemi veya uçakla doğrudan alınamaz');
  if (state.structure[t] === 'capital') return bad('Başkente gemi veya uçakla saldırılamaz');
  const o = state.owner[t];
  if (o === action.player) return bad('Bu toprak zaten sizin');
  if (o !== null) {
    const block = attackBlockReason(state, action.player, o);
    if (block) return bad(block);
  }
  const routes = precomputed ?? (isShip ? shipRoutes(state, action.player, unit.tile) : planeRoutes(state, action.player, unit.tile));
  const route = routes.routeTo(t);
  if (!route) return bad(isShip ? 'Bu hedefe deniz yolu yok (boğazlar kapalı olabilir)' : 'Askeri üs engeli nedeniyle bu hedefe uçulamaz');
  const claimCost = o === null ? cfg.expeditionClaimCost : 0;
  if (o === null) {
    if (res.akce < route.toll + claimCost) return bad(`${route.toll + claimCost} akçe gerekli (vergi + ele geçirme)`);
  } else {
    const costProb = battleCostProblem(state, action.player, targetBattleKind(state, t), route.toll);
    if (costProb) return bad(costProb);
  }
  return { ok: true, route, claimCost };
}

// ------------------------------------------------------------------
// Uygulama
// ------------------------------------------------------------------

/** Eylemi doğrular ve uygular. Girdi durumu değiştirilmez; yeni durum döner. */
export function applyAction(state: GameState, action: Action, rng: Rng): ApplyResult {
  const v = validateAction(state, action);
  if (!v.ok) throw new Error(v.reason);
  const s: GameState = structuredClone(state);
  const ev: GameEvent[] = [];
  const me = s.players[action.player];
  const cfg = s.config;

  switch (action.type) {
    case 'PLACE_CAPITAL': {
      s.owner[action.tile] = me.id;
      s.structure[action.tile] = 'capital';
      me.capital = action.tile;
      ev.push({ type: 'capital_placed', player: me.id, tile: action.tile });
      const next = s.players.findIndex((pl) => pl.capital === null);
      if (next >= 0) s.currentPlayer = next;
      else {
        s.phase = { kind: 'setup_territory', picksLeft: cfg.startTerritoryCount };
        s.currentPlayer = 0;
        ensureSetupProgress(s, ev);
      }
      break;
    }
    case 'PICK_START_TILE': {
      s.owner[action.tile] = me.id;
      if (s.phase.kind === 'setup_territory') s.phase.picksLeft--;
      ensureSetupProgress(s, ev);
      break;
    }
    case 'SKIP_START_PICKS':
      finishSetupFor(s, ev);
      break;
    case 'SPIN': {
      const value = spinTop(rng, cfg.spinFaces);
      const akce = value * cfg.spinMultiplier;
      me.resources.akce += akce;
      ev.push({ type: 'spin', player: me.id, value, akce });
      s.phase = { kind: 'actions' };
      break;
    }
    case 'CLAIM_TILE':
      me.resources.akce -= cfg.claimCost;
      s.owner[action.tile] = me.id;
      ev.push({ type: 'claim', player: me.id, tile: action.tile, via: 'land', cost: cfg.claimCost });
      break;
    case 'EXCHANGE_GOLD': {
      const akce = action.amount * cfg.goldToAkce;
      me.resources.gold -= action.amount;
      me.resources.akce += akce;
      ev.push({ type: 'exchange', player: me.id, gold: action.amount, akce });
      if (s.phase.kind === 'upkeep') tryPayUpkeep(s, ev);
      break;
    }
    case 'DISBAND_UNIT': {
      const u = s.units.find((x) => x.id === action.unitId)!;
      s.units = s.units.filter((x) => x.id !== u.id);
      ev.push({ type: 'disband', player: me.id, what: u.kind, tile: u.tile, voluntary: s.phase.kind !== 'upkeep' });
      if (s.phase.kind === 'upkeep') tryPayUpkeep(s, ev);
      break;
    }
    case 'DEMOLISH_BASE':
      s.structure[action.tile] = null;
      ev.push({ type: 'disband', player: me.id, what: 'base', tile: action.tile, voluntary: s.phase.kind !== 'upkeep' });
      if (s.phase.kind === 'upkeep') tryPayUpkeep(s, ev);
      break;
    case 'BUILD':
      me.resources.akce -= structureCost(s, action.structure);
      s.structure[action.tile] = action.structure;
      ev.push({ type: 'build', player: me.id, tile: action.tile, structure: action.structure });
      break;
    case 'PRODUCE': {
      if (action.unit === 'ship') {
        me.resources.iron -= cfg.shipIronCost;
        me.resources.akce -= cfg.shipAkceCost;
      } else {
        me.resources.steel -= cfg.planeSteelCost;
        me.resources.akce -= cfg.planeAkceCost;
      }
      const id = s.nextUnitId++;
      s.units.push({ id, kind: action.unit, owner: me.id, tile: action.tile, sortiesThisTurn: 0 });
      ev.push({ type: 'produce', player: me.id, tile: action.tile, unit: action.unit, unitId: id });
      break;
    }
    case 'ATTACK': {
      const defender = s.owner[action.target]!;
      startBattle(s, me.id, defender, action.target, 'land', rng, ev);
      break;
    }
    case 'SHIP_EXPEDITION':
    case 'PLANE_EXPEDITION': {
      const chk = expeditionCheck(state, action);
      if (!chk.ok) throw new Error(chk.reason);
      const unit = s.units.find((u) => u.id === action.unitId)!;
      const isShip = action.type === 'SHIP_EXPEDITION';
      me.resources.oil -= isShip ? cfg.shipOilCost : cfg.planeOilCost;
      for (const t of chk.route.tolls) {
        me.resources.akce -= t.amount;
        s.players[t.controller].resources.akce += t.amount;
      }
      unit.sortiesThisTurn++;
      ev.push({
        type: 'expedition',
        player: me.id,
        unitId: unit.id,
        unit: unit.kind,
        from: unit.tile,
        target: action.target,
        path: chk.route.path,
        tolls: chk.route.tolls,
      });
      const o = s.owner[action.target];
      const via: AttackVia = isShip ? 'ship' : 'plane';
      if (o === null) {
        me.resources.akce -= chk.claimCost;
        s.owner[action.target] = me.id;
        ev.push({ type: 'claim', player: me.id, tile: action.target, via, cost: chk.claimCost });
      } else {
        startBattle(s, me.id, o, action.target, via, rng, ev);
      }
      break;
    }
    case 'CONQUER_TILE': {
      const ph = s.phase;
      if (ph.kind !== 'conquest') break;
      transferTile(s, action.tile, me.id);
      ev.push({ type: 'conquer', player: me.id, from: ph.victim, tile: action.tile });
      ph.remaining--;
      if (ph.remaining <= 0 || conquestCandidates(s).length === 0) s.phase = { kind: 'actions' };
      break;
    }
    case 'END_CONQUEST':
      s.phase = { kind: 'actions' };
      break;
    case 'SET_STRAIT_POLICY': {
      const st = s.straits[action.straitId];
      st.policies[action.target] = { allow: action.allow, toll: action.toll };
      ev.push({ type: 'strait_policy', player: me.id, straitId: action.straitId, target: action.target, allow: action.allow, toll: action.toll });
      break;
    }
    case 'PROPOSE_OFFER': {
      const offer = { id: s.nextOfferId++, from: me.id, to: action.to, items: structuredClone(action.items), createdTurn: s.turnCounter };
      s.offers.push(offer);
      ev.push({ type: 'offer_made', offer: structuredClone(offer) });
      break;
    }
    case 'RESPOND_OFFER': {
      const offer = s.offers.find((o) => o.id === action.offerId)!;
      s.offers = s.offers.filter((o) => o.id !== offer.id);
      if (!action.accept) {
        ev.push({ type: 'offer_response', offerId: offer.id, from: offer.from, to: offer.to, accepted: false });
        break;
      }
      const prob = s.players[offer.from].alive ? offerProblem(s, offer.from, offer.to, offer.items) : 'Teklif sahibi oyunda değil';
      if (prob) {
        ev.push({ type: 'offer_response', offerId: offer.id, from: offer.from, to: offer.to, accepted: false, failedReason: prob });
        break;
      }
      ev.push({ type: 'offer_response', offerId: offer.id, from: offer.from, to: offer.to, accepted: true });
      executeOffer(s, offer, ev);
      break;
    }
    case 'CANCEL_OFFER': {
      const offer = s.offers.find((o) => o.id === action.offerId)!;
      s.offers = s.offers.filter((o) => o.id !== offer.id);
      ev.push({ type: 'offer_cancelled', offerId: offer.id, from: offer.from, to: offer.to });
      break;
    }
    case 'BREAK_ALLIANCE': {
      const rel = mutRelation(s, me.id, action.target);
      rel.allied = false;
      rel.allianceBrokenAtTurn = s.turnCounter;
      ev.push({ type: 'alliance_broken', player: me.id, target: action.target });
      break;
    }
    case 'PROPOSE_VICTORY':
      s.phase = { kind: 'vote', proposer: me.id, votes: { [me.id]: true } };
      ev.push({ type: 'victory_proposed', player: me.id });
      ev.push({ type: 'vote_cast', player: me.id, accept: true });
      resolveVoteIfComplete(s, ev);
      break;
    case 'CAST_VOTE': {
      const ph = s.phase;
      if (ph.kind !== 'vote') break;
      ph.votes[me.id] = action.accept;
      ev.push({ type: 'vote_cast', player: me.id, accept: action.accept });
      resolveVoteIfComplete(s, ev);
      break;
    }
    case 'END_TURN':
      advanceTurn(s, ev);
      break;
  }

  refreshStraits(s, ev);
  for (const e of ev) s.log.push({ turn: s.turnCounter, round: s.round, event: e });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
  return { state: s, events: ev };
}

/** RNG'yi durumun içinden alıp geri yazan kolaylık sarmalayıcısı. */
export function dispatch(state: GameState, action: Action): ApplyResult {
  const rng = createRng(state.rngState);
  const r = applyAction(state, action, rng);
  r.state.rngState = rng.getState();
  return r;
}

// ------------------------------------------------------------------
// Savaş
// ------------------------------------------------------------------

function startBattle(s: GameState, attacker: number, defender: number, target: number, via: AttackVia, rng: Rng, ev: GameEvent[]) {
  const cfg = s.config;
  const A = s.players[attacker];
  A.battlesThisTurn++;
  const struct = s.structure[target];
  // Masraf savaş sonucundan bağımsız, başlatırken ödenir
  const cost = battleCost(s, targetBattleKind(s, target));
  A.resources.akce -= cost.akce;
  A.resources.iron -= cost.iron;
  A.resources.steel -= cost.steel;
  if (struct === 'capital' || struct === 'base') {
    // Başkent / üs savaşında saldıran kaybederse karşı toprak kaybı yok
    const streak = struct === 'capital' ? cfg.capitalStreak : cfg.baseStreak;
    const r = resolveSeriesBattle(rng, cfg.spinFaces, streak);
    ev.push({ type: 'battle', attacker, defender, kind: struct, via, target, rounds: r.rounds, success: r.success, gain: r.success ? 1 : 0, loss: 0, streakNeeded: streak, cost });
    if (!r.success) return;
    if (struct === 'capital') eliminate(s, defender, attacker, ev);
    else {
      transferTile(s, target, attacker);
      ev.push({ type: 'base_captured', player: attacker, from: defender, tile: target });
    }
    return;
  }
  const r = resolveLandBattle(rng, cfg.spinFaces);
  ev.push({ type: 'battle', attacker, defender, kind: 'land', via, target, rounds: r.rounds, success: r.gain > 0, gain: r.gain, loss: r.loss, streakNeeded: 1, cost });
  if (r.gain > 0) {
    s.phase = { kind: 'conquest', taker: attacker, victim: defender, remaining: r.gain, anchor: via === 'land' ? null : target, counter: false };
  } else if (r.loss > 0) {
    // Karşı saldırı: savunan, kendi topraklarına komşu saldıran topraklarından seçer (seferde de sınır kuralı)
    s.phase = { kind: 'conquest', taker: defender, victim: attacker, remaining: r.loss, anchor: null, counter: true };
  }
  if (s.phase.kind === 'conquest' && conquestCandidates(s).length === 0) s.phase = { kind: 'actions' };
}

/** Başkenti düşen oyuncu elenir; her şeyi başkenti alan oyuncuya geçer. */
function eliminate(s: GameState, loser: number, winner: number, ev: GameEvent[]) {
  const L = s.players[loser];
  const W = s.players[winner];
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === loser) s.owner[i] = winner;
  if (L.capital !== null && s.structure[L.capital] === 'capital') s.structure[L.capital] = null;
  for (const u of s.units) if (u.owner === loser) u.owner = winner;
  for (const k of Object.keys(L.resources) as (keyof Resources)[]) {
    W.resources[k] += L.resources[k];
    L.resources[k] = 0;
  }
  L.alive = false;
  L.capital = null;
  L.eliminatedBy = winner;
  s.offers = s.offers.filter((o) => o.from !== loser && o.to !== loser);
  for (const k of Object.keys(s.relations)) {
    const [a, b] = k.split('-').map(Number);
    if (a === loser || b === loser) delete s.relations[k];
  }
  for (const st of s.straits) delete st.policies[loser];
  ev.push({ type: 'eliminated', player: loser, by: winner });
  const alive = s.players.filter((pl) => pl.alive);
  if (alive.length === 1) endGame(s, [alive[0].id], ev);
}

function endGame(s: GameState, winners: number[], ev: GameEvent[]) {
  s.phase = { kind: 'gameover' };
  s.winners = winners;
  ev.push({ type: 'game_over', winners });
}

function resolveVoteIfComplete(s: GameState, ev: GameEvent[]) {
  const ph = s.phase;
  if (ph.kind !== 'vote') return;
  const alive = s.players.filter((pl) => pl.alive).map((pl) => pl.id);
  if (alive.some((id) => ph.votes[id] === false)) {
    s.phase = { kind: 'actions' };
    ev.push({ type: 'vote_result', accepted: false });
    return;
  }
  if (alive.every((id) => ph.votes[id] === true)) {
    ev.push({ type: 'vote_result', accepted: true });
    endGame(s, alive, ev);
  }
}

// ------------------------------------------------------------------
// Tur akışı
// ------------------------------------------------------------------

function hasStartCandidates(s: GameState, p: number): boolean {
  for (let i = 0; i < s.owner.length; i++) {
    if (s.owner[i] !== p) continue;
    for (const n of neighbors4(s.map, i)) if (s.owner[n] === null && s.map.terrain[n] === 'land' && !s.map.mines[n]) return true;
  }
  return false;
}

/** Başlangıç seçimi bittiyse ya da seçilecek kare kalmadıysa sıradakine geçer. */
function ensureSetupProgress(s: GameState, ev: GameEvent[]) {
  const ph = s.phase;
  if (ph.kind !== 'setup_territory') return;
  if (ph.picksLeft <= 0 || !hasStartCandidates(s, s.currentPlayer)) finishSetupFor(s, ev);
}

function finishSetupFor(s: GameState, ev: GameEvent[]) {
  const p = s.currentPlayer;
  ev.push({ type: 'setup_done', player: p, tiles: s.owner.filter((o) => o === p).length });
  if (p + 1 < s.players.length) {
    s.currentPlayer = p + 1;
    s.phase = { kind: 'setup_territory', picksLeft: s.config.startTerritoryCount };
    ensureSetupProgress(s, ev);
  } else {
    s.currentPlayer = 0;
    s.round = 1;
    s.turnCounter = 1;
    ev.push({ type: 'game_started' });
    beginTurn(s, ev);
  }
}

function beginTurn(s: GameState, ev: GameEvent[]) {
  const p = s.players[s.currentPlayer];
  p.battlesThisTurn = 0;
  for (const u of s.units) if (u.owner === p.id) u.sortiesThisTurn = 0;
  ev.push({ type: 'turn_start', player: p.id, round: s.round });
  const gained: Partial<Resources> = {};
  for (let i = 0; i < s.owner.length; i++) {
    const m = s.map.mines[i];
    if (m && s.owner[i] === p.id) gained[m] = (gained[m] ?? 0) + 1;
  }
  let any = false;
  for (const m of MINE_TYPES) {
    if (gained[m]) {
      p.resources[m] += gained[m]!;
      any = true;
    }
  }
  if (any) ev.push({ type: 'income', player: p.id, gained });
  // Bakım: topaçtan önce otomatik ödenir; yetmezse oyuncu dağıtacaklarını seçer
  s.phase = { kind: 'upkeep', due: 0 };
  tryPayUpkeep(s, ev);
}

/** Bakımı öder ve topaç aşamasına geçer; akçe yetmiyorsa bakım aşamasında kalır. */
function tryPayUpkeep(s: GameState, ev: GameEvent[]) {
  const p = s.players[s.currentPlayer];
  const due = upkeepDue(s, p.id);
  if (due > p.resources.akce) {
    s.phase = { kind: 'upkeep', due };
    return;
  }
  if (due > 0) {
    p.resources.akce -= due;
    const ships = s.units.filter((u) => u.owner === p.id && u.kind === 'ship').length;
    const planes = s.units.filter((u) => u.owner === p.id && u.kind === 'plane').length;
    let bases = 0;
    for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === p.id && s.structure[i] === 'base') bases++;
    ev.push({ type: 'upkeep', player: p.id, amount: due, ships, planes, bases });
  }
  s.phase = { kind: 'spin' };
}

function advanceTurn(s: GameState, ev: GameEvent[]) {
  const n = s.players.length;
  let next = s.currentPlayer;
  for (let k = 0; k < n; k++) {
    next = (next + 1) % n;
    if (s.players[next].alive) break;
  }
  // Sıra başa sardıysa yeni tam tur başlar
  if (next <= s.currentPlayer) s.round++;
  s.currentPlayer = next;
  s.turnCounter++;
  beginTurn(s, ev);
}
