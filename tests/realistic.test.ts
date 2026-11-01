import { describe, expect, it } from 'vitest';
import { MediumBot, PERSONALITIES, PHRASES, RealisticBot, getBot, nextBotAction, personalityOf, setBotDebugSink, traitsOf, type BotDecision, type Personality } from '../src/bot';
import { createGame, dispatch, ledgerEntry, parseAction, redactReplay, replayAll, ReplayRecorder, validateAction, type GameState, type Offer } from '../src/engine';
import { viewFor } from '../src/net/protocol';
import { act, at, own, setCapital, testState } from './helpers';

const FIELD = ['########', '########', '########', '########'];

function world(): GameState {
  const s = testState(FIELD, 3);
  s.players.forEach((p) => {
    p.kind = 'bot';
    p.botLevel = 'realistic';
  });
  for (let y = 0; y < 4; y++) {
    own(s, 0, [[0, y], [1, y], [2, y]]);
    own(s, 1, [[3, y], [4, y], [5, y]]);
    own(s, 2, [[7, y]]);
  }
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 5, 3);
  setCapital(s, 2, 7, 0);
  s.players[0].resources.akce = 1000;
  s.players[1].resources.akce = 1000;
  s.botSeed = 7;
  return s;
}

/** Bu koltuğun istenen kişiliğe sahip olacağı tohumu bulur */
function seedFor(s: GameState, p: number, want: Personality): GameState {
  for (let n = 1; n < 2000; n++) {
    s.botSeed = n;
    if (personalityOf(s, p) === want) return s;
  }
  throw new Error('tohum yok');
}

function play(players: number, seed: number, rounds: number) {
  let s: GameState = createGame({
    players: Array.from({ length: players }, (_, i) => ({ name: `R${i}`, color: '#000', kind: 'bot' as const, botLevel: 'realistic' as const })),
    width: 35,
    height: 26,
    seed,
  });
  const initial = structuredClone(s);
  const steps = new ReplayRecorder(initial);
  const brain = () => getBot('realistic');
  let guard = 0;
  while (s.phase.kind !== 'gameover' && s.round <= rounds) {
    const a = nextBotAction(s, brain);
    expect(validateAction(s, a)).toEqual({ ok: true });
    s = dispatch(s, a).state;
    steps.record(a);
    if (++guard > 60000) throw new Error('takıldı');
  }
  return { s, data: steps.data() };
}

describe('Gerçekçi bot: kişilik', () => {
  it('kişilik bot tohumundan gelir, oyun RNG\'sine dokunmaz, koltuklar arasında çeşitlidir', () => {
    const s = world();
    const before = s.rngState;
    const seen = new Set<Personality>();
    for (let n = 1; n < 40; n++) {
      s.botSeed = n;
      seen.add(personalityOf(s, 0));
    }
    expect(seen).toEqual(new Set(PERSONALITIES));
    s.rngState = 12345;
    const a = personalityOf(s, 1);
    s.rngState = 54321;
    expect(personalityOf(s, 1)).toBe(a);
    s.rngState = before;
    new RealisticBot().chooseAction(s, 0);
    expect(s.rngState).toBe(before);
  });

  it('aynı botun kişiliği oyun içinde değişmez ama özellikleri gidişata göre kayar', () => {
    const s = seedFor(world(), 0, 'cautious');
    const calm = traitsOf(s, 0);
    s.ledger = { '1>0': { attacks: 0, tilesTaken: 0, betrayals: 1, permitsDenied: 0, debtsDefaulted: 0, helped: 0, lastHostile: s.round, lastRefused: null } };
    const hurt = traitsOf(s, 0);
    expect(personalityOf(s, 0)).toBe('cautious');
    expect(hurt.aggression).toBeGreaterThan(calm.aggression);
    expect(hurt.loyalty).toBeLessThan(calm.loyalty);
  });
});

describe('Gerçekçi bot: hafıza', () => {
  it('saldırıyı, ihaneti, izin reddini ve ödenmeyen borcu kaydeder; kayıt görünümde yalnızca taraflara gider', () => {
    let s = world();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) }, [2, 2]);
    expect(ledgerEntry(s, 0, 1).attacks).toBe(1);
    expect(viewFor(s, 1).ledger).toHaveProperty(['0>1']);
    expect(viewFor(s, 2).ledger).toEqual({});
    expect(viewFor(s, 2).botSeed).toBe(0);
  });

  it('kin tutar: saldırana boğazı kapatır, borç vermez, teklifini reddeder', () => {
    const s = seedFor(world(), 1, 'aggressive');
    s.ledger = { '0>1': { attacks: 4, tilesTaken: 3, betrayals: 0, permitsDenied: 0, debtsDefaulted: 0, helped: 0, lastHostile: s.round, lastRefused: null } };
    const bot = new RealisticBot();
    const req = { id: 1, borrower: 0, lender: 1, amount: 100, term: 3, rate: null, stage: 'asked' as const, createdTurn: 1 };
    expect(bot.answerLoan(s, 1, req)).toMatchObject({ accept: false });
    const offer: Offer = { id: 1, from: 0, to: 1, items: [{ kind: 'resource', giver: 'from', resource: 'akce', amount: 1000 }], createdTurn: 1 };
    expect(bot.evaluateOffer(s, 1, offer)).toBe(false);
  });

  it('yardım edene karşılık verir: müttefiğe faizi düşük, açgözlü tüccarın faizi yüksek', () => {
    const friend = seedFor(world(), 1, 'loyal');
    friend.relations['0-1'] = { allied: true, peaceUntilRound: null, allianceBrokenAtTurn: null };
    const req = { id: 1, borrower: 0, lender: 1, amount: 100, term: 3, rate: null, stage: 'asked' as const, createdTurn: 1 };
    const a = new RealisticBot().answerLoan(friend, 1, req);
    expect(a).toMatchObject({ accept: true });
    const merchant = seedFor(world(), 1, 'merchant');
    const b = new RealisticBot().answerLoan(merchant, 1, req);
    expect(b).toMatchObject({ accept: true });
    expect((b as { rate: number }).rate).toBeGreaterThan((a as { rate: number }).rate);
  });
});

