import { describe, expect, it } from 'vitest';
import { MediumBot } from '../src/bot';
import { BUILTIN_PRESETS, DEFAULT_CONFIG, UndoHistory, demolishPlan, dispatch, parseAction, presetConfig, upkeepDue, validateAction, type Action, type GameState } from '../src/engine';
import { act, at, own, setCapital, testState } from './helpers';

const FIELD = ['##..####', '##..####', '##..####', '##..####'];

function world(): GameState {
  const s = testState(FIELD, 3, { upkeepEnabled: true, demolishCost: 100 });
  own(s, 0, [[0, 0], [1, 0], [1, 1], [1, 2], [1, 3]]);
  setCapital(s, 0, 0, 3);
  setCapital(s, 1, 7, 0);
  setCapital(s, 2, 7, 3);
  s.players[0].resources = { akce: 1000, gold: 0, oil: 0, iron: 0, steel: 0 };
  s.structure[at(s, 1, 0)] = 'shipyard';
  s.units.push({ id: 1, kind: 'ship', owner: 0, tile: at(s, 1, 0), sortiesThisTurn: 0 });
  return s;
}

describe('yapı fiyatları', () => {
  it('yeni varsayılanlar; Klasik kağıt oyuna en yakın değerleri korur', () => {
    expect([DEFAULT_CONFIG.shipyardCost, DEFAULT_CONFIG.factoryCost, DEFAULT_CONFIG.baseCost, DEFAULT_CONFIG.demolishCost]).toEqual([400, 600, 800, 100]);
    const by = (id: string) => presetConfig(BUILTIN_PRESETS.find((p) => p.id === id)!);
    expect([by('classic').shipyardCost, by('classic').factoryCost, by('classic').baseCost]).toEqual([200, 300, 400]);
    for (const id of ['balanced', 'quick', 'calm']) expect([by(id).shipyardCost, by(id).factoryCost, by(id).baseCost]).toEqual([400, 600, 800]);
  });
});

