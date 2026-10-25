import {
  DEFAULT_CONFIG,
  applyAction,
  createGameFromMap,
  mapFromAscii,
  type Action,
  type GameConfig,
  type GameState,
  type Rng,
} from '../src/engine';

/** Topaç sonuçlarını sırayla veren sahte RNG. */
export function scriptedRng(values: number[]): Rng {
  const queue = [...values];
  return {
    next: () => 0.5,
    int: () => {
      if (queue.length === 0) throw new Error('Senaryo RNG değerleri bitti');
      return queue.shift()!;
    },
    getState: () => 0,
  };
}

/** Oyunu doğrudan eylem aşamasında, 1. turda başlatır. */
export function testState(rows: string[], players = 3, config: Partial<GameConfig> = {}): GameState {
  const map = mapFromAscii(rows);
  const s = createGameFromMap(
    map,
    Array.from({ length: players }, (_, i) => ({ name: `P${i}`, color: '#000', kind: 'human' as const })),
    { ...DEFAULT_CONFIG, ...config },
  );
  s.phase = { kind: 'actions' };
  s.round = 1;
  s.turnCounter = 1;
  return s;
}

export function at(s: GameState, x: number, y: number): number {
  return y * s.map.width + x;
}

export function own(s: GameState, p: number, coords: [number, number][]) {
  for (const [x, y] of coords) s.owner[at(s, x, y)] = p;
}

export function setCapital(s: GameState, p: number, x: number, y: number) {
  const t = at(s, x, y);
  s.owner[t] = p;
  s.structure[t] = 'capital';
  s.players[p].capital = t;
}

export function act(s: GameState, action: Action, spins: number[] = []): GameState {
  return applyAction(s, action, scriptedRng(spins)).state;
}
