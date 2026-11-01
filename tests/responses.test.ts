import { describe, expect, it } from 'vitest';
import { responseAction } from '../src/bot';
import { dispatch, type GameState } from '../src/engine';
import { ResponseTracker, battleWaitsForClick, pendingResponses, type PendingResponse } from '../src/ui/game/responses';
import { act, at, own, setCapital, testState } from './helpers';

const FIELD = ['########', '########', '########', '########'];
const everyone = { isHuman: () => true };

function duel(): GameState {
  const s = testState(FIELD, 3);
  for (let y = 0; y < 4; y++) {
    own(s, 0, [[0, y], [1, y], [2, y]]);
    own(s, 1, [[3, y], [4, y], [5, y]]);
    own(s, 2, [[7, y]]);
  }
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 5, 3);
  setCapital(s, 2, 7, 0);
  return s;
}

function runDefault(s: GameState, r: PendingResponse): GameState {
  for (let i = 0; i < 50; i++) {
    const a = responseAction(s, r);
    if (!a) break;
    s = dispatch(s, a).state;
  }
  return s;
}

describe('bilgilendirme pencereleri sırayı bekletmez', () => {
  it('savunan hiçbir şeye tıklamasa bile saldıranın sırası devam eder', () => {
    // Üs savaşı: bildirilen sorunun senaryosu. Sonuç ne olursa olsun savunandan cevap beklenmez.
    let s = duel();
    s.structure[at(s, 3, 1)] = 'base';
    const won = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) }, [8, 1, 8, 1]);
    expect(won.phase.kind).toBe('actions');
    expect(pendingResponses(won, everyone)).toEqual([]);
    const lost = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) }, [1, 8]);
    expect(lost.phase.kind).toBe('actions');
    expect(pendingResponses(lost, everyone)).toEqual([]);
    // Sıra sahibi hemen sürdürebilir
    expect(act(lost, { type: 'END_TURN', player: 0 }, [3]).currentPlayer).toBe(1);
    // Kara savaşı kazanılınca ya da berabere bitince de
    s = duel();
    expect(pendingResponses(act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) }, [8, 2]), everyone)).toEqual([]);
    expect(pendingResponses(act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) }, [4, 4]), everyone)).toEqual([]);
  });

  it('savaş sonucu penceresi yalnızca saldıranda tıklama bekleyebilir', () => {
    expect(battleWaitsForClick(false, true)).toBe(false);
    expect(battleWaitsForClick(true, true)).toBe(true);
    expect(battleWaitsForClick(true, false)).toBe(false);
  });
});

