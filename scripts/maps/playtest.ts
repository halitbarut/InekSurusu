import { getBot } from '../../src/bot';
import { DEFAULT_CONFIG, buildMap, createGameFromMap, dispatch, draftFromRows, type BotLevel, type GameState } from '../../src/engine';
import { BUILTIN_MAPS } from '../../src/maps/builtin';

/**
 * Hazır haritaları botlarla oynatır ve özet çıkarır (docs/MAPS.md'deki tablo).
 * Çalıştırma: npx tsx scripts/maps/playtest.ts [oyun sayısı, varsayılan 4]
 */
const GAMES = Number(process.argv[2] ?? 4);
const MAX_ROUNDS = 200;
const LEVELS: BotLevel[] = ['medium', 'hard', 'easy', 'medium', 'medium', 'hard', 'easy', 'medium'];

for (const m of BUILTIN_MAPS) {
  for (const players of [...new Set([m.players[0], m.players[1]])]) {
    const rows: string[] = [];
    for (let g = 0; g < GAMES; g++) {
      const map = buildMap(draftFromRows(m.rows), m.name);
      let s: GameState = createGameFromMap(
        map,
        Array.from({ length: players }, (_, i) => ({ name: `B${i}`, color: '#000', kind: 'bot' as const, botLevel: LEVELS[i] })),
        DEFAULT_CONFIG,
        1000 + g,
      );
      const st = { battles: 0, capitalFalls: 0, expeditions: 0, shipExp: 0, planeExp: 0, straitHeld: new Set<number>(), firstFall: 0 };
      let n = 0;
      while (s.phase.kind !== 'gameover' && s.round <= MAX_ROUNDS) {
        const ph = s.phase;
        const p = ph.kind === 'vote' ? s.players.find((pl) => pl.alive && !(pl.id in ph.votes))!.id : ph.kind === 'conquest' ? ph.taker : s.currentPlayer;
        const r = dispatch(s, getBot(s.players[p].botLevel).chooseAction(s, p));
        s = r.state;
        for (const e of r.events) {
          if (e.type === 'battle') st.battles++;
          if (e.type === 'eliminated') {
            st.capitalFalls++;
            if (!st.firstFall) st.firstFall = s.round;
          }
          if (e.type === 'expedition') e.unit === 'ship' ? st.shipExp++ : st.planeExp++;
          if (e.type === 'strait_control' && e.controller !== null) st.straitHeld.add(e.straitId);
          if (e.type === 'offer_made') {
            const to = s.players[e.offer.to];
            s = dispatch(s, { type: 'RESPOND_OFFER', player: to.id, offerId: e.offer.id, accept: getBot(to.botLevel).evaluateOffer(s, to.id, e.offer) }).state;
          }
        }
        if (++n > 200000) throw new Error('takıldı');
      }
      const end = s.phase.kind === 'gameover' ? `${s.round}. tur, ${s.winners!.length > 1 ? 'ittifak' : 'tek devlet'}` : `${MAX_ROUNDS} turda bitmedi`;
      rows.push(`${end} · ${st.battles} savaş · ${st.capitalFalls} başkent düştü (ilki ${st.firstFall || '—'}. tur) · ${st.shipExp} gemi / ${st.planeExp} uçak seferi · idare edilen boğaz ${st.straitHeld.size}/${map.straits.length}`);
    }
    console.log(`\n### ${m.name} — ${players} bot`);
    for (const r of rows) console.log(`- ${r}`);
  }
}
