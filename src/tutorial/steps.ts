import { TutorialBot } from '../bot/tutorial';
import { conquestCandidates, dispatch, isAllied, validateAction, type Action, type GameEvent, type GameState } from '../engine';
import { ME, T, ZEYNEP } from './scenario';

/**
 * Öğretici adımları. Her adımda kısa bir açıklama, haritada vurgulanan hedef(ler) ve oyuncunun yapması gereken
 * tek bir eylem vardır; doğru eylem yapılınca (ve gerekirse botlar oynayınca) sonraki adıma geçilir.
 */
export interface TutorialStep {
  /** Konu (1–11) */
  topic: number;
  title: string;
  text: string;
  /** Oyuncunun yapacağı eylem (kutuda kalın yazılır) */
  todo: string;
  /** Haritada vurgulanacak kareler */
  targets?: (s: GameState) => number[];
  /** Bu adımda bu eyleme izin var mı? */
  allow: (a: Action, s: GameState) => boolean;
  /** Adım tamamlandı mı? (her durum değişikliğinden sonra sorulur) */
  done: (s: GameState) => boolean;
  /** "Benim yerime yap" ve testler için: bu adımı ilerleten eylem */
  script: (s: GameState) => Action;
}

export const TOPICS = [
  'Topaç ve gelir',
  'Toprak alma',
  'Madenler ve altın bozdurma',
  'İnşa',
  'Üretim ve bakım',
  'Normal savaş',
  'Gemi ve uçak seferi',
  'Boğazlar',
  'Askeri üs ve başkent savaşı',
  'Diplomasi',
  'Kazanma koşulu',
];

const myTurn = (s: GameState, kind: string) => s.currentPlayer === ME && s.phase.kind === kind;
/** Bu turun başında (botlar oynadıktan sonra) sıra yine bende ve topaç bekleniyor */
const backToMe = (s: GameState) => myTurn(s, 'spin') && s.turnCounter > 1;
const spinStep = (topic: number, title: string, text: string): TutorialStep => ({
  topic,
  title,
  text,
  todo: "Topacı çevir: üstteki bantta 'Topacı çevir' ya da Boşluk tuşu.",
  allow: (a) => a.type === 'SPIN',
  done: (s) => myTurn(s, 'actions'),
  script: () => ({ type: 'SPIN', player: ME }),
});
const endTurnStep = (topic: number, title: string, text: string): TutorialStep => ({
  topic,
  title,
  text,
  todo: "Aşağıdaki 'Turu bitir'e bas.",
  allow: (a) => a.type === 'END_TURN',
  done: backToMe,
  script: () => ({ type: 'END_TURN', player: ME }),
});
const is = (a: Action, type: Action['type'], tile: number) => a.type === type && ('tile' in a ? a.tile : 'target' in a ? a.target : -1) === tile;
/** Fetihte sıradaki zorunlu kare (başkente giden yol) */
const nextPath = (s: GameState) => T.path.find((t) => s.owner[t] !== ME) ?? null;

