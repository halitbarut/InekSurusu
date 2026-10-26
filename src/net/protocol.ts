import type { Action, BotLevel, GameEvent, GameState } from '../engine';
import type { ChatMessage, ChatSend } from './chat';

/**
 * Mesaj biçimi değişirse artırılır; farklı sürümler aynı odaya bağlanamaz.
 * 3: oyuncuya özel durum görünümü (gizli teklifler), lobide maskeli katılımcı kimlikleri.
 * 4: oyun içi sohbet (genel kanal, uçtan uca şifreli özel mesajlar, sohbet geçmişi).
 * 5: tur süresi (clock, timeout mesajları).
 * 6: izleyiciler: izleyici listesi (viewers), izleyici sohbeti ayarı (chatcfg).
 */
export const PROTOCOL_VERSION = 6;

/** Oyunu izleyen biri: oturmamış katılımcı ya da elenmiş oyuncu */
export interface ViewerInfo {
  name: string;
  /** Elenmiş oyuncu (koltuğu) */
  seat: number | null;
}

/** Oda sahibinin tuttuğu tur saati: kimin süresi işliyor ve ne kadar kaldı (gönderildiği an) */
export interface ClockMessage {
  players: number[];
  remainingMs: number;
  limitMs: number;
}

/** Kopan oyuncunun dönmesi için beklenen süre; sonra bot devralır. */
export const RECONNECT_GRACE_MS = 60_000;
/** Bu kadar süre mesaj gelmeyen bağlantı kopmuş sayılır. */
export const HEARTBEAT_TIMEOUT_MS = 12_000;
export const HEARTBEAT_INTERVAL_MS = 4_000;

export type SeatKind = 'host' | 'remote' | 'bot';

export interface LobbySeat {
  name: string;
  color: string;
  kind: SeatKind;
  /** Bot koltuğunun seviyesi */
  botLevel?: BotLevel;
  /**
   * Koltuğa oturan katılımcının kalıcı kimliği (remote koltuklar için). Oda sahibinde gerçek kimliktir;
   * katılanlara giden lobide yalnızca "dolu" anlamında maskelenir (kimlik başkasının koltuğunu almaya yeter).
   */
  claimedBy: string | null;
}

export interface LobbyInfo {
  seats: LobbySeat[];
  spectators: string[];
  width: number;
  height: number;
  seed: string;
  /** Seçili kural takımının adı (ör. "Dengeli") */
  rules?: string;
  /** Kayıtlı harita kullanılıyorsa adı */
  mapName?: string;
  /** Tur süresi (saniye; 0 ya da yok = kapalı) */
  turnSeconds?: number;
  /** İzleyiciler genel sohbete yazabilir mi (yok = evet) */
  spectatorChat?: boolean;
}

/** Oyun sırasında insan koltuklarının bağlantı durumu */
export type PresenceStatus = 'online' | 'away' | 'bot';

export interface SeatPresence {
  status: PresenceStatus;
  /** 'away' durumunda bot devralma zamanı (epoch ms) */
  deadline?: number;
}

export type Presence = Record<number, SeatPresence>;

export type ClientMessage =
  | { t: 'hello'; version: number; clientId: string; name: string; color: string }
  | { t: 'profile'; name: string; color: string }
  | { t: 'claim'; seat: number | null }
  | { t: 'action'; reqId: number; action: Action }
  /** Kendi turunda son eylemini geri al */
  | { t: 'undo'; reqId: number }
  /** Sohbet: özel mesajlar için açık anahtar (JWK metni) */
  | { t: 'key'; pub: string }
  | { t: 'chat'; msg: ChatSend }
  | { t: 'ping' };

/** Oyundaki sohbet durumu: geçmiş (bu katılımcının görebildikleri) ve koltukların açık anahtarları */
export interface ChatSnapshot {
  log: ChatMessage[];
  keys: Record<number, string>;
}

export type HostMessage =
  | { t: 'welcome'; seat: number | null; lobby: LobbyInfo | null; state: GameState | null; presence: Presence; chat?: ChatSnapshot }
  | { t: 'refused'; reason: string }
  | { t: 'lobby'; lobby: LobbyInfo; seat: number | null }
  | { t: 'start'; state: GameState; seat: number | null; presence: Presence; chat?: ChatSnapshot }
  /** undo: sıradaki oyuncunun geri alabileceği eylem sayısı */
  | { t: 'update'; state: GameState; events: GameEvent[]; reqId?: number; by?: string; undo?: number }
  | { t: 'reject'; reqId: number; reason: string }
  | { t: 'presence'; presence: Presence }
  | { t: 'notice'; text: string }
  | { t: 'closed'; reason: string }
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'keys'; keys: Record<number, string> }
  /** Tur saati değişti (null = kimsenin süresi işlemiyor) */
  | { t: 'clock'; clock: ClockMessage | null }
  /** Bu oyuncuların süresi doldu: açık pencerelerini kapatsınlar */
  | { t: 'timeout'; players: number[] }
  /** Oyunu izleyenler (oturmamış katılımcılar ve elenmiş oyuncular) */
  | { t: 'viewers'; viewers: ViewerInfo[] }
  /** İzleyiciler genel sohbete yazabilir mi */
  | { t: 'chatcfg'; spectatorChat: boolean }
  | { t: 'ping' };

/** Lobide katılanlara giden maskeli koltuk sahibi */
export const CLAIMED_MASK = 'dolu';

/** Bu olay yalnızca teklifin iki tarafına mı gösterilir? */
function privateTo(e: GameEvent): [number, number] | null {
  switch (e.type) {
    case 'offer_made':
      return [e.offer.from, e.offer.to];
    case 'offer_response':
    case 'offer_cancelled':
      return [e.from, e.to];
    default:
      return null;
  }
}

/** viewer (koltuk; null = izleyici) bu olayı görebilir mi? */
export function eventVisibleTo(e: GameEvent, viewer: number | null): boolean {
  const pair = privateTo(e);
  return !pair || (viewer !== null && pair.includes(viewer));
}

export function eventsFor(events: GameEvent[], viewer: number | null): GameEvent[] {
  return events.filter((e) => eventVisibleTo(e, viewer));
}

/**
 * Bir katılımcıya gönderilecek durum. RNG durumu gizlenir (sonraki topaç önceden hesaplanamasın);
 * teklifler ve günlükteki teklif satırları yalnızca teklifin iki tarafına gider. İzleyici hiç teklif görmez.
 * Teklifin sonucu olan ittifak, barış, toprak ve kaynak devri herkesin gördüğü değişikliklerdir.
 */
export function viewFor(state: GameState, viewer: number | null): GameState {
  return {
    ...state,
    rngState: 0,
    offers: viewer === null ? [] : state.offers.filter((o) => o.from === viewer || o.to === viewer),
    log: state.log.filter((l) => eventVisibleTo(l.event, viewer)),
  };
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomRoomCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** Tahmin edilemez kimlik (katılımcının odadaki gizli anahtarı gibi davranır) */
export function randomId(): string {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return [...c.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Katılanın gönderdiği adı ve rengi temizler */
export function cleanName(name: unknown): string {
  return (typeof name === 'string' ? name : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16) || 'Konuk';
}

export function cleanColor(color: unknown): string {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#777777';
}
