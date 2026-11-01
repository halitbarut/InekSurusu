import { describe, expect, it } from 'vitest';
import { MediumBot, autoUpkeepAction, responseAction } from '../src/bot';
import { UndoHistory, dispatch, loanRemaining, loanTotal, parseAction, validateAction, type Action, type GameState } from '../src/engine';
import { eventsFor, viewFor } from '../src/net/protocol';
import { pendingResponses } from '../src/ui/game/responses';
import { act, at, own, setCapital, testState } from './helpers';

const FIELD = ['########', '########', '########', '########'];

function world(): GameState {
  const s = testState(FIELD, 3);
  for (let y = 0; y < 4; y++) {
    own(s, 0, [[0, y], [1, y], [2, y]]);
    own(s, 1, [[3, y], [4, y], [5, y]]);
    own(s, 2, [[7, y]]);
  }
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 5, 3);
  setCapital(s, 2, 7, 0);
  s.players[0].resources.akce = 200;
  s.players[1].resources.akce = 2000;
  s.players[2].resources.akce = 1000;
  return s;
}

/** P0, P1'den borç alır */
function borrow(s: GameState, amount = 500, term = 2, rate = 10): GameState {
  s = act(s, { type: 'REQUEST_LOAN', player: 0, to: 1, amount, term });
  const id = s.loanRequests.at(-1)!.id;
  s = act(s, { type: 'RESPOND_LOAN', player: 1, requestId: id, accept: true, rate });
  return act(s, { type: 'CONFIRM_LOAN', player: 0, requestId: id, accept: true });
}

/** Sırayı p oyuncusuna kadar ilerletir; topaç aşamasında bırakır */
function nextTurnOf(s: GameState, p: number): GameState {
  while (s.currentPlayer !== p || s.phase.kind !== 'spin') {
    if (s.phase.kind === 'spin') s = act(s, { type: 'SPIN', player: s.currentPlayer }, [1]);
    else if (s.phase.kind === 'actions') s = act(s, { type: 'END_TURN', player: s.currentPlayer });
    else throw new Error(s.phase.kind);
  }
  return s;
}

describe('borç akışı ve faiz', () => {
  it('faiz basittir, yukarı yuvarlanır', () => {
    expect(loanTotal(500, 10)).toBe(550);
    expect(loanTotal(500, 0)).toBe(500);
    expect(loanTotal(333, 10)).toBe(367);
  });

  it('isteme → kabul (faizle) → son onay: akçe o an geçer', () => {
    let s = world();
    s = act(s, { type: 'REQUEST_LOAN', player: 0, to: 1, amount: 500, term: 3 });
    expect(s.players[0].resources.akce).toBe(200);
    const id = s.loanRequests[0].id;
    expect(s.loanRequests[0]).toMatchObject({ stage: 'asked', rate: null });
    expect(validateAction(s, { type: 'RESPOND_LOAN', player: 2, requestId: id, accept: true, rate: 0 }).ok).toBe(false);
    s = act(s, { type: 'RESPOND_LOAN', player: 1, requestId: id, accept: true, rate: 10 });
    expect(s.loanRequests[0]).toMatchObject({ stage: 'terms', rate: 10 });
    expect(s.players[1].resources.akce).toBe(2000);
    s = act(s, { type: 'CONFIRM_LOAN', player: 0, requestId: id, accept: true });
    expect(s.loanRequests).toEqual([]);
    expect(s.players[0].resources.akce).toBe(700);
    expect(s.players[1].resources.akce).toBe(1500);
    expect(s.loans[0]).toMatchObject({ borrower: 0, lender: 1, principal: 500, rate: 10, total: 550, paid: 0, dueRound: s.round + 3, overdue: false });
  });

  it('ret ve vazgeçme: hiçbir şey değişmez', () => {
    let s = world();
    s = act(s, { type: 'REQUEST_LOAN', player: 0, to: 1, amount: 500, term: 3 });
    const a = act(s, { type: 'RESPOND_LOAN', player: 1, requestId: s.loanRequests[0].id, accept: false, rate: 0 });
    expect(a.loanRequests).toEqual([]);
    expect(a.loans).toEqual([]);
    const t = act(s, { type: 'RESPOND_LOAN', player: 1, requestId: s.loanRequests[0].id, accept: true, rate: 50 });
    const c = act(t, { type: 'CONFIRM_LOAN', player: 0, requestId: t.loanRequests[0].id, accept: false });
    expect(c.loans).toEqual([]);
    expect(c.players[0].resources.akce).toBe(200);
  });

  it('borç veren isteyen olmadan da teklif edebilir; borçlu kendi sırası değilken de onaylar', () => {
    let s = world();
    s.currentPlayer = 1;
    s = act(s, { type: 'OFFER_LOAN', player: 1, to: 0, amount: 300, term: 4, rate: 0 });
    expect(s.loanRequests[0]).toMatchObject({ stage: 'terms', borrower: 0, lender: 1, rate: 0 });
    s = act(s, { type: 'CONFIRM_LOAN', player: 0, requestId: s.loanRequests[0].id, accept: true });
    expect(s.loans[0].total).toBe(300);
    expect(s.players[0].resources.akce).toBe(500);
  });

  it('kabulde akçe yetmezse borç kurulamaz', () => {
    let s = world();
    s = act(s, { type: 'REQUEST_LOAN', player: 0, to: 1, amount: 500, term: 3 });
    s = act(s, { type: 'RESPOND_LOAN', player: 1, requestId: s.loanRequests[0].id, accept: true, rate: 0 });
    s.players[1].resources.akce = 10;
    s = act(s, { type: 'CONFIRM_LOAN', player: 0, requestId: s.loanRequests[0].id, accept: true });
    expect(s.loans).toEqual([]);
    expect(s.log.at(-1)!.event).toMatchObject({ type: 'loan_declined' });
  });

  it('birden fazla borç alınabilir; aynı ikiliyle aynı anda tek görüşme', () => {
    let s = borrow(world());
    s = act(s, { type: 'REQUEST_LOAN', player: 0, to: 2, amount: 100, term: 2 });
    expect(validateAction(s, { type: 'REQUEST_LOAN', player: 0, to: 2, amount: 100, term: 2 }).ok).toBe(false);
    s = act(s, { type: 'RESPOND_LOAN', player: 2, requestId: s.loanRequests[0].id, accept: true, rate: 0 });
    s = act(s, { type: 'CONFIRM_LOAN', player: 0, requestId: s.loanRequests[0].id, accept: true });
    expect(s.loans.filter((l) => l.borrower === 0)).toHaveLength(2);
  });
});

