/**
 * Denge simülasyonu: arayüz olmadan kural motoru ve botlarla çok sayıda oyun oynatır,
 * sonuçları docs/BALANCE_REPORT.md dosyasına tablolar hâlinde yazar.
 *
 *   npm run simulate                      # tüm senaryolar, her biri 150 oyun
 *   npm run simulate -- --games 20        # hızlı deneme
 *   npm run simulate -- --scenarios B,C   # yalnızca seçilen senaryolar
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { DEFAULT_CONFIG, type GameConfig } from '../src/engine';
import { playGame, SNAPSHOT_ROUNDS, type GameMetrics, type GameSpec, type SpendKey } from './sim/game';

interface Scenario {
  id: string;
  title: string;
  config: Partial<GameConfig>;
  rusher: boolean;
}

const LEGACY: Partial<GameConfig> = { battleCostsEnabled: false, upkeepEnabled: false };

const SCENARIOS: Scenario[] = [
  { id: 'A', title: 'Eski kurallar (savaş masrafı ve bakım yok)', config: LEGACY, rusher: false },
  { id: 'B', title: 'Yeni varsayılan kurallar', config: {}, rusher: false },
  { id: 'C', title: 'B + zayıflık şartı', config: { weaknessRule: true }, rusher: false },
  { id: 'D', title: `B + açılış barışı (${DEFAULT_CONFIG.openingPeaceRounds} tur)`, config: { openingPeace: true }, rusher: false },
  { id: 'RA', title: 'A + 1 acele eden bot', config: LEGACY, rusher: true },
  { id: 'RB', title: 'B + 1 acele eden bot', config: {}, rusher: true },
];

// ------------------------------------------------------------------
// İşçi (worker) tarafı: verilen oyunları oynatıp sonuçları döner
// ------------------------------------------------------------------

if (!isMainThread) {
  parentPort!.on('message', (job: { scenario: string; spec: GameSpec } | null) => {
    if (job === null) process.exit(0);
    const metrics = playGame(job.spec);
    parentPort!.postMessage({ scenario: job.scenario, metrics });
  });
} else {
  void main();
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const games = Number(arg('games') ?? 150);
  const players = Number(arg('players') ?? 5);
  const maxRounds = Number(arg('max-rounds') ?? 300);
  const workers = Number(arg('workers') ?? Math.max(1, availableParallelism() - 1));
  const wanted = arg('scenarios')?.split(',') ?? SCENARIOS.map((s) => s.id);
  const out = resolve(arg('out') ?? 'docs/BALANCE_REPORT.md');
  const scenarios = SCENARIOS.filter((s) => wanted.includes(s.id));

  const jobs: { scenario: string; spec: GameSpec }[] = [];
  for (const sc of scenarios) {
    for (let g = 0; g < games; g++) {
      // Aynı seed'ler tüm senaryolarda kullanılır: haritalar aynı, yalnızca kurallar farklı
      const seed = 10_000 + g;
      jobs.push({ scenario: sc.id, spec: { seed, players, maxRounds, config: sc.config, rusherSeat: sc.rusher ? g % players : null } });
    }
  }
  const results = new Map<string, GameMetrics[]>(scenarios.map((s) => [s.id, []]));
  const t0 = Date.now();
  let done = 0;
  console.log(`${jobs.length} oyun, ${workers} işçi, ${players} oyuncu, tur sınırı ${maxRounds}`);

  await new Promise<void>((resolveAll) => {
    let next = 0;
    let alive = 0;
    const file = fileURLToPath(import.meta.url);
    for (let w = 0; w < Math.min(workers, jobs.length); w++) {
      const worker = new Worker(pathToFileURL(file), { execArgv: ['--import', 'tsx'] });
      alive++;
      const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
      worker.on('message', (r: { scenario: string; metrics: GameMetrics }) => {
        results.get(r.scenario)!.push(r.metrics);
        done++;
        if (done % 25 === 0 || done === jobs.length) {
          const el = (Date.now() - t0) / 1000;
          process.stdout.write(`\r${done}/${jobs.length} oyun · ${Math.round(el)} sn · kalan ~${Math.round((el / done) * (jobs.length - done))} sn   `);
        }
        feed();
      });
      worker.on('error', (e) => {
        console.error('\nİşçi hatası', e);
        process.exit(1);
      });
      worker.on('exit', () => {
        if (--alive === 0) resolveAll();
      });
      feed();
    }
  });
  console.log(`\nBitti (${Math.round((Date.now() - t0) / 1000)} sn).`);

  const report = buildReport(scenarios, results, { games, players, maxRounds });
  writeReport(out, report);
  console.log(`Rapor yazıldı: ${out}`);
}

// ------------------------------------------------------------------
// İstatistik
// ------------------------------------------------------------------

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function f(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function pct(n: number, digits = 1): string {
  return Number.isFinite(n) ? `%${f(n * 100, digits)}` : '—';
}

/** Wilson %95 güven aralığı */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [NaN, NaN];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

