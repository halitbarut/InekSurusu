import type { Action, GameEvent, GameState } from '../engine';
import { ChatIdentity, cleanChatText, type ChatBox, type ChatMessage } from './chat';
import { privateProblemFor, type ChatChannel } from './hostRoom';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  type ClientMessage,
  type HostMessage,
  type LobbyInfo,
  type Presence,
} from './protocol';
import type { ClientTransport, Conn } from './transport';

export type ClientStatus = 'connecting' | 'online' | 'reconnecting' | 'closed';

export interface ClientRoomEvents {
  onLobby?(lobby: LobbyInfo, seat: number | null): void;
  /** Oyun başladı ya da yeniden bağlanınca güncel oyun durumu geldi */
  onGameState?(state: GameState, seat: number | null, presence: Presence): void;
  onUpdate?(state: GameState, events: GameEvent[]): void;
  onPresence?(presence: Presence): void;
  onNotice?(text: string): void;
  onStatus?(status: ClientStatus, reason?: string): void;
  /** Yeni sohbet mesajı; null = geçmiş ya da anahtarlar yenilendi */
  onChat?(msg: ChatMessage | null): void;
}

export interface ClientProfile {
  clientId: string;
  name: string;
  color: string;
}

const RETRY_MS = 3000;

/** Katılımcı tarafı: oda sahibine bağlanır, kopunca kendiliğinden yeniden bağlanır. */
export class ClientRoom implements ChatChannel {
  readonly events: ClientRoomEvents = {};
  status: ClientStatus = 'connecting';
  seat: number | null = null;
  /** Oda sahibinin son gönderdiği durum ve bağlantı bilgisi (sohbet kuralları için) */
  private lastState: GameState | null = null;
  private presence: Presence = {};
  private chatLog: ChatMessage[] = [];
  private keys: Record<number, string> = {};
  private identity: ChatIdentity | null = null;
  private spectatorChat = true;
  private conn: Conn<HostMessage, ClientMessage> | null = null;
  private nextReq = 1;
  private pending = new Map<number, (r: { ok: true } | { ok: false; reason: string }) => void>();
  private lastSeen = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private left = false;

  constructor(
    readonly code: string,
    private transport: ClientTransport<HostMessage, ClientMessage>,
    private profile: ClientProfile,
  ) {}

  /** İlk bağlantı; başarısız olursa hata fırlatır (yeniden deneme yapılmaz). */
  async connect(): Promise<void> {
    try {
      this.identity = await ChatIdentity.create(`inek-surusu-chatkey-${this.code}-${this.profile.clientId}`);
    } catch {
      // Güvenli bağlam yok (ör. yerel ağda http): özel mesaj kapalı, genel kanal çalışır
    }
    await this.open();
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
  }

  claim(seat: number | null) {
    this.conn?.send({ t: 'claim', seat });
  }

  setProfile(name: string, color: string) {
    this.profile.name = name;
    this.profile.color = color;
    this.conn?.send({ t: 'profile', name, color });
  }

  /** Sıradaki oyuncunun geri alabileceği eylem sayısı (oda sahibinin son bildirdiği) */
  undoCount = 0;

