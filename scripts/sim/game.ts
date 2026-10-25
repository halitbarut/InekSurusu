import { MediumBot, MEDIUM_TUNING, RusherBot, type BotBrain, type BotTuning } from '../../src/bot';
import { battleCost, createGame, defaultMapSize, dispatch, neighbors4, structureCost, type GameConfig, type GameState } from '../../src/engine';

export const SNAPSHOT_ROUNDS = [10, 25, 50, 100] as const;

export type SpendKey = 'claim' | 'build' | 'produce' | 'battle' | 'upkeep' | 'toll';

export interface GameMetrics {
  seed: number;
  endRound: number;
  hitLimit: boolean;
  winType: 'single' | 'alliance' | 'limit';
  winners: number[];
  firstCapitalFall: number | null;
  /** Tur → yaşayan oyuncuların ortalama akçesi */
  akceAt: Record<number, number>;
  /** Tur → yaşayan oyuncuların ortalama maden kaynağı (altın+petrol+demir+çelik) */
  minesAt: Record<number, number>;
  spend: Record<SpendKey, number>;
  /** Bakım harcamasının kalemlere göre dökümü */
  upkeepBy: { ship: number; plane: number; base: number };
  /** Topaç + altın bozdurma ile elde edilen akçe */
  income: number;
  battles: { land: number; base: number; capital: number; capitalWon: number; baseWon: number };
  rusherSeat: number | null;
  /** Elenme sırası */
  eliminations: { player: number; by: number; round: number }[];
  /** Darboğaz ölçümleri: ilk kez olduğu tur (olmadıysa null) */
  milestones: {
    /** Bir oyuncu rakip başkentine komşu oldu */
    adjCapital: number | null;
    /** Bir oyuncu başkent savaşı masrafını karşılayabildi */
    afford: number | null;
    /** Aynı oyuncu hem komşu hem masrafı karşılıyor */
    adjAndAfford: number | null;
    firstCapitalBattle: number | null;
  };
  /** 60. tur başında yaşayan oyunculardan demiri / çeliği olmayanların oranı (o tura ulaşıldıysa) */
  noIronAt60: number | null;
  noSteelAt60: number | null;
}

export interface GameSpec {
  seed: number;
  players: number;
  maxRounds: number;
  config: Partial<GameConfig>;
  rusherSeat: number | null;
  /** Orta seviye botların ayarları (verilmezse varsayılan) */
  tuning?: Partial<BotTuning>;
  /** Harita boyutu (verilmezse oyuncu sayısına göre varsayılan) */
  size?: { width: number; height: number };
}