describe('geri ödeme', () => {
  it('vade gelince borçlunun turunda topaçtan sonra ödenir', () => {
    let s = borrow(world(), 500, 1, 10); // 1. turda, vade 2. tur
    s = act(s, { type: 'END_TURN', player: 0 });
    s = nextTurnOf(s, 0);
    expect(s.round).toBe(2);
    const before = [s.players[0].resources.akce, s.players[1].resources.akce];
    s = act(s, { type: 'SPIN', player: 0 }, [5]);
    expect(s.players[0].resources.akce).toBe(before[0] + 500 - 550);
    expect(s.players[1].resources.akce).toBe(before[1] + 550);
    expect(s.loans).toEqual([]);
    expect(s.players[0].inDebt).toBeFalsy();
  });

  it('vadesi gelmemiş borç kesilmez', () => {
    let s = borrow(world(), 500, 5, 10);
    s = act(s, { type: 'END_TURN', player: 0 });
    s = nextTurnOf(s, 0);
    s = act(s, { type: 'SPIN', player: 0 }, [5]);
    expect(s.loans).toHaveLength(1);
    expect(s.loans[0].paid).toBe(0);
  });

  it('erken ödeme: faiz aynı toplam üzerinden; kısmi ödeme yapılabilir; yalnızca kendi turunda', () => {
    let s = borrow(world(), 500, 5, 10);
    const id = s.loans[0].id;
    s.players[0].resources.akce = 1000;
    expect(validateAction(s, { type: 'REPAY_LOAN', player: 0, loanId: id, amount: 551 }).ok).toBe(false);
    s = act(s, { type: 'REPAY_LOAN', player: 0, loanId: id, amount: 200 });
    expect(loanRemaining(s.loans[0])).toBe(350);
    s = act(s, { type: 'REPAY_LOAN', player: 0, loanId: id, amount: 350 });
    expect(s.loans).toEqual([]);
    expect(s.players[0].resources.akce).toBe(450);
  });

  it('erken ödeme geri alınabilir', () => {
    const h = new UndoHistory();
    const before = borrow(world(), 500, 5, 10);
    const action: Action = { type: 'REPAY_LOAN', player: 0, loanId: before.loans[0].id, amount: 100 };
    const after = dispatch(before, action).state;
    h.record(before, action, after);
    expect(h.canUndo(after, 0)).toBe(true);
    expect(h.undo()!.state.loans[0].paid).toBe(0);
  });

  it('ödenemeyen borç kademeli kesilir, bu sürede borçlu herkese görünür; bitince düşer', () => {
    let s = borrow(world(), 500, 1, 0);
    s.players[0].resources.akce = 0;
    s = act(s, { type: 'END_TURN', player: 0 });
    s = nextTurnOf(s, 0);
    s = act(s, { type: 'SPIN', player: 0 }, [2]); // 200 öder, 300 kalır
    expect(loanRemaining(s.loans[0])).toBe(300);
    expect(s.loans[0].overdue).toBe(true);
    expect(s.players[0].inDebt).toBe(true);
    expect(s.players[0].resources.akce).toBe(0);
    expect(s.log.some((l) => l.event.type === 'debtor_status' && l.event.inDebt)).toBe(true);
    s = act(s, { type: 'END_TURN', player: 0 });
    s = nextTurnOf(s, 0);
    s = act(s, { type: 'SPIN', player: 0 }, [2]);
    expect(loanRemaining(s.loans[0])).toBe(100);
    expect(s.players[0].inDebt).toBe(true);
    s = act(s, { type: 'END_TURN', player: 0 });
    s = nextTurnOf(s, 0);
    s = act(s, { type: 'SPIN', player: 0 }, [8]);
    expect(s.loans).toEqual([]);
    expect(s.players[0].inDebt).toBe(false);
    expect(s.players[0].resources.akce).toBe(700);
  });

  it('başkent düşünce borç ve alacak fatihe geçer; kendine borç silinir', () => {
    // P0 → P1 borçlu, P2 → P0 borçlu; P1, P0'ın başkentini alır
    let s = borrow(world(), 500, 5, 10);
    s = act(s, { type: 'OFFER_LOAN', player: 0, to: 2, amount: 100, term: 5, rate: 0 });
    s = act(s, { type: 'CONFIRM_LOAN', player: 2, requestId: s.loanRequests[0].id, accept: true });
    s = act(s, { type: 'END_TURN', player: 0 });
    s = act(s, { type: 'SPIN', player: 1 }, [1]);
    own(s, 1, [[1, 0]]);
    s = act(s, { type: 'ATTACK', player: 1, target: at(s, 0, 0) }, [8, 1, 8, 1, 8, 1]);
    expect(s.players[0].alive).toBe(false);
    // P0'ın P1'e borcu kendine borç oldu: silindi. P2'nin P0'a borcu P1'e geçti.
    expect(s.loans).toHaveLength(1);
    expect(s.loans[0]).toMatchObject({ borrower: 2, lender: 1, total: 100 });
    expect(s.log.some((l) => l.event.type === 'loan_transferred')).toBe(true);
  });
});

