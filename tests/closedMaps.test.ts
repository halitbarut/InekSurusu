import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PRESETS,
  DEFAULT_CONFIG,
  basinCount,
  closedMapProblems,
  createGame,
  defaultMapSize,
  fitsStartAreas,
  generateMap,
  mapFromAscii,
  mapProblems,
  neighbors4,
  presetConfig,
  shipRoutes,
  type GameMap,
  type GameState,
} from '../src/engine';
import { own, testState } from './helpers';

const opts = (players: number, seed: number, scale = 1) => {
  const s = defaultMapSize(players);
  return {
    width: Math.round(s.width * scale),
    height: Math.round(s.height * scale),
    seed,
    players,
    minesPerTypePerPlayer: 1,
    startTerritoryCount: 9,
    minCapitalDistance: 5,
    mineLayout: 'spread' as const,
    maxMineDistance: 10,
  };
};

/** Dolu kareleri bağlı parçalara ayırır */
function components(map: GameMap, pred: (i: number) => boolean): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let i = 0; i < map.terrain.length; i++) {
    if (seen.has(i) || !pred(i)) continue;
    const comp = [i];
    seen.add(i);
    for (let k = 0; k < comp.length; k++) {
      for (const nb of neighbors4(map, comp[k])) {
        if (!seen.has(nb) && pred(nb)) {
          seen.add(nb);
          comp.push(nb);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

const CASES: [number, number][] = [
  [3, 1],
  [4, 1],
  [5, 1],
  [6, 1],
  [7, 1],
  [8, 1],
  [4, 0.8],
  [8, 0.8],
];

describe('kapalı denizler üreticisi', () => {
  describe.each(CASES)('%i oyuncu, ölçek %f', (players, scale) => {
    const maps = [1, 2, 3, 4].map((seed) => generateMap(opts(players, seed + players * 100, scale)));

    it('hiçbir şart ihlali yok', () => {
      maps.forEach((m, i) => expect(mapProblems(m, opts(players, i + 1 + players * 100, scale))).toEqual([]));
    });

    it('tüm kara 4 yönlü olarak tek parça; yalnız kara karesi yok', () => {
      for (const m of maps) {
        expect(components(m, (i) => m.terrain[i] === 'land')).toHaveLength(1);
        for (let i = 0; i < m.terrain.length; i++) {
          if (m.terrain[i] === 'land') expect(neighbors4(m, i).some((n) => m.terrain[n] === 'land')).toBe(true);
        }
      }
    });

    it('harita kenarı kara', () => {
      for (const m of maps) {
        for (let i = 0; i < m.terrain.length; i++) {
          const x = i % m.width;
          const y = Math.floor(i / m.width);
          if (x === 0 || y === 0 || x === m.width - 1 || y === m.height - 1) expect(m.terrain[i]).toBe('land');
        }
      }
    });

    it('boğaz kareleri çıkarıldığında havzalar birbirinden kopuyor', () => {
      for (const m of maps) {
        const removed = new Set(m.straits.flatMap((s) => s.tiles));
        const basins = components(m, (i) => m.terrain[i] === 'sea' && !removed.has(i));
        const label = new Map<number, number>();
        basins.forEach((c, l) => c.forEach((t) => label.set(t, l)));
        expect(basins.length).toBeGreaterThanOrEqual(basinCount(m.width, m.height, players));
        expect(m.straits.length).toBe(basins.length - 1);
        for (const st of m.straits) {
          const ends = new Set(st.tiles.flatMap((t) => neighbors4(m, t)).filter((t) => label.has(t)).map((t) => label.get(t)));
          expect(ends.size).toBe(2);
        }
        // Boğazlarla birlikte bütün denizler bağlı
        expect(components(m, (i) => m.terrain[i] === 'sea')).toHaveLength(1);
      }
    });

    it('göl var; dengeli maden ve madensiz başlangıç alanı garantileri korunuyor', () => {
      for (const m of maps) {
        expect(m.terrain).toContain('lake');
        expect(fitsStartAreas(m, players, 9, 5)).toBe(true);
        expect(m.mines.filter((x) => x === 'gold')).toHaveLength(players);
      }
    });
  });

  it('aynı seed ile aynı harita', () => {
    expect(generateMap(opts(5, 321))).toEqual(generateMap(opts(5, 321)));
    expect(generateMap(opts(5, 321)).terrain).not.toEqual(generateMap(opts(5, 322)).terrain);
  });

  it('çok kareli boğazlar da oluşur', () => {
    let long = 0;
    for (let seed = 1; seed <= 6; seed++) long += generateMap(opts(6, seed)).straits.filter((s) => s.tiles.length >= 2).length;
    expect(long).toBeGreaterThan(0);
  });

  it('küçük ve büyük özel boyutlarda da şartları sağlar', () => {
    for (const [width, height, players] of [
      [20, 16, 3],
      [30, 22, 3],
      [70, 50, 8],
    ]) {
      const m = generateMap({ width, height, seed: 42, players, minesPerTypePerPlayer: 1, startTerritoryCount: 9 });
      expect(closedMapProblems(m, players).filter((p) => !p.startsWith('Havza sayısı') && !p.startsWith('Kıyı'))).toEqual([]);
    }
  }, 60_000);
});

describe('kıta tipi ayarı', () => {
  it('varsayılan ve bütün önayarlar kapalı denizler', () => {
    expect(DEFAULT_CONFIG.continentType).toBe('closed');
    for (const p of BUILTIN_PRESETS) expect(presetConfig(p).continentType).toBe('closed');
  });

  it('takımada eski üreticiyi kullanır: kenar deniz, çoğu kez birden çok kara parçası', () => {
    const m = generateMap({ ...opts(5, 9), continentType: 'archipelago' });
    for (let x = 0; x < m.width; x++) expect(m.terrain[x]).toBe('sea');
  });

  it('seçim oyun durumuna (kayıt ve replay) girer ve haritayı belirler', () => {
    const players = ['A', 'B', 'C'].map((name) => ({ name, color: '#000', kind: 'bot' as const }));
    const a: GameState = createGame({ players, width: 35, height: 26, seed: 5, config: { continentType: 'archipelago' } });
    const b: GameState = createGame({ players, width: 35, height: 26, seed: 5 });
    expect(a.config.continentType).toBe('archipelago');
    expect(b.config.continentType).toBe('closed');
    expect(JSON.parse(JSON.stringify(a)).config.continentType).toBe('archipelago');
    expect(a.map.terrain).not.toEqual(b.map.terrain);
  });
});

describe('tersane kuralı', () => {
  it('iki havzaya kıyı olan tersaneden gemi ikisine de çıkar', () => {
    // Ortadaki kara şeridindeki (4,2) karesi batı ve doğu havzasına kıyı; havzalar arasında geçit yok
    const rows = [
      '#########',
      '#...#...#',
      '#...#...#',
      '#...#...#',
      '#########',
    ];
    const s = testState(rows);
    own(s, 0, [[4, 2]]);
    s.structure[2 * 9 + 4] = 'shipyard';
    const routes = shipRoutes(s, 0, 2 * 9 + 4);
    expect(routes.targets.has(0 * 9 + 2)).toBe(true); // batı havzasının kuzey kıyısı
    expect(routes.targets.has(0 * 9 + 6)).toBe(true); // doğu havzasının kuzey kıyısı
  });

  it('tek havzaya kıyı olan tersane öbür havzaya ulaşamaz', () => {
    const map = mapFromAscii(['#########', '#...#...#', '#...#...#', '#...#...#', '#########']);
    expect(map.straits).toHaveLength(0);
    const s = testState(['#########', '#...#...#', '#...#...#', '#...#...#', '#########']);
    own(s, 0, [[0, 2]]);
    s.structure[2 * 9] = 'shipyard';
    const routes = shipRoutes(s, 0, 2 * 9);
    expect(routes.targets.has(2)).toBe(true);
    expect(routes.targets.has(6)).toBe(false);
  });
});
