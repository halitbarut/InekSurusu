import type { Action, GameState, Offer } from '../engine';

/**
 * Bot beyni. Botlar insanlarla aynı Action arayüzünü kullanır; her çağrıda
 * yalnızca bir sonraki eylemi seçer. Yeni seviyeler (kolay/zor) bu arayüzü uygular.
 */
export interface BotBrain {
  /** Sıra bottayken (kurulum, topaç, eylem, fetih aşamaları) bir sonraki eylem */
  chooseAction(state: GameState, player: number): Action;
  /** Bota gelen teklifi kabul etsin mi? */
  evaluateOffer(state: GameState, player: number, offer: Offer): boolean;
  /** İttifakla bitirme oylamasında oy */
  vote(state: GameState, player: number): boolean;
}
