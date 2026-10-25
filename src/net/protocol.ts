import type { Action, BotLevel, GameEvent, GameState } from '../engine';

/** Mesaj biçimi değişirse artırılır; farklı sürümler aynı odaya bağlanamaz. */
export const PROTOCOL_VERSION = 1;

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
  /** Koltuğa oturan katılımcının kalıcı kimliği (remote koltuklar için) */
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
  | { t: 'ping' };

export type HostMessage =
  | { t: 'welcome'; seat: number | null; lobby: LobbyInfo | null; state: GameState | null; presence: Presence }
  | { t: 'refused'; reason: string }
  | { t: 'lobby'; lobby: LobbyInfo; seat: number | null }
  | { t: 'start'; state: GameState; seat: number | null; presence: Presence }
  | { t: 'update'; state: GameState; events: GameEvent[]; reqId?: number; by?: string }
  | { t: 'reject'; reqId: number; reason: string }
  | { t: 'presence'; presence: Presence }
  | { t: 'notice'; text: string }
  | { t: 'closed'; reason: string }
  | { t: 'ping' };

/** İstemcilere gönderilecek durum: RNG durumu gizlenir (sonraki topaç önceden hesaplanamasın). */
export function publicState(state: GameState): GameState {
  return { ...state, rngState: 0 };
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

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
