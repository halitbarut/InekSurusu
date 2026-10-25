import type { GameConfig } from './config';

export type Terrain = 'land' | 'sea' | 'lake';
export type MineType = 'gold' | 'oil' | 'iron' | 'steel';
export const MINE_TYPES: readonly MineType[] = ['gold', 'oil', 'iron', 'steel'];
export type ResourceKey = 'akce' | MineType;
export const RESOURCE_KEYS: readonly ResourceKey[] = ['akce', 'gold', 'oil', 'iron', 'steel'];
export type Resources = Record<ResourceKey, number>;

export type StructureType = 'capital' | 'shipyard' | 'factory' | 'base';
export type BuildableStructure = Exclude<StructureType, 'capital'>;
export type UnitKind = 'ship' | 'plane';
export type BotLevel = 'easy' | 'medium' | 'hard';
export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'medium', 'hard'];

export interface Strait {
  id: number;
  /** Boğazı oluşturan deniz kareleri (1 kare genişliğinde) */
  tiles: number[];
  /** İki yakadaki kara kareleri */
  banks: number[];
  /** 'h': su doğu–batı akar (yakalar kuzey/güney), 'v': su kuzey–güney akar */
  orientation: 'h' | 'v';
}

export interface GameMap {
  width: number;
  height: number;
  seed: number;
  /** Elle çizilmiş haritanın adı (rastgele haritada yok) */
  name?: string;
  terrain: Terrain[];
  mines: (MineType | null)[];
  straits: Strait[];
  /** Her kare için boğaz kimliği; boğaz değilse -1 */
  straitOf: number[];
}

export interface Player {
  id: number;
  name: string;
  color: string;
  kind: 'human' | 'bot';
  botLevel: BotLevel;
  alive: boolean;
  capital: number | null;
  resources: Resources;
  /** Bu oyuncu turunda yapılan savaş sayısı (turda tek savaş) */
  battlesThisTurn: number;
  eliminatedBy: number | null;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  owner: number;
  /** Konuşlandığı tersane / fabrika karesi */
  tile: number;
  sortiesThisTurn: number;
}

export interface Relation {
  allied: boolean;
  /** Barış bu tur (dahil) sonuna kadar sürer; null = barış yok */
  peaceUntilRound: number | null;
  /** İttifakın bozulduğu turCounter değeri (o tur içinde saldırı yok) */
  allianceBrokenAtTurn: number | null;
}

export interface StraitPolicy {
  allow: boolean;
  toll: number;
}

export interface StraitState {
  controller: number | null;
  /** Oyuncu kimliğine göre ayarlar; olmayan oyuncu için varsayılan: açık, vergi 0 */
  policies: Record<number, StraitPolicy>;
}

/** 'from' = teklifi yapan, 'to' = teklifi alan */
export type OfferSide = 'from' | 'to';

export type OfferItem =
  | { kind: 'alliance' }
  | { kind: 'peace'; rounds: number }
  | { kind: 'resource'; giver: OfferSide; resource: ResourceKey; amount: number }
  | { kind: 'tile'; giver: OfferSide; tile: number }
  /** giver, kontrol ettiği boğazdan diğer tarafa geçiş izni verir (toll = uygulanacak vergi, 0 = muafiyet) */
  | { kind: 'strait'; giver: OfferSide; straitId: number; toll: number };

export interface Offer {
  id: number;
  from: number;
  to: number;
  items: OfferItem[];
  createdTurn: number;
}

export type Phase =
  | { kind: 'setup_capital' }
  | { kind: 'setup_territory'; picksLeft: number }
  | { kind: 'spin' }
  | { kind: 'actions' }
  | {
      kind: 'conquest';
      /** Toprakları seçen oyuncu (kazanan taraf) */
      taker: number;
      /** Toprak kaybeden oyuncu */
      victim: number;
      remaining: number;
      /** Gemi/uçak seferinde saldıranın hedef karesi; aksi halde null (sınır kuralı) */
      anchor: number | null;
      /** Savunanın karşı saldırısı mı? (seçimi savunan yapar, sıra saldıranda kalır) */
      counter: boolean;
    }
  | { kind: 'vote'; proposer: number; votes: Record<number, boolean> }
  /** Bakım ödenemiyor: oyuncu birim/üs dağıtarak borcu akçesine indirir */
  | { kind: 'upkeep'; due: number }
  | { kind: 'gameover' };

export type BattleKind = 'land' | 'capital' | 'base';
export type AttackVia = 'land' | 'ship' | 'plane';

export interface SpinRound {
  a: number;
  d: number;
}