  /** Son eylemi geri almasını oda sahibinden ister. */
  sendUndo(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!this.conn || this.status !== 'online') return Promise.resolve({ ok: false, reason: 'Oda sahibiyle bağlantı yok' });
    const reqId = this.nextReq++;
    return new Promise((resolve) => {
      this.pending.set(reqId, resolve);
      this.conn!.send({ t: 'undo', reqId });
    });
  }

  /** Hamleyi oda sahibine gönderir; uygulanınca ya da reddedilince çözülür. */
  sendAction(action: Action): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!this.conn || this.status !== 'online') return Promise.resolve({ ok: false, reason: 'Oda sahibiyle bağlantı yok' });
    const reqId = this.nextReq++;
    return new Promise((resolve) => {
      this.pending.set(reqId, resolve);
      this.conn!.send({ t: 'action', reqId, action });
    });
  }

  leave() {
    this.left = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.conn?.close();
    this.transport.close();
    this.setStatus('closed');
  }

  // ------------------------------------------------------------------

  private async open() {
    const conn = await this.transport.connect();
    this.conn = conn;
    this.lastSeen = Date.now();
    conn.onMessage((m) => {
      if (this.conn !== conn) return;
      this.lastSeen = Date.now();
      // Arayüzdeki bir hata bağlantıyı koparmasın
      try {
        this.handle(m);
      } catch (e) {
        console.error('Oda mesajı işlenemedi', m.t, e);
      }
    });
    conn.onClose(() => {
      if (this.conn === conn) this.lost();
    });
    conn.send({ t: 'hello', version: PROTOCOL_VERSION, ...this.profile });
  }

  private handle(m: HostMessage) {
    switch (m.t) {
      case 'ping':
        return;
      case 'welcome':
        this.seat = m.seat;
        this.setStatus('online');
        if (m.state) {
          this.gameStarted(m.state, m.presence, m.chat);
          this.events.onGameState?.(m.state, m.seat, m.presence);
        } else if (m.lobby) this.events.onLobby?.(m.lobby, m.seat);
        return;
      case 'refused':
        this.left = true;
        this.setStatus('closed', m.reason);
        this.conn?.close();
        return;
      case 'lobby':
        this.seat = m.seat;
        this.events.onLobby?.(m.lobby, m.seat);
        return;
      case 'start':
        this.seat = m.seat;
        this.gameStarted(m.state, m.presence, m.chat);
        this.events.onGameState?.(m.state, m.seat, m.presence);
        return;
      case 'update': {
        this.lastState = m.state;
        this.undoCount = m.undo ?? 0;
        this.events.onUpdate?.(m.state, m.events);
        if (m.reqId !== undefined) this.resolve(m.reqId, { ok: true });
        return;
      }
      case 'reject':
        this.resolve(m.reqId, { ok: false, reason: m.reason });
        return;
      case 'presence':
        this.presence = m.presence;
        this.events.onPresence?.(m.presence);
        return;
      case 'chat':
        this.chatLog.push(m.msg);
        this.events.onChat?.(m.msg);
        return;
      case 'keys':
        this.keys = m.keys;
        this.events.onChat?.(null);
        return;
      case 'notice':
        this.events.onNotice?.(m.text);
        return;
      case 'closed':
        this.left = true;
        this.setStatus('closed', m.reason);
        return;
    }
  }

  private gameStarted(state: GameState, presence: Presence, chat: { log: ChatMessage[]; keys: Record<number, string> } | undefined) {
    this.lastState = state;
    this.presence = presence;
    if (chat) {
      this.chatLog = chat.log;
      this.keys = chat.keys;
      this.events.onChat?.(null);
    }
    // Oyuncuysa özel mesajlar için açık anahtarını bildir (her bağlanışta)
    if (this.seat !== null && this.identity) this.conn?.send({ t: 'key', pub: this.identity.pub });
  }

  // ChatChannel

  chatSeat(): number | null {
    return this.seat;
  }

  chatMessages(): ChatMessage[] {
    return this.chatLog;
  }

  privateProblem(seat: number): string | null {
    return privateProblemFor(this.lastState, this.presence, this.seat, seat, this.keys, this.identity !== null);
  }

  async sendChat(to: number | null, text: string): Promise<string | null> {
    if (!this.conn || this.status !== 'online') return 'Oda sahibiyle bağlantı yok';
    const clean = cleanChatText(text);
    if (!clean) return 'Mesaj boş';
    if (to === null) {
      this.conn.send({ t: 'chat', msg: { to: null, text: clean } });
      return null;
    }
    const prob = this.privateProblem(to);
    if (prob) return prob;
    const box = await this.identity!.seal(clean, this.keys[to]);
    this.conn?.send({ t: 'chat', msg: { to, box } });
    return null;
  }

  openBox(box: ChatBox): Promise<string | null> {
    return this.identity ? this.identity.open(box) : Promise.resolve(null);
  }

  spectatorChatOpen(): boolean {
    return this.spectatorChat;
  }

  private resolve(reqId: number, r: { ok: true } | { ok: false; reason: string }) {
    const p = this.pending.get(reqId);
    this.pending.delete(reqId);
    p?.(r);
  }

  private tick() {
    if (this.left) return;
    if (this.conn && this.status === 'online') {
      if (Date.now() - this.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        const c = this.conn;
        this.lost();
        c.close();
      } else this.conn.send({ t: 'ping' });
    }
  }

  private lost() {
    this.conn = null;
    for (const p of this.pending.values()) p({ ok: false, reason: 'Bağlantı koptu' });
    this.pending.clear();
    if (this.left) return;
    this.setStatus('reconnecting');
    void this.retry();
  }

  private async retry() {
    while (!this.left && !this.conn) {
      await new Promise((r) => setTimeout(r, RETRY_MS));
      if (this.left) return;
      try {
        await this.open();
        return;
      } catch {
        // yeniden dene
      }
    }
  }

  private setStatus(s: ClientStatus, reason?: string) {
    this.status = s;
    this.events.onStatus?.(s, reason);
  }
}
