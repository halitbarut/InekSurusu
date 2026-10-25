import { isCoastal } from './grid';
import { attackBlockReason, capitalProblem, conquestCandidates, touchesOwn, unitCanSortie } from './helpers';
import { planeRoutes, shipRoutes, type Route } from './movement';
import { expeditionCheck, structureCost, validateAction } from './rules';
import { MINE_TYPES, type BattleKind, type BuildableStructure, type GameState, type MineType, type UnitKind } from './types';

/** Arayüz ve botlar için geçerli hedef sorguları. */

export function capitalCandidates(state: GameState, p: number): number[] {
  const strict = capitalCandidatesRaw(state, p, false);
  return strict.length > 0 ? strict : capitalCandidatesRaw(state, p, true);
}

/** ignoreDistance: başkentler arası mesafe kuralını yok say */
export function capitalCandidatesRaw(state: GameState, p: number, ignoreDistance: boolean): number[] {
  const r: number[] = [];
  for (let i = 0; i < state.owner.length; i++) {
    if (state.map.terrain[i] === 'land' && !capitalProblem(state, p, i, ignoreDistance)) r.push(i);
  }
  return r;
}

/** Başlangıç seçiminde alınabilecek kareler (madenler hariç). */
export function startPickCandidates(state: GameState, p: number): number[] {
  return unownedNeighbours(state, p).filter((i) => !state.map.mines[i]);
}

export function claimableTiles(state: GameState, p: number): number[] {
  if (state.players[p].resources.akce < state.config.claimCost) return [];
  return unownedNeighbours(state, p);
}

function unownedNeighbours(state: GameState, p: number): number[] {
  const r: number[] = [];
  for (let i = 0; i < state.owner.length; i++) {
    if (state.owner[i] === null && state.map.terrain[i] === 'land' && touchesOwn(state, p, i)) r.push(i);
  }
  return r;
}

export function buildableTiles(state: GameState, p: number, s: BuildableStructure): number[] {
  if (state.players[p].resources.akce < structureCost(state, s)) return [];
  const r: number[] = [];
  for (let i = 0; i < state.owner.length; i++) {
    if (state.owner[i] !== p || state.structure[i] !== null) continue;
    if (s === 'shipyard' && !isCoastal(state.map, i)) continue;
    r.push(i);
  }
  return r;
}

export function producibleTiles(state: GameState, p: number, unit: UnitKind): number[] {
  const r: number[] = [];
  for (let i = 0; i < state.owner.length; i++) {
    if (state.owner[i] !== p) continue;
    if (validateAction(state, { type: 'PRODUCE', player: p, tile: i, unit }).ok) r.push(i);
  }
  return r;
}

export function attackableTiles(state: GameState, p: number): number[] {
  const r: number[] = [];
  const blocked = new Map<number, boolean>();
  for (let i = 0; i < state.owner.length; i++) {
    const o = state.owner[i];
    if (o === null || o === p) continue;
    if (!blocked.has(o)) blocked.set(o, attackBlockReason(state, p, o) !== null);
    if (blocked.get(o)) continue;
    if (touchesOwn(state, p, i)) r.push(i);
  }
  return r;
}

export function battleKindAt(state: GameState, tile: number): BattleKind {
  const s = state.structure[tile];
  return s === 'capital' ? 'capital' : s === 'base' ? 'base' : 'land';
}

export interface ExpeditionTarget {
  tile: number;
  route: Route;
  /** 'claim' = sahipsiz toprak alma, aksi halde savaş türü */
  kind: 'claim' | BattleKind;
  cost: number;
}

/** Bir gemi/uçağın gidebileceği tüm geçerli hedefler. */
export function expeditionTargets(state: GameState, p: number, unitId: number): Map<number, ExpeditionTarget> {
  const out = new Map<number, ExpeditionTarget>();
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.owner !== p) return out;
  const isShip = unit.kind === 'ship';
  const routes = isShip ? shipRoutes(state, p, unit.tile) : planeRoutes(state, p, unit.tile);
  const type = isShip ? ('SHIP_EXPEDITION' as const) : ('PLANE_EXPEDITION' as const);
  for (const t of routes.targets) {
    const chk = expeditionCheck(state, { type, player: p, unitId, target: t }, routes);
    if (!chk.ok) continue;
    out.set(t, {
      tile: t,
      route: chk.route,
      kind: state.owner[t] === null ? 'claim' : battleKindAt(state, t),
      cost: chk.route.toll + chk.claimCost,
    });
  }
  return out;
}

/** Sefere çıkabilecek birimler. */
export function readyUnits(state: GameState, p: number, kind: UnitKind) {
  const oil = kind === 'ship' ? state.config.shipOilCost : state.config.planeOilCost;
  if (state.players[p].resources.oil < oil) return [];
  return state.units.filter((u) => u.owner === p && u.kind === kind && unitCanSortie(state, u));
}

export { conquestCandidates };

export interface PlayerStats {
  tiles: number;
  ships: number;
  planes: number;
  mines: Record<MineType, number>;
  structures: Record<BuildableStructure, number>;
}

export function playerStats(state: GameState, p: number): PlayerStats {
  const mines = Object.fromEntries(MINE_TYPES.map((m) => [m, 0])) as Record<MineType, number>;
  const structures: Record<BuildableStructure, number> = { shipyard: 0, factory: 0, base: 0 };
  let tiles = 0;
  for (let i = 0; i < state.owner.length; i++) {
    if (state.owner[i] !== p) continue;
    tiles++;
    const m = state.map.mines[i];
    if (m) mines[m]++;
    const s = state.structure[i];
    if (s && s !== 'capital') structures[s]++;
  }
  let ships = 0;
  let planes = 0;
  for (const u of state.units) {
    if (u.owner !== p) continue;
    if (u.kind === 'ship') ships++;
    else planes++;
  }
  return { tiles, ships, planes, mines, structures };
}
