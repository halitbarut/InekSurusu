import type { Action, GameState, LoanRequest, Offer } from '../engine';

/**
 * Bot beyni. Botlar insanlarla aynı Action arayüzünü kullanır; her çağrıda
 * yalnızca bir sonraki eylemi seçer. Yeni seviyeler (kolay/zor) bu arayüzü uygular.
 */
export interface BotBrain {
  /** Sıra bottayken (kurulum, topaç, eylem, fetih aşamaları) bir sonraki eylem */
  chooseAction(state: GameState, player: number): Action;
  /** Bota gelen teklifi kabul etsin mi? */
  evaluateOffer(state: GameState, player: number, offer: Offer): boolean;
  /** Bota gelen borç görüşmesine cevap: istekte RESPOND_LOAN, koşullarda CONFIRM_LOAN */
  answerLoan(state: GameState, player: number, request: LoanRequest): Action;
  /** İttifakla bitirme oylamasında oy */
  vote(state: GameState, player: number): boolean;
}
