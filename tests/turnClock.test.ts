import { describe, expect, it } from 'vitest';
import { timeoutAction } from '../src/bot';
import { createGame, dispatch, type GameState } from '../src/engine';
import { TurnClock, clockSegment } from '../src/ui/game/turnClock';
import { at, own, setCapital, testState } from './helpers';

const FIELD = ['########', '########', '########', '########'];

function duel(): GameState {
  const s = testState(FIELD, 3);
  for (let y = 0; y < 4; y++) {
    own(s, 0, [[0, y], [1, y], [2, y]]);
    own(s, 1, [[3, y], [4, y], [5, y]]);
    own(s, 2, [[7, y]]);
  }
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 5, 3);
  setCapital(s, 2, 7, 0);
  return s;
}

/** Süresi dolan oyuncu için bekleyen bütün otomatik eylemleri uygular */
function runTimeout(s: GameState, p: number): { state: GameState; types: string[] } {
  const types: string[] = [];
  for (let i = 0; i < 100; i++) {
    const a = timeoutAction(s, p);
    if (!a) break;
    types.push(a.type);
    s = dispatch(s, a).state;
  }
  return { state: s, types };
}

describe('süre dolunca otomatik eylemler', () => {
  it('topaç çevrilmemişse çevrilir, sonra tur biter', () => {
    const s = { ...duel(), phase: { kind: 'spin' as const } };
    const r = runTimeout(s, 0);
    expect(r.types).toEqual(['SPIN', 'END_TURN']);
    expect(r.state.currentPlayer).toBe(1);
  });

  it('eylem aşamasında yalnızca tur biter; sırası olmayan oyuncu için bir şey yapılmaz', () => {
    expect(runTimeout(duel(), 0).types).toEqual(['END_TURN']);
    expect(timeoutAction(duel(), 1)).toBeNull();
  });

  it('kazanılan savaştan sonra toprak seçimi Orta bot gibi yapılır, sonra tur biter', () => {
    const s: GameState = { ...duel(), phase: { kind: 'conquest', taker: 0, victim: 1, remaining: 2, anchor: null, counter: false } };
    const r = runTimeout(s, 0);
    expect(r.types).toEqual(['CONQUER_TILE', 'CONQUER_TILE', 'END_TURN']);
    expect(r.state.owner.filter((o) => o === 0).length).toBe(14);
  });

  it('karşı saldırıda savunanın süresi dolarsa toprakları o seçer; sıra saldıranda kalır', () => {
    const s: GameState = { ...duel(), phase: { kind: 'conquest', taker: 1, victim: 0, remaining: 1, anchor: null, counter: true } };
    const seg = clockSegment(s, () => true)!;
    expect(seg.players).toEqual([1]);
    expect(seg.key).toMatch(/^counter-/);
    const r = runTimeout(s, 1);
    expect(r.types).toEqual(['CONQUER_TILE']);
    expect(r.state.phase.kind).toBe('actions');
    expect(r.state.currentPlayer).toBe(0);
    expect(clockSegment(r.state, () => true)!.players).toEqual([0]);
  });

  it('bakım ödenemiyorsa birim dağıtılır', () => {
    const s = duel();
    s.config = { ...s.config, upkeepEnabled: true };
    s.structure[at(s, 1, 1)] = 'shipyard';
    s.units.push({ id: 1, kind: 'ship', owner: 0, tile: at(s, 1, 1), sortiesThisTurn: 0 });
    s.phase = { kind: 'upkeep', due: 50 };
    s.players[0].resources.akce = 0;
    const r = runTimeout(s, 0);
    expect(r.types[0]).toBe('DISBAND_UNIT');
    expect(r.types).toContain('SPIN');
    expect(r.types.at(-1)).toBe('END_TURN');
    expect(r.state.units).toHaveLength(0);
  });

  it('kurulumda başkent ve başlangıç toprakları seçilir', () => {
    let s = createGame({ players: [0, 1, 2].map((i) => ({ name: `P${i}`, color: '#000', kind: 'human' as const })), width: 35, height: 26, seed: 5 });
    let r = runTimeout(s, 0);
    expect(r.types).toEqual(['PLACE_CAPITAL']);
    s = r.state;
    s = runTimeout(s, 1).state;
    s = runTimeout(s, 2).state;
    expect(s.phase.kind).toBe('setup_territory');
    r = runTimeout(s, 0);
    expect(r.types.filter((t) => t === 'PICK_START_TILE').length).toBe(9);
    expect(r.state.currentPlayer).toBe(1);
  });

  it('oylamada Orta bot gibi oy verilir', () => {
    const s: GameState = { ...duel(), phase: { kind: 'vote', proposer: 0, votes: { 0: true } } };
    expect(clockSegment(s, () => true)!.players).toEqual([1, 2]);
    expect(timeoutAction(s, 1)).toEqual({ type: 'CAST_VOTE', player: 1, accept: true });
    expect(timeoutAction(s, 0)).toBeNull();
  });

  it('botlar için süre tutulmaz', () => {
    const s = duel();
    expect(clockSegment(s, (p) => p !== 0)).toBeNull();
  });
});

describe('tur saati', () => {
  it('bölüm değişince önceki durur, geri dönülünce kaldığı yerden sürer; her bölüm bir kez dolar', () => {
    const c = new TurnClock(60_000);
    c.set({ key: 'turn-1', players: [0] }, 0);
    expect(c.info(20_000)!.remainingMs).toBe(40_000);
    // Karşı saldırı: savunanın kendi süresi, saldıranınki durur
    c.set({ key: 'counter-1-1', players: [1] }, 20_000);
    expect(c.info(50_000)!).toEqual({ players: [1], remainingMs: 30_000, limitMs: 60_000 });
    c.set({ key: 'turn-1', players: [0] }, 50_000);
    expect(c.info(50_000)!.remainingMs).toBe(40_000);
    expect(c.poll(89_999)).toBeNull();
    expect(c.poll(90_000)).toEqual({ key: 'turn-1', players: [0] });
    expect(c.poll(95_000)).toBeNull();
    // Yeni tur tam süreyle başlar
    c.set({ key: 'turn-2', players: [1] }, 95_000);
    expect(c.info(95_000)!.remainingMs).toBe(60_000);
    // Duraklatma (ör. cihaz el değiştirirken)
    c.set(null, 100_000);
    expect(c.info(200_000)).toBeNull();
    c.set({ key: 'turn-2', players: [1] }, 200_000);
    expect(c.info(200_000)!.remainingMs).toBe(55_000);
  });
});