export const STEPS: TutorialStep[] = [
  spinStep(
    1,
    'Topaç ve gelir',
    'Her tur önce madenlerin 1’er kaynak verir, varsa gemi ve uçak bakımı ödenir, sonra sekizgen topacı çevirirsin: çıkan sayı × 100 akçe. Normal oyunda önce herkes başkentini ve 9 başlangıç toprağını seçer; burada hazır. Mavi sensin; doğuda Mehmet, kuzeydoğu adasında Zeynep.',
  ),
  {
    topic: 2,
    title: 'Toprak alma',
    text: 'Toprağına komşu sahipsiz bir kareyi 100 akçeye alabilirsin. Haritada bir kareye tıklayınca orada yapabileceklerin ve bedelleri çıkar; yapamadıkların soluk ve nedeniyle görünür.',
    todo: "Vurgulanan kareye tıkla, menüden 'Toprak al'ı seç.",
    targets: () => [T.claim],
    allow: (a) => is(a, 'CLAIM_TILE', T.claim),
    done: (s) => s.owner[T.claim] === ME,
    script: () => ({ type: 'CLAIM_TILE', player: ME, tile: T.claim }),
  },
  {
    topic: 3,
    title: 'Madenler',
    text: 'Maden kareleri her turun başında 1 kaynak verir: altın, petrol, demir ya da çelik. Kurulumda seçilemezler, oyun başlayınca alınırlar. Yanındaki altın madeni şimdi senin olabilir.',
    todo: 'Vurgulanan altın madenini al.',
    targets: () => [T.gold],
    allow: (a) => is(a, 'CLAIM_TILE', T.gold),
    done: (s) => s.owner[T.gold] === ME,
    script: () => ({ type: 'CLAIM_TILE', player: ME, tile: T.gold }),
  },
  {
    topic: 3,
    title: 'Altın bozdurma',
    text: 'Altın akçeye çevrilir: 1 altın = 200 akçe. Elinde 1 altın var. Bozdurunca üst çubukta kaynaklarının nasıl değiştiğine bak.',
    todo: "Aşağıdaki 'Altın bozdur' düğmesine bas ve bozdur.",
    allow: (a) => a.type === 'EXCHANGE_GOLD',
    done: (s) => s.players[ME].resources.gold === 0,
    script: () => ({ type: 'EXCHANGE_GOLD', player: ME, amount: 1 }),
  },
  {
    topic: 4,
    title: 'İnşa: tersane',
    text: 'Tersane (200 akçe) denize kıyısı olan bir toprağa kurulur ve gemi üretir. Bu koy, batıdaki dar boğazla açık denize bağlı. Bir karede tek yapı olur.',
    todo: "Vurgulanan kıyı karesine tıkla, 'Tersane kur'u seç.",
    targets: () => [T.shipyard],
    allow: (a) => a.type === 'BUILD' && a.tile === T.shipyard && a.structure === 'shipyard',
    done: (s) => s.structure[T.shipyard] === 'shipyard',
    script: () => ({ type: 'BUILD', player: ME, tile: T.shipyard, structure: 'shipyard' }),
  },
  {
    topic: 4,
    title: 'İnşa: uçak fabrikası',
    text: 'Uçak fabrikası (300 akçe) herhangi bir toprağa kurulur ve uçak üretir. Üçüncü yapı olan askeri üssü (400 akçe) biraz sonra kuracaksın.',
    todo: "Vurgulanan kareye tıkla, 'Uçak fabrikası kur'u seç.",
    targets: () => [T.factory],
    allow: (a) => a.type === 'BUILD' && a.tile === T.factory && a.structure === 'factory',
    done: (s) => s.structure[T.factory] === 'factory',
    script: () => ({ type: 'BUILD', player: ME, tile: T.factory, structure: 'factory' }),
  },
  {
    topic: 5,
    title: 'Üretim',
    text: 'Tersanede gemi üretilir: 2 demir + 100 akçe. Birimler kalıcıdır ama her turun başında bakım ister (gemi ve uçak 50 akçe).',
    todo: "Tersaneye tıkla, 'Gemi üret'i seç.",
    targets: () => [T.shipyard],
    allow: (a) => a.type === 'PRODUCE' && a.tile === T.shipyard,
    done: (s) => s.units.some((u) => u.owner === ME && u.kind === 'ship'),
    script: () => ({ type: 'PRODUCE', player: ME, tile: T.shipyard, unit: 'ship' }),
  },
  endTurnStep(5, 'Bakım', 'Turunu bitir: sıra Mehmet ve Zeynep’e geçer. Sıra sana dönünce gemin için 50 akçe bakım otomatik ödenir; sağ üstte bildirimi görürsün. Akçe yetmeseydi birim dağıtman gerekirdi.'),
  spinStep(5, 'Bakım ödendi', 'Bakım ödendi: üst çubuktaki akçe azaldı, sağ üstte bildirimi var. Şimdi yeni turun topacını çevir.'),
  {
    topic: 6,
    title: 'Normal savaş: kaybetmek',
    text: 'Komşu düşman toprağına saldırabilirsin; turda tek savaş hakkın var ve masrafı (100 akçe) sonuçtan bağımsız ödenir. İki taraf topaç çevirir. Kazanırsan fark kadar toprak alırsın; kaybedersen savunan farkın yarısı kadar (yukarı yuvarlanır) toprağını alır. Saldırmadan önce çıkan önizlemedeki olasılıklara bak.',
    todo: "Vurgulanan Mehmet karesine tıkla, 'Saldır'ı seç ve onayla.",
    targets: () => [T.lose],
    allow: (a) => is(a, 'ATTACK', T.lose),
    done: (s) => s.players[ME].battlesThisTurn > 0 && myTurn(s, 'actions'),
    script: () => ({ type: 'ATTACK', player: ME, target: T.lose }),
  },
  endTurnStep(6, 'Karşı saldırı', 'Bu sefer kaybettin: Mehmet karşı saldırıyla sınırındaki topraklarından aldı. Bu tur savaş hakkın bitti; turu bitir.'),
  spinStep(6, 'Yeni tur', 'Yeni tur başladı: savaş hakkın yenilendi. Topacı çevir.'),
  {
    topic: 6,
    title: 'Normal savaş: kazanmak',
    text: 'Şimdi kuzey sınırından saldır. Kazanırsan topaçlar arasındaki fark kadar Mehmet toprağı seçersin.',
    todo: "Vurgulanan Mehmet karesine tıkla, 'Saldır'ı seç ve onayla.",
    targets: () => [T.win],
    allow: (a) => is(a, 'ATTACK', T.win),
    done: (s) => s.phase.kind === 'conquest' && s.phase.taker === ME,
    script: () => ({ type: 'ATTACK', player: ME, target: T.win }),
  },
  {
    topic: 6,
    title: 'Fetih',
    text: 'Kazandın! Fark kadar Mehmet toprağı seçeceksin; seçtiğin her kare o an toprağına komşu olmalı (başkent ve üs seçilemez). Mehmet’in başkentine giden yolu aç.',
    todo: 'Vurgulanan kareleri sırayla seç; yol açılınca kalanları istediğin gibi seçebilir ya da "Fethi bitir" diyebilirsin.',
    targets: (s) => {
      const n = nextPath(s);
      return n !== null ? [n] : conquestCandidates(s);
    },
    allow: (a, s) => {
      const n = nextPath(s);
      if (a.type === 'CONQUER_TILE') return n === null || a.tile === n;
      return a.type === 'END_CONQUEST' && n === null;
    },
    done: (s) => myTurn(s, 'actions') && nextPath(s) === null,
    script: (s) => {
      const n = nextPath(s);
      return n !== null ? { type: 'CONQUER_TILE', player: ME, tile: n } : { type: 'END_CONQUEST', player: ME };
    },
  },
  {
    topic: 7,
    title: 'Gemi seferi',
    text: 'Gemiler deniz yoluyla kıyı topraklarına gider (1 petrol). Hedef sahipsizse 100 akçeyle alınır, sahipliyse savaş olur. Menüde üzerine gelince rota haritada çizilir; geçilecek boğazlar ve vergileri yazar. Gemin koydan çıkmak için batıdaki boğazdan geçecek.',
    todo: "Güneydoğudaki adanın vurgulanan karesine tıkla, 'Gemiyle al'ı seç.",
    targets: () => [T.island],
    allow: (a) => is(a, 'SHIP_EXPEDITION', T.island),
    done: (s) => s.owner[T.island] === ME,
    script: (s) => ({ type: 'SHIP_EXPEDITION', player: ME, unitId: s.units.find((u) => u.owner === ME && u.kind === 'ship')!.id, target: T.island }),
  },
  {
    topic: 7,
    title: 'Uçak üretimi',
    text: 'Uçak, uçak fabrikasında üretilir: 2 çelik + 200 akçe.',
    todo: "Fabrikaya tıkla, 'Uçak üret'i seç.",
    targets: () => [T.factory],
    allow: (a) => a.type === 'PRODUCE' && a.tile === T.factory,
    done: (s) => s.units.some((u) => u.owner === ME && u.kind === 'plane'),
    script: () => ({ type: 'PRODUCE', player: ME, tile: T.factory, unit: 'plane' }),
  },
  {
    topic: 7,
    title: 'Uçak seferi',
    text: 'Uçak denize ihtiyaç duymadan her yere uçar (2 petrol); yalnızca düşman askeri üslerinin 3 kare çevresine giremez. Maden karelerine ve başkentlere gemi ya da uçakla gidilmez.',
    todo: "Kuzeydeki vurgulanan sahipsiz kareye tıkla, 'Uçakla al'ı seç.",
    targets: () => [T.far],
    allow: (a) => is(a, 'PLANE_EXPEDITION', T.far),
    done: (s) => s.owner[T.far] === ME,
    script: (s) => ({ type: 'PLANE_EXPEDITION', player: ME, unitId: s.units.find((u) => u.owner === ME && u.kind === 'plane')!.id, target: T.far }),
  },
  {
    topic: 8,
    title: 'Boğazlar',
    text: 'Boğaz, iki kara arasındaki tek kare genişliğindeki deniz geçididir (haritada kesik çizgi). İki yakasındaki bütün kara karelerine sahip olan boğazı idare eder. Batıdaki boğazın bir yakası eksik.',
    todo: 'Vurgulanan yakayı al.',
    targets: () => [T.bank],
    allow: (a) => is(a, 'CLAIM_TILE', T.bank),
    done: (s) => s.straits[0]?.controller === ME,
    script: () => ({ type: 'CLAIM_TILE', player: ME, tile: T.bank }),
  },
  {
    topic: 8,
    title: 'Boğaz ayarı',
    text: 'Boğaz artık senin idarende! Başka oyuncuların gemileri geçerken koyduğun vergiyi sana öder; geçişi kapatırsan hiç geçemezler. Ayarlar her oyuncu için ayrıdır.',
    todo: "Aşağıdaki 'Boğazlarım'a bas; Mehmet için geçişi kapat ya da bir vergi yaz.",
    allow: (a) => a.type === 'SET_STRAIT_POLICY',
    done: (s) => Object.keys(s.straits[0]?.policies ?? {}).length > 0,
    script: () => ({ type: 'SET_STRAIT_POLICY', player: ME, straitId: 0, target: 1, allow: true, toll: 100 }),
  },
  {
    topic: 9,
    title: 'Askeri üs',
    text: 'Askeri üs (400 akçe) başkente kurulamaz; çevresindeki 3 karede düşman uçaklarını engeller. Üs karesine saldıran 2 kez art arda yüksek atmalıdır.',
    todo: "Vurgulanan sınır karesine tıkla, 'Askeri üs kur'u seç.",
    targets: () => [T.base],
    allow: (a) => a.type === 'BUILD' && a.tile === T.base && a.structure === 'base',
    done: (s) => s.structure[T.base] === 'base',
    script: () => ({ type: 'BUILD', player: ME, tile: T.base, structure: 'base' }),
  },
  endTurnStep(9, 'Hazırlık', 'Mehmet’in başkenti artık sınırında. Turu bitir; sonraki turda başkentine saldıracaksın.'),
  spinStep(9, 'Yeni tur', 'Yeni tur: gemi ve uçak için bakım ödendi. Topacı çevir.'),
  {
    topic: 9,
    title: 'Başkent savaşı',
    text: 'Başkente yalnızca karadan, sınır komşuluğuyla saldırılır. 3 kez art arda yüksek atmalısın (eşitlikte atış tekrarlanır): olasılık 1/8. Masrafı 600 akçe + 2 demir. Kazanırsan rakip elenir ve her şeyi sana geçer; kaybedersen toprak kaybın olmaz.',
    todo: "Mehmet’in vurgulanan başkentine tıkla, 'Başkent savaşı'nı seç ve onayla.",
    targets: () => [T.mehmetCapital],
    allow: (a) => is(a, 'ATTACK', T.mehmetCapital),
    done: (s) => s.players[ME].battlesThisTurn > 0,
    script: () => ({ type: 'ATTACK', player: ME, target: T.mehmetCapital }),
  },
  {
    topic: 10,
    title: 'Diplomasi',
    text: 'Diplomasi penceresinden ittifak, barış, kaynak ve toprak takası, boğaz izni teklif edebilirsin; hepsi tek teklifte birleşir. Müttefiklere ve barış yapılanlara saldırılamaz.',
    todo: "'Diplomasi'ye bas, Zeynep için 'Teklif hazırla', 'İttifak kur'u işaretle ve gönder.",
    allow: (a) => a.type === 'PROPOSE_OFFER' && a.to === ZEYNEP && a.items.some((i) => i.kind === 'alliance'),
    done: (s) => isAllied(s, ME, ZEYNEP),
    script: () => ({ type: 'PROPOSE_OFFER', player: ME, to: ZEYNEP, items: [{ kind: 'alliance' }] }),
  },
  {
    topic: 11,
    title: 'Kazanma koşulu',
    text: 'Oyun, dünyada tek devlet kalınca ya da kalan herkes müttefikse ve oybirliğiyle bitirmeye karar verirse biter. Kalan iki devlet artık müttefik.',
    todo: "'Diplomasi'ye bas ve 'İttifakla bitirmeyi öner'e tıkla.",
    allow: (a) => a.type === 'PROPOSE_VICTORY',
    done: (s) => s.phase.kind === 'gameover',
    script: () => ({ type: 'PROPOSE_VICTORY', player: ME }),
  },
];