describe('Gerçekçi bot: pazarlık', () => {
  it('teklif biraz aleyhineyse karşı teklif yapar; zincir uzamaz', () => {
    const s = seedFor(world(), 1, 'merchant');
    const bot = new RealisticBot();
    const o: Offer = { id: 1, from: 0, to: 1, items: [{ kind: 'resource', giver: 'to', resource: 'akce', amount: 300 }], createdTurn: 1 };
    s.offers = [o];
    s.nextOfferId = 2;
    const items = bot.counterOffer(s, 1, o);
    expect(items).not.toBeNull();
    let t = act(s, { type: 'COUNTER_OFFER', player: 1, offerId: 1, items: items! });
    expect(t.offers).toHaveLength(1);
    expect(t.offers[0]).toMatchObject({ from: 1, to: 0, depth: 1 });
    // Bot kendi karşı teklifine yeniden karşı teklif yapmaz
    expect(bot.counterOffer(s, 1, { ...o, depth: 1 })).toBeNull();
    t = act(t, { type: 'COUNTER_OFFER', player: 0, offerId: t.offers[0].id, items: [{ kind: 'peace', rounds: 2 }] });
    expect(t.offers[0].depth).toBe(2);
    expect(validateAction(t, { type: 'COUNTER_OFFER', player: 1, offerId: t.offers[0].id, items: [{ kind: 'peace', rounds: 2 }] }).ok).toBe(false);
  });

  it('bot sözü insan koltuğundan gönderilemez; biçim denetlenir', () => {
    const s = world();
    s.players[0].kind = 'human';
    expect(validateAction(s, { type: 'BOT_SAY', player: 0, phrase: 0, about: -1 }).ok).toBe(false);
    s.players[0].kind = 'bot';
    expect(validateAction(s, { type: 'BOT_SAY', player: 0, phrase: 0, about: 1 }).ok).toBe(true);
    expect(parseAction({ type: 'BOT_SAY', player: 0, phrase: 'x', about: 1 })).toBeNull();
    expect(PHRASES.length).toBeGreaterThan(10);
  });
});

describe('Gerçekçi bot: hile yok', () => {
  it('kararı RNG durumuna, başkalarının teklif ve borçlarına, başkalarının hafızasına bağlı değil', () => {
    const { s } = play(4, 11, 12);
    const live = structuredClone(s);
    if (live.phase.kind === 'gameover') return;
    const bot = new RealisticBot();
    for (const p of live.players.filter((x) => x.alive).map((x) => x.id)) {
      const base = bot.chooseAction(live, p);
      const other = live.players.find((x) => x.id !== p && x.alive)!.id;
      const third = live.players.find((x) => x.id !== p && x.id !== other && x.alive)?.id ?? other;
      const changed = structuredClone(live);
      changed.rngState = 987654321;
      changed.offers.push({ id: 9999, from: other, to: third, items: [{ kind: 'alliance' }], createdTurn: 1 });
      changed.loans.push({ id: 9999, borrower: other, lender: third, principal: 999, rate: 50, total: 1500, paid: 0, dueRound: 99, overdue: false });
      (changed.ledger ??= {})[`${other}>${third}`] = { attacks: 99, tilesTaken: 0, betrayals: 9, permitsDenied: 0, debtsDefaulted: 0, helped: 0, lastHostile: 1, lastRefused: null };
      expect(bot.chooseAction(changed, p)).toEqual(base);
    }
  }, 60_000);
});

describe('Gerçekçi bot: oyun', () => {
  it('oyun takılmadan ilerler, eylemleri geçerli; replay aynı sonucu verir; paylaşılan kopya da', () => {
    const { s, data } = play(4, 21, 40);
    expect(s.round).toBeGreaterThan(10);
    const again = replayAll(data);
    expect(again.owner).toEqual(s.owner);
    expect(again.players.map((p) => p.resources)).toEqual(s.players.map((p) => p.resources));
    const shared = replayAll(redactReplay(data));
    expect(shared.owner).toEqual(s.owner);
  }, 120_000);

  it('hata ayıklama günlüğü kararları gerekçesiyle kaydeder; dinleyici yoksa kayıt yok', () => {
    const log: BotDecision[] = [];
    setBotDebugSink((d) => log.push(d));
    play(4, 33, 25);
    setBotDebugSink(null);
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].why.length).toBeGreaterThan(0);
  }, 120_000);

  it('düşünme süresi: kolay kararlar hızlı, zor kararlar yavaş', () => {
    const s = world();
    const bot = new RealisticBot();
    expect(bot.thinkMs(s, 0, { type: 'SPIN', player: 0 })).toBeLessThanOrEqual(700);
    expect(bot.thinkMs(s, 0, { type: 'ATTACK', player: 0, target: 1 })).toBeGreaterThanOrEqual(1200);
    expect(bot.thinkMs(s, 0, { type: 'BREAK_ALLIANCE', player: 0, target: 1 })).toBeGreaterThanOrEqual(1800);
    expect('thinkMs' in new MediumBot()).toBe(false);
  });
});
