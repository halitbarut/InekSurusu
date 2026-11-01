import type { GameEvent, GameState, Loan, LoanRequest } from './types';

/**
 * Devletler arası borç. Basit faiz: geri ödenecek toplam = miktar × (1 + oran), erken ödemede de aynı toplam.
 * Vade gelince borçlunun o turunda topaçtan sonra kesilir; yetmeyen kısım bitene kadar her turunda kesilir ve
 * bu sürede borçlu herkese "borçlu" görünür. Ayrıntılar yalnızca iki tarafta (viewFor).
 */

export function loanTotal(amount: number, rate: number): number {
  return Math.ceil((amount * (100 + rate)) / 100);
}

export function loanRemaining(l: Pick<Loan, 'total' | 'paid'>): number {
  return l.total - l.paid;
}

export function debtsOf(state: GameState, p: number): Loan[] {
  return state.loans.filter((l) => l.borrower === p);
}

export function creditsOf(state: GameState, p: number): Loan[] {
  return state.loans.filter((l) => l.lender === p);
}

/** Bu görüşmede sıra kimde? */
export function loanResponder(r: Pick<LoanRequest, 'stage' | 'borrower' | 'lender'>): number {
  return r.stage === 'asked' ? r.lender : r.borrower;
}

/** Bu tur (topaçtan sonra) p'den kesilecek toplam */
export function debtDueThisTurn(state: GameState, p: number): number {
  return debtsOf(state, p)
    .filter((l) => state.round >= l.dueRound)
    .reduce((a, l) => a + loanRemaining(l), 0);
}

/** Vadesi geçmiş borcu olanların "borçlu" işaretini günceller */
export function updateDebtors(s: GameState, ev: GameEvent[]) {
  for (const p of s.players) {
    const now = s.loans.some((l) => l.borrower === p.id && l.overdue);
    if (!!p.inDebt !== now) {
      p.inDebt = now;
      ev.push({ type: 'debtor_status', player: p.id, inDebt: now });
    }
  }
}

/** Topaçtan sonra: vadesi gelen borçlar eskiden yeniye kesilir; yetmeyen kısım sonraki turlara kalır */
export function settleDueLoans(s: GameState, p: number, ev: GameEvent[]) {
  const me = s.players[p];
  const due = debtsOf(s, p)
    .filter((l) => s.round >= l.dueRound)
    .sort((a, b) => a.dueRound - b.dueRound || a.id - b.id);
  for (const l of due) {
    const pay = Math.min(me.resources.akce, loanRemaining(l));
    if (pay > 0) {
      me.resources.akce -= pay;
      s.players[l.lender].resources.akce += pay;
      l.paid += pay;
      ev.push({ type: 'loan_payment', loanId: l.id, borrower: l.borrower, lender: l.lender, amount: pay, remaining: loanRemaining(l), early: false, parties: [l.borrower, l.lender] });
    }
    if (loanRemaining(l) > 0) l.overdue = true;
  }
  s.loans = s.loans.filter((l) => loanRemaining(l) > 0);
  updateDebtors(s, ev);
}

/** Başkent düşünce elenen oyuncunun borçları ve alacakları fatihe geçer; kendine borç kalırsa silinir */
export function transferLoans(s: GameState, loser: number, winner: number, ev: GameEvent[]) {
  for (const l of s.loans) {
    if (l.borrower !== loser && l.lender !== loser) continue;
    if (l.borrower === loser) l.borrower = winner;
    if (l.lender === loser) l.lender = winner;
    ev.push({ type: 'loan_transferred', loanId: l.id, from: loser, to: winner, parties: [l.borrower, l.lender] });
  }
  s.loans = s.loans.filter((l) => l.borrower !== l.lender);
  s.loanRequests = s.loanRequests.filter((r) => r.borrower !== loser && r.lender !== loser);
  updateDebtors(s, ev);
}
