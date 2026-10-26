import { describe, expect, it } from 'vitest';
import { getBot } from '../src/bot';
import { DEFAULT_CONFIG, buildMap, checkMap, createGameFromMap, dispatch, draftFromRows, type GameState } from '../src/engine';
import { BUILTIN_MAPS } from '../src/maps/builtin';

const c = DEFAULT_CONFIG;
const check = (rows: string[], name: string) => {
  const map = buildMap(draftFromRows(rows), name);
  return { map, chk: checkMap(map, { startTerritoryCount: c.startTerritoryCount, minCapitalDistance: c.minCapitalDistance, maxMineDistance: c.maxMineDistance }) };
};

/** Orta botlarla oynatır; tur sınırına ya da oyun sonuna kadar */
function play(rows: string[], name: string, players: number, seed: number, maxRounds: number) {
  const { map } = check(rows, name);
  let s: GameState = createGameFromMap(
    map,
    Array.from({ length: players }, (_, i) => ({ name: `B${i}`, color: '#000', kind: 'bot' as const })),
    DEFAULT_CONFIG,
    seed,
  );
  const bot = getBot('medium');
  let actions = 0;
  const seen = { battles: 0, expeditions: 0, straitControl: 0 };
  while (s.phase.kind !== 'gameover' && s.round <= maxRounds) {
    const ph = s.phase;
    const p = ph.kind === 'vote' ? s.players.find((pl) => pl.alive && !(pl.id in ph.votes))!.id : ph.kind === 'conquest' ? ph.taker : s.currentPlayer;
    const r = dispatch(s, bot.chooseAction(s, p));
    s = r.state;
    for (const e of r.events) {
      if (e.type === 'battle') seen.battles++;
      if (e.type === 'expedition') seen.expeditions++;
      if (e.type === 'strait_control' && e.controller !== null) seen.straitControl++;
      if (e.type === 'offer_made') s = dispatch(s, { type: 'RESPOND_OFFER', player: e.offer.to, offerId: e.offer.id, accept: bot.evaluateOffer(s, e.offer.to, e.offer) }).state;
    }
    if (++actions > 40000) throw new Error(`${name}: botlar takıldı`);
  }
  return { s, seen };
}

describe('hazır haritalar', () => {
  it('dört harita var, kimlikleri ve adları benzersiz', () => {
    expect(BUILTIN_MAPS.map((m) => m.name)).toEqual(['Anadolu ve Balkanlar', 'Takımadalar', 'Büyük kıta', 'İkiz kıtalar']);
    expect(new Set(BUILTIN_MAPS.map((m) => m.id)).size).toBe(4);
  });

  for (const m of BUILTIN_MAPS) {
    it(`${m.name}: editör doğrulamasından geçer, önerilen en kalabalık oyuncu sayısına yeter`, () => {
      const { map, chk } = check(m.rows, m.name);
      expect(chk.errors).toEqual([]);
      expect(chk.maxPlayers).toBeGreaterThanOrEqual(m.players[1]);
      expect(chk.straits).toBeGreaterThanOrEqual(1);
      expect(chk.lakes).toBeGreaterThanOrEqual(1);
      expect(map.terrain).toContain('sea');
      for (const n of Object.values(chk.mines)) expect(n).toBeGreaterThanOrEqual(m.players[1]);
      expect(m.description.length).toBeGreaterThan(20);
    });
  }

  it('Anadolu: İstanbul ve Çanakkale boğazları Marmara ile Karadeniz ve Ege arasında', () => {
    const { map } = check(BUILTIN_MAPS[0].rows, 'a');
    const at = (x: number, y: number) => map.straitOf[y * map.width + x];
    expect(at(25, 13)).toBeGreaterThanOrEqual(0); // İstanbul
    expect(at(16, 17)).toBeGreaterThanOrEqual(0); // Çanakkale
    expect(map.straits.length).toBe(3);
  });

  it('İkiz kıtalar: kuzey ve güney okyanusu yalnızca kanaldaki iki boğazla bağlı', () => {
    const { map } = check(BUILTIN_MAPS[3].rows, 'i');
    const bankSides = map.straits.filter((st) => st.tiles.every((t) => t % map.width === 28));
    expect(bankSides).toHaveLength(2);
    // Yakaların yarısı batı, yarısı doğu kıtasında
    for (const st of bankSides) expect(new Set(st.banks.map((b) => (b % map.width < 28 ? 'batı' : 'doğu')))).toEqual(new Set(['batı', 'doğu']));
  });

  for (const m of BUILTIN_MAPS) {
    it(`${m.name}: ${m.players[1]} Orta botla oyun takılmadan ilerler`, () => {
      const { s, seen } = play(m.rows, m.name, m.players[1], 11, 30);
      expect(s.players.every((p) => p.capital !== null || !p.alive)).toBe(true);
      expect(s.phase.kind === 'gameover' || s.round > 30).toBe(true);
      expect(seen.battles).toBeGreaterThan(0);
      // Takımadalarda gemi/uçak seferi şart
      if (m.id === 'hazir-takimadalar') expect(seen.expeditions).toBeGreaterThan(0);
    }, 120_000);
  }
});
