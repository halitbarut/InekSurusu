import type { BuildableStructure, GameEvent, GameState, Offer, OfferItem, ResourceKey, StructureType, UnitKind } from '../engine';

export const RES_NAME: Record<ResourceKey, string> = { akce: 'Akçe', gold: 'Altın', oil: 'Petrol', iron: 'Demir', steel: 'Çelik' };
export const RES_ICON: Record<ResourceKey, string> = { akce: '🪙', gold: '🥇', oil: '🛢️', iron: '⛓️', steel: '🔩' };
export const MINE_LETTER: Record<Exclude<ResourceKey, 'akce'>, string> = { gold: 'A', oil: 'P', iron: 'D', steel: 'Ç' };
export const MINE_COLOR: Record<Exclude<ResourceKey, 'akce'>, string> = { gold: '#e2b007', oil: '#2b2b2b', iron: '#9a5b3c', steel: '#5f87ad' };
export const STRUCT_NAME: Record<StructureType, string> = { capital: 'Başkent', shipyard: 'Tersane', factory: 'Uçak fabrikası', base: 'Askeri üs' };
export const STRUCT_ICON: Record<StructureType, string> = { capital: '🏰', shipyard: '⚓', factory: '🏭', base: '🛡️' };
export const UNIT_NAME: Record<UnitKind, string> = { ship: 'gemi', plane: 'uçak' };
export const UNIT_ICON: Record<UnitKind, string> = { ship: '🚢', plane: '✈️' };

// ---------- Türkçe ek uyumu ----------

const DIGIT_WORDS = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const VOWELS = 'aeıioöuü';

function spoken(name: string): string {
  const lower = name.toLocaleLowerCase('tr').trim();
  const last = lower[lower.length - 1];
  if (last >= '0' && last <= '9') return DIGIT_WORDS[Number(last)];
  return lower;
}

function lastVowel(word: string): string {
  for (let i = word.length - 1; i >= 0; i--) if (VOWELS.includes(word[i])) return word[i];
  return 'e';
}

const endsWithVowel = (w: string) => VOWELS.includes(w[w.length - 1]);
const backVowel = (v: string) => 'aıou'.includes(v);
const HARD = 'fstkçşhp';

/** Yönelme hâli: Ali'ye, Mehmet'e */
export function dat(name: string): string {
  const w = spoken(name);
  const v = backVowel(lastVowel(w)) ? 'a' : 'e';
  return `${name}'${endsWithVowel(w) ? 'y' : ''}${v}`;
}

/** İlgi hâli: Ali'nin, Mehmet'in */
export function gen(name: string): string {
  const w = spoken(name);
  const lv = lastVowel(w);
  const v = 'aı'.includes(lv) ? 'ı' : 'ei'.includes(lv) ? 'i' : 'ou'.includes(lv) ? 'u' : 'ü';
  return `${name}'${endsWithVowel(w) ? 'n' : ''}${v}n`;
}

/** Ayrılma hâli: Ali'den, Mehmet'ten */
export function abl(name: string): string {
  const w = spoken(name);
  const v = backVowel(lastVowel(w)) ? 'a' : 'e';
  const c = HARD.includes(w[w.length - 1]) ? 't' : 'd';
  return `${name}'${c}${v}n`;
}

// ---------- genel ----------

export function tileLabel(state: GameState, t: number): string {
  return `(${(t % state.map.width) + 1}, ${Math.floor(t / state.map.width) + 1})`;
}

export function straitLabel(id: number): string {
  return `B${id + 1}`;
}

export function pname(state: GameState, p: number): string {
  return state.players[p]?.name ?? '?';
}

export function structName(s: BuildableStructure | StructureType): string {
  return STRUCT_NAME[s];
}

export function fmtNum(n: number): string {
  return n.toLocaleString('tr-TR');
}

export function offerItemText(state: GameState, offer: Pick<Offer, 'from' | 'to'>, it: OfferItem): string {
  const giver = (side: 'from' | 'to') => pname(state, side === 'from' ? offer.from : offer.to);
  const taker = (side: 'from' | 'to') => pname(state, side === 'from' ? offer.to : offer.from);
  switch (it.kind) {
    case 'alliance':
      return '🤝 İttifak';
    case 'peace':
      return `☮️ Barış (${it.rounds} tur)`;
    case 'resource':
      return `${RES_ICON[it.resource]} ${fmtNum(it.amount)} ${RES_NAME[it.resource]}: ${giver(it.giver)} → ${taker(it.giver)}`;
    case 'tile': {
      const m = state.map.mines[it.tile];
      const s = state.structure[it.tile];
      const extra = [m ? `${RES_NAME[m]} madeni` : '', s ? STRUCT_NAME[s] : ''].filter(Boolean).join(', ');
      return `🟩 Toprak ${tileLabel(state, it.tile)}${extra ? ` [${extra}]` : ''}: ${giver(it.giver)} → ${taker(it.giver)}`;
    }
    case 'strait':
      return `⚓ ${straitLabel(it.straitId)} geçiş izni${it.toll > 0 ? ` (vergi ${it.toll})` : ' (vergisiz)'}: ${giver(it.giver)} → ${taker(it.giver)}`;
  }
}

export function offerText(state: GameState, offer: Pick<Offer, 'from' | 'to' | 'items'>): string {
  return offer.items.map((it) => offerItemText(state, offer, it)).join(' · ');
}

function gainText(g: Partial<Record<ResourceKey, number>>): string {
  return (Object.entries(g) as [ResourceKey, number][])
    .filter(([, v]) => v)
    .map(([k, v]) => `+${v} ${RES_NAME[k]}`)
    .join(', ');
}