describe('borç gizliliği', () => {
  it('ayrıntılar yalnızca iki tarafta; başkaları yalnızca "borçlu" işaretini görür', () => {
    let s = borrow(world(), 500, 1, 0);
    s.players[0].resources.akce = 0;
    s = act(s, { type: 'END_TURN', player: 0 });
    s = nextTurnOf(s, 0);
    s = act(s, { type: 'SPIN', player: 0 }, [1]);
    s = act(s, { type: 'REQUEST_LOAN', player: 0, to: 1, amount: 100, term: 1 });
    expect(viewFor(s, 0).loans).toHaveLength(1);
    expect(viewFor(s, 1).loans).toHaveLength(1);
    const third = viewFor(s, 2);
    expect(third.loans).toEqual([]);
    expect(third.loanRequests).toEqual([]);
    expect(third.players[0].inDebt).toBe(true);
    expect(viewFor(s, null).loans).toEqual([]);
    const secret = new Set(['loan_requested', 'loan_answered', 'loan_made', 'loan_declined', 'loan_payment', 'loan_transferred']);
    expect(third.log.filter((l) => secret.has(l.event.type))).toEqual([]);
    expect(viewFor(s, 1).log.some((l) => l.event.type === 'loan_made')).toBe(true);
    expect(third.log.some((l) => l.event.type === 'debtor_status')).toBe(true);
    const ev = s.log.map((l) => l.event).filter((e) => secret.has(e.type));
    expect(eventsFor(ev, 2)).toEqual([]);
  });

  it('eylem biçimi denetimi', () => {
    expect(parseAction({ type: 'REQUEST_LOAN', player: 0, to: 1, amount: 5, term: 2, x: 1 })).toEqual({ type: 'REQUEST_LOAN', player: 0, to: 1, amount: 5, term: 2 });
    expect(parseAction({ type: 'RESPOND_LOAN', player: 0, requestId: 1, accept: 'evet', rate: 2 })).toBeNull();
    expect(parseAction({ type: 'REPAY_LOAN', player: 0, loanId: 1, amount: 1.5 })).toBeNull();
    expect(parseAction({ type: 'PAY_UPKEEP', player: 0 })).toEqual({ type: 'PAY_UPKEEP', player: 0 });
  });
});

