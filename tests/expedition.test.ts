import { describe, expect, it } from 'vitest';
import { conquestCandidates, expeditionTargets, mutRelation, validateAction, type GameState } from '../src/engine';
import { act, at, own, setCapital, testState } from './helpers';

// İki deniz havzası, aralarında 3 karelik bir boğaz (y=3, x=4..6); sağda bir göl (11,2)
const STRAIT_MAP = [
  '#############',
  '#...###...###',
  '#...###...#~#',
  '#.........###',
  '#...###...###',
  '#...###...G##',
  '#############',
];

function seaWorld(): GameState {
  const s = testState(STRAIT_MAP, 3);
  for (let y = 1; y <= 5; y++) own(s, 0, [[0, y]]);
  setCapital(s, 0, 0, 4);
  s.structure[at(s, 0, 2)] = 'shipyard';
  s.units.push({ id: 1, kind: 'ship', owner: 0, tile: at(s, 0, 2), sortiesThisTurn: 0 });
  s.players[0].resources = { akce: 1000, gold: 0, oil: 5, iron: 0, steel: 0 };
  setCapital(s, 1, 5, 0);
  setCapital(s, 2, 12, 4);
  own(s, 2, [[10, 3], [10, 4], [11, 3], [11, 4]]);
  return s;
}

function giveBanksTo(s: GameState, p: number) {
  for (const b of s.map.straits[0].banks) s.owner[b] = p;
  s.straits[0].controller = p;
}

const ship = (s: GameState, x: number, y: number) => ({ type: 'SHIP_EXPEDITION' as const, player: 0, unitId: 1, target: at(s, x, y) });

describe('boğaz tespiti', () => {
  it('1 kare genişliğindeki geçidi boğaz olarak bulur', () => {
    const s = seaWorld();
    expect(s.map.straits).toHaveLength(1);
    const st = s.map.straits[0];
    expect(st.tiles).toEqual([at(s, 4, 3), at(s, 5, 3), at(s, 6, 3)]);
    expect(st.banks).toHaveLength(6);
    expect(s.map.terrain[at(s, 11, 2)]).toBe('lake');
  });
});

describe('gemi seferi', () => {
  it('boğazdan geçip sahipsiz kıyıyı 1 petrol + 100 akçeye alır, gemi tersaneye döner', () => {
    let s = seaWorld();
    s = act(s, ship(s, 10, 1));
    expect(s.owner[at(s, 10, 1)]).toBe(0);
    expect(s.players[0].resources.oil).toBe(4);
    expect(s.players[0].resources.akce).toBe(900);
    expect(s.units[0].tile).toBe(at(s, 0, 2));
  });

  it('maden karesi gemiyle doğrudan alınamaz', () => {
    const s = seaWorld();
    expect(validateAction(s, ship(s, 10, 5)).ok).toBe(false);
  });

  it('kıyısı olmayan (sadece göle bakan) kareye gidilemez', () => {
    const s = seaWorld();
    expect(validateAction(s, ship(s, 11, 1)).ok).toBe(false);
    expect(expeditionTargets(s, 0, 1).has(at(s, 11, 1))).toBe(false);
  });

  it('petrol yoksa sefer yapılamaz', () => {
    const s = seaWorld();
    s.players[0].resources.oil = 0;
    expect(validateAction(s, ship(s, 10, 1)).ok).toBe(false);
  });

  it('boğaz sahibi geçişe izin vermezse rota kapanır', () => {
    let s = seaWorld();
    giveBanksTo(s, 1);
    s.currentPlayer = 1;
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 1, straitId: 0, target: 0, allow: false, toll: 0 });
    s.currentPlayer = 0;
    expect(validateAction(s, ship(s, 10, 1)).ok).toBe(false);
    // Kendi havzasında hâlâ gidebilir
    expect(validateAction(s, ship(s, 4, 1)).ok).toBe(true);
  });

  it('geçiş vergisi sefer başında otomatik ödenir', () => {
    let s = seaWorld();
    giveBanksTo(s, 1);
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 1, straitId: 0, target: 0, allow: true, toll: 50 });
    s = act(s, ship(s, 10, 1));
    expect(s.players[0].resources.akce).toBe(1000 - 50 - 100);
    expect(s.players[1].resources.akce).toBe(50);
  });

  it('vergiye yetecek akçe yoksa sefer yapılamaz', () => {
    let s = seaWorld();
    giveBanksTo(s, 1);
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 1, straitId: 0, target: 0, allow: true, toll: 50 });
    s.players[0].resources.akce = 120;
    expect(validateAction(s, ship(s, 10, 1)).ok).toBe(false);
  });

  it('düşman kıyısına seferde normal savaş; alınacaklar hedef ve komşularından seçilir', () => {
    let s = seaWorld();
    s = act(s, ship(s, 10, 3), [5, 2]);
    expect(s.phase).toMatchObject({ kind: 'conquest', taker: 0, remaining: 3, anchor: at(s, 10, 3) });
    const c = conquestCandidates(s);
    expect(c.sort()).toEqual([at(s, 10, 3), at(s, 10, 4), at(s, 11, 3)].sort());
    expect(c).not.toContain(at(s, 12, 4));
  });
});

