import { describe, expect, it } from 'vitest';
import { getBot } from '../src/bot';
import { DEFAULT_CONFIG, configProblems, createGame, upkeepDue, validateAction, type GameState } from '../src/engine';
import { act, at, own, setCapital, testState } from './helpers';

const FIELD = ['########', '########', '########', '########', '########', '########'];
const ON = { battleCostsEnabled: true, upkeepEnabled: true };

/** P0: x=0..1, P1: x=2..3 (üs (2,0)), P2: x=6..7 */
function battlefield(config = {}): GameState {
  const s = testState(FIELD, 3, { ...ON, ...config });
  for (let y = 0; y < 6; y++) {
    own(s, 0, [[0, y], [1, y]]);
    own(s, 1, [[2, y], [3, y]]);
    own(s, 2, [[6, y], [7, y]]);
  }
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 3, 5);
  setCapital(s, 2, 7, 0);
  s.structure[at(s, 2, 0)] = 'base';
  own(s, 0, [[3, 4]]); // P1 başkentine komşu
  return s;
}

const rich = { akce: 5000, gold: 0, oil: 10, iron: 10, steel: 10 };

describe('savaş masrafları', () => {
  it('normal savaş 100 akçe; sonuçtan bağımsız harcanır', () => {
    for (const spins of [[8, 1], [1, 8], [4, 4]]) {
      let s = battlefield();
      s.players[0].resources = { ...rich };
      s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }, spins);
      expect(s.players[0].resources.akce).toBe(4900);
      const battle = s.log.find((l) => l.event.type === 'battle')!.event;
      expect(battle).toMatchObject({ cost: { akce: 100, iron: 0, steel: 0 } });
    }
  });

  it('askeri üs savaşı 400 akçe + 2 demir, başkent savaşı 1000 akçe + 3 demir + 3 çelik', () => {
    let s = battlefield();
    s.players[0].resources = { ...rich };
    s = act(s, { type: 'ATTACK', player: 0, target: at(s, 2, 0) }, [1, 8]);
    expect(s.players[0].resources).toMatchObject({ akce: 4600, iron: 8, steel: 10 });
    let c = battlefield();
    c.players[0].resources = { ...rich };
    c = act(c, { type: 'ATTACK', player: 0, target: at(c, 3, 5) }, [1, 8]);
    expect(c.players[0].resources).toMatchObject({ akce: 4000, iron: 7, steel: 7 });
  });

  it('masraf yetmiyorsa savaş başlatılamaz', () => {
    const s = battlefield();
    s.players[0].resources = { akce: 0, gold: 0, oil: 0, iron: 10, steel: 10 };
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) })).toEqual({ ok: false, reason: 'Savaş için 100 akçe gerekli' });
    s.players[0].resources = { akce: 900, gold: 0, oil: 0, iron: 3, steel: 3 };
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 3, 5) })).toEqual({
      ok: false,
      reason: 'Başkent savaşı için 1000 akçe + 3 demir + 3 çelik gerekli',
    });
    s.players[0].resources = { akce: 1000, gold: 0, oil: 0, iron: 3, steel: 2 };
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 3, 5) }).ok).toBe(false);
    s.players[0].resources = { akce: 400, gold: 0, oil: 0, iron: 1, steel: 0 };
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 0) }).ok).toBe(false);
  });

  it('sahipsiz toprak almak savaş masrafı gerektirmez', () => {
    const s = testState(['....', '####'], 3, ON);
    own(s, 0, [[0, 1]]);
    s.players[0].resources.akce = 100;
    const after = act(s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 1, 1) });
    expect(after.players[0].resources.akce).toBe(0);
  });

  it('bayrak kapalıysa savaşlar bedelsiz', () => {
    const s = battlefield({ battleCostsEnabled: false });
    s.players[0].resources = { akce: 0, gold: 0, oil: 0, iron: 0, steel: 0 };
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 3, 5) }).ok).toBe(true);
  });
});

