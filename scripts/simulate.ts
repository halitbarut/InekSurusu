/**
 * Denge simülasyonu: arayüz olmadan kural motoru ve botlarla çok sayıda oyun oynatır,
 * sonuçları docs/BALANCE_REPORT.md dosyasına tablolar hâlinde yazar.
 *
 *   npm run simulate                      # 1. tur: A, B, C, D, RA, RB (150'şer oyun)
 *   npm run simulate -- --round 2         # 2. tur: B2, RB2 ve karşılaştırma için 1. tur ayarlarıyla B, RB (100'er oyun)
 *   npm run simulate -- --round 3         # 3. tur: B3, RB3 ve karşılaştırma için B, RB, B2, RB2 (100'er oyun)
 *   npm run simulate -- --games 20        # hızlı deneme
 *   npm run simulate -- --scenarios B,C   # yalnızca seçilen senaryolar
 *   npm run simulate -- --round 3 --scenarios RB,RB2 --reuse   # yalnızca seçilenleri oynat, diğerlerini önbellekten al
 *
 * Her çalıştırmada senaryo sonuçları scripts/.sim-cache/ altına yazılır (git'e girmez).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import type { BotTuning } from '../src/bot';
import { DEFAULT_CONFIG, type GameConfig } from '../src/engine';
import { playGame, SNAPSHOT_ROUNDS, type GameMetrics, type GameSpec, type SpendKey } from './sim/game';

interface Scenario {
  id: string;
  title: string;
  config: Partial<GameConfig>;
  rusher: boolean;
  /** Orta seviye botların ayarları */
  tuning?: Partial<BotTuning>;
  /** Harita boyutu (verilmezse varsayılan) */
  size?: { width: number; height: number };
}

/** 3. turdan önceki harita: 5 oyuncuda 50×36, madenler eski rastgele düzende */
const OLD_MAP: Partial<GameConfig> = { mineLayout: 'random' };
const OLD_SIZE = { width: 50, height: 36 };
/** 3. turdan önceki botun bakım politikası */
const OLD_UPKEEP_TUNING: Partial<BotTuning> = { maxUpkeepShare: 0.5, upkeepCap: 0.7, upkeepExcessShare: 0.8 };

/** 1. turdaki varsayılan değerler ve bot temkini (sonuçlar yeniden üretilebilsin diye sabit) */
const ROUND1_CONFIG: Partial<GameConfig> = {
  ...OLD_MAP,
  landBattleAkce: 100,
  baseBattleAkce: 400,
  baseBattleIron: 2,
  capitalBattleAkce: 1000,
  capitalBattleIron: 3,
  capitalBattleSteel: 3,
  shipUpkeep: 100,
  planeUpkeep: 100,
  baseUpkeep: 100,
};
const ROUND1_TUNING: Partial<BotTuning> = { ...OLD_UPKEEP_TUNING, capitalCostCushion: 1.5, capitalReserveUpkeep: false, capitalWeakRatio: 0.75 };
/** 2. turdaki varsayılanlar */
const ROUND2_CONFIG: Partial<GameConfig> = {
  ...OLD_MAP,
  landBattleAkce: 100,
  baseBattleAkce: 200,
  baseBattleIron: 1,
  capitalBattleAkce: 600,
  capitalBattleIron: 2,
  capitalBattleSteel: 2,
  shipUpkeep: 50,
  planeUpkeep: 50,
  baseUpkeep: 0,
};
const ROUND2_TUNING: Partial<BotTuning> = { ...OLD_UPKEEP_TUNING, capitalCostCushion: 1, capitalReserveUpkeep: true, capitalWeakRatio: 1 };
const LEGACY: Partial<GameConfig> = { ...ROUND1_CONFIG, battleCostsEnabled: false, upkeepEnabled: false };

