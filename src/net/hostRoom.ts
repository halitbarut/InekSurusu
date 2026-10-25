import type { Action, GameEvent, GameState } from '../engine';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  publicState,
  type ClientMessage,
  type HostMessage,
  type LobbyInfo,
  type LobbySeat,
  type Presence,
} from './protocol';
import type { Conn, HostTransport } from './transport';

interface RemoteClient {
  clientId: string;
  name: string;
  color: string;
  conn: Conn<ClientMessage, HostMessage> | null;
  /** Lobide oturduğu ya da oyunda sahibi olduğu koltuk; null = izleyici */
  seat: number | null;
  lastSeen: number;
}

export interface HostRoomEvents {
  /** Lobi değişti (birisi katıldı, koltuğa oturdu, adını değiştirdi...) */
  onLobbyChange?(lobby: LobbyInfo): void;
  /** Uzaktaki bir oyuncu hamle gönderdi; koltuk sahipliği doğrulanmıştır. */
  onAction?(seat: number, action: Action, origin: { clientId: string; reqId: number }): void;
  /** Katılan kendi son eylemini geri almak istiyor */
  onUndo?(seat: number, origin: { clientId: string; reqId: number }): void;
  /** Kopan oyuncu süresinde dönmedi (toBot=true) ya da bot devraldıktan sonra geri döndü (false). */
  onTakeover?(seat: number, toBot: boolean): void;
  onPresence?(presence: Presence): void;
  onNotice?(text: string): void;
}

/**
 * Oda sahibinin tarafındaki oda yönetimi: katılımcılar, lobi koltukları, oyun sırasında
 * bağlantı durumu ve bot devralma. Oyun durumunu kendisi tutmaz; hamleleri olay olarak
 * dışarı (oyun ekranına) verir, oyun ekranı da sonucu broadcastUpdate ile yayınlar.
 */
type LobbySettings = Pick<LobbyInfo, 'width' | 'height' | 'seed' | 'rules' | 'mapName'>;

export class HostRoom {
  readonly events: HostRoomEvents = {};
  private clients = new Map<string, RemoteClient>();
  private seats: LobbySeat[] = [];
  private settings: LobbySettings = { width: 40, height: 30, seed: '' };
  private inGame = false;
  private presence: Presence = {};
  private takeoverTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private heartbeat: ReturnType<typeof setInterval>;
  private getState: () => GameState | null = () => null;
  private closed = false;

  constructor(
    readonly code: string,
    private transport: HostTransport<ClientMessage, HostMessage>,
  ) {
    transport.onConnection((conn) => this.accept(conn));
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
  }

  // ------------------------------------------------------------------
  // Lobi
  // ------------------------------------------------------------------

  /** Oda sahibinin ayarladığı koltuklar; daha önce oturmuş katılımcılar korunur. */
  setLobby(seats: Omit<LobbySeat, 'claimedBy'>[], settings: LobbySettings) {
    const prev = this.seats;
    this.seats = seats.map((s, i) => {
      const claimedBy = s.kind === 'remote' ? (prev[i]?.claimedBy ?? null) : null;
      const c = claimedBy ? this.clients.get(claimedBy) : undefined;
      return { ...s, name: c ? c.name : s.name, color: c ? c.color : s.color, claimedBy: c ? claimedBy : null };
    });
    // Artık var olmayan ya da bota çevrilen koltuklardan kaldır
    for (const c of this.clients.values()) {
      if (c.seat !== null && this.seats[c.seat]?.claimedBy !== c.clientId) c.seat = null;
    }
    this.settings = settings;
    this.lobbyChanged();
  }

  lobby(): LobbyInfo {
    return {
      seats: this.seats.map((s) => ({ ...s })),
      spectators: [...this.clients.values()].filter((c) => c.seat === null && c.conn).map((c) => c.name),
      ...this.settings,
    };
  }

  /** Oyun başlar: oturmuş katılımcılar koltuk sahibi olur. */
  startGame(state: GameState, getState: () => GameState | null) {
    this.inGame = true;
    this.getState = getState;
    this.presence = {};
    for (const c of this.clients.values()) {
      if (c.seat !== null && state.players[c.seat]?.kind === 'human') this.presence[c.seat] = { status: c.conn ? 'online' : 'away' };
      else c.seat = null;
    }
    for (const c of this.clients.values()) {
      c.conn?.send({ t: 'start', state: publicState(state), seat: c.seat, presence: this.presence });
    }
    this.events.onPresence?.(this.presence);
  }

