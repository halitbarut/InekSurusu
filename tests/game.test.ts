import { describe, expect, it } from 'vitest';
import { getBot } from '../src/bot';
import {
  DEFAULT_CONFIG,
  MINE_TYPES,
  createGame,
  createGameFromMap,
  dispatch,
  fitsStartAreas,
  generateMap,
  mapFromAscii,
  mapProblems,
  mutRelation,
  validateAction,
  type GameState,
} from '../src/engine';
import { act, at, own, setCapital, testState } from './helpers';

const FIELD = ['########', '########', '########', '########', '########', '########'];

function neighbours3(): GameState {
  const s = testState(FIELD, 3);
  for (let y = 0; y < 6; y++) {
    own(s, 0, [[0, y], [1, y]]);
    own(s, 1, [[2, y], [3, y]]);
    own(s, 2, [[6, y], [7, y]]);
  }
  setCapital(s, 0, 0, 0);
  setCapital(s, 1, 3, 5);
  setCapital(s, 2, 7, 0);
  return s;
}

describe('harita üretici', () => {
  it('aynı seed ile aynı haritayı üretir', () => {
    const a = generateMap({ width: 40, height: 30, seed: 1234, players: 4, minesPerTypePerPlayer: DEFAULT_CONFIG.minesPerTypePerPlayer, startTerritoryCount: 9 });
    const b = generateMap({ width: 40, height: 30, seed: 1234, players: 4, minesPerTypePerPlayer: DEFAULT_CONFIG.minesPerTypePerPlayer, startTerritoryCount: 9 });
    const c = generateMap({ width: 40, height: 30, seed: 999, players: 4, minesPerTypePerPlayer: DEFAULT_CONFIG.minesPerTypePerPlayer, startTerritoryCount: 9 });
    expect(a).toEqual(b);
    expect(a.terrain).not.toEqual(c.terrain);
  });

  it.each([
    [3, 40, 30],
    [6, 50, 36],
    [8, 60, 42],
  ])('%i oyuncu: yeterli kara, boğazlar, göl ve her madenden oyuncu sayısı kadar', (players, width, height) => {
    for (let seed = 1; seed <= 5; seed++) {
      const m = generateMap({ width, height, seed, players, minesPerTypePerPlayer: DEFAULT_CONFIG.minesPerTypePerPlayer, startTerritoryCount: 9 });
      expect(mapProblems(m, { players, startTerritoryCount: 9 })).toEqual([]);
      expect(m.straits.length).toBeGreaterThanOrEqual(3);
      expect(fitsStartAreas(m, players, 9, 5)).toBe(true);
      for (const t of MINE_TYPES) expect(m.mines.filter((x) => x === t)).toHaveLength(players);
      for (let i = 0; i < m.mines.length; i++) if (m.mines[i]) expect(m.terrain[i]).toBe('land');
      // Boğaz yakaları kara, boğaz kareleri deniz
      for (const st of m.straits) {
        for (const t of st.tiles) expect(m.terrain[t]).toBe('sea');
        for (const b of st.banks) expect(m.terrain[b]).toBe('land');
      }
    }
  });
});

