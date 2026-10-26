import type { GameState } from '../../engine';

/** Maç ayarlarındaki tur süresi seçenekleri (saniye; 0 = kapalı) */
export const TURN_TIME_CHOICES: readonly number[] = [0, 60, 120, 180, 300];

/** Son kaç saniyede uyarı verilir */
export const CLOCK_WARN_MS = 15_000;

/** Kararı beklenen oyuncu(lar) ve bölümün kimliği */
export interface ClockSegment {
  key: string;
  players: number[];
}

/** Ekranda gösterilen (ağdan da gönderilen) saat bilgisi */
export interface ClockInfo {
  players: number[];
  remainingMs: number;
  limitMs: number;
}

/**
 * Şu an kimin süresi işliyor? Normal turda sıradaki oyuncu (topaç, bakım, eylemler ve kendi fethi tek bölüm);
 * karşı saldırıda toprak seçen savunanın, oylamada oyunu bekleyenlerin kendi bölümü vardır ve bu sırada
 * sıradaki oyuncunun süresi durur. Yalnızca insanlar için süre tutulur.
 */
export function clockSegment(state: GameState, isHuman: (p: number) => boolean): ClockSegment | null {
  const ph = state.phase;
  let seg: ClockSegment;
  switch (ph.kind) {
    case 'gameover':
      return null;
    case 'vote':
      seg = { key: `vote-${state.turnCounter}-${ph.proposer}`, players: state.players.filter((p) => p.alive && !(p.id in ph.votes)).map((p) => p.id) };
      break;
    case 'conquest':
      seg = ph.counter ? { key: `counter-${state.turnCounter}-${ph.taker}`, players: [ph.taker] } : { key: `turn-${state.turnCounter}`, players: [state.currentPlayer] };
      break;
    case 'setup_capital':
    case 'setup_territory':
      seg = { key: `${ph.kind}-${state.currentPlayer}`, players: [state.currentPlayer] };
      break;
    default:
      seg = { key: `turn-${state.turnCounter}`, players: [state.currentPlayer] };
  }
  seg.players = seg.players.filter(isHuman);
  return seg.players.length ? seg : null;
}

/**
 * Bölüm başına süre bütçesi. Etkin bölüm değişince öncekinin kalan süresi saklanır (duraklar), aynı bölüme
 * dönülünce kaldığı yerden sürer. Her bölümün süresi bir kez dolar.
 */
export class TurnClock {
  private budgets = new Map<string, number>();
  private active: { seg: ClockSegment; since: number } | null = null;
  private expired = new Set<string>();

  constructor(readonly limitMs: number) {}

  /** Etkin bölümü ayarlar (null = duraklat). Değiştiyse true. */
  set(seg: ClockSegment | null, now = Date.now()): boolean {
    const cur = this.active;
    if (cur && seg && cur.seg.key === seg.key) {
      const same = cur.seg.players.join() === seg.players.join();
      cur.seg = seg;
      return !same;
    }
    if (!cur && !seg) return false;
    if (cur) this.budgets.set(cur.seg.key, this.left(cur, now));
    this.active = seg ? { seg, since: now } : null;
    if (seg && !this.budgets.has(seg.key)) {
      this.budgets.set(seg.key, this.limitMs);
      // Eski bölümleri unut
      if (this.budgets.size > 64) this.budgets.delete(this.budgets.keys().next().value!);
    }
    return true;
  }

  private left(a: { seg: ClockSegment; since: number }, now: number): number {
    return Math.max(0, (this.budgets.get(a.seg.key) ?? this.limitMs) - (now - a.since));
  }

  info(now = Date.now()): ClockInfo | null {
    const a = this.active;
    return a ? { players: [...a.seg.players], remainingMs: this.left(a, now), limitMs: this.limitMs } : null;
  }

  /** Etkin bölümün süresi az önce dolduysa onu döner (her bölüm için bir kez) */
  poll(now = Date.now()): ClockSegment | null {
    const a = this.active;
    if (!a || this.expired.has(a.seg.key) || this.left(a, now) > 0) return null;
    this.expired.add(a.seg.key);
    return a.seg;
  }
}

/** "1:05" */
export function clockText(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
