import type { GameEvent, GameState, LedgerEntry } from './types';

/**
 * Oyuncuların birbirine yaptıklarının kaydı: botların hafızası. Olaylardan türetilir, oyun durumunda tutulduğu için
 * kayıtla taşınır ve geri almayla geri gelir. `viewFor` herkese yalnızca tarafı olduğu kayıtları gösterir.
 */
const EMPTY: LedgerEntry = { attacks: 0, tilesTaken: 0, betrayals: 0, permitsDenied: 0, debtsDefaulted: 0, helped: 0, lastHostile: null, lastRefused: null };

const key = (from: number, to: number) => `${from}>${to}`;

/** from oyuncusunun to oyuncusuna yaptıkları */
export function ledgerEntry(state: GameState, from: number, to: number): LedgerEntry {
  return state.ledger?.[key(from, to)] ?? EMPTY;
}

function mut(s: GameState, from: number, to: number): LedgerEntry {
  const l = (s.ledger ??= {});
  return (l[key(from, to)] ??= { ...EMPTY });
}

/** Bir eylemin olaylarını kayda işler (applyAction çağırır). */
export function recordLedger(s: GameState, events: GameEvent[]) {
  const hostile = (from: number, to: number, f: (e: LedgerEntry) => void) => {
    const e = mut(s, from, to);
    f(e);
    e.lastHostile = s.round;
  };
  for (const e of events) {
    switch (e.type) {
      case 'battle':
        hostile(e.attacker, e.defender, (x) => x.attacks++);
        break;
      case 'conquer':
        hostile(e.player, e.from, (x) => x.tilesTaken++);
        break;
      case 'alliance_broken':
        hostile(e.player, e.target, (x) => x.betrayals++);
        break;
      case 'permit_answered':
        if (!e.allowed) hostile(e.controller, e.requester, (x) => x.permitsDenied++);
        else if (e.toll === 0) mut(s, e.controller, e.requester).helped++;
        break;
      case 'loan_overdue':
        hostile(e.borrower, e.lender, (x) => x.debtsDefaulted++);
        break;
      case 'loan_made':
        mut(s, e.lender, e.borrower).helped++;
        break;
      case 'offer_response':
        if (!e.accepted && !e.failedReason) mut(s, e.to, e.from).lastRefused = s.round;
        break;
    }
  }
}

/** Kabul edilen teklifte karşılıksız ya da karşılıklı veren taraf yardım etmiş sayılır */
export function recordOfferHelp(s: GameState, from: number, to: number, gaveFrom: boolean, gaveTo: boolean) {
  if (gaveFrom) mut(s, from, to).helped++;
  if (gaveTo) mut(s, to, from).helped++;
}

/** Verilen tur numarasından sonraki olaylar (eskiden yeniye) */
export function eventsSince(state: GameState, turn: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = state.log.length - 1; i >= 0 && state.log[i].turn > turn; i--) out.push(state.log[i].event);
  return out.reverse();
}
