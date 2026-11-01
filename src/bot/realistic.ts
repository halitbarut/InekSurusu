import {
  allAliveAllied,
  atPeace,
  battleUsed,
  eventsSince,
  getRelation,
  isAllied,
  ledgerEntry,
  loanRemaining,
  loanTotal,
  manhattan,
  mixSeed,
  neighbors4,
  offerProblem,
  tileCount,
  type Action,
  type GameEvent,
  type GameState,
  type LoanRequest,
  type Offer,
  type OfferItem,
  type ResourceKey,
  type StraitPolicy,
} from '../engine';
import { viewFor } from '../net/protocol';
import { botDebug } from './debug';
import { MediumBot, MEDIUM_TUNING, eventsThisTurn, strongestOther, tileScore, type BotTuning } from './medium';
import { PERSONALITIES, PERSONALITY_NAME, PHRASES, type Personality, type PhraseTrigger } from './phrases';

const RES_TR: Partial<Record<ResourceKey, string>> = { oil: 'petrol', iron: 'demir', steel: 'çelik' };

/** Kişilik özellikleri, 0–1 */
export interface Traits {
  /** Savaşa ve başkent saldırısına isteklilik */
  aggression: number;
  /** Rakibi kollama, sınırları sağlama alma */
  caution: number;
  /** Takas ve borçtan kâr etme isteği */
  greed: number;
  /** Müttefikine bağlılık */
  loyalty: number;
  /** İşine geldiğinde ittifakı bozma isteği */
  treachery: number;
  /** Kin tutma */
  grudge: number;
  /** Fırsatçılık: zayıf komşuya saldırı */
  opportunism: number;
  /** Mesaj yazma sıklığı */
  chatter: number;
}

const BASE: Record<Personality, Traits> = {
  aggressive: { aggression: 0.9, caution: 0.2, greed: 0.3, loyalty: 0.25, treachery: 0.55, grudge: 0.9, opportunism: 0.5, chatter: 0.5 },
  cautious: { aggression: 0.25, caution: 0.9, greed: 0.4, loyalty: 0.7, treachery: 0.08, grudge: 0.5, opportunism: 0.2, chatter: 0.3 },
  merchant: { aggression: 0.4, caution: 0.55, greed: 0.95, loyalty: 0.45, treachery: 0.2, grudge: 0.45, opportunism: 0.35, chatter: 0.4 },
  opportunist: { aggression: 0.65, caution: 0.35, greed: 0.5, loyalty: 0.2, treachery: 0.8, grudge: 0.4, opportunism: 1, chatter: 0.45 },
  loyal: { aggression: 0.5, caution: 0.55, greed: 0.2, loyalty: 1, treachery: 0, grudge: 0.75, opportunism: 0.15, chatter: 0.5 },
};

/** Bot RNG'si: oyunun RNG'sinden bağımsız, oyuna özgü tohumdan türetilir. Geleceği göstermez, oyunu değiştirmez. */
function noise(state: GameState, p: number, salt: number): number {
  return mixSeed(mixSeed(state.botSeed ?? state.map.seed, p * 131 + salt), state.turnCounter) / 4294967296;
}

/** Oyun boyunca sabit kalan temel kişilik */
export function personalityOf(state: GameState, p: number): Personality {
  return PERSONALITIES[mixSeed(state.botSeed ?? state.map.seed, p + 7001) % PERSONALITIES.length];
}

