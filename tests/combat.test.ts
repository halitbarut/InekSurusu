import { describe, expect, it } from 'vitest';
import { conquestCandidates, expectedLandGain, landBattleGain, seriesWinProbability, validateAction } from '../src/engine';
import { act, at, own, setCapital, testState } from './helpers';

const FIELD = ['########', '########', '########', '########', '########', '########'];

/** P0: x=0..1, P1: x=2..3 (üs (2,0)), P2: x=6..7 */
function battlefield() {
  const s = testState(FIELD, 3);
  for (let y = 0; y < 6; y++) {
    own(s, 0, [[0, y], [1, y]]);
    own(s, 1, [[2, y], [3, y]]);
    own(s, 2, [[6, y], [7, y]]);
  }
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 3, 5);
  setCapital(s, 2, 7, 0);
  s.structure[at(s, 2, 0)] = 'base';
  return s;
}

describe('kara savaşı hesabı', () => {
  it('floor((A − D) / 2) toprak verir', () => {
    expect(landBattleGain(7, 2)).toBe(2);
    expect(landBattleGain(8, 1)).toBe(3);
    expect(landBattleGain(4, 3)).toBe(0);
    expect(landBattleGain(5, 5)).toBe(0);
    expect(landBattleGain(2, 7)).toBe(0);
  });

  it('beklenen kazanç ve seri olasılıkları', () => {
    expect(expectedLandGain(8)).toBeCloseTo(34 / 64);
    expect(seriesWinProbability(3)).toBe(1 / 8);
    expect(seriesWinProbability(2)).toBe(1 / 4);
  });
});

describe('kara savaşı', () => {
  it('A > D: saldıran toprakları seçer, her seçim sınıra komşu olmalı', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }, [8, 2]);
    expect(s.phase).toMatchObject({ kind: 'conquest', attacker: 0, defender: 1, remaining: 3 });
    // (3,2) henüz sınırda değil
    expect(validateAction(s, { type: 'CONQUER_TILE', player: 0, tile: at(s, 3, 2) }).ok).toBe(false);
    s = act(s, { type: 'CONQUER_TILE', player: 0, tile: at(s, 2, 2) });
    // Artık (3,2) komşu: içeri doğru ilerlenebilir
    s = act(s, { type: 'CONQUER_TILE', player: 0, tile: at(s, 3, 2) });
    s = act(s, { type: 'CONQUER_TILE', player: 0, tile: at(s, 2, 3) });
    expect(s.phase.kind).toBe('actions');
    expect(s.owner[at(s, 2, 2)]).toBe(0);
    expect(s.owner[at(s, 3, 2)]).toBe(0);
    expect(s.owner[at(s, 2, 3)]).toBe(0);
  });

  it('başkent ve askeri üs normal savaşla alınamaz', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 1) }, [8, 1]);
    const c = conquestCandidates(s);
    expect(c).not.toContain(at(s, 2, 0)); // üs
    expect(c).not.toContain(at(s, 3, 5)); // başkent
    expect(c).toContain(at(s, 2, 5));
  });

  it('eşitlikte ve A < D iken hiçbir şey olmaz, saldıran toprak kaybetmez', () => {
    const s0 = battlefield();
    for (const spins of [[5, 5], [2, 7], [4, 3]]) {
      const s = act(s0, { type: 'ATTACK', player: 0, target: at(s0, 2, 2) }, spins);
      expect(s.phase.kind).toBe('actions');
      expect(s.owner).toEqual(s0.owner);
    }
  });

  it('sınır komşuluğu olmadan saldırılamaz', () => {
    const s = battlefield();
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 6, 3) }).ok).toBe(false);
  });

  it('yapı ve konuşlu birimler fetheden tarafa geçer', () => {
    let s = battlefield();
    s.structure[at(s, 2, 3)] = 'factory';
    s.units.push({ id: 99, kind: 'plane', owner: 1, tile: at(s, 2, 3), sortiesThisTurn: 0 });
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 3) }, [6, 2]);
    s = act(s, { type: 'CONQUER_TILE', player: 0, tile: at(s, 2, 3) });
    expect(s.owner[at(s, 2, 3)]).toBe(0);
    expect(s.structure[at(s, 2, 3)]).toBe('factory');
    expect(s.units.find((u) => u.id === 99)!.owner).toBe(0);
  });

  it('tur başına saldırı sınırı ayarlanabilir', () => {
    let s = battlefield();
    s.config.maxAttacksPerTurn = 1;
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }, [1, 8]);
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(false);
  });
});