function stats(xs: number[]): string {
  return `${f(mean(xs), 1)} | ${f(quantile(xs, 0.5))} | ${f(quantile(xs, 0.1))}–${f(quantile(xs, 0.9))} | ${f(Math.min(...xs))}–${f(Math.max(...xs))}`;
}

const FALL_BUCKETS: [string, (r: number | null) => boolean][] = [
  ['≤ 14', (r) => r !== null && r <= 14],
  ['15–30', (r) => r !== null && r >= 15 && r <= 30],
  ['31–50', (r) => r !== null && r >= 31 && r <= 50],
  ['51–100', (r) => r !== null && r >= 51 && r <= 100],
  ['101–200', (r) => r !== null && r >= 101 && r <= 200],
  ['> 200', (r) => r !== null && r > 200],
  ['hiç düşmedi', (r) => r === null],
];

const END_BUCKETS: [string, (m: GameMetrics) => boolean][] = [
  ['≤ 50', (m) => !m.hitLimit && m.endRound <= 50],
  ['51–100', (m) => !m.hitLimit && m.endRound > 50 && m.endRound <= 100],
  ['101–200', (m) => !m.hitLimit && m.endRound > 100 && m.endRound <= 200],
  ['201–300', (m) => !m.hitLimit && m.endRound > 200],
  ['sınıra takıldı', (m) => m.hitLimit],
];

const SPEND_NAMES: Record<SpendKey, string> = {
  claim: 'Toprak',
  build: 'İnşa',
  produce: 'Üretim',
  battle: 'Savaş masrafı',
  upkeep: 'Bakım',
  toll: 'Boğaz vergisi',
};