describe('seferle savaşta karşı saldırı', () => {
  it('savunanla sınır yoksa saldıran toprak kaybetmez', () => {
    let s = seaWorld();
    const before = [...s.owner];
    s = act(s, ship(s, 10, 3), [2, 7]);
    expect(s.phase.kind).toBe('actions');
    expect(s.owner).toEqual(before);
    expect(s.players[0].battlesThisTurn).toBe(1);
  });

  it('sınır varsa savunan, saldıranın kendisine komşu topraklarından seçer', () => {
    let s = seaWorld();
    own(s, 0, [[10, 2]]); // P2'nin (10,3) karesine komşu
    s = act(s, ship(s, 10, 3), [2, 7]);
    expect(s.phase).toMatchObject({ kind: 'conquest', taker: 2, victim: 0, remaining: 3, anchor: null, counter: true });
    expect(conquestCandidates(s)).toEqual([at(s, 10, 2)]);
  });

  it('sahipsiz kıyıya sefer savaş sayılmaz', () => {
    let s = seaWorld();
    s = act(s, ship(s, 10, 1));
    expect(s.players[0].battlesThisTurn).toBe(0);
  });
});

describe('boğaz idaresi', () => {
  it('her iki yakanın sahibi boğazı idare eder; idare kaybedilince ayarlar sıfırlanır', () => {
    let s = seaWorld();
    for (const b of s.map.straits[0].banks) s.owner[b] = 1;
    own(s, 0, [[4, 1]]);
    // Herhangi bir eylem idareyi yeniden hesaplar
    s = act(s, { type: 'END_TURN', player: 0 });
    expect(s.straits[0].controller).toBe(1);
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 1, straitId: 0, target: 0, allow: false, toll: 0 });
    expect(s.straits[0].policies[0]).toEqual({ allow: false, toll: 0 });
    // P0 bir yakayı fethediyor
    s.currentPlayer = 0;
    s.phase = { kind: 'actions' };
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 4, 2) }, [7, 1]);
    s = act(s, { type: 'CONQUER_TILE', player: 0, tile: at(s, 4, 2) });
    expect(s.straits[0].controller).toBeNull();
    expect(s.straits[0].policies).toEqual({});
  });
});

// ---------------------------------------------------------------

function airField(rows: number, baseY: number): GameState {
  const s = testState(Array.from({ length: rows }, () => '#############'), 3);
  setCapital(s, 0, 0, 0);
  own(s, 0, [[0, baseY]]);
  s.structure[at(s, 0, baseY)] = 'factory';
  s.units.push({ id: 1, kind: 'plane', owner: 0, tile: at(s, 0, baseY), sortiesThisTurn: 0 });
  s.players[0].resources = { akce: 1000, gold: 0, oil: 10, iron: 0, steel: 0 };
  setCapital(s, 1, 12, rows - 1);
  own(s, 1, [[6, baseY]]);
  s.structure[at(s, 6, baseY)] = 'base';
  setCapital(s, 2, 12, 0);
  return s;
}

const plane = (s: GameState, x: number, y: number) => ({ type: 'PLANE_EXPEDITION' as const, player: 0, unitId: 1, target: at(s, x, y) });

describe('uçak seferi', () => {
  it('2 petrol harcar ve haritada herhangi bir toprağa gidebilir', () => {
    let s = airField(9, 4);
    s = act(s, plane(s, 12, 4));
    expect(s.owner[at(s, 12, 4)]).toBe(0);
    expect(s.players[0].resources.oil).toBe(8);
  });

  it('düşman üssünün 3 kare (Chebyshev) yarıçapına giremez', () => {
    const s = airField(9, 4);
    expect(validateAction(s, plane(s, 7, 4)).ok).toBe(false);
    expect(validateAction(s, plane(s, 9, 1)).ok).toBe(false);
    expect(validateAction(s, plane(s, 9, 0)).ok).toBe(true);
  });

  it('engel alanının içinden geçemez; etrafından dolaşamıyorsa sefer yapılamaz', () => {
    const s = airField(7, 3);
    expect(validateAction(s, plane(s, 12, 3)).ok).toBe(false);
    // Dolaşabildiği haritada rota engel alanına hiç girmez
    const s2 = airField(9, 4);
    const route = expeditionTargets(s2, 0, 1).get(at(s2, 12, 4))!.route;
    for (const t of route.path) {
      const x = t % 13;
      const y = Math.floor(t / 13);
      expect(Math.max(Math.abs(x - 6), Math.abs(y - 4)) > 3).toBe(true);
    }
  });

  it('müttefik üssü engellemez', () => {
    const s = airField(9, 4);
    mutRelation(s, 0, 1).allied = true;
    expect(validateAction(s, plane(s, 7, 4)).ok).toBe(true);
  });

  it('yarıçap ölçüsü ayarlanabilir (Manhattan)', () => {
    const s = airField(9, 4);
    s.config.baseBlockMetric = 'manhattan';
    expect(validateAction(s, plane(s, 9, 1)).ok).toBe(true);
    expect(validateAction(s, plane(s, 9, 4)).ok).toBe(false);
  });

  it('maden karesi uçakla da doğrudan alınamaz', () => {
    const s = airField(9, 4);
    s.map.mines[at(s, 12, 2)] = 'oil';
    expect(validateAction(s, plane(s, 12, 2)).ok).toBe(false);
  });

  it('fabrika engel alanındaysa uçak kalkamaz', () => {
    const s = airField(9, 4);
    own(s, 0, [[4, 4]]);
    s.structure[at(s, 0, 4)] = null;
    s.structure[at(s, 4, 4)] = 'factory';
    s.units[0].tile = at(s, 4, 4);
    expect(expeditionTargets(s, 0, 1).size).toBe(0);
  });
});