/** Arayüz olmadan, yalnızca kural motoru ve botlarla bir oyun oynatır. */
export function playGame(spec: GameSpec): GameMetrics {
  const { width, height } = spec.size ?? defaultMapSize(spec.players);
  let s: GameState = createGame({
    players: Array.from({ length: spec.players }, (_, i) => ({ name: `B${i}`, color: '#000', kind: 'bot' as const })),
    width,
    height,
    seed: spec.seed,
    config: spec.config,
  });
  const medium = new MediumBot({ ...MEDIUM_TUNING, ...spec.tuning });
  // Acele eden bot, koşu dışındaki ayarları (bakım politikası vb.) diğer botlarla paylaşır
  const rusher = new RusherBot(spec.tuning);
  const brain = (p: number): BotBrain => (p === spec.rusherSeat ? rusher : medium);
  const m: GameMetrics = {
    seed: spec.seed,
    endRound: 0,
    hitLimit: false,
    winType: 'limit',
    winners: [],
    firstCapitalFall: null,
    akceAt: {},
    minesAt: {},
    spend: { claim: 0, build: 0, produce: 0, battle: 0, upkeep: 0, toll: 0 },
    upkeepBy: { ship: 0, plane: 0, base: 0 },
    income: 0,
    battles: { land: 0, base: 0, capital: 0, capitalWon: 0, baseWon: 0 },
    rusherSeat: spec.rusherSeat,
    eliminations: [],
    milestones: { adjCapital: null, afford: null, adjAndAfford: null, firstCapitalBattle: null },
    noIronAt60: null,
    noSteelAt60: null,
  };
  const capCost = battleCost(s, 'capital');
  const cfg = s.config;
  let guard = 0;
  let lastTurn = -1;
  let perTurn = 0;
  while (s.phase.kind !== 'gameover' && s.round <= spec.maxRounds) {
    const ph = s.phase;
    const p = ph.kind === 'vote' ? s.players.find((pl) => pl.alive && !(pl.id in ph.votes))!.id : ph.kind === 'conquest' ? ph.taker : s.currentPlayer;
    let action = brain(p).chooseAction(s, p);
    if (s.turnCounter !== lastTurn) {
      lastTurn = s.turnCounter;
      perTurn = 0;
    } else if (++perTurn > 400 && ph.kind === 'actions') action = { type: 'END_TURN', player: p };
    const r = dispatch(s, action);
    s = r.state;
    if (++guard > 2_000_000) throw new Error('Simülasyon çok uzun sürdü');
    for (const e of r.events) {
      switch (e.type) {
        case 'turn_start': {
          const pl = s.players[e.player];
          const ms = m.milestones;
          const adj = s.players.some((q) => q.alive && q.id !== pl.id && q.capital !== null && neighbors4(s.map, q.capital).some((t) => s.owner[t] === pl.id));
          const r = pl.resources;
          const aff = r.akce >= capCost.akce && r.iron >= capCost.iron && r.steel >= capCost.steel;
          if (adj && ms.adjCapital === null) ms.adjCapital = e.round;
          if (aff && ms.afford === null) ms.afford = e.round;
          if (adj && aff && ms.adjAndAfford === null) ms.adjAndAfford = e.round;
          if (e.round === 60 && m.noIronAt60 === null && e.player === s.players.find((p) => p.alive)!.id) {
            const alive = s.players.filter((p) => p.alive);
            m.noIronAt60 = alive.filter((p) => p.resources.iron === 0).length / alive.length;
            m.noSteelAt60 = alive.filter((p) => p.resources.steel === 0).length / alive.length;
          }
          if (e.player === s.players.find((p) => p.alive)!.id && (SNAPSHOT_ROUNDS as readonly number[]).includes(e.round) && !(e.round in m.akceAt)) {
            const alive = s.players.filter((p) => p.alive);
            m.akceAt[e.round] = alive.reduce((a, p) => a + p.resources.akce, 0) / alive.length;
            m.minesAt[e.round] = alive.reduce((a, p) => a + p.resources.gold + p.resources.oil + p.resources.iron + p.resources.steel, 0) / alive.length;
          }
          break;
        }
        case 'spin':
          m.income += e.akce;
          break;
        case 'exchange':
          m.income += e.akce;
          break;
        case 'claim':
          m.spend.claim += e.cost;
          break;
        case 'build':
          m.spend.build += structureCost(s, e.structure);
          break;
        case 'produce':
          m.spend.produce += e.unit === 'ship' ? cfg.shipAkceCost : cfg.planeAkceCost;
          break;
        case 'upkeep':
          m.spend.upkeep += e.amount;
          m.upkeepBy.ship += e.ships * cfg.shipUpkeep;
          m.upkeepBy.plane += e.planes * cfg.planeUpkeep;
          m.upkeepBy.base += e.bases * cfg.baseUpkeep;
          break;
        case 'expedition':
          m.spend.toll += e.tolls.reduce((a, t) => a + t.amount, 0);
          break;
        case 'battle':
          m.spend.battle += e.cost.akce;
          m.battles[e.kind]++;
          if (e.kind === 'capital' && e.success) m.battles.capitalWon++;
          if (e.kind === 'capital' && m.milestones.firstCapitalBattle === null) m.milestones.firstCapitalBattle = s.round;
          if (e.kind === 'base' && e.success) m.battles.baseWon++;
          break;
        case 'eliminated':
          if (m.firstCapitalFall === null) m.firstCapitalFall = s.round;
          m.eliminations.push({ player: e.player, by: e.by, round: s.round });
          break;
        case 'offer_made': {
          const accept = brain(e.offer.to).evaluateOffer(s, e.offer.to, e.offer);
          s = dispatch(s, { type: 'RESPOND_OFFER', player: e.offer.to, offerId: e.offer.id, accept }).state;
          break;
        }
      }
    }
  }
  m.endRound = Math.min(s.round, spec.maxRounds);
  if (s.phase.kind === 'gameover') {
    m.winners = s.winners ?? [];
    m.winType = m.winners.length > 1 ? 'alliance' : 'single';
  } else m.hitLimit = true;
  return m;
}
