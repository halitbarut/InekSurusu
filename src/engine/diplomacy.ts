import { isAkceAmount } from './config';
import { atPeace, isAllied, mutRelation, refreshStraits, transferTile } from './helpers';
import { RESOURCE_KEYS, type GameEvent, type GameState, type Offer, type OfferItem } from './types';

const MAX_ITEMS = 24;

function sideToPlayer(offerFrom: number, offerTo: number, side: 'from' | 'to'): number {
  return side === 'from' ? offerFrom : offerTo;
}

/** Tek bir teklif kaleminin geçerliliği (öneri ve kabul anında kontrol edilir). */
export function offerItemProblem(state: GameState, from: number, to: number, item: OfferItem): string | null {
  switch (item.kind) {
    case 'alliance':
      return isAllied(state, from, to) ? 'Zaten müttefiksiniz' : null;
    case 'peace':
      if (!Number.isInteger(item.rounds) || item.rounds < 1 || item.rounds > state.config.maxPeaceRounds) {
        return `Barış süresi 1–${state.config.maxPeaceRounds} tur olmalı`;
      }
      return null;
    case 'resource': {
      if (!RESOURCE_KEYS.includes(item.resource)) return 'Geçersiz kaynak';
      if (!Number.isInteger(item.amount) || item.amount <= 0) return 'Miktar pozitif tam sayı olmalı';
      if (item.resource === 'akce' && !isAkceAmount(item.amount)) return "Akçe miktarı 100'ün katı olmalı";
      const giver = state.players[sideToPlayer(from, to, item.giver)];
      if (giver.resources[item.resource] < item.amount) return `${giver.name} yeterli kaynağa sahip değil`;
      return null;
    }
    case 'tile': {
      const giver = sideToPlayer(from, to, item.giver);
      if (state.owner[item.tile] !== giver) return 'Toprak verenin elinde değil';
      if (state.structure[item.tile] === 'capital') return 'Başkent devredilemez';
      return null;
    }
    case 'strait': {
      const giver = sideToPlayer(from, to, item.giver);
      const st = state.straits[item.straitId];
      if (!st) return 'Geçersiz boğaz';
      if (st.controller !== giver) return 'Boğaz verenin idaresinde değil';
      if (!isAkceAmount(item.toll)) return "Vergi 0 ya da 100'ün katı olmalı";
      return null;
    }
  }
}

export function offerProblem(state: GameState, from: number, to: number, items: OfferItem[]): string | null {
  if (from === to) return 'Kendinize teklif yapamazsınız';
  const target = state.players[to];
  if (!target || !target.alive) return 'Bu oyuncu oyunda değil';
  if (!Array.isArray(items) || items.length === 0) return 'Teklif boş';
  if (items.length > MAX_ITEMS) return 'Teklifte çok fazla kalem var';
  if (items.filter((i) => i.kind === 'alliance').length > 1) return 'Birden fazla ittifak kalemi';
  if (items.filter((i) => i.kind === 'peace').length > 1) return 'Birden fazla barış kalemi';
  const tiles = items.filter((i) => i.kind === 'tile').map((i) => (i as { tile: number }).tile);
  if (new Set(tiles).size !== tiles.length) return 'Aynı toprak iki kez eklenmiş';
  // Aynı kaynaktan aynı yöne toplam miktar kontrolü
  for (const side of ['from', 'to'] as const) {
    const giver = state.players[sideToPlayer(from, to, side)];
    for (const r of RESOURCE_KEYS) {
      const total = items
        .filter((i) => i.kind === 'resource' && i.giver === side && i.resource === r)
        .reduce((a, i) => a + (i as { amount: number }).amount, 0);
      if (total > giver.resources[r]) return `${giver.name} yeterli kaynağa sahip değil`;
    }
  }
  for (const it of items) {
    const p = offerItemProblem(state, from, to, it);
    if (p) return p;
  }
  return null;
}

/** Kabul edilen teklifi uygular (önce offerProblem ile kontrol edilmeli). */
export function executeOffer(state: GameState, offer: Offer, events: GameEvent[]) {
  const { from, to } = offer;
  // Önce kaynaklar ve topraklar, sonra boğaz izinleri (toprak devri idareyi sıfırlayabilir)
  for (const it of offer.items) {
    if (it.kind === 'resource') {
      const g = sideToPlayer(from, to, it.giver);
      const r = g === from ? to : from;
      state.players[g].resources[it.resource] -= it.amount;
      state.players[r].resources[it.resource] += it.amount;
    } else if (it.kind === 'tile') {
      const g = sideToPlayer(from, to, it.giver);
      transferTile(state, it.tile, g === from ? to : from);
    }
  }
  refreshStraits(state, events);
  for (const it of offer.items) {
    if (it.kind === 'alliance') {
      const rel = mutRelation(state, from, to);
      rel.allied = true;
      rel.allianceBrokenAtTurn = null;
      events.push({ type: 'alliance_formed', a: from, b: to });
    } else if (it.kind === 'peace') {
      const rel = mutRelation(state, from, to);
      const until = state.round + it.rounds;
      rel.peaceUntilRound = atPeace(state, from, to) ? Math.max(rel.peaceUntilRound ?? 0, until) : until;
      events.push({ type: 'peace_made', a: from, b: to, untilRound: rel.peaceUntilRound });
    } else if (it.kind === 'strait') {
      const g = sideToPlayer(from, to, it.giver);
      const grantee = g === from ? to : from;
      const st = state.straits[it.straitId];
      if (st.controller === g) st.policies[grantee] = { allow: true, toll: it.toll };
    }
  }
}
