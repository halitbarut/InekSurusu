import { writeFileSync } from 'node:fs';
import { buildMap, draftFromRows as draftFromRowsSafe } from '../../src/engine';
import { anadolu } from './anadolu';
import { archipelago, bigContinent, twinContinents } from './others';
import { report } from './sketch';

/**
 * Hazır haritaları üretir ve src/maps/builtin.ts dosyasına harita editörünün metin biçiminde yazar.
 * Çalıştırma: npx tsx scripts/maps/build.ts
 */
const defs = [
  {
    id: 'hazir-anadolu',
    name: 'Anadolu ve Balkanlar',
    players: [5, 7],
    description: 'Karadeniz, Marmara, Ege ve Akdeniz. İstanbul, Çanakkale ve Kerç boğazları; Ege adaları, Girit, Kıbrıs, Tuz Gölü ve Van Gölü.',
    sketch: anadolu,
  },
  {
    id: 'hazir-takimadalar',
    name: 'Takımadalar',
    players: [3, 4],
    description: 'Her devlete bir ev adası; adada gemi için demir ve petrol var, altın ve çelik ortadaki lagünlü atolde ve orta adalarda. Gemisiz büyüyemezsin.',
    sketch: archipelago,
  },
  {
    id: 'hazir-buyuk-kita',
    name: 'Büyük kıta',
    players: [8, 8],
    description: 'Sekiz devletlik geniş bir kara. Güneyde boğazla okyanusa açılan iç deniz, doğuda kapalı bir iç deniz, kuzeyde boğazlı bir koy ve beş göl.',
    sketch: bigContinent,
  },
  {
    id: 'hazir-ikiz-kitalar',
    name: 'İkiz kıtalar',
    players: [4, 6],
    description: 'İki kıta arasındaki kanal kuzey ve güney okyanuslarını iki dar boğazla bağlar. Boğazı tutan, gemilerin yolunu tutar.',
    sketch: twinContinents,
  },
] as const;

const out = defs.map((d) => {
  const sk = d.sketch();
  report(d.name, buildMap(sk.d, d.name));
  return { id: d.id, name: d.name, players: d.players, description: d.description, rows: sk.rows() };
});

const body = out
  .map(
    (m) => `  {
    id: ${JSON.stringify(m.id)},
    name: ${JSON.stringify(m.name)},
    players: [${m.players[0]}, ${m.players[1]}],
    description: ${JSON.stringify(m.description)},
    rows: [
${m.rows.map((r) => `      ${JSON.stringify(r)},`).join('\n')}
    ],
  },`,
  )
  .join('\n');

writeFileSync(
  new URL('../../src/maps/builtin.ts', import.meta.url),
  `// Bu dosya scripts/maps/build.ts ile üretilir; haritayı değiştirmek için oradaki şekilleri düzenleyip yeniden çalıştır.

/** Oyunla birlikte gelen hazır harita (harita editörünün metin biçiminde) */
export interface BuiltinMap {
  id: string;
  name: string;
  /** Önerilen oyuncu sayısı [en az, en çok] */
  players: [number, number];
  description: string;
  /** \`.\` su, \`#\` kara, \`G/O/I/S\` altın/petrol/demir/çelik madeni */
  rows: string[];
}

export const BUILTIN_MAPS: readonly BuiltinMap[] = [
${body}
];

export function findBuiltinMap(id: string | null | undefined): BuiltinMap | null {
  return BUILTIN_MAPS.find((m) => m.id === id) ?? null;
}
`,
);
console.log('\nsrc/maps/builtin.ts yazıldı');

// Öğretici haritası
import('./tutorial').then(({ tutorialMap }) => {
  const rows = tutorialMap().rows();
  report('Öğretici', buildMap(draftFromRowsSafe(rows), 'Öğretici'));
  writeFileSync(
    new URL('../../src/tutorial/map.ts', import.meta.url),
    `// Bu dosya scripts/maps/build.ts ile üretilir (scripts/maps/tutorial.ts).

/** Öğretici haritası: harita editörünün metin biçiminde */
export const TUTORIAL_ROWS: readonly string[] = [
${rows.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
];
`,
  );
  console.log('src/tutorial/map.ts yazıldı');
});