describe('oyun başlangıcı', () => {
  const players = ['A', 'B', 'C'].map((name) => ({ name, color: '#000', kind: 'human' as const }));
  const OPEN = Array.from({ length: 12 }, () => '#####G######');

  it('başlangıçta seçilecek komşu madensiz kare kalmayınca seçim kendiliğinden biter', () => {
    // Başkentin tek kara komşusu maden
    let s = createGameFromMap(mapFromAscii(['##G..', '..#..', '.....', '#######.#####', '#############'].map((r) => r.padEnd(13, '.'))), players);
    s.phase = { kind: 'setup_territory', picksLeft: 9 };
    s.owner[1] = 0;
    s.structure[1] = 'capital';
    s.players[0].capital = 1;
    s = act(s, { type: 'PICK_START_TILE', player: 0, tile: 0 });
    // P0'ın seçimi 9 dolmadan bitti (diğerlerinin hiç toprağı yok, onlar da atlanır)
    expect(s.log.find((l) => l.event.type === 'setup_done')?.event).toEqual({ type: 'setup_done', player: 0, tiles: 2 });
    expect(s.phase.kind).toBe('spin');
  });

  it('başkent madensiz, sahipsiz kara olmalı ve diğer başkentlerden uzak olmalı', () => {
    let s = createGameFromMap(mapFromAscii(OPEN), players);
    expect(validateAction(s, { type: 'PLACE_CAPITAL', player: 0, tile: 5 }).ok).toBe(false); // maden
    s = act(s, { type: 'PLACE_CAPITAL', player: 0, tile: 0 });
    expect(s.currentPlayer).toBe(1);
    expect(validateAction(s, { type: 'PLACE_CAPITAL', player: 1, tile: 1 }).ok).toBe(false);
    expect(validateAction(s, { type: 'PLACE_CAPITAL', player: 1, tile: 11 }).ok).toBe(true);
  });

  it('9 toprak bitişik seçilir, sonra sıradakine geçilir; herkes bitirince oyun başlar', () => {
    let s = createGameFromMap(mapFromAscii(OPEN), players);
    s = act(s, { type: 'PLACE_CAPITAL', player: 0, tile: 0 });
    s = act(s, { type: 'PLACE_CAPITAL', player: 1, tile: 11 });
    s = act(s, { type: 'PLACE_CAPITAL', player: 2, tile: 12 * 11 });
    expect(s.phase).toEqual({ kind: 'setup_territory', picksLeft: 9 });
    expect(validateAction(s, { type: 'PICK_START_TILE', player: 0, tile: 2 }).ok).toBe(false); // komşu değil
    for (const t of [1, 2, 3, 4]) s = act(s, { type: 'PICK_START_TILE', player: 0, tile: t });
    // Maden kareleri başlangıçta seçilemez
    expect(validateAction(s, { type: 'PICK_START_TILE', player: 0, tile: 5 })).toEqual({ ok: false, reason: 'Başlangıçta maden kareleri seçilemez' });
    for (const t of [12, 13, 14, 15, 16]) s = act(s, { type: 'PICK_START_TILE', player: 0, tile: t });
    expect(s.currentPlayer).toBe(1);
    expect(validateAction(s, { type: 'PICK_START_TILE', player: 1, tile: 10 + 12 }).ok).toBe(false);
    s = act(s, { type: 'SKIP_START_PICKS', player: 1 });
    s = act(s, { type: 'SKIP_START_PICKS', player: 2 });
    expect(s.phase.kind).toBe('spin');
    expect(s.currentPlayer).toBe(0);
    // Madensiz başlangıç: gelir yok
    expect(s.players[0].resources.gold).toBe(0);
    expect(s.owner.some((o, i) => o !== null && s.map.mines[i])).toBe(false);
  });
});

describe('tur akışı', () => {
  it('topaç bir kez çevrilir, sayı × 100 akçe verir', () => {
    let s = neighbours3();
    s.phase = { kind: 'spin' };
    s = act(s, { type: 'SPIN', player: 0 }, [6]);
    expect(s.players[0].resources.akce).toBe(600);
    expect(validateAction(s, { type: 'SPIN', player: 0 }).ok).toBe(false);
  });

  it('sahipsiz komşu toprak 100 akçe; altın 200 akçeye bozdurulur', () => {
    const map = mapFromAscii(['####', '####']);
    let s = createGameFromMap(map, ['A', 'B', 'C'].map((name) => ({ name, color: '#000', kind: 'human' as const })));
    s.phase = { kind: 'actions' };
    s.owner[0] = 0;
    s.players[0].resources.gold = 2;
    expect(validateAction(s, { type: 'CLAIM_TILE', player: 0, tile: 1 }).ok).toBe(false);
    s = act(s, { type: 'EXCHANGE_GOLD', player: 0, amount: 1 });
    expect(s.players[0].resources).toMatchObject({ akce: 200, gold: 1 });
    s = act(s, { type: 'CLAIM_TILE', player: 0, tile: 1 });
    expect(s.owner[1]).toBe(0);
    expect(s.players[0].resources.akce).toBe(100);
    expect(validateAction(s, { type: 'CLAIM_TILE', player: 0, tile: 3 }).ok).toBe(false); // komşu değil
  });

  it('yapılar ve üretim kurallara uyar', () => {
    let s = testState(['....', '####', '####'], 3);
    own(s, 0, [[0, 1], [1, 1], [0, 2], [1, 2]]);
    setCapital(s, 0, 1, 2);
    s.players[0].resources = { akce: 2000, gold: 0, oil: 0, iron: 2, steel: 2 };
    expect(validateAction(s, { type: 'BUILD', player: 0, tile: at(s, 0, 2), structure: 'shipyard' }).ok).toBe(false); // kıyı değil
    expect(validateAction(s, { type: 'BUILD', player: 0, tile: at(s, 1, 2), structure: 'base' }).ok).toBe(false); // başkent
    s = act(s, { type: 'BUILD', player: 0, tile: at(s, 0, 1), structure: 'shipyard' });
    s = act(s, { type: 'BUILD', player: 0, tile: at(s, 1, 1), structure: 'factory' });
    s = act(s, { type: 'BUILD', player: 0, tile: at(s, 0, 2), structure: 'base' });
    expect(s.players[0].resources.akce).toBe(2000 - 200 - 300 - 400);
    s = act(s, { type: 'PRODUCE', player: 0, tile: at(s, 0, 1), unit: 'ship' });
    s = act(s, { type: 'PRODUCE', player: 0, tile: at(s, 1, 1), unit: 'plane' });
    expect(s.players[0].resources).toMatchObject({ akce: 1100 - 100 - 200, iron: 0, steel: 0 });
    expect(s.units.map((u) => [u.kind, u.tile])).toEqual([
      ['ship', at(s, 0, 1)],
      ['plane', at(s, 1, 1)],
    ]);
    expect(validateAction(s, { type: 'PRODUCE', player: 0, tile: at(s, 0, 1), unit: 'ship' }).ok).toBe(false); // demir bitti
  });
});

