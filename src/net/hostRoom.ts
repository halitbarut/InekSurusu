import { parseAction, type Action, type GameEvent, type GameState } from '../engine';
import { CHAT_HISTORY, ChatIdentity, RateLimit, cleanChatText, validBox, type ChatBox, type ChatMessage, type ChatSend } from './chat';
import {
  CLAIMED_MASK,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  cleanColor,
  cleanName,
  eventsFor,
  viewFor,
  type ClientMessage,
  type HostMessage,
  type LobbyInfo,
  type LobbySeat,
  type Presence,
  type ChatSnapshot,
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
  chatLimit: RateLimit;
}

/** Sohbet arayüzünün oda sahibi ve katılan için ortak yüzü */
export interface ChatChannel {
  /** Bu cihazın koltuğu (null = izleyici) */
  chatSeat(): number | null;
  /** Bu cihazın görebildiği mesajlar (eskiden yeniye) */
  chatMessages(): ChatMessage[];
  /** Bu koltuğa özel mesaj gönderilebilir mi? Gönderilemiyorsa nedeni */
  privateProblem(seat: number): string | null;
  /** Gönderir; olmazsa nedenini döner */
  sendChat(to: number | null, text: string): Promise<string | null>;
  /** Özel mesajı çözer (bu cihaz taraf değilse null) */
  openBox(box: ChatBox): Promise<string | null>;
  /** Genel kanala izleyiciler yazabilir mi */
  spectatorChatOpen(): boolean;
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
  /** Oda sahibinin görebildiği yeni sohbet mesajı; null = liste ya da anahtarlar değişti */
  onChat?(msg: ChatMessage | null): void;
}

/**
 * Oda sahibinin tarafındaki oda yönetimi: katılımcılar, lobi koltukları, oyun sırasında
 * bağlantı durumu ve bot devralma. Oyun durumunu kendisi tutmaz; hamleleri olay olarak
 * dışarı (oyun ekranına) verir, oyun ekranı da sonucu broadcastUpdate ile yayınlar.
 */
type LobbySettings = Pick<LobbyInfo, 'width' | 'height' | 'seed' | 'rules' | 'mapName'>;

export class HostRoom implements ChatChannel {
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
  // Sohbet: oda sahibi geçmişi tutar; özel mesajları yalnızca şifreli hâliyle görür
  private chatLog: ChatMessage[] = [];
  private nextChatId = 1;
  private keys: Record<number, string> = {};
  private hostSeat: number | null = null;
  private identity: ChatIdentity | null = null;
  /** İzleyiciler genel kanala yazabilir mi */
  private spectatorChat = true;

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

  /** Katılanlara giden lobi: koltuk sahiplerinin kimlikleri maskelenir */
  private maskedLobby(): LobbyInfo {
    const l = this.lobby();
    return { ...l, seats: l.seats.map((s) => ({ ...s, claimedBy: s.claimedBy ? CLAIMED_MASK : null })) };
  }

