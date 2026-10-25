import { describe, expect, it } from 'vitest';
import { conquestCandidates, expectedLandResult, landBattleOutcome, seriesWinProbability, validateAction } from '../src/engine';
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
  it('A > D: saldıran A − D toprak alır', () => {
    expect(landBattleOutcome(7, 2)).toEqual({ gain: 5, loss: 0 });
    expect(landBattleOutcome(8, 1)).toEqual({ gain: 7, loss: 0 });
    expect(landBattleOutcome(4, 3)).toEqual({ gain: 1, loss: 0 });
  });

  it('A < D: savunan ceil((D − A) / 2) toprak alır', () => {
    expect(landBattleOutcome(2, 7)).toEqual({ gain: 0, loss: 3 }); // 2.5 → 3
    expect(landBattleOutcome(3, 4)).toEqual({ gain: 0, loss: 1 }); // 0.5 → 1
    expect(landBattleOutcome(1, 5)).toEqual({ gain: 0, loss: 2 });
  });

  it('A = D: sonuçsuz', () => {
    expect(landBattleOutcome(5, 5)).toEqual({ gain: 0, loss: 0 });
  });

  it('beklenen kazanç/kayıp ve seri olasılıkları', () => {
    const e = expectedLandResult(8);
    expect(e.gain).toBeCloseTo(84 / 64);
    expect(e.loss).toBeCloseTo(50 / 64);
    expect(seriesWinProbability(3)).toBe(1 / 8);
    expect(seriesWinProbability(2)).toBe(1 / 4);
  });
});

describe('kara savaşı', () => {
  it('A > D: saldıran toprakları seçer, her seçim sınıra komşu olmalı', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }, [4, 1]);
    expect(s.phase).toMatchObject({ kind: 'conquest', taker: 0, victim: 1, remaining: 3, counter: false });
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

  it('7 – 2: saldıran 5 toprak alır', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }, [7, 2]);
    expect(s.phase).toMatchObject({ kind: 'conquest', taker: 0, remaining: 5 });
    const before = s.owner.filter((o) => o === 0).length;
    for (let k = 0; k < 5; k++) s = act(s, { type: 'CONQUER_TILE', player: 0, tile: conquestCandidates(s)[0] });
    expect(s.owner.filter((o) => o === 0).length).toBe(before + 5);
    expect(s.phase.kind).toBe('actions');
  });

  it('2 – 7: savunan karşı saldırıyla 3 toprak alır, toprakları savunan seçer; sonra sıra saldıranda', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }, [2, 7]);
    expect(s.phase).toMatchObject({ kind: 'conquest', taker: 1, victim: 0, remaining: 3, counter: true });
    // Saldıran seçemez
    expect(validateAction(s, { type: 'CONQUER_TILE', player: 0, tile: at(s, 1, 2) }).ok).toBe(false);
    // Yalnızca savunana komşu saldıran toprakları; başkent hariç
    const c = conquestCandidates(s);
    expect(c).toContain(at(s, 1, 2));
    expect(c).not.toContain(at(s, 0, 2));
    expect(c).not.toContain(at(s, 0, 0));
    s = act(s, { type: 'CONQUER_TILE', player: 1, tile: at(s, 1, 2) });
    s = act(s, { type: 'CONQUER_TILE', player: 1, tile: at(s, 0, 2) }); // artık komşu
    s = act(s, { type: 'CONQUER_TILE', player: 1, tile: at(s, 1, 3) });
    expect(s.phase.kind).toBe('actions');
    expect(s.currentPlayer).toBe(0);
    expect(s.owner[at(s, 0, 2)]).toBe(1);
  });

  it('3 – 4: savunan 1 toprak alır', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }, [3, 4]);
    expect(s.phase).toMatchObject({ kind: 'conquest', taker: 1, remaining: 1, counter: true });
  });

  it('karşı saldırıda yeterli toprak yoksa seçilebildiği kadar alınır', () => {
    let s = battlefield();
    // P0: başkent (0,0) + (0,1) + (1,1); P1'e komşu sıradan toprakları az
    for (let y = 0; y < 6; y++) {
      s.owner[at(s, 0, y)] = null;
      s.owner[at(s, 1, y)] = null;
    }
    own(s, 0, [[0, 0], [0, 1], [1, 1]]);
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 1) }, [1, 8]);
    expect(s.phase).toMatchObject({ kind: 'conquest', taker: 1, remaining: 4 });
    s = act(s, { type: 'CONQUER_TILE', player: 1, tile: at(s, 1, 1) });
    s = act(s, { type: 'CONQUER_TILE', player: 1, tile: at(s, 0, 1) });
    // Geriye yalnızca başkent kaldı: 4 yerine 2 toprak alındı, fetih kendiliğinden bitti
    expect(s.phase.kind).toBe('actions');
    expect(s.owner[at(s, 0, 0)]).toBe(0);
  });

  it('başkent ve askeri üs normal savaşla alınamaz', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 1) }, [8, 1]);
    const c = conquestCandidates(s);
    expect(c).not.toContain(at(s, 2, 0)); // üs
    expect(c).not.toContain(at(s, 3, 5)); // başkent
    expect(c).toContain(at(s, 2, 5));
  });

  it('eşitlikte hiçbir şey olmaz', () => {
    const s0 = battlefield();
    const s = act(s0, { type: 'ATTACK', player: 0, target: at(s0, 2, 2) }, [5, 5]);
    expect(s.phase.kind).toBe('actions');
    expect(s.owner).toEqual(s0.owner);
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
});

describe('turda tek savaş', () => {
  it('ikinci saldırı reddedilir, sonraki turda hak yenilenir', () => {
    let s = battlefield();
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }, [5, 5]);
    const v = validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) });
    expect(v).toEqual({ ok: false, reason: 'Bu tur savaş hakkını kullandın' });
    for (const p of [0, 1, 2]) {
      s = act(s, { type: 'END_TURN', player: p });
      s = act(s, { type: 'SPIN', player: (p + 1) % 3 }, [1]);
    }
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(true);
  });

  it('başkent/üs savaşı da hakkı kullanır; kaybedilirse karşı toprak kaybı yok', () => {
    let s = battlefield();
    const before = [...s.owner];
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 0) }, [2, 8]);
    expect(s.owner).toEqual(before);
    expect(s.phase.kind).toBe('actions');
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(false);
  });

  it('sahipsiz toprak almak savaş sayılmaz', () => {
    const map = ['#########', '#########'];
    let s = testState(map, 3);
    own(s, 0, [[0, 0]]);
    own(s, 1, [[2, 0]]);
    s.players[0].resources.akce = 500;
    s = act(s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 0, 1) });
    s = act(s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 1, 0) });
    expect(s.players[0].battlesThisTurn).toBe(0);
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 0) }).ok).toBe(true);
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
    s.players[0].battlesThisTurn = 0; // ikinci savaş için turu atla
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 7, 0) }, [8, 1, 8, 1, 8, 1]);
    expect(s.phase.kind).toBe('gameover');
    expect(s.winners).toEqual([0]);
  });
});