export type GameEvent =
  | { type: 'game_started' }
  | { type: 'capital_placed'; player: number; tile: number }
  | { type: 'setup_done'; player: number; tiles: number }
  | { type: 'turn_start'; player: number; round: number }
  | { type: 'income'; player: number; gained: Partial<Resources> }
  | { type: 'spin'; player: number; value: number; akce: number }
  | { type: 'claim'; player: number; tile: number; via: AttackVia; cost: number }
  | { type: 'exchange'; player: number; gold: number; akce: number }
  | { type: 'build'; player: number; tile: number; structure: BuildableStructure }
  | { type: 'produce'; player: number; tile: number; unit: UnitKind; unitId: number }
  | {
      type: 'expedition';
      player: number;
      unitId: number;
      unit: UnitKind;
      from: number;
      target: number;
      path: number[];
      tolls: { straitId: number; controller: number; amount: number }[];
    }
  | {
      type: 'battle';
      attacker: number;
      defender: number;
      kind: BattleKind;
      via: AttackVia;
      target: number;
      rounds: SpinRound[];
      success: boolean;
      /** Saldıranın alacağı toprak (başkent/üs savaşında başarıda 1) */
      gain: number;
      /** Savunanın karşı saldırıyla alacağı toprak (yalnızca kara savaşı) */
      loss: number;
      streakNeeded: number;
      /** Savaş başlatılırken ödenen masraf */
      cost: BattleCost;
    }
  | { type: 'conquer'; player: number; from: number; tile: number }
  | { type: 'base_captured'; player: number; from: number; tile: number }
  | { type: 'eliminated'; player: number; by: number }
  | { type: 'strait_control'; straitId: number; controller: number | null }
  | { type: 'strait_policy'; player: number; straitId: number; target: number; allow: boolean; toll: number }
  | { type: 'offer_made'; offer: Offer }
  | { type: 'offer_response'; offerId: number; from: number; to: number; accepted: boolean; failedReason?: string }
  | { type: 'offer_cancelled'; offerId: number; from: number; to: number }
  | { type: 'alliance_formed'; a: number; b: number }
  | { type: 'peace_made'; a: number; b: number; untilRound: number }
  | { type: 'alliance_broken'; player: number; target: number }
  | { type: 'victory_proposed'; player: number }
  | { type: 'vote_cast'; player: number; accept: boolean }
  | { type: 'vote_result'; accepted: boolean }
  | { type: 'game_over'; winners: number[] }
  | { type: 'upkeep'; player: number; amount: number; ships: number; planes: number; bases: number }
  | { type: 'disband'; player: number; what: 'ship' | 'plane' | 'base'; tile: number; voluntary: boolean };

export interface BattleCost {
  akce: number;
  iron: number;
  steel: number;
}

export interface LogEntry {
  turn: number;
  round: number;
  event: GameEvent;
}

export interface GameState {
  version: 1;
  config: GameConfig;
  map: GameMap;
  owner: (number | null)[];
  structure: (StructureType | null)[];
  players: Player[];
  units: Unit[];
  nextUnitId: number;
  /** Anahtar: "a-b" (a < b) */
  relations: Record<string, Relation>;
  straits: StraitState[];
  offers: Offer[];
  nextOfferId: number;
  currentPlayer: number;
  /** Her oyuncu turunda bir artar */
  turnCounter: number;
  /** Tüm oyuncuların bir kez oynadığı tam tur */
  round: number;
  phase: Phase;
  rngState: number;
  log: LogEntry[];
  winners: number[] | null;
}

export type Action =
  | { type: 'PLACE_CAPITAL'; player: number; tile: number }
  | { type: 'PICK_START_TILE'; player: number; tile: number }
  | { type: 'SKIP_START_PICKS'; player: number }
  | { type: 'SPIN'; player: number }
  | { type: 'CLAIM_TILE'; player: number; tile: number }
  | { type: 'EXCHANGE_GOLD'; player: number; amount: number }
  | { type: 'BUILD'; player: number; tile: number; structure: BuildableStructure }
  | { type: 'PRODUCE'; player: number; tile: number; unit: UnitKind }
  | { type: 'ATTACK'; player: number; target: number }
  | { type: 'SHIP_EXPEDITION'; player: number; unitId: number; target: number }
  | { type: 'PLANE_EXPEDITION'; player: number; unitId: number; target: number }
  | { type: 'CONQUER_TILE'; player: number; tile: number }
  | { type: 'END_CONQUEST'; player: number }
  | { type: 'SET_STRAIT_POLICY'; player: number; straitId: number; target: number; allow: boolean; toll: number }
  | { type: 'PROPOSE_OFFER'; player: number; to: number; items: OfferItem[] }
  | { type: 'RESPOND_OFFER'; player: number; offerId: number; accept: boolean }
  | { type: 'CANCEL_OFFER'; player: number; offerId: number }
  | { type: 'BREAK_ALLIANCE'; player: number; target: number }
  | { type: 'PROPOSE_VICTORY'; player: number }
  | { type: 'CAST_VOTE'; player: number; accept: boolean }
  | { type: 'DISBAND_UNIT'; player: number; unitId: number }
  | { type: 'DEMOLISH_BASE'; player: number; tile: number }
  | { type: 'END_TURN'; player: number };

export type ActionType = Action['type'];

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
