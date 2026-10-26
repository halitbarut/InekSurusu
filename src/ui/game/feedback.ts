import {
  BATTLE_USED,
  battleCost,
  planeRoutes,
  shipRoutes,
  structureCost,
  targetBattleKind,
  type Action,
  type GameState,
  type ResourceKey,
  type Resources,
} from '../../engine';
import { h } from '../dom';
import { RES_NAME, fmtNum } from '../format';
import { icon, type IconName } from '../icons';

/**
 * Oyuncuyu eylemden önce ve sonra bilgilendiren yardımcılar: eksik kaynak metni, anlaşılır hata nedenleri,
 * savaş olasılıkları, uçan kaynak sayıları ve ekranın kenarındaki kısa bildirimler.
 */

const ORDER: ResourceKey[] = ['akce', 'gold', 'oil', 'iron', 'steel'];
const lower = (k: ResourceKey) => RES_NAME[k].toLocaleLowerCase('tr');

/** "Yetersiz demir: 1 demir daha lazım"; birden çok eksikte hepsini sayar. Eksik yoksa null. */
export function shortfall(res: Resources, need: Partial<Resources>): string | null {
  const miss = ORDER.filter((k) => (need[k] ?? 0) > res[k]).map((k) => ({ k, n: (need[k] ?? 0) - res[k] }));
  if (miss.length === 0) return null;
  const names = miss.map((m) => lower(m.k));
  const amounts = miss.map((m) => `${fmtNum(m.n)} ${lower(m.k)}`);
  const join = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} ve ${a[a.length - 1]}` : a[0]);
  return `Yetersiz ${join(names)}: ${join(amounts)} daha lazım`;
}

/** Eylemin kaynak bedeli (bilinebiliyorsa) */
export function actionCost(state: GameState, a: Action): Partial<Resources> | null {
  const c = state.config;
  switch (a.type) {
    case 'CLAIM_TILE':
      return { akce: c.claimCost };
    case 'BUILD':
      return { akce: structureCost(state, a.structure) };
    case 'PRODUCE':
      return a.unit === 'ship' ? { iron: c.shipIronCost, akce: c.shipAkceCost } : { steel: c.planeSteelCost, akce: c.planeAkceCost };
    case 'EXCHANGE_GOLD':
      return { gold: a.amount };
    case 'ATTACK': {
      const b = battleCost(state, targetBattleKind(state, a.target));
      return { akce: b.akce, iron: b.iron, steel: b.steel };
    }
    case 'SHIP_EXPEDITION':
    case 'PLANE_EXPEDITION': {
      const unit = state.units.find((u) => u.id === a.unitId);
      if (!unit) return null;
      const ship = a.type === 'SHIP_EXPEDITION';
      const route = (ship ? shipRoutes(state, a.player, unit.tile) : planeRoutes(state, a.player, unit.tile)).routeTo(a.target);
      const toll = route?.toll ?? 0;
      const oil = ship ? c.shipOilCost : c.planeOilCost;
      if (state.owner[a.target] === null) return { oil, akce: toll + c.expeditionClaimCost };
      const b = battleCost(state, targetBattleKind(state, a.target));
      return { oil, akce: b.akce + toll, iron: b.iron, steel: b.steel };
    }
    default:
      return null;
  }
}

/** Bazı kural nedenlerinin "ne yapmalı" içeren karşılıkları */
const ADVICE: [RegExp, string][] = [
  [/^Toprağınıza sınır komşusu olmalı/, 'Bu kare toprağına komşu değil: önce aradaki kareleri al ya da gemi/uçakla git'],
  [/^Saldırmak için sınır komşuluğu gerekli/, 'Bu toprakla sınırın yok: gemi ya da uçakla saldırabilirsin'],
  [/^Tersane denize kıyısı olan/, 'Tersane için denize kıyısı olan bir kare seç (göl kıyısı sayılmaz)'],
  [/^Bu karede zaten bir yapı var/, 'Bu karede zaten bir yapı var: her karede tek yapı olur, başka bir kare seç'],
  [new RegExp(`^${BATTLE_USED}`), `${BATTLE_USED}: bir sonraki turunda yeniden saldırabilirsin`],
  [/^Maden kareleri gemi veya uçakla/, 'Maden karesi seferle alınmaz: önce yanındaki kareyi al, sonra madeni karadan al'],
  [/^Başkente gemi veya uçakla/, 'Başkente gemi ya da uçakla saldırılmaz: başkent savaşı için kara sınırı gerekir'],
  [/^Bu hedefe deniz yolu yok/, 'Bu hedefe deniz yolu yok: kapalı boğazlar olabilir (Boğazlar panelinde bak) ya da hedef başka bir denizde'],
  [/^Askeri üs engeli/, 'Düşman üssünün çevresine uçulamaz: üssü karadan ya da gemiyle al, ya da başka bir hedef seç'],
  [/^Sıra sizde değil/, 'Sıra sende değil: kendi turunu bekle'],
];

/** Doğrulama nedenini oyuncuya ne yapacağını söyleyen metne çevirir */
export function explainProblem(state: GameState, a: Action, reason: string): string {
  if (/gerekli|yeterli/.test(reason)) {
    const need = actionCost(state, a);
    const p = state.players[a.player];
    const s = need && p ? shortfall(p.resources, need) : null;
    if (s) return s;
  }
  for (const [re, text] of ADVICE) if (re.test(reason)) return text;
  return reason;
}

// ------------------------------------------------------------------
// Savaş olasılıkları
// ------------------------------------------------------------------

export interface LandOdds {
  win: number;
  lose: number;
  tie: number;
  /** Kazanınca ortalama ve en çok alınacak toprak */
  avgGain: number;
  maxGain: number;
  /** Karşı saldırıda ortalama ve en çok verilecek toprak */
  avgLoss: number;
  maxLoss: number;
}

/** Kara savaşı: iki topaç; kazanırsan fark kadar al, kaybedersen farkın yarısı (yukarı) kadar ver */
export function landOdds(faces: number): LandOdds {
  let win = 0;
  let lose = 0;
  let gain = 0;
  let loss = 0;
  for (let a = 1; a <= faces; a++) {
    for (let d = 1; d <= faces; d++) {
      if (a > d) {
        win++;
        gain += a - d;
      } else if (a < d) {
        lose++;
        loss += Math.ceil((d - a) / 2);
      }
    }
  }
  const n = faces * faces;
  return { win: win / n, lose: lose / n, tie: (n - win - lose) / n, avgGain: gain / win, maxGain: faces - 1, avgLoss: loss / lose, maxLoss: Math.ceil((faces - 1) / 2) };
}

/** "%44" */
export const pct = (p: number) => `%${(p * 100).toLocaleString('tr-TR', { maximumFractionDigits: p < 0.2 ? 1 : 0 })}`;
/** "2,7" */
export const dec = (x: number) => x.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

// ------------------------------------------------------------------
// Uçan sayılar ve kenar bildirimleri
// ------------------------------------------------------------------

/** Bir ögenin üstünde kısa süre yükselip kaybolan "+300 akçe" yazısı */
export function floatText(anchor: Element, text: string, kind: 'good' | 'bad', delay = 0) {
  const r = anchor.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return;
  const el = h('div', { class: `float-delta ${kind}`, 'aria-hidden': 'true' }, text);
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.bottom - 4}px`;
  el.style.animationDelay = `${delay}ms`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900 + delay);
}

