import { MediumBot, MEDIUM_TUNING, RusherBot, type BotBrain, type BotTuning } from '../../src/bot';
import { createGame, defaultMapSize, dispatch, structureCost, type GameConfig, type GameState } from '../../src/engine';

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
}

export interface GameSpec {
  seed: number;
  players: number;
  maxRounds: number;
  config: Partial<GameConfig>;
  rusherSeat: number | null;
  /** Orta seviye botların ayarları (verilmezse varsayılan) */
  tuning?: Partial<BotTuning>;
}

/** Arayüz olmadan, yalnızca kural motoru ve botlarla bir oyun oynatır. */
export function playGame(spec: GameSpec): GameMetrics {
  const { width, height } = defaultMapSize(spec.players);
  let s: GameState = createGame({
    players: Array.from({ length: spec.players }, (_, i) => ({ name: `B${i}`, color: '#000', kind: 'bot' as const })),
    width,
    height,
    seed: spec.seed,
    config: spec.config,
  });
  const medium = new MediumBot({ ...MEDIUM_TUNING, ...spec.tuning });
  const rusher = new RusherBot();
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
  };
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
        case 'turn_start':
          if (e.player === s.players.find((pl) => pl.alive)!.id && (SNAPSHOT_ROUNDS as readonly number[]).includes(e.round) && !(e.round in m.akceAt)) {
            const alive = s.players.filter((pl) => pl.alive);
            m.akceAt[e.round] = alive.reduce((a, pl) => a + pl.resources.akce, 0) / alive.length;
            m.minesAt[e.round] = alive.reduce((a, pl) => a + pl.resources.gold + pl.resources.oil + pl.resources.iron + pl.resources.steel, 0) / alive.length;
          }
          break;
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