describe('bakım', () => {
  /** P1'in turu başlamak üzere: P0 turunu bitirir */
  function upkeepWorld(akce: number) {
    const s = battlefield();
    s.structure[at(s, 2, 3)] = 'shipyard';
    s.structure[at(s, 3, 3)] = 'factory';
    s.units.push({ id: 1, kind: 'ship', owner: 1, tile: at(s, 2, 3), sortiesThisTurn: 0 });
    s.units.push({ id: 2, kind: 'plane', owner: 1, tile: at(s, 3, 3), sortiesThisTurn: 0 });
    s.players[1].resources.akce = akce;
    return s;
  }

  it('gemi, uçak ve üs başına 100 akçe topaçtan önce otomatik ödenir', () => {
    let s = upkeepWorld(500);
    expect(upkeepDue(s, 1)).toBe(300);
    s = act(s, { type: 'END_TURN', player: 0 });
    expect(s.phase.kind).toBe('spin');
    expect(s.players[1].resources.akce).toBe(200);
    expect(s.log.some((l) => l.event.type === 'upkeep' && l.event.amount === 300)).toBe(true);
  });

  it('akçe yetmezse oyuncu dağıtacaklarını seçer; ödenemeyen kadar birim gider', () => {
    let s = upkeepWorld(100);
    s = act(s, { type: 'END_TURN', player: 0 });
    expect(s.phase).toEqual({ kind: 'upkeep', due: 300 });
    expect(validateAction(s, { type: 'SPIN', player: 1 }).ok).toBe(false);
    s = act(s, { type: 'DISBAND_UNIT', player: 1, unitId: 2 });
    expect(s.phase).toEqual({ kind: 'upkeep', due: 200 });
    // Üs ödenemezse yıkılır, toprak kalır
    s = act(s, { type: 'DEMOLISH_BASE', player: 1, tile: at(s, 2, 0) });
    expect(s.structure[at(s, 2, 0)]).toBeNull();
    expect(s.owner[at(s, 2, 0)]).toBe(1);
    expect(s.phase.kind).toBe('spin');
    expect(s.players[1].resources.akce).toBe(0);
    expect(s.units.map((u) => u.id)).toEqual([1]);
  });

  it('bakım aşamasında altın bozdurup borç kapatılabilir', () => {
    let s = upkeepWorld(100);
    s.players[1].resources.gold = 1;
    s = act(s, { type: 'END_TURN', player: 0 });
    s = act(s, { type: 'EXCHANGE_GOLD', player: 1, amount: 1 });
    expect(s.phase.kind).toBe('spin');
    expect(s.players[1].resources.akce).toBe(0);
  });

  it('bot bakım borcunu kendisi çözer', () => {
    let s = upkeepWorld(0);
    s.players[1].kind = 'bot';
    s = act(s, { type: 'END_TURN', player: 0 });
    const bot = getBot('medium');
    for (let k = 0; k < 5 && s.phase.kind === 'upkeep'; k++) s = act(s, bot.chooseAction(s, 1));
    expect(s.phase.kind).toBe('spin');
    expect(upkeepDue(s, 1)).toBe(0);
  });
});

describe('isteğe bağlı kurallar', () => {
  it('zayıflık şartı: savunanın toprağı saldıranın yarısından az olmalı', () => {
    const s = battlefield({ weaknessRule: true });
    s.players[0].resources = { ...rich };
    // P0: 13 toprak, P1: 12 toprak
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 3, 5) }).ok).toBe(false);
    for (let y = 0; y < 4; y++) s.owner[at(s, 3, y)] = null;
    for (let y = 0; y < 4; y++) s.owner[at(s, 2, y + 1)] = null; // P1: (2,0) üs, (2,5), (3,5)... az toprak
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 3, 5) }).ok).toBe(true);
    // Kara savaşları etkilenmez
    const t = battlefield({ weaknessRule: true });
    t.players[0].resources = { ...rich };
    expect(validateAction(t, { type: 'ATTACK', player: 0, target: at(t, 2, 2) }).ok).toBe(true);
  });

  it('açılış barışı: ilk N tur oyuncu topraklarına saldırı yok, sahipsiz toprak serbest', () => {
    const s = battlefield({ openingPeace: true, openingPeaceRounds: 5 });
    s.players[0].resources = { ...rich };
    s.round = 5;
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(false);
    expect(validateAction(s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 4, 0) }).ok).toBe(false); // komşu değil
    own(s, 0, [[4, 1]]);
    expect(validateAction(s, { type: 'CLAIM_TILE', player: 0, tile: at(s, 5, 1) }).ok).toBe(true);
    s.round = 6;
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(true);
  });
});

describe("akçe değerleri 100'ün katı", () => {
  it('varsayılan ayarlar geçerli, 100 katı olmayan değerler reddedilir', () => {
    expect(configProblems(DEFAULT_CONFIG)).toEqual([]);
    expect(configProblems({ ...DEFAULT_CONFIG, claimCost: 150, shipUpkeep: 50 })).toHaveLength(2);
    expect(() =>
      createGame({ players: ['A', 'B', 'C'].map((name) => ({ name, color: '#000', kind: 'bot' as const })), width: 40, height: 30, seed: 1, config: { landBattleAkce: 250 } }),
    ).toThrow(/100'ün katı/);
  });

  it('boğaz vergisi ve akçe takası da 100 katı olmalı', () => {
    const s = battlefield();
    s.players[0].resources = { ...rich };
    expect(validateAction(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'resource', giver: 'from', resource: 'akce', amount: 150 }] }).ok).toBe(false);
    expect(validateAction(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'resource', giver: 'from', resource: 'akce', amount: 200 }] }).ok).toBe(true);
  });
});
