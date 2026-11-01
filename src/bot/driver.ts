import { loanResponder, phaseActor, type Action, type GameState } from '../engine';
import type { BotBrain } from './types';

/**
 * Yalnızca botlardan oluşan oyunu bir adım ilerleten eylem (simülasyon ve testler için): önce bekleyen borç
 * görüşmesi ve teklif cevaplanır, sonra kararı beklenen oyuncu oynar.
 */
export function nextBotAction(state: GameState, brain: (p: number) => BotBrain): Action {
  const k = state.phase.kind;
  if (k !== 'vote' && k !== 'permit' && k !== 'gameover') {
    const r = state.loanRequests[0];
    if (r) return brain(loanResponder(r)).answerLoan(state, loanResponder(r), r);
    const o = state.offers[0];
    if (o) return { type: 'RESPOND_OFFER', player: o.to, offerId: o.id, accept: brain(o.to).evaluateOffer(state, o.to, o) };
  }
  const p = phaseActor(state);
  return brain(p).chooseAction(state, p);
}
