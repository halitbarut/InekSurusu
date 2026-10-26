import { dispatch, MAX_LOG } from './rules';
import { parseAction } from './actionShape';
import type { Action, ApplyResult, GameEvent, GameState } from './types';

/**
 * Oyun tekrarı (replay). Başlangıç durumu (seed ve RNG durumu dahil) ve uygulanan bütün eylemler kaydedilir;
 * oyun aynı motorla baştan uygulanarak birebir yeniden üretilir. Geri alınan eylemler kayıttan çıkarılır.
 * Eylem olmayan iki durum değişikliği de adım olarak kaydedilir: koltuğun bota geçmesi/geri dönmesi ve
 * (paylaşılan kopyada) içeriği çıkarılmış teklif.
 */

export const REPLAY_VERSION = 1;

export type ReplayStep =
  | Action
  /** Çevrimiçide kopan oyuncunun yerine bot geçti ya da oyuncu döndü */
  | { type: 'SET_PLAYER_KIND'; player: number; kind: 'human' | 'bot' }
  /** Kabul edilmemiş, içeriği gizlenmiş teklif (yalnızca paylaşılan kopyada) */
  | { type: 'HIDDEN_OFFER'; player: number; to: number };

export interface ReplayData {
  app: 'inek-surusu-replay';
  version: typeof REPLAY_VERSION;
  /** Kaydın başladığı durum (yeni oyunda kurulumdan önce) */
  initial: GameState;
  steps: ReplayStep[];
  /** Kayıt oyunun ortasından başladı (eski bir kayıttan devam edilen oyun) */
  partial?: boolean;
  /** Kabul edilmemiş tekliflerin içeriği çıkarıldı */
  redacted?: boolean;
  savedAt?: string;
}

/** Oyunu yürüten tarafta (yerel oyun, oda sahibi) adımları biriktirir. */
export class ReplayRecorder {
  private steps: ReplayStep[];
  private initial: GameState;

  constructor(
    initial: GameState,
    steps: ReplayStep[] = [],
    private partial = false,
  ) {
    this.initial = structuredClone(initial);
    this.steps = [...steps];
  }

  static from(data: ReplayData): ReplayRecorder {
    return new ReplayRecorder(data.initial, data.steps, !!data.partial);
  }

  /** Oyunun başından başlıyorsa tam, değilse yarım kayıt */
  static start(state: GameState): ReplayRecorder {
    const fresh = state.turnCounter === 0 && state.log.length === 0 && state.phase.kind === 'setup_capital';
    return new ReplayRecorder(state, [], !fresh);
  }

  record(step: ReplayStep) {
    this.steps.push(structuredClone(step));
  }

  /** Geri alınan son eylemi kayıttan çıkarır */
  pop() {
    this.steps.pop();
  }

  get length(): number {
    return this.steps.length;
  }

  data(): ReplayData {
    return {
      app: 'inek-surusu-replay',
      version: REPLAY_VERSION,
      initial: structuredClone(this.initial),
      steps: structuredClone(this.steps),
      ...(this.partial ? { partial: true } : {}),
      savedAt: new Date().toISOString(),
    };
  }
}

/** Tek adımı uygular (geçersizse hata fırlatır). */
export function applyReplayStep(state: GameState, step: ReplayStep): ApplyResult {
  switch (step.type) {
    case 'SET_PLAYER_KIND': {
      const s = structuredClone(state);
      s.players[step.player].kind = step.kind;
      return { state: s, events: [] };
    }
    case 'HIDDEN_OFFER': {
      const s = structuredClone(state);
      const offer = { id: s.nextOfferId++, from: step.player, to: step.to, items: [], createdTurn: s.turnCounter };
      s.offers.push(offer);
      const events: GameEvent[] = [{ type: 'offer_made', offer: structuredClone(offer) }];
      for (const e of events) s.log.push({ turn: s.turnCounter, round: s.round, event: e });
      if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
      return { state: s, events };
    }
    default:
      return dispatch(state, step);
  }
}