/** Kişilik gidişata göre hafifçe değişir: ihanete uğrayan sertleşir, öne geçen cesaretlenir, küçülen temkinlenir */
export function traitsOf(state: GameState, p: number): Traits {
  const t = { ...BASE[personalityOf(state, p)] };
  let betrayed = 0;
  for (const q of state.players) if (q.id !== p) betrayed += ledgerEntry(state, q.id, p).betrayals;
  if (betrayed > 0) {
    t.aggression = Math.min(1, t.aggression + 0.15);
    t.loyalty = Math.max(0, t.loyalty - 0.2);
    t.grudge = Math.min(1, t.grudge + 0.15);
  }
  const me = tileCount(state, p);
  const alive = state.players.filter((q) => q.alive);
  const avg = alive.reduce((a, q) => a + tileCount(state, q.id), 0) / Math.max(1, alive.length);
  if (me > avg * 1.5) t.aggression = Math.min(1, t.aggression + 0.1);
  if (me < avg * 0.6) {
    t.caution = Math.min(1, t.caution + 0.2);
    t.aggression = Math.max(0, t.aggression - 0.15);
  }
  return t;
}

/** Kişilikten bot ayarları: aynı değerlendirme, farklı eşikler */
function tuningFor(t: Traits): BotTuning {
  return {
    ...MEDIUM_TUNING,
    minBattleValue: 0.65 - t.aggression * 1.05,
    maxUpkeepShare: 0.2 + t.aggression * 0.2,
    upkeepCap: 0.35 + t.aggression * 0.2,
    capitalWeakRatio: 0.7 + t.aggression * 1.3,
    capitalReserveUpkeep: t.caution > 0.5,
    maxShipsBase: t.caution > 0.7 ? 1 : 2,
    maxPlanesBase: t.aggression > 0.7 ? 3 : 2,
    diplomacyEvery: t.greed > 0.8 ? 2 : t.loyalty > 0.8 ? 3 : t.aggression > 0.8 ? 6 : 4,
    pushBonus: 0.3 + t.aggression * 0.7,
    permitRetryRounds: t.caution > 0.7 ? 8 : 4,
  };
}

/**
 * Gerçekçi bot: en güçlü değil, insan gibi oynayan rakip. Kişiliği, hafızası (`state.ledger`) ve ilişkileri vardır;
 * öne geçene karşı ittifak arar, işine gelince ittifakı bozar, pazarlık eder, ara sıra makul hatalar yapar.
 * Hile yapmaz: her karar `viewFor` görünümüyle verilir, yani RNG durumunu, başkalarının tekliflerini ve borçlarını görmez.
 * Hafıza bot nesnesinde değil oyun durumundadır; kayıtla taşınır, herkes yalnızca kendi tarafı olduğu kayıtları görür.
 */
export class RealisticBot extends MediumBot {
  /** Karar başında ayarları kişiliğe göre kurar */
  private prepare(raw: GameState, p: number): GameState {
    const view: GameState = { ...viewFor(raw, p), botSeed: raw.botSeed };
    this.tuning = tuningFor(traitsOf(view, p));
    return view;
  }

  override chooseAction(raw: GameState, p: number): Action {
    return super.chooseAction(this.prepare(raw, p), p);
  }

  override vote(raw: GameState, p: number): boolean {
    const s = this.prepare(raw, p);
    const t = traitsOf(s, p);
    const S = strongestOther(s, p);
    // Sadık hep kabul eder; hırslı olan öndeyken zaferi paylaşmak istemeyebilir
    const leading = S === null || tileCount(s, p) > tileCount(s, S) * 1.3;
    const yes = !(leading && noise(s, p, 11) < t.treachery * t.aggression);
    this.log(s, p, yes ? 'oylama: evet' : 'oylama: hayır', leading ? 'öndeyim, zaferi paylaşmak işime gelmiyor' : 'birlikte kazanmak iyi');
    return yes;
  }

