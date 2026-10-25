import {
  attackBlockReason,
  battleCost,
  battleCostProblem,
  battleUsed,
  isAllied,
  manhattan,
  neighbors4,
  offerProblem,
  tileCount,
  upkeepDue,
  validateAction,
  type Action,
  type GameState,
  type Offer,
} from '../engine';
import { MediumBot, MEDIUM_TUNING, strongestOther, tileScore, type BotTuning } from './medium';

export const HARD_TUNING: BotTuning = {
  ...MEDIUM_TUNING,
  // Başkent savaşının değerini beklenen değer belirler; hedefin büyüklüğüne ayrıca sınır koymaz
  capitalWeakRatio: Infinity,
  pushBonus: 1.2,
};

/** Hedef başkente doğru genişlemenin kare başına ağırlığı */
const HUNT_WEIGHT = 0.25;

/**
 * Zor bot: orta botun değerlendirmesini kullanır ama
 * - en yakın saldırılabilir rakip başkentini hedef seçer, toprak alımını ve fethi oraya yöneltir,
 * - başkente komşu olunca savaş masrafını ve demiri o savaş için saklar,
 * - kendi başkentine komşu düşman toprağını tehdit sayar ve savaş hakkını önce onu geri itmeye harcar,
 * - teklifleri daha sıkı değerlendirir: başkent çevresini ve madenleri vermez, güçlüyken ittifakla zaferi paylaşmaz.
 * Oyunun RNG'sini görmez; yalnızca herkesin görebildiği durumu kullanır.
 */
export class HardBot extends MediumBot {
  constructor(overrides: Partial<BotTuning> = {}) {
    super({ ...HARD_TUNING, ...overrides });
  }

  /** Saldırılabilir rakip başkentlerinden en yakını */
  protected huntTarget(state: GameState, p: number): number | null {
    const mine = state.players[p].capital;
    if (mine === null) return null;
    let bestT: number | null = null;
    let bestD = Infinity;
    for (const q of state.players) {
      if (!q.alive || q.id === p || q.capital === null || isAllied(state, p, q.id)) continue;
      const d = manhattan(state.map, mine, q.capital);
      if (d < bestD) {
        bestD = d;
        bestT = q.capital;
      }
    }
    return bestT;
  }

  /** Kendi başkentine komşu, saldırabilen düşman kareleri */
  protected capitalThreats(state: GameState, p: number): number[] {
    const cap = state.players[p].capital;
    if (cap === null) return [];
    return neighbors4(state.map, cap).filter((t) => {
      const o = state.owner[t];
      return o !== null && o !== p && !isAllied(state, p, o);
    });
  }

  protected override pickTurnAction(state: GameState, p: number): Action {
    // Tehdit: başkente komşu düşman toprağını savaş hakkıyla geri it
    if (!battleUsed(state, p)) {
      for (const t of this.capitalThreats(state, p)) {
        if (state.structure[t] === 'capital' || state.structure[t] === 'base') continue;
        const o = state.owner[t]!;
        if (attackBlockReason(state, p, o) || battleCostProblem(state, p, 'land')) continue;
        // Rakibin başkenti de bize komşuysa ve onu vurabiliyorsak orta botun seçimine bırak
        if (this.capitalTarget(state, p) !== null && this.canFundCapitalBattle(state, p)) break;
        const a: Action = { type: 'ATTACK', player: p, target: t };
        if (validateAction(state, a).ok) return a;
      }
    }
    return super.pickTurnAction(state, p);
  }

  protected override claimScore(state: GameState, p: number, t: number): number {
    let s = tileScore(state, p, t);
    const cap = state.players[p].capital;
    // Başkentin çevresini doldurmak (tampon) değerli
    if (cap !== null && manhattan(state.map, t, cap) <= 2) s += 2;
    const target = this.huntTarget(state, p);
    if (target !== null) s -= HUNT_WEIGHT * manhattan(state.map, t, target);
    return s;
  }

  protected override pickConquest(state: GameState, taker: number, victim: number, counter: boolean, cands: number[]): number {
    // Önce başkentime komşu düşman karelerini geri al
    const cap = state.players[taker].capital;
    if (cap !== null) {
      const near = cands.filter((t) => neighbors4(state.map, cap).includes(t));
      if (near.length) return near[0];
    }
    return super.pickConquest(state, taker, victim, counter, cands);
  }

  /** Rakip başkentine komşuyken ya da yaklaşmışken başkent savaşı için akçe biriktir */
  protected override capitalReserve(state: GameState, p: number): number {
    if (!state.config.battleCostsEnabled) return 0;
    const target = this.huntTarget(state, p);
    if (target === null) return 0;
    const reach = Math.min(...ownedFrontDistance(state, p, target));
    if (reach > 3) return super.capitalReserve(state, p);
    return battleCost(state, 'capital').akce + (this.tuning.capitalReserveUpkeep ? upkeepDue(state, p) : 0);
  }

  /** Başkent savaşına yaklaşırken demiri gemiye harcama */
  protected override canSpendIron(state: GameState, p: number, amount: number): boolean {
    if (!state.config.battleCostsEnabled) return true;
    const need = battleCost(state, 'capital').iron;
    if (need === 0) return true;
    const target = this.huntTarget(state, p);
    if (target === null) return true;
    const reach = Math.min(...ownedFrontDistance(state, p, target));
    return reach > 4 || state.players[p].resources.iron - amount >= need;
  }

  override evaluateOffer(state: GameState, p: number, offer: Offer): boolean {
    if (offerProblem(state, offer.from, offer.to, offer.items)) return false;
    const cap = state.players[p].capital;
    const iGive = (side: 'from' | 'to') => (side === 'to') === (offer.to === p);
    for (const it of offer.items) {
      // Başkent çevresini ve madenleri asla vermez
      if (it.kind === 'tile' && iGive(it.giver)) {
        if (state.map.mines[it.tile]) return false;
        if (cap !== null && manhattan(state.map, it.tile, cap) <= 2) return false;
      }
      // Kendisinden güçlü olmayanla ittifak, zaferi paylaşmak demektir
      if (it.kind === 'alliance') {
        const strongest = strongestOther(state, p);
        if (strongest !== null && tileCount(state, p) >= tileCount(state, strongest)) return false;
      }
      // Hedef aldığı rakiple barış yapmaz
      if (it.kind === 'peace' && state.players[offer.from].capital === this.huntTarget(state, p)) return false;
    }
    return super.evaluateOffer(state, p, offer);
  }
}

/** p'nin topraklarının hedef kareye en yakın uzaklığı (dizi boşsa sonsuz) */
function ownedFrontDistance(state: GameState, p: number, target: number): number[] {
  const r: number[] = [Infinity];
  for (let i = 0; i < state.owner.length; i++) if (state.owner[i] === p) r.push(manhattan(state.map, i, target));
  return r;
}