/** Olay günlüğü satırı. null dönerse günlükte gösterilmez. */
export function formatEvent(state: GameState, e: GameEvent): string | null {
  const N = (p: number) => pname(state, p);
  switch (e.type) {
    case 'game_started':
      return '🎉 Oyun başladı!';
    case 'capital_placed':
      return `🏰 ${N(e.player)} başkentini ${tileLabel(state, e.tile)} karesine kurdu.`;
    case 'setup_done':
      return `${N(e.player)} başlangıç topraklarını seçti (${e.tiles} kare).`;
    case 'turn_start':
      return `— ${e.round}. tur · ${N(e.player)} —`;
    case 'income':
      return `⛏️ ${N(e.player)} madenlerinden gelir: ${gainText(e.gained)}`;
    case 'spin':
      return `🎲 ${N(e.player)} ${e.value} attı, ${fmtNum(e.akce)} akçe kazandı`;
    case 'claim':
      return e.via === 'land'
        ? `${N(e.player)} ${tileLabel(state, e.tile)} toprağını ele geçirdi (${e.cost} akçe)`
        : `${e.via === 'ship' ? '🚢' : '✈️'} ${N(e.player)} ${e.via === 'ship' ? 'gemiyle' : 'uçakla'} ${tileLabel(state, e.tile)} toprağını aldı`;
    case 'exchange':
      return `🥇 ${N(e.player)} ${e.gold} altın bozdurdu (+${fmtNum(e.akce)} akçe)`;
    case 'build':
      return `🔨 ${N(e.player)} ${tileLabel(state, e.tile)} karesine ${STRUCT_NAME[e.structure].toLocaleLowerCase('tr')} kurdu`;
    case 'produce':
      return `${UNIT_ICON[e.unit]} ${N(e.player)} ${UNIT_NAME[e.unit]} üretti`;
    case 'expedition': {
      const toll = e.tolls.reduce((a, t) => a + t.amount, 0);
      return `${UNIT_ICON[e.unit]} ${N(e.player)} ${UNIT_NAME[e.unit]} seferi: ${tileLabel(state, e.from)} → ${tileLabel(state, e.target)}${toll ? ` (${toll} akçe boğaz vergisi)` : ''}`;
    }
    case 'battle': {
      const score = e.rounds.map((r) => `${r.a} – ${r.d}`).join(', ');
      const via = e.via === 'ship' ? ' (gemiyle)' : e.via === 'plane' ? ' (uçakla)' : '';
      if (e.kind === 'land') {
        const res = e.gain > 0 ? `${e.gain} toprak` : e.loss > 0 ? `karşı saldırı: ${N(e.defender)} ${e.loss} toprak alır` : 'sonuçsuz';
        return `⚔️ ${N(e.attacker)}, ${dat(N(e.defender))} saldırdı${via}: ${score} → ${res}`;
      }
      const what = e.kind === 'capital' ? 'başkentine' : 'askeri üssüne';
      const res = e.success ? (e.kind === 'capital' ? 'BAŞKENT DÜŞTÜ!' : 'üs alındı!') : 'başarısız';
      return `💥 ${N(e.attacker)}, ${gen(N(e.defender))} ${what} saldırdı${via}: ${score} → ${res}`;
    }
    case 'conquer':
      return `${N(e.player)}, ${abl(N(e.from))} ${tileLabel(state, e.tile)} toprağını aldı`;
    case 'base_captured':
      return `🛡️ ${N(e.player)}, ${gen(N(e.from))} askeri üssünü ele geçirdi`;
    case 'eliminated':
      return `☠️ ${N(e.player)} elendi! Her şeyi ${dat(N(e.by))} geçti.`;
    case 'strait_control':
      return e.controller === null
        ? `⚓ ${straitLabel(e.straitId)} boğazı artık kimsenin idaresinde değil`
        : `⚓ ${N(e.controller)} ${straitLabel(e.straitId)} boğazının idaresini aldı`;
    case 'strait_policy':
      return `⚓ ${N(e.player)}, ${straitLabel(e.straitId)} boğazında ${N(e.target)} için: ${e.allow ? 'geçiş açık' : 'geçiş kapalı'}${e.allow ? `, vergi ${e.toll}` : ''}`;
    case 'offer_made':
      return `📜 ${N(e.offer.from)}, ${dat(N(e.offer.to))} teklif gönderdi: ${offerText(state, e.offer)}`;
    case 'offer_response':
      if (e.failedReason) return `📜 ${gen(N(e.from))} teklifi geçersiz oldu: ${e.failedReason}`;
      return `📜 ${N(e.to)}, ${gen(N(e.from))} teklifini ${e.accepted ? 'kabul etti' : 'reddetti'}`;
    case 'offer_cancelled':
      return `📜 ${N(e.from)} teklifini geri çekti`;
    case 'alliance_formed':
      return `🤝 ${N(e.a)} ile ${N(e.b)} ittifak kurdu`;
    case 'peace_made':
      return `☮️ ${N(e.a)} ile ${N(e.b)} barış yaptı (${e.untilRound}. tur sonuna kadar)`;
    case 'alliance_broken':
      return `💔 ${N(e.player)}, ${N(e.target)} ile ittifakını bozdu`;
    case 'victory_proposed':
      return `🗳️ ${N(e.player)} oyunu ittifakla bitirmeyi önerdi`;
    case 'vote_cast':
      return `🗳️ ${N(e.player)}: ${e.accept ? 'evet' : 'hayır'}`;
    case 'vote_result':
      return e.accepted ? '🗳️ Oylama oybirliğiyle kabul edildi' : '🗳️ Oylama reddedildi, oyun sürüyor';
    case 'game_over':
      return `🏆 Oyun bitti! Kazanan: ${e.winners.map(N).join(', ')}`;
  }
}
