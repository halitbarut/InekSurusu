import { describe, expect, it } from 'vitest';
import { shipRoutes, straitControllers, straitPairs, straitPairsOf, validateAction, type GameState } from '../src/engine';
import { act, at, own, setCapital, testState } from './helpers';

/** 4 karelik yatay boğaz: y=3, x=5..8. Kuzey yaka y=2, güney yaka y=4 */
const LONG = [
  '##############',
  '#....####....#',
  '#....####....#',
  '#............#',
  '#....####....#',
  '#....####....#',
  '##############',
];

function world(): GameState {
  const s = testState(LONG, 3);
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 13, 0);
  setCapital(s, 2, 13, 6);
  s.structure[at(s, 0, 3)] = 'shipyard';
  s.owner[at(s, 0, 3)] = 0;
  s.units.push({ id: 1, kind: 'ship', owner: 0, tile: at(s, 0, 3), sortiesThisTurn: 0 });
  s.players[0].resources = { akce: 2000, gold: 0, oil: 9, iron: 0, steel: 0 };
  return s;
}

/** Boğaz durumunu yenilemek için tur içi zararsız bir eylem */
function refresh(s: GameState): GameState {
  return act(s, { type: 'EXCHANGE_GOLD', player: s.currentPlayer, amount: 1 });
}
const withGold = (s: GameState) => {
  s.players[s.currentPlayer].resources.gold = 1;
  return s;
};

describe('boğaz söz sahipliği', () => {
  it('uzun boğazda tek karşılıklı çift yeter', () => {
    const s = world();
    expect(s.map.straits).toHaveLength(1);
    const st = s.map.straits[0];
    expect(st.tiles.length).toBeGreaterThanOrEqual(2);
    const [a, b] = straitPairs(s.map, st)[1];
    s.owner[a] = 1;
    s.owner[b] = 1;
    expect(straitControllers(s, 0)).toEqual([1]);
    expect(straitPairsOf(s, 0, 1)).toEqual([[a, b]]);
  });

  it('çapraz duran kareler çift sayılmaz', () => {
    const s = world();
    const pairs = straitPairs(s.map, s.map.straits[0]);
    s.owner[pairs[0][0]] = 1; // ilk çiftin kuzeyi
    s.owner[pairs[1][1]] = 1; // ikinci çiftin güneyi
    expect(straitControllers(s, 0)).toEqual([]);
  });

  it('tek kareli boğazda çift, iki yakanın kendisidir', () => {
    const s = testState(['#########', '#...#...#', '#...#...#', '#.......#', '#...#...#', '#...#...#', '#########'], 3);
    expect(s.map.straits[0].tiles).toHaveLength(1);
    const banks = s.map.straits[0].banks;
    expect(straitPairs(s.map, s.map.straits[0])).toEqual([[banks[0], banks[1]]]);
  });

  it('iki söz sahibi varsa iki izin ve iki vergi gerekir', () => {
    let s = withGold(world());
    const pairs = straitPairs(s.map, s.map.straits[0]);
    s.owner[pairs[0][0]] = 1;
    s.owner[pairs[0][1]] = 1;
    s.owner[pairs[1][0]] = 2;
    s.owner[pairs[1][1]] = 2;
    s = refresh(s);
    expect(s.straits[0].controllers).toEqual([1, 2]);
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 1, straitId: 0, target: 0, mode: 'toll', toll: 100 });
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 2, straitId: 0, target: 0, mode: 'toll', toll: 250 });
    const target = at(s, 11, 0);
    const route = shipRoutes(s, 0, at(s, 0, 3)).routeTo(target)!;
    expect(route.tolls.map((t) => [t.controller, t.amount])).toEqual([
      [1, 100],
      [2, 250],
    ]);
    expect(route.toll).toBe(350);
    const before = s.players.map((p) => p.resources.akce);
    s = act(s, { type: 'SHIP_EXPEDITION', player: 0, unitId: 1, target });
    expect(s.players[1].resources.akce - before[1]).toBe(100);
    expect(s.players[2].resources.akce - before[2]).toBe(250);
    expect(before[0] - s.players[0].resources.akce).toBe(350 + s.config.expeditionClaimCost);
  });

  it('söz sahiplerinden biri kapatırsa öbürü açık olsa da geçilemez', () => {
    let s = withGold(world());
    const pairs = straitPairs(s.map, s.map.straits[0]);
    own(s, 1, [[pairs[0][0] % 14, 2], [pairs[0][1] % 14, 4]]);
    own(s, 2, [[pairs[1][0] % 14, 2], [pairs[1][1] % 14, 4]]);
    s = refresh(s);
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 1, straitId: 0, target: 0, mode: 'open', toll: 0 });
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 2, straitId: 0, target: 0, mode: 'closed', toll: 0 });
    expect(validateAction(s, { type: 'SHIP_EXPEDITION', player: 0, unitId: 1, target: at(s, 11, 0) }).ok).toBe(false);
  });

  it('kendisi de söz sahibi olan gemi öbür söz sahibine yine tabi', () => {
    let s = withGold(world());
    const pairs = straitPairs(s.map, s.map.straits[0]);
    s.owner[pairs[0][0]] = 0;
    s.owner[pairs[0][1]] = 0;
    s.owner[pairs[1][0]] = 1;
    s.owner[pairs[1][1]] = 1;
    s = refresh(s);
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 1, straitId: 0, target: 0, mode: 'toll', toll: 70 });
    expect(shipRoutes(s, 0, at(s, 0, 3)).routeTo(at(s, 11, 0))!.toll).toBe(70);
  });

  it('toprak kaybedilince söz sahipliği anında kalkar, ayarlar silinir, yeni sahip olaya düşer', () => {
    let s = withGold(world());
    const [a, b] = straitPairs(s.map, s.map.straits[0])[0];
    s.owner[a] = 1;
    s.owner[b] = 1;
    s = refresh(s);
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 1, straitId: 0, target: 0, mode: 'closed', toll: 0 });
    expect(s.straits[0].policies[1][0].mode).toBe('closed');
    // P0 komşu kareden saldırıp yakayı alır
    const n = a - 1;
    s.owner[n] = 0;
    s = act(s, { type: 'ATTACK', player: 0, target: a }, [8, 1]);
    s = act(s, { type: 'CONQUER_TILE', player: 0, tile: a });
    expect(s.straits[0].controllers).toEqual([]);
    expect(s.straits[0].policies).toEqual({});
    expect(s.log.some((l) => l.event.type === 'strait_control' && l.event.player === 1 && !l.event.gained)).toBe(true);
  });
});