const SCENARIOS: Scenario[] = [
  { id: 'A', title: 'Eski kurallar (savaş masrafı ve bakım yok)', config: LEGACY, tuning: ROUND1_TUNING, size: OLD_SIZE, rusher: false },
  { id: 'B', title: '1. tur varsayılanları (savaş 100 · üs 400+2 demir · başkent 1000+3+3 · bakım 100/100/100) ve temkinli bot', config: ROUND1_CONFIG, tuning: ROUND1_TUNING, size: OLD_SIZE, rusher: false },
  { id: 'C', title: 'B + zayıflık şartı', config: { ...ROUND1_CONFIG, weaknessRule: true }, tuning: ROUND1_TUNING, size: OLD_SIZE, rusher: false },
  { id: 'D', title: `B + açılış barışı (${DEFAULT_CONFIG.openingPeaceRounds} tur)`, config: { ...ROUND1_CONFIG, openingPeace: true }, tuning: ROUND1_TUNING, size: OLD_SIZE, rusher: false },
  { id: 'RA', title: 'A + 1 acele eden bot', config: LEGACY, tuning: ROUND1_TUNING, size: OLD_SIZE, rusher: true },
  { id: 'RB', title: 'B + 1 acele eden bot', config: ROUND1_CONFIG, tuning: ROUND1_TUNING, size: OLD_SIZE, rusher: true },
  { id: 'B2', title: '2. tur varsayılanları (savaş 100 · üs 200+1 demir · başkent 600+2+2 · bakım 50/50/0) ve gevşetilmiş bot', config: ROUND2_CONFIG, tuning: ROUND2_TUNING, size: OLD_SIZE, rusher: false },
  { id: 'RB2', title: 'B2 + 1 acele eden bot', config: ROUND2_CONFIG, tuning: ROUND2_TUNING, size: OLD_SIZE, rusher: true },
  {
    id: 'B3',
    title: '3. tur varsayılanları (başkent 600+2 demir, çelik yok · dengeli madenler · 44×32 harita · bot bakım payı 0,3 / tavan 0,45)',
    config: {},
    rusher: false,
  },
  { id: 'RB3', title: 'B3 + 1 acele eden bot', config: {}, rusher: true },
];

const ROUNDS: Record<string, { scenarios: string[]; games: number }> = {
  '1': { scenarios: ['A', 'B', 'C', 'D', 'RA', 'RB'], games: 150 },
  '2': { scenarios: ['B', 'RB', 'B2', 'RB2'], games: 100 },
  '3': { scenarios: ['B', 'RB', 'B2', 'RB2', 'B3', 'RB3'], games: 100 },
};

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
  const round = arg('round') ?? '1';
  if (!ROUNDS[round]) throw new Error(`Bilinmeyen tur: ${round}`);
  const games = Number(arg('games') ?? ROUNDS[round].games);
  const players = Number(arg('players') ?? 5);
  const maxRounds = Number(arg('max-rounds') ?? 300);
  const workers = Number(arg('workers') ?? Math.max(1, availableParallelism() - 1));
  const wanted = arg('scenarios')?.split(',') ?? ROUNDS[round].scenarios;
  const reuse = process.argv.includes('--reuse');
  const cacheDir = resolve('scripts/.sim-cache');
  const cacheFile = (id: string) => resolve(cacheDir, `${id}-${games}g-${players}p-${maxRounds}r.json`);
  const out = resolve(arg('out') ?? 'docs/BALANCE_REPORT.md');
  const scenarios = wanted.map((id) => SCENARIOS.find((s) => s.id === id)!).filter(Boolean);
  // --reuse: turun diğer senaryoları önbellekten (aynı oyun/oyuncu/tur sınırıyla) gelir
  const cached = reuse ? ROUNDS[round].scenarios.filter((id) => !wanted.includes(id)) : [];
  for (const id of cached) if (!existsSync(cacheFile(id))) throw new Error(`Önbellekte yok: ${id} (önce bu senaryoyu çalıştır)`);

  const jobs: { scenario: string; spec: GameSpec }[] = [];
  for (const sc of scenarios) {
    for (let g = 0; g < games; g++) {
      // Aynı seed'ler tüm senaryolarda kullanılır: haritalar aynı, yalnızca kurallar farklı
      const seed = 10_000 + g;
      jobs.push({ scenario: sc.id, spec: { seed, players, maxRounds, config: sc.config, tuning: sc.tuning, size: sc.size, rusherSeat: sc.rusher ? g % players : null } });
    }
  }
  const results = new Map<string, GameMetrics[]>(scenarios.map((s) => [s.id, []]));
  for (const id of cached) results.set(id, JSON.parse(readFileSync(cacheFile(id), 'utf8')));
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
  mkdirSync(cacheDir, { recursive: true });
  for (const sc of scenarios) writeFileSync(cacheFile(sc.id), JSON.stringify(results.get(sc.id)!.sort((a, b) => a.seed - b.seed)));
  // Rapor senaryoları turun sırasıyla görsün
  const all = ROUNDS[round].scenarios.filter((id) => results.has(id)).map((id) => SCENARIOS.find((s) => s.id === id)!);

  const opt = { games, players, maxRounds };
  const shown = reuse ? all : scenarios;
  if (round === '1') writeReport(out, buildReport(shown, results, opt));
  else if (round === '2') writeSection(out, 'tur2', buildRound2(shown, results, opt));
  else writeSection(out, 'tur3', buildRound3(shown, results, opt));
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

