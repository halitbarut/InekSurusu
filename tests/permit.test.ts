import { describe, expect, it } from 'vitest';
import { MediumBot } from '../src/bot';
import { DEFAULT_STRAIT_POLICY, expeditionTargets, parseAction, shipRoutes, straitPolicyOf, validateAction, type Action, type GameState } from '../src/engine';
import { viewFor, eventsFor } from '../src/net/protocol';
import { act, at, setCapital, testState } from './helpers';

const ROWS = [
  '##############',
  '#....####....#',
  '#....####....#',
  '#............#',
  '#....####....#',
  '#....####....#',
  '##############',
];

/** P0'ın gemisi batıda; boğazın karşılıklı çiftleri: çift 0 P1'de, istenirse çift 1 P2'de */
function world(two = false): GameState {
  const s = testState(ROWS, 3);
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 13, 0);
  setCapital(s, 2, 13, 6);
  s.owner[at(s, 0, 3)] = 0;
  s.structure[at(s, 0, 3)] = 'shipyard';
  s.units.push({ id: 1, kind: 'ship', owner: 0, tile: at(s, 0, 3), sortiesThisTurn: 0 });
  s.players[0].resources = { akce: 1000, gold: 1, oil: 5, iron: 0, steel: 0 };
  s.owner[at(s, 5, 2)] = 1;
  s.owner[at(s, 5, 4)] = 1;
  if (two) {
    s.owner[at(s, 6, 2)] = 2;
    s.owner[at(s, 6, 4)] = 2;
  }
  return act(s, { type: 'EXCHANGE_GOLD', player: 0, amount: 1 });
}

const sail = (s: GameState): Action => ({ type: 'SHIP_EXPEDITION', player: 0, unitId: 1, target: at(s, 11, 0) });