  /** Oyun başlar: oturmuş katılımcılar koltuk sahibi olur. hostSeat: oda sahibinin kendi koltuğu (sohbet için) */
  startGame(state: GameState, getState: () => GameState | null, hostSeat: number | null = null) {
    this.inGame = true;
    this.getState = getState;
    this.hostSeat = hostSeat;
    if (hostSeat !== null) void this.initChat(hostSeat);
    this.presence = {};
    for (const c of this.clients.values()) {
      if (c.seat !== null && state.players[c.seat]?.kind === 'human') this.presence[c.seat] = { status: c.conn ? 'online' : 'away' };
      else c.seat = null;
    }
    for (const c of this.clients.values()) {
      c.conn?.send({ t: 'start', state: viewFor(state, c.seat), seat: c.seat, presence: this.presence, chat: this.chatSnapshot(c.seat) });
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

  /** Yeni durumu yayınlar; her katılımcı yalnızca görmesi gerekeni alır (viewFor, eventsFor). */
  broadcastUpdate(state: GameState, events: GameEvent[], origin?: { clientId: string; reqId: number }, undo = 0) {
    const views = new Map<number | null, { state: GameState; events: GameEvent[] }>();
    for (const c of this.clients.values()) {
      if (!c.conn) continue;
      let v = views.get(c.seat);
      if (!v) views.set(c.seat, (v = { state: viewFor(state, c.seat), events: eventsFor(events, c.seat) }));
      c.conn.send({ t: 'update', state: v.state, events: v.events, reqId: origin && origin.clientId === c.clientId ? origin.reqId : undefined, undo });
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
      // Bozuk ya da kötü niyetli mesajlar bağlantıyı düşürmesin
      if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') return;
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
    if (typeof msg.clientId !== 'string' || msg.clientId.length < 8 || msg.clientId.length > 64) {
      conn.send({ t: 'refused', reason: 'Geçersiz katılımcı kimliği.' });
      return null;
    }
    let c = this.clients.get(msg.clientId);
    if (c) {
      // Aynı katılımcı yeniden bağlandı: eski bağlantıyı bırak
      if (c.conn && c.conn !== conn) c.conn.close();
      c.conn = conn;
      c.lastSeen = Date.now();
    } else {
      c = { clientId: msg.clientId, name: cleanName(msg.name), color: cleanColor(msg.color), conn, seat: null, lastSeen: Date.now(), chatLimit: new RateLimit() };
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
      conn.send({ t: 'welcome', seat, lobby: null, state: st ? viewFor(st, seat) : null, presence: this.presence, chat: this.chatSnapshot(seat) });
    } else {
      conn.send({ t: 'welcome', seat: c.seat, lobby: this.maskedLobby(), state: null, presence: {} });
      this.lobbyChanged();
    }
    return c;
  }

  private handle(c: RemoteClient, msg: ClientMessage) {
    switch (msg.t) {
      case 'ping':
        return;
      case 'profile':
        c.name = cleanName(msg.name);
        c.color = cleanColor(msg.color);
        if (!this.inGame && c.seat !== null) {
          this.seats[c.seat].name = c.name;
          this.seats[c.seat].color = c.color;
        }
        if (!this.inGame) this.lobbyChanged();
        return;
      case 'claim': {
        if (this.inGame) return;
        if (msg.seat !== null && !Number.isInteger(msg.seat)) return;
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
        if (this.presence[c.seat]?.status !== 'online') return this.reject(origin, 'Koltuğun şu an botta');
        // Biçim denetimi: yalnızca bilinen türde, doğru tipte alanlarla kurulmuş temiz bir eylem geçer
        const action = parseAction(msg.action);
        if (!action) return this.reject(origin, 'Geçersiz eylem biçimi');
        if (action.player !== c.seat) return this.reject(origin, 'Yalnızca kendi devletin adına oynayabilirsin');
        this.events.onAction?.(c.seat, action, origin);
        return;
      }
      case 'undo': {
        const origin = { clientId: c.clientId, reqId: msg.reqId };
        if (!this.inGame || c.seat === null) return this.reject(origin, 'Geri alınacak eylem yok');
        if (this.presence[c.seat]?.status !== 'online') return this.reject(origin, 'Koltuğun şu an botta');
        this.events.onUndo?.(c.seat, origin);
        return;
      }
      case 'key':
        if (this.inGame && c.seat !== null && validPub(msg.pub) && this.keys[c.seat] !== msg.pub) {
          this.keys[c.seat] = msg.pub;
          this.keysChanged();
        }
        return;
      case 'chat': {
        if (!this.inGame) return;
        if (!c.chatLimit.allow()) return c.conn?.send({ t: 'notice', text: 'Çok hızlı yazıyorsun, biraz bekle.' });
        const st = this.getState();
        const seat = c.seat;
        const err = this.postChat(seat, seat !== null && st ? st.players[seat].name : c.name, seat !== null && st ? st.players[seat].color : c.color, msg.msg);
        if (err) c.conn?.send({ t: 'notice', text: err });
        return;
      }
      case 'hello':
        return;
    }
  }

  // ------------------------------------------------------------------
  // Sohbet
  // ------------------------------------------------------------------

  private async initChat(seat: number) {
    try {
      this.identity = await ChatIdentity.create(`inek-surusu-chatkey-host-${this.code}`);
      this.keys[seat] = this.identity.pub;
      this.keysChanged();
    } catch {
      // Güvenli bağlam yok: özel mesaj kapalı, genel kanal çalışır
    }
  }

  private keysChanged() {
    for (const c of this.clients.values()) if (this.inGame) c.conn?.send({ t: 'keys', keys: { ...this.keys } });
    this.events.onChat?.(null);
  }

  private chatSnapshot(seat: number | null): ChatSnapshot {
    return { log: this.chatLog.filter((m) => canSeeChat(seat, m)), keys: { ...this.keys } };
  }

  /** Mesajı doğrular, saklar ve yalnızca görebileceklere iletir. Olmazsa nedenini döner. */
  private postChat(seat: number | null, name: string, color: string, send: ChatSend): string | null {
    const st = this.getState();
    if (!st || !send || typeof send !== 'object') return 'Sohbet kapalı';
    const spectator = seat === null || !st.players[seat]?.alive;
    let msg: ChatMessage;
    const base = { id: this.nextChatId, at: Date.now(), seat, name, color, spectator };
    if (send.to === null) {
      const text = cleanChatText((send as { text?: unknown }).text);
      if (!text) return 'Mesaj boş';
      if (spectator && !this.spectatorChat) return 'Oda sahibi izleyici sohbetini kapattı.';
      msg = { ...base, to: null, text };
    } else {
      const to = send.to;
      const box = (send as { box?: unknown }).box;
      if (spectator) return 'İzleyiciler özel mesaj gönderemez.';
      if (!Number.isInteger(to) || to === seat || !st.players[to] || !humanSeat(st, this.presence, to)) return 'Bu oyuncuya özel mesaj gönderilemez.';
      if (!validBox(box)) return 'Mesaj bozuk';
      if (box.spub !== this.keys[seat] || box.rpub !== this.keys[to]) return 'Anahtarlar değişti, mesajı tekrar gönder.';
      msg = { ...base, to, box: { iv: box.iv, data: box.data, spub: box.spub, rpub: box.rpub } };
    }
    this.nextChatId++;
    this.chatLog.push(msg);
    if (this.chatLog.length > CHAT_HISTORY) this.chatLog.splice(0, this.chatLog.length - CHAT_HISTORY);
    for (const c of this.clients.values()) if (canSeeChat(c.seat, msg)) c.conn?.send({ t: 'chat', msg });
    if (canSeeChat(this.hostSeat, msg)) this.events.onChat?.(msg);
    return null;
  }

  // ChatChannel (oda sahibinin kendi ekranı)

  chatSeat(): number | null {
    return this.hostSeat;
  }

  chatMessages(): ChatMessage[] {
    return this.chatLog.filter((m) => canSeeChat(this.hostSeat, m));
  }

  privateProblem(seat: number): string | null {
    return privateProblemFor(this.getState(), this.presence, this.hostSeat, seat, this.keys, this.identity !== null);
  }

  async sendChat(to: number | null, text: string): Promise<string | null> {
    const st = this.getState();
    if (!st || this.hostSeat === null) return 'Sohbet kapalı';
    const me = st.players[this.hostSeat];
    if (to === null) return this.postChat(this.hostSeat, me.name, me.color, { to: null, text });
    const prob = this.privateProblem(to);
    if (prob) return prob;
    const clean = cleanChatText(text);
    if (!clean) return 'Mesaj boş';
    const box = await this.identity!.seal(clean, this.keys[to]);
    return this.postChat(this.hostSeat, me.name, me.color, { to, box });
  }

  openBox(box: ChatBox): Promise<string | null> {
    return this.identity ? this.identity.open(box) : Promise.resolve(null);
  }

  spectatorChatOpen(): boolean {
    return this.spectatorChat;
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
    const masked = this.maskedLobby();
    for (const c of this.clients.values()) c.conn?.send({ t: 'lobby', lobby: masked, seat: c.seat });
    this.events.onLobbyChange?.(this.lobby());
  }
}

/** seat koltuğundaki (null = izleyici) katılımcı bu mesajı görebilir mi? */
export function canSeeChat(seat: number | null, m: ChatMessage): boolean {
  return m.to === null || (seat !== null && (m.seat === seat || m.to === seat));
}

/** me → seat özel mesajına engel (oda sahibi ve katılan aynı kuralı kullanır) */
export function privateProblemFor(st: GameState | null, presence: Presence, me: number | null, seat: number, keys: Record<number, string>, haveIdentity: boolean): string | null {
  if (!st) return 'Sohbet kapalı';
  if (me === null || !st.players[me]?.alive) return 'İzleyiciler özel mesaj gönderemez';
  const p = st.players[seat];
  if (!p || seat === me) return 'Geçersiz oyuncu';
  if (!humanSeat(st, presence, seat)) return 'Botlarla mesajlaşılmaz';
  if (!haveIdentity) return 'Özel mesaj için güvenli bağlantı gerekir (https ya da localhost)';
  if (!keys[seat]) return `${p.name} henüz bağlanmadı`;
  if (!keys[me]) return 'Anahtarın henüz oda sahibine ulaşmadı';
  return null;
}

/** İnsan koltuğu mu? (bağlantısı koptuğu için yerine bot oynayan oyuncu da insandır) */
export function humanSeat(st: GameState, presence: Presence, seat: number): boolean {
  return st.players[seat]?.kind === 'human' || presence[seat] !== undefined;
}

function validPub(pub: unknown): pub is string {
  if (typeof pub !== 'string' || pub.length > 1024) return false;
  try {
    const j = JSON.parse(pub) as { kty?: unknown; crv?: unknown };
    return j.kty === 'EC' && j.crv === 'P-256';
  } catch {
    return false;
  }
}
