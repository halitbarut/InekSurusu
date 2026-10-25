import { DEFAULT_CONFIG, defaultMapSize, type GameConfig } from './config';

/** Hazır kural takımı. Ayar ekranında seçilir; değerler varsayılanların üzerine yazılır. */
export interface GamePreset {
  id: string;
  name: string;
  description: string;
  /** Varsayılanlardan farklı ayarlar */
  config: Partial<GameConfig>;
  /** Harita boyutu çarpanı (oyuncu sayısına göre önerilen boyuta uygulanır) */
  mapScale: number;
}

export const BUILTIN_PRESETS: readonly GamePreset[] = [
  {
    id: 'classic',
    name: 'Klasik',
    description: 'Kâğıt oyuna en yakın kurallar: savaşlar bedelsiz, gemi ve uçak bakımı yok.',
    config: { battleCostsEnabled: false, upkeepEnabled: false },
    mapScale: 1,
  },
  {
    id: 'balanced',
    name: 'Dengeli',
    description: 'Denge simülasyonlarıyla ayarlanmış varsayılanlar: savaş masrafı ve gemi/uçak bakımı var.',
    config: {},
    mapScale: 1,
  },
  {
    id: 'quick',
    name: 'Hızlı',
    description: 'Daha küçük harita ve 300 akçeyle başlangıç: komşular erken karşılaşır, oyun kısa sürer.',
    config: { startAkce: 300 },
    mapScale: 0.8,
  },
  {
    id: 'calm',
    name: 'Sakin açılış',
    description: 'Dengeli kurallar + ilk 5 tur kimse kimseye saldıramaz. Yeni oyuncular için.',
    config: { openingPeace: true, openingPeaceRounds: 5 },
    mapScale: 1,
  },
];

export const DEFAULT_PRESET_ID = 'balanced';

export function findPreset(id: string): GamePreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}

/** Önayarın tam kural takımı */
export function presetConfig(p: Pick<GamePreset, 'config'>): GameConfig {
  return { ...DEFAULT_CONFIG, ...p.config };
}

/** Önayarın oyuncu sayısına göre harita boyutu */
export function presetMapSize(p: Pick<GamePreset, 'mapScale'>, players: number): { width: number; height: number } {
  const d = defaultMapSize(players);
  return { width: Math.round(d.width * p.mapScale), height: Math.round(d.height * p.mapScale) };
}

export function sameConfig(a: GameConfig, b: GameConfig): boolean {
  return (Object.keys(DEFAULT_CONFIG) as (keyof GameConfig)[]).every((k) => a[k] === b[k]);
}
