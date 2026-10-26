import {
  battleCost,
  battleCostText,
  expeditionCheck,
  isCoastal,
  readyUnits,
  structureCost,
  targetBattleKind,
  unitsAt,
  validateAction,
  type Action,
  type BuildableStructure,
  type GameState,
  type UnitKind,
} from '../../engine';
import { append, clear, h, type Child } from '../dom';
import { STRUCT_ICON, STRUCT_NAME, fmtNum, pname, straitLabel, tileLabel } from '../format';
import { icon, type IconName } from '../icons';
import { explainProblem } from './feedback';

/** Sefer rotası (menüde üzerine gelince haritada çizilir) */
export interface RoutePreview {
  from: number;
  path: number[];
  tolls: { straitId: number; controller: number; amount: number }[];
}

export interface TileAction {
  id: string;
  icon: IconName;
  label: string;
  /** "100 akçe" gibi bedel */
  cost?: string;
  /** Yapılamıyorsa nedeni (ne yapılması gerektiğiyle) */
  reason: string | null;
  route?: RoutePreview;
  /** Seçilince: eylem, sefer moduna geçiş ya da pencere */
  pick:
    | { kind: 'act'; action: Action }
    | { kind: 'expeditionMode'; unit: UnitKind; unitId: number }
    | { kind: 'composer'; to: number }
    | { kind: 'chat'; to: number }
    | { kind: 'straits' };
}

export interface TileMenuModel {
  title: string;
  sub: Child;
  actions: TileAction[];
}

const check = (state: GameState, a: Action) => {
  const v = validateAction(state, a);
  return v.ok ? null : explainProblem(state, a, v.reason);
};

const BUILD_ORDER: BuildableStructure[] = ['shipyard', 'factory', 'base'];
const BATTLE_LABEL = { land: 'Saldır', capital: 'Başkent savaşı', base: 'Üs savaşı' } as const;

/** Gemi/uçakla bu kareye sefer: hazır birimlerden ilk uygun olanı (yoksa ilk nedeni) */
function expeditionAction(state: GameState, me: number, tile: number, kind: UnitKind, claim: boolean): TileAction | null {
  const own = state.units.filter((u) => u.owner === me && u.kind === kind);
  if (own.length === 0) return null;
  const type = kind === 'ship' ? ('SHIP_EXPEDITION' as const) : ('PLANE_EXPEDITION' as const);
  const name = kind === 'ship' ? 'Gemiyle' : 'Uçakla';
  const oil = kind === 'ship' ? state.config.shipOilCost : state.config.planeOilCost;
  const ready = readyUnits(state, me, kind);
  let reason: string | null = ready.length ? null : oil > state.players[me].resources.oil ? `Yetersiz petrol: ${oil - state.players[me].resources.oil} petrol daha lazım` : 'Bu tur sefere çıkabilecek birim kalmadı';
  for (const u of ready) {
    const action: Extract<Action, { type: 'SHIP_EXPEDITION' | 'PLANE_EXPEDITION' }> = { type, player: me, unitId: u.id, target: tile };
    const chk = expeditionCheck(state, action);
    if (chk.ok) {
      const kindB = targetBattleKind(state, tile);
      const money = claim ? chk.route.toll + chk.claimCost : battleCost(state, kindB).akce + chk.route.toll;
      const extra = claim ? '' : battleCost(state, kindB).iron ? ` + ${battleCost(state, kindB).iron} demir` : '';
      return {
        id: `${kind}-${claim ? 'claim' : 'attack'}`,
        icon: kind,
        label: claim ? `${name} al` : `${name} saldır`,
        cost: `${oil} petrol + ${fmtNum(money)} akçe${extra}${chk.route.toll ? ` (${chk.route.toll} vergi dahil)` : ''}`,
        reason: null,
        route: { from: u.tile, path: chk.route.path, tolls: chk.route.tolls },
        pick: { kind: 'act', action },
      };
    }
    reason ??= explainProblem(state, action, chk.reason);
  }
  return { id: `${kind}-${claim ? 'claim' : 'attack'}`, icon: kind, label: claim ? `${name} al` : `${name} saldır`, cost: `${oil} petrol`, reason, pick: { kind: 'act', action: { type, player: me, unitId: own[0].id, target: tile } } };
}

