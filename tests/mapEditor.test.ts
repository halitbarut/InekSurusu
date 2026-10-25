import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  buildMap,
  checkMap,
  createGameFromMap,
  draftFromMap,
  draftFromRows,
  draftToRows,
  emptyDraft,
  fillRegion,
  generateMap,
  validateAction,
} from '../src/engine';

const opts = { startTerritoryCount: 9, minCapitalDistance: 5, maxMineDistance: 10 };

describe('elle çizilen harita', () => {
  it('metin biçimine çevrilip geri okunabilir', () => {
    const map = generateMap({ width: 30, height: 22, seed: 5, players: 3, minesPerTypePerPlayer: 1, startTerritoryCount: 9 });
    const rows = draftToRows(draftFromMap(map));
    const back = buildMap(draftFromRows(rows));
    expect(back.terrain).toEqual(map.terrain);
    expect(back.mines).toEqual(map.mines);
    expect(back.straits.length).toBe(map.straits.length);
  });

  it('denize bağlı olmayan küçük su göl olur, boğaz kendiliğinden bulunur', () => {
    const rows = [
      '................',
      '.######.#######.',
      '.######.#######.',
      '.##~~##.#######.',
      '.##~~##.#######.',
      '.######.#######.',
      '.######.#######.',
      '.##############.',
      '.######.#######.',
      '.######.#######.',
      '.######.#######.',
      '.######.#######.',
      '................',
    ];
    // ~ işaretleri de su sayılır; göl olup olmadığına harita karar verir
    const map = buildMap(draftFromRows(rows));
    const at = (x: number, y: number) => y * 16 + x;
    expect(map.terrain[at(3, 3)]).toBe('lake');
    expect(map.terrain[at(0, 0)]).toBe('sea');
    expect(map.terrain[at(7, 3)]).toBe('sea');
  });

  it('oyuncu sayısına uygunluğu hesaplar, boğaz ve göl yokluğu yalnızca uyarıdır', () => {
    const d = emptyDraft(24, 16);
    for (let y = 1; y < 15; y++) for (let x = 1; x < 23; x++) d.land[y * 24 + x] = true;
    const c = checkMap(buildMap(d), opts);
    expect(c.errors).toEqual([]);
    expect(c.maxPlayers).toBeGreaterThanOrEqual(3);
    expect(c.warnings.some((w) => w.includes('Boğaz'))).toBe(true);
    expect(c.warnings.some((w) => w.includes('Göl'))).toBe(true);
    const tiny = emptyDraft(14, 14);
    for (let i = 0; i < 20; i++) tiny.land[15 + i] = true;
    expect(checkMap(buildMap(tiny), opts).errors.length).toBeGreaterThan(0);
  });

  it('kova aynı zemindeki bağlı bölgeyi bulur', () => {
    const d = draftFromRows(['............', '.####..####.', '.####..####.', '............', ...Array(8).fill('............')]);
    const region = fillRegion(d, 1 * 12 + 1);
    expect(region.length).toBe(8);
  });

  it('özel haritayla oyun kurulur; harita kayda gömülü olduğu için harita silinse de oyun açılır', () => {
    const map = buildMap(draftFromMap(generateMap({ width: 35, height: 26, seed: 9, players: 3, minesPerTypePerPlayer: 1, startTerritoryCount: 9 })), 'Benim adam');
    const s = createGameFromMap(map, ['A', 'B', 'C'].map((n) => ({ name: n, color: '#000', kind: 'human' as const })), DEFAULT_CONFIG, 777);
    const loaded = JSON.parse(JSON.stringify(s));
    expect(loaded.map.name).toBe('Benim adam');
    expect(loaded.map.terrain).toEqual(map.terrain);
    const cap = loaded.map.terrain.findIndex((t: string, i: number) => validateAction(loaded, { type: 'PLACE_CAPITAL', player: 0, tile: i }).ok && t === 'land');
    expect(cap).toBeGreaterThanOrEqual(0);
    // Aynı harita farklı oyun tohumu: topaç sonuçları farklı
    const s2 = createGameFromMap(map, ['A', 'B', 'C'].map((n) => ({ name: n, color: '#000', kind: 'human' as const })), DEFAULT_CONFIG, 778);
    expect(s2.rngState).not.toBe(s.rngState);
  });
});
