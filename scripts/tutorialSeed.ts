import { runTutorialScript } from '../src/tutorial/steps';
import { tutorialState } from '../src/tutorial/scenario';

/**
 * Öğreticinin sabit RNG durumunu arar: 2. turdaki savaş kaybedilmeli (karşı saldırı), 3. turdaki savaşta en az 2
 * toprak alınmalı, 4. turdaki başkent savaşı kazanılmalı ve öğretici baştan sona hatasız oynanmalı.
 * Çalıştırma: npx tsx scripts/tutorialSeed.ts  → bulunan değer src/tutorial/scenario.ts içindeki TUTORIAL_RNG'ye yazılır.
 */
for (let rng = 1; rng < 2_000_000; rng++) {
  const s = tutorialState();
  s.rngState = rng;
  const r = runTutorialScript(s);
  if (r.failedAt >= 0) continue;
  const battles = r.events.filter((e) => e.type === 'battle');
  if (battles.length !== 3) continue;
  const [lose, win, cap] = battles as Extract<(typeof battles)[number], { type: 'battle' }>[];
  if (!(lose.loss > 0 && lose.loss <= 2 && win.gain >= 2 && win.gain <= 3 && cap.success)) continue;
  const spins = r.events.filter((e) => e.type === 'spin' && e.player === 0).map((e) => (e as { value: number }).value);
  // İlk topaç çok düşük olmasın (yeni oyuncu için)
  if (spins[0] < 4) continue;
  console.log(`TUTORIAL_RNG = ${rng}`, { lose: lose.rounds, loss: lose.loss, win: win.rounds, gain: win.gain, capital: cap.rounds.length, spins });
  break;
}
