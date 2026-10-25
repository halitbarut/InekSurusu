import { describe, expect, it } from 'vitest';
import { BOT_LEVEL_NAME, getBot } from '../src/bot';
import { BOT_LEVELS, createGame, dispatch, validateAction, type GameState } from '../src/engine';
import { own, setCapital, testState } from './helpers';

/** Botlarla birkaç tur oynatır; her eylemin geçerli olduğunu ve botun durumu değiştirmediğini denetler. */
function playRounds(levels: (typeof BOT_LEVELS)[number][], rounds: number, seed: number): GameState {
  let s = createGame({
    players: levels.map((lv, i) => ({ name: `B${i}`, color: '#000', kind: 'bot' as const, botLevel: lv })),
    width: 35,
    height: 26,
    seed,
  });
  let guard = 0;
  while (s.phase.kind !== 'gameover' && s.round <= rounds && guard++ < 60_000) {
    const ph = s.phase;
    const p = ph.kind === 'vote' ? s.players.find((x) => x.alive && !(x.id in ph.votes))!.id : ph.kind === 'conquest' ? ph.taker : s.currentPlayer;
    const before = JSON.stringify(s);
    const a = getBot(s.players[p].botLevel).chooseAction(s, p);
    // Bot düşünürken durumu (RNG dahil) değiştirmez
    expect(JSON.stringify(s)).toBe(before);
    expect(validateAction(s, a)).toEqual({ ok: true });
    const r = dispatch(s, a);
    s = r.state;
    for (const e of r.events) {
      if (e.type !== 'offer_made') continue;
      const accept = getBot(s.players[e.offer.to].botLevel).evaluateOffer(s, e.offer.to, e.offer);
      s = dispatch(s, { type: 'RESPOND_OFFER', player: e.offer.to, offerId: e.offer.id, accept }).state;
    }
  }
  return s;
}

describe('bot seviyeleri', () => {
  it('üç seviye de var ve Türkçe adları tanımlı', () => {
    expect(BOT_LEVELS).toEqual(['easy', 'medium', 'hard']);
    expect(BOT_LEVELS.map((l) => BOT_LEVEL_NAME[l])).toEqual(['Kolay', 'Orta', 'Zor']);
  });

  it('karışık seviyeli botlar yalnızca geçerli eylem seçer ve oyunun RNG durumuna dokunmaz', () => {
    const s = playRounds(['easy', 'medium', 'hard', 'easy'], 25, 31337);
    expect(s.round).toBeGreaterThan(20);
  }, 60_000);

  it('aynı durumda aynı kararı verir (kolay botun rastgeleliği de tekrarlanabilir)', () => {
    const a = playRounds(['easy', 'easy', 'hard'], 8, 99);
    const b = playRounds(['easy', 'easy', 'hard'], 8, 99);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 60_000);

  it('kolay bot kendi aleyhine teklifleri kolayca kabul eder, zor bot madenini vermez', () => {
    const s = testState(['G#####', '######', '######'], 3);
    own(s, 0, [[0, 0], [1, 0], [0, 1]]);
    own(s, 1, [[4, 0], [5, 0]]);
    setCapital(s, 0, 0, 1);
    setCapital(s, 1, 5, 0);
    const mineTile = 0;
    const offer = { id: 1, from: 1, to: 0, items: [{ kind: 'tile' as const, giver: 'to' as const, tile: mineTile }], createdTurn: 1 };
    expect(getBot('hard').evaluateOffer(s, 0, offer)).toBe(false);
    expect(getBot('medium').evaluateOffer(s, 0, offer)).toBe(false);
    // Kolay bot ittifak ve barışı hep kabul eder
    expect(getBot('easy').evaluateOffer(s, 0, { ...offer, items: [{ kind: 'alliance' }] })).toBe(true);
  });
});