type Opt = { games: number; players: number; maxRounds: number };

function buildReport(scenarios: Scenario[], results: Map<string, GameMetrics[]>, opt: Opt): string {
  const L: string[] = [];
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
  return [...L, ...tables(scenarios, results, opt, '##')].join('\n');
}

/** Senaryo tabloları; H başlık düzeyi ('##' ya da '###') */
function tables(scenarios: Scenario[], results: Map<string, GameMetrics[]>, opt: Opt, H: string): string[] {
  const L: string[] = [];
  const main = scenarios.filter((s) => !s.rusher);
  const rush = scenarios.filter((s) => s.rusher);
  L.push(`${H} İlk başkentin düştüğü tur`);
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

  L.push(`${H} Oyun süresi ve kazanma türü`);
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

  L.push(`${H} Kaynak stokları`);
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

  L.push(`${H} Harcamaların dağılımı`);
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
  const withUpkeep = main.filter((s) => results.get(s.id)!.some((m) => m.spend.upkeep > 0));
  if (withUpkeep.length) {
    L.push('Bakımın kalemlere göre dökümü (bakım harcamasının içindeki pay ve oyun başına akçe):');
    L.push('');
    L.push('| Senaryo | Gemi | Uçak | Askeri üs | Bakım / tüm harcama |');
    L.push('|---|---|---|---|---|');
    for (const s of withUpkeep) {
      const ms = results.get(s.id)!;
      const by = (k: 'ship' | 'plane' | 'base') => ms.reduce((a, m) => a + m.upkeepBy[k], 0);
      const up = by('ship') + by('plane') + by('base');
      const tot = keys.reduce((a, k) => a + ms.reduce((b, m) => b + m.spend[k], 0), 0);
      const cell = (k: 'ship' | 'plane' | 'base') => `${pct(by(k) / up, 0)} (${f(by(k) / ms.length)})`;
      L.push(`| ${s.id} | ${cell('ship')} | ${cell('plane')} | ${cell('base')} | ${pct(up / tot, 1)} |`);
    }
    L.push('');
  }

  L.push(`${H} Savaşlar`);
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
    L.push(`${H} Acele eden bot testi`);
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
  return L;
}

// ------------------------------------------------------------------
// 2. tur bölümü
// ------------------------------------------------------------------

interface Summary {
  firstFallMedian: number;
  neverFell: number;
  limitShare: number;
  endMedian: number;
  upkeepShare: number;
  spendIncome: number;
  akce100: number;
  battlesPerGame: number;
  capitalPerGame: number;
  baseShare: number;
  rusherShare: number;
  rusherHi: number;
}

