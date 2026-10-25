import { BOT_LEVEL_NAME, getBot } from '../../bot';
import {
  RESOURCE_KEYS,
  BATTLE_USED,
  allAliveAllied,
  battleCost,
  battleCostText,
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
  type Action,
  type BuildableStructure,
  type GameEvent,
  type GameState,
  type Offer,
  type OfferItem,
  type ResourceKey,
  type UnitKind,
} from '../../engine';
import { clear, download, h, openModal, sleep, toast, type Child } from '../dom';
import {
  RES_ICON,
  RES_NAME,
  STRUCT_ICON,
  STRUCT_NAME,
  UNIT_ICON,
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
import { autosave, exportState, saveGame } from '../storage';
import type { ClientRoom } from '../../net/clientRoom';
import type { HostRoom } from '../../net/hostRoom';
import type { Presence } from '../../net/protocol';
import { MapView, type Highlight } from './mapView';
import { Spinner } from './spinner';

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
  /** Aynı teklif/oylama için ikinci kez soru açılmasın */
  private prompted = new Set<string>();

  private elTop!: HTMLElement;
  private elPlayers!: HTMLElement;
  private elLog!: HTMLElement;
  private elActions!: HTMLElement;
  private elBanner!: HTMLElement;
  private elTip!: HTMLElement;
  private elMapWrap!: HTMLElement;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    host: HTMLElement,
    state: GameState,
    private cb: GameScreenCallbacks,
    private net: NetMode = null,
  ) {
    this.state = state;
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
    if (this.presenceTimer) clearInterval(this.presenceTimer);
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

  private buildLayout(): HTMLElement {
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
        h('div', { class: 'brand', title: 'Ana menü', onClick: () => this.openGameMenu() }, '🐄 İnek Sürüsü'),
        this.elTop,
        h(
          'div',
          { class: 'top-controls' },
          h('label', { class: 'fast-toggle', title: 'Bot hamlelerini hızlı oynat' }, fast, ' ⚡ Hızlı oynat'),
          h('button', { class: 'btn btn-small', title: 'Kaydet', onClick: () => this.openSaveDialog() }, '💾'),
          h('button', { class: 'btn btn-small', title: 'Menü', onClick: () => this.openGameMenu() }, '☰'),
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
          h('section', { class: 'log-section' }, h('h3', {}, 'Olay günlüğü'), this.elLog),
        ),
      ),
      h('footer', {}, this.elActions),
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
            await this.enqueue(() => this.commit({ type: 'CAST_VOTE', player: voter.id, accept }));
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

  private turnNotice(p: number, counter: boolean) {
    if (this.net) toast(counter ? '🛡️ Karşı saldırıyı kazandın! Alacağın toprakları seç.' : '🎡 Sıra sende!', 'good', 3000);
    const incoming = this.state.offers.filter((o) => o.to === p).length;
    if (incoming > 0) toast(`📜 ${incoming} bekleyen teklifin var (Diplomasi)`, 'info', 4000);
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
    if (this.net?.kind === 'host') this.net.room.broadcastUpdate(r.state, r.events, origin);
    // Animasyonlar (topaç, savaş, sefer) eski durum üzerinde oynar, sonuç sonra görünür
    await this.animate(r.events, byBot, r.state);
    this.state = r.state;
    this.targetCache = null;
    this.render();
    for (const e of r.events) if (e.type === 'offer_made') await this.routeOffer(e.offer);
    if (action.type === 'END_TURN' || r.events.some((e) => e.type === 'game_over')) autosave(this.state);
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
          if (f > 0) await this.showSpin(e.player, e.value, f);
          break;
        }
        case 'battle': {
          const human = isHuman(e.attacker) || isHuman(e.defender);
          const f = animFactor(!human);
          if (f > 0) await this.showBattle(e, f, (mine(e.attacker) || mine(e.defender)) && f >= 1);
          break;
        }
        case 'expedition': {
          const f = animFactor(byBot);
          if (f > 0) await this.map.animatePath(e.from, e.path, UNIT_ICON[e.unit], 45 * f);
          break;
        }
        case 'claim':
        case 'conquer':
        case 'base_captured':
          this.map.flash([e.tile], s.players[e.player].color);
          break;
        case 'eliminated':
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
      const answer = await this.askOffer(offer, true);
      if (answer !== 'later') await this.commit({ type: 'RESPOND_OFFER', player: to.id, offerId: offer.id, accept: answer === 'accept' });
      await this.passDevice(from.id, 'Teklif yanıtlandı, sıra yine sende.');
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
          room.broadcastUpdate(st, []);
          this.render();
        }).then(() => this.pump());
      };
      room.events.onPresence = (p) => {
        this.presence = { ...p };
        this.render();
      };
      room.events.onNotice = (text) => toast(text, 'info', 4000);
    } else {
      const room = net.room;
      room.events.onUpdate = (state, events) => {
        void this.enqueue(async () => {
          const byBot = state.players[this.actorOf(state)]?.kind === 'bot';
          await this.animate(events, byBot, state);
          this.state = state;
          this.targetCache = null;
          this.render();
          for (const e of events) if (e.type === 'offer_made' && this.mine(e.offer.to)) void this.promptOffer(e.offer);
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
        void this.askVote(me).then((accept) => this.act({ type: 'CAST_VOTE', player: me, accept }));
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
      this.connEl = h('div', { class: 'conn-banner' }, '📡 Oda sahibiyle bağlantı koptu, yeniden bağlanılıyor…');
      document.body.appendChild(this.connEl);
    } else if (status === 'closed' && !this.destroyed) {
      const m = openModal({
        title: '📡 Bağlantı kapandı',
        body: h('p', {}, reason ?? 'Oda kapandı.'),
        buttons: [{ label: 'Ana menü', value: 'menu', primary: true }],
        closable: false,
      });
      void m.result.then(() => this.cb.toMenu());
    }
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
    const title = e.kind === 'land' ? '⚔️ Kara savaşı' : e.kind === 'capital' ? '🏰 Başkent savaşı' : '🛡️ Askeri üs savaşı';
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
      h('div', { class: 'overlay-title' }, `${title}${via}`),
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
    return new Promise((resolve) => {
      const btn = h('button', { class: 'btn btn-primary btn-big' }, 'Hazırım');
      const el = h(
        'div',
        { class: 'overlay pass-screen', style: { background: pl.color } },
        h(
          'div',
          { class: 'overlay-card' },
          h('div', { class: 'pass-hand' }, '📱'),
          h('h1', {}, isTurn ? `Sıra: ${pl.name}` : pl.name),
          h('p', {}, `Cihazı ${pl.name} oyuncusuna verin.`),
          h('p', { class: 'muted' }, message),
          btn,
        ),
      );
      btn.addEventListener('click', () => {
        el.remove();
        resolve();
      });
      document.body.appendChild(el);
      btn.focus();
    });
  }

  private async askVote(p: number): Promise<boolean> {
    const s = this.state;
    const ph = s.phase;
    const proposer = ph.kind === 'vote' ? pname(s, ph.proposer) : '?';
    const m = openModal({
      title: `🗳️ Oylama — ${pname(s, p)}`,
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
    return (await m.result) === 'yes';
  }

  private async askOffer(offer: Offer, allowLater: boolean): Promise<'accept' | 'reject' | 'later'> {
    const s = this.state;
    const m = openModal({
      title: `📜 ${gen(pname(s, offer.from))} teklifi`,
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
    return (await m.result) as 'accept' | 'reject' | 'later';
  }

  private victoryShown = false;
  private showVictory() {
    if (this.victoryShown) return;
    this.victoryShown = true;
    const s = this.state;
    const winners = s.winners ?? [];
    const el = this.overlay(
      h('div', { class: 'trophy' }, '🏆'),
      h('h1', {}, winners.length > 1 ? 'İttifak kazandı!' : `${pname(s, winners[0])} kazandı!`),
      h('p', {}, winners.length > 1 ? winners.map((w) => pname(s, w)).join(', ') : 'Dünyada tek bir devlet kaldı.'),
      h('p', { class: 'muted' }, `${s.round} tur sürdü · Seed ${s.map.seed}`),
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

  private renderTop() {
    const s = this.state;
    const p = s.players[this.actor()];
    const st = playerStats(s, p.id);
    const res = p.resources;
    clear(this.elTop);
    this.elTop.append(
      h(
        'div',
        { class: 'who' },
        h('span', { class: 'dot big', style: { background: p.color } }),
        h('div', {}, h('div', { class: 'who-name' }, p.name, p.kind === 'bot' ? h('span', { class: 'tag', title: 'Bot seviyesi' }, `Bot · ${BOT_LEVEL_NAME[p.botLevel].toLocaleLowerCase('tr')}`) : null), h('div', { class: 'who-phase' }, this.phaseText())),
      ),
      h(
        'div',
        { class: 'stats' },
        RESOURCE_KEYS.map((k) => h('span', { class: 'stat', title: RES_NAME[k] }, RES_ICON[k], ' ', h('b', {}, fmtNum(res[k])))),
        h('span', { class: 'stat', title: 'Gemi' }, '🚢 ', h('b', {}, st.ships)),
        h('span', { class: 'stat', title: 'Uçak' }, '✈️ ', h('b', {}, st.planes)),
        h('span', { class: 'stat', title: 'Toprak' }, '🟩 ', h('b', {}, st.tiles)),
        s.config.upkeepEnabled ? h('span', { class: 'stat', title: 'Her tur başında gemi, uçak ve askeri üsler için ödenir' }, '🧾 Tur başı bakım: ', h('b', {}, `${fmtNum(upkeepDue(s, p.id))} akçe`)) : null,
      ),
      h('div', { class: 'meta' }, s.round > 0 ? `${s.round}. tur` : 'Kurulum', h('br'), h('span', { class: 'muted', title: 'Harita seed değeri' }, `Seed ${s.map.seed}`)),
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
        if (isAllied(s, cur, p.id)) rel.push(h('span', { title: 'Müttefik' }, '🤝'));
        if (atPeace(s, cur, p.id)) rel.push(h('span', { title: `Barış (${getRelation(s, cur, p.id).peaceUntilRound}. tura kadar)` }, '☮️'));
      }
      const allies = s.players.filter((q) => q.id !== p.id && q.alive && isAllied(s, p.id, q.id));
      this.elPlayers.appendChild(
        h(
          'div',
          {
            class: `player-row ${p.id === cur ? 'current' : ''} ${p.alive ? '' : 'dead'}`,
            title: p.capital !== null ? 'Başkente git' : '',
            onClick: () => p.capital !== null && this.map.centerOn(p.capital),
          },
          h('span', { class: 'dot', style: { background: p.color } }),
          h(
            'div',
            { class: 'pr-main' },
            h('div', { class: 'pr-name' }, p.id === cur ? '▶ ' : '', p.name, p.kind === 'bot' ? h('span', { class: 'tag', title: 'Bot seviyesi' }, `Bot · ${BOT_LEVEL_NAME[p.botLevel].toLocaleLowerCase('tr')}`) : null, this.seatBadge(p.id), ' ', rel),
            p.alive
              ? h('div', { class: 'pr-stats' }, `🟩 ${st.tiles} · 🪙 ${fmtNum(p.resources.akce)} · 🚢 ${st.ships} · ✈️ ${st.planes}${s.config.upkeepEnabled ? ` · 🧾 ${fmtNum(upkeepDue(s, p.id))}` : ''}`)
              : h('div', { class: 'pr-stats' }, `☠️ Elendi${p.eliminatedBy !== null ? ` (${pname(s, p.eliminatedBy)})` : ''}`),
            allies.length ? h('div', { class: 'pr-allies' }, '🤝 ', allies.map((a) => h('span', { class: 'dot small', title: a.name, style: { background: a.color } }))) : null,
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
      this.elLog.appendChild(h('div', { class: `log-line ${cls}` }, text));
    }
  }

  private renderActions() {
    const s = this.state;
    clear(this.elActions);
    const human = this.isHumanTurn();
    const actions = human && s.phase.kind === 'actions';
    const me = this.actor();
    const incoming = s.offers.filter((o) => o.to === me).length;
    const used = actions && battleUsed(s, me);
    type BtnOpts = { active?: boolean; enabled?: boolean; badge?: number; title?: string; cls?: string; locked?: string };
    const btn = (icon: string, label: string, onClick: () => void, opts: BtnOpts = {}) =>
      h(
        'button',
        {
          // Kilitli düğme gerçekten devre dışı değildir ki üzerine gelince/tıklayınca neden görünsün
          class: `action-btn ${opts.active ? 'active' : ''} ${opts.locked ? 'locked' : ''} ${opts.cls ?? ''}`,
          disabled: !(opts.enabled ?? actions),
          'aria-disabled': opts.locked ? 'true' : null,
          title: opts.locked ?? opts.title ?? label,
          onClick: opts.locked ? () => toast(opts.locked!, 'error') : onClick,
        },
        h('span', { class: 'ab-icon' }, icon),
        h('span', { class: 'ab-label' }, label),
        opts.badge ? h('span', { class: 'badge' }, opts.badge) : null,
      );
    const m = this.mode.kind;
    const toggle = (mode: Mode) => () => this.setMode(this.mode.kind === mode.kind ? { kind: 'none' } : mode);
    this.elActions.append(
      btn('🟩', 'Toprak al', toggle({ kind: 'claim' }), { active: m === 'claim', title: `Sahipsiz komşu toprak (${s.config.claimCost} akçe)` }),
      btn('🔨', 'İnşa et', () => this.openBuildDialog(), { active: m === 'build' }),
      btn('🏭', 'Üret', toggle({ kind: 'produce' }), { active: m === 'produce', title: 'Tersanede gemi, fabrikada uçak üret' }),
      btn('⚔️', 'Saldır', toggle({ kind: 'attack' }), { active: m === 'attack', locked: used ? BATTLE_USED : undefined, title: 'Turda tek savaş hakkın var' }),
      btn('🚢', 'Gemi seferi', toggle({ kind: 'expedition', unit: 'ship', unitId: null }), { active: m === 'expedition' && this.mode.kind === 'expedition' && this.mode.unit === 'ship' }),
      btn('✈️', 'Uçak seferi', toggle({ kind: 'expedition', unit: 'plane', unitId: null }), { active: m === 'expedition' && this.mode.kind === 'expedition' && this.mode.unit === 'plane' }),
      btn('🥇', 'Altın bozdur', () => this.openGoldDialog(), { enabled: human && (s.phase.kind === 'actions' || s.phase.kind === 'spin') }),
      btn('📜', 'Diplomasi', () => this.openDiplomacy(), { badge: incoming }),
      btn('⚓', 'Boğazlarım', () => this.openStraits(), { enabled: human && s.phase.kind !== 'setup_capital' && s.phase.kind !== 'setup_territory' }),
      btn('⏭️', 'Turu bitir', () => void this.endTurn(), { cls: 'end-turn' }),
    );
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

  private setBanner(text: Child, buttons: { label: string; onClick: () => void; primary?: boolean }[] = []) {
    clear(this.elBanner);
    this.elBanner.classList.remove('hidden');
    this.elBanner.append(h('span', {}, text), ...buttons.map((b) => h('button', { class: `btn btn-small ${b.primary ? 'btn-primary' : ''}`, onClick: b.onClick }, b.label)));
  }

  /** Sıra bu cihazda değilken bilgi şeridi metni */
  private waitingText(): string {
    const s = this.state;
    const spectator = this.net?.kind === 'client' && this.net.room.seat === null ? '👀 İzliyorsun · ' : '';
    if (s.phase.kind === 'vote') {
      const ph = s.phase;
      const waiting = s.players.filter((p) => p.alive && !(p.id in ph.votes)).map((p) => p.name);
      return `${spectator}🗳️ Oylama: ${waiting.join(', ')} bekleniyor…`;
    }
    const a = this.actor();
    const p = s.players[a];
    const pres = this.presence[a];
    if (p.kind === 'bot') return `${spectator}🤖 ${p.name}${pres?.status === 'bot' ? ' (yerine bot)' : ''} düşünüyor…`;
    if (pres?.status === 'away') {
      const left = Math.max(0, Math.ceil(((pres.deadline ?? Date.now()) - Date.now()) / 1000));
      return `${spectator}📡 ${p.name} bağlantısı koptu. ${left} sn bekleniyor, sonra yerine bot oynayacak.`;
    }
    const counter = s.phase.kind === 'conquest' && s.phase.counter;
    return `${spectator}⏳ ${p.name} ${counter ? 'karşı saldırıda toprak seçiyor' : 'oynuyor'}…`;
  }

  /** Mevcut aşama/moda göre geçerli hedefler ve bilgi şeridi. */
  private renderTargets() {
    const s = this.state;
    const me = this.actor();
    const hl: Highlight = {};
    this.elBanner.classList.add('hidden');
    if (s.phase.kind === 'gameover') {
      this.setBanner('🏆 Oyun bitti.', [{ label: 'Ana menü', onClick: () => this.cb.toMenu() }]);
      this.map.setHighlight(hl);
      return;
    }
    if (!this.isHumanTurn()) {
      this.setBanner(this.waitingText());
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
      this.setBanner(`🏰 ${pname(s, me)}, başkentini seç: vurgulanan karelerden birine tıkla. Kırmızı maden kareleri yerleşimde seçilemez.`);
    } else if (ph.kind === 'setup_territory') {
      hl.groups = [{ tiles: new Set(startPickCandidates(s, me)), style: 'pick' }];
      this.setBanner(`🟩 Başlangıç toprağı seç: kalan ${ph.picksLeft}. Her kare bölgene bitişik olmalı; maden kareleri seçilemez.`, [
        { label: 'Seçimi bitir', onClick: () => void this.act({ type: 'SKIP_START_PICKS', player: me }) },
      ]);
    } else if (ph.kind === 'upkeep') {
      const akce = s.players[me].resources.akce;
      this.setBanner(`🧾 Bakım ${fmtNum(ph.due)} akçe, akçen ${fmtNum(akce)}. Ödenemeyen kadar birim ya da üs dağıtmalısın.`, [
        { label: 'Dağıtılacakları seç', primary: true, onClick: () => this.openUpkeepDialog() },
      ]);
      const key = `upkeep-${s.turnCounter}`;
      if (!this.prompted.has(key)) {
        this.prompted.add(key);
        setTimeout(() => this.openUpkeepDialog(), 0);
      }
    } else if (ph.kind === 'spin') {
      this.setBanner('🎡 Sıra sende! Önce sekizgen topacı çevir.', [{ label: '🎡 Topacı çevir', primary: true, onClick: () => void this.act({ type: 'SPIN', player: me }) }]);
    } else if (ph.kind === 'conquest') {
      hl.groups = [{ tiles: new Set(conquestCandidates(s)), style: 'attack' }];
      this.setBanner(
        ph.counter
          ? `🛡️ Karşı saldırı! ${pname(s, me)}, sana saldıran ${gen(pname(s, ph.victim))} sınırındaki topraklarından ${ph.remaining} tane seç.`
          : `⚔️ Zafer! ${pname(s, ph.victim)} topraklarından ${ph.remaining} tane seç.`,
        [
        { label: 'Fethi bitir', onClick: () => void this.act({ type: 'END_CONQUEST', player: me }) },
      ]);
    } else if (ph.kind === 'actions') {
      const mode = this.mode;
      switch (mode.kind) {
        case 'none':
          this.setBanner('Bir eylem seç ya da turu bitir. Haritayı sürükleyerek kaydır, tekerlekle yakınlaş.');
          break;
        case 'claim': {
          const t = claimableTiles(s, me);
          hl.groups = [{ tiles: new Set(t), style: 'claim' }];
          this.setBanner(t.length ? `🟩 Sahipsiz komşu toprak al (${s.config.claimCost} akçe).` : 'Alınabilecek sahipsiz komşu toprak yok ya da akçe yetersiz.', [cancel]);
          break;
        }
        case 'build': {
          const t = buildableTiles(s, me, mode.structure);
          hl.groups = [{ tiles: new Set(t), style: 'build' }];
          this.setBanner(
            t.length
              ? `${STRUCT_ICON[mode.structure]} ${STRUCT_NAME[mode.structure]} için yer seç (${structureCost(s, mode.structure)} akçe).`
              : `${STRUCT_NAME[mode.structure]} için uygun boş toprağın yok${mode.structure === 'shipyard' ? ' (denize kıyısı olan bir toprak gerekir)' : ''}.`,
            [cancel],
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
              ? `🏭 Tersaneye tıkla: gemi (${c.shipIronCost} demir + ${c.shipAkceCost} akçe${c.upkeepEnabled ? `, bakım ${c.shipUpkeep}/tur` : ''}) · Fabrikaya tıkla: uçak (${c.planeSteelCost} çelik + ${c.planeAkceCost} akçe${c.upkeepEnabled ? `, bakım ${c.planeUpkeep}/tur` : ''})`
              : 'Üretim için tersane/uçak fabrikası ve yeterli kaynak gerekli.',
            [cancel],
          );
          break;
        }
        case 'attack': {
          const t = attackableTiles(s, me);
          hl.groups = [{ tiles: new Set(t), style: 'attack' }];
          this.setBanner(
            battleUsed(s, me)
              ? `⚔️ ${BATTLE_USED}.`
              : openingPeaceActive(s)
                ? `☮️ Açılış barışı: ${s.config.openingPeaceRounds}. tur sonuna kadar kimse başka oyuncunun toprağına saldıramaz.`
              : t.length
                ? `⚔️ Saldırılacak komşu düşman toprağını seç (turda tek savaş). ${this.battleCostsLine()} Kaybedersen savunan karşı saldırıyla toprak alır.`
                : 'Saldırılabilecek komşu düşman toprağı yok.',
            [cancel],
          );
          break;
        }
        case 'expedition': {
          const units = readyUnits(s, me, mode.unit);
          const icon = UNIT_ICON[mode.unit];
          const name = mode.unit === 'ship' ? 'Gemi' : 'Uçak';
          if (mode.unitId === null || !units.some((u) => u.id === mode.unitId)) {
            const homes = new Set(units.map((u) => u.tile));
            if (homes.size === 1) {
              mode.unitId = units[0].id;
            } else {
              hl.groups = [{ tiles: homes, style: 'select' }];
              this.setBanner(
                units.length
                  ? `${icon} Sefere çıkacak ${name.toLocaleLowerCase('tr')} için ${mode.unit === 'ship' ? 'tersaneyi' : 'fabrikayı'} seç.`
                  : `Sefere hazır ${name.toLocaleLowerCase('tr')} yok (${mode.unit === 'ship' ? s.config.shipOilCost : s.config.planeOilCost} petrol gerekir).`,
                [cancel],
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
            `${icon} ${name} seferi (${mode.unit === 'ship' ? s.config.shipOilCost : s.config.planeOilCost} petrol): sarı = sahipsiz (${s.config.expeditionClaimCost} akçe), ${battleUsed(s, me) ? 'savaş hakkın bu tur kullanıldı' : `kırmızı = savaş${s.config.battleCostsEnabled ? ` (+${battleCostText(battleCost(s, 'land'))}, üs ${battleCostText(battleCost(s, 'base'))})` : ''}`}.${mode.unit === 'plane' ? ' Taralı kırmızı alan: düşman üssü engeli.' : ''}`,
            [...others, cancel],
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
          this.setBanner(`📜 Teklif için ${mode.side === 'give' ? 'vereceğin' : `${gen(pname(s, d.to))} vermesini istediğin`} toprakları seç (${set.size} seçili).`, [
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
    if (document.querySelector('.modal-backdrop, .overlay')) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'Escape' && this.mode.kind !== 'none') this.setMode({ kind: 'none' });
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
      if (mine) lines.push(h('div', {}, `${RES_ICON[mine]} ${RES_NAME[mine]} madeni`));
      const st = s.structure[t];
      if (st) lines.push(h('div', {}, `${STRUCT_ICON[st]} ${STRUCT_NAME[st]}`));
      const units = unitsAt(s, t);
      if (units.length) {
        const ships = units.filter((u) => u.kind === 'ship').length;
        const planes = units.length - ships;
        lines.push(h('div', {}, [ships ? `🚢 ${ships} gemi` : '', planes ? `✈️ ${planes} uçak` : ''].filter(Boolean).join(' · ')));
      }
      const banks = m.straits.filter((x) => x.banks.includes(t));
      for (const b of banks) lines.push(h('div', { class: 'muted' }, `⚓ ${straitLabel(b.id)} boğazının yakası`));
    }
    const sid = m.straitOf[t];
    if (sid >= 0) {
      const ctl = s.straits[sid].controller;
      lines.push(h('div', {}, `⚓ ${straitLabel(sid)} · idare: ${ctl === null ? 'yok' : pname(s, ctl)}`));
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
    const row = (label: string, upkeep: number, btn: string, a: Action) =>
      h('div', { class: 'seat-row' }, h('span', { class: 'grow' }, label, h('span', { class: 'muted small' }, ` · bakım ${upkeep}`)), h('button', { class: 'btn btn-small btn-danger', onClick: () => run(a) }, btn));
    modal = openModal({
      title: '🧾 Bakım ödenemiyor',
      closable: false,
      body: h(
        'div',
        {},
        h('p', {}, `Bu turun bakımı ${fmtNum(s.phase.due)} akçe, elinde ${fmtNum(res.akce)} akçe var. Borç akçene inene kadar birim dağıt ya da üs yık; kalan bakım otomatik ödenir.`),
        res.gold > 0
          ? h('p', {}, h('button', { class: 'btn btn-small btn-primary', onClick: () => run({ type: 'EXCHANGE_GOLD', player: me, amount: res.gold }) }, `🥇 ${res.gold} altını bozdur (+${fmtNum(res.gold * c.goldToAkce)} akçe)`))
          : null,
        units.map((u) => row(`${UNIT_ICON[u.kind]} ${u.kind === 'ship' ? 'Gemi' : 'Uçak'} ${tileLabel(s, u.tile)}`, u.kind === 'ship' ? c.shipUpkeep : c.planeUpkeep, 'Dağıt', { type: 'DISBAND_UNIT', player: me, unitId: u.id })),
        // Bakımsız üsleri yıkmak borcu azaltmaz
        c.baseUpkeep <= 0 ? null : bases.map((t) => row(`${STRUCT_ICON.base} Askeri üs ${tileLabel(s, t)} (toprak sende kalır)`, c.baseUpkeep, 'Yık', { type: 'DEMOLISH_BASE', player: me, tile: t })),
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
      title: '🔨 İnşa et',
      body: h(
        'div',
        { class: 'choice-list' },
        items.map((it) => {
          const cost = structureCost(s, it.s);
          const can = me.resources.akce >= cost;
          return h(
            'button',
            { class: 'choice', disabled: !can, onClick: () => m.close(it.s) },
            h('span', { class: 'choice-icon' }, STRUCT_ICON[it.s]),
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
      title: '🥇 Altın bozdur',
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
      const status: string[] = [];
      if (!p.alive) status.push('☠️ Elendi');
      if (rel.allied) status.push('🤝 Müttefik');
      if (atPeace(s, me, p.id)) status.push(`☮️ Barış (${rel.peaceUntilRound}. tur sonuna kadar)`);
      if (rel.allianceBrokenAtTurn === s.turnCounter) status.push('💔 İttifak bu tur bozuldu');
      if (status.length === 0) status.push('—');
      return h(
        'tr',
        { class: p.alive ? '' : 'dead' },
        h('td', {}, h('span', { class: 'dot', style: { background: p.color } }), ' ', p.name, p.kind === 'bot' ? h('span', { class: 'tag', title: 'Bot seviyesi' }, `Bot · ${BOT_LEVEL_NAME[p.botLevel].toLocaleLowerCase('tr')}`) : null),
        h('td', {}, status.join(' · ')),
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
            h('button', { class: 'btn btn-primary', onClick: () => after({ type: 'PROPOSE_VICTORY', player: me }) }, '🗳️ İttifakla bitirmeyi öner'),
          )
        : null,
    );
    modal = openModal({ title: `📜 Diplomasi — ${pname(s, me)}`, body, wide: true });
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
      h('div', { class: 'row' }, h('label', {}, check(d.alliance, (v) => (d.alliance = v), allied), allied ? ' 🤝 Zaten müttefiksiniz' : ' 🤝 İttifak kur')),
      h(
        'div',
        { class: 'row' },
        h('label', {}, check(d.peace, (v) => (d.peace = v)), ' ☮️ Barış (saldırmazlık): '),
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
        `🟩 Vereceğin topraklar: ${d.giveTiles.size} `,
        h('button', { class: 'btn btn-small', onClick: () => pickTiles('give') }, 'Haritadan seç'),
        `  ·  İstediğin topraklar: ${d.takeTiles.size} `,
        h('button', { class: 'btn btn-small', onClick: () => pickTiles('take') }, 'Haritadan seç'),
      ),
      myStraits.length ? h('div', {}, h('b', {}, 'İdarendeki boğazlar'), straitRows(myStraits, d.giveStraits, 'ver')) : null,
      theirStraits.length ? h('div', {}, h('b', {}, `${gen(them.name)} boğazları`), straitRows(theirStraits, d.takeStraits, 'iste')) : null,
      h('p', { class: 'muted' }, 'Vergi 0 = vergi muafiyeti. Teklif kabul edildiği anda geçerli olur; kaynaklar o an yetmezse teklif düşer.'),
    );
    modal = openModal({
      title: `📜 Teklif → ${them.name}`,
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
        h('div', { class: 'row' }, h('b', {}, `⚓ ${straitLabel(st.id)}`), ` ${tileLabel(s, st.tiles[0])}`, h('button', { class: 'btn btn-small', onClick: () => show(st.tiles[0]) }, 'Haritada göster')),
        h('table', { class: 'table' }, h('tbody', {}, rows)),
      );
    });
    const all = s.map.straits.map((st) => {
      const c = s.straits[st.id].controller;
      return h(
        'tr',
        {},
        h('td', {}, `⚓ ${straitLabel(st.id)}`),
        h('td', {}, tileLabel(s, st.tiles[0])),
        h('td', {}, c === null ? 'İdare yok' : h('span', {}, h('span', { class: 'dot small', style: { background: s.players[c].color } }), ` ${pname(s, c)}`)),
        h('td', {}, c !== null && c !== me ? (straitPolicyFor(s, st.id, me).allow ? `Sana açık · vergi ${straitPolicyFor(s, st.id, me).toll}` : 'Sana kapalı') : ''),
        h('td', { class: 'right' }, h('button', { class: 'btn btn-small', onClick: () => show(st.tiles[0]) }, 'Göster')),
      );
    });
    modal = openModal({
      title: `⚓ Boğazlarım — ${pname(s, me)}`,
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
      title: '💾 Oyunu kaydet',
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
          saveGame(this.state, input.value.trim() || 'Kayıt');
          toast('Oyun kaydedildi', 'good');
        } catch (e) {
          toast((e as Error).message, 'error', 5000);
        }
      } else if (v === 'export') this.exportJson();
    });
  }

  private exportJson() {
    download(`inek-surusu-${this.state.map.seed}-tur${this.state.round}.json`, exportState(this.state));
  }

  private openGameMenu() {
    const m = openModal({
      title: '☰ Menü',
      body: h(
        'div',
        { class: 'choice-list' },
        h('button', { class: 'choice', onClick: () => (m.close(), this.openSaveDialog()) }, '💾 Kaydet'),
        h('button', { class: 'choice', onClick: () => (m.close(), this.exportJson()) }, '⬇️ JSON olarak dışa aktar'),
        h('button', { class: 'choice', onClick: () => (m.close(), this.openRules()) }, '📖 Kurallar (özet)'),
        h('button', { class: 'choice', onClick: () => (m.close(), this.openSettings()) }, '⚙️ Görünüm ve hız'),
        h(
          'button',
          {
            class: 'choice',
            onClick: () => {
              m.close();
              autosave(this.state);
              this.cb.toMenu();
            },
          },
          '🏠 Ana menüye dön (otomatik kaydedilir)',
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
      title: '⚙️ Görünüm ve hız',
      body: h(
        'div',
        { class: 'form-grid' },
        h('label', {}, 'Topaç/savaş animasyonu'),
        anim,
        h('label', {}, 'Sıra değişince "Sıra: X" ekranı (hot-seat)'),
        pass,
      ),
      buttons: [{ label: 'Tamam', value: 'ok', primary: true }],
    });
  }

  private openRules() {
    const c = this.state.config;
    openModal({
      title: '📖 Kurallar (özet)',
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