describe('bakım ekranı', () => {
  function upkeep(akce: number, gold = 5): GameState {
    const s = testState(FIELD, 3, { upkeepEnabled: true, shipUpkeep: 100, planeUpkeep: 100, goldToAkce: 200 });
    own(s, 0, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]]);
    own(s, 1, [[3, 0], [4, 0]]);
    setCapital(s, 0, 0, 0);
    setCapital(s, 1, 5, 3);
    setCapital(s, 2, 7, 0);
    s.structure[at(s, 1, 0)] = 'shipyard';
    s.structure[at(s, 1, 1)] = 'factory';
    s.units = [
      { id: 1, kind: 'ship', owner: 0, tile: at(s, 1, 0), sortiesThisTurn: 0 },
      { id: 2, kind: 'ship', owner: 0, tile: at(s, 1, 0), sortiesThisTurn: 0 },
      { id: 3, kind: 'plane', owner: 0, tile: at(s, 1, 1), sortiesThisTurn: 0 },
    ];
    s.nextUnitId = 4;
    s.players[0].resources = { akce, gold, oil: 0, iron: 0, steel: 0 };
    s.players[1].resources.akce = 1000;
    s.phase = { kind: 'upkeep', due: 300 };
    return s;
  }

  it('kısmi bozdurma: hepsini bozdurmak gerekmez; açık kapanmadan devam edilmez', () => {
    let s = upkeep(0);
    expect(validateAction(s, { type: 'PAY_UPKEEP', player: 0 }).ok).toBe(false);
    s = act(s, { type: 'EXCHANGE_GOLD', player: 0, amount: 1 });
    expect(s.phase).toEqual({ kind: 'upkeep', due: 300 });
    expect(s.players[0].resources).toMatchObject({ akce: 200, gold: 4 });
    expect(validateAction(s, { type: 'PAY_UPKEEP', player: 0 }).ok).toBe(false);
    s = act(s, { type: 'EXCHANGE_GOLD', player: 0, amount: 1 });
    s = act(s, { type: 'PAY_UPKEEP', player: 0 });
    expect(s.phase.kind).toBe('spin');
    expect(s.players[0].resources).toMatchObject({ akce: 100, gold: 3 });
    expect(s.units).toHaveLength(3);
  });

  it('terhis kısmi: birimler tek tek seçilir, bakım düşer', () => {
    let s = upkeep(100, 0);
    s = act(s, { type: 'DISBAND_UNIT', player: 0, unitId: 2 });
    expect(s.phase).toEqual({ kind: 'upkeep', due: 200 });
    s = act(s, { type: 'DISBAND_UNIT', player: 0, unitId: 3 });
    expect(s.phase).toEqual({ kind: 'upkeep', due: 100 });
    s = act(s, { type: 'PAY_UPKEEP', player: 0 });
    expect(s.units.map((u) => u.id)).toEqual([1]);
    expect(s.players[0].resources.akce).toBe(0);
  });

  it('kısmi bozdurma, terhis ve borç birlikte kullanılır', () => {
    let s = upkeep(0, 1);
    s = act(s, { type: 'EXCHANGE_GOLD', player: 0, amount: 1 }); // +200
    s = act(s, { type: 'DISBAND_UNIT', player: 0, unitId: 3 }); // bakım 200
    // Açık kapandı ama borç da alınabilir; açık kalsın diye bir birim daha geri getirmeden borç iste
    s = act(s, { type: 'REQUEST_LOAN', player: 0, to: 1, amount: 100, term: 3 });
    expect(s.phase.kind).toBe('upkeep');
    s = act(s, { type: 'RESPOND_LOAN', player: 1, requestId: s.loanRequests[0].id, accept: true, rate: 10 });
    s = act(s, { type: 'CONFIRM_LOAN', player: 0, requestId: s.loanRequests[0].id, accept: true });
    // Borç geldi, ekran açık: oyuncu "Devam" deyince ödenir
    expect(s.phase.kind).toBe('upkeep');
    expect(s.players[0].resources.akce).toBe(300);
    s = act(s, { type: 'PAY_UPKEEP', player: 0 });
    expect(s.phase.kind).toBe('spin');
    expect(s.players[0].resources.akce).toBe(100);
    expect(s.loans).toHaveLength(1);
  });

  it('hiçbir şey yapılmazsa ya da süre dolunca otomatik kural: gereken kadar altın, sonra terhis', () => {
    let s = upkeep(0, 1);
    const seen: string[] = [];
    const r = pendingResponses(s, { isHuman: () => true }).find((x) => x.kind === 'upkeep')!;
    expect(r).toMatchObject({ player: 0, blocking: true });
    for (let i = 0; i < 10 && s.phase.kind === 'upkeep'; i++) {
      const a = responseAction(s, r)!;
      seen.push(a.type);
      s = dispatch(s, a).state;
    }
    expect(seen).toEqual(['EXCHANGE_GOLD', 'DISBAND_UNIT', 'PAY_UPKEEP']);
    expect(s.phase.kind).toBe('spin');
    expect(s.players[0].resources).toMatchObject({ gold: 0, akce: 0 });
    expect(s.units).toHaveLength(2);
  });

  it('otomatik kural yalnızca gereken kadar altın bozdurur', () => {
    const s = upkeep(0, 5);
    expect(autoUpkeepAction(s, 0)).toEqual({ type: 'EXCHANGE_GOLD', player: 0, amount: 2 });
  });

  it('hot-seat: cihaz geçiş ekranındayken bakım penceresinin süresi işlemez', () => {
    const s = upkeep(0);
    expect(pendingResponses(s, { isHuman: () => true, hotSeat: true, handoff: true }).some((x) => x.kind === 'upkeep')).toBe(false);
  });
});

