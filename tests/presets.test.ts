import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PRESETS,
  DEFAULT_CONFIG,
  DEFAULT_PRESET_ID,
  MAX_PLAYERS,
  MIN_PLAYERS,
  configProblems,
  defaultMapSize,
  findPreset,
  fitsStartAreas,
  generateMap,
  presetConfig,
  presetMapSize,
  sameConfig,
} from '../src/engine';

describe('kural önayarları', () => {
  it('varsayılan önayar Dengeli ve değerleri varsayılanlarla aynı', () => {
    const p = findPreset(DEFAULT_PRESET_ID)!;
    expect(p.name).toBe('Dengeli');
    expect(sameConfig(presetConfig(p), DEFAULT_CONFIG)).toBe(true);
    expect(presetMapSize(p, 5)).toEqual(defaultMapSize(5));
  });

  it('Klasik önayarda savaş masrafı ve bakım kapalı', () => {
    const c = presetConfig(findPreset('classic')!);
    expect(c.battleCostsEnabled).toBe(false);
    expect(c.upkeepEnabled).toBe(false);
  });

  it('tüm önayarlar geçerli ve kimliği benzersiz', () => {
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(BUILTIN_PRESETS.length);
    for (const p of BUILTIN_PRESETS) expect(configProblems(presetConfig(p))).toEqual([]);
  });

  it('Hızlı önayarın küçük haritası her oyuncu sayısında başlangıç alanlarını sığdırır', () => {
    const p = findPreset('quick')!;
    const cfg = presetConfig(p);
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const size = presetMapSize(p, n);
      expect(size.width).toBeLessThan(defaultMapSize(n).width);
      const map = generateMap({ ...size, seed: 77 + n, players: n, minesPerTypePerPlayer: cfg.minesPerTypePerPlayer, startTerritoryCount: cfg.startTerritoryCount });
      expect(fitsStartAreas(map, n, cfg.startTerritoryCount, cfg.minCapitalDistance)).toBe(true);
    }
  });
});