/** Bütün adımları uygular ve son durumu döner. */
export function replayAll(data: ReplayData): GameState {
  let s = data.initial;
  for (const step of data.steps) s = applyReplayStep(s, step).state;
  return s;
}

/**
 * Başkalarıyla paylaşılacak kopya: hiç kabul edilmemiş (reddedilen, geri çekilen, yanıtsız kalan, kabulde geçersiz
 * olan) tekliflerin içeriği çıkarılır. Kabul edilen tekliflerin sonucu zaten herkesin gördüğü bir değişikliktir.
 */
export function redactReplay(data: ReplayData): ReplayData {
  const accepted = new Set<number>();
  const created: (number | null)[] = [];
  let s = data.initial;
  for (const step of data.steps) {
    const r = applyReplayStep(s, step);
    let made: number | null = null;
    for (const e of r.events) {
      if (e.type === 'offer_made') made = e.offer.id;
      if (e.type === 'offer_response' && e.accepted && !e.failedReason) accepted.add(e.offerId);
    }
    created.push(made);
    s = r.state;
  }
  const steps = data.steps.map((step, i): ReplayStep => {
    const id = created[i];
    if (step.type === 'PROPOSE_OFFER' && id !== null && !accepted.has(id)) return { type: 'HIDDEN_OFFER', player: step.player, to: step.to };
    return step;
  });
  // Yarım kayıtta başlangıçta bekleyen teklifler ve günlükteki teklif satırları da aynı kurala uyar
  const initial = structuredClone(data.initial);
  for (const o of initial.offers) if (!accepted.has(o.id)) o.items = [];
  for (const l of initial.log) if (l.event.type === 'offer_made' && !accepted.has(l.event.offer.id)) l.event.offer.items = [];
  return { ...data, initial, steps, redacted: true };
}

/** Dosyadan okunan tekrar verisini denetler. */
export function parseReplay(text: string): ReplayData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Dosya geçerli bir JSON değil');
  }
  const d = data as Partial<ReplayData>;
  if (!d || d.app !== 'inek-surusu-replay') throw new Error('Bu dosya bir İnek Sürüsü tekrar dosyası değil');
  if (d.version !== REPLAY_VERSION) throw new Error('Tekrar dosyasının sürümü desteklenmiyor');
  const st = d.initial;
  if (!st || st.version !== 1 || !st.map || !Array.isArray(st.players) || !Array.isArray(st.owner) || st.owner.length !== st.map.width * st.map.height) {
    throw new Error('Tekrar dosyası bozuk: başlangıç durumu okunamadı');
  }
  if (!Array.isArray(d.steps)) throw new Error('Tekrar dosyası bozuk: adımlar okunamadı');
  const steps: ReplayStep[] = [];
  for (const raw of d.steps as unknown[]) {
    const o = raw as { type?: unknown; player?: unknown; to?: unknown; kind?: unknown };
    if (o && o.type === 'SET_PLAYER_KIND' && Number.isInteger(o.player) && (o.kind === 'human' || o.kind === 'bot')) {
      steps.push({ type: 'SET_PLAYER_KIND', player: o.player as number, kind: o.kind });
    } else if (o && o.type === 'HIDDEN_OFFER' && Number.isInteger(o.player) && Number.isInteger(o.to)) {
      steps.push({ type: 'HIDDEN_OFFER', player: o.player as number, to: o.to as number });
    } else {
      const a = parseAction(raw);
      if (!a) throw new Error(`Tekrar dosyası bozuk: ${steps.length + 1}. adım okunamadı`);
      steps.push(a);
    }
  }
  return { app: 'inek-surusu-replay', version: REPLAY_VERSION, initial: st as GameState, steps, partial: !!d.partial, redacted: !!d.redacted, savedAt: d.savedAt };
}
