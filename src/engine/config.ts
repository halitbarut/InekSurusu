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
  /** Barış anlaşması en fazla kaç tur sürebilir */
  maxPeaceRounds: number;
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
  maxPeaceRounds: 30,
};

/** Her oyuncu turunda yapılabilecek savaş sayısı (sabit kural) */
export const BATTLES_PER_TURN = 1;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

/** Oyuncu sayısına göre önerilen harita boyutu. */
export function defaultMapSize(players: number): { width: number; height: number } {
  if (players <= 4) return { width: 40, height: 30 };
  if (players <= 6) return { width: 50, height: 36 };
  return { width: 60, height: 42 };
}