  /** Düşünme süresi: kolay kararlar hızlı, zor kararlar yavaş */
  thinkMs(raw: GameState, p: number, a: Action): number {
    const n = noise(raw, p, 13 + raw.log.length);
    const span = (lo: number, hi: number) => Math.round(lo + (hi - lo) * n);
    switch (a.type) {
      case 'SPIN':
      case 'END_CONQUEST':
        return span(300, 700);
      case 'CLAIM_TILE':
      case 'PICK_START_TILE':
      case 'CONQUER_TILE':
      case 'EXCHANGE_GOLD':
      case 'PAY_UPKEEP':
        return span(250, 700);
      case 'BUILD':
      case 'PRODUCE':
      case 'DISBAND_UNIT':
      case 'DEMOLISH':
      case 'SET_STRAIT_POLICY':
        return span(500, 1100);
      case 'END_TURN':
        return span(500, 1200);
      case 'PLACE_CAPITAL':
      case 'SHIP_EXPEDITION':
      case 'PLANE_EXPEDITION':
      case 'PROPOSE_OFFER':
      case 'REQUEST_LOAN':
      case 'OFFER_LOAN':
      case 'RESPOND_OFFER':
      case 'COUNTER_OFFER':
      case 'RESPOND_LOAN':
      case 'RESPOND_PERMIT':
        return span(900, 2200);
      case 'ATTACK':
        return span(1200, 2800);
      case 'BREAK_ALLIANCE':
      case 'CAST_VOTE':
        return span(1800, 3500);
      case 'BOT_SAY':
        return span(700, 1400);
      default:
        return span(400, 900);
    }
  }

  private log(s: GameState, p: number, what: string, why: string) {
    botDebug({ round: s.round, player: p, personality: PERSONALITY_NAME[personalityOf(s, p)], what, why });
  }

  // ------------------------------------------------------------------
  // İlişkiler
  // ------------------------------------------------------------------

  /** Kin: q'nun bana yaptıkları; zamanla söner, yardım azaltır */
  private grudge(s: GameState, p: number, q: number): number {
    const e = ledgerEntry(s, q, p);
    const age = e.lastHostile === null ? 99 : s.round - e.lastHostile;
    const fresh = age < 6 ? 1 : age < 15 ? 0.6 : 0.25;
    const raw = e.attacks * 0.4 + e.tilesTaken * 0.15 + e.betrayals * 3 + e.permitsDenied * 0.3 + e.debtsDefaulted * 2;
    return Math.max(0, raw * fresh - e.helped * 0.5);
  }

  /** Güven: -1 kin tutulan, 0 nötr, 1 barış ya da yardım eden, 2 müttefik */
  protected override trust(s: GameState, p: number, q: number): number {
    if (s.loans.some((l) => l.borrower === q && l.lender === p && l.overdue)) return -1;
    const t = traitsOf(s, p);
    const g = this.grudge(s, p, q) * t.grudge;
    if (g > 1.2) return -1;
    if (isAllied(s, p, q)) return 2;
    if (atPeace(s, p, q) || ledgerEntry(s, q, p).helped > 0) return 1;
    return 0;
  }

  /** Boğazda: düşmana kapalı, müttefike açık, diğerlerinden açgözlülüğe ve ilişkiye göre vergi */
  protected override straitStance(s: GameState, p: number, q: number): StraitPolicy {
    const tr = this.trust(s, p, q);
    const t = traitsOf(s, p);
    if (tr < 0) return { mode: 'closed', toll: 0 };
    if (tr === 2) return { mode: 'open', toll: 0 };
    if (tr === 1 && t.greed < 0.5) return { mode: 'open', toll: 0 };
    const toll = Math.round(((tr === 1 ? 40 : 80) + t.greed * 160) / 10) * 10;
    return { mode: 'toll', toll };
  }

  /** Saldırı hedefi tercihi: kin, öndeki oyuncu, zayıf komşu; üstüne insani sezgi payı */
  protected override targetBias(s: GameState, p: number, q: number): number {
    const t = traitsOf(s, p);
    const me = tileCount(s, p);
    const them = tileCount(s, q);
    let b = Math.min(2.5, this.grudge(s, p, q) * t.grudge);
    const S = strongestOther(s, p);
    if (q === S && them > me) b += 0.5 * t.aggression;
    if (them < me * 0.6) b += 1.2 * t.opportunism;
    // Kusursuz hesap yok: kimi zaman içgüdüyle saldırır, kimi zaman gereğinden çekinir
    b += (noise(s, p, 300 + q) - 0.5) * 1.2;
    return b;
  }