  /** Uzaktaki oyuncunun koltuğu (oyunda) */
  remoteSeats(): Set<number> {
    return new Set(Object.keys(this.presence).map(Number));
  }

  getPresence(): Presence {
    return this.presence;
  }

  // ------------------------------------------------------------------
  // Oyun
  // ------------------------------------------------------------------

  broadcastUpdate(state: GameState, events: GameEvent[], origin?: { clientId: string; reqId: number }, undo = 0) {
    const pub = publicState(state);
    for (const c of this.clients.values()) {
      c.conn?.send({ t: 'update', state: pub, events, reqId: origin && origin.clientId === c.clientId ? origin.reqId : undefined, undo });
    }
  }

  reject(origin: { clientId: string; reqId: number }, reason: string) {
    this.clients.get(origin.clientId)?.conn?.send({ t: 'reject', reqId: origin.reqId, reason });
  }

  notice(text: string) {
    for (const c of this.clients.values()) c.conn?.send({ t: 'notice', text });
  }

  close(reason = 'Oda sahibi odayı kapattı.') {
    if (this.closed) return;
    this.closed = true;
    for (const c of this.clients.values()) c.conn?.send({ t: 'closed', reason });
    clearInterval(this.heartbeat);
    for (const t of this.takeoverTimers.values()) clearTimeout(t);
    // Kapanış mesajlarının gitmesi için kısa bir süre tanı
    setTimeout(() => this.transport.close(), 300);
  }

  // ------------------------------------------------------------------

  private accept(conn: Conn<ClientMessage, HostMessage>) {
    let client: RemoteClient | null = null;
    conn.onMessage((msg) => {
      if (this.closed) return;
      if (client) client.lastSeen = Date.now();
      if (msg.t === 'hello') {
        client = this.hello(conn, msg);
        return;
      }
      if (!client || client.conn !== conn) return;
      try {
        this.handle(client, msg);
      } catch (e) {
        console.error('Katılımcı mesajı işlenemedi', msg.t, e);
      }
    });
    conn.onClose(() => {
      if (client && client.conn === conn) this.dropped(client);
    });
  }

  private hello(conn: Conn<ClientMessage, HostMessage>, msg: Extract<ClientMessage, { t: 'hello' }>): RemoteClient | null {
    if (msg.version !== PROTOCOL_VERSION) {
      conn.send({ t: 'refused', reason: 'Oyun sürümleri farklı. İki taraf da sayfayı yenilesin.' });
      return null;
    }
    let c = this.clients.get(msg.clientId);
    if (c) {
      // Aynı katılımcı yeniden bağlandı: eski bağlantıyı bırak
      if (c.conn && c.conn !== conn) c.conn.close();
      c.conn = conn;
      c.lastSeen = Date.now();
    } else {
      c = { clientId: msg.clientId, name: (msg.name || 'Konuk').slice(0, 16), color: msg.color, conn, seat: null, lastSeen: Date.now() };
      this.clients.set(c.clientId, c);
    }
    if (this.inGame) {
      const seat = c.seat;
      if (seat !== null) {
        const t = this.takeoverTimers.get(seat);
        if (t) clearTimeout(t);
        this.takeoverTimers.delete(seat);
        const wasBot = this.presence[seat]?.status === 'bot';
        this.presence[seat] = { status: 'online' };
        if (wasBot) this.events.onTakeover?.(seat, false);
        this.notifyPresence();
        this.events.onNotice?.(`${c.name} oyuna geri döndü.`);
        this.notice(`${c.name} oyuna geri döndü.`);
      }
      const st = this.getState();
      conn.send({ t: 'welcome', seat, lobby: null, state: st ? publicState(st) : null, presence: this.presence });
    } else {
      conn.send({ t: 'welcome', seat: c.seat, lobby: this.lobby(), state: null, presence: {} });
      this.lobbyChanged();
    }
    return c;
  }