function summarize(ms: GameMetrics[], rush: GameMetrics[] | undefined): Summary {
  const keys = Object.keys(SPEND_NAMES) as SpendKey[];
  const tot = keys.reduce((a, k) => a + ms.reduce((b, m) => b + m.spend[k], 0), 0);
  const income = ms.reduce((a, m) => a + m.income, 0);
  const falls = ms.map((m) => m.firstCapitalFall).filter((x): x is number => x !== null);
  const sum = (k: keyof GameMetrics['battles']) => ms.reduce((a, m) => a + m.battles[k], 0);
  const battles = sum('land') + sum('base') + sum('capital');
  let share = 0;
  for (const m of rush ?? []) if (m.rusherSeat !== null && m.winners.includes(m.rusherSeat)) share += 1 / m.winners.length;
  const n = rush?.length ?? 0;
  return {
    // Hiç düşmeyen oyunlar medyana tur sınırı olarak katılır (iyimser tahmin olmasın)
    firstFallMedian: quantile(ms.map((m) => m.firstCapitalFall ?? Infinity).map((x) => (x === Infinity ? 999 : x)), 0.5),
    neverFell: (ms.length - falls.length) / ms.length,
    limitShare: ms.filter((m) => m.hitLimit).length / ms.length,
    endMedian: quantile(ms.filter((m) => !m.hitLimit).map((m) => m.endRound), 0.5),
    upkeepShare: ms.reduce((a, m) => a + m.spend.upkeep, 0) / tot,
    spendIncome: tot / income,
    akce100: mean(ms.map((m) => m.akceAt[100]).filter((x) => x !== undefined)),
    battlesPerGame: battles / ms.length,
    capitalPerGame: sum('capital') / ms.length,
    baseShare: sum('base') / battles,
    rusherShare: n ? share / n : NaN,
    rusherHi: n ? wilson(Math.round(share), n)[1] : NaN,
  };
}

function buildRound2(scenarios: Scenario[], results: Map<string, GameMetrics[]>, opt: Opt): string {
  const L: string[] = [];
  const get = (id: string) => results.get(id);
  L.push('## 2. tur');
  L.push('');
  L.push(
    `\`npm run simulate -- --round 2\` ile üretilir (son çalıştırma: ${new Date().toISOString().slice(0, 10)}). ` +
      `Her senaryo için ${opt.games} oyun, ${opt.players} oyuncu, ${opt.maxRounds} tur sınırı, seed'ler 10000–${10_000 + opt.games - 1}. ` +
      'Karşılaştırmanın aynı haritalarda yapılması için 1. turun ayarları (B, RB) da bu seed\'lerde yeniden oynatıldı; ' +
      'yukarıdaki 1. tur tabloları 150 oyunluk asıl çalıştırmadır.',
  );
  L.push('');
  L.push('| Senaryo | Açıklama |');
  L.push('|---|---|');
  for (const s of scenarios) L.push(`| ${s.id} | ${s.title} |`);
  L.push('');
  L.push('Gevşetilmiş bot: başkent savaşına masraf + bir sonraki turun bakımı yetiyorsa ve hedefin toprağı kendisininkinden fazla değilse girer (1. turda: masrafın 1,5 katı ve hedef %75\'ten küçük).');
  L.push('');
  const b1 = get('B') && summarize(get('B')!, get('RB'));
  const b2 = get('B2') && summarize(get('B2')!, get('RB2'));
  if (b1 && b2) {
    L.push('### Karşılaştırma ve hedefler');
    L.push('');
    const ok = (v: boolean) => (v ? '✔' : '✘');
    const rows: [string, (x: Summary) => string, string, (x: Summary) => boolean | null][] = [
      ['Acele eden botun kazanma payı (%95 üst sınır)', (x) => `${pct(x.rusherShare)} (${pct(x.rusherHi, 0)})`, '< %24', (x) => x.rusherShare < 0.24],
      ['İlk başkent fethi, medyan tur', (x) => f(x.firstFallMedian === 999 ? NaN : x.firstFallMedian), '20–40', (x) => x.firstFallMedian >= 20 && x.firstFallMedian <= 40],
      ['Hiç başkent düşmeyen oyun', (x) => pct(x.neverFell, 0), '—', () => null],
      ['Tur sınırına takılan oyun', (x) => pct(x.limitShare, 0), '< %10', (x) => x.limitShare < 0.1],
      ['Bakım / tüm harcama', (x) => pct(x.upkeepShare, 0), '< %50', (x) => x.upkeepShare < 0.5],
      ['Harcama / gelir', (x) => pct(x.spendIncome, 0), '—', () => null],
      ['Ortalama akçe stoku, tur 100', (x) => f(x.akce100), '—', () => null],
      ['Biten oyunların bitiş turu, medyan', (x) => f(x.endMedian), '—', () => null],
      ['Oyun başına savaş', (x) => f(x.battlesPerGame, 0), '—', () => null],
      ['Oyun başına başkent savaşı', (x) => f(x.capitalPerGame, 1), '—', () => null],
      ['Üs savaşlarının payı', (x) => pct(x.baseShare, 1), '—', () => null],
    ];
    L.push('| Ölçüt | 1. tur ayarları (B / RB) | 2. tur (B2 / RB2) | Hedef | 2. turda tuttu mu |');
    L.push('|---|---|---|---|---|');
    for (const [name, fmt, target, check] of rows) {
      const c = check(b2);
      L.push(`| ${name} | ${fmt(b1)} | ${fmt(b2)} | ${target} | ${c === null ? '' : ok(c)} |`);
    }
    L.push('');
    L.push('İlk başkent fethi medyanında hiç başkent düşmeyen oyunlar tur sınırı olarak sayıldı; bu yüzden medyan "—" ise oyunların yarısından çoğunda hiç başkent düşmemiştir.');
    L.push('');
  }
  L.push(...tables(scenarios, results, opt, '###'));
  return L.join('\n');
}