  // ------------------------------------------------------------------
  // Tur kararları
  // ------------------------------------------------------------------

  protected override pickTurnAction(s: GameState, p: number): Action {
    const t = traitsOf(s, p);
    const say = this.pickMessage(s, p, t);
    if (say) return say;
    const betray = this.pickBetrayal(s, p, t);
    if (betray) return betray;
    // İnsan hatası: ara sıra tur planı aksar (gereğinden temkinli), savaşı ve kalan alımları es geçer
    if (noise(s, p, 21) < 0.02 + t.caution * 0.03 && !eventsThisTurn(s).some((e) => e.type === 'battle') && s.players[p].resources.akce > 0 && s.phase.kind === 'actions') {
      const events = eventsThisTurn(s);
      if (events.length > 2) {
        this.log(s, p, 'turu erken bitirdi', 'sezgisel: bu tur fazla risk almak istemedi');
        return { type: 'END_TURN', player: p };
      }
    }
    return super.pickTurnAction(s, p);
  }

  /** İşine geldiğinde ittifakı bozar: müttefik zayıfladıysa ya da yalnızca müttefikler kaldıysa ve öndeyse */
  private pickBetrayal(s: GameState, p: number, t: Traits): Action | null {
    if (t.treachery <= 0.01 || battleUsed(s, p)) return null;
    const me = tileCount(s, p);
    for (const q of s.players) {
      if (!q.alive || q.id === p || !isAllied(s, p, q.id)) continue;
      const them = tileCount(s, q.id);
      const onlyAllies = allAliveAllied(s);
      const weakAlly = them < me * 0.55 && bordersTiles(s, p, q.id);
      if (!weakAlly && !(onlyAllies && me > them * 1.25)) continue;
      // Karesi: fırsatçı belirgin şekilde sık, tüccar ve temkinli neredeyse hiç bozar
      if (noise(s, p, 40 + q.id) < t.treachery * t.treachery * 0.5) {
        this.log(s, p, `${q.name} ile ittifakı bozdu`, weakAlly ? `müttefik zayıf (${them}/${me} toprak), sınırı var` : 'yalnızca müttefikler kaldı ve öndeyim');
        return { type: 'BREAK_ALLIANCE', player: p, target: q.id };
      }
    }
    return null;
  }

  /** Önemli anlarda ara sıra söz: her olayda değil, birkaç turda bir en fazla */
  private pickMessage(s: GameState, p: number, t: Traits): Action | null {
    const myLast = lastOwnTurn(s, p);
    if (s.log.some((l) => l.event.type === 'bot_message' && l.event.player === p && s.round - l.round < 4)) return null;
    if (eventsThisTurn(s).some((e) => e.type === 'bot_message')) return null;
    let trigger: PhraseTrigger | null = null;
    let about = -1;
    for (const e of eventsSince(s, myLast)) {
      if (e.type === 'alliance_broken' && e.target === p) {
        trigger = 'betrayed';
        about = e.player;
        break;
      }
      if (e.type === 'loan_overdue' && e.lender === p) {
        trigger = 'defaulted';
        about = e.borrower;
      }
      if (e.type === 'eliminated' && e.by === p) {
        trigger = 'capital_fell';
        about = e.player;
      } else if (e.type === 'eliminated' && !trigger) {
        trigger = 'capital_fell';
        about = e.player;
      }
      if (e.type === 'battle' && e.attacker === p && e.gain >= 4 && !trigger) trigger = 'conquest';
    }
    if (!trigger) return null;
    if (noise(s, p, 50) > t.chatter) return null;
    return this.say(s, p, trigger, about);
  }

