import {
  attackableTiles,
  isAllied,
  manhattan,
  tileCount,
  validateAction,
  type Action,
  type GameState,
} from '../engine';
import { MediumBot, MEDIUM_TUNING, type BotTuning } from './medium';

/**
 * Acele eden bot (denge simülasyonu için): en yakın rakip başkentine doğru toprak alır,
 * savaş hakkını hep o başkente doğru kullanır ve başkente komşu olur olmaz, masrafı
 * yetiyorsa (zayıflık şartı ya da hedefin gücü umursanmadan) başkent savaşına girer.
 */
export class RusherBot extends MediumBot {
  /** overrides: koşudan bağımsız ayarlar (ör. bakım politikası) diğer botlarla aynı olsun diye */
  constructor(overrides: Partial<BotTuning> = {}) {
    super({ ...MEDIUM_TUNING, ...overrides, capitalWeakRatio: Infinity, capitalCostCushion: 1, capitalReserveUpkeep: false });
  }

  /** En yakın, saldırılabilir rakip başkenti */
  private nearestCapital(state: GameState, p: number): number | null {
    const mine = state.players[p].capital;
    if (mine === null) return null;
    let best: number | null = null;
    let bestD = Infinity;
    for (const q of state.players) {
      if (!q.alive || q.id === p || q.capital === null) continue;
      // Hedef seçimi saldırı yasaklarından (savaş hakkı, açılış barışı) bağımsız; yalnızca müttefikler hariç
      if (isAllied(state, p, q.id)) continue;
      const d = manhattan(state.map, mine, q.capital);
      if (d < bestD) {
        bestD = d;
        best = q.capital;
      }
    }
    return best;
  }

  protected override claimScore(state: GameState, p: number, t: number): number {
    const cap = this.nearestCapital(state, p);
    return super.claimScore(state, p, t) * 0.3 - (cap === null ? 0 : 2 * manhattan(state.map, t, cap));
  }

  protected override pickBattle(state: GameState, p: number): Action | null {
    const cap = this.nearestCapital(state, p);
    const tiles = attackableTiles(state, p);
    if (cap === null || tiles.length === 0) return super.pickBattle(state, p);
    if (tiles.includes(cap)) {
      const a: Action = { type: 'ATTACK', player: p, target: cap };
      if (validateAction(state, a).ok) return a;
    }
    // Başkente en yakın sıradan sınır karesine saldır (beklenen değer negatif olsa da)
    const owner = state.owner[cap];
    const candidates = tiles.filter((t) => state.owner[t] === owner && state.structure[t] !== 'capital' && state.structure[t] !== 'base');
    if (candidates.length) {
      const t = candidates.reduce((a, b) => (manhattan(state.map, a, cap) <= manhattan(state.map, b, cap) ? a : b));
      const a: Action = { type: 'ATTACK', player: p, target: t };
      if (validateAction(state, a).ok) return a;
    }
    return super.pickBattle(state, p);
  }

  /** Başkente komşuyken savaş masrafını biriktir */
  protected override capitalReserve(state: GameState, p: number): number {
    const cap = this.nearestCapital(state, p);
    if (cap === null || !state.config.battleCostsEnabled) return 0;
    const near = attackableTiles(state, p).length > 0 && tileCount(state, p) > 0;
    return near ? state.config.capitalBattleAkce : state.config.landBattleAkce;
  }
}
