/** Cihaza özel arayüz tercihleri (oyun durumundan bağımsız). */
export interface UiPrefs {
  /** Topaç ve savaş animasyonları */
  animSpeed: 'normal' | 'fast' | 'off';
  /** Bot hamlelerini hızlı oynat */
  fastBots: boolean;
  /** Hot-seat'te sıra değişince "Sıra: X" geçiş ekranı */
  passScreen: boolean;
  /** Ana ses düzeyi (0–1) */
  volume: number;
  /** Sessiz mod */
  muted: boolean;
  /** Savaştan önce önizleme (masraf, olasılık, sonuçlar) */
  battlePreview: boolean;
  /** Kullanılmamış savaş hakkıyla tur bitirirken hatırlat */
  endTurnReminder: boolean;
}

const KEY = 'inek-surusu-prefs';
const DEFAULTS: UiPrefs = { animSpeed: 'normal', fastBots: false, passScreen: true, volume: 0.7, muted: false, battlePreview: true, endTurnReminder: true };

let cache: UiPrefs | null = null;

export function getPrefs(): UiPrefs {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export function setPrefs(patch: Partial<UiPrefs>) {
  cache = { ...getPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // depolama kullanılamıyorsa tercih yalnızca bu oturumda geçerli
  }
}

/** Animasyon süre çarpanı */
export function animFactor(forBots = false): number {
  const p = getPrefs();
  if (forBots && p.fastBots) return 0;
  return p.animSpeed === 'off' ? 0 : p.animSpeed === 'fast' ? 0.45 : 1;
}