  private say(s: GameState, p: number, trigger: PhraseTrigger, about: number): Action | null {
    const who = personalityOf(s, p);
    const own = PHRASES.map((ph, id) => ({ ph, id })).filter((x) => x.ph.trigger === trigger && (!x.ph.who || x.ph.who === who));
    if (own.length === 0) return null;
    const pick = own[Math.floor(noise(s, p, 60) * own.length)];
    return { type: 'BOT_SAY', player: p, phrase: pick.id, about };
  }

  protected override claimScore(s: GameState, p: number, t: number): number {
    let sc = tileScore(s, p, t);
    const tr = traitsOf(s, p);
    const cap = s.players[p].capital;
    if (cap !== null && tr.caution > 0.6 && manhattan(s.map, t, cap) <= 2) sc += 2;
    if (s.map.mines[t] && tr.greed > 0.7) sc += 2;
    // Saldırgan en yakın rakibe doğru genişler
    if (tr.aggression > 0.6) {
      let d = Infinity;
      for (const q of s.players) if (q.alive && q.id !== p && q.capital !== null && !isAllied(s, p, q.id)) d = Math.min(d, manhattan(s.map, t, q.capital));
      if (d !== Infinity) sc -= tr.aggression * 0.2 * d;
    }
    return sc + noise(s, p, 1000 + t) * 1.2;
  }

  // ------------------------------------------------------------------
  // Diplomasi: öne geçene karşı ittifak, tüccar takası
  // ------------------------------------------------------------------

  protected override pickDiplomacy(s: GameState, p: number, turnEvents: GameEvent[]): Action | null {
    if (turnEvents.some((e) => e.type === 'offer_made' && e.offer.from === p)) return null;
    if ((s.round + p) % this.tuning.diplomacyEvery !== 0) return null;
    const t = traitsOf(s, p);
    const me = tileCount(s, p);
    const S = strongestOther(s, p);
    if (S === null) return null;
    const leader = tileCount(s, S);
    const pendingWith = (q: number) => s.offers.some((o) => (o.from === p && o.to === q) || (o.from === q && o.to === p));
    const refused = (q: number) => {
      const e = ledgerEntry(s, q, p);
      return e.lastRefused !== null && s.round - e.lastRefused < 6;
    };
    const free = s.players.filter((q) => q.alive && q.id !== p && !pendingWith(q.id) && !refused(q.id));
    // Öne geçen oyuncuya karşı ittifak ara
    // Yalnız yürümeyi seven (saldırgan, fırsatçı) ancak çok geride kalınca ittifak arar
    const needs = t.treachery > 0.5 ? 2 : 1.45 - t.caution * 0.2 - t.loyalty * 0.1;
    if (leader > me * needs) {
      const partners = free.filter((q) => q.id !== S && !isAllied(s, p, q.id) && !isAllied(s, q.id, S) && this.trust(s, p, q.id) >= 0).sort((a, b) => tileCount(s, b.id) - tileCount(s, a.id));
      if (partners.length) {
        this.log(s, p, `${partners[0].name} ile ittifak önerdi`, `öndeki ${s.players[S].name}: ${leader} toprak, bende ${me}`);
        return { type: 'PROPOSE_OFFER', player: p, to: partners[0].id, items: [{ kind: 'alliance' }] };
      }
      const rel = getRelation(s, p, S);
      if (t.caution > 0.5 && !rel.allied && !atPeace(s, p, S) && free.some((q) => q.id === S)) {
        this.log(s, p, `${s.players[S].name} ile barış önerdi`, 'önde olanla bu tur kapışmak istemedi');
        return { type: 'PROPOSE_OFFER', player: p, to: S, items: [{ kind: 'peace', rounds: 5 }] };
      }
    }
    // Komşu bulunmayan oyuncuyla erken dostluk
    if (t.loyalty > 0.8 && s.round >= 4) {
      const friends = free.filter((q) => !isAllied(s, p, q.id) && this.trust(s, p, q.id) >= 0 && !bordersTiles(s, p, q.id));
      if (friends.length) return { type: 'PROPOSE_OFFER', player: p, to: friends[0].id, items: [{ kind: 'alliance' }] };
    }
    // Tüccar: fazlasını, eksiği olan kaynakla takas eder
    if (t.greed > 0.45) {
      const trade = this.pickTrade(s, p, free.map((q) => q.id));
      if (trade) return trade;
    }
    return null;
  }

