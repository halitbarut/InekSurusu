import { describe, expect, it } from 'vitest';
import { UndoHistory, dispatch, isUndoable, type Action, type GameState } from '../src/engine';
import { at, own, setCapital, testState } from './helpers';

const FIELD = ['########..', '########..', '########..', '########..'];

function setup(): GameState {
  const s = testState(FIELD, 3, { battleCostsEnabled: true, upkeepEnabled: true });
  own(s, 0, [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]]);
  own(s, 1, [[3, 1], [4, 1], [4, 0]]);
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 4, 0);
  setCapital(s, 2, 7, 3);
  s.players[0].resources = { akce: 2000, gold: 2, oil: 3, iron: 4, steel: 4 };
  s.rngState = 123456;
  return s;
}

/** Eylemi uygular ve geçmişe kaydeder */
function run(h: UndoHistory, s: GameState, a: Action): GameState {
  const next = dispatch(s, a).state;
  h.record(s, a, next);
  return next;
}

describe('geri alma', () => {
  it('geri alınabilir eylemler RNG durumunu değiştirmez ve geri alma durumu birebir geri getirir', () => {
    const h = new UndoHistory();
    const s0 = setup();
    const snapshot = JSON.stringify(s0);
    let s = run(h, s0, { type: 'CLAIM_TILE', player: 0, tile: at(s0, 2, 0) });
    s = run(h, s, { type: 'BUILD', player: 0, tile: at(s0, 1, 1), structure: 'factory' });
    s = run(h, s, { type: 'PRODUCE', player: 0, tile: at(s0, 1, 1), unit: 'plane' });
    s = run(h, s, { type: 'EXCHANGE_GOLD', player: 0, amount: 2 });
    expect(s.rngState).toBe(s0.rngState);
    expect(h.canUndo(s, 0)).toBe(true);
    expect(h.size()).toBe(4);
    while (h.canUndo(s, 0)) s = h.undo()!.state;
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('savaştan sonra önceki eylemler geri alınamaz', () => {
    const h = new UndoHistory();
    let s = setup();
    s = run(h, s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 2, 0) });
    expect(h.canUndo(s, 0)).toBe(true);
    s = run(h, s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) });
    expect(h.canUndo(s, 0)).toBe(false);
    if (s.phase.kind === 'conquest') s = run(h, s, { type: 'END_CONQUEST', player: s.phase.taker });
    // Savaştan sonraki yeni eylem yine geri alınabilir ama savaştan öncekine dönülemez
    s = run(h, s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 2, 2) });
    expect(h.size()).toBe(1);
    const back = h.undo()!.state;
    expect(back.log.some((e) => e.event.type === 'battle')).toBe(true);
    expect(h.canUndo(back, 0)).toBe(false);
  });

  it('topaç, savaşa dönüşen sefer ve diplomasi geri alınamaz; sahipsiz toprağa sefer alınabilir', () => {
    const s = setup();
    s.units.push({ id: 1, kind: 'plane', owner: 0, tile: at(s, 1, 1), sortiesThisTurn: 0 });
    s.structure[at(s, 1, 1)] = 'factory';
    expect(isUndoable(s, { type: 'PLANE_EXPEDITION', player: 0, unitId: 1, target: at(s, 6, 3) })).toBe(true);
    expect(isUndoable(s, { type: 'PLANE_EXPEDITION', player: 0, unitId: 1, target: at(s, 3, 1) })).toBe(false);
    expect(isUndoable(s, { type: 'ATTACK', player: 0, target: at(s, 3, 1) })).toBe(false);
    expect(isUndoable(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'alliance' }] })).toBe(false);
    expect(isUndoable({ ...s, phase: { kind: 'spin' } }, { type: 'SPIN', player: 0 })).toBe(false);
    const h = new UndoHistory();
    const after = run(h, s, { type: 'PLANE_EXPEDITION', player: 0, unitId: 1, target: at(s, 6, 3) });
    expect(after.owner[at(s, 6, 3)]).toBe(0);
    expect(after.rngState).toBe(s.rngState);
    expect(h.canUndo(after, 0)).toBe(true);
  });

  it('kabul edilen teklif ve başka oyuncunun eylemi geçmişi temizler', () => {
    const h = new UndoHistory();
    let s = setup();
    s = run(h, s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 2, 0) });
    s = run(h, s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'peace', rounds: 3 }] });
    expect(h.canUndo(s, 0)).toBe(false);
    s = run(h, s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 2, 2) });
    expect(h.canUndo(s, 0)).toBe(true);
    s = run(h, s, { type: 'RESPOND_OFFER', player: 1, offerId: s.offers[0].id, accept: true });
    expect(h.canUndo(s, 0)).toBe(false);
  });

  it('tur bitince geçmiş temizlenir', () => {
    const h = new UndoHistory();
    let s = setup();
    s = run(h, s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 2, 0) });
    s = run(h, s, { type: 'END_TURN', player: 0 });
    expect(h.size()).toBe(0);
    expect(h.canUndo(s, 0)).toBe(false);
    expect(h.canUndo(s, 1)).toBe(false);
  });
});
