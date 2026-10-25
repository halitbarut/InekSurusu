/** Tüm ayarlanabilir kural değerleri. Oyun durumu içinde saklanır. */
export interface GameConfig {
  /** Başlangıç akçesi */
  startAkce: number;
  /** Başkent dışında seçilecek başlangıç toprağı sayısı */
  startTerritoryCount: number;
  /** Başkentler arası en az mesafe (Chebyshev) */
  minCapitalDistance: number;
  /** Sahipsiz toprak ele geçirme masrafı */
  claimCost: number;
  /** Gemi/uçakla sahipsiz toprak alma masrafı */
  expeditionClaimCost: number;
  /** 1 altın kaç akçe eder */
  goldToAkce: number;
  /** Topacın yüz sayısı */
  spinFaces: number;
  /** Topaç sonucu çarpanı (akçe) */
  spinMultiplier: number;
  shipyardCost: number;
  factoryCost: number;
  baseCost: number;
  shipAkceCost: number;
  shipIronCost: number;
  planeAkceCost: number;
  planeSteelCost: number;
  shipOilCost: number;
  planeOilCost: number;
  /** Başkent savaşında gereken art arda galibiyet */
  capitalStreak: number;
  /** Askeri üs savaşında gereken art arda galibiyet */
  baseStreak: number;
  /** Askeri üssün uçakları engellediği yarıçap */
  baseBlockRadius: number;
  baseBlockMetric: 'chebyshev' | 'manhattan';
  /** Bir birimin bir turda en fazla sefer sayısı (0 = sınırsız) */
  maxSortiesPerUnitPerTurn: number;
  /** Oyuncu başına her maden türünden kaç adet */
  minesPerTypePerPlayer: number;
  /** Maden yerleşimi: 'spread' kara alanına dengeli yayar, 'random' eski tamamen rastgele düzen */
  mineLayout: 'spread' | 'random';
  /** 'spread' düzeninde: büyük kara parçalarındaki her kareden her türün en yakın madenine en fazla uzaklık (Chebyshev) */
  maxMineDistance: number;
  /** Barış anlaşması en fazla kaç tur sürebilir */
  maxPeaceRounds: number;

  /** Savaş masrafları uygulansın mı (kapalıysa savaşlar bedelsiz) */
  battleCostsEnabled: boolean;
  /** Normal savaş (kara ya da gemi/uçakla dolu toprağa) masrafı */
  landBattleAkce: number;
  baseBattleAkce: number;
  baseBattleIron: number;
  capitalBattleAkce: number;
  capitalBattleIron: number;
  capitalBattleSteel: number;

  /** Tur başı bakım uygulansın mı */
  upkeepEnabled: boolean;
  shipUpkeep: number;
  planeUpkeep: number;
  baseUpkeep: number;

  /** Zayıflık şartı: başkente saldırmak için savunanın toprağı saldıranın yarısından az olmalı */
  weaknessRule: boolean;
  /** Açılış barışı: ilk N tur oyuncu topraklarına saldırı yok */
  openingPeace: boolean;
  openingPeaceRounds: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  startAkce: 0,
  startTerritoryCount: 9,
  minCapitalDistance: 5,
  claimCost: 100,
  expeditionClaimCost: 100,
  goldToAkce: 200,
  spinFaces: 8,
  spinMultiplier: 100,
  shipyardCost: 200,
  factoryCost: 300,
  baseCost: 400,
  shipAkceCost: 100,
  shipIronCost: 2,
  planeAkceCost: 200,
  planeSteelCost: 2,
  shipOilCost: 1,
  planeOilCost: 2,
  capitalStreak: 3,
  baseStreak: 2,
  baseBlockRadius: 3,
  baseBlockMetric: 'chebyshev',
  maxSortiesPerUnitPerTurn: 0,
  minesPerTypePerPlayer: 1,
  mineLayout: 'spread',
  maxMineDistance: 10,
  maxPeaceRounds: 30,
  battleCostsEnabled: true,
  landBattleAkce: 100,
  baseBattleAkce: 200,
  baseBattleIron: 1,
  capitalBattleAkce: 600,
  capitalBattleIron: 2,
  capitalBattleSteel: 0,
  upkeepEnabled: true,
  shipUpkeep: 50,
  planeUpkeep: 50,
  baseUpkeep: 0,
  weaknessRule: false,
  openingPeace: false,
  openingPeaceRounds: 5,
};

/** Akçe cinsinden ayarlar (ayar ekranında 50'şer adımla değişir) */
export const AKCE_FIELDS: readonly (keyof GameConfig)[] = [
  'startAkce',
  'claimCost',
  'expeditionClaimCost',
  'goldToAkce',
  'spinMultiplier',
  'shipyardCost',
  'factoryCost',
  'baseCost',
  'shipAkceCost',
  'planeAkceCost',
  'landBattleAkce',
  'baseBattleAkce',
  'capitalBattleAkce',
  'shipUpkeep',
  'planeUpkeep',
  'baseUpkeep',
];

/** Ayar ekranında akçe alanlarının artış adımı */
export const AKCE_STEP = 50;

/** Ayarlardaki sorunları döner (boşsa geçerli). */
export function configProblems(cfg: GameConfig): string[] {
  const problems: string[] = [];
  for (const k of AKCE_FIELDS) {
    const v = cfg[k] as number;
    if (!Number.isInteger(v) || v < 0) problems.push(`${k} 0 ya da pozitif tam sayı olmalı (şu an ${v})`);
  }
  if (!Number.isInteger(cfg.openingPeaceRounds) || cfg.openingPeaceRounds < 0) problems.push('openingPeaceRounds 0 veya pozitif tam sayı olmalı');
  return problems;
}

/** Her oyuncu turunda yapılabilecek savaş sayısı (sabit kural) */
export const BATTLES_PER_TURN = 1;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

/** Oyuncu sayısına göre önerilen harita boyutu (3. denge turunda %12 küçültüldü). */
export function defaultMapSize(players: number): { width: number; height: number } {
  if (players <= 4) return { width: 35, height: 26 };
  if (players <= 6) return { width: 44, height: 32 };
  return { width: 53, height: 37 };
}