  /** Elinde fazla olan kaynağı eksik olanla ya da akçeyle takas teklifi */
  private pickTrade(s: GameState, p: number, others: number[]): Action | null {
    const res = s.players[p].resources;
    const kinds: ResourceKey[] = ['oil', 'iron', 'steel'];
    const surplus = kinds.find((k) => res[k] >= 4);
    const lack = kinds.find((k) => res[k] === 0);
    const q = others.filter((o) => this.trust(s, p, o) >= 0).find((o) => (lack ? s.players[o].resources[lack] >= 2 : s.players[o].resources.akce >= 400));
    if (q === undefined || !surplus) return null;
    const items: OfferItem[] = [{ kind: 'resource', giver: 'from', resource: surplus, amount: 2 }];
    if (lack && s.players[q].resources[lack] >= 2) items.push({ kind: 'resource', giver: 'to', resource: lack, amount: 1 });
    else items.push({ kind: 'resource', giver: 'to', resource: 'akce', amount: 250 });
    if (offerProblem(s, p, q, items)) return null;
    this.log(s, p, `${s.players[q].name} ile takas önerdi`, `elinde fazla ${RES_TR[surplus]} var`);
    return { type: 'PROPOSE_OFFER', player: p, to: q, items };
  }

  /** Teklifi kişiliğe göre tartar: kin varsa yanaşmaz, müttefik ve yardım edene iyi davranır */
  private judge(s: GameState, p: number, o: Offer): number {
    const t = traitsOf(s, p);
    let v = this.offerValue(s, p, o);
    v += this.trust(s, p, o.from) * (60 + t.loyalty * 60);
    if (o.items.some((i) => i.kind === 'alliance')) v += (t.loyalty - t.treachery) * 320;
    if (o.items.some((i) => i.kind === 'peace')) v += (t.caution - t.aggression) * 150;
    return v - t.greed * 60;
  }

  override evaluateOffer(raw: GameState, p: number, o: Offer): boolean {
    const s = this.prepare(raw, p);
    if (offerProblem(s, o.from, o.to, o.items)) return false;
    if (this.trust(s, p, o.from) < 0) {
      this.log(s, p, `${s.players[o.from].name} teklifini reddetti`, 'kin tutuyor');
      return false;
    }
    const v = this.judge(s, p, o);
    this.log(s, p, `${s.players[o.from].name} teklifine ${v >= 0 ? 'evet' : 'hayır'}`, `değer ${Math.round(v)}`);
    return v >= 0;
  }

  /** Pazarlık: teklif azıcık aleyhineyse reddetmek yerine karşı teklif yapar */
  counterOffer(raw: GameState, p: number, o: Offer): OfferItem[] | null {
    const s = this.prepare(raw, p);
    if ((o.depth ?? 0) >= 1 || offerProblem(s, o.from, o.to, o.items) || this.trust(s, p, o.from) < 0) return null;
    const v = this.judge(s, p, o);
    if (v >= 0 || v < -500) return null;
    // Karşı teklifte kalemler ters döner: from artık bu bot; verdiğini azaltır ya da karşılığında akçe ister
    const flip = (side: 'from' | 'to'): 'from' | 'to' => (side === 'from' ? 'to' : 'from');
    const items: OfferItem[] = [];
    for (const it of o.items) {
      if (it.kind === 'resource') {
        const iGive = it.giver === 'to';
        const amount = iGive ? Math.max(1, Math.floor(it.amount * 0.6)) : it.amount;
        items.push({ ...it, giver: flip(it.giver), amount });
      } else if (it.kind === 'tile' || it.kind === 'strait') items.push({ ...it, giver: flip(it.giver) });
      else items.push(it);
    }
    const payment = Math.min(Math.ceil((-v * 0.6) / 50) * 50, s.players[o.from].resources.akce);
    const has = items.some((i) => i.kind === 'resource' && i.resource === 'akce');
    if (!has && payment >= 50) items.push({ kind: 'resource', giver: 'to', resource: 'akce', amount: payment });
    if (offerProblem(s, p, o.from, items)) return null;
    this.log(s, p, `${s.players[o.from].name} teklifine karşı teklif yaptı`, `teklifin değeri ${Math.round(v)}: pazarlık`);
    return items;
  }

