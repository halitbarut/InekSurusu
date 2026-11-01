import { PERMIT_DECISIONS, RESOURCE_KEYS, STRAIT_MODES, type Action, type OfferItem, type PermitDecision, type ResourceKey, type StraitMode } from './types';

/**
 * Güvenilmeyen kaynaktan (ağdan, dosyadan) gelen eylemin biçim denetimi. Alanları tek tek okuyup yeni,
 * temiz bir Action nesnesi kurar: bilinmeyen tür, eksik/yanlış tipte alan, fazladan alan ya da aşırı büyük
 * teklif reddedilir (null). Kural denetimi değildir; geçerli biçimli eylem yine validateAction'dan geçer.
 */

/** Bir teklifte kabul edilen en fazla kalem (kural sınırı değil, bozuk/kötü niyetli mesaja karşı teknik sınır) */
export const MAX_OFFER_ITEMS_WIRE = 10_000;

type Raw = Record<string, unknown>;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function parseItem(raw: unknown): OfferItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Raw;
  const side = o.giver === 'from' || o.giver === 'to' ? o.giver : null;
  switch (o.kind) {
    case 'alliance':
      return { kind: 'alliance' };
    case 'peace':
      return isInt(o.rounds) ? { kind: 'peace', rounds: o.rounds } : null;
    case 'resource':
      if (!side || !isInt(o.amount) || !RESOURCE_KEYS.includes(o.resource as ResourceKey)) return null;
      return { kind: 'resource', giver: side, resource: o.resource as ResourceKey, amount: o.amount };
    case 'tile':
      return side && isInt(o.tile) ? { kind: 'tile', giver: side, tile: o.tile } : null;
    case 'strait':
      return side && isInt(o.straitId) && isInt(o.toll) ? { kind: 'strait', giver: side, straitId: o.straitId, toll: o.toll } : null;
    default:
      return null;
  }
}

export function parseAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Raw;
  const player = a.player;
  if (!isInt(player)) return null;
  const ints = (...keys: string[]) => keys.every((k) => isInt(a[k]));
  switch (a.type) {
    case 'PLACE_CAPITAL':
    case 'PICK_START_TILE':
    case 'CLAIM_TILE':
      return ints('tile') ? { type: a.type, player, tile: a.tile as number } : null;
    case 'SKIP_START_PICKS':
    case 'SPIN':
    case 'END_CONQUEST':
    case 'PROPOSE_VICTORY':
    case 'END_TURN':
      return { type: a.type, player };
    case 'EXCHANGE_GOLD':
      return ints('amount') ? { type: a.type, player, amount: a.amount as number } : null;
    case 'BUILD':
      if (!ints('tile') || (a.structure !== 'shipyard' && a.structure !== 'factory' && a.structure !== 'base')) return null;
      return { type: a.type, player, tile: a.tile as number, structure: a.structure };
    case 'PRODUCE':
      if (!ints('tile') || (a.unit !== 'ship' && a.unit !== 'plane')) return null;
      return { type: a.type, player, tile: a.tile as number, unit: a.unit };
    case 'ATTACK':
      return ints('target') ? { type: a.type, player, target: a.target as number } : null;
    case 'SHIP_EXPEDITION':
    case 'PLANE_EXPEDITION':
      return ints('unitId', 'target') ? { type: a.type, player, unitId: a.unitId as number, target: a.target as number } : null;
    case 'CONQUER_TILE':
      return ints('tile') ? { type: a.type, player, tile: a.tile as number } : null;
    case 'SET_STRAIT_POLICY':
      if (!ints('straitId', 'target', 'toll') || !STRAIT_MODES.includes(a.mode as StraitMode)) return null;
      return { type: a.type, player, straitId: a.straitId as number, target: a.target as number, mode: a.mode as StraitMode, toll: a.toll as number };
    case 'PAY_UPKEEP':
      return { type: a.type, player };
    case 'REQUEST_LOAN':
      return ints('to', 'amount', 'term') ? { type: a.type, player, to: a.to as number, amount: a.amount as number, term: a.term as number } : null;
    case 'OFFER_LOAN':
      return ints('to', 'amount', 'term', 'rate') ? { type: a.type, player, to: a.to as number, amount: a.amount as number, term: a.term as number, rate: a.rate as number } : null;
    case 'RESPOND_LOAN':
      return ints('requestId', 'rate') && isBool(a.accept) ? { type: a.type, player, requestId: a.requestId as number, accept: a.accept, rate: a.rate as number } : null;
    case 'CONFIRM_LOAN':
      return ints('requestId') && isBool(a.accept) ? { type: a.type, player, requestId: a.requestId as number, accept: a.accept } : null;
    case 'REPAY_LOAN':
      return ints('loanId', 'amount') ? { type: a.type, player, loanId: a.loanId as number, amount: a.amount as number } : null;
    case 'RESPOND_PERMIT':
      if (!ints('straitId', 'toll') || !PERMIT_DECISIONS.includes(a.decision as PermitDecision)) return null;
      return { type: a.type, player, straitId: a.straitId as number, decision: a.decision as PermitDecision, toll: a.toll as number };
    case 'CONFIRM_PERMIT':
      return isBool(a.accept) ? { type: a.type, player, accept: a.accept } : null;
    case 'PROPOSE_OFFER': {
      if (!ints('to') || !Array.isArray(a.items) || a.items.length > MAX_OFFER_ITEMS_WIRE) return null;
      const items: OfferItem[] = [];
      for (const r of a.items) {
        const it = parseItem(r);
        if (!it) return null;
        items.push(it);
      }
      return { type: a.type, player, to: a.to as number, items };
    }
    case 'RESPOND_OFFER':
      return ints('offerId') && isBool(a.accept) ? { type: a.type, player, offerId: a.offerId as number, accept: a.accept } : null;
    case 'COUNTER_OFFER': {
      if (!ints('offerId') || !Array.isArray(a.items) || a.items.length > MAX_OFFER_ITEMS_WIRE) return null;
      const items: OfferItem[] = [];
      for (const r of a.items) {
        const it = parseItem(r);
        if (!it) return null;
        items.push(it);
      }
      return { type: a.type, player, offerId: a.offerId as number, items };
    }
    case 'BOT_SAY':
      return ints('phrase', 'about') ? { type: a.type, player, phrase: a.phrase as number, about: a.about as number } : null;
    case 'CANCEL_OFFER':
      return ints('offerId') ? { type: a.type, player, offerId: a.offerId as number } : null;
    case 'BREAK_ALLIANCE':
      return ints('target') ? { type: a.type, player, target: a.target as number } : null;
    case 'CAST_VOTE':
      return isBool(a.accept) ? { type: a.type, player, accept: a.accept } : null;
    case 'DISBAND_UNIT':
      return ints('unitId') ? { type: a.type, player, unitId: a.unitId as number } : null;
    case 'DEMOLISH_BASE':
    case 'DEMOLISH':
      return ints('tile') ? { type: a.type, player, tile: a.tile as number } : null;
    default:
      return null;
  }
}
