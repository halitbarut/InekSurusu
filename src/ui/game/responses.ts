import { loanResponder, type GameState } from '../../engine';

/**
 * Sıra sahibi dışında birinden (ya da sıra sahibinin penceresinden) cevap bekleyen durumlar. Kim, neye cevap verecek,
 * oyun onu bekliyor mu? Süre yalnızca oyunu yürüten tarafta (yerel oyun, oda sahibi) tutulur; süre dolunca otomatik
 * karar `responseAction` ile verilir. Bağlantısı kopan oyuncu da aynı şekilde bekler; bota devredilirse artık insan
 * olmadığı için listeden çıkar ve bot hemen cevaplar.
 */
export type ResponseKind = 'counter' | 'vote' | 'permit' | 'offer' | 'loan' | 'upkeep';

export interface PendingResponse {
  key: string;
  player: number;
  kind: ResponseKind;
  /** Oyun bu cevabı bekliyor mu? (teklifler beklemez) */
  blocking: boolean;
  /** Bilgi yalnızca bu oyunculara gider; null = herkese açık */
  parties: number[] | null;
  /** İlgili teklif/borç isteği/boğaz */
  ref?: number;
}

/** Ekranda gösterilen ve ağdan gönderilen bekleme bilgisi */
export interface WaitInfo extends PendingResponse {
  remainingMs: number;
  limitMs: number;
}

export interface ResponseScope {
  isHuman(p: number): boolean;
  /**
   * Hot-seat: başka bir insana giden teklif ya da botun gönderdiği teklif, alıcı cihazın başında değilken süresi
   * işlemesin diye yalnızca el değişmişken ya da alıcının kendi turunda sayılır.
   */
  hotSeat?: boolean;
  /** Hot-seat: şu an cihazı alıcıya verilmiş teklifler */
  promptedOffers?: ReadonlySet<number>;
  /** Hot-seat: şu an cihazı cevap verecek tarafa verilmiş borç görüşmeleri */
  promptedLoans?: ReadonlySet<number>;
  /** Hot-seat: cihaz geçiş ekranı açık (sıra sahibinin penceresinde süre işlemez) */
  handoff?: boolean;
}

export function pendingResponses(s: GameState, scope: ResponseScope): PendingResponse[] {
  return collect(s, scope).concat(upkeepResponse(s, scope));
}

/** Bakım ekranı sıra sahibinin penceresidir: hiçbir şey yapmazsa otomatik dağıtma kuralı uygulanır */
function upkeepResponse(s: GameState, scope: ResponseScope): PendingResponse[] {
  if (s.phase.kind !== 'upkeep' || !scope.isHuman(s.currentPlayer) || scope.handoff) return [];
  return [{ key: `upkeep-${s.turnCounter}`, player: s.currentPlayer, kind: 'upkeep', blocking: true, parties: null }];
}

function collect(s: GameState, scope: ResponseScope): PendingResponse[] {
  const out: PendingResponse[] = [];
  const ph = s.phase;
  if (ph.kind === 'gameover') return out;
  if (ph.kind === 'conquest' && ph.counter && scope.isHuman(ph.taker)) {
    out.push({ key: `counter-${s.turnCounter}-${ph.taker}`, player: ph.taker, kind: 'counter', blocking: true, parties: null });
  }
  if (ph.kind === 'vote') {
    for (const p of s.players) {
      if (p.alive && !(p.id in ph.votes) && scope.isHuman(p.id)) out.push({ key: `vote-${s.turnCounter}-${ph.proposer}-${p.id}`, player: p.id, kind: 'vote', blocking: true, parties: null });
    }
  }
  if (ph.kind === 'permit' && ph.stage === 'answers') {
    for (const r of ph.requests) {
      if (!r.answered && scope.isHuman(r.controller)) out.push({ key: `permit-${s.turnCounter}-${r.straitId}-${r.controller}`, player: r.controller, kind: 'permit', blocking: true, parties: null, ref: r.straitId });
    }
  }
  for (const o of s.offers) {
    if (!scope.isHuman(o.to)) continue;
    if (scope.hotSeat && !scope.promptedOffers?.has(o.id) && s.currentPlayer !== o.to) continue;
    out.push({ key: `offer-${o.id}`, player: o.to, kind: 'offer', blocking: false, parties: [o.from, o.to], ref: o.id });
  }
  for (const r of s.loanRequests) {
    const who = loanResponder(r);
    if (!scope.isHuman(who)) continue;
    if (scope.hotSeat && !scope.promptedLoans?.has(r.id) && s.currentPlayer !== who) continue;
    out.push({ key: `loan-${r.id}-${r.stage}`, player: who, kind: 'loan', blocking: false, parties: [r.borrower, r.lender], ref: r.id });
  }
  return out;
}

/** Her bekleyen cevabın son anını tutar. Liste değişince eskiler silinir, yeniler tam süreyle başlar. */
export class ResponseTracker {
  private items = new Map<string, { r: PendingResponse; deadline: number }>();
  private fired = new Set<string>();

  constructor(readonly limitMs: number) {}

  /** Bekleyenleri eşitler; değişiklik olduysa true */
  sync(list: PendingResponse[], now = Date.now()): boolean {
    let changed = false;
    const keys = new Set(list.map((r) => r.key));
    for (const k of [...this.items.keys()]) {
      if (!keys.has(k)) {
        this.items.delete(k);
        changed = true;
      }
    }
    for (const r of list) {
      if (!this.items.has(r.key)) {
        this.items.set(r.key, { r, deadline: now + this.limitMs });
        changed = true;
      }
    }
    return changed;
  }

  /** Süresi az önce dolanlar (her biri bir kez) */
  expired(now = Date.now()): PendingResponse[] {
    const out: PendingResponse[] = [];
    for (const [k, v] of this.items) {
      if (v.deadline > now || this.fired.has(k)) continue;
      this.fired.add(k);
      out.push(v.r);
    }
    return out;
  }

  info(now = Date.now()): WaitInfo[] {
    return [...this.items.values()].map(({ r, deadline }) => ({ ...r, remainingMs: Math.max(0, deadline - now), limitMs: this.limitMs }));
  }
}

/** Saldırının sonucunu gösteren pencere tıklama bekleyebilir mi? Yalnızca savaşı başlatan, kendi sırasında. */
export function battleWaitsForClick(attackerIsMine: boolean, animationsOn: boolean): boolean {
  return attackerIsMine && animationsOn;
}

/** "Ali'nin cevabı bekleniyor" için neyin beklendiği */
export const WAIT_LABEL: Record<ResponseKind, string> = {
  counter: 'toprak seçimi',
  vote: 'oyu',
  permit: 'boğaz izni cevabı',
  offer: 'teklif cevabı',
  loan: 'borç cevabı',
  upkeep: 'bakım kararı',
};
