import { describe, expect, it } from 'vitest';
import { getBot } from '../src/bot';
import { SPEND_KEYS, createGame, dispatch, snapshotPlayers, type GameState } from '../src/engine';

function play(rounds: number): { s: GameState; spent: number[]; battles: number } {
  let s = createGame({ players: ['A', 'B', 'C'].map((n) => ({ name: n, color: '#000', kind: 'bot' as const, botLevel: 'hard' as const })), width: 35, height: 26, seed: 2024 });
  const spent = [0, 0, 0];
  let battles = 0;
  while (s.phase.kind !== 'gameover' && s.round <= rounds) {
    const ph = s.phase;
    const p = ph.kind === 'vote' ? s.players.find((x) => x.alive && !(x.id in ph.votes))!.id : ph.kind === 'conquest' ? ph.taker : s.currentPlayer;
    const r = dispatch(s, getBot('hard').chooseAction(s, p));
    s = r.state;
    for (const e of r.events) {
      // Bağımsız sayım: akçe harcamaları
      if (e.type === 'claim') spent[e.player] += e.cost;
      if (e.type === 'upkeep') spent[e.player] += e.amount;
      if (e.type === 'battle') {
        spent[e.attacker] += e.cost.akce;
        battles++;
      }
      if (e.type === 'build') spent[e.player] += e.structure === 'shipyard' ? s.config.shipyardCost : e.structure === 'factory' ? s.config.factoryCost : s.config.baseCost;
      if (e.type === 'produce') spent[e.player] += e.unit === 'ship' ? s.config.shipAkceCost : s.config.planeAkceCost;
      if (e.type === 'expedition') spent[e.player] += e.tolls.reduce((a, t) => a + t.amount, 0);
      if (e.type === 'offer_made') s = dispatch(s, { type: 'RESPOND_OFFER', player: e.offer.to, offerId: e.offer.id, accept: false }).state;
    }
  }
  return { s, spent, battles };
}

describe('oyun istatistikleri', () => {
  it('her tur sonunda her oyuncunun durumu kaydedilir, harcamalar ve savaşlar toplanır', () => {
    const { s, spent, battles } = play(30);
    const st = s.stats!;
    const rounds = st.rounds.map((r) => r.round);
    // 0 (kurulum sonu) ve tamamlanan her tur, sırayla
    expect(rounds).toEqual(Array.from({ length: rounds.length }, (_, i) => i));
    expect(rounds.length).toBeGreaterThanOrEqual(Math.min(s.round, 30));
    for (const r of st.rounds) expect(r.players).toHaveLength(3);
    st.totals.forEach((t, p) => expect(SPEND_KEYS.reduce((a, k) => a + t.spend[k], 0)).toBe(spent[p]));
    const won = st.totals.reduce((a, t) => a + t.battlesWon, 0);
    const lost = st.totals.reduce((a, t) => a + t.battlesLost, 0);
    const tied = st.totals.reduce((a, t) => a + t.battlesTied, 0);
    expect(won).toBe(lost);
    expect(won + tied / 2).toBe(battles);
    for (const e of st.eliminations) expect(s.players[e.player].alive).toBe(false);
    if (s.phase.kind === 'gameover') expect(st.rounds[st.rounds.length - 1].players).toEqual(snapshotPlayers(s));
  }, 60_000);
});
