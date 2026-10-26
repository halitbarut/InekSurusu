import { conquestCandidates, validateAction, type Action, type GameState } from '../engine';
import { fallbackAction } from './medium';
import type { BotBrain } from './types';

/**
 * Öğreticideki botlar: kendileri saldırmaz, toprak almaz, inşa etmez; yalnızca topacı çevirip turu bitirir,
 * teklifleri ve ittifakla bitirme oylamasını kabul eder. Karşı saldırıda (oyuncu kaybedince) en güneydeki
 * kareleri seçer, böylece öğreticinin sonraki adımlarında kullanılan kuzey sınırı bozulmaz.
 */
export class TutorialBot implements BotBrain {
  chooseAction(state: GameState, p: number): Action {
    const ph = state.phase;
    let a: Action;
    switch (ph.kind) {
      case 'spin':
        a = { type: 'SPIN', player: p };
        break;
      case 'conquest': {
        const w = state.map.width;
        const c = conquestCandidates(state).sort((x, y) => Math.floor(y / w) - Math.floor(x / w) || (y % w) - (x % w));
        a = c.length ? { type: 'CONQUER_TILE', player: ph.taker, tile: c[0] } : { type: 'END_CONQUEST', player: ph.taker };
        break;
      }
      case 'vote':
        a = { type: 'CAST_VOTE', player: p, accept: true };
        break;
      default:
        a = { type: 'END_TURN', player: p };
    }
    return validateAction(state, a).ok ? a : fallbackAction(state, p);
  }

  evaluateOffer(): boolean {
    return true;
  }

  vote(): boolean {
    return true;
  }
}
