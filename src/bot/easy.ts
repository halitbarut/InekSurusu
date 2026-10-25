import {
  attackableTiles,
  battleUsed,
  mixSeed,
  offerProblem,
  tileCount,
  validateAction,
  type Action,
  type GameState,
  type Offer,
} from '../engine';
import { MediumBot, MEDIUM_TUNING, tileScore, type BotTuning } from './medium';

/**
 * Bot kararlarındaki rastgelelik. Oyunun RNG'sine dokunmaz (gelecekteki topaçları göremez ve
 * değiştiremez); aynı durumdan aynı değeri üretir, böylece simülasyonlar tekrarlanabilir kalır.
 */
export function botNoise(state: GameState, p: number, salt: number): number {
  const me = state.players[p];
  let h = mixSeed(state.map.seed, state.turnCounter * 7919 + salt);
  h = mixSeed(h, me.resources.akce * 31 + tileCount(state, p) * 131 + state.units.length * 17 + state.offers.length + p);
  return h / 4294967296;
}

export const EASY_TUNING: BotTuning = {
  ...MEDIUM_TUNING,
  // Beklenen değeri eksi olan savaşlara da girer
  minBattleValue: -0.8,
  // Bakımı pek düşünmeden birim üretir
  maxUpkeepShare: 0.6,
  upkeepCap: 0.85,
  upkeepExcessShare: 1.1,
  // Başkent savaşı için ne biriktirir ne de iyi hedef seçer
  capitalCostCushion: 1,
  capitalReserveUpkeep: false,
  capitalWeakRatio: 0.7,
  diplomacyEvery: 5,
  pushBonus: 0,
};

/**
 * Kolay bot: orta botun kararlarına rastgelelik katar. Toprağı ve fetih karelerini gelişigüzel seçer,
 * savaş hakkını çoğu zaman rastgele bir sınır karesine harcar, bazen turu erkenden bitirir ve kendisine
 * gelen teklifleri kolayca kabul eder.
 */
export class EasyBot extends MediumBot {
  constructor(overrides: Partial<BotTuning> = {}) {
    super({ ...EASY_TUNING, ...overrides });
  }

  protected override pickTurnAction(state: GameState, p: number): Action {
    // Planlamadan turu erken bitirebilir (savaş ya da toprak almadan)
    if (state.players[p].resources.akce > 0 && botNoise(state, p, 1) < 0.12) return { type: 'END_TURN', player: p };
    return super.pickTurnAction(state, p);
  }

  protected override claimScore(state: GameState, p: number, t: number): number {
    // Değerlendirmenin üstüne büyük gürültü: madenleri bile kaçırabilir
    return tileScore(state, p, t) + botNoise(state, p, 1000 + t) * 14;
  }

  protected override pickConquest(state: GameState, taker: number, victim: number, counter: boolean, cands: number[]): number {
    if (botNoise(state, taker, 2) < 0.6) return cands[Math.floor(botNoise(state, taker, 3) * cands.length)];
    return super.pickConquest(state, taker, victim, counter, cands);
  }

  protected override pickBattle(state: GameState, p: number): Action | null {
    if (battleUsed(state, p)) return null;
    // Çoğu zaman beklenen değere bakmadan rastgele bir komşuya saldırır
    if (botNoise(state, p, 4) < 0.45) {
      const tiles = attackableTiles(state, p);
      if (tiles.length) {
        const a: Action = { type: 'ATTACK', player: p, target: tiles[Math.floor(botNoise(state, p, 5) * tiles.length)] };
        if (validateAction(state, a).ok) return a;
      }
    }
    return super.pickBattle(state, p);
  }

  protected override capitalReserve(): number {
    return 0;
  }

  protected override pickExpeditionClaim(state: GameState, p: number, reserve: number, claimableCount: number): Action | null {
    // Seferle uzak toprak almayı çoğu zaman akıl etmez
    if (botNoise(state, p, 6) < 0.6) return null;
    return super.pickExpeditionClaim(state, p, reserve, claimableCount);
  }

  override evaluateOffer(state: GameState, p: number, offer: Offer): boolean {
    // Kolay kandırılır: ittifak ve barışı hep kabul eder, kendi aleyhine takasları da çoğu zaman yutar
    if (offerProblem(state, offer.from, offer.to, offer.items)) return false;
    if (offer.items.every((it) => it.kind === 'alliance' || it.kind === 'peace')) return true;
    return super.evaluateOffer(state, p, offer) || botNoise(state, p, 7 + offer.id) < 0.7;
  }
}