  // ------------------------------------------------------------------
  // Borç
  // ------------------------------------------------------------------

  /** Faiz güvene ve açgözlülüğe göre; güvenmediğine vermez */
  override answerLoan(raw: GameState, p: number, r: LoanRequest): Action {
    const s = this.prepare(raw, p);
    const t = traitsOf(s, p);
    if (r.stage === 'terms') {
      const rate = r.rate ?? 0;
      const total = loanTotal(r.amount, rate);
      const debt = s.loans.filter((l) => l.borrower === p).reduce((a, l) => a + loanRemaining(l), 0);
      const accept = rate <= 15 + (1 - t.caution) * 25 && total + debt <= this.expectedIncome(s, p) * r.term * (1 - t.caution * 0.4);
      this.log(s, p, accept ? 'borcu onayladı' : 'borçtan vazgeçti', `%${rate}, toplam ${total}, mevcut borç ${debt}`);
      return { type: 'CONFIRM_LOAN', player: p, requestId: r.id, accept };
    }
    const tr = this.trust(s, p, r.borrower);
    const left = s.players[p].resources.akce - r.amount;
    const share = tr === 2 ? 0.6 : tr === 1 ? 0.4 : 0.25 + t.greed * 0.15;
    const ok = tr >= 0 && left >= 300 + t.caution * 300 && r.amount <= s.players[p].resources.akce * share;
    const rate = !ok ? 0 : Math.round(([12, 6, 0][tr] ?? 0) + t.greed * [28, 14, 8][tr]);
    this.log(s, p, ok ? `borç verdi %${rate}` : 'borç vermedi', `güven ${tr}, istenen ${r.amount}, kalacak ${left}`);
    return { type: 'RESPOND_LOAN', player: p, requestId: r.id, accept: ok, rate };
  }

  /** Vurgulu eylemler için günlük: savaş seçimi */
  protected override pickBattle(s: GameState, p: number): Action | null {
    const a = super.pickBattle(s, p);
    if (a && (a.type === 'ATTACK' || a.type === 'SHIP_EXPEDITION' || a.type === 'PLANE_EXPEDITION')) {
      const q = s.owner[a.target];
      if (q !== null) this.log(s, p, `${s.players[q].name} hedefine saldırı`, `kin ${this.grudge(s, p, q).toFixed(1)}, toprak ${tileCount(s, q)}/${tileCount(s, p)}`);
    }
    return a;
  }

  protected override pickDemolish(s: GameState, p: number): Action | null {
    const a = super.pickDemolish(s, p);
    if (a && a.type === 'DEMOLISH') this.log(s, p, 'yapı yıktı', 'işe yaramıyordu');
    return a;
  }
}

function bordersTiles(s: GameState, a: number, b: number): boolean {
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === a && neighbors4(s.map, i).some((n) => s.owner[n] === b)) return true;
  return false;
}

/** p'nin önceki turunun numarası (günlükten) */
function lastOwnTurn(s: GameState, p: number): number {
  let seenCurrent = false;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const l = s.log[i];
    if (l.event.type === 'turn_start' && l.event.player === p) {
      if (seenCurrent) return l.turn;
      seenCurrent = true;
    }
  }
  return s.turnCounter - s.players.length;
}