describe('botlar ve borç', () => {
  const bot = new MediumBot();
  const ask = (s: GameState, borrower: number, lender: number, amount: number) => ({ id: 1, borrower, lender, amount, term: 3, rate: null, stage: 'asked' as const, createdTurn: s.turnCounter });

  it('güvene göre karar verir: müttefike düşük faiz, nötre yüksek faiz, düşmana hayır', () => {
    const s = world();
    s.relations['0-1'] = { allied: true, peaceUntilRound: null, allianceBrokenAtTurn: null };
    const a = bot.answerLoan(s, 1, ask(s, 0, 1, 500));
    expect(a).toMatchObject({ type: 'RESPOND_LOAN', accept: true, rate: 5 });
    const n = world();
    expect(bot.answerLoan(n, 1, ask(n, 0, 1, 500))).toMatchObject({ accept: true, rate: 20 });
    const h = world();
    h.log.push({ turn: 1, round: 1, event: { type: 'battle', attacker: 0, defender: 1, kind: 'land', via: 'land', target: 0, rounds: [], success: false, gain: 0, loss: 0, streakNeeded: 1, cost: { akce: 0, iron: 0, steel: 0 } } });
    expect(bot.answerLoan(h, 1, ask(h, 0, 1, 500))).toMatchObject({ accept: false });
  });

  it('borcunu ödemeyene vermez', () => {
    const s = world();
    s.loans.push({ id: 9, borrower: 0, lender: 1, principal: 100, rate: 0, total: 100, paid: 0, dueRound: 0, overdue: true });
    expect(bot.answerLoan(s, 1, ask(s, 0, 1, 100))).toMatchObject({ accept: false });
  });

  it('bakım ödeyemeyen bot önce borç ister', () => {
    const s = world();
    s.config = { ...s.config, upkeepEnabled: true, shipUpkeep: 500 };
    s.structure[at(s, 1, 1)] = 'shipyard';
    s.units.push({ id: 1, kind: 'ship', owner: 0, tile: at(s, 1, 1), sortiesThisTurn: 0 });
    s.players[0].resources.akce = 100;
    s.phase = { kind: 'upkeep', due: 500 };
    expect(bot.chooseAction(s, 0)).toMatchObject({ type: 'REQUEST_LOAN', player: 0, amount: 400 });
  });
});