function buildReport(scenarios: Scenario[], results: Map<string, GameMetrics[]>, opt: { games: number; players: number; maxRounds: number }): string {
  const L: string[] = [];
  const main = scenarios.filter((s) => !s.rusher);
  const rush = scenarios.filter((s) => s.rusher);
  L.push('# Denge raporu');
  L.push('');
  L.push(
    `Bu dosyanın üst kısmı \`npm run simulate\` ile üretilir (son çalıştırma: ${new Date().toISOString().slice(0, 10)}). ` +
      `Her senaryo için ${opt.games} oyun, ${opt.players} oyuncu (tamamı orta seviye bot; acele testlerinde 1 bot acele eden), ` +
      `${opt.maxRounds} tur sınırı. Seed'ler 10000–${10_000 + opt.games - 1}; tüm senaryolarda aynı haritalar kullanılır.`,
  );
  L.push('');
  L.push('| Senaryo | Açıklama |');
  L.push('|---|---|');
  for (const s of scenarios) L.push(`| ${s.id} | ${s.title} |`);
  L.push('');
  L.push('Tablolardaki dağılım sütunları: **ortalama | medyan | %10–%90 | en az–en çok**.');
  L.push('');

  L.push('## İlk başkentin düştüğü tur');
  L.push('');
  L.push('| Senaryo | Başkent düşen oyun | Ortalama | Medyan | %10–%90 | En az–en çok |');
  L.push('|---|---|---|---|---|---|');
  for (const s of main) {
    const ms = results.get(s.id)!;
    const xs = ms.map((m) => m.firstCapitalFall).filter((x): x is number => x !== null);
    L.push(`| ${s.id} | ${xs.length}/${ms.length} | ${stats(xs)} |`);
  }
  L.push('');
  L.push(`| Senaryo | ${FALL_BUCKETS.map((b) => b[0]).join(' | ')} |`);
  L.push(`|---|${FALL_BUCKETS.map(() => '---').join('|')}|`);
  for (const s of main) {
    const ms = results.get(s.id)!;
    L.push(`| ${s.id} | ${FALL_BUCKETS.map(([, fn]) => pct(ms.filter((m) => fn(m.firstCapitalFall)).length / ms.length, 0)).join(' | ')} |`);
  }
  L.push('');

  L.push('## Oyun süresi ve kazanma türü');
  L.push('');
  L.push('| Senaryo | Biten oyunların bitiş turu (ort. \\| medyan \\| %10–%90 \\| en az–en çok) | Tur sınırına takılan | Tek devlet | İttifak |');
  L.push('|---|---|---|---|---|');
  for (const s of main) {
    const ms = results.get(s.id)!;
    const ended = ms.filter((m) => !m.hitLimit).map((m) => m.endRound);
    const lim = ms.filter((m) => m.hitLimit).length;
    L.push(`| ${s.id} | ${stats(ended).replace(/\|/g, '\\|')} | ${lim} (${pct(lim / ms.length, 0)}) | ${ms.filter((m) => m.winType === 'single').length} | ${ms.filter((m) => m.winType === 'alliance').length} |`);
  }
  L.push('');
  L.push(`| Senaryo | ${END_BUCKETS.map((b) => b[0]).join(' | ')} |`);
  L.push(`|---|${END_BUCKETS.map(() => '---').join('|')}|`);
  for (const s of main) {
    const ms = results.get(s.id)!;
    L.push(`| ${s.id} | ${END_BUCKETS.map(([, fn]) => pct(ms.filter(fn).length / ms.length, 0)).join(' | ')} |`);
  }
  L.push('');
  const limitSeeds = main.map((s) => [s.id, results.get(s.id)!.filter((m) => m.hitLimit).map((m) => m.seed)] as const).filter(([, xs]) => xs.length);
  if (limitSeeds.length) {
    L.push('Tur sınırına takılan oyunların seed\'leri (tekrar oynatmak için):');
    L.push('');
    for (const [id, xs] of limitSeeds) L.push(`- **${id}:** ${xs.slice(0, 40).join(', ')}${xs.length > 40 ? ` … (+${xs.length - 40})` : ''}`);
    L.push('');
  }

  L.push('## Kaynak stokları');
  L.push('');
  L.push('Yaşayan oyuncu başına ortalama; parantez içinde o tura ulaşan oyun sayısı.');
  L.push('');
  L.push(`| Senaryo | ${SNAPSHOT_ROUNDS.map((r) => `Akçe, tur ${r}`).join(' | ')} | ${SNAPSHOT_ROUNDS.map((r) => `Maden kaynağı, tur ${r}`).join(' | ')} |`);
  L.push(`|---|${SNAPSHOT_ROUNDS.map(() => '---').join('|')}|${SNAPSHOT_ROUNDS.map(() => '---').join('|')}|`);
  for (const s of main) {
    const ms = results.get(s.id)!;
    const col = (key: 'akceAt' | 'minesAt', r: number) => {
      const xs = ms.map((m) => m[key][r]).filter((x) => x !== undefined);
      return `${f(mean(xs))} (${xs.length})`;
    };
    L.push(`| ${s.id} | ${SNAPSHOT_ROUNDS.map((r) => col('akceAt', r)).join(' | ')} | ${SNAPSHOT_ROUNDS.map((r) => col('minesAt', r)).join(' | ')} |`);
  }
  L.push('');
  L.push('Maden kaynağı = altın + petrol + demir + çelik toplamı.');
  L.push('');

  L.push('## Harcamaların dağılımı');
  L.push('');
  const keys = Object.keys(SPEND_NAMES) as SpendKey[];
  L.push(`| Senaryo | ${keys.map((k) => SPEND_NAMES[k]).join(' | ')} | Harcama / gelir |`);
  L.push(`|---|${keys.map(() => '---').join('|')}|---|`);
  for (const s of main) {
    const ms = results.get(s.id)!;
    const tot = keys.reduce((a, k) => a + ms.reduce((b, m) => b + m.spend[k], 0), 0);
    const income = ms.reduce((a, m) => a + m.income, 0);
    L.push(`| ${s.id} | ${keys.map((k) => pct(ms.reduce((b, m) => b + m.spend[k], 0) / tot, 1)).join(' | ')} | ${pct(tot / income, 0)} |`);
  }
  L.push('');
  L.push('Gelir = topaçtan ve altın bozdurmadan gelen akçe. Teklif yoluyla el değiştiren akçe harcama sayılmaz.');
  L.push('');

  L.push('## Savaşlar');
  L.push('');
  L.push('| Senaryo | Oyun başına savaş | Normal | Üs | Başkent | Başkent savaşı başarı oranı | Üs savaşı başarı oranı |');
  L.push('|---|---|---|---|---|---|---|');
  for (const s of main) {
    const ms = results.get(s.id)!;
    const sum = (k: keyof GameMetrics['battles']) => ms.reduce((a, m) => a + m.battles[k], 0);
    const total = sum('land') + sum('base') + sum('capital');
    L.push(
      `| ${s.id} | ${f(total / ms.length, 1)} | ${pct(sum('land') / total)} | ${pct(sum('base') / total)} | ${pct(sum('capital') / total)} | ${pct(sum('capitalWon') / sum('capital'))} (${sum('capitalWon')}/${sum('capital')}) | ${pct(sum('baseWon') / sum('base'))} |`,
    );
  }
  L.push('');
  L.push('Başkent savaşı için beklenen başarı oranı 1/8 = %12,5, üs savaşı için 1/4 = %25.');
  L.push('');

  if (rush.length) {
    L.push('## Acele eden bot testi');
    L.push('');
    L.push(
      `Her oyunda 1 bot en yakın rakip başkentine koşar (toprak alımını o yöne çevirir, savaşını hep o yönde kullanır, ` +
        `başkente komşu olur olmaz masrafı yetiyorsa başkent savaşına girer; hedefin gücüne bakmaz). Diğer ${opt.players - 1} bot orta seviyedir. ` +
        `Acele eden botun koltuğu oyundan oyuna döner. Adil pay: 1/${opt.players} = ${pct(1 / opt.players, 0)}.`,
    );
    L.push('');
    L.push('| Senaryo | Kazanma payı (ittifak zaferi paylaştırılır) | %95 güven aralığı | Tek başına kazandığı oyun | Oyunda ilk elenen o | Oyun başına eleyebildiği rakip | Elendiği oyun | Değerlendirme |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const s of rush) {
      const ms = results.get(s.id)!;
      let share = 0;
      let solo = 0;
      for (const m of ms) {
        if (m.rusherSeat === null || !m.winners.includes(m.rusherSeat)) continue;
        share += 1 / m.winners.length;
        if (m.winners.length === 1) solo++;
      }
      const rate = share / ms.length;
      const [lo, hi] = wilson(Math.round(share), ms.length);
      const verdict = lo > 1 / opt.players ? '**Başkente koşmak baskın strateji**' : hi < 1 / opt.players ? 'Başkente koşmak dezavantajlı' : 'Adil paydan belirgin farkı yok';
      const firstOut = ms.filter((m) => m.eliminations[0]?.player === m.rusherSeat).length;
      const kills = ms.reduce((a, m) => a + m.eliminations.filter((e) => e.by === m.rusherSeat).length, 0);
      const died = ms.filter((m) => m.eliminations.some((e) => e.player === m.rusherSeat)).length;
      L.push(`| ${s.id} | ${pct(rate)} | ${pct(lo)}–${pct(hi)} | ${solo}/${ms.length} | ${pct(firstOut / ms.length, 0)} | ${f(kills / ms.length, 2)} | ${pct(died / ms.length, 0)} | ${verdict} |`);
    }
    L.push('');
    L.push(
      '"Belirgin şekilde üstünde": %95 güven aralığının alt sınırı adil payın (%20) üstündeyse. Kazanma payında ittifak zaferleri kazananlar arasında eşit bölünür.',
    );
    L.push('');
  }
  return L.join('\n');
}

const MARKER = '<!-- öneriler: bu satırın altı simülasyon tarafından değiştirilmez -->';

/** Raporu yazar; dosyada elle yazılmış "Öneriler" bölümü varsa korunur. */
function writeReport(path: string, generated: string) {
  let manual = `${MARKER}\n\n## Öneriler\n\n_Henüz yazılmadı._\n`;
  if (existsSync(path)) {
    const old = readFileSync(path, 'utf8');
    const i = old.indexOf(MARKER);
    if (i >= 0) manual = old.slice(i);
  }
  writeFileSync(path, `${generated}\n${manual}`);
}