describe('diplomasi', () => {
  it('ittifak kabul edilince saldırı yasak; bozulduğu tur da yasak, sonraki turda serbest', () => {
    let s = neighbours3();
    s = act(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'alliance' }] });
    const offerId = s.offers[0].id;
    s = act(s, { type: 'RESPOND_OFFER', player: 1, offerId, accept: true });
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(false);
    s = act(s, { type: 'BREAK_ALLIANCE', player: 0, target: 1 });
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(false);
    // Bir tam tur sonra
    for (const p of [0, 1, 2]) {
      s = act(s, { type: 'END_TURN', player: p });
      s = act(s, { type: 'SPIN', player: (p + 1) % 3 }, [1]);
    }
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(true);
  });

  it('barış süresi boyunca saldırı yok ve bozulamaz', () => {
    let s = neighbours3();
    s = act(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'peace', rounds: 1 }] });
    s = act(s, { type: 'RESPOND_OFFER', player: 1, offerId: s.offers[0].id, accept: true });
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(false);
    expect(validateAction(s, { type: 'BREAK_ALLIANCE', player: 0, target: 1 }).ok).toBe(false);
    for (let k = 0; k < 2; k++) {
      for (const p of [0, 1, 2]) {
        s = act(s, { type: 'END_TURN', player: p });
        s = act(s, { type: 'SPIN', player: (p + 1) % 3 }, [1]);
      }
    }
    expect(validateAction(s, { type: 'ATTACK', player: 0, target: at(s, 2, 2) }).ok).toBe(true);
  });

  it('takas: kaynak ve toprak devri; kabul anında kaynak yetmezse başarısız', () => {
    let s = neighbours3();
    s.players[0].resources.akce = 500;
    s.players[1].resources.oil = 3;
    s = act(s, {
      type: 'PROPOSE_OFFER',
      player: 0,
      to: 1,
      items: [
        { kind: 'resource', giver: 'from', resource: 'akce', amount: 300 },
        { kind: 'resource', giver: 'to', resource: 'oil', amount: 2 },
        { kind: 'tile', giver: 'to', tile: at(s, 2, 2) },
      ],
    });
    const id = s.offers[0].id;
    const ok = act(s, { type: 'RESPOND_OFFER', player: 1, offerId: id, accept: true });
    expect(ok.players[0].resources).toMatchObject({ akce: 200, oil: 2 });
    expect(ok.players[1].resources).toMatchObject({ akce: 300, oil: 1 });
    expect(ok.owner[at(s, 2, 2)]).toBe(0);
    // Teklif bekliyorken teklif sahibi akçesini harcadı
    s.players[0].resources.akce = 100;
    const bad = act(s, { type: 'RESPOND_OFFER', player: 1, offerId: id, accept: true });
    expect(bad.players[1].resources.oil).toBe(3);
    expect(bad.offers).toHaveLength(0);
  });

  it('başkent devredilemez ve müttefikler birbirine teklif edemez ittifak', () => {
    const s = neighbours3();
    expect(validateAction(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'tile', giver: 'from', tile: at(s, 0, 0) }] }).ok).toBe(false);
    mutRelation(s, 0, 1).allied = true;
    expect(validateAction(s, { type: 'PROPOSE_OFFER', player: 0, to: 1, items: [{ kind: 'alliance' }] }).ok).toBe(false);
  });

  it('boğaz geçiş izni / vergi muafiyeti teklifle verilebilir', () => {
    let s = testState(['#############', '#...###...###', '#...###...###', '#.........###', '#...###...###', '#...###...###', '#############'], 3);
    for (const b of s.map.straits[0].banks) s.owner[b] = 1;
    setCapital(s, 1, 5, 0);
    s = act(s, { type: 'END_TURN', player: 0 }); // idare hesaplanır, sıra P1'de
    s = act(s, { type: 'SPIN', player: 1 }, [1]);
    s = act(s, { type: 'SET_STRAIT_POLICY', player: 1, straitId: 0, target: 0, allow: false, toll: 0 });
    s = act(s, { type: 'PROPOSE_OFFER', player: 1, to: 0, items: [{ kind: 'strait', giver: 'from', straitId: 0, toll: 0 }] });
    s = act(s, { type: 'RESPOND_OFFER', player: 0, offerId: s.offers[0].id, accept: true });
    expect(s.straits[0].policies[0]).toEqual({ allow: true, toll: 0 });
  });
});

