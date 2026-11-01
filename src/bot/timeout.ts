import { validateAction, type Action, type GameState } from '../engine';
import type { PendingResponse } from '../ui/game/responses';
import { MediumBot, autoUpkeepAction } from './medium';

/**
 * Tur süresi dolunca oyuncu adına yapılacak otomatik eylemler. Her çağrı bir sonraki eylemi verir;
 * oyuncunun bekleyen bir kararı kalmayınca null döner. Sıra:
 * topaç çevrilmemişse çevrilir → bekleyen zorunlu seçimler (bakımda dağıtma, fetihte toprak seçimi,
 * kurulum seçimleri) Orta seviye bot mantığıyla yapılır, oylamada "hayır" denir → eylem aşamasındaysa tur biter.
 */
const medium = new MediumBot();

/**
 * Cevap süresi dolunca verilecek karar. Her çağrı bir sonraki eylemi verir; bu cevap için yapılacak bir şey
 * kalmayınca null. Toprak seçimi Orta bot mantığıyla; teklif, borç, boğaz izni reddedilir; oylama "hayır"; bakım otomatik dağıtılır.
 */
export function responseAction(state: GameState, r: Pick<PendingResponse, 'kind' | 'player' | 'ref'>): Action | null {
  const ph = state.phase;
  let a: Action | null = null;
  switch (r.kind) {
    case 'counter':
      if (ph.kind === 'conquest' && ph.counter && ph.taker === r.player) a = medium.chooseAction(state, r.player);
      break;
    case 'vote':
      if (ph.kind === 'vote' && !(r.player in ph.votes)) a = { type: 'CAST_VOTE', player: r.player, accept: false };
      break;
    case 'permit':
      if (ph.kind === 'permit' && ph.requests.some((q) => q.straitId === r.ref && q.controller === r.player && !q.answered)) a = { type: 'RESPOND_PERMIT', player: r.player, straitId: r.ref!, decision: 'deny', toll: 0 };
      break;
    case 'offer':
      if (state.offers.some((o) => o.id === r.ref)) a = { type: 'RESPOND_OFFER', player: r.player, offerId: r.ref!, accept: false };
      break;
    case 'loan': {
      const q = state.loanRequests.find((x) => x.id === r.ref);
      if (q) a = q.stage === 'asked' ? { type: 'RESPOND_LOAN', player: r.player, requestId: q.id, accept: false, rate: 0 } : { type: 'CONFIRM_LOAN', player: r.player, requestId: q.id, accept: false };
      break;
    }
    case 'upkeep':
      if (ph.kind === 'upkeep' && state.currentPlayer === r.player) a = autoUpkeepAction(state, r.player);
      break;
    default:
      break;
  }
  return a && validateAction(state, a).ok ? a : null;
}

export function timeoutAction(state: GameState, p: number): Action | null {
  const ph = state.phase;
  const pl = state.players[p];
  if (!pl || !pl.alive) return null;
  let a: Action | null = null;
  switch (ph.kind) {
    case 'gameover':
      return null;
    case 'vote':
      // Cevap gelmezse oylama "hayır" sayılır
      if (p in ph.votes) return null;
      a = { type: 'CAST_VOTE', player: p, accept: false };
      break;
    case 'permit':
      // Söz sahibi cevaplamadıysa ret; sıra sahibi onaylamadıysa vazgeçer
      if (ph.player === p) a = { type: 'CONFIRM_PERMIT', player: p, accept: false };
      else {
        const req = ph.requests.find((r) => r.controller === p && !r.answered);
        if (!req) return null;
        a = { type: 'RESPOND_PERMIT', player: p, straitId: req.straitId, decision: 'deny', toll: 0 };
      }
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
      if (state.currentPlayer !== p) return null;
      a = autoUpkeepAction(state, p);
      break;
    case 'setup_capital':
    case 'setup_territory':
      if (state.currentPlayer !== p) return null;
      a = medium.chooseAction(state, p);
      break;
  }
  return a && validateAction(state, a).ok ? a : null;
}
