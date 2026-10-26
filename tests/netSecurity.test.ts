import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, parseAction, validateAction, type Action, type GameEvent, type GameState } from '../src/engine';
import { ClientRoom } from '../src/net/clientRoom';
import { HostRoom } from '../src/net/hostRoom';
import { CLAIMED_MASK, eventsFor, viewFor, type LobbyInfo } from '../src/net/protocol';
import { memoryNetwork } from './netHelpers';
import { own, setCapital, testState } from './helpers';

const FIELD = ['########', '########', '########', '########', '########', '########'];

/** 4 oyunculu, eylem aşamasında, 0 → 1 teklifi yapılmış durum */
function withOffer(): { state: GameState; events: GameEvent[] } {
  const s = testState(FIELD, 4);
  for (let y = 0; y < 6; y++) {
    own(s, 0, [[0, y]]);
    own(s, 1, [[2, y]]);
    own(s, 2, [[4, y]]);
    own(s, 3, [[6, y]]);
  }
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 2, 0);
  setCapital(s, 2, 4, 0);
  setCapital(s, 3, 6, 0);
  s.players[0].resources.akce = 500;
  s.rngState = 987654;
  const r = dispatch(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'resource', giver: 'from', resource: 'akce', amount: 300 }, { kind: 'alliance' }] });
  return { state: r.state, events: r.events };
}

describe('oyuncuya özel görünüm', () => {
  it('teklif yalnızca iki tarafa gider; izleyici ve üçüncü kişi görmez', () => {
    const { state, events } = withOffer();
    expect(state.offers).toHaveLength(1);
    expect(viewFor(state, 0).offers).toHaveLength(1);
    expect(viewFor(state, 1).offers).toHaveLength(1);
    expect(viewFor(state, 2).offers).toHaveLength(0);
    expect(viewFor(state, null).offers).toHaveLength(0);
    // Günlükte de teklif satırı yalnızca taraflarda
    const offerLines = (s: GameState) => s.log.filter((l) => l.event.type === 'offer_made').length;
    expect(offerLines(viewFor(state, 1))).toBe(1);
    expect(offerLines(viewFor(state, 2))).toBe(0);
    expect(offerLines(viewFor(state, null))).toBe(0);
    expect(eventsFor(events, 3)).toEqual([]);
    expect(eventsFor(events, 0)).toHaveLength(1);
    // Kimseye RNG durumu gitmez
    for (const v of [0, 1, 2, null]) expect(viewFor(state, v).rngState).toBe(0);
    // Asıl durum değişmez
    expect(state.offers).toHaveLength(1);
    expect(state.rngState).not.toBe(0);
  });

  it('teklifin yanıtı da gizlidir, ama sonucu (ittifak, kaynak devri) herkesin durumunda görünür', () => {
    const { state } = withOffer();
    const r = dispatch(state, { type: 'RESPOND_OFFER', player: 1, offerId: state.offers[0].id, accept: true });
    const third = eventsFor(r.events, 2).map((e) => e.type);
    expect(third).not.toContain('offer_response');
    expect(third).toContain('alliance_formed');
    expect(viewFor(r.state, 2).players[1].resources.akce).toBe(r.state.players[1].resources.akce);
  });
});

