import { afterEach, describe, expect, it } from 'vitest';
import { createGame, type GameState } from '../src/engine';
import { ClientRoom } from '../src/net/clientRoom';
import { HostRoom } from '../src/net/hostRoom';
import type { ViewerInfo } from '../src/net/protocol';
import { memoryNetwork } from './netHelpers';

const flush = () => new Promise((r) => setTimeout(r, 30));
const rooms: HostRoom[] = [];
afterEach(() => {
  for (const r of rooms.splice(0)) r.close();
});

async function setup() {
  const net = memoryNetwork();
  const room = new HostRoom('WATCH', net.host);
  rooms.push(room);
  room.setLobby(
    [
      { name: 'Ayşe', color: '#dd0000', kind: 'host' },
      { name: 'Davetli', color: '#0000dd', kind: 'remote' },
      { name: 'Bot', color: '#aaaa00', kind: 'bot', botLevel: 'medium' },
    ],
    { width: 35, height: 26, seed: '3' },
  );
  const a = new ClientRoom('WATCH', net.clientTransport(), { clientId: 'client-a-0001', name: 'Mehmet', color: '#123456' });
  await a.connect();
  a.claim(1);
  const v = new ClientRoom('WATCH', net.clientTransport(), { clientId: 'client-v-0002', name: 'İzleyen', color: '#654321' });
  await v.connect();
  let state: GameState = createGame({
    players: [
      { name: 'Ayşe', color: '#dd0000', kind: 'human' },
      { name: 'Mehmet', color: '#123456', kind: 'human' },
      { name: 'Bot', color: '#aaaa00', kind: 'bot' },
    ],
    width: 35,
    height: 26,
    seed: 3,
  });
  room.startGame(state, () => state, 0);
  await flush();
  return { net, room, a, v, set: (s: GameState) => (state = s), get: () => state };
}

describe('izleyiciler', () => {
  it('izleyici listesi herkese gider; elenen oyuncu listeye izleyici olarak girer', async () => {
    const { room, a, v, set, get } = await setup();
    expect(v.viewers).toEqual([{ name: 'İzleyen', seat: null }]);
    expect(a.viewers).toEqual([{ name: 'İzleyen', seat: null }]);
    // Mehmet elenir
    const s = structuredClone(get());
    s.players[1].alive = false;
    set(s);
    room.broadcastUpdate(s, []);
    let seen: ViewerInfo[] = [];
    room.events.onViewers = (l) => (seen = l);
    room.refreshViewers();
    expect(seen).toEqual([
      { name: 'Mehmet', seat: 1 },
      { name: 'İzleyen', seat: null },
    ]);
    expect(a.viewers).toEqual(seen);
    // Elenen oyuncu bağlı kalır, genel sohbete izleyici olarak yazar
    expect(await a.sendChat(null, 'İzliyorum artık')).toBeNull();
    await flush();
    expect(v.chatMessages().at(-1)).toMatchObject({ name: 'Mehmet', seat: 1, spectator: true });
    // Özel mesaj başlatamaz
    expect(await a.sendChat(0, 'gizli')).toBe('İzleyiciler özel mesaj gönderemez');
  });

  it('oda sahibi izleyici sohbetini kapatınca izleyiciler (elenenler dahil) yazamaz, oyuncular yazar', async () => {
    const { room, a, v } = await setup();
    room.setSpectatorChat(false);
    await flush();
    expect(v.spectatorChatOpen()).toBe(false);
    const notices: string[] = [];
    v.events.onNotice = (t) => notices.push(t);
    await v.sendChat(null, 'izleyiciden');
    await a.sendChat(null, 'oyuncudan');
    await flush();
    expect(notices).toEqual(['Oda sahibi izleyici sohbetini kapattı.']);
    expect(room.chatMessages().map((m) => m.text)).toEqual(['oyuncudan']);
    room.setSpectatorChat(true);
    await flush();
    await v.sendChat(null, 'yine izleyiciden');
    await flush();
    expect(room.chatMessages().map((m) => m.text)).toEqual(['oyuncudan', 'yine izleyiciden']);
  });

  it('izleyici hamle yapamaz ve gizli teklif görmez', async () => {
    const { room, v } = await setup();
    expect(await v.sendAction({ type: 'END_TURN', player: 0 })).toEqual({ ok: false, reason: 'İzleyiciler hamle yapamaz' });
    expect(room.viewers().map((x) => x.name)).toEqual(['İzleyen']);
  });
});
