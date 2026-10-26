import {
  attackableTiles,
  battleKindAt,
  buildableTiles,
  claimableTiles,
  producibleTiles,
  readyUnits,
  validateAction,
  type GameState,
} from '../../engine';
import type { IconName } from '../icons';

/**
 * İlk oyunlarda ipuçları: bir eylem bu oyuncu için ilk kez yapılabilir hâle gelince bir kez kısa bir ipucu.
 * Görülenler cihazda saklanır; ayarlardan kapatılır ya da sıfırlanır.
 */
interface Hint {
  id: string;
  icon: IconName;
  text: string | ((s: GameState) => string);
  when(s: GameState, me: number): boolean;
}

const HINTS: Hint[] = [
  { id: 'claim', icon: 'claim', text: 'Toprağına komşu sahipsiz bir kareye tıkla: 100 akçeye alabilirsin.', when: (s, me) => claimableTiles(s, me).length > 0 },
  { id: 'exchange', icon: 'exchange', text: (s) => `Altının var: "Altın bozdur" ile akçeye çevirebilirsin (1 altın = ${s.config.goldToAkce} akçe).`, when: (s, me) => s.players[me].resources.gold > 0 },
  { id: 'shipyard', icon: 'shipyard', text: 'Kıyıdaki bir toprağına tıklayıp tersane kurabilirsin; gemiler denizden uzak karalara götürür.', when: (s, me) => buildableTiles(s, me, 'shipyard').length > 0 },
  { id: 'factory', icon: 'factory', text: 'Uçak fabrikası kurabilirsin: uçaklar denize bağlı kalmadan her yere uçar (düşman üslerinin çevresi hariç).', when: (s, me) => buildableTiles(s, me, 'factory').length > 0 },
  { id: 'ship', icon: 'produce', text: 'Tersanene tıklayıp gemi üretebilirsin (demir + akçe; her tur bakım ister).', when: (s, me) => producibleTiles(s, me, 'ship').length > 0 },
  { id: 'plane', icon: 'produce', text: 'Fabrikana tıklayıp uçak üretebilirsin (çelik + akçe; her tur bakım ister).', when: (s, me) => producibleTiles(s, me, 'plane').length > 0 },
  { id: 'expedition', icon: 'ship', text: 'Gemin ya da uçağın sefere hazır: uzaktaki bir kareye tıkla, menüde rotasını ve masrafını görürsün.', when: (s, me) => readyUnits(s, me, 'ship').length + readyUnits(s, me, 'plane').length > 0 },
  {
    id: 'attack',
    icon: 'attack',
    text: 'Komşu bir düşman toprağına tıklayıp saldırabilirsin. Önizlemede masrafı ve olasılıkları gör; turda tek savaş hakkın var.',
    when: (s, me) => attackableTiles(s, me).some((t) => validateAction(s, { type: 'ATTACK', player: me, target: t }).ok),
  },
  {
    id: 'capital',
    icon: 'capital',
    text: 'Bir rakibin başkentine komşusun! Başkent savaşı 3 kez art arda yüksek atmayı ister (1/8); kazanırsan rakip elenir.',
    when: (s, me) => attackableTiles(s, me).some((t) => battleKindAt(s, t) === 'capital'),
  },
  { id: 'strait', icon: 'strait', text: 'Bir boğazı idare ediyorsun: "Boğazlarım"dan her oyuncu için geçiş izni ve vergi belirle.', when: (s, me) => s.straits.some((st) => st.controller === me) },
  { id: 'diplomacy', icon: 'diplomacy', text: '"Diplomasi"den ittifak, barış ve takas teklif edebilirsin; müttefiklere ve barış yapılanlara saldırılamaz.', when: (s) => s.round >= 3 },
];

const KEY = 'inek-surusu-hints';

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  const s = seen();
  s.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    // yoksay
  }
}

export function resetHints() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // yoksay
  }
}

/** Şu an gösterilecek (daha önce görülmemiş) ilk ipucu; gösterilmiş sayılır */
export function takeHint(s: GameState, me: number): { icon: IconName; text: string } | null {
  const done = seen();
  for (const h of HINTS) {
    if (done.has(h.id) || !h.when(s, me)) continue;
    markSeen(h.id);
    return { icon: h.icon, text: typeof h.text === 'function' ? h.text(s) : h.text };
  }
  return null;
}