/** Bu karede yapılabilecek eylemler (eylem aşamasında, sıra bu oyuncudayken) */
export function tileMenuModel(state: GameState, me: number, tile: number, opts: { chat: (seat: number) => boolean }): TileMenuModel | null {
  const m = state.map;
  const c = state.config;
  const o = state.owner[tile];
  const actions: TileAction[] = [];
  const terrain = m.terrain[tile];
  if (terrain !== 'land') {
    const sid = m.straitOf[tile];
    if (sid < 0) return null;
    const ctl = state.straits[sid].controller;
    if (ctl === me) actions.push({ id: 'straits', icon: 'strait', label: 'Geçiş izni ve vergi', reason: null, pick: { kind: 'straits' } });
    return { title: `${straitLabel(sid)} boğazı`, sub: ctl === null ? 'İdare eden yok: iki yakadaki tüm kara kareleri alan idare eder' : `İdare: ${pname(state, ctl)}`, actions };
  }
  const mine = m.mines[tile];
  const st = state.structure[tile];
  if (o === null) {
    actions.push({ id: 'claim', icon: 'claim', label: 'Toprak al', cost: `${c.claimCost} akçe`, reason: check(state, { type: 'CLAIM_TILE', player: me, tile }), pick: { kind: 'act', action: { type: 'CLAIM_TILE', player: me, tile } } });
    for (const k of ['ship', 'plane'] as const) {
      const a = expeditionAction(state, me, tile, k, true);
      if (a) actions.push(a);
    }
    return { title: tileLabel(state, tile), sub: `Sahipsiz kara${mine ? ' · maden' : ''}`, actions };
  }
  if (o === me) {
    if (st === null) {
      for (const s of BUILD_ORDER) {
        const action: Action = { type: 'BUILD', player: me, tile, structure: s };
        let reason = check(state, action);
        if (s === 'shipyard' && !isCoastal(m, tile)) reason = 'Denize kıyısı yok: tersane yalnızca deniz kıyısına kurulur';
        actions.push({ id: `build-${s}`, icon: STRUCT_ICON[s], label: `${STRUCT_NAME[s]} kur`, cost: `${structureCost(state, s)} akçe`, reason, pick: { kind: 'act', action } });
      }
    } else if (st === 'shipyard' || st === 'factory') {
      const unit: UnitKind = st === 'shipyard' ? 'ship' : 'plane';
      const action: Action = { type: 'PRODUCE', player: me, tile, unit };
      const cost = unit === 'ship' ? `${c.shipIronCost} demir + ${c.shipAkceCost} akçe` : `${c.planeSteelCost} çelik + ${c.planeAkceCost} akçe`;
      actions.push({ id: `produce-${unit}`, icon: 'produce', label: unit === 'ship' ? 'Gemi üret' : 'Uçak üret', cost: `${cost}${c.upkeepEnabled ? ` · bakım ${unit === 'ship' ? c.shipUpkeep : c.planeUpkeep}/tur` : ''}`, reason: check(state, action), pick: { kind: 'act', action } });
      const here = unitsAt(state, tile).filter((u) => u.owner === me);
      if (here.length) {
        const ready = readyUnits(state, me, unit).filter((u) => u.tile === tile);
        const oil = unit === 'ship' ? c.shipOilCost : c.planeOilCost;
        actions.push({
          id: `expedition-${unit}`,
          icon: unit,
          label: `${unit === 'ship' ? 'Gemi' : 'Uçak'} seferi (${here.length})`,
          cost: `${oil} petrol`,
          reason: ready.length ? null : state.players[me].resources.oil < oil ? `Yetersiz petrol: ${oil - state.players[me].resources.oil} petrol daha lazım` : 'Bu tur sefere çıkabilecek birim kalmadı',
          pick: { kind: 'expeditionMode', unit, unitId: (ready[0] ?? here[0]).id },
        });
      }
    } else if (st === 'base') {
      actions.push({ id: 'demolish', icon: 'trash', label: 'Üssü yık', cost: c.upkeepEnabled && c.baseUpkeep > 0 ? `bakımdan ${c.baseUpkeep} akçe kurtarır` : 'toprak sende kalır', reason: null, pick: { kind: 'act', action: { type: 'DEMOLISH_BASE', player: me, tile } } });
    }
    const sub = [st ? STRUCT_NAME[st] : 'Senin toprağın', mine ? ' · maden' : '', isCoastal(m, tile) ? ' · kıyı' : ''].join('');
    return { title: tileLabel(state, tile), sub, actions };
  }
  // Başka oyuncunun toprağı
  const kind = targetBattleKind(state, tile);
  const attack: Action = { type: 'ATTACK', player: me, target: tile };
  actions.push({ id: 'attack', icon: kind === 'land' ? 'attack' : STRUCT_ICON[kind], label: BATTLE_LABEL[kind], cost: c.battleCostsEnabled ? battleCostText(battleCost(state, kind)) : 'masrafsız', reason: check(state, attack), pick: { kind: 'act', action: attack } });
  if (st !== 'capital') {
    for (const k of ['ship', 'plane'] as const) {
      const a = expeditionAction(state, me, tile, k, false);
      if (a) actions.push(a);
    }
  }
  actions.push({ id: 'offer', icon: 'diplomacy', label: `Teklif: ${pname(state, o)}`, reason: null, pick: { kind: 'composer', to: o } });
  if (opts.chat(o)) actions.push({ id: 'chat', icon: 'chat', label: `Özel mesaj: ${pname(state, o)}`, reason: null, pick: { kind: 'chat', to: o } });
  return { title: tileLabel(state, tile), sub: h('span', {}, h('span', { class: 'dot small', style: { background: state.players[o].color } }), ` ${pname(state, o)}${st ? ` · ${STRUCT_NAME[st]}` : ''}${mine ? ' · maden' : ''}`), actions };
}

