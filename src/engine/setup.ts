import { DEFAULT_CONFIG, MAX_PLAYERS, MIN_PLAYERS, configProblems, type GameConfig } from './config';
import { generateMap } from './map/generate';
import { mixSeed } from './rng';
import type { BotLevel, GameMap, GameState, Player } from './types';

export interface PlayerSetup {
  name: string;
  color: string;
  kind: 'human' | 'bot';
  botLevel?: BotLevel;
}

export interface NewGameSettings {
  players: PlayerSetup[];
  width: number;
  height: number;
  seed: number;
  config?: Partial<GameConfig>;
}

export function createGame(settings: NewGameSettings): GameState {
  const n = settings.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`Oyuncu sayısı ${MIN_PLAYERS}–${MAX_PLAYERS} olmalı`);
  const config: GameConfig = { ...DEFAULT_CONFIG, ...settings.config };
  const problems = configProblems(config);
  if (problems.length) throw new Error(`Geçersiz ayar: ${problems.join('; ')}`);
  const map = generateMap({
    width: settings.width,
    height: settings.height,
    seed: settings.seed,
    players: n,
    minesPerTypePerPlayer: config.minesPerTypePerPlayer,
    startTerritoryCount: config.startTerritoryCount,
    minCapitalDistance: config.minCapitalDistance,
    mineLayout: config.mineLayout,
    maxMineDistance: config.maxMineDistance,
  });
  return createGameFromMap(map, settings.players, config);
}

/** Hazır bir harita ile oyun durumu oluşturur (testler ve özel haritalar için). */
/** rngSeed: oyunun topaç tohumu (verilmezse haritanın tohumundan türetilir) */
export function createGameFromMap(map: GameMap, players: PlayerSetup[], config: GameConfig = DEFAULT_CONFIG, rngSeed = map.seed): GameState {
  const size = map.width * map.height;
  const ps: Player[] = players.map((p, id) => ({
    id,
    name: p.name,
    color: p.color,
    kind: p.kind,
    botLevel: p.botLevel ?? 'medium',
    alive: true,
    capital: null,
    resources: { akce: config.startAkce, gold: 0, oil: 0, iron: 0, steel: 0 },
    battlesThisTurn: 0,
    eliminatedBy: null,
  }));
  return {
    version: 1,
    config: { ...config },
    map,
    owner: new Array(size).fill(null),
    structure: new Array(size).fill(null),
    players: ps,
    units: [],
    nextUnitId: 1,
    relations: {},
    straits: map.straits.map(() => ({ controller: null, policies: {} })),
    offers: [],
    nextOfferId: 1,
    currentPlayer: 0,
    turnCounter: 0,
    round: 0,
    phase: { kind: 'setup_capital' },
    rngState: mixSeed(rngSeed, 0x5eed),
    log: [],
    winners: null,
  };
}