  private handle(c: RemoteClient, msg: ClientMessage) {
    switch (msg.t) {
      case 'ping':
        return;
      case 'profile':
        c.name = (msg.name || 'Konuk').slice(0, 16);
        c.color = msg.color;
        if (!this.inGame && c.seat !== null) {
          this.seats[c.seat].name = c.name;
          this.seats[c.seat].color = c.color;
        }
        if (!this.inGame) this.lobbyChanged();
        return;
      case 'claim': {
        if (this.inGame) return;
        if (msg.seat !== null) {
          const seat = this.seats[msg.seat];
          if (!seat || seat.kind !== 'remote' || (seat.claimedBy && seat.claimedBy !== c.clientId)) {
            c.conn?.send({ t: 'notice', text: 'Bu koltuk boş değil.' });
            return;
          }
        }
        if (c.seat !== null && this.seats[c.seat]?.claimedBy === c.clientId) this.seats[c.seat].claimedBy = null;
        c.seat = msg.seat;
        if (msg.seat !== null) {
          const seat = this.seats[msg.seat];
          seat.claimedBy = c.clientId;
          seat.name = c.name;
          seat.color = c.color;
        }
        this.lobbyChanged();
        return;
      }
      case 'action': {
        const origin = { clientId: c.clientId, reqId: msg.reqId };
        if (!this.inGame) return this.reject(origin, 'Oyun başlamadı');
        if (c.seat === null) return this.reject(origin, 'İzleyiciler hamle yapamaz');
        if (msg.action.player !== c.seat) return this.reject(origin, 'Yalnızca kendi devletin adına oynayabilirsin');
        if (this.presence[c.seat]?.status !== 'online') return this.reject(origin, 'Koltuğun şu an botta');
        this.events.onAction?.(c.seat, msg.action, origin);
        return;
      }
      case 'undo': {
        const origin = { clientId: c.clientId, reqId: msg.reqId };
        if (!this.inGame || c.seat === null) return this.reject(origin, 'Geri alınacak eylem yok');
        if (this.presence[c.seat]?.status !== 'online') return this.reject(origin, 'Koltuğun şu an botta');
        this.events.onUndo?.(c.seat, origin);
        return;
      }
      case 'hello':
        return;
    }
  }

  private dropped(c: RemoteClient) {
    c.conn = null;
    if (!this.inGame) {
      if (c.seat !== null && this.seats[c.seat]?.claimedBy === c.clientId) this.seats[c.seat].claimedBy = null;
      this.clients.delete(c.clientId);
      this.lobbyChanged();
      return;
    }
    const seat = c.seat;
    if (seat === null || this.presence[seat]?.status !== 'online') return;
    const deadline = Date.now() + RECONNECT_GRACE_MS;
    this.presence[seat] = { status: 'away', deadline };
    this.notifyPresence();
    this.events.onNotice?.(`${c.name} bağlantısı koptu. 1 dakika bekleniyor…`);
    this.notice(`${c.name} bağlantısı koptu. 1 dakika bekleniyor…`);
    this.takeoverTimers.set(
      seat,
      setTimeout(() => {
        this.takeoverTimers.delete(seat);
        if (this.presence[seat]?.status !== 'away') return;
        this.presence[seat] = { status: 'bot' };
        this.notifyPresence();
        this.events.onTakeover?.(seat, true);
        this.events.onNotice?.(`${c.name} dönmedi, yerine bot oynuyor. Dönerse koltuğunu geri alır.`);
        this.notice(`${c.name} dönmedi, yerine bot oynuyor. Dönerse koltuğunu geri alır.`);
      }, RECONNECT_GRACE_MS),
    );
  }

  private tick() {
    const now = Date.now();
    for (const c of this.clients.values()) {
      if (!c.conn) continue;
      if (now - c.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        const conn = c.conn;
        this.dropped(c);
        conn.close();
      } else c.conn.send({ t: 'ping' });
    }
  }

  private notifyPresence() {
    for (const c of this.clients.values()) c.conn?.send({ t: 'presence', presence: this.presence });
    this.events.onPresence?.(this.presence);
  }

  private lobbyChanged() {
    const lobby = this.lobby();
    for (const c of this.clients.values()) c.conn?.send({ t: 'lobby', lobby, seat: c.seat });
    this.events.onLobbyChange?.(lobby);
  }
}
