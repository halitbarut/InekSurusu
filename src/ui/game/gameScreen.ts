import { BOT_LEVEL_NAME, getBot, timeoutAction } from '../../bot';
import {
  RESOURCE_KEYS,
  BATTLE_USED,
  allAliveAllied,
  battleCost,
  battleCostText,
  battleCostProblem,
  upkeepDue,
  atPeace,
  battleUsed,
  openingPeaceActive,
  attackableTiles,
  battleKindAt,
  buildableTiles,
  capitalCandidates,
  claimableTiles,
  conquestCandidates,
  dispatch,
  expeditionTargets,
  getRelation,
  isAllied,
  planeBlockedTiles,
  playerStats,
  producibleTiles,
  readyUnits,
  startPickCandidates,
  straitPolicyFor,
  structureCost,
  unitsAt,
  validateAction,
  UndoHistory,
  ReplayRecorder,
  redactReplay,
  type ReplayData,
  type Action,
  type BuildableStructure,
  type GameEvent,
  type GameState,
  type Offer,
  type OfferItem,
  type ResourceKey,
  type UnitKind,
} from '../../engine';
import { append, clear, closeAllModals, download, h, openModal, sleep, toast, type Child } from '../dom';
import {
  RES_ICON,
  RES_NAME,
  STRUCT_ICON,
  STRUCT_NAME,
  UNIT_ICON,
  actionLabel,
  eventIcon,
  fmtNum,
  formatEvent,
  gen,
  offerItemText,
  offerText,
  pname,
  straitLabel,
  tileLabel,
} from '../format';
import { animFactor, getPrefs, setPrefs } from '../prefs';
import { autosave, exportReplay, exportState, saveGame } from '../storage';
import { ReplayScreen } from '../replay/replayScreen';
import type { ClientRoom } from '../../net/clientRoom';
import type { HostRoom } from '../../net/hostRoom';
import type { Presence } from '../../net/protocol';
import { MapView, type Highlight } from './mapView';
import { Spinner } from './spinner';
import { cowMark, icon, type IconName } from '../icons';
import { HATCH_NAME, playerHatch, playerSwatch } from '../playerStyle';
import { renderSummary } from './summary';
import { ChatPanel } from './chatPanel';
import { CLOCK_WARN_MS, TurnClock, clockSegment, clockText, type ClockSegment } from './turnClock';
import { play, playSpin, setMuted, soundControls } from '../sound';

type Mode =
  | { kind: 'none' }
  | { kind: 'claim' }
  | { kind: 'build'; structure: BuildableStructure }
  | { kind: 'produce' }
  | { kind: 'attack' }
  | { kind: 'expedition'; unit: UnitKind; unitId: number | null }
  | { kind: 'offerTiles'; side: 'give' | 'take'; draft: OfferDraft };

interface OfferDraft {
  to: number;
  alliance: boolean;
  peace: boolean;
  peaceRounds: number;
  give: Record<ResourceKey, number>;
  take: Record<ResourceKey, number>;
  giveTiles: Set<number>;
  takeTiles: Set<number>;
  giveStraits: Map<number, number>;
  takeStraits: Map<number, number>;
}

interface ActionInfo {
  id: string;
  icon: IconName;
  label: string;
  desc: string;
  /** Yapılamıyorsa nedeni */
  reason: string | null;
  active?: boolean;
  badge?: number;
  cls?: string;
  onClick(): void;
}

/** Çevrimiçi oyun: oda sahibi (hakem) ya da katılan/izleyici */
export type NetMode = { kind: 'host'; room: HostRoom; mySeat: number } | { kind: 'client'; room: ClientRoom } | null;

export interface GameScreenCallbacks {
  toMenu(): void;
  newGame(): void;
}

const zeroRes = (): Record<ResourceKey, number> => ({ akce: 0, gold: 0, oil: 0, iron: 0, steel: 0 });

export class GameScreen {
  state: GameState;
  private root: HTMLElement;
  private map: MapView;
  private mode: Mode = { kind: 'none' };
  private pumping = false;
  private busy = false;
  private destroyed = false;
  private lastHumanKey = '';
  private botActions = { turn: -1, count: 0 };
  private targetCache: { state: GameState; key: string; groups: Highlight['groups']; extra?: unknown } | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private lastError = '';
  /** Çevrimiçi: koltukların bağlantı durumu */
  private presence: Presence = {};
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  /** Sıradaki oyuncunun bu turdaki geri alınabilir eylemleri (oda sahibinde/yerelde tutulur) */
  private history = new UndoHistory();
  /** Aynı teklif/oylama için ikinci kez soru açılmasın */
  private prompted = new Set<string>();
  /** Çevrimiçi oyunda sohbet paneli (hot-seat ve bot oyunlarında yok) */
  private chat: ChatPanel | null = null;
  /** Tur saati: yerel oyunda ve oda sahibinde tutulur; katılan yalnızca oda sahibinin gönderdiğini gösterir */
  private clock: TurnClock | null = null;
  private clockEl = h('span', { class: 'turn-clock hidden', role: 'timer', 'aria-live': 'off' });
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickSecond = -1;
  /** Hot-seat: "Cihazı X'e verin" ekranı açık (saat durur) */
  private handoff = false;
  /** Hot-seat: teklifine yanıt beklenen oyuncunun kendi süresi */
  private responseSeg: ClockSegment | null = null;
  /** Oyun tekrarı kaydı: oyunu yürüten tarafta (yerel oyun, oda sahibi) */
  private recorder: ReplayRecorder | null = null;
  /** Açık tekrar oynatıcısı (zafer ekranından) */
  private replayView: { screen: ReplayScreen; layer: HTMLElement } | null = null;