describe('boğaz izni', () => {
  it('yeni söz sahibinde herkes için başlangıç durumu Sor', () => {
    const s = world();
    expect(DEFAULT_STRAIT_POLICY.mode).toBe('ask');
    expect(s.straits[0].controllers).toEqual([1]);
    expect(straitPolicyOf(s, 0, 1, 0).mode).toBe('ask');
  });

  it('rota önizlemesi sorulacak boğazları gösterir', () => {
    const s = world();
    const route = shipRoutes(s, 0, at(s, 0, 3)).routeTo(at(s, 11, 0))!;
    expect(route.asks).toEqual([{ straitId: 0, controller: 1 }]);
    expect(route.tolls).toEqual([]);
    expect(expeditionTargets(s, 0, 1).get(at(s, 11, 0))!.route.asks).toHaveLength(1);
  });

  it('sefer söz sahibine sorulur; bu arada hiçbir şey ödenmez ve başka eylem yapılamaz', () => {
    const before = world();
    const s = act(before, sail(before));
    expect(s.phase).toMatchObject({ kind: 'permit', player: 0, target: at(s, 11, 0), stage: 'answers' });
    expect(s.players[0].resources).toEqual(before.players[0].resources);
    expect(s.units[0].sortiesThisTurn).toBe(0);
    expect(validateAction(s, { type: 'END_TURN', player: 0 }).ok).toBe(false);
    expect(validateAction(s, { type: 'RESPOND_PERMIT', player: 2, straitId: 0, decision: 'once', toll: 0 }).ok).toBe(false);
  });

  it('bu seferlik vergisiz izin: sefer yapılır, ayar Sor olarak kalır', () => {
    let s = world();
    s = act(s, sail(s));
    s = act(s, { type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'once', toll: 0 });
    expect(s.phase.kind).toBe('actions');
    expect(s.owner[at(s, 11, 0)]).toBe(0);
    expect(s.players[0].resources.oil).toBe(4);
    expect(straitPolicyOf(s, 0, 1, 0).mode).toBe('ask');
  });

  it('bu seferlik vergili izin: sıra sahibi onaylarsa öder, vazgeçerse hiçbir şey ödemez', () => {
    let s = world();
    const akce = s.players[0].resources.akce;
    s = act(s, sail(s));
    s = act(s, { type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'once', toll: 150 });
    expect(s.phase).toMatchObject({ kind: 'permit', stage: 'confirm' });
    const no = act(s, { type: 'CONFIRM_PERMIT', player: 0, accept: false });
    expect(no.phase.kind).toBe('actions');
    expect(no.players[0].resources.akce).toBe(akce);
    expect(no.players[0].resources.oil).toBe(5);
    const yes = act(s, { type: 'CONFIRM_PERMIT', player: 0, accept: true });
    expect(yes.players[0].resources.akce).toBe(akce - 150 - s.config.expeditionClaimCost);
    expect(yes.players[1].resources.akce).toBe(150);
    expect(yes.owner[at(s, 11, 0)]).toBe(0);
  });

  it('kalıcı ayar: Açık sonraki seferlerde sormaz, Vergili vergiyi öder, Kapalı reddeder', () => {
    let s = world();
    s = act(s, sail(s));
    s = act(s, { type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'open', toll: 0 });
    expect(straitPolicyOf(s, 0, 1, 0).mode).toBe('open');
    expect(shipRoutes(s, 0, at(s, 0, 3)).routeTo(at(s, 10, 0))!.asks).toEqual([]);

    let t = world();
    t = act(t, sail(t));
    t = act(t, { type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'toll', toll: 80 });
    expect(straitPolicyOf(t, 0, 1, 0)).toEqual({ mode: 'toll', toll: 80 });
    t = act(t, { type: 'CONFIRM_PERMIT', player: 0, accept: true });
    expect(t.players[1].resources.akce).toBe(80);

    let c = world();
    c = act(c, sail(c));
    c = act(c, { type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'closed', toll: 0 });
    expect(straitPolicyOf(c, 0, 1, 0).mode).toBe('closed');
    expect(c.phase.kind).toBe('actions');
    expect(c.owner[at(c, 11, 0)]).toBeNull();
  });

  it('birden çok söz sahibine sorulur; biri bile reddederse sefer yapılmaz, ödeme ve yakıt yok', () => {
    const start = world(true);
    let s = act(start, sail(start));
    expect(s.phase.kind === 'permit' && s.phase.requests.map((r) => r.controller)).toEqual([1, 2]);
    s = act(s, { type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'once', toll: 100 });
    expect(s.phase).toMatchObject({ kind: 'permit', stage: 'answers' });
    s = act(s, { type: 'RESPOND_PERMIT', player: 2, straitId: 0, decision: 'deny', toll: 0 });
    expect(s.phase.kind).toBe('actions');
    expect(s.players[0].resources).toEqual(start.players[0].resources);
    expect(s.players[1].resources.akce).toBe(0);
    expect(s.owner[at(s, 11, 0)]).toBeNull();
  });

  it('reddedilen izin aynı tur yeniden sorulamaz, sonraki tur sorulabilir', () => {
    let s = world();
    s = act(s, sail(s));
    s = act(s, { type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'deny', toll: 0 });
    expect(validateAction(s, sail(s)).ok).toBe(false);
    const later = structuredClone(s);
    later.turnCounter += 3;
    expect(validateAction(later, sail(later)).ok).toBe(true);
  });

  it('vergiye akçe yetmezse sefer yapılmaz, hiçbir şey ödenmez', () => {
    let s = world();
    s = act(s, sail(s));
    s = act(s, { type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'once', toll: 999_999 });
    s = act(s, { type: 'CONFIRM_PERMIT', player: 0, accept: true });
    expect(s.phase.kind).toBe('actions');
    expect(s.players[1].resources.akce).toBe(0);
    expect(s.log.some((l) => l.event.type === 'permit_result' && l.event.reason === 'funds')).toBe(true);
  });

  it('izin alınan sefer savaşa dönüşebilir: sonuç RNG ile belirlenir', () => {
    let s = world();
    s.owner[at(s, 11, 0)] = 2;
    s = act(s, sail(s));
    s = act(s, { type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'once', toll: 0 }, [6, 2]);
    expect(s.phase).toMatchObject({ kind: 'conquest', taker: 0, remaining: 4 });
  });

  it('bot kendi çıkarına karar verir: müttefike açık, düşmana kapalı, diğerine vergi', () => {
    const bot = new MediumBot();
    let s = world();
    s = act(s, sail(s));
    const neutral = bot.chooseAction(s, 1);
    expect(neutral).toMatchObject({ type: 'RESPOND_PERMIT', decision: 'toll' });

    const ally = structuredClone(s);
    ally.relations['0-1'] = { allied: true, peaceUntilRound: null, allianceBrokenAtTurn: null };
    expect(bot.chooseAction(ally, 1)).toMatchObject({ type: 'RESPOND_PERMIT', decision: 'open' });

    const enemy = structuredClone(s);
    enemy.log.push({ turn: enemy.turnCounter, round: enemy.round, event: { type: 'battle', attacker: 0, defender: 1, kind: 'land', via: 'land', target: 0, rounds: [], success: false, gain: 0, loss: 0, streakNeeded: 1, cost: { akce: 0, iron: 0, steel: 0 } } });
    expect(bot.chooseAction(enemy, 1)).toMatchObject({ type: 'RESPOND_PERMIT', decision: 'closed' });
  });

  it('çevrimiçi görünüm: hedef ve rota yalnızca taraflarda, olaylar başkasına gitmez', () => {
    const start = world();
    const r = act(start, sail(start));
    const third = viewFor(r, 2);
    expect(third.phase).toMatchObject({ kind: 'permit', target: -1, path: [] });
    expect(viewFor(r, 1).phase).toMatchObject({ target: at(r, 11, 0) });
    expect(viewFor(r, null).phase).toMatchObject({ target: -1 });
    const ev = r.log.filter((l) => l.event.type === 'permit_requested').map((l) => l.event);
    expect(eventsFor(ev, 2)).toEqual([]);
    expect(eventsFor(ev, 1)).toHaveLength(1);
    expect(third.log.some((l) => l.event.type === 'permit_requested')).toBe(false);
  });

  it('eylem biçimi denetimi', () => {
    expect(parseAction({ type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'once', toll: 5, extra: 1 })).toEqual({ type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'once', toll: 5 });
    expect(parseAction({ type: 'RESPOND_PERMIT', player: 1, straitId: 0, decision: 'evet', toll: 5 })).toBeNull();
    expect(parseAction({ type: 'CONFIRM_PERMIT', player: 1, accept: 'evet' })).toBeNull();
  });
});
