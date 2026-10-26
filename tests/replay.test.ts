import { describe, expect, it } from 'vitest';
import { getBot } from '../src/bot';
import {
  ReplayRecorder,
  createGame,
  dispatch,
  isUndoable,
  parseReplay,
  redactReplay,
  replayAll,
  type Action,
  type GameState,
} from '../src/engine';

/** Arayüzün yaptığı gibi: bot eylemleri ve teklif yanıtları kaydedilir, bazı eylemler geri alınır. */
function playRecorded(seed: number, maxRounds: number) {
  let s = createGame({
    players: Array.from({ length: 5 }, (_, i) => ({ name: `B${i}`, color: '#000', kind: 'bot' as const, botLevel: (['easy', 'medium', 'hard'] as const)[i % 3] })),
    width: 40,
    height: 30,
    seed,
  });
  const rec = ReplayRecorder.start(s);
  let undos = 0;
  let offers = 0;
  const apply = (a: Action) => {
    const r = dispatch(s, a);
    rec.record(a);
    return r;
  };
  for (let n = 0; s.phase.kind !== 'gameover' && s.round <= maxRounds; n++) {
    if (n > 20000) throw new Error('takıldı');
    const ph = s.phase;
    const p = ph.kind === 'vote' ? s.players.find((pl) => pl.alive && !(pl.id in ph.votes))!.id : ph.kind === 'conquest' ? ph.taker : s.currentPlayer;
    const bot = getBot(s.players[p].botLevel);
    const a = bot.chooseAction(s, p);
    // Arada bir geri alınabilir eylemi uygulayıp geri al: kayıttan da çıkmalı
    if (n % 17 === 0 && isUndoable(s, a)) {
      dispatch(s, a);
      rec.record(a);
      rec.pop();
      undos++;
    }
    const r = apply(a);
    s = r.state;
    // Bir arada bir oyuncu kopup bota geçer gibi
    if (n === 40) {
      s = structuredClone(s);
      s.players[1].kind = 'human';
      rec.record({ type: 'SET_PLAYER_KIND', player: 1, kind: 'human' });
      s = structuredClone(s);
      s.players[1].kind = 'bot';
      rec.record({ type: 'SET_PLAYER_KIND', player: 1, kind: 'bot' });
    }
    for (const e of r.events) {
      if (e.type !== 'offer_made') continue;
      offers++;
      const to = s.players[e.offer.to];
      s = apply({ type: 'RESPOND_OFFER', player: to.id, offerId: e.offer.id, accept: getBot(to.botLevel).evaluateOffer(s, to.id, e.offer) }).state;
    }
  }
  return { final: s, data: rec.data(), undos, offers };
}

describe('oyun tekrarı', () => {
  const { final, data, undos, offers } = playRecorded(77, 45);

  it('bot oyununu kayıttan birebir yeniden üretir (JSON dosyası üzerinden de)', () => {
    expect(undos).toBeGreaterThan(0);
    expect(data.partial).toBeUndefined();
    expect(data.initial.turnCounter).toBe(0);
    const again = replayAll(data);
    expect(JSON.stringify(again)).toBe(JSON.stringify(final));
    // İndirilen dosyadan okunan kayıt da aynı sonucu verir
    const loaded = parseReplay(JSON.stringify(data));
    expect(JSON.stringify(replayAll(loaded))).toBe(JSON.stringify(final));
  });

  it('paylaşılan kopyada kabul edilmemiş tekliflerin içeriği yoktur ama oyun yine aynı biter', () => {
    expect(offers).toBeGreaterThan(0);
    const red = redactReplay(data);
    expect(red.redacted).toBe(true);
    expect(red.steps.some((s) => s.type === 'HIDDEN_OFFER')).toBe(true);
    const r = replayAll(parseReplay(JSON.stringify(red)));
    // Harita, kaynaklar, ilişkiler ve istatistikler aynı
    expect(r.owner).toEqual(final.owner);
    expect(r.players).toEqual(final.players);
    expect(r.relations).toEqual(final.relations);
    expect(r.stats).toEqual(final.stats);
    expect(r.phase).toEqual(final.phase);
    // Kabul edilmemiş tekliflerin kalemleri dosyada yok
    const rejected = final.log.filter((l) => l.event.type === 'offer_response' && !l.event.accepted).length;
    if (rejected > 0) expect(JSON.stringify(red)).not.toBe(JSON.stringify(data));
  });

  it('bozuk dosyalar anlaşılır hatayla reddedilir', () => {
    expect(() => parseReplay('{')).toThrow('geçerli bir JSON değil');
    expect(() => parseReplay('{"app":"x"}')).toThrow('tekrar dosyası değil');
    const bad = { ...data, steps: [{ type: 'HİLE' }] };
    expect(() => parseReplay(JSON.stringify(bad))).toThrow('1. adım');
  });

  it('ortasından başlayan oyunda kayıt yarım işaretlenir', () => {
    const mid: GameState = final;
    expect(ReplayRecorder.start(mid).data().partial).toBe(true);
  });
});
