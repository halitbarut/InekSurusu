import type { GameEvent, GameState } from './types';

/** Oyun sonu özeti için tutulan istatistikler (oyun durumunun içinde, kayda girer). */

export type SpendKey = 'claim' | 'build' | 'produce' | 'battle' | 'upkeep' | 'toll';
export const SPEND_KEYS: readonly SpendKey[] = ['claim', 'build', 'produce', 'battle', 'upkeep', 'toll'];

/** Bir oyuncunun bir tur sonundaki durumu */
export interface PlayerSnapshot {
  tiles: number;
  akce: number;
  gold: number;
  oil: number;
  iron: number;
  steel: number;
  ships: number;
  planes: number;
}

export interface RoundSnapshot {
  /** Tamamlanan tur (0 = kurulum sonu) */
  round: number;
  players: PlayerSnapshot[];
}

export interface PlayerTotals {
  spend: Record<SpendKey, number>;
  battlesWon: number;
  battlesLost: number;
  /** Eşitlikle biten kara savaşları */
  battlesTied: number;
  capitalAttempts: number;
}

export interface GameStats {
  rounds: RoundSnapshot[];
  totals: PlayerTotals[];
  eliminations: { player: number; by: number; round: number }[];
}

function emptyTotals(): PlayerTotals {
  return { spend: { claim: 0, build: 0, produce: 0, battle: 0, upkeep: 0, toll: 0 }, battlesWon: 0, battlesLost: 0, battlesTied: 0, capitalAttempts: 0 };
}

export function emptyStats(players: number): GameStats {
  return { rounds: [], totals: Array.from({ length: players }, emptyTotals), eliminations: [] };
}

export function snapshotPlayers(s: GameState): PlayerSnapshot[] {
  const snap: PlayerSnapshot[] = s.players.map((p) => ({ tiles: 0, akce: p.resources.akce, gold: p.resources.gold, oil: p.resources.oil, iron: p.resources.iron, steel: p.resources.steel, ships: 0, planes: 0 }));
  for (const o of s.owner) if (o !== null) snap[o].tiles++;
  for (const u of s.units) {
    if (u.kind === 'ship') snap[u.owner].ships++;
    else snap[u.owner].planes++;
  }
  return snap;
}

/** Tamamlanan turun sonundaki durumu kaydeder (tur başa sarınca ve oyun bitince) */
export function snapshotRound(s: GameState, round: number) {
  const st = (s.stats ??= emptyStats(s.players.length));
  const last = st.rounds[st.rounds.length - 1];
  if (last && last.round >= round) st.rounds.pop();
  st.rounds.push({ round, players: snapshotPlayers(s) });
}

/** Bir eylemin olaylarını istatistiklere işler (applyAction çağırır). */
export function recordStats(s: GameState, events: GameEvent[]) {
  const st = (s.stats ??= emptyStats(s.players.length));
  const T = st.totals;
  const cfg = s.config;
  for (const e of events) {
    switch (e.type) {
      case 'claim':
        T[e.player].spend.claim += e.cost;
        break;
      case 'build':
        T[e.player].spend.build += e.structure === 'shipyard' ? cfg.shipyardCost : e.structure === 'factory' ? cfg.factoryCost : cfg.baseCost;
        break;
      case 'produce':
        T[e.player].spend.produce += e.unit === 'ship' ? cfg.shipAkceCost : cfg.planeAkceCost;
        break;
      case 'upkeep':
        T[e.player].spend.upkeep += e.amount;
        break;
      case 'expedition':
        T[e.player].spend.toll += e.tolls.reduce((a, t) => a + t.amount, 0);
        break;
      case 'battle': {
        T[e.attacker].spend.battle += e.cost.akce;
        if (e.kind === 'capital') T[e.attacker].capitalAttempts++;
        const attackerWon = e.kind === 'land' ? e.gain > 0 : e.success;
        const defenderWon = e.kind === 'land' ? e.loss > 0 : !e.success;
        if (attackerWon) {
          T[e.attacker].battlesWon++;
          T[e.defender].battlesLost++;
        } else if (defenderWon) {
          T[e.defender].battlesWon++;
          T[e.attacker].battlesLost++;
        } else {
          T[e.attacker].battlesTied++;
          T[e.defender].battlesTied++;
        }
        break;
      }
      case 'eliminated':
        st.eliminations.push({ player: e.player, by: e.by, round: s.round });
        break;
    }
  }
}
