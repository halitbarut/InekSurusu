import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGame, type GameState } from '../src/engine';
import type { ChatMessage } from '../src/net/chat';
import { ClientRoom } from '../src/net/clientRoom';
import { HostRoom } from '../src/net/hostRoom';
import { memoryNetwork } from './netHelpers';

const flush = () => new Promise((r) => setTimeout(r, 30));

// Yeniden bağlanınca anahtarın korunduğunu sınamak için basit localStorage
beforeAll(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const rooms: HostRoom[] = [];
afterEach(() => {
  for (const r of rooms.splice(0)) r.close();
});

async function setup() {
  const net = memoryNetwork();
  const room = new HostRoom('CHAT1', net.host);
  rooms.push(room);
  room.setLobby(
    [
      { name: 'Ayşe', color: '#dd0000', kind: 'host' },
      { name: 'Davetli', color: '#0000dd', kind: 'remote' },
      { name: 'Davetli', color: '#00aa00', kind: 'remote' },
      { name: 'Bot', color: '#aaaa00', kind: 'bot', botLevel: 'medium' },
    ],
    { width: 40, height: 30, seed: '7' },
  );
  const join = async (id: string, name: string, seat: number | null) => {
    const c = new ClientRoom('CHAT1', net.clientTransport(), { clientId: id, name, color: '#123456' });
    await c.connect();
    if (seat !== null) c.claim(seat);
    return c;
  };
  const a = await join('client-a-0001', 'Mehmet', 1);
  const b = await join('client-b-0002', 'Zeynep', 2);
  const v = await join('client-v-0003', 'İzleyen', null);
  const lobby = room.lobby();
  const state: GameState = createGame({
    players: lobby.seats.map((s) => ({ name: s.name, color: s.color, kind: s.kind === 'bot' ? ('bot' as const) : ('human' as const) })),
    width: 40,
    height: 30,
    seed: 7,
  });
  room.startGame(state, () => state, 0);
  await flush();
  return { net, room, a, b, v, state, join };
}

const texts = (list: ChatMessage[]) => list.filter((m) => m.text).map((m) => m.text);

describe('sohbet', () => {
  it('genel kanal herkese gider; izleyicinin mesajı işaretlenir', async () => {
    const { room, a, b, v } = await setup();
    const hostSeen: ChatMessage[] = [];
    room.events.onChat = (m) => m && hostSeen.push(m);
    expect(await a.sendChat(null, 'Merhaba herkese')).toBeNull();
    expect(await v.sendChat(null, 'Ben izliyorum')).toBeNull();
    expect(await room.sendChat(null, 'Hoş geldiniz')).toBeNull();
    await flush();
    for (const list of [a.chatMessages(), b.chatMessages(), v.chatMessages(), room.chatMessages()]) {
      expect(texts(list)).toEqual(['Merhaba herkese', 'Ben izliyorum', 'Hoş geldiniz']);
    }
    const spectatorMsg = b.chatMessages().find((m) => m.text === 'Ben izliyorum')!;
    expect(spectatorMsg).toMatchObject({ seat: null, spectator: true, name: 'İzleyen' });
    expect(b.chatMessages()[0]).toMatchObject({ seat: 1, spectator: false, name: 'Mehmet' });
    expect(hostSeen).toHaveLength(3);
  });

  it('özel mesajı yalnızca iki taraf okur; oda sahibi yalnızca şifreli hâlini aktarır', async () => {
    const { room, a, b, v } = await setup();
    const secret = 'Gizli plan: kuzeyden saldır';
    expect(await a.sendChat(2, secret)).toBeNull();
    await flush();
    const atB = b.chatMessages().find((m) => m.to === 2)!;
    expect(atB.text).toBeUndefined();
    expect(await b.openBox(atB.box!)).toBe(secret);
    // Gönderen de kendi mesajını okuyabilir
    expect(await a.openBox(a.chatMessages().find((m) => m.to === 2)!.box!)).toBe(secret);
    // İzleyiciye hiç gitmez, oda sahibinin kendi listesinde de yok
    expect(v.chatMessages().some((m) => m.to !== null)).toBe(false);
    expect(room.chatMessages().some((m) => m.to !== null)).toBe(false);
    // Oda sahibinin belleğinde düz metin yok, kendi anahtarıyla da çözemez
    const internal = JSON.stringify((room as unknown as { chatLog: unknown }).chatLog);
    expect(internal).not.toContain('Gizli');
    expect(await room.openBox(atB.box!)).toBeNull();
  });

  it('oda sahibiyle katılan arasında özel mesaj iki yönde çalışır', async () => {
    const { room, a } = await setup();
    expect(await room.sendChat(1, 'Ayşe → Mehmet')).toBeNull();
    expect(await a.sendChat(0, 'Mehmet → Ayşe')).toBeNull();
    await flush();
    const atA = a.chatMessages().filter((m) => m.box);
    expect(await Promise.all(atA.map((m) => a.openBox(m.box!)))).toEqual(['Ayşe → Mehmet', 'Mehmet → Ayşe']);
    const atHost = room.chatMessages().filter((m) => m.box);
    expect(await Promise.all(atHost.map((m) => room.openBox(m.box!)))).toEqual(['Ayşe → Mehmet', 'Mehmet → Ayşe']);
  });

  it('izleyici özel mesaj gönderemez, bota özel mesaj gönderilemez', async () => {
    const { a, v } = await setup();
    expect(await v.sendChat(1, 'selam')).toBe('İzleyiciler özel mesaj gönderemez');
    expect(await a.sendChat(3, 'selam bot')).toBe('Botlarla mesajlaşılmaz');
    expect(await a.sendChat(null, '   ')).toBe('Mesaj boş');
  });

  it('yeniden bağlanan oyuncu sohbet geçmişini (özel mesajlar dahil) geri alır ve okuyabilir', async () => {
    const { a, b, join } = await setup();
    await a.sendChat(null, 'genel 1');
    await b.sendChat(1, 'Zeynep → Mehmet');
    await flush();
    a.leave();
    await flush();
    const back = await join('client-a-0001', 'Mehmet', null);
    await flush();
    expect(back.chatSeat()).toBe(1);
    expect(texts(back.chatMessages())).toEqual(['genel 1']);
    const dm = back.chatMessages().find((m) => m.box)!;
    expect(await back.openBox(dm.box!)).toBe('Zeynep → Mehmet');
  });

  it('çok hızlı yazan katılımcı yavaşlatılır', async () => {
    const { a, b } = await setup();
    for (let i = 0; i < 10; i++) await a.sendChat(null, `m${i}`);
    await flush();
    expect(texts(b.chatMessages()).length).toBe(6);
  });
});