let notifyHost: HTMLElement | null = null;

export interface Notice {
  icon: IconName;
  title: string;
  text?: string;
  kind?: 'good' | 'bad' | 'info';
  /** Tıklanınca (ör. haritada ilgili kareye git) */
  onClick?: () => void;
  ms?: number;
}

/** Ekranın sağ kenarında kısa bildirim (en fazla 4 tane, kendiliğinden kaybolur) */
export function notify(n: Notice) {
  if (!notifyHost || !document.body.contains(notifyHost)) {
    notifyHost = h('div', { class: 'notify-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(notifyHost);
  }
  const host = notifyHost;
  const el = h(
    'button',
    { class: `notice notice-${n.kind ?? 'info'}`, title: n.onClick ? 'Haritada göster' : 'Kapat' },
    icon(n.icon, { cls: 'notice-icon' }),
    h('span', { class: 'notice-body' }, h('b', {}, n.title), n.text ? h('span', { class: 'notice-text' }, n.text) : null),
  );
  const remove = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  };
  el.addEventListener('click', () => {
    n.onClick?.();
    remove();
  });
  host.prepend(el);
  while (host.children.length > 4) host.lastElementChild?.remove();
  setTimeout(remove, n.ms ?? 6000);
}

/** Oyun ekranından çıkınca bildirimleri temizle */
export function clearNotices() {
  notifyHost?.remove();
  notifyHost = null;
}