function median(xs: (number | null)[]): number {
  return quantile(xs.filter((x): x is number => x !== null), 0.5);
}

function buildRound3(scenarios: Scenario[], results: Map<string, GameMetrics[]>, opt: Opt): string {
  const L: string[] = [];
  const get = (id: string) => results.get(id);
  L.push('## 3. tur');
  L.push('');
  L.push(
    `\`npm run simulate -- --round 3\` ile üretilir (son çalıştırma: ${new Date().toISOString().slice(0, 10)}). ` +
      `Her senaryo için ${opt.games} oyun, ${opt.players} oyuncu, ${opt.maxRounds} tur sınırı, seed'ler 10000–${10_000 + opt.games - 1}. ` +
      '1. ve 2. turun ayarları da (eski 50×36 harita ve eski rastgele maden düzeniyle) aynı seed\'lerde yeniden oynatıldı; üç tur aynı koşullarda karşılaştırılıyor.',
  );
  L.push('');
  L.push('| Senaryo | Açıklama |');
  L.push('|---|---|');
  for (const s of scenarios) L.push(`| ${s.id} | ${s.title} |`);
  L.push('');
  const rounds = [
    ['1. tur', 'B', 'RB'],
    ['2. tur', 'B2', 'RB2'],
    ['3. tur', 'B3', 'RB3'],
  ].filter(([, b, r]) => get(b) && get(r)) as [string, string, string][];
  const sums = rounds.map(([name, b, r]) => [name, summarize(get(b)!, get(r)), get(b)!] as const);
  if (sums.length) {
    const last = sums[sums.length - 1][1];
    L.push('### Karşılaştırma ve hedefler');
    L.push('');
    const ok = (v: boolean) => (v ? '✔' : '✘');
    const rows: [string, (x: Summary) => string, string, ((x: Summary) => boolean) | null][] = [
      ['Acele eden botun kazanma payı (%95 üst sınır)', (x) => `${pct(x.rusherShare)} (${pct(x.rusherHi, 0)})`, '< %24', (x) => x.rusherShare < 0.24],
      ['İlk başkent fethi, medyan tur', (x) => f(x.firstFallMedian === 999 ? NaN : x.firstFallMedian), '30–60', (x) => x.firstFallMedian >= 30 && x.firstFallMedian <= 60],
      ['Hiç başkent düşmeyen oyun', (x) => pct(x.neverFell, 0), '', null],
      ['Tur sınırına takılan oyun', (x) => pct(x.limitShare, 0), '< %10', (x) => x.limitShare < 0.1],
      ['Bakım / tüm harcama', (x) => pct(x.upkeepShare, 0), '< %50', (x) => x.upkeepShare < 0.5],
      ['Harcama / gelir', (x) => pct(x.spendIncome, 0), '', null],
      ['Ortalama akçe stoku, tur 100', (x) => f(x.akce100), '', null],
      ['Biten oyunların bitiş turu, medyan', (x) => f(x.endMedian), '', null],
      ['Oyun başına savaş', (x) => f(x.battlesPerGame, 0), '', null],
      ['Oyun başına başkent savaşı', (x) => f(x.capitalPerGame, 1), '', null],
    ];
    L.push(`| Ölçüt | ${sums.map(([n]) => n).join(' | ')} | Hedef | Son turda tuttu mu |`);
    L.push(`|---|${sums.map(() => '---').join('|')}|---|---|`);
    for (const [name, fmt, target, check] of rows) {
      L.push(`| ${name} | ${sums.map(([, x]) => fmt(x)).join(' | ')} | ${target || '—'} | ${check ? ok(check(last)) : ''} |`);
    }
    L.push('');
    L.push('Tur kolonlarındaki acele eden pay RB/RB2/RB3, diğer satırlar B/B2/B3 senaryolarından. İlk başkent fethi medyanında hiç başkent düşmeyen oyunlar tur sınırı olarak sayıldı.');
    L.push('');
    L.push('### Darboğaz ölçümü');
    L.push('');
    L.push('Normal botlu senaryolarda, oyun başına bir olayın ilk görüldüğü turun medyanı (parantez içinde olayın görüldüğü oyun sayısı).');
    L.push('');
    const mile = (ms: GameMetrics[], k: keyof GameMetrics['milestones']) => {
      const xs = ms.map((m) => m.milestones[k]);
      return `${f(median(xs))} (${xs.filter((x) => x !== null).length})`;
    };
    const fall = (ms: GameMetrics[]) => `${f(median(ms.map((m) => m.firstCapitalFall)))} (${ms.filter((m) => m.firstCapitalFall !== null).length})`;
    const share = (ms: GameMetrics[], k: 'noIronAt60' | 'noSteelAt60') => {
      const xs = ms.map((m) => m[k]).filter((x): x is number => x !== null);
      return `${pct(mean(xs), 0)} (${xs.length})`;
    };
    L.push(`| Ölçüm | ${sums.map(([n]) => n).join(' | ')} |`);
    L.push(`|---|${sums.map(() => '---').join('|')}|`);
    const lines: [string, (ms: GameMetrics[]) => string][] = [
      ['Bir oyuncu rakip başkentine komşu oluyor', (ms) => mile(ms, 'adjCapital')],
      ['Bir oyuncu başkent savaşı masrafını karşılayabiliyor', (ms) => mile(ms, 'afford')],
      ['Komşuluk ve masraf aynı oyuncuda', (ms) => mile(ms, 'adjAndAfford')],
      ['İlk başkent savaşı', (ms) => mile(ms, 'firstCapitalBattle')],
      ['İlk başkent fethi (yalnızca düşen oyunlar)', fall],
      ['60. turda demiri olmayan oyuncu oranı', (ms) => share(ms, 'noIronAt60')],
      ['60. turda çeliği olmayan oyuncu oranı', (ms) => share(ms, 'noSteelAt60')],
    ];
    for (const [name, fn] of lines) L.push(`| ${name} | ${sums.map(([, , ms]) => fn(ms)).join(' | ')} |`);
    L.push('');
    L.push('Masraf her turun kendi başkent savaşı değerleriyle ölçüldü (1. tur 1000+3+3, 2. tur 600+2+2, 3. tur 600+2 demir).');
    L.push('');
  }
  L.push(...tables(scenarios.filter((s) => s.id === 'B3' || s.id === 'RB3'), results, opt, '###'));
  return L.join('\n');
}

const MARKER = '<!-- öneriler: bu satırın altı simülasyon tarafından değiştirilmez -->';

/**
 * Rapora adlandırılmış bir bölüm yazar: işaretler arasındaki kısım değiştirilir, yoksa dosyanın sonuna eklenir.
 * Bölümün altına elle yazılan değerlendirme (kapanış işaretinden sonrası) korunur.
 */
function writeSection(path: string, name: string, generated: string) {
  const open = `<!-- bölüm:${name} — bu işaretle kapanış işareti arası simülasyon tarafından yazılır -->`;
  const close = `<!-- /bölüm:${name} -->`;
  const block = `${open}\n\n${generated}\n${close}`;
  const old = existsSync(path) ? readFileSync(path, 'utf8') : '# Denge raporu\n';
  const i = old.indexOf(open);
  const j = old.indexOf(close);
  const title = name.replace('tur', '') + '. tur';
  const next =
    i >= 0 && j > i ? old.slice(0, i) + block + old.slice(j + close.length) : `${old.trimEnd()}\n\n${block}\n\n### Değerlendirme ve öneriler (${title})\n\n_Henüz yazılmadı._\n`;
  writeFileSync(path, next);
}

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