/** Haritanın üstünde açılan küçük bağlam menüsü */
export class TileMenu {
  readonly el = h('div', { class: 'tile-menu hidden', role: 'menu' });
  tile = -1;
  onPick: ((a: TileAction) => void) | null = null;
  /** Bir eylemin üzerine gelindi (rota önizlemesi için); null = ayrıldı */
  onFocusAction: ((a: TileAction | null) => void) | null = null;

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(tile: number, model: TileMenuModel, x: number, y: number, bounds: DOMRect) {
    this.tile = tile;
    clear(this.el);
    append(this.el, [
      h('div', { class: 'tile-menu-head' }, h('b', {}, model.title), h('span', { class: 'muted small' }, model.sub), h('button', { class: 'icon-btn', 'aria-label': 'Kapat', onClick: () => this.close() }, icon('close'))),
      model.actions.length ? null : h('div', { class: 'muted small tile-menu-empty' }, 'Bu karede yapılabilecek bir eylem yok.'),
    ]);
    for (const a of model.actions) {
      const b = h(
        'button',
        {
          class: `tile-menu-item ${a.reason ? 'locked' : ''}`,
          role: 'menuitem',
          'aria-disabled': a.reason ? 'true' : null,
          onClick: () => {
            if (a.reason) return;
            this.close();
            this.onPick?.(a);
          },
        },
        icon(a.icon, { cls: 'tm-icon' }),
        h('span', { class: 'tm-main' }, h('span', { class: 'tm-label' }, a.label), a.cost ? h('span', { class: 'tm-cost' }, a.cost) : null, a.reason ? h('span', { class: 'tm-reason' }, a.reason) : null, a.route && a.route.tolls.length ? h('span', { class: 'tm-tolls' }, icon('strait'), ` ${a.route.tolls.map((t) => `${straitLabel(t.straitId)} boğazı: ${t.amount} akçe vergi`).join(', ')}`) : null),
      );
      if (a.route) {
        b.addEventListener('pointerenter', () => this.onFocusAction?.(a));
        b.addEventListener('focus', () => this.onFocusAction?.(a));
      }
      this.el.append(b);
    }
    this.el.classList.remove('hidden');
    // Kareye yakın, harita alanının içinde kalacak şekilde
    const w = this.el.offsetWidth;
    const hh = this.el.offsetHeight;
    let left = x - bounds.left + 14;
    let top = y - bounds.top + 10;
    if (left + w > bounds.width - 6) left = Math.max(6, x - bounds.left - w - 14);
    if (top + hh > bounds.height - 6) top = Math.max(6, bounds.height - hh - 6);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    // Dokunmatikte üzerine gelme olmadığı için ilk rotalı eylemin rotası hemen gösterilir
    const firstRoute = model.actions.find((a) => a.route && !a.reason);
    this.onFocusAction?.(firstRoute ?? null);
    (this.el.querySelector('.tile-menu-item:not(.locked)') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.add('hidden');
    this.tile = -1;
    this.onFocusAction?.(null);
  }
}