describe('yapı yıkma', () => {
  it('ücret alınır, yapı kalkar, toprak sende kalır', () => {
    let s = world();
    s.structure[at(s, 1, 1)] = 'base';
    s = act(s, { type: 'DEMOLISH', player: 0, tile: at(s, 1, 1) });
    expect(s.players[0].resources.akce).toBe(900);
    expect(s.structure[at(s, 1, 1)]).toBeNull();
    expect(s.owner[at(s, 1, 1)]).toBe(0);
  });

  it('başkent yıkılamaz; başkasının yapısı yıkılamaz; akçe yetmezse olmaz; yalnızca kendi eylem aşamasında', () => {
    const s = world();
    expect(validateAction(s, { type: 'DEMOLISH', player: 0, tile: s.players[0].capital! })).toEqual({ ok: false, reason: 'Başkent yıkılamaz' });
    expect(validateAction(s, { type: 'DEMOLISH', player: 0, tile: s.players[1].capital! }).ok).toBe(false);
    expect(validateAction(s, { type: 'DEMOLISH', player: 1, tile: at(s, 1, 0) }).ok).toBe(false);
    const poor = structuredClone(s);
    poor.players[0].resources.akce = 50;
    expect(validateAction(poor, { type: 'DEMOLISH', player: 0, tile: at(s, 1, 0) }).ok).toBe(false);
    expect(validateAction({ ...s, phase: { kind: 'spin' } }, { type: 'DEMOLISH', player: 0, tile: at(s, 1, 0) }).ok).toBe(false);
  });

  it('konuşlu birimler aynı türden en yakın yapıya taşınır', () => {
    let s = world();
    s.structure[at(s, 1, 3)] = 'shipyard';
    expect(demolishPlan(s, 0, at(s, 1, 0))).toEqual({ moves: [{ unitId: 1, to: at(s, 1, 3) }], disbanded: [] });
    s = act(s, { type: 'DEMOLISH', player: 0, tile: at(s, 1, 0) });
    expect(s.units[0].tile).toBe(at(s, 1, 3));
    expect(s.log.at(-1)!.event).toMatchObject({ type: 'demolish', moved: 1, disbanded: 0 });
  });

  it('aynı türden başka yapı yoksa birimler terhis edilir, bakımı düşer', () => {
    let s = world();
    expect(upkeepDue(s, 0)).toBe(50);
    expect(demolishPlan(s, 0, at(s, 1, 0)).disbanded).toEqual([1]);
    s = act(s, { type: 'DEMOLISH', player: 0, tile: at(s, 1, 0) });
    expect(s.units).toHaveLength(0);
    expect(upkeepDue(s, 0)).toBe(0);
  });

  it('geri alınabilir: yapı, birim ve akçe geri gelir', () => {
    const h = new UndoHistory();
    const before = world();
    const action: Action = { type: 'DEMOLISH', player: 0, tile: at(before, 1, 0) };
    const after = dispatch(before, action).state;
    h.record(before, action, after);
    expect(h.canUndo(after, 0)).toBe(true);
    const u = h.undo()!;
    expect(u.state.structure[at(before, 1, 0)]).toBe('shipyard');
    expect(u.state.units).toHaveLength(1);
    expect(u.state.players[0].resources.akce).toBe(1000);
  });

  it('ücretsiz üs yıkma yalnızca bakım ödenemezken', () => {
    const s = world();
    s.structure[at(s, 1, 1)] = 'base';
    expect(validateAction(s, { type: 'DEMOLISH_BASE', player: 0, tile: at(s, 1, 1) }).ok).toBe(false);
    expect(validateAction({ ...s, phase: { kind: 'upkeep', due: 50 } }, { type: 'DEMOLISH_BASE', player: 0, tile: at(s, 1, 1) }).ok).toBe(true);
  });

  it('eylem biçimi denetimi', () => {
    expect(parseAction({ type: 'DEMOLISH', player: 0, tile: 3 })).toEqual({ type: 'DEMOLISH', player: 0, tile: 3 });
    expect(parseAction({ type: 'DEMOLISH', player: 0, tile: 'x' })).toBeNull();
  });

  it('bot gidecek yeri kalmamış boş tersaneyi yıkar', () => {
    const s = testState(['########', '####....', '####....', '####....', '########'], 3, { upkeepEnabled: true });
    setCapital(s, 0, 0, 0);
    setCapital(s, 1, 1, 0);
    setCapital(s, 2, 1, 4);
    // P0 kıyının tamamına sahip: tersanesinden gidecek yabancı kıyı yok
    for (let i = 0; i < s.owner.length; i++) if (s.map.terrain[i] === 'land') s.owner[i] = 0;
    s.owner[s.players[1].capital!] = 1;
    s.owner[s.players[2].capital!] = 2;
    s.structure[at(s, 3, 1)] = 'shipyard';
    s.players[0].resources = { akce: 5000, gold: 0, oil: 0, iron: 0, steel: 0 };
    class Probe extends MediumBot {
      probe(st: GameState) {
        return this.pickDemolish(st, 0);
      }
    }
    // Yabancı kıyı var: yıkmaz; hepsi kendi kıyısı olunca yıkar
    const open = structuredClone(s);
    open.owner[at(open, 4, 0)] = 1;
    expect(new Probe().probe(open)).toBeNull();
    expect(new Probe().probe(s)).toEqual({ type: 'DEMOLISH', player: 0, tile: at(s, 3, 1) });
  });
});

describe('terhis', () => {
  it('ücretsiz, geri ödeme yok; bir sonraki turdan bakım ödenmez; geri alınabilir', () => {
    const h = new UndoHistory();
    const before = world();
    const action: Action = { type: 'DISBAND_UNIT', player: 0, unitId: 1 };
    const after = dispatch(before, action).state;
    h.record(before, action, after);
    expect(after.units).toHaveLength(0);
    expect(after.players[0].resources).toEqual(before.players[0].resources);
    expect(upkeepDue(after, 0)).toBe(0);
    expect(h.canUndo(after, 0)).toBe(true);
    expect(h.undo()!.state.units).toHaveLength(1);
  });
});