describe('başkent savaşı', () => {
  function capitalSiege() {
    const s = battlefield();
    // P1 başkenti (3,5) için P0'a komşu bir kare ver
    own(s, 0, [[3, 4]]);
    s.players[1].resources = { akce: 700, gold: 2, oil: 3, iron: 1, steel: 4 };
    s.units.push({ id: 5, kind: 'ship', owner: 1, tile: at(s, 2, 4), sortiesThisTurn: 0 });
    s.structure[at(s, 2, 4)] = 'shipyard';
    return s;
  }

  it('3 kez art arda yüksek atınca başkent düşer, eşitlik seriyi bozmaz, her şey devredilir', () => {
    let s = capitalSiege();
    const p1Tiles = s.owner.filter((o) => o === 1).length;
    const p0Tiles = s.owner.filter((o) => o === 0).length;
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 5) }, [5, 3, 4, 4, 6, 2, 8, 1]);
    const battle = s.log.find((l) => l.event.type === 'battle')!.event;
    expect(battle).toMatchObject({ kind: 'capital', success: true });
    expect(s.players[1].alive).toBe(false);
    expect(s.owner.filter((o) => o === 0).length).toBe(p0Tiles + p1Tiles);
    expect(s.owner.includes(1)).toBe(false);
    expect(s.players[0].resources).toMatchObject({ akce: 700, gold: 2, oil: 3, iron: 1, steel: 4 });
    expect(s.units.find((u) => u.id === 5)!.owner).toBe(0);
    // Eski başkent sıradan toprak olur, kazananın başkenti değişmez
    expect(s.structure[at(s, 3, 5)]).toBeNull();
    expect(s.players[0].capital).toBe(at(s, 0, 0));
    expect(s.phase.kind).toBe('actions');
  });

  it('savunan bir kez yüksek atarsa saldırı başarısız', () => {
    let s = capitalSiege();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 5) }, [5, 3, 6, 2, 2, 6]);
    expect(s.players[1].alive).toBe(true);
    expect(s.owner[at(s, 3, 5)]).toBe(1);
  });

  it('elenen oyuncunun sırası atlanır', () => {
    let s = capitalSiege();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 5) }, [5, 3, 6, 2, 7, 1]);
    s = act(s, { type: 'END_TURN', player: 0 });
    expect(s.currentPlayer).toBe(2);
  });
});

describe('askeri üs savaşı', () => {
  it('2 kez art arda yüksek atmak yeterli; üs ve toprak saldırana geçer', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 0) }, [3, 3, 5, 3, 7, 6]);
    expect(s.owner[at(s, 2, 0)]).toBe(0);
    expect(s.structure[at(s, 2, 0)]).toBe('base');
  });

  it('ilk atışta kaybedilirse üs savunanda kalır', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 0) }, [3, 5]);
    expect(s.owner[at(s, 2, 0)]).toBe(1);
  });
});

describe('kazanma koşulu', () => {
  it('tek devlet kalınca oyun biter', () => {
    let s = battlefield();
    // P0, P1 ve P2'nin başkentlerine komşu olsun
    own(s, 0, [[3, 4], [6, 0]]);
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 3, 5) }, [8, 1, 8, 1, 8, 1]);
    expect(s.phase.kind).toBe('actions');
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 7, 0) }, [8, 1, 8, 1, 8, 1]);
    expect(s.phase.kind).toBe('gameover');
    expect(s.winners).toEqual([0]);
  });
});
