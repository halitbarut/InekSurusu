import { validateAction, type Action, type GameState } from '../engine';
import { MediumBot } from './medium';

/**
 * Tur süresi dolunca oyuncu adına yapılacak otomatik eylemler. Her çağrı bir sonraki eylemi verir;
 * oyuncunun bekleyen bir kararı kalmayınca null döner. Sıra:
 * topaç çevrilmemişse çevrilir → bekleyen zorunlu seçimler (bakımda dağıtma, fetihte toprak seçimi,
 * kurulum seçimleri, oylama) Orta seviye bot mantığıyla yapılır → eylem aşamasındaysa tur biter.
 */
const medium = new MediumBot();

export function timeoutAction(state: GameState, p: number): Action | null {
  const ph = state.phase;
  const pl = state.players[p];
  if (!pl || !pl.alive) return null;
  let a: Action | null = null;
  switch (ph.kind) {
    case 'gameover':
      return null;
    case 'vote':
      if (p in ph.votes) return null;
      a = { type: 'CAST_VOTE', player: p, accept: medium.vote() };
      break;
    case 'conquest':
      // Fetihte seçimi yapan taraf (karşı saldırıda savunan) karar verir
      if (ph.taker !== p) return null;
      a = medium.chooseAction(state, p);
      break;
    case 'spin':
      if (state.currentPlayer !== p) return null;
      a = { type: 'SPIN', player: p };
      break;
    case 'actions':
      if (state.currentPlayer !== p) return null;
      a = { type: 'END_TURN', player: p };
      break;
    case 'upkeep':
    case 'setup_capital':
    case 'setup_territory':
      if (state.currentPlayer !== p) return null;
      a = medium.chooseAction(state, p);
      break;
  }
  return a && validateAction(state, a).ok ? a : null;
}