describe('cevap gerektiren sorular', () => {
  it('karşı saldırıda toprak seçimi: süre dolunca Orta bot mantığıyla seçilir, sıra saldıranda kalır', () => {
    let s = duel();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) }, [2, 6]);
    expect(s.phase).toMatchObject({ kind: 'conquest', taker: 1, counter: true, remaining: 2 });
    const [r] = pendingResponses(s, everyone);
    expect(r).toMatchObject({ kind: 'counter', player: 1, blocking: true, parties: null });
    const after = runDefault(s, r);
    expect(after.phase.kind).toBe('actions');
    expect(after.currentPlayer).toBe(0);
    expect(after.owner.filter((o) => o === 1).length).toBe(s.owner.filter((o) => o === 1).length + 2);
  });

  it('botun karşı saldırısı beklenmez', () => {
    let s = duel();
    s.players[1].kind = 'bot';
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) }, [2, 6]);
    expect(pendingResponses(s, { isHuman: (p) => s.players[p].kind === 'human' })).toEqual([]);
  });

  it('zafer oylaması: süre dolunca "hayır" sayılır', () => {
    let s = duel();
    s.relations['0-1'] = { allied: true, peaceUntilRound: null, allianceBrokenAtTurn: null };
    s.relations['0-2'] = { allied: true, peaceUntilRound: null, allianceBrokenAtTurn: null };
    s.relations['1-2'] = { allied: true, peaceUntilRound: null, allianceBrokenAtTurn: null };
    s = act(s, { type: 'PROPOSE_VICTORY', player: 0 });
    const list = pendingResponses(s, everyone);
    expect(list.map((r) => r.player)).toEqual([1, 2]);
    s = runDefault(s, list[0]);
    expect(s.phase.kind).toBe('actions');
    expect(s.winners).toBeNull();
    expect(s.log.some((l) => l.event.type === 'vote_cast' && l.event.player === 1 && !l.event.accept)).toBe(true);
  });

  it('diplomasi teklifi: süre dolunca reddedilir; teklif oyunu bekletmez ve yalnızca taraflara görünür', () => {
    let s = duel();
    s = act(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'alliance' }] });
    const [r] = pendingResponses(s, everyone);
    expect(r).toMatchObject({ kind: 'offer', player: 1, blocking: false, parties: [0, 1] });
    s = runDefault(s, r);
    expect(s.offers).toEqual([]);
    expect(s.relations['0-1']?.allied ?? false).toBe(false);
  });

  it('hot-seat: alıcı başında değilken teklifin süresi işlemez', () => {
    let s = duel();
    s = act(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'alliance' }] });
    const hot = { isHuman: () => true, hotSeat: true };
    expect(pendingResponses(s, hot)).toEqual([]);
    expect(pendingResponses(s, { ...hot, promptedOffers: new Set([s.offers[0].id]) })).toHaveLength(1);
    expect(pendingResponses({ ...s, currentPlayer: 1 }, hot)).toHaveLength(1);
  });

  it('boğaz izni: süre dolunca reddedilir', () => {
    const rows = ['##############', '#....####....#', '#....####....#', '#............#', '#....####....#', '#....####....#', '##############'];
    let s = testState(rows, 3);
    setCapital(s, 0, 0, 0);
    setCapital(s, 1, 13, 0);
    setCapital(s, 2, 13, 6);
    s.owner[at(s, 0, 3)] = 0;
    s.structure[at(s, 0, 3)] = 'shipyard';
    s.units.push({ id: 1, kind: 'ship', owner: 0, tile: at(s, 0, 3), sortiesThisTurn: 0 });
    s.players[0].resources = { akce: 1000, gold: 1, oil: 5, iron: 0, steel: 0 };
    s.owner[at(s, 5, 2)] = 1;
    s.owner[at(s, 5, 4)] = 1;
    s = act(s, { type: 'EXCHANGE_GOLD', player: 0, amount: 1 });
    const before = s.players[0].resources;
    s = act(s, { type: 'SHIP_EXPEDITION', player: 0, unitId: 1, target: at(s, 11, 0) });
    const [r] = pendingResponses(s, everyone);
    expect(r).toMatchObject({ kind: 'permit', player: 1, blocking: true, ref: 0 });
    s = runDefault(s, r);
    expect(s.phase.kind).toBe('actions');
    expect(s.players[0].resources).toEqual(before);
    expect(s.owner[at(s, 11, 0)]).toBeNull();
  });
});

describe('cevap süresi', () => {
  const r = (key: string, player = 1): PendingResponse => ({ key, player, kind: 'offer', blocking: false, parties: null, ref: 1 });

  it('her bekleyenin kendi süresi işler, her biri bir kez dolar, cevaplanan silinir', () => {
    const t = new ResponseTracker(60_000);
    expect(t.sync([r('a')], 0)).toBe(true);
    expect(t.sync([r('a')], 1000)).toBe(false);
    expect(t.sync([r('a'), r('b')], 30_000)).toBe(true);
    expect(t.info(45_000).map((w) => w.remainingMs)).toEqual([15_000, 45_000]);
    expect(t.expired(59_999)).toEqual([]);
    expect(t.expired(60_000).map((x) => x.key)).toEqual(['a']);
    expect(t.expired(61_000)).toEqual([]);
    t.sync([r('b')], 61_000);
    expect(t.info(61_000).map((w) => w.key)).toEqual(['b']);
    t.sync([], 62_000);
    expect(t.expired(200_000)).toEqual([]);
  });

  it('bota devredilen oyuncunun sorusu listeden çıkar: iki sistem çakışmaz', () => {
    let s = duel();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) }, [2, 6]);
    const t = new ResponseTracker(60_000);
    t.sync(pendingResponses(s, { isHuman: () => true }), 0);
    // Koltuk bota geçti: bekleyen kalmaz, süre dolunca ikinci kez karar verilmez
    s.players[1].kind = 'bot';
    t.sync(pendingResponses(s, { isHuman: (p) => s.players[p].kind === 'human' }), 30_000);
    expect(t.info(30_000)).toEqual([]);
    expect(t.expired(120_000)).toEqual([]);
  });
});
