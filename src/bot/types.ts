import type { Action, GameState, LoanRequest, Offer, OfferItem } from '../engine';

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
  /** Teklifi reddetmek yerine karşı teklif (kalemler bu botun gözünden); null = yok */
  counterOffer?(state: GameState, player: number, offer: Offer): OfferItem[] | null;
  /** Bu eylem için düşünme süresi (ms); yoksa sabit bot gecikmesi */
  thinkMs?(state: GameState, player: number, action: Action): number;
  /** İttifakla bitirme oylamasında oy */
  vote(state: GameState, player: number): boolean;
}
