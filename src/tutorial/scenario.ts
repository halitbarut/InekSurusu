import { DEFAULT_CONFIG, buildMap, createGameFromMap, draftFromRows, type GameState } from '../engine';
import { TUTORIAL_ROWS } from './map';

/**
 * Öğreticinin sabit senaryosu: küçük harita, üç devlet (oyuncu ve iki öğretici bot), kurulum bitmiş, 1. tur.
 * Topaç ve savaş sonuçları sabit RNG durumundan gelir: öğreticideki eylemler tek tek belirlendiği için sıra
 * hep aynıdır (TUTORIAL_RNG, tests/tutorial.test.ts ile doğrulanır).
 */

/** Sabit RNG durumu: 2. turdaki savaş kaybedilir, 3. turdaki kazanılır, 4. turdaki başkent savaşı kazanılır */
export const TUTORIAL_RNG = 175;

export const ME = 0;
export const MEHMET = 1;
export const ZEYNEP = 2;

const W = 26;
export const at = (x: number, y: number) => y * W + x;

/** Öğreticide kullanılan kareler */
export const T = {
  capital: at(5, 12),
  claim: at(9, 9),
  gold: at(8, 9),
  shipyard: at(5, 10),
  factory: at(4, 11),
  base: at(8, 12),
  /** Kaybedilen savaşın hedefi (güney sınırı) */
  lose: at(10, 14),
  /** Kazanılan savaşın hedefi ve sonra alınacak yol (Mehmet'in başkentine) */
  win: at(10, 10),
  path: [at(10, 10), at(11, 10)],
  mehmetCapital: at(12, 10),
  zeynepCapital: at(21, 3),
  island: at(22, 13),
  far: at(14, 3),
  /** Boğazın oyuncuda olmayan tek yakası */
  bank: at(4, 9),
};

export function tutorialState(): GameState {
  const map = buildMap(draftFromRows([...TUTORIAL_ROWS]), 'Öğretici');
  const s = createGameFromMap(
    map,
    [
      { name: 'Sen', color: '#2160c4', kind: 'human' },
      { name: 'Mehmet', color: '#ea5b1e', kind: 'bot' },
      { name: 'Zeynep', color: '#921f5e', kind: 'bot' },
    ],
    { ...DEFAULT_CONFIG },
    1,
  );
  const land = (i: number) => map.terrain[i] === 'land';
  for (let i = 0; i < s.owner.length; i++) {
    if (!land(i)) continue;
    const x = i % W;
    const y = Math.floor(i / W);
    if (x <= 9 && y >= 10) s.owner[i] = ME;
    else if (x >= 10 && x <= 19 && y >= 10) s.owner[i] = MEHMET;
    else if (x >= 12 && x <= 19 && y >= 6 && y <= 9) s.owner[i] = MEHMET;
    else if (x >= 19 && y <= 5) s.owner[i] = ZEYNEP;
  }
  // Boğazın beş yakası oyuncuda, biri sahipsiz
  for (const [x, y] of [[2, 7], [3, 7], [4, 7], [2, 9], [3, 9]]) s.owner[at(x, y)] = ME;
  // Mehmet'in başkentine giden yolun kuzeyi sahipsiz kalsın (yalnızca savaşla alınır)
  for (const [i, p] of [[T.capital, ME], [T.mehmetCapital, MEHMET], [T.zeynepCapital, ZEYNEP]] as const) {
    s.owner[i] = p;
    s.structure[i] = 'capital';
    s.players[p].capital = i;
  }
  s.players[ME].resources = { akce: 2500, gold: 1, oil: 3, iron: 4, steel: 2 };
  s.players[MEHMET].resources = { akce: 300, gold: 0, oil: 0, iron: 0, steel: 0 };
  s.players[ZEYNEP].resources = { akce: 300, gold: 0, oil: 0, iron: 0, steel: 0 };
  s.phase = { kind: 'spin' };
  s.round = 1;
  s.turnCounter = 1;
  s.currentPlayer = ME;
  s.rngState = TUTORIAL_RNG;
  s.log = [{ turn: 1, round: 1, event: { type: 'turn_start', player: ME, round: 1 } }];
  return s;
}
