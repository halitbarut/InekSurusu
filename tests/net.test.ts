import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, type GameState } from '../src/engine';
import { ClientRoom } from '../src/net/clientRoom';
import { HostRoom } from '../src/net/hostRoom';
import { RECONNECT_GRACE_MS, type LobbyInfo } from '../src/net/protocol';
import { memoryNetwork } from './netHelpers';

function lobbySeats() {
  return [
    { name: 'Ayşe', color: '#d00', kind: 'host' as const },
    { name: 'Davetli', color: '#00d', kind: 'remote' as const },
    { name: 'Davetli', color: '#0a0', kind: 'remote' as const },
    { name: 'Bot', color: '#aa0', kind: 'bot' as const },
  ];
}

function gameFor(lobby: LobbyInfo): GameState {
  return createGame({
    players: lobby.seats.map((s) => ({ name: s.name, color: s.color, kind: s.kind === 'bot' || (s.kind === 'remote' && !s.claimedBy) ? ('bot' as const) : ('human' as const) })),
    width: 40,
    height: 30,
    seed: 7,
  });
}

describe('çevrimiçi oda', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function setup() {
    const net = memoryNetwork();
    const room = new HostRoom('ABCDE', net.host);
    room.setLobby(lobbySeats(), { width: 40, height: 30, seed: '7' });
    const tA = net.clientTransport();
    const tB = net.clientTransport();
    const a = new ClientRoom('ABCDE', tA, { clientId: 'client-idA', name: 'Mehmet', color: '#00f' });
    const b = new ClientRoom('ABCDE', tB, { clientId: 'client-idB', name: 'Zeynep', color: '#0f0' });
    await a.connect();
    await b.connect();
    return { net, room, a, b, tA, tB };
  }

  it('katılanlar boş uzak koltuklara oturur; dolu koltuk alınamaz', async () => {
    const { room, a, b } = await setup();
    let lobbyB: LobbyInfo | null = null;
    b.events.onLobby = (l) => (lobbyB = l);
    a.claim(1);
    b.claim(1);
    expect(room.lobby().seats[1]).toMatchObject({ claimedBy: 'client-idA', name: 'Mehmet' });
    expect(b.seat).toBeNull();
    b.claim(2);
    expect(b.seat).toBe(2);
    expect(lobbyB!.seats[2].name).toBe('Zeynep');
    // Bot ve oda sahibi koltuklarına oturulamaz
    a.claim(3);
    expect(a.seat).toBe(1);
  });

  it('lobide kopan katılımcının koltuğu boşalır', async () => {
    const { room, a, tA } = await setup();
    a.claim(1);
    a.leave();
    tA.drop();
    expect(room.lobby().seats[1].claimedBy).toBeNull();
  });

  it('başlangıçta herkes kendi koltuğunu alır, RNG durumu gizlenir', async () => {
    const { room, a, b } = await setup();
    a.claim(1);
    let got: { state: GameState; seat: number | null } | null = null;
    a.events.onGameState = (state, seat) => (got = { state, seat });
    const state = gameFor(room.lobby());
    room.startGame(state, () => state);
    expect(got!.seat).toBe(1);
    expect(got!.state.rngState).toBe(0);
    expect(state.rngState).not.toBe(0);
    expect(b.seat).toBeNull(); // oturmamış olan izleyici
    expect(room.getPresence()).toEqual({ 1: { status: 'online' } });
  });

  it('hamleler yalnızca kendi koltuğundan kabul edilir; izleyici hamle yapamaz', async () => {
    const { room, a, b } = await setup();
    a.claim(1);
    const state = gameFor(room.lobby());
    room.startGame(state, () => state);
    const received: number[] = [];
    room.events.onAction = (seat, _action, origin) => {
      received.push(seat);
      room.broadcastUpdate(state, [], origin);
    };
    expect(await a.sendAction({ type: 'END_TURN', player: 0 })).toEqual({ ok: false, reason: 'Yalnızca kendi devletin adına oynayabilirsin' });
    expect(await b.sendAction({ type: 'END_TURN', player: 1 })).toEqual({ ok: false, reason: 'İzleyiciler hamle yapamaz' });
    expect(await a.sendAction({ type: 'END_TURN', player: 1 })).toEqual({ ok: true });
    expect(received).toEqual([1]);
  });

  it('kopan oyuncu 1 dakika beklenir, sonra bot devralır; dönünce koltuğunu geri alır', async () => {
    const { net, room, a, tA } = await setup();
    a.claim(1);
    const state = gameFor(room.lobby());
    room.startGame(state, () => state);
    const takeovers: [number, boolean][] = [];
    room.events.onTakeover = (seat, toBot) => takeovers.push([seat, toBot]);
    a.leave();
    tA.drop();
    expect(room.getPresence()[1].status).toBe('away');
    vi.advanceTimersByTime(RECONNECT_GRACE_MS - 1000);
    expect(takeovers).toEqual([]);
    vi.advanceTimersByTime(2000);
    expect(takeovers).toEqual([[1, true]]);
    expect(room.getPresence()[1].status).toBe('bot');
    // Aynı kimlikle geri döner
    const back = new ClientRoom('ABCDE', net.clientTransport(), { clientId: 'client-idA', name: 'Mehmet', color: '#00f' });
    let resumed: number | null | undefined;
    back.events.onGameState = (_s, seat) => (resumed = seat);
    await back.connect();
    expect(resumed).toBe(1);
    expect(takeovers).toEqual([
      [1, true],
      [1, false],
    ]);
    expect(room.getPresence()[1].status).toBe('online');
  });

  it('süre dolmadan dönen oyuncu için bot devralmaz', async () => {
    const { net, room, a, tA } = await setup();
    a.claim(1);
    const state = gameFor(room.lobby());
    room.startGame(state, () => state);
    const takeovers: [number, boolean][] = [];
    room.events.onTakeover = (seat, toBot) => takeovers.push([seat, toBot]);
    a.leave();
    tA.drop();
    vi.advanceTimersByTime(20_000);
    const back = new ClientRoom('ABCDE', net.clientTransport(), { clientId: 'client-idA', name: 'Mehmet', color: '#00f' });
    await back.connect();
    vi.advanceTimersByTime(RECONNECT_GRACE_MS * 2);
    expect(takeovers).toEqual([]);
    expect(room.getPresence()[1].status).toBe('online');
  });

  it('oyun sırasında yeni gelen izleyici olur ve güncel durumu alır', async () => {
    const { net, room, a } = await setup();
    a.claim(1);
    const state = gameFor(room.lobby());
    room.startGame(state, () => state);
    const viewer = new ClientRoom('ABCDE', net.clientTransport(), { clientId: 'client-idV', name: 'Ali', color: '#000' });
    let seen: { seat: number | null; turn: number } | null = null;
    viewer.events.onGameState = (s, seat) => (seen = { seat, turn: s.turnCounter });
    await viewer.connect();
    expect(seen).toEqual({ seat: null, turn: state.turnCounter });
  });
});