describe('oda sahibi hakemdir', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function setup() {
    const net = memoryNetwork();
    const room = new HostRoom('ABCDE', net.host);
    room.setLobby(
      [
        { name: 'Ayşe', color: '#dd0000', kind: 'host' },
        { name: 'Davetli', color: '#0000dd', kind: 'remote' },
        { name: 'Davetli', color: '#00aa00', kind: 'remote' },
        { name: 'Bot', color: '#aaaa00', kind: 'bot' },
      ],
      { width: 8, height: 6, seed: '1' },
    );
    const a = new ClientRoom('ABCDE', net.clientTransport(), { clientId: 'client-a-123', name: 'Mehmet', color: '#0000ff' });
    const b = new ClientRoom('ABCDE', net.clientTransport(), { clientId: 'client-b-456', name: 'Zeynep', color: '#00ff00' });
    await a.connect();
    await b.connect();
    return { net, room, a, b };
  }

  it('lobide katılanlar birbirinin kimliğini görmez; kimlik çalınamaz', async () => {
    const { net, room, a, b } = await setup();
    let seen: LobbyInfo | null = null;
    b.events.onLobby = (l) => (seen = l);
    a.claim(1);
    expect(room.lobby().seats[1].claimedBy).toBe('client-a-123');
    expect(seen!.seats[1].claimedBy).toBe(CLAIMED_MASK);
    expect(JSON.stringify(seen)).not.toContain('client-a-123');
    // Maskeyle bağlanmaya çalışan reddedilir
    const thief = new ClientRoom('ABCDE', net.clientTransport(), { clientId: CLAIMED_MASK, name: 'Hırsız', color: '#000000' });
    let refused = '';
    thief.events.onStatus = (s, reason) => s === 'closed' && (refused = reason ?? '');
    await thief.connect();
    expect(refused).toContain('kimliği');
    expect(room.lobby().seats[1].claimedBy).toBe('client-a-123');
  });

  it('ad ve renk temizlenir', async () => {
    const { room, a } = await setup();
    a.setProfile('  <b>Uzuuuuuuuuuuuuuuuuun ad\u0007', 'red;background:url(x)');
    a.claim(1);
    const seat = room.lobby().seats[1];
    expect(seat.name.length).toBeLessThanOrEqual(16);
    expect(seat.name).not.toContain('\u0007');
    expect(seat.color).toBe('#777777');
  });

  it('bozuk biçimli ya da başkası adına eylemler oda sahibine ulaşmaz', async () => {
    const { room, a } = await setup();
    a.claim(1);
    const state = withOffer().state;
    room.startGame(state, () => state);
    const received: Action[] = [];
    room.events.onAction = (_seat, action, origin) => {
      received.push(action);
      room.broadcastUpdate(state, [], origin);
    };
    const send = (raw: unknown) => a.sendAction(raw as Action);
    expect(await send({ type: 'HİLE', player: 1 })).toEqual({ ok: false, reason: 'Geçersiz eylem biçimi' });
    expect(await send({ type: 'EXCHANGE_GOLD', player: 1, amount: '5' })).toEqual({ ok: false, reason: 'Geçersiz eylem biçimi' });
    expect(await send({ type: 'CLAIM_TILE', player: 1, tile: 2.5 })).toEqual({ ok: false, reason: 'Geçersiz eylem biçimi' });
    expect(await send({ type: 'RESPOND_OFFER', player: 1, offerId: 1, accept: 'evet' })).toEqual({ ok: false, reason: 'Geçersiz eylem biçimi' });
    expect(await send(null)).toEqual({ ok: false, reason: 'Geçersiz eylem biçimi' });
    expect(await send({ type: 'END_TURN', player: 0 })).toEqual({ ok: false, reason: 'Yalnızca kendi devletin adına oynayabilirsin' });
    expect(received).toEqual([]);
    // Fazladan alanlar (ör. sahte sonuç) eyleme taşınmaz
    expect(await send({ type: 'SPIN', player: 1, value: 8, rngState: 1 })).toEqual({ ok: true });
    expect(received).toEqual([{ type: 'SPIN', player: 1 }]);
  });

  it('katılanın kendi durumunu değiştirmesi oda sahibinin kararını etkilemez', async () => {
    const { room, a } = await setup();
    a.claim(1);
    let host = withOffer().state;
    // Sıra 1. koltukta, eylem aşamasında
    host = { ...host, currentPlayer: 1, phase: { kind: 'actions' } };
    room.startGame(host, () => host);
    let clientView: GameState | null = null;
    a.events.onGameState = (s) => (clientView = s);
    // Oda sahibi GameScreen.commit gibi davranır: kendi durumuna göre doğrular, sonra uygular
    room.events.onAction = (_seat, action, origin) => {
      const v = validateAction(host, action);
      if (!v.ok) return room.reject(origin, v.reason);
      const r = dispatch(host, action);
      host = r.state;
      room.broadcastUpdate(host, r.events, origin);
    };
    // Katılan kendi tarayıcısında akçesini artırıp 6 toprak almaya çalışır
    const local = structuredClone(clientView ?? host);
    local.players[1].resources.akce = 99999;
    const before = host.players[1].resources.akce;
    expect(before).toBe(0);
    const r = await a.sendAction({ type: 'CLAIM_TILE', player: 1, tile: 3 });
    expect(r).toEqual({ ok: false, reason: '100 akçe gerekli' });
    expect(host.owner[3]).toBeNull();
  });
});

describe('eylem biçim denetimi', () => {
  it('geçerli eylemleri olduğu gibi kurar, fazlalıkları atar', () => {
    const a = parseAction({ type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'tile', giver: 'to', tile: 4, x: 1 }, { kind: 'peace', rounds: 3 }], __proto__: { evil: 1 } });
    expect(a).toEqual({ type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'tile', giver: 'to', tile: 4 }, { kind: 'peace', rounds: 3 }] });
    expect(parseAction({ type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'resource', giver: 'from', resource: 'elmas', amount: 1 }] })).toBeNull();
    expect(parseAction({ type: 'SET_STRAIT_POLICY', player: 0, straitId: 0, target: 1, allow: 1, toll: 0 })).toBeNull();
    expect(parseAction({ type: 'BUILD', player: 0, tile: 1, structure: 'capital' })).toBeNull();
    expect(parseAction([])).toBeNull();
  });
});