  private elTop!: HTMLElement;
  private elPlayers!: HTMLElement;
  private elLog!: HTMLElement;
  /** Çevrimiçi: izleyici listesi */
  private elViewers = h('div', { class: 'viewer-list muted small' });
  private eliminatedShown = false;
  private elActions!: HTMLElement;
  private elBanner!: HTMLElement;
  private elTip!: HTMLElement;
  private elActionTip = h('div', { class: 'tooltip action-tip hidden', role: 'tooltip' });
  private elMapWrap!: HTMLElement;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    host: HTMLElement,
    state: GameState,
    private cb: GameScreenCallbacks,
    private net: NetMode = null,
    replay?: ReplayData,
  ) {
    this.state = state;
    // Kayıtla saklanmış tekrar varsa oradan sürer; yoksa şimdiden başlar (oyunun ortasıysa yarım kayıt)
    if (net?.kind !== 'client') this.recorder = replay ? ReplayRecorder.from(replay) : ReplayRecorder.start(state);
    if (net) this.chat = new ChatPanel(net.room, () => this.state);
    const turnSeconds = state.options?.turnSeconds ?? 0;
    if (turnSeconds > 0 && net?.kind !== 'client') this.clock = new TurnClock(turnSeconds * 1000);
    if (turnSeconds > 0 || net?.kind === 'client') this.clockTimer = setInterval(() => this.tickClock(), 250);
    this.bindNet();
    this.root = this.buildLayout();
    host.appendChild(this.root);
    this.map = new MapView(this.elMapWrap);
    this.map.onTileClick = (t) => void this.onTileClick(t);
    this.map.onHover = (t, x, y) => this.onHover(t, x, y);
    document.addEventListener('keydown', this.keyHandler);
    this.render();
    void this.pump();
  }

  destroy() {
    this.destroyed = true;
    this.replayView?.screen.destroy();
    this.replayView?.layer.remove();
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.connEl?.remove();
    if (this.net?.kind === 'host') this.net.room.close();
    else if (this.net?.kind === 'client') this.net.room.leave();
    document.removeEventListener('keydown', this.keyHandler);
    this.map.destroy();
    this.root.remove();
    document.querySelectorAll('.modal-backdrop, .overlay').forEach((e) => e.remove());
  }

  // ------------------------------------------------------------------
  // Yerleşim
  // ------------------------------------------------------------------

  private muteBtn = h('button', {
    class: 'btn btn-icon',
    onClick: () => {
      setMuted(!getPrefs().muted);
      this.updateMuteBtn();
    },
  });

  private updateMuteBtn() {
    const muted = getPrefs().muted;
    clear(this.muteBtn);
    this.muteBtn.append(icon(muted ? 'mute' : 'sound'));
    this.muteBtn.title = muted ? 'Sesi aç' : 'Sesi kapat';
    this.muteBtn.setAttribute('aria-pressed', String(muted));
  }

  private buildLayout(): HTMLElement {
    this.updateMuteBtn();
    this.elTop = h('div', { class: 'active-panel' });
    this.elPlayers = h('div', { class: 'player-list' });
    this.elLog = h('div', { class: 'log' });
    this.elActions = h('div', { class: 'action-bar' });
    this.elBanner = h('div', { class: 'banner hidden' });
    this.elTip = h('div', { class: 'tooltip hidden' });
    this.elMapWrap = h('div', { class: 'map-host' });
    const fast = h('input', {
      type: 'checkbox',
      checked: getPrefs().fastBots,
      onChange: (e: Event) => setPrefs({ fastBots: (e.target as HTMLInputElement).checked }),
    });
    return h(
      'div',
      { class: 'game-screen' },
      h(
        'header',
        { class: 'topbar' },
        h('button', { class: 'brand', title: 'Menü', 'aria-label': 'İnek Sürüsü — menü', onClick: () => this.openGameMenu() }, cowMark(34), h('span', { class: 'brand-text' }, 'İnek Sürüsü')),
        this.elTop,
        h(
          'div',
          { class: 'top-controls' },
          h('label', { class: 'fast-toggle', title: 'Botların hamlelerini animasyonsuz ve beklemeden oynat' }, fast, icon('hourglass'), h('span', { class: 'fast-label' }, 'Hızlı oynat')),
          this.chat?.toggleBtn,
          this.muteBtn,
          h('button', { class: 'btn btn-icon', title: 'Oyunu kaydet', 'aria-label': 'Oyunu kaydet', onClick: () => this.openSaveDialog() }, icon('save')),
          h('button', { class: 'btn btn-icon', title: 'Menü: kurallar, ayarlar, ana menü', 'aria-label': 'Menü', onClick: () => this.openGameMenu() }, icon('menu')),
        ),
      ),
      h(
        'main',
        { class: 'game-main' },
        h(
          'div',
          { class: 'map-wrap' },
          this.elMapWrap,
          this.elBanner,
          this.elTip,
          this.chat?.el,
          h(
            'div',
            { class: 'zoom-controls' },
            h('button', { class: 'btn btn-small', title: 'Yakınlaş', onClick: () => this.map.zoomBy(1.25) }, '+'),
            h('button', { class: 'btn btn-small', title: 'Uzaklaş', onClick: () => this.map.zoomBy(0.8) }, '−'),
            h('button', { class: 'btn btn-small', title: 'Haritayı sığdır', onClick: () => this.map.fit() }, '⤢'),
          ),
        ),
        h(
          'aside',
          { class: 'sidebar' },
          h('section', {}, h('h3', {}, 'Devletler'), this.elPlayers),
          this.net ? h('section', { class: 'viewers-section' }, this.elViewers) : null,
          h('section', { class: 'log-section' }, h('h3', {}, 'Olay günlüğü'), this.elLog),
        ),
      ),
      h('footer', {}, this.elActions),
      this.elActionTip,
    );
  }

  // ------------------------------------------------------------------
  // Akış: botlar, sıra geçişleri, oylamalar
  // ------------------------------------------------------------------

  private humanCount(): number {
    return this.state.players.filter((p) => p.alive && p.kind === 'human').length;
  }

  /** Şu an karar verecek oyuncu: karşı saldırıda toprak seçen savunan, aksi halde sıradaki oyuncu. */
  private actor(): number {
    const ph = this.state.phase;
    return ph.kind === 'conquest' ? ph.taker : this.state.currentPlayer;
  }

  /** Bu cihazdan oynanan koltuk mu? Yerel oyunda tüm insanlar, çevrimiçide yalnızca kendi koltuğu. */
  private mine(p: number): boolean {
    const net = this.net;
    if (!net) return this.state.players[p]?.kind === 'human';
    return net.kind === 'host' ? p === net.mySeat : p === net.room.seat;
  }

  /** Bu cihazdaki oyuncu şu an karar verebilir mi? */
  private isHumanTurn(): boolean {
    const s = this.state;
    const a = this.actor();
    return s.phase.kind !== 'gameover' && s.phase.kind !== 'vote' && s.players[a].kind === 'human' && this.mine(a);
  }

  private botDelay(): number {
    return getPrefs().fastBots ? 25 : 420;
  }

  /** Tüm durum değişiklikleri sırayla uygulanır (yerel, bot ve uzaktan gelen hamleler karışmasın). */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.then(
      () => undefined,
      (e) => console.error(e),
    );
    return run;
  }

  private async pump() {
    if (this.pumping || this.destroyed) return;
    if (this.net?.kind === 'client') {
      this.clientFollowUp();
      return;
    }
    this.pumping = true;
    try {
      for (;;) {
        if (this.destroyed) return;
        const s = this.state;
        if (s.phase.kind === 'gameover') {
          this.render();
          this.showVictory();
          return;
        }
        if (s.phase.kind === 'vote') {
          const ph = s.phase;
          const voter = s.players.find((p) => p.alive && !(p.id in ph.votes));
          if (!voter) return;
          if (voter.kind === 'bot') {
            await sleep(this.botDelay());
            await this.enqueue(() => this.commit({ type: 'CAST_VOTE', player: voter.id, accept: getBot(voter.botLevel).vote(s, voter.id) }, true));
          } else if (this.mine(voter.id)) {
            if (!this.net && this.humanCount() > 1) await this.passDevice(voter.id, `${pname(s, ph.proposer)} oyunu ittifakla bitirmeyi önerdi. Oyunu ver.`);
            const accept = await this.askVote(voter.id);
            // Süre dolduysa oy otomatik verilir: o işin bitmesini bekle
            if (accept !== null) await this.enqueue(() => this.commit({ type: 'CAST_VOTE', player: voter.id, accept }));
            else await this.chain;
          } else {
            // Uzaktaki oyuncunun oyu bekleniyor
            this.render();
            return;
          }
          continue;
        }
        const cur = s.players[this.actor()];
        if (cur.kind === 'bot') {
          this.render();
          await sleep(this.botDelay());
          if (this.destroyed) return;
          if (this.state.players[cur.id].kind !== 'bot') continue; // bu arada oyuncu geri döndü
          if (this.botActions.turn !== this.state.turnCounter) this.botActions = { turn: this.state.turnCounter, count: 0 };
          let action = getBot(cur.botLevel).chooseAction(this.state, cur.id);
          // Güvenlik: bot aynı turda çok uzun oynarsa turu bitir
          if (++this.botActions.count > 300 && this.state.phase.kind === 'actions') action = { type: 'END_TURN', player: cur.id };
          const ok = await this.enqueue(() => this.commit(action, true));
          if (!ok) {
            const fallback: Action = { type: this.state.phase.kind === 'conquest' ? 'END_CONQUEST' : 'END_TURN', player: cur.id };
            await this.enqueue(() => this.commit(fallback, true));
          }
          continue;
        }
        if (!this.mine(cur.id)) {
          // Çevrimiçi: uzaktaki oyuncunun hamlesi bekleniyor
          this.render();
          return;
        }
        // İnsan sırası
        const setup = s.phase.kind === 'setup_capital' || s.phase.kind === 'setup_territory';
        const counter = s.phase.kind === 'conquest' && s.phase.counter;
        const key = `${setup ? s.phase.kind : counter ? 'counter' : 'turn'}-${cur.id}-${s.turnCounter}`;
        if (key !== this.lastHumanKey) {
          const wasCounter = this.lastHumanKey.startsWith('counter-') && this.lastHumanKey.endsWith(`-${s.turnCounter}`);
          const prevActor = Number(this.lastHumanKey.split('-')[1]);
          this.lastHumanKey = key;
          this.mode = { kind: 'none' };
          this.render();
          // Karşı saldırıda cihaz savunana, sonra saldırana geçer (bu geçişler ayardan bağımsız gösterilir)
          const handoff = (counter || wasCounter) && prevActor !== cur.id;
          if (!this.net && this.humanCount() > 1 && (handoff || getPrefs().passScreen)) {
            if (counter) await this.passDevice(cur.id, 'Karşı saldırıyı kazandın! Saldırandan alacağın toprakları seç.');
            else if (wasCounter) await this.passDevice(cur.id, 'Karşı saldırı seçimi bitti, sıra yine sende.');
            else await this.passDevice(cur.id, 'Sıra sende!', true);
          }
          this.turnNotice(cur.id, counter);
        }
        this.render();
        return;
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Sıradaki oyuncunun geri alabileceği eylem sayısı */
  private undoCount(s: GameState): number {
    return this.history.canUndo(s, s.currentPlayer) ? this.history.size() : 0;
  }

  /** Bu cihazdaki oyuncu şu an geri alabilir mi? */
  private canUndoNow(): boolean {
    if (!this.isHumanTurn() || this.busy) return false;
    if (this.net?.kind === 'client') return this.net.room.undoCount > 0 && this.state.currentPlayer === this.actor();
    return this.history.canUndo(this.state, this.actor());
  }

  /** Son eylemi geri alır (Ctrl+Z). Çevrimiçi katılımcıda oda sahibinden istenir. */
  async undoLast() {
    if (!this.canUndoNow()) return;
    const net = this.net;
    if (net?.kind === 'client') {
      this.busy = true;
      try {
        const r = await net.room.sendUndo();
        if (!r.ok) toast(r.reason, 'error');
        await this.chain;
      } finally {
        this.busy = false;
      }
      this.render();
      return;
    }
    await this.enqueue(async () => this.applyUndo());
  }

  /** Geçmişteki son durumu geri yükler; oda sahibiyse herkese yayınlar. */
  private applyUndo(origin?: { clientId: string; reqId: number }) {
    const entry = this.history.undo();
    if (!entry) return;
    this.recorder?.pop();
    this.state = entry.state;
    this.targetCache = null;
    if (this.mode.kind === 'offerTiles') this.mode = { kind: 'none' };
    if (this.net?.kind === 'host') this.net.room.broadcastUpdate(this.state, [], origin, this.undoCount(this.state));
    play('undo');
    toast(`↶ Geri alındı: ${actionLabel(this.state, entry.action)}`, 'info', 2200);
    this.render();
  }

  private turnNotice(p: number, counter: boolean) {
    if (this.net) toast(counter ? 'Karşı saldırıyı kazandın! Alacağın toprakları seç.' : 'Sıra sende!', 'good', 3000);
    const incoming = this.state.offers.filter((o) => o.to === p).length;
    if (incoming > 0) toast(`${incoming} bekleyen teklifin var (Diplomasi)`, 'info', 4000);
  }

  /** İnsan eylemi: doğrula, uygula (ya da oda sahibine gönder), animasyonları oynat, akışı sürdür. */
  async act(action: Action): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    let ok = false;
    try {
      const net = this.net;
      if (net?.kind === 'client') {
        const v = validateAction(this.state, action);
        if (!v.ok) toast(v.reason, 'error');
        else {
          const r = await net.room.sendAction(action);
          if (!r.ok) toast(r.reason, 'error');
          ok = r.ok;
          // Sonucun animasyonu bitene kadar bekle
          await this.chain;
        }
      } else ok = await this.enqueue(() => this.commit(action));
    } finally {
      this.busy = false;
    }
    this.render();
    void this.pump();
    return ok;
  }

  /** Durumu uygular. Oda sahibiyse sonucu herkese yayınlar. Hata varsa nedenini lastError'a yazar. */
  private async commit(action: Action, byBot = false, origin?: { clientId: string; reqId: number }): Promise<boolean> {
    const v = validateAction(this.state, action);
    if (!v.ok) {
      this.lastError = v.reason;
      if (!byBot && !origin) toast(v.reason, 'error');
      return false;
    }
    const r = dispatch(this.state, action);
    this.recorder?.record(action);
    // Botlar geri almayı kullanmaz; diğer eylemler geri alınabilir mi kendisi karar verir
    if (byBot) this.history.clear();
    else this.history.record(this.state, action, r.state);
    if (this.net?.kind === 'host') this.net.room.broadcastUpdate(r.state, r.events, origin, this.undoCount(r.state));
    // Animasyonlar (topaç, savaş, sefer) eski durum üzerinde oynar, sonuç sonra görünür
    await this.animate(r.events, byBot, r.state);
    this.state = r.state;
    this.targetCache = null;
    this.render();
    for (const e of r.events) {
      if (e.type !== 'offer_made') continue;
      if (this.mine(e.offer.to) && this.state.players[e.offer.to].kind === 'human') play('offer');
      await this.routeOffer(e.offer);
    }
    if (action.type === 'END_TURN' || r.events.some((e) => e.type === 'game_over')) this.autosave();
    return true;
  }

  private async animate(events: GameEvent[], byBot: boolean, s: GameState) {
    const isHuman = (p: number) => s.players[p].kind === 'human';
    const mine = (p: number) => this.mine(p);
    for (const e of events) {
      if (this.destroyed) return;
      switch (e.type) {
        case 'spin': {
          const f = animFactor(!isHuman(e.player));
          playSpin(1500 * f, !isHuman(e.player));
          if (f > 0) await this.showSpin(e.player, e.value, f);
          break;
        }
        case 'battle': {
          const human = isHuman(e.attacker) || isHuman(e.defender);
          const f = animFactor(!human);
          if (f > 0) play('battleStart', !human);
          if (f > 0) await this.showBattle(e, f, (mine(e.attacker) || mine(e.defender)) && f >= 1);
          // Kazanma/kaybetme bu cihazdaki oyuncunun gözünden; izlerken saldıranınkinden
          const me = mine(e.defender) && !mine(e.attacker) ? e.defender : e.attacker;
          const attackerWon = e.kind === 'land' ? e.gain > 0 : e.success;
          const defenderWon = e.kind === 'land' ? e.loss > 0 : !e.success;
          const won = me === e.attacker ? attackerWon : defenderWon;
          const lost = me === e.attacker ? defenderWon : attackerWon;
          if (!(e.kind === 'capital' && e.success)) {
            if (won) play('win', !human);
            else if (lost) play('lose', !human);
          }
          break;
        }
        case 'build':
          play('build', !isHuman(e.player));
          break;
        case 'produce':
          play('produce', !isHuman(e.player));
          break;
        case 'turn_start':
          if (isHuman(e.player)) play('turn', !mine(e.player));
          break;
        case 'expedition': {
          const f = animFactor(byBot);
          if (f > 0) await this.map.animatePath(e.from, e.path, UNIT_ICON[e.unit], 45 * f);
          break;
        }
        case 'claim':
        case 'conquer':
        case 'base_captured':
          if (e.type === 'claim') play('claim', !isHuman(e.player));
          this.map.flash([e.tile], s.players[e.player].color);
          break;
        case 'eliminated':
          play('capitalFall');
          toast(formatEvent(s, e) ?? '', 'error', 4500);
          break;
        case 'offer_response':
          if (mine(e.from) && (this.net || !isHuman(e.to))) toast(formatEvent(s, e) ?? '', e.accepted ? 'good' : 'info', 3500);
          break;
        case 'alliance_formed':
        case 'peace_made':
          if (mine(e.a) || mine(e.b)) toast(formatEvent(s, e) ?? '', 'good', 3500);
          break;
        case 'income':
          if (mine(e.player) && !getPrefs().fastBots) toast(formatEvent(s, e) ?? '', 'info', 2500);
          break;
      }
    }
  }

  /** Yeni teklifi alıcıya yönlendirir (bot hemen yanıtlar, insan için cihaz el değiştirir). */
  private async routeOffer(offer: Offer) {
    const s = this.state;
    const to = s.players[offer.to];
    const from = s.players[offer.from];
    if (!s.offers.some((o) => o.id === offer.id)) return;
    if (to.kind === 'bot') {
      await sleep(Math.min(300, this.botDelay()));
      const accept = getBot(to.botLevel).evaluateOffer(s, to.id, offer);
      await this.commit({ type: 'RESPOND_OFFER', player: to.id, offerId: offer.id, accept }, true);
      return;
    }
    if (this.net) {
      // Çevrimiçi: teklif alıcının kendi ekranında sorulur (oyunu bekletmeden)
      if (this.mine(offer.to)) void this.promptOffer(offer);
      return;
    }
    if (from.kind === 'human') {
      await this.passDevice(to.id, `${from.name} sana bir teklif gönderdi.`);
      // Yanıt bekleyen oyuncunun kendi süresi işler, teklif edenin süresi durur
      this.responseSeg = { key: `offer-${offer.id}`, players: [to.id] };
      this.syncClock();
      const answer = await this.askOffer(offer, true);
      this.responseSeg = null;
      this.syncClock();
      if (answer !== 'later') await this.commit({ type: 'RESPOND_OFFER', player: to.id, offerId: offer.id, accept: answer === 'accept' });
      await this.passDevice(from.id, answer === 'later' ? `${to.name} teklifi sonra yanıtlayacak (Diplomasi'de bekliyor). Sıra yine sende.` : 'Teklif yanıtlandı, sıra yine sende.');
    }
    // Bot → insan teklifleri insanın sırasında yanıtlanır
  }

  /** Çevrimiçi: gelen teklifi sorar; "Sonra" denirse Diplomasi panelinden yanıtlanabilir. */
  private async promptOffer(offer: Offer) {
    if (this.prompted.has(`offer-${offer.id}`)) return;
    this.prompted.add(`offer-${offer.id}`);
    const answer = await this.askOffer(offer, true);
    if (answer === 'later' || this.destroyed) return;
    if (!this.state.offers.some((o) => o.id === offer.id)) return;
    await this.act({ type: 'RESPOND_OFFER', player: offer.to, offerId: offer.id, accept: answer === 'accept' });
  }

  // ------------------------------------------------------------------
  // Çevrimiçi
  // ------------------------------------------------------------------

  private bindNet() {
    const net = this.net;
    if (!net) return;
    if (net.kind === 'host') {
      const room = net.room;
      this.presence = room.getPresence();
      room.events.onAction = (_seat, action, origin) => {
        void this.enqueue(async () => {
          const ok = await this.commit(action, false, origin);
          if (!ok) room.reject(origin, this.lastError);
        }).then(() => this.pump());
      };
      room.events.onTakeover = (seat, toBot) => {
        void this.enqueue(async () => {
          const st = structuredClone(this.state);
          st.players[seat].kind = toBot ? 'bot' : 'human';
          this.state = st;
          this.recorder?.record({ type: 'SET_PLAYER_KIND', player: seat, kind: st.players[seat].kind });
          this.history.clear();
          room.broadcastUpdate(st, []);
          this.render();
        }).then(() => this.pump());
      };
      room.events.onUndo = (seat, origin) => {
        void this.enqueue(async () => {
          if (!this.history.canUndo(this.state, seat)) room.reject(origin, 'Geri alınacak eylem yok');
          else this.applyUndo(origin);
        });
      };
      room.events.onPresence = (p) => {
        this.presence = { ...p };
        this.render();
      };
      room.events.onNotice = (text) => toast(text, 'info', 4000);
      room.events.onChat = (m) => this.chat?.onMessage(m);
      room.events.onViewers = () => this.renderViewers();
    } else {
      const room = net.room;
      room.events.onReplay = () => this.updateReplayButtons();
      room.events.onUpdate = (state, events) => {
        void this.enqueue(async () => {
          const byBot = state.players[this.actorOf(state)]?.kind === 'bot';
          await this.animate(events, byBot, state);
          this.state = state;
          this.targetCache = null;
          this.render();
          for (const e of events) {
            if (e.type !== 'offer_made' || !this.mine(e.offer.to)) continue;
            play('offer');
            void this.promptOffer(e.offer);
          }
        }).then(() => this.clientFollowUp());
      };
      room.events.onGameState = (state, _seat, presence) => {
        // Yeniden bağlanınca güncel durum
        void this.enqueue(async () => {
          this.state = state;
          this.presence = presence;
          this.targetCache = null;
          this.render();
        }).then(() => this.clientFollowUp());
      };
      room.events.onPresence = (p) => {
        this.presence = p;
        this.render();
      };
      room.events.onNotice = (text) => toast(text, 'info', 4000);
      room.events.onStatus = (status, reason) => this.showConnection(status, reason);
      room.events.onChat = (m) => this.chat?.onMessage(m);
      room.events.onClock = () => this.drawClock();
      room.events.onViewers = () => this.renderViewers();
      room.events.onTimeout = (players) => {
        if (room.seat !== null && players.includes(room.seat)) this.timedOutHere();
        else toast(`Süre doldu: ${players.map((p) => pname(this.state, p)).join(', ')}`, 'info', 3000);
      };
    }
    // Geri sayım için bağlantı durumunu saniyede bir tazele
    this.presenceTimer = setInterval(() => {
      if (Object.values(this.presence).some((p) => p.status === 'away')) this.render();
    }, 1000);
  }

  private actorOf(s: GameState): number {
    return s.phase.kind === 'conquest' ? s.phase.taker : s.currentPlayer;
  }

  /** Katılan tarafında: sıra bana geldiyse bildir, oylama bende ise sor, oyun bittiyse göster. */
  private clientFollowUp() {
    if (this.destroyed) return;
    const s = this.state;
    if (s.phase.kind === 'gameover') {
      this.showVictory();
      return;
    }
    if (s.phase.kind === 'vote') {
      const ph = s.phase;
      const me = this.net?.kind === 'client' ? this.net.room.seat : null;
      const key = `vote-${s.turnCounter}-${ph.proposer}`;
      if (me !== null && s.players[me]?.alive && !(me in ph.votes) && !this.prompted.has(key)) {
        this.prompted.add(key);
        void this.askVote(me).then((accept) => accept !== null && this.act({ type: 'CAST_VOTE', player: me, accept }));
      }
      return;
    }
    const a = this.actor();
    const counter = s.phase.kind === 'conquest' && s.phase.counter;
    const key = `${counter ? 'counter' : s.phase.kind}-${a}-${s.turnCounter}`;
    if (this.isHumanTurn() && key !== this.lastHumanKey && (s.phase.kind === 'spin' || counter || s.phase.kind.startsWith('setup'))) {
      this.lastHumanKey = key;
      this.mode = { kind: 'none' };
      this.turnNotice(a, counter);
      this.render();
    }
  }

  private connEl: HTMLElement | null = null;
  private showConnection(status: string, reason?: string) {
    this.connEl?.remove();
    this.connEl = null;
    if (status === 'reconnecting') {
      this.connEl = h('div', { class: 'conn-banner', role: 'alert' }, icon('signal'), ' Oda sahibiyle bağlantı koptu, yeniden bağlanılıyor…');
      document.body.appendChild(this.connEl);
    } else if (status === 'closed' && !this.destroyed) {
      const m = openModal({
        title: 'Bağlantı kapandı',
        icon: 'signal',
        body: h('p', {}, reason ?? 'Oda kapandı.'),
        buttons: [{ label: 'Ana menü', value: 'menu', primary: true }],
        closable: false,
      });
      void m.result.then(() => this.cb.toMenu());
    }
  }

  // ------------------------------------------------------------------
  // Tur süresi
  // ------------------------------------------------------------------

  /** Saati durumla eşitler (yalnızca saati tutan tarafta): kimin süresi işliyor, değiştiyse yayınla */
  private syncClock() {
    const clock = this.clock;
    if (!clock || this.destroyed) return;
    const seg = this.handoff ? null : (this.responseSeg ?? clockSegment(this.state, (p) => this.state.players[p]?.kind === 'human'));
    if (!clock.set(seg)) return;
    if (this.net?.kind === 'host') this.net.room.sendClock(clock.info());
    this.drawClock();
  }

  private tickClock() {
    if (this.destroyed) return;
    const expired = this.clock?.poll();
    if (expired) void this.onTimeout(expired);
    this.drawClock();
  }

  /** Üst çubuktaki kalan süre */
  private drawClock() {
    const info = this.clock?.info();
    let shown = info ? { players: info.players, deadline: Date.now() + info.remainingMs } : null;
    if (this.net?.kind === 'client') {
      const c = this.net.room.lastClock;
      shown = c ? { players: c.players, deadline: c.receivedAt + c.remainingMs } : null;
    }
    const el = this.clockEl;
    if (!shown || this.state.phase.kind === 'gameover') {
      el.classList.add('hidden');
      return;
    }
    const left = Math.max(0, shown.deadline - Date.now());
    const warn = left <= CLOCK_WARN_MS;
    const who = shown.players.length === 1 && shown.players[0] === this.actor() && this.state.phase.kind !== 'vote' ? '' : `${shown.players.map((p) => pname(this.state, p)).join(', ')} · `;
    clear(el);
    el.append(icon('clock'), `${who}${clockText(left)}`);
    el.classList.remove('hidden');
    el.classList.toggle('warn', warn);
    el.title = `Tur süresi: ${who ? who.slice(0, -3) : 'kalan'} ${clockText(left)}. Süre dolunca topaç kendiliğinden çevrilir, bekleyen seçimler otomatik yapılır ve tur biter.`;
    // Son 15 saniyede, süresi işleyen bu cihazdaki oyuncuysa her saniye tık
    const sec = Math.ceil(left / 1000);
    if (warn && left > 0 && sec !== this.lastTickSecond && shown.players.some((p) => this.mine(p))) {
      this.lastTickSecond = sec;
      play('tick');
      if (sec === Math.ceil(CLOCK_WARN_MS / 1000)) toast('Son 15 saniye!', 'error', 2000);
    }
  }

  /** Bu cihazdaki oyuncunun süresi doldu: açık pencereleri ve seçili eylemi kapat */
  private timedOutHere() {
    closeAllModals('timeout');
    this.mode = { kind: 'none' };
    play('timeUp');
    toast('Süren doldu: bekleyen seçimler otomatik yapıldı.', 'error', 4000);
    this.render();
  }

  /** Süre doldu (saati tutan tarafta): topaç, zorunlu seçimler ve tur sonu otomatik */
  private async onTimeout(seg: ClockSegment) {
    const names = seg.players.map((p) => pname(this.state, p)).join(', ');
    if (this.net?.kind === 'host') this.net.room.sendTimeout(seg.players);
    if (seg.players.some((p) => this.mine(p))) this.timedOutHere();
    else toast(`Süre doldu: ${names}`, 'info', 3000);
    // Hot-seat teklif yanıtı: pencere kapandı, teklif beklemede kalır; başka işlem yok
    await this.enqueue(async () => {
      for (const p of seg.players) {
        for (let guard = 0; guard < 300; guard++) {
          const a = timeoutAction(this.state, p);
          if (!a || !(await this.commit(a, true))) break;
        }
      }
    });
    this.render();
    void this.pump();
  }

  // ------------------------------------------------------------------
  // Katmanlar: topaç, savaş, cihaz geçişi, oylama, zafer
  // ------------------------------------------------------------------

  private overlay(...children: Child[]): HTMLElement {
    const el = h('div', { class: 'overlay' }, h('div', { class: 'overlay-card' }, children));
    document.body.appendChild(el);
    return el;
  }

  private async showSpin(p: number, value: number, f: number) {
    const pl = this.state.players[p];
    const spinner = new Spinner(200, pl.color);
    const result = h('div', { class: 'spin-result' }, ' ');
    const el = this.overlay(h('div', { class: 'overlay-title' }, h('span', { class: 'dot', style: { background: pl.color } }), `${pl.name} topacı çeviriyor…`), spinner.el, result);
    await spinner.spinTo(value, 1500 * f);
    result.textContent = `${value}!  +${fmtNum(value * this.state.config.spinMultiplier)} akçe`;
    result.classList.add('pop');
    await sleep(900 * f);
    el.remove();
  }

  private async showBattle(e: Extract<GameEvent, { type: 'battle' }>, f: number, needClick: boolean) {
    const s = this.state;
    const A = s.players[e.attacker];
    const D = s.players[e.defender];
    const sa = new Spinner(150, A.color);
    const sd = new Spinner(150, D.color);
    const title = e.kind === 'land' ? 'Kara savaşı' : e.kind === 'capital' ? 'Başkent savaşı' : 'Askeri üs savaşı';
    const titleIcon: IconName = e.kind === 'land' ? 'attack' : e.kind === 'capital' ? 'capital' : 'base';
    const via = e.via === 'ship' ? ' · gemiyle' : e.via === 'plane' ? ' · uçakla' : '';
    const score = h('div', { class: 'battle-score' }, '–');
    const streak = h('div', { class: 'streak' });
    const status = h('div', { class: 'battle-status' }, ' ');
    const drawStreak = (wins: number) => {
      clear(streak);
      if (e.streakNeeded <= 1) return;
      streak.appendChild(h('span', {}, 'Seri: '));
      for (let k = 0; k < e.streakNeeded; k++) streak.appendChild(h('span', { class: `streak-dot ${k < wins ? 'on' : ''}` }, k < wins ? '●' : '○'));
      streak.appendChild(h('span', {}, ` (${e.streakNeeded} art arda gerekli)`));
    };
    drawStreak(0);
    const btn = h('button', { class: 'btn btn-primary hidden' }, 'Tamam');
    const el = this.overlay(
      h('div', { class: 'overlay-title' }, icon(titleIcon), `${title}${via}`),
      h(
        'div',
        { class: 'battle' },
        h('div', { class: 'battle-side' }, h('div', { class: 'battle-name', style: { color: A.color } }, `${A.name} (saldıran)`), sa.el),
        h('div', { class: 'battle-mid' }, score),
        h('div', { class: 'battle-side' }, h('div', { class: 'battle-name', style: { color: D.color } }, `${D.name} (savunan)`), sd.el),
      ),
      streak,
      status,
      btn,
    );
    let wins = 0;
    for (let k = 0; k < e.rounds.length; k++) {
      const r = e.rounds[k];
      const ms = (k === 0 ? 1300 : 850) * f;
      score.textContent = '…';
      await Promise.all([sa.spinTo(r.a, ms), sd.spinTo(r.d, ms)]);
      score.textContent = `${r.a} – ${r.d}`;
      if (r.a > r.d) wins++;
      drawStreak(wins);
      status.textContent = r.a === r.d ? 'Eşitlik! Atış tekrarlanıyor.' : r.a > r.d ? 'Saldıran yüksek attı' : 'Savunan yüksek attı';
      await sleep(450 * f);
    }
    status.textContent =
      e.kind === 'land'
        ? e.gain > 0
          ? `${A.name} ${e.gain} toprak alacak!`
          : e.loss > 0
            ? `Karşı saldırı! ${D.name} ${e.loss} toprak alacak.`
            : 'Saldırı sonuçsuz kaldı.'
        : e.success
          ? e.kind === 'capital'
            ? `${gen(D.name)} başkenti düştü!`
            : 'Askeri üs ele geçirildi!'
          : 'Saldırı başarısız!';
    status.classList.add('final', e.success ? 'good' : e.loss > 0 || e.kind !== 'land' ? 'bad' : 'neutral');
    if (needClick) {
      btn.classList.remove('hidden');
      btn.focus();
      await new Promise<void>((r) => {
        btn.addEventListener('click', () => r(), { once: true });
        el.addEventListener('click', (ev) => ev.target === el && r());
      });
    } else await sleep(1000 * f);
    el.remove();
  }

  /** Hot-seat: cihazı başka oyuncuya verme ekranı. isTurn=false ise sıra değişmez (teklif, oylama). */
  private passDevice(p: number, message: string, isTurn = false): Promise<void> {
    const pl = this.state.players[p];
    this.handoff = true;
    this.syncClock();
    return new Promise((resolve) => {
      const btn = h('button', { class: 'btn btn-primary btn-big' }, 'Hazırım');
      const el = h(
        'div',
        { class: 'overlay pass-screen' },
        h(
          'div',
          { class: 'overlay-card', style: { borderTopColor: pl.color } },
          h('div', { class: 'pass-hand' }, playerSwatch(pl.color, pl.id, 64), icon('phone')),
          h('h1', {}, isTurn ? `Sıra: ${pl.name}` : pl.name),
          h('p', {}, `Cihazı ${pl.name} oyuncusuna verin.`),
          h('p', { class: 'muted' }, message),
          btn,
        ),
      );
      btn.addEventListener('click', () => {
        el.remove();
        this.handoff = false;
        this.syncClock();
        resolve();
      });
      document.body.appendChild(el);
      btn.focus();
    });
  }

  /** Oy sorar; süre dolup pencere kapandıysa null */
  private async askVote(p: number): Promise<boolean | null> {
    const s = this.state;
    const ph = s.phase;
    const proposer = ph.kind === 'vote' ? pname(s, ph.proposer) : '?';
    const m = openModal({
      title: `Oylama — ${pname(s, p)}`,
      icon: 'vote',
      body: h(
        'div',
        {},
        h('p', {}, `${proposer} oyunu ittifakla bitirmeyi önerdi.`),
        h('p', {}, `Kalan devletler: ${s.players.filter((x) => x.alive).map((x) => x.name).join(', ')}. Oybirliği gerekir.`),
      ),
      buttons: [
        { label: 'Hayır, devam', value: 'no' },
        { label: 'Evet, birlikte kazanalım', value: 'yes', primary: true },
      ],
      closable: false,
    });
    const v = await m.result;
    return v === 'timeout' ? null : v === 'yes';
  }

  private async askOffer(offer: Offer, allowLater: boolean): Promise<'accept' | 'reject' | 'later'> {
    const s = this.state;
    const m = openModal({
      title: `${gen(pname(s, offer.from))} teklifi`,
      icon: 'diplomacy',
      body: h(
        'div',
        {},
        h('p', {}, `${pname(s, offer.to)}, sana şu teklif yapıldı:`),
        h('ul', { class: 'offer-items' }, offer.items.map((it) => h('li', {}, offerItemText(s, offer, it)))),
      ),
      buttons: [
        ...(allowLater ? [{ label: 'Sonra yanıtla', value: 'later' }] : []),
        { label: 'Reddet', value: 'reject', danger: true },
        { label: 'Kabul et', value: 'accept', primary: true },
      ],
      closable: false,
    });
    const v = await m.result;
    // Süre dolarsa teklif bekleyen tekliflerde kalır
    return v === 'timeout' ? 'later' : (v as 'accept' | 'reject' | 'later');
  }

  private victoryShown = false;
  private replayButtons: HTMLButtonElement[] = [];

  /** Otomatik kayıt (tekrar kaydıyla birlikte; katılan kaydetmez) */
  private autosave() {
    if (this.net?.kind === 'client') return;
    autosave(this.state, this.recorder?.data());
  }

  /** Bu cihazın görebileceği tekrar kaydı: oyunu yürüten tarafta tam kayıt, katılanda oda sahibinin paylaştığı */
  private replayData(): ReplayData | null {
    if (this.net?.kind === 'client') return this.net.room.replay;
    return this.recorder?.data() ?? null;
  }

  private updateReplayButtons() {
    const ok = this.replayData() !== null;
    for (const b of this.replayButtons) {
      b.disabled = !ok;
      b.title = ok ? '' : 'Tekrar kaydı oda sahibinden bekleniyor…';
    }
  }

  /** Tekrar oynatıcısını oyunun üstünde açar (çevrimiçi oda kapanmaz) */
  private openReplay(round?: number) {
    const data = this.replayData();
    if (!data || this.replayView) return;
    const layer = h('div', { class: 'replay-layer' });
    document.body.appendChild(layer);
    // Yerel oyunda her şey görünür; çevrimiçide günlükteki teklif satırları kendi koltuğunun gözünden
    const viewer = this.net ? this.mySeat() : 'all';
    const screen = new ReplayScreen(layer, {
      data,
      viewer,
      startRound: round,
      onClose: () => {
        layer.remove();
        this.replayView = null;
      },
    });
    this.replayView = { screen, layer };
  }

  private showVictory() {
    if (this.victoryShown) return;
    this.victoryShown = true;
    const s = this.state;
    const winners = s.winners ?? [];
    // Çevrimiçi oda sahibi: paylaşılan kopyayı (kabul edilmemiş teklif içerikleri çıkarılmış) herkese gönder
    if (this.net?.kind === 'host' && this.recorder) this.net.room.sendReplay(redactReplay(this.recorder.data()));
    const watch = h('button', { class: 'btn btn-primary', onClick: () => this.openReplay() }, icon('replay'), 'Oyunu baştan izle');
    const save = h(
      'button',
      {
        class: 'btn',
        onClick: () => {
          const d = this.replayData();
          if (d) download(`inek-surusu-tekrar-${s.map.name ? s.map.name.replace(/\s+/g, '-') : s.map.seed}.json`, exportReplay(d));
        },
      },
      icon('download'),
      'Replay indir',
    );
    this.replayButtons = [watch, save];
    this.updateReplayButtons();
    const el = this.overlay(
      h('div', { class: 'trophy' }, icon('trophy')),
      h('h1', {}, winners.length > 1 ? 'İttifak kazandı!' : `${pname(s, winners[0])} kazandı!`),
      h('p', {}, winners.length > 1 ? winners.map((w) => pname(s, w)).join(', ') : 'Dünyada tek bir devlet kaldı.'),
      h('p', { class: 'muted' }, `${s.round} tur sürdü · ${s.map.name ? `Harita: ${s.map.name}` : `Seed ${s.map.seed}`}`),
      renderSummary(s, (round) => this.openReplay(round)),
      h('div', { class: 'row-buttons' }, watch, save),
      h(
        'div',
        { class: 'row-buttons' },
        h('button', { class: 'btn', onClick: () => el.remove() }, 'Haritayı incele'),
        this.net?.kind === 'client' ? null : h('button', { class: 'btn', onClick: () => this.cb.newGame() }, 'Yeni oyun'),
        h('button', { class: 'btn btn-primary', onClick: () => this.cb.toMenu() }, 'Ana menü'),
      ),
    );
    el.classList.add('victory');
  }

  // ------------------------------------------------------------------
  // Çizim
  // ------------------------------------------------------------------

  render() {
    if (this.destroyed) return;
    this.renderTop();
    this.renderPlayers();
    this.renderLog();
    this.renderActions();
    this.renderTargets();
    this.map.setState(this.state);
    this.chat?.render();
    this.syncClock();
    this.renderViewers();
    this.checkEliminated();
  }

  /** Bu cihazın çevrimiçi koltuğu (izleyicide null) */
  private mySeat(): number | null {
    const net = this.net;
    return !net ? null : net.kind === 'host' ? net.mySeat : net.room.seat;
  }

  /** Çevrimiçi: bu cihaz izleyici mi (oturmamış ya da elenmiş)? */
  private spectating(): boolean {
    if (!this.net) return false;
    const seat = this.mySeat();
    return seat === null || !this.state.players[seat]?.alive;
  }

  private lastViewersSig = '';
  private renderViewers() {
    const net = this.net;
    if (!net) return;
    // Oda sahibinde: elenen oyuncu izleyiciye dönüşür, liste değiştiyse herkese yayınlanır
    if (net.kind === 'host') net.room.refreshViewers();
    const list = net.kind === 'host' ? net.room.viewers() : net.room.viewers;
    const sig = JSON.stringify(list);
    if (sig === this.lastViewersSig) return;
    this.lastViewersSig = sig;
    clear(this.elViewers);
    this.elViewers.append(
      h('div', { class: 'viewers-head' }, icon('eye'), ` İzleyiciler (${list.length})`),
      list.length
        ? h('div', {}, list.map((v, i) => [i ? ', ' : '', h('span', {}, v.name), v.seat !== null ? h('span', { class: 'muted' }, ' (elendi)') : null]))
        : h('div', {}, 'Şu an izleyen yok.'),
    );
  }

  /** Çevrimiçi: bu cihazın oyuncusu elendiyse bir kez bildir; oyundan çıkmadan izlemeye devam edebilir */
  private checkEliminated() {
    const seat = this.mySeat();
    if (this.eliminatedShown || seat === null || this.state.players[seat]?.alive !== false || this.state.phase.kind === 'gameover') return;
    this.eliminatedShown = true;
    const host = this.net?.kind === 'host';
    const p = this.state.players[seat];
    const m = openModal({
      title: 'Elendin',
      icon: 'eliminated',
      body: h(
        'div',
        {},
        h('p', {}, `${p.name}, başkentin düştü${p.eliminatedBy !== null ? ` (${pname(this.state, p.eliminatedBy)})` : ''}. Artık izleyicisin: haritayı, oyuncuları, günlüğü ve genel sohbeti görmeye devam edersin.`),
        host ? h('p', { class: 'muted' }, 'Oda sahibi olduğun için oyun senin tarayıcında sürüyor: diğerleri bitirene kadar bu sekmeyi kapatma.') : null,
      ),
      buttons: host
        ? [{ label: 'İzlemeye devam et', value: 'stay', primary: true }]
        : [
            { label: 'Ana menü', value: 'menu' },
            { label: 'İzlemeye devam et', value: 'stay', primary: true },
          ],
    });
    void m.result.then((v) => v === 'menu' && this.cb.toMenu());
  }

  private phaseText(): string {
    const s = this.state;
    switch (s.phase.kind) {
      case 'setup_capital':
        return 'Kurulum: başkent seçimi';
      case 'setup_territory':
        return `Kurulum: başlangıç toprakları (kalan ${s.phase.picksLeft})`;
      case 'spin':
        return 'Topaç aşaması';
      case 'actions':
        return 'Eylem aşaması';
      case 'conquest':
        return `Fetih: ${s.phase.remaining} toprak seç`;
      case 'vote':
        return 'Oylama';
      case 'upkeep':
        return `Bakım ödenemiyor (${s.phase.due} akçe)`;
      case 'gameover':
        return 'Oyun bitti';
    }
  }

  /** Normal tur adımları: Bakım → Topaç → Eylemler; özel aşamalarda tek etiket */
  private phaseSteps(): HTMLElement {
    const ph = this.state.phase.kind;
    const steps: [string, string, IconName][] = [
      ['upkeep', 'Bakım', 'upkeep'],
      ['spin', 'Topaç', 'spin'],
      ['actions', 'Eylemler', 'build'],
    ];
    const idx = steps.findIndex(([k]) => k === ph);
    if (idx < 0) {
      const special: IconName = ph === 'conquest' ? 'attack' : ph === 'vote' ? 'vote' : ph === 'gameover' ? 'trophy' : 'capital';
      return h('div', { class: 'phase-steps', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'phase-step current' }, icon(special), this.phaseText()));
    }
    return h(
      'ol',
      { class: 'phase-steps', role: 'status', 'aria-label': `Aşama: ${this.phaseText()}` },
      steps.map(([, label, ic], i) =>
        h('li', { class: `phase-step ${i === idx ? 'current' : i < idx ? 'done' : ''}`, 'aria-current': i === idx ? 'step' : null }, icon(ic), label, i === 1 && i === idx ? h('span', { class: 'phase-hint' }, ' bekleniyor') : null),
      ),
    );
  }

  private renderTop() {
    const s = this.state;
    const p = s.players[this.actor()];
    const st = playerStats(s, p.id);
    const res = p.resources;
    clear(this.elTop);
    const stat = (ic: IconName, value: Child, title: string, cls = '') => h('span', { class: `stat ${cls}`, title, 'aria-label': `${title}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}` }, icon(ic), h('b', {}, value));
    this.elTop.append(
      h(
        'div',
        { class: 'turn-card', style: { borderColor: p.color } },
        playerSwatch(p.color, p.id, 26),
        h(
          'div',
          { class: 'turn-who' },
          h('div', { class: 'who-name' }, p.name, p.kind === 'bot' ? h('span', { class: 'tag', title: 'Bot seviyesi' }, icon('bot'), BOT_LEVEL_NAME[p.botLevel]) : null),
          h('div', { class: 'who-round' }, s.round > 0 ? `${s.round}. tur` : 'Kurulum'),
        ),
      ),
      this.phaseSteps(),
      this.clockEl,
      h(
        'div',
        { class: 'stats' },
        RESOURCE_KEYS.map((k) => stat(RES_ICON[k], fmtNum(res[k]), RES_NAME[k])),
        h('span', { class: 'stat-sep', 'aria-hidden': 'true' }),
        stat('tiles', st.tiles, 'Toprak'),
        stat('ship', st.ships, 'Gemi'),
        stat('plane', st.planes, 'Uçak'),
        s.config.upkeepEnabled ? stat('upkeep', fmtNum(upkeepDue(s, p.id)), 'Tur başı bakım (akçe): her tur başında gemi, uçak ve askeri üsler için ödenir', 'stat-soft') : null,
      ),
    );
  }

  private renderPlayers() {
    const s = this.state;
    const cur = s.currentPlayer;
    clear(this.elPlayers);
    for (const p of s.players) {
      const st = playerStats(s, p.id);
      const rel: Child[] = [];
      if (p.id !== cur && p.alive) {
        if (isAllied(s, cur, p.id)) rel.push(icon('alliance', { label: `${pname(s, cur)} ile müttefik`, cls: 'rel-icon' }));
        if (atPeace(s, cur, p.id)) rel.push(icon('peace', { label: `${pname(s, cur)} ile barış (${getRelation(s, cur, p.id).peaceUntilRound}. tura kadar)`, cls: 'rel-icon' }));
      }
      const allies = s.players.filter((q) => q.id !== p.id && q.alive && isAllied(s, p.id, q.id));
      const mini = (ic: IconName, v: Child, title: string) => h('span', { class: 'mini-stat', title }, icon(ic), v);
      this.elPlayers.appendChild(
        h(
          'div',
          {
            class: `player-row ${p.id === cur ? 'current' : ''} ${p.alive ? '' : 'dead'}`,
            style: p.id === cur ? { borderLeftColor: p.color } : {},
            title: p.capital !== null ? `${p.name}: başkente git (${HATCH_NAME[playerHatch(p.id)]} desen)` : '',
            onClick: () => p.capital !== null && this.map.centerOn(p.capital),
          },
          playerSwatch(p.color, p.id, 20),
          h(
            'div',
            { class: 'pr-main' },
            h(
              'div',
              { class: 'pr-name' },
              p.name,
              p.kind === 'bot' ? h('span', { class: 'tag', title: 'Bot seviyesi' }, icon('bot'), BOT_LEVEL_NAME[p.botLevel]) : null,
              this.seatBadge(p.id),
              rel,
            ),
            p.alive
              ? h(
                  'div',
                  { class: 'pr-stats' },
                  mini('tiles', st.tiles, 'Toprak'),
                  mini('akce', fmtNum(p.resources.akce), 'Akçe'),
                  mini('ship', st.ships, 'Gemi'),
                  mini('plane', st.planes, 'Uçak'),
                  s.config.upkeepEnabled ? mini('upkeep', fmtNum(upkeepDue(s, p.id)), 'Tur başı bakım') : null,
                )
              : h('div', { class: 'pr-stats' }, icon('eliminated'), `Elendi${p.eliminatedBy !== null ? ` (${pname(s, p.eliminatedBy)})` : ''}`),
            allies.length ? h('div', { class: 'pr-allies' }, icon('alliance', { label: 'Müttefikleri' }), allies.map((a) => h('span', { class: 'dot small', title: a.name, style: { background: a.color } }))) : null,
          ),
        ),
      );
    }
  }

  /** Çevrimiçi: koltuğun bağlantı rozeti */

  private seatBadge(p: number): Child {
    if (!this.net) return null;
    const me = this.mine(p) ? h('span', { class: 'tag tag-me' }, 'Sen') : null;
    const pres = this.presence[p];
    if (!pres) return me;
    if (pres.status === 'online') return [me, h('span', { class: 'net-dot online', title: 'Bağlı' }, '●')];
    if (pres.status === 'away') {
      const left = Math.max(0, Math.ceil(((pres.deadline ?? Date.now()) - Date.now()) / 1000));
      return [me, h('span', { class: 'net-dot away', title: 'Bağlantı koptu' }, `● ${left} sn`)];
    }
    return [me, h('span', { class: 'net-dot bot', title: 'Bağlantı koptu, yerine bot oynuyor' }, '● bot oynuyor')];
  }

  private lastLogLen = -1;
  private lastLogTurn = -1;
  private renderLog() {
    const s = this.state;
    const last = s.log[s.log.length - 1];
    const sig = s.log.length + (last ? last.turn * 100000 : 0);
    if (sig === this.lastLogLen && this.lastLogTurn === s.turnCounter) return;
    this.lastLogLen = sig;
    this.lastLogTurn = s.turnCounter;
    clear(this.elLog);
    const entries = s.log.slice(-160).reverse();
    for (const e of entries) {
      const text = formatEvent(s, e.event);
      if (!text) continue;
      const cls = e.event.type === 'turn_start' ? 'log-turn' : e.event.type === 'battle' || e.event.type === 'eliminated' ? 'log-war' : '';
      const ic = eventIcon(e.event);
      this.elLog.appendChild(h('div', { class: `log-line ${cls}` }, ic ? icon(ic) : null, h('span', {}, text)));
    }
  }

  /** Eylem çubuğunun düğmeleri: her biri neden yapılamadığını bilir */
  private actionInfos(): ActionInfo[] {
    const s = this.state;
    const c = s.config;
    const human = this.isHumanTurn();
    const me = this.actor();
    const res = s.players[me].resources;
    const ph = s.phase.kind;
    const m = this.mode;
    const toggle = (mode: Mode) => () => this.setMode(this.mode.kind === mode.kind && (mode.kind !== 'expedition' || (this.mode.kind === 'expedition' && this.mode.unit === mode.unit)) ? { kind: 'none' } : mode);
    // Eylem aşamasında değilsek tüm eylemler için ortak neden
    const phaseReason = !human
      ? this.state.phase.kind === 'gameover'
        ? 'Oyun bitti'
        : 'Sıra sende değil'
      : ph === 'spin'
        ? 'Önce topacı çevir'
        : ph === 'upkeep'
          ? 'Önce bakımı öde'
          : ph === 'conquest'
            ? 'Önce fethedeceğin toprakları seç'
            : ph === 'vote'
              ? 'Oylama sürüyor'
              : ph === 'setup_capital' || ph === 'setup_territory'
                ? 'Kurulum sürüyor'
                : null;
    const inActions = phaseReason === null;
    const only = (r: string | null) => (inActions ? r : phaseReason);
    const ships = s.units.filter((u) => u.owner === me && u.kind === 'ship');
    const planes = s.units.filter((u) => u.owner === me && u.kind === 'plane');
    const unitReason = (kind: 'ship' | 'plane') => {
      const own = kind === 'ship' ? ships : planes;
      const oil = kind === 'ship' ? c.shipOilCost : c.planeOilCost;
      if (own.length === 0) return kind === 'ship' ? 'Gemin yok: tersane kurup gemi üret' : 'Uçağın yok: uçak fabrikası kurup uçak üret';
      if (res.oil < oil) return `Sefer için ${oil} petrol gerekli (sende ${res.oil})`;
      if (readyUnits(s, me, kind).length === 0) return 'Bu tur sefere çıkabilecek birim kalmadı';
      return null;
    };
    const cheapest = Math.min(c.shipyardCost, c.factoryCost, c.baseCost);
    const hasYard = s.structure.some((st, i) => s.owner[i] === me && (st === 'shipyard' || st === 'factory'));
    const attackReason = () => {
      if (battleUsed(s, me)) return BATTLE_USED;
      if (openingPeaceActive(s)) return `Açılış barışı: ${c.openingPeaceRounds}. tur sonuna kadar saldırı yok`;
      const cost = battleCostProblem(s, me, 'land');
      if (cost) return cost;
      if (attackableTiles(s, me).length === 0) return 'Saldırabileceğin komşu düşman toprağı yok';
      return null;
    };
    const incoming = s.offers.filter((o) => o.to === me).length;
    return [
      {
        id: 'claim',
        icon: 'claim',
        label: 'Toprak al',
        desc: `Toprağına komşu sahipsiz bir kareyi ${c.claimCost} akçeye al. Savaş sayılmaz.`,
        reason: only(res.akce < c.claimCost ? `${c.claimCost} akçe gerekli (sende ${fmtNum(res.akce)})` : claimableTiles(s, me).length === 0 ? 'Toprağına komşu sahipsiz kara yok' : null),
        active: m.kind === 'claim',
        onClick: toggle({ kind: 'claim' }),
      },
      {
        id: 'build',
        icon: 'build',
        label: 'İnşa et',
        desc: `Tersane ${c.shipyardCost}, uçak fabrikası ${c.factoryCost}, askeri üs ${c.baseCost} akçe.`,
        reason: only(res.akce < cheapest ? `En ucuz yapı ${cheapest} akçe (sende ${fmtNum(res.akce)})` : null),
        active: m.kind === 'build',
        onClick: () => this.openBuildDialog(),
      },
      {
        id: 'produce',
        icon: 'produce',
        label: 'Üret',
        desc: `Tersanede gemi (${c.shipIronCost} demir + ${c.shipAkceCost} akçe), fabrikada uçak (${c.planeSteelCost} çelik + ${c.planeAkceCost} akçe).`,
        reason: only(
          !hasYard
            ? 'Önce tersane ya da uçak fabrikası kur'
            : producibleTiles(s, me, 'ship').length + producibleTiles(s, me, 'plane').length === 0
              ? 'Kaynak yetersiz (demir/çelik ve akçe)'
              : null,
        ),
        active: m.kind === 'produce',
        onClick: toggle({ kind: 'produce' }),
      },
      {
        id: 'attack',
        icon: 'attack',
        label: 'Saldır',
        desc: `Komşu düşman toprağına saldır. Turda tek savaş hakkın var.${c.battleCostsEnabled ? ` Masraf: ${battleCostText(battleCost(s, 'land'))}.` : ''}`,
        reason: only(attackReason()),
        active: m.kind === 'attack',
        onClick: toggle({ kind: 'attack' }),
      },
      {
        id: 'ship',
        icon: 'ship',
        label: 'Gemi seferi',
        desc: `Gemiyle deniz yoluyla kıyı toprağına git (${c.shipOilCost} petrol). Sahipsizse alırsın, sahipliyse savaş.`,
        reason: only(unitReason('ship')),
        active: m.kind === 'expedition' && m.unit === 'ship',
        onClick: toggle({ kind: 'expedition', unit: 'ship', unitId: null }),
      },
      {
        id: 'plane',
        icon: 'plane',
        label: 'Uçak seferi',
        desc: `Uçakla düşman üslerinin ${c.baseBlockRadius} kare çevresi dışındaki her yere git (${c.planeOilCost} petrol).`,
        reason: only(unitReason('plane')),
        active: m.kind === 'expedition' && m.unit === 'plane',
        onClick: toggle({ kind: 'expedition', unit: 'plane', unitId: null }),
      },
      {
        id: 'exchange',
        icon: 'exchange',
        label: 'Bozdur',
        desc: `Altını akçeye çevir: 1 altın = ${c.goldToAkce} akçe.`,
        reason: !human ? phaseReason : ph !== 'actions' && ph !== 'spin' && ph !== 'upkeep' ? phaseReason : res.gold <= 0 ? 'Bozdurulacak altının yok' : null,
        onClick: () => this.openGoldDialog(),
      },
      {
        id: 'diplomacy',
        icon: 'diplomacy',
        label: 'Diplomasi',
        desc: 'İttifak, barış, takas teklif et; gelen teklifleri yanıtla.',
        reason: human ? null : phaseReason,
        badge: incoming,
        onClick: () => this.openDiplomacy(),
      },
      {
        id: 'strait',
        icon: 'strait',
        label: 'Boğazlar',
        desc: 'Boğazların durumu; idarendekiler için geçiş izni ve vergi.',
        reason: human && ph !== 'setup_capital' && ph !== 'setup_territory' ? null : phaseReason,
        onClick: () => this.openStraits(),
      },
      {
        id: 'undo',
        icon: 'undo',
        label: 'Geri al',
        desc: 'Bu turdaki son eylemini geri al (Ctrl+Z). Topaç, savaş ve diplomasiden sonra önceki eylemler geri alınamaz.',
        reason: this.canUndoNow() ? null : human ? 'Geri alınabilecek eylem yok' : phaseReason,
        onClick: () => void this.undoLast(),
      },
      {
        id: 'end',
        icon: 'endTurn',
        label: 'Turu bitir',
        desc: 'Sırayı sonraki oyuncuya ver.',
        reason: only(null),
        cls: 'end-turn',
        onClick: () => void this.endTurn(),
      },
    ];
  }

  private renderActions() {
    clear(this.elActions);
    for (const a of this.actionInfos()) {
      const b = h(
        'button',
        {
          // Yapılamayan eylem gerçekten devre dışı değildir: üzerine gelince ve odaklanınca nedeni görünsün
          class: `action-btn ${a.active ? 'active' : ''} ${a.reason ? 'locked' : ''} ${a.cls ?? ''}`,
          'aria-disabled': a.reason ? 'true' : null,
          'aria-pressed': a.active ? 'true' : null,
          'aria-label': a.reason ? `${a.label} (yapılamaz: ${a.reason})` : a.label,
          dataset: { action: a.id },
          onClick: () => (a.reason ? toast(a.reason, 'error') : a.onClick()),
        },
        icon(a.icon, { cls: 'ab-icon' }),
        h('span', { class: 'ab-label' }, a.label),
        a.badge ? h('span', { class: 'badge', 'aria-label': `${a.badge} bekleyen teklif` }, a.badge) : null,
      );
      const show = () => this.showActionTip(b, a);
      b.addEventListener('pointerenter', show);
      b.addEventListener('focus', show);
      b.addEventListener('pointerleave', () => this.elActionTip.classList.add('hidden'));
      b.addEventListener('blur', () => this.elActionTip.classList.add('hidden'));
      this.elActions.appendChild(b);
    }
  }

  /** Eylem düğmesinin ipucu kutusu: ad, açıklama ve varsa engel nedeni */
  private showActionTip(btn: HTMLElement, a: ActionInfo) {
    const tip = this.elActionTip;
    clear(tip);
    append(tip, [h('div', { class: 'tip-head' }, icon(a.icon), a.label), h('div', {}, a.desc), a.reason ? h('div', { class: 'tip-bad' }, icon('warning'), a.reason) : null]);
    tip.classList.remove('hidden');
    const r = btn.getBoundingClientRect();
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${r.top - tip.offsetHeight - 8}px`;
  }

  private setMode(mode: Mode) {
    this.mode = mode;
    this.targetCache = null;
    this.render();
  }

  private async endTurn() {
    this.mode = { kind: 'none' };
    await this.act({ type: 'END_TURN', player: this.state.currentPlayer });
  }

  private setBanner(text: Child, buttons: { label: string; onClick: () => void; primary?: boolean; icon?: IconName }[] = [], ic?: IconName) {
    clear(this.elBanner);
    this.elBanner.classList.remove('hidden');
    this.elBanner.append(
      h('span', { class: 'banner-text' }, ic ? icon(ic, { cls: 'banner-icon' }) : null, h('span', {}, text)),
      ...buttons.map((b) => h('button', { class: `btn btn-small ${b.primary ? 'btn-primary' : ''}`, onClick: b.onClick }, b.icon ? icon(b.icon) : null, b.label)),
    );
  }

  /** Sıra bu cihazda değilken bilgi şeridi metni */
  private waitingText(): string {
    const s = this.state;
    const spectator = this.spectating() ? 'İzliyorsun · ' : '';
    if (s.phase.kind === 'vote') {
      const ph = s.phase;
      const waiting = s.players.filter((p) => p.alive && !(p.id in ph.votes)).map((p) => p.name);
      return `${spectator}Oylama: ${waiting.join(', ')} bekleniyor…`;
    }
    const a = this.actor();
    const p = s.players[a];
    const pres = this.presence[a];
    if (p.kind === 'bot') return `${spectator}${p.name}${pres?.status === 'bot' ? ' (yerine bot)' : ''} düşünüyor…`;
    if (pres?.status === 'away') {
      const left = Math.max(0, Math.ceil(((pres.deadline ?? Date.now()) - Date.now()) / 1000));
      return `${spectator}${p.name} bağlantısı koptu. ${left} sn bekleniyor, sonra yerine bot oynayacak.`;
    }
    const counter = s.phase.kind === 'conquest' && s.phase.counter;
    return `${spectator}${p.name} ${counter ? 'karşı saldırıda toprak seçiyor' : 'oynuyor'}…`;
  }

  /** Mevcut aşama/moda göre geçerli hedefler ve bilgi şeridi. */
  private renderTargets() {
    const s = this.state;
    const me = this.actor();
    const hl: Highlight = {};
    this.elBanner.classList.add('hidden');
    if (s.phase.kind === 'gameover') {
      this.setBanner('Oyun bitti.', [{ label: 'Ana menü', onClick: () => this.cb.toMenu() }], 'trophy');
      this.map.setHighlight(hl);
      return;
    }
    if (!this.isHumanTurn()) {
      const a = this.state.players[this.actor()];
      this.setBanner(this.waitingText(), [], this.state.phase.kind === 'vote' ? 'vote' : a?.kind === 'bot' ? 'bot' : 'hourglass');
      this.map.setHighlight(hl);
      return;
    }
    const cancel = { label: 'İptal', onClick: () => this.setMode({ kind: 'none' }) };
    const cached = <T,>(key: string, compute: () => { groups: Highlight['groups']; extra?: T }) => {
      if (this.targetCache && this.targetCache.state === s && this.targetCache.key === key) return this.targetCache as { groups: Highlight['groups']; extra?: T };
      const v = compute();
      this.targetCache = { state: s, key, ...v };
      return v;
    };
    const ph = s.phase;
    if (ph.kind === 'setup_capital' || ph.kind === 'setup_territory') {
      // Yerleşimde maden kareleri seçilemez: kırmızı taranır
      const mines = new Uint8Array(s.owner.length);
      for (let i = 0; i < mines.length; i++) if (s.map.mines[i]) mines[i] = 1;
      hl.danger = mines;
    }
    if (ph.kind === 'setup_capital') {
      hl.groups = cached('cap', () => ({ groups: [{ tiles: new Set(capitalCandidates(s, me)), style: 'pick' }] })).groups;
      this.setBanner(`${pname(s, me)}, başkentini seç: vurgulanan karelerden birine tıkla. Kırmızı taralı maden kareleri kurulumda seçilemez.`, [], 'capital');
    } else if (ph.kind === 'setup_territory') {
      hl.groups = [{ tiles: new Set(startPickCandidates(s, me)), style: 'pick' }];
      this.setBanner(
        `Başlangıç toprağı seç: kalan ${ph.picksLeft}. Her kare bölgene bitişik olmalı; maden kareleri seçilemez.`,
        [{ label: 'Seçimi bitir', onClick: () => void this.act({ type: 'SKIP_START_PICKS', player: me }) }],
        'claim',
      );
    } else if (ph.kind === 'upkeep') {
      const akce = s.players[me].resources.akce;
      this.setBanner(
        `Bakım ${fmtNum(ph.due)} akçe, akçen ${fmtNum(akce)}. Ödenemeyen kadar birim ya da üs dağıtmalısın.`,
        [{ label: 'Dağıtılacakları seç', primary: true, onClick: () => this.openUpkeepDialog() }],
        'upkeep',
      );
      const key = `upkeep-${s.turnCounter}`;
      if (!this.prompted.has(key)) {
        this.prompted.add(key);
        setTimeout(() => this.openUpkeepDialog(), 0);
      }
    } else if (ph.kind === 'spin') {
      this.setBanner('Sıra sende! Önce sekizgen topacı çevir (Boşluk).', [{ label: 'Topacı çevir', icon: 'spin', primary: true, onClick: () => void this.act({ type: 'SPIN', player: me }) }], 'spin');
    } else if (ph.kind === 'conquest') {
      hl.groups = [{ tiles: new Set(conquestCandidates(s)), style: 'attack' }];
      this.setBanner(
        ph.counter
          ? `Karşı saldırı! ${pname(s, me)}, sana saldıran ${gen(pname(s, ph.victim))} sınırındaki topraklarından ${ph.remaining} tane seç.`
          : `Zafer! ${pname(s, ph.victim)} topraklarından ${ph.remaining} tane seç.`,
        [{ label: 'Fethi bitir', onClick: () => void this.act({ type: 'END_CONQUEST', player: me }) }],
        ph.counter ? 'base' : 'attack',
      );
    } else if (ph.kind === 'actions') {
      const mode = this.mode;
      switch (mode.kind) {
        case 'none':
          this.setBanner('Aşağıdan bir eylem seç ya da turu bitir. Haritayı sürükleyerek kaydır, tekerlekle yakınlaş.', [], 'build');
          break;
        case 'claim': {
          const t = claimableTiles(s, me);
          hl.groups = [{ tiles: new Set(t), style: 'claim' }];
          this.setBanner(t.length ? `Sarı karelerden birine tıkla: sahipsiz komşu toprak (${s.config.claimCost} akçe).` : 'Alınabilecek sahipsiz komşu toprak yok ya da akçe yetersiz.', [cancel], 'claim');
          break;
        }
        case 'build': {
          const t = buildableTiles(s, me, mode.structure);
          hl.groups = [{ tiles: new Set(t), style: 'build' }];
          this.setBanner(
            t.length
              ? `${STRUCT_NAME[mode.structure]} için yer seç (${structureCost(s, mode.structure)} akçe).`
              : `${STRUCT_NAME[mode.structure]} için uygun boş toprağın yok${mode.structure === 'shipyard' ? ' (denize kıyısı olan bir toprak gerekir)' : ''}.`,
            [cancel],
            STRUCT_ICON[mode.structure],
          );
          break;
        }
        case 'produce': {
          const ships = producibleTiles(s, me, 'ship');
          const planes = producibleTiles(s, me, 'plane');
          hl.groups = [{ tiles: new Set([...ships, ...planes]), style: 'build' }];
          const c = s.config;
          this.setBanner(
            ships.length || planes.length
              ? `Tersaneye tıkla: gemi (${c.shipIronCost} demir + ${c.shipAkceCost} akçe${c.upkeepEnabled ? `, bakım ${c.shipUpkeep}/tur` : ''}) · Fabrikaya tıkla: uçak (${c.planeSteelCost} çelik + ${c.planeAkceCost} akçe${c.upkeepEnabled ? `, bakım ${c.planeUpkeep}/tur` : ''})`
              : 'Üretim için tersane/uçak fabrikası ve yeterli kaynak gerekli.',
            [cancel],
            'produce',
          );
          break;
        }
        case 'attack': {
          const t = attackableTiles(s, me);
          hl.groups = [{ tiles: new Set(t), style: 'attack' }];
          this.setBanner(
            battleUsed(s, me)
              ? `${BATTLE_USED}.`
              : openingPeaceActive(s)
                ? `Açılış barışı: ${s.config.openingPeaceRounds}. tur sonuna kadar kimse başka oyuncunun toprağına saldıramaz.`
              : t.length
                ? `Çarpılı kırmızı karelerden birine saldır (turda tek savaş). ${this.battleCostsLine()} Kaybedersen savunan karşı saldırıyla toprak alır.`
                : 'Saldırılabilecek komşu düşman toprağı yok.',
            [cancel],
            'attack',
          );
          break;
        }
        case 'expedition': {
          const units = readyUnits(s, me, mode.unit);
          const unitIcon = UNIT_ICON[mode.unit];
          const name = mode.unit === 'ship' ? 'Gemi' : 'Uçak';
          if (mode.unitId === null || !units.some((u) => u.id === mode.unitId)) {
            const homes = new Set(units.map((u) => u.tile));
            if (homes.size === 1) {
              mode.unitId = units[0].id;
            } else {
              hl.groups = [{ tiles: homes, style: 'select' }];
              this.setBanner(
                units.length
                  ? `Sefere çıkacak ${name.toLocaleLowerCase('tr')} için ${mode.unit === 'ship' ? 'tersaneyi' : 'fabrikayı'} seç.`
                  : `Sefere hazır ${name.toLocaleLowerCase('tr')} yok (${mode.unit === 'ship' ? s.config.shipOilCost : s.config.planeOilCost} petrol gerekir).`,
                [cancel],
                unitIcon,
              );
              break;
            }
          }
          const unitId = mode.unitId!;
          const unit = s.units.find((u) => u.id === unitId)!;
          const data = cached(`exp-${unitId}`, () => {
            const targets = expeditionTargets(s, me, unitId);
            const claim = new Set<number>();
            const attack = new Set<number>();
            for (const t of targets.values()) (t.kind === 'claim' ? claim : attack).add(t.tile);
            return {
              groups: [
                { tiles: claim, style: 'claim' as const },
                { tiles: attack, style: 'attack' as const },
              ],
              extra: { targets, blocked: mode.unit === 'plane' ? planeBlockedTiles(s, me) : null },
            };
          });
          hl.groups = data.groups;
          hl.danger = (data.extra as { blocked: Uint8Array | null }).blocked;
          hl.selected = new Set([unit.tile]);
          const others = units.length > 1 ? [{ label: 'Başka birim', onClick: () => this.setMode({ kind: 'expedition', unit: mode.unit, unitId: null }) }] : [];
          this.setBanner(
            `${name} seferi (${mode.unit === 'ship' ? s.config.shipOilCost : s.config.planeOilCost} petrol): sarı = sahipsiz (${s.config.expeditionClaimCost} akçe), ${battleUsed(s, me) ? 'savaş hakkın bu tur kullanıldı' : `kırmızı = savaş${s.config.battleCostsEnabled ? ` (+${battleCostText(battleCost(s, 'land'))}, üs ${battleCostText(battleCost(s, 'base'))})` : ''}`}.${mode.unit === 'plane' ? ' Taralı kırmızı alan: düşman üssü engeli.' : ''}`,
            [...others, cancel],
            unitIcon,
          );
          break;
        }
        case 'offerTiles': {
          const d = mode.draft;
          const owner = mode.side === 'give' ? me : d.to;
          const set = mode.side === 'give' ? d.giveTiles : d.takeTiles;
          const tiles = new Set<number>();
          for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === owner && s.structure[i] !== 'capital') tiles.add(i);
          hl.groups = [{ tiles, style: 'select' }];
          hl.selected = set;
          this.setBanner(`Teklif için ${mode.side === 'give' ? 'vereceğin' : `${gen(pname(s, d.to))} vermesini istediğin`} toprakları seç (${set.size} seçili).`, [
            { label: 'Tamam', primary: true, onClick: () => this.openComposer(d) },
          ]);
          break;
        }
      }
    }
    this.map.setHighlight(hl);
  }

  // ------------------------------------------------------------------
  // Etkileşim
  // ------------------------------------------------------------------

  private onKey(e: KeyboardEvent) {
    if (document.querySelector('.modal-backdrop, .overlay, .replay-layer')) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'Escape' && this.mode.kind !== 'none') this.setMode({ kind: 'none' });
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      void this.undoLast();
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && this.isHumanTurn() && this.state.phase.kind === 'spin') {
      e.preventDefault();
      void this.act({ type: 'SPIN', player: this.state.currentPlayer });
    }
  }

  private async onTileClick(t: number) {
    if (this.busy || !this.isHumanTurn()) return;
    const s = this.state;
    const me = this.actor();
    const ph = s.phase;
    if (ph.kind === 'setup_capital') return void this.act({ type: 'PLACE_CAPITAL', player: me, tile: t });
    if (ph.kind === 'setup_territory') return void this.act({ type: 'PICK_START_TILE', player: me, tile: t });
    if (ph.kind === 'conquest') return void this.act({ type: 'CONQUER_TILE', player: me, tile: t });
    if (ph.kind !== 'actions') return;
    const mode = this.mode;
    switch (mode.kind) {
      case 'claim':
        await this.act({ type: 'CLAIM_TILE', player: me, tile: t });
        break;
      case 'build': {
        const ok = await this.act({ type: 'BUILD', player: me, tile: t, structure: mode.structure });
        if (ok) this.setMode({ kind: 'none' });
        break;
      }
      case 'produce': {
        const st = s.structure[t];
        if (st !== 'shipyard' && st !== 'factory') return toast('Tersane ya da uçak fabrikası seç', 'error');
        await this.act({ type: 'PRODUCE', player: me, tile: t, unit: st === 'shipyard' ? 'ship' : 'plane' });
        break;
      }
      case 'attack': {
        const ok = await this.act({ type: 'ATTACK', player: me, target: t });
        // Turda tek savaş: savaştan sonra saldırı modundan çık
        if (ok && this.mode.kind === 'attack') this.setMode({ kind: 'none' });
        break;
      }
      case 'expedition': {
        if (mode.unitId === null) {
          const u = readyUnits(s, me, mode.unit).find((x) => x.tile === t);
          if (!u) return toast('Bu karede sefere hazır birim yok', 'error');
          this.setMode({ ...mode, unitId: u.id });
          return;
        }
        const unit = s.units.find((u) => u.id === mode.unitId);
        if (unit && t === unit.tile) return;
        const ok = await this.act({ type: mode.unit === 'ship' ? 'SHIP_EXPEDITION' : 'PLANE_EXPEDITION', player: me, unitId: mode.unitId, target: t });
        if (ok && this.state.phase.kind === 'actions') this.setMode({ kind: 'expedition', unit: mode.unit, unitId: null });
        break;
      }
      case 'offerTiles': {
        const owner = mode.side === 'give' ? me : mode.draft.to;
        if (s.owner[t] !== owner || s.structure[t] === 'capital') return toast('Bu toprak seçilemez', 'error');
        const set = mode.side === 'give' ? mode.draft.giveTiles : mode.draft.takeTiles;
        if (set.has(t)) set.delete(t);
        else set.add(t);
        this.render();
        break;
      }
      case 'none':
        break;
    }
  }

  private onHover(t: number, cx: number, cy: number) {
    if (t < 0) {
      this.elTip.classList.add('hidden');
      return;
    }
    const s = this.state;
    const m = s.map;
    const lines: Child[] = [];
    const terrain = m.terrain[t] === 'land' ? 'Kara' : m.terrain[t] === 'sea' ? (m.straitOf[t] >= 0 ? 'Boğaz' : 'Deniz') : 'Göl';
    lines.push(h('div', { class: 'tip-head' }, `${tileLabel(s, t)} · ${terrain}`));
    if (m.terrain[t] === 'land') {
      const o = s.owner[t];
      lines.push(h('div', {}, o === null ? 'Sahipsiz' : h('span', {}, h('span', { class: 'dot small', style: { background: s.players[o].color } }), ` ${s.players[o].name}`)));
      const mine = m.mines[t];
      if (mine) lines.push(h('div', { class: 'tip-line' }, icon(RES_ICON[mine]), `${RES_NAME[mine]} madeni`));
      const st = s.structure[t];
      if (st) lines.push(h('div', { class: 'tip-line' }, icon(STRUCT_ICON[st]), STRUCT_NAME[st]));
      const units = unitsAt(s, t);
      if (units.length) {
        const ships = units.filter((u) => u.kind === 'ship').length;
        const planes = units.length - ships;
        lines.push(h('div', { class: 'tip-line' }, ships ? [icon('ship'), `${ships} gemi `] : null, planes ? [icon('plane'), `${planes} uçak`] : null));
      }
      const banks = m.straits.filter((x) => x.banks.includes(t));
      for (const b of banks) lines.push(h('div', { class: 'muted tip-line' }, icon('strait'), `${straitLabel(b.id)} boğazının yakası`));
    }
    const sid = m.straitOf[t];
    if (sid >= 0) {
      const ctl = s.straits[sid].controller;
      lines.push(h('div', { class: 'tip-line' }, icon('strait'), `${straitLabel(sid)} · idare: ${ctl === null ? 'yok' : pname(s, ctl)}`));
      if (ctl !== null && this.isHumanTurn() && ctl !== s.currentPlayer) {
        const pol = straitPolicyFor(s, sid, s.currentPlayer);
        lines.push(h('div', {}, pol.allow ? `Sana açık · vergi ${pol.toll}` : 'Sana kapalı'));
      }
    }
    // Yerleşimde neden seçilemediği
    if (this.isHumanTurn() && (s.phase.kind === 'setup_capital' || s.phase.kind === 'setup_territory') && m.terrain[t] === 'land') {
      const a: Action =
        s.phase.kind === 'setup_capital' ? { type: 'PLACE_CAPITAL', player: s.currentPlayer, tile: t } : { type: 'PICK_START_TILE', player: s.currentPlayer, tile: t };
      const v = validateAction(s, a);
      lines.push(h('div', { class: v.ok ? 'tip-good' : 'tip-bad' }, v.ok ? '▶ Tıkla' : v.reason));
    }
    // Moda özel ipucu
    if (this.isHumanTurn() && s.phase.kind === 'actions') {
      const me = s.currentPlayer;
      const mode = this.mode;
      let hint: Action | null = null;
      if (mode.kind === 'claim') hint = { type: 'CLAIM_TILE', player: me, tile: t };
      if (mode.kind === 'attack') hint = { type: 'ATTACK', player: me, target: t };
      if (mode.kind === 'build') hint = { type: 'BUILD', player: me, tile: t, structure: mode.structure };
      if (mode.kind === 'expedition' && mode.unitId !== null) {
        hint = { type: mode.unit === 'ship' ? 'SHIP_EXPEDITION' : 'PLANE_EXPEDITION', player: me, unitId: mode.unitId, target: t };
        const extra = this.targetCache?.extra as { targets?: Map<number, { kind: string; cost: number; route: { toll: number } }> } | undefined;
        const info = extra?.targets?.get(t);
        if (info) {
          const k = info.kind === 'claim' ? 'Sahipsiz toprak' : info.kind === 'land' ? 'Kara savaşı' : info.kind === 'capital' ? 'Başkent savaşı' : 'Askeri üs savaşı';
          lines.push(h('div', { class: 'tip-good' }, `▶ ${k}${info.cost ? ` · ${info.cost} akçe` : ''}${info.route.toll ? ` (vergi ${info.route.toll})` : ''}`));
          hint = null;
        }
      }
      if (mode.kind === 'attack' && validateAction(s, { type: 'ATTACK', player: me, target: t }).ok) {
        const k = battleKindAt(s, t);
        lines.push(h('div', { class: 'tip-good' }, k === 'land' ? '▶ Kara savaşı' : k === 'capital' ? `▶ Başkent savaşı (${s.config.capitalStreak} art arda)` : `▶ Üs savaşı (${s.config.baseStreak} art arda)`));
        hint = null;
      }
      if (hint) {
        const v = validateAction(s, hint);
        lines.push(h('div', { class: v.ok ? 'tip-good' : 'tip-bad' }, v.ok ? '▶ Tıkla' : v.reason));
      }
    }
    clear(this.elTip);
    this.elTip.append(...(lines as Node[]));
    this.elTip.classList.remove('hidden');
    const r = this.elMapWrap.getBoundingClientRect();
    const tw = this.elTip.offsetWidth;
    const th = this.elTip.offsetHeight;
    let x = cx - r.left + 16;
    let y = cy - r.top + 16;
    if (x + tw > r.width - 8) x = cx - r.left - tw - 12;
    if (y + th > r.height - 8) y = cy - r.top - th - 12;
    this.elTip.style.left = `${Math.max(4, x)}px`;
    this.elTip.style.top = `${Math.max(4, y)}px`;
  }

  // ------------------------------------------------------------------
  // Diyaloglar
  // ------------------------------------------------------------------

  /** Saldırı modunda gösterilen masraf satırı */
  private battleCostsLine(): string {
    const s = this.state;
    const parts: string[] = [];
    if (s.config.battleCostsEnabled) {
      parts.push(`Masraf: savaş ${battleCostText(battleCost(s, 'land'))} · üs ${battleCostText(battleCost(s, 'base'))} · başkent ${battleCostText(battleCost(s, 'capital'))}.`);
    }
    if (s.config.weaknessRule) parts.push('Zayıflık şartı açık: başkente ancak toprağı seninkinin yarısından az olan rakipte saldırabilirsin.');
    return parts.join(' ');
  }

  /** Bakım ödenemiyorsa dağıtılacak birimleri/üsleri seçtiren pencere */
  private openUpkeepDialog() {
    const s = this.state;
    if (s.phase.kind !== 'upkeep' || !this.isHumanTurn() || this.destroyed) return;
    // Cihaz geçiş ekranı ya da başka bir pencere açıksa biraz sonra tekrar dene
    if (document.querySelector('.modal-backdrop, .overlay')) {
      setTimeout(() => this.openUpkeepDialog(), 500);
      return;
    }
    const me = s.currentPlayer;
    const c = s.config;
    const res = s.players[me].resources;
    let modal: ReturnType<typeof openModal> | null = null;
    const run = (a: Action) => {
      modal?.close();
      void this.act(a).then(() => {
        if (!this.destroyed && this.state.phase.kind === 'upkeep') this.openUpkeepDialog();
      });
    };
    const units = s.units.filter((u) => u.owner === me);
    const bases: number[] = [];
    for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === me && s.structure[i] === 'base') bases.push(i);
    const row = (ic: IconName, label: string, upkeep: number, btn: string, a: Action) =>
      h('div', { class: 'seat-row' }, icon(ic), h('span', { class: 'grow' }, label, h('span', { class: 'muted small' }, ` · bakım ${upkeep}`)), h('button', { class: 'btn btn-small btn-danger', onClick: () => run(a) }, btn));
    modal = openModal({
      title: 'Bakım ödenemiyor',
      icon: 'upkeep',
      closable: false,
      body: h(
        'div',
        {},
        h('p', {}, `Bu turun bakımı ${fmtNum(s.phase.due)} akçe, elinde ${fmtNum(res.akce)} akçe var. Borç akçene inene kadar birim dağıt ya da üs yık; kalan bakım otomatik ödenir.`),
        res.gold > 0
          ? h('p', {}, h('button', { class: 'btn btn-small btn-primary', onClick: () => run({ type: 'EXCHANGE_GOLD', player: me, amount: res.gold }) }, icon('exchange'), `${res.gold} altını bozdur (+${fmtNum(res.gold * c.goldToAkce)} akçe)`))
          : null,
        units.map((u) => row(UNIT_ICON[u.kind], `${u.kind === 'ship' ? 'Gemi' : 'Uçak'} ${tileLabel(s, u.tile)}`, u.kind === 'ship' ? c.shipUpkeep : c.planeUpkeep, 'Dağıt', { type: 'DISBAND_UNIT', player: me, unitId: u.id })),
        // Bakımsız üsleri yıkmak borcu azaltmaz
        c.baseUpkeep <= 0 ? null : bases.map((t) => row('base', `Askeri üs ${tileLabel(s, t)} (toprak sende kalır)`, c.baseUpkeep, 'Yık', { type: 'DEMOLISH_BASE', player: me, tile: t })),
      ),
    });
  }

  private openBuildDialog() {
    const s = this.state;
    const me = s.players[s.currentPlayer];
    const items: { s: BuildableStructure; desc: string }[] = [
      { s: 'shipyard', desc: `Denize kıyısı olan bir toprağa (göl sayılmaz). Gemi üretir${s.config.upkeepEnabled ? ` (gemi bakımı ${s.config.shipUpkeep} akçe/tur)` : ''}.` },
      { s: 'factory', desc: `Herhangi bir toprağa. Uçak üretir${s.config.upkeepEnabled ? ` (uçak bakımı ${s.config.planeUpkeep} akçe/tur)` : ''}.` },
      { s: 'base', desc: `Başkent dışında bir toprağa. ${s.config.baseBlockRadius} kare içinde düşman uçaklarını engeller; ele geçirmek için ${s.config.baseStreak} art arda galibiyet gerekir.${s.config.upkeepEnabled && s.config.baseUpkeep > 0 ? ` Bakım: ${s.config.baseUpkeep} akçe/tur.` : ''}` },
    ];
    const m = openModal({
      title: 'İnşa et',
      icon: 'build',
      body: h(
        'div',
        { class: 'choice-list' },
        items.map((it) => {
          const cost = structureCost(s, it.s);
          const can = me.resources.akce >= cost;
          return h(
            'button',
            { class: 'choice', disabled: !can, onClick: () => m.close(it.s) },
            icon(STRUCT_ICON[it.s], { cls: 'choice-icon' }),
            h('span', {}, h('b', {}, STRUCT_NAME[it.s]), ` — ${cost} akçe`, h('br'), h('small', {}, it.desc), !can ? h('small', { class: 'tip-bad' }, ' (akçe yetersiz)') : null),
          );
        }),
        h('p', { class: 'muted' }, 'Bir karede en fazla bir yapı olabilir (başkent de yapı sayılır).'),
      ),
    });
    void m.result.then((v) => {
      if (v === 'shipyard' || v === 'factory' || v === 'base') this.setMode({ kind: 'build', structure: v });
    });
  }

  private openGoldDialog() {
    const s = this.state;
    const me = s.players[s.currentPlayer];
    const gold = me.resources.gold;
    const input = h('input', { type: 'number', min: 1, max: gold, value: Math.max(0, gold), class: 'num' });
    const preview = h('span', {}, '');
    const upd = () => (preview.textContent = ` = ${fmtNum((Number(input.value) || 0) * s.config.goldToAkce)} akçe`);
    input.addEventListener('input', upd);
    upd();
    const m = openModal({
      title: 'Altın bozdur',
      icon: 'exchange',
      body: h('div', {}, h('p', {}, `1 altın = ${s.config.goldToAkce} akçe. Elinde ${gold} altın var.`), gold > 0 ? h('div', { class: 'row' }, input, ' altın', preview) : h('p', { class: 'muted' }, 'Bozdurulacak altının yok.')),
      buttons: gold > 0 ? [{ label: 'Hepsini bozdur', value: 'all' }, { label: 'Bozdur', value: 'ok', primary: true }] : [{ label: 'Tamam', value: 'close' }],
    });
    void m.result.then((v) => {
      const amount = v === 'all' ? gold : v === 'ok' ? Math.floor(Number(input.value)) : 0;
      if (amount > 0) void this.act({ type: 'EXCHANGE_GOLD', player: me.id, amount });
    });
  }

  private openDiplomacy() {
    const s = this.state;
    const me = s.currentPlayer;
    const myTurn = this.isHumanTurn();
    const others = s.players.filter((p) => p.id !== me);
    let modal: ReturnType<typeof openModal> | null = null;
    const after = (a: Action) => {
      modal?.close();
      void this.act(a).then(() => {
        if (!this.destroyed && this.isHumanTurn()) this.openDiplomacy();
      });
    };
    const relRows = others.map((p) => {
      const rel = getRelation(s, me, p.id);
      const status: Child[] = [];
      if (!p.alive) status.push(h('span', { class: 'rel' }, icon('eliminated'), 'Elendi'));
      if (rel.allied) status.push(h('span', { class: 'rel' }, icon('alliance'), 'Müttefik'));
      if (atPeace(s, me, p.id)) status.push(h('span', { class: 'rel' }, icon('peace'), `Barış (${rel.peaceUntilRound}. tur sonuna kadar)`));
      if (rel.allianceBrokenAtTurn === s.turnCounter) status.push(h('span', { class: 'rel' }, icon('broken'), 'İttifak bu tur bozuldu'));
      if (status.length === 0) status.push(h('span', { class: 'muted' }, 'İlişki yok (saldırılabilir)'));
      return h(
        'tr',
        { class: p.alive ? '' : 'dead' },
        h('td', {}, h('span', { class: 'pr-name' }, playerSwatch(p.color, p.id, 18), p.name, p.kind === 'bot' ? h('span', { class: 'tag', title: 'Bot seviyesi' }, icon('bot'), BOT_LEVEL_NAME[p.botLevel]) : null)),
        h('td', {}, status),
        h(
          'td',
          { class: 'right' },
          p.alive && myTurn && s.phase.kind === 'actions'
            ? [
                h('button', { class: 'btn btn-small', onClick: () => (modal?.close(), this.openComposer(this.newDraft(p.id))) }, 'Teklif hazırla'),
                rel.allied
                  ? h('button', { class: 'btn btn-small btn-danger', onClick: () => confirm(`${p.name} ile ittifakı bozmak istiyor musun? Bu tur ona saldıramazsın.`) && after({ type: 'BREAK_ALLIANCE', player: me, target: p.id }) }, 'İttifakı boz')
                  : null,
              ]
            : null,
          this.chat && p.alive && this.net && this.net.room.privateProblem(p.id) === null
            ? h('button', { class: 'btn btn-small', title: `${p.name} ile özel sohbet (uçtan uca şifreli)`, onClick: () => (modal?.close(), this.chat?.openPrivate(p.id)) }, icon('chat'), 'Özel mesaj')
            : null,
        ),
      );
    });
    const incoming = s.offers.filter((o) => o.to === me);
    const outgoing = s.offers.filter((o) => o.from === me);
    const body = h(
      'div',
      { class: 'diplo' },
      h('table', { class: 'table' }, h('tbody', {}, relRows)),
      h('h3', {}, `Gelen teklifler (${incoming.length})`),
      incoming.length
        ? incoming.map((o) =>
            h(
              'div',
              { class: 'offer-card' },
              h('div', {}, h('b', {}, pname(s, o.from)), ': ', offerText(s, o)),
              h(
                'div',
                { class: 'right' },
                h('button', { class: 'btn btn-small btn-danger', onClick: () => after({ type: 'RESPOND_OFFER', player: me, offerId: o.id, accept: false }) }, 'Reddet'),
                h('button', { class: 'btn btn-small btn-primary', onClick: () => after({ type: 'RESPOND_OFFER', player: me, offerId: o.id, accept: true }) }, 'Kabul et'),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'Bekleyen teklif yok.'),
      h('h3', {}, `Gönderdiğin teklifler (${outgoing.length})`),
      outgoing.length
        ? outgoing.map((o) =>
            h(
              'div',
              { class: 'offer-card' },
              h('div', {}, '→ ', h('b', {}, pname(s, o.to)), ': ', offerText(s, o)),
              h('div', { class: 'right' }, h('button', { class: 'btn btn-small', onClick: () => after({ type: 'CANCEL_OFFER', player: me, offerId: o.id }) }, 'Geri çek')),
            ),
          )
        : h('p', { class: 'muted' }, 'Yanıt bekleyen teklifin yok.'),
      allAliveAllied(s) && myTurn && s.phase.kind === 'actions'
        ? h(
            'div',
            { class: 'victory-box' },
            h('p', {}, 'Kalan tüm devletler aynı ittifakta! Oyunu birlikte bitirmeyi oylamaya sunabilirsin (oybirliği gerekir).'),
            h('button', { class: 'btn btn-primary', onClick: () => after({ type: 'PROPOSE_VICTORY', player: me }) }, icon('vote'), 'İttifakla bitirmeyi öner'),
          )
        : null,
    );
    modal = openModal({ title: `Diplomasi — ${pname(s, me)}`, icon: 'diplomacy', body, wide: true });
  }

  private newDraft(to: number): OfferDraft {
    return {
      to,
      alliance: false,
      peace: false,
      peaceRounds: 5,
      give: zeroRes(),
      take: zeroRes(),
      giveTiles: new Set(),
      takeTiles: new Set(),
      giveStraits: new Map(),
      takeStraits: new Map(),
    };
  }

  private draftItems(d: OfferDraft): OfferItem[] {
    const items: OfferItem[] = [];
    if (d.alliance) items.push({ kind: 'alliance' });
    if (d.peace) items.push({ kind: 'peace', rounds: d.peaceRounds });
    for (const r of RESOURCE_KEYS) {
      if (d.give[r] > 0) items.push({ kind: 'resource', giver: 'from', resource: r, amount: d.give[r] });
      if (d.take[r] > 0) items.push({ kind: 'resource', giver: 'to', resource: r, amount: d.take[r] });
    }
    for (const t of d.giveTiles) items.push({ kind: 'tile', giver: 'from', tile: t });
    for (const t of d.takeTiles) items.push({ kind: 'tile', giver: 'to', tile: t });
    for (const [id, toll] of d.giveStraits) items.push({ kind: 'strait', giver: 'from', straitId: id, toll });
    for (const [id, toll] of d.takeStraits) items.push({ kind: 'strait', giver: 'to', straitId: id, toll });
    return items;
  }

  private openComposer(d: OfferDraft) {
    this.mode = { kind: 'none' };
    this.render();
    const s = this.state;
    const me = s.currentPlayer;
    const them = s.players[d.to];
    const mine = s.players[me];
    const allied = isAllied(s, me, d.to);
    const num = (val: number, max: number, set: (v: number) => void) =>
      h('input', {
        type: 'number',
        class: 'num',
        min: 0,
        max,
        value: val,
        onInput: (e: Event) => set(Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0))),
      });
    const check = (val: boolean, set: (v: boolean) => void, disabled = false) =>
      h('input', { type: 'checkbox', checked: val, disabled, onChange: (e: Event) => set((e.target as HTMLInputElement).checked) });
    const myStraits = s.straits.map((st, id) => ({ st, id })).filter((x) => x.st.controller === me);
    const theirStraits = s.straits.map((st, id) => ({ st, id })).filter((x) => x.st.controller === d.to);
    const straitRows = (list: { id: number }[], map: Map<number, number>, verb: string) =>
      list.map(({ id }) =>
        h(
          'div',
          { class: 'row' },
          check(map.has(id), (v) => (v ? map.set(id, map.get(id) ?? 0) : map.delete(id))),
          ` ${straitLabel(id)} boğazından geçiş izni ${verb}, vergi: `,
          num(map.get(id) ?? 0, 100000, (v) => map.has(id) && map.set(id, v)),
        ),
      );
    let modal: ReturnType<typeof openModal> | null = null;
    const pickTiles = (side: 'give' | 'take') => {
      modal?.close('pick');
      this.setMode({ kind: 'offerTiles', side, draft: d });
    };
    const body = h(
      'div',
      { class: 'composer' },
      h('div', { class: 'row' }, h('label', {}, check(d.alliance, (v) => (d.alliance = v), allied), icon('alliance'), allied ? ' Zaten müttefiksiniz' : ' İttifak kur')),
      h(
        'div',
        { class: 'row' },
        h('label', {}, check(d.peace, (v) => (d.peace = v)), icon('peace'), ' Barış (saldırmazlık): '),
        num(d.peaceRounds, s.config.maxPeaceRounds, (v) => (d.peaceRounds = Math.max(1, Math.min(s.config.maxPeaceRounds, v)))),
        ' tur',
      ),
      h(
        'table',
        { class: 'table res-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Kaynak'), h('th', {}, `Ben veriyorum (${mine.name})`), h('th', {}, `İstiyorum (${them.name})`))),
        h(
          'tbody',
          {},
          RESOURCE_KEYS.map((r) =>
            h(
              'tr',
              {},
              h('td', {}, `${RES_ICON[r]} ${RES_NAME[r]}`),
              h('td', {}, num(d.give[r], mine.resources[r], (v) => (d.give[r] = v)), h('small', { class: 'muted' }, ` / ${fmtNum(mine.resources[r])}`)),
              h('td', {}, num(d.take[r], them.resources[r], (v) => (d.take[r] = v)), h('small', { class: 'muted' }, ` / ${fmtNum(them.resources[r])}`)),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'row' },
        icon('tiles'),
        `Vereceğin topraklar: ${d.giveTiles.size} `,
        h('button', { class: 'btn btn-small', onClick: () => pickTiles('give') }, 'Haritadan seç'),
        `  ·  İstediğin topraklar: ${d.takeTiles.size} `,
        h('button', { class: 'btn btn-small', onClick: () => pickTiles('take') }, 'Haritadan seç'),
      ),
      myStraits.length ? h('div', {}, h('b', {}, 'İdarendeki boğazlar'), straitRows(myStraits, d.giveStraits, 'ver')) : null,
      theirStraits.length ? h('div', {}, h('b', {}, `${gen(them.name)} boğazları`), straitRows(theirStraits, d.takeStraits, 'iste')) : null,
      h('p', { class: 'muted' }, 'Vergi 0 = vergi muafiyeti. Teklif kabul edildiği anda geçerli olur; kaynaklar o an yetmezse teklif düşer.'),
    );
    modal = openModal({
      title: `Teklif → ${them.name}`,
      icon: 'diplomacy',
      body,
      wide: true,
      buttons: [
        { label: 'Vazgeç', value: 'close' },
        { label: 'Gönder', value: 'send', primary: true },
      ],
    });
    void modal.result.then(async (v) => {
      if (v !== 'send') return;
      const items = this.draftItems(d);
      if (items.length === 0) {
        toast('Teklif boş', 'error');
        this.openComposer(d);
        return;
      }
      const ok = await this.act({ type: 'PROPOSE_OFFER', player: me, to: d.to, items });
      if (!ok) this.openComposer(d);
    });
  }

  private openStraits() {
    const s = this.state;
    const me = s.currentPlayer;
    const others = s.players.filter((p) => p.alive && p.id !== me);
    const mine = s.map.straits.filter((st) => s.straits[st.id].controller === me);
    let modal: ReturnType<typeof openModal> | null = null;
    const show = (tile: number) => {
      modal?.close();
      this.map.centerOn(tile);
      this.map.flash(s.map.straits.find((x) => x.tiles.includes(tile))?.tiles ?? [tile], '#000');
    };
    const cards = mine.map((st) => {
      const rows = others.map((p) => {
        const pol = straitPolicyFor(s, st.id, p.id);
        const allow = h('input', { type: 'checkbox', checked: pol.allow });
        const toll = h('input', { type: 'number', class: 'num', min: 0, value: pol.toll });
        const apply = () =>
          void this.act({ type: 'SET_STRAIT_POLICY', player: me, straitId: st.id, target: p.id, allow: allow.checked, toll: Math.max(0, Math.floor(Number(toll.value) || 0)) });
        allow.addEventListener('change', apply);
        toll.addEventListener('change', apply);
        return h(
          'tr',
          {},
          h('td', {}, h('span', { class: 'dot', style: { background: p.color } }), ' ', p.name),
          h('td', {}, h('label', {}, allow, ' Geçiş izni')),
          h('td', {}, 'Vergi: ', toll, ' akçe'),
        );
      });
      return h(
        'div',
        { class: 'strait-card' },
        h('div', { class: 'row' }, icon('strait'), h('b', {}, straitLabel(st.id)), ` ${tileLabel(s, st.tiles[0])}`, h('button', { class: 'btn btn-small', onClick: () => show(st.tiles[0]) }, 'Haritada göster')),
        h('table', { class: 'table' }, h('tbody', {}, rows)),
      );
    });
    const all = s.map.straits.map((st) => {
      const c = s.straits[st.id].controller;
      return h(
        'tr',
        {},
        h('td', {}, icon('strait'), ` ${straitLabel(st.id)}`),
        h('td', {}, tileLabel(s, st.tiles[0])),
        h('td', {}, c === null ? 'İdare yok' : h('span', {}, h('span', { class: 'dot small', style: { background: s.players[c].color } }), ` ${pname(s, c)}`)),
        h('td', {}, c !== null && c !== me ? (straitPolicyFor(s, st.id, me).allow ? `Sana açık · vergi ${straitPolicyFor(s, st.id, me).toll}` : 'Sana kapalı') : ''),
        h('td', { class: 'right' }, h('button', { class: 'btn btn-small', onClick: () => show(st.tiles[0]) }, 'Göster')),
      );
    });
    modal = openModal({
      title: `Boğazlar — ${pname(s, me)}`,
      icon: 'strait',
      wide: true,
      body: h(
        'div',
        {},
        mine.length
          ? cards
          : h('p', {}, 'Hiçbir boğazı idare etmiyorsun. Bir boğazın iki yakasındaki tüm kara karelerine sahip olursan boğazı idare edersin.'),
        h('p', { class: 'muted' }, 'Ayarlar her oyuncu için ayrıdır ve hemen geçerli olur. Boğazın idaresi kaybedilirse ayarlar sıfırlanır.'),
        h('h3', {}, 'Tüm boğazlar'),
        h('table', { class: 'table' }, h('tbody', {}, all)),
      ),
    });
  }

  private openSaveDialog() {
    if (this.net?.kind === 'client') {
      toast('Çevrimiçi oyunu oda sahibi kaydeder (her tur sonunda otomatik).', 'info', 4000);
      return;
    }
    const input = h('input', { type: 'text', class: 'text', value: `${this.state.players.map((p) => p.name).join(', ')} — ${this.state.round}. tur` });
    const m = openModal({
      title: 'Oyunu kaydet',
      icon: 'save',
      body: h('div', {}, h('p', {}, 'Kayıt adı:'), input, h('p', { class: 'muted' }, 'Kayıtlar bu tarayıcıda saklanır. Başka cihaza taşımak için JSON olarak dışa aktar.')),
      buttons: [
        { label: 'JSON dışa aktar', value: 'export' },
        { label: 'Kaydet', value: 'save', primary: true },
      ],
    });
    setTimeout(() => input.select(), 30);
    void m.result.then((v) => {
      if (v === 'save') {
        try {
          saveGame(this.state, input.value.trim() || 'Kayıt', undefined, this.recorder?.data());
          toast('Oyun kaydedildi', 'good');
        } catch (e) {
          toast((e as Error).message, 'error', 5000);
        }
      } else if (v === 'export') this.exportJson();
    });
  }

  private exportJson() {
    download(`inek-surusu-${this.state.map.seed}-tur${this.state.round}.json`, exportState(this.state, this.recorder?.data()));
  }

  private openGameMenu() {
    const m = openModal({
      title: 'Menü',
      icon: 'menu',
      body: h(
        'div',
        { class: 'choice-list' },
        h('button', { class: 'choice', onClick: () => (m.close(), this.openSaveDialog()) }, icon('save', { cls: 'choice-icon' }), 'Kaydet'),
        h('button', { class: 'choice', onClick: () => (m.close(), this.exportJson()) }, icon('download', { cls: 'choice-icon' }), 'JSON olarak dışa aktar'),
        h('button', { class: 'choice', onClick: () => (m.close(), this.openRules()) }, icon('book', { cls: 'choice-icon' }), 'Kurallar (özet)'),
        h('button', { class: 'choice', onClick: () => (m.close(), this.openSettings()) }, icon('settings', { cls: 'choice-icon' }), 'Görünüm, hız ve ses'),
        h(
          'button',
          {
            class: 'choice',
            onClick: () => {
              m.close();
              this.autosave();
              this.cb.toMenu();
            },
          },
          icon('home', { cls: 'choice-icon' }),
          'Ana menüye dön (otomatik kaydedilir)',
        ),
      ),
    });
  }

  private openSettings() {
    const p = getPrefs();
    const anim = h(
      'select',
      { onChange: (e: Event) => setPrefs({ animSpeed: (e.target as HTMLSelectElement).value as 'normal' | 'fast' | 'off' }) },
      ...(
        [
          ['normal', 'Normal'],
          ['fast', 'Hızlı'],
          ['off', 'Kapalı'],
        ] as const
      ).map(([v, l]) => h('option', { value: v, selected: p.animSpeed === v }, l)),
    );
    const pass = h('input', { type: 'checkbox', checked: p.passScreen, onChange: (e: Event) => setPrefs({ passScreen: (e.target as HTMLInputElement).checked }) });
    openModal({
      title: 'Görünüm, hız ve ses',
      icon: 'settings',
      body: h(
        'div',
        { class: 'form-grid' },
        h('label', {}, 'Topaç/savaş animasyonu'),
        anim,
        h('label', {}, 'Sıra değişince "Sıra: X" ekranı (hot-seat)'),
        pass,
        soundControls(),
      ),
      buttons: [{ label: 'Tamam', value: 'ok', primary: true }],
    });
  }

  private openRules() {
    const c = this.state.config;
    openModal({
      title: 'Kurallar (özet)',
      icon: 'book',
      wide: true,
      body: h(
        'div',
        { class: 'rules' },
        h('p', {}, `Kurulum: başkent ve 9 başlangıç toprağı madensiz karelerden seçilir. Her tur: madenler 1'er kaynak verir → sekizgen topacı bir kez çevir (sayı × ${c.spinMultiplier} akçe) → istediğin kadar eylem yap → turu bitir.`),
        h(
          'ul',
          {},
          h('li', {}, `Sahipsiz komşu toprak: ${c.claimCost} akçe. 1 altın = ${c.goldToAkce} akçe.`),
          h('li', {}, `Tersane ${c.shipyardCost} (denize kıyı), uçak fabrikası ${c.factoryCost}, askeri üs ${c.baseCost} akçe (başkente kurulamaz). Karede tek yapı.`),
          h('li', {}, `Gemi: ${c.shipIronCost} demir + ${c.shipAkceCost} akçe. Uçak: ${c.planeSteelCost} çelik + ${c.planeAkceCost} akçe. Kalıcıdırlar.`),
          h('li', {}, 'Turda yalnızca 1 savaş (kara, gemi/uçakla saldırı, başkent ya da üs savaşı). Sahipsiz toprak almak savaş sayılmaz.'),
          c.battleCostsEnabled
            ? h('li', {}, `Savaş masrafı (başlatırken, sonuçtan bağımsız): normal ${battleCostText(battleCost(this.state, 'land'))}, üs ${battleCostText(battleCost(this.state, 'base'))}, başkent ${battleCostText(battleCost(this.state, 'capital'))}.`)
            : null,
          c.upkeepEnabled
            ? h('li', {}, `Tur başı bakım (topaçtan önce): gemi ${c.shipUpkeep}, uçak ${c.planeUpkeep}, askeri üs ${c.baseUpkeep} akçe. Ödenemeyen kadar birim dağıtılır, üs yıkılır.`)
            : null,
          c.weaknessRule ? h('li', {}, 'Zayıflık şartı: başkente saldırmak için savunanın toprağı saldıranınkinin yarısından az olmalı.') : null,
          c.openingPeace ? h('li', {}, `Açılış barışı: ilk ${c.openingPeaceRounds} tur kimse başka oyuncunun toprağına saldıramaz.`) : null,
          h('li', {}, 'Kara savaşı: iki taraf topaç çevirir. A > D ise saldıran A − D toprak seçer; A < D ise savunan karşı saldırıyla ⌈(D − A) / 2⌉ toprak seçer; eşitlik sonuçsuz.'),
          h('li', {}, `Başkent savaşı: ${c.capitalStreak} kez art arda yüksek at (eşitlik tekrar). Başkent düşerse oyuncu elenir, her şeyi saldırana geçer.`),
          h('li', {}, `Askeri üs savaşı: ${c.baseStreak} kez art arda yüksek at. Başkent/üs savaşını kaybetmenin toprak bedeli yok.`),
          h('li', {}, `Gemi seferi: ${c.shipOilCost} petrol, deniz yoluyla kıyı topraklarına. Uçak seferi: ${c.planeOilCost} petrol, her yere — düşman üslerinin ${c.baseBlockRadius} kare çevresi hariç.`),
          h('li', {}, `Sefer hedefi sahipsizse ${c.expeditionClaimCost} akçeyle alınır, sahipliyse savaş olur. Maden kareleri seferle doğrudan alınamaz; başkente gemi ya da uçakla saldırılamaz (yalnızca karadan).`),
          h('li', {}, 'Boğazın iki yakası da senin ise boğazı idare edersin: her oyuncu için geçiş izni ve vergi belirleyebilirsin.'),
          h('li', {}, 'Müttefiklere ve barış yapılanlara saldırılamaz. İttifak kendi turunda bozulabilir; o tur eski müttefike saldırılamaz.'),
          h('li', {}, 'Kazanma: tek devlet kalırsa ya da kalan herkes müttefikse ve oybirliğiyle bitirmeye karar verirse.'),
        ),
      ),
    });
  }
}