describe('ittifakla kazanma', () => {
  function allied3() {
    const s = neighbours3();
    mutRelation(s, 0, 1).allied = true;
    mutRelation(s, 0, 2).allied = true;
    mutRelation(s, 1, 2).allied = true;
    return s;
  }

  it('kalan herkes aynı ittifaktaysa oybirliğiyle birlikte kazanırlar', () => {
    let s = allied3();
    s = act(s, { type: 'PROPOSE_VICTORY', player: 0 });
    expect(s.phase.kind).toBe('vote');
    expect(validateAction(s, { type: 'END_TURN', player: 0 }).ok).toBe(false);
    s = act(s, { type: 'CAST_VOTE', player: 1, accept: true });
    s = act(s, { type: 'CAST_VOTE', player: 2, accept: true });
    expect(s.phase.kind).toBe('gameover');
    expect(s.winners).toEqual([0, 1, 2]);
  });

  it('tek bir ret oylamayı düşürür', () => {
    let s = allied3();
    s = act(s, { type: 'PROPOSE_VICTORY', player: 0 });
    s = act(s, { type: 'CAST_VOTE', player: 2, accept: false });
    expect(s.phase.kind).toBe('actions');
    expect(s.winners).toBeNull();
  });

  it('ittifak tamam değilse oylama önerilemez', () => {
    const s = neighbours3();
    mutRelation(s, 0, 1).allied = true;
    expect(validateAction(s, { type: 'PROPOSE_VICTORY', player: 0 }).ok).toBe(false);
  });
});

describe('botlar', () => {
  it('yalnızca botlardan oluşan oyun takılmadan ilerler ve aynı seed ile tekrarlanabilir', () => {
    const run = () => {
      let s = createGame({
        players: Array.from({ length: 4 }, (_, i) => ({ name: `B${i}`, color: '#000', kind: 'bot' as const })),
        width: 40,
        height: 30,
        seed: 42,
      });
      const bot = getBot('medium');
      let actions = 0;
      while (s.phase.kind !== 'gameover' && s.round <= 15) {
        const ph = s.phase;
        const p = ph.kind === 'vote' ? s.players.find((pl) => pl.alive && !(pl.id in ph.votes))!.id : s.currentPlayer;
        const r = dispatch(s, bot.chooseAction(s, p));
        s = r.state;
        for (const e of r.events) {
          if (e.type === 'offer_made') {
            s = dispatch(s, { type: 'RESPOND_OFFER', player: e.offer.to, offerId: e.offer.id, accept: bot.evaluateOffer(s, e.offer.to, e.offer) }).state;
          }
        }
        if (++actions > 5000) throw new Error('Botlar takıldı');
      }
      return s;
    };
    const a = run();
    expect(a.phase.kind === 'gameover' || a.round > 15).toBe(true);
    expect(a.players.every((p) => p.capital !== null || !p.alive)).toBe(true);
    expect(run().owner).toEqual(a.owner);
  });
});

describe('kaydet / yükle', () => {
  it('oyun durumu JSON olarak dışa ve içe aktarılabilir', async () => {
    const { exportState, importState } = await import('../src/ui/storage');
    const s = neighbours3();
    const back = importState(exportState(s));
    expect(back).toEqual(s);
    expect(() => importState('{"foo":1}')).toThrow();
    expect(() => importState('bozuk')).toThrow();
  });
});