export interface ScriptRun {
  state: GameState;
  events: GameEvent[];
  /** Hangi adımda hata çıktı (yoksa -1) */
  failedAt: number;
  reason?: string;
}

/**
 * Öğreticiyi baştan sona otomatik oynatır (testler ve sabit RNG araması için): oyuncu her adımın eylemini yapar,
 * botlar TutorialBot ile oynar, teklifleri hemen yanıtlar.
 */
export function runTutorialScript(initial: GameState, from = 0, to = STEPS.length): ScriptRun {
  const bot = new TutorialBot();
  let s = initial;
  const events: GameEvent[] = [];
  const apply = (a: Action) => {
    const r = dispatch(s, a);
    s = r.state;
    events.push(...r.events);
    for (const e of r.events) {
      if (e.type === 'offer_made' && s.players[e.offer.to].kind === 'bot') apply({ type: 'RESPOND_OFFER', player: e.offer.to, offerId: e.offer.id, accept: bot.evaluateOffer() });
    }
  };
  for (let i = from; i < to; i++) {
    const step = STEPS[i];
    for (let guard = 0; guard < 200 && !step.done(s); guard++) {
      if (s.phase.kind === 'gameover') break;
      const ph = s.phase;
      const actor = ph.kind === 'vote' ? s.players.find((p) => p.alive && !(p.id in ph.votes))!.id : ph.kind === 'conquest' ? ph.taker : s.currentPlayer;
      if (actor !== ME) {
        apply(bot.chooseAction(s, actor));
        continue;
      }
      const a = step.script(s);
      const v = validateAction(s, a);
      if (!step.allow(a, s) || !v.ok) return { state: s, events, failedAt: i, reason: v.ok ? 'izin yok' : v.reason };
      apply(a);
    }
    if (!step.done(s)) return { state: s, events, failedAt: i, reason: 'adım bitmedi' };
  }
  return { state: s, events, failedAt: -1 };
}
