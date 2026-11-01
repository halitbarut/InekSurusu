/**
 * Botun önemli kararlarını gerekçesiyle kaydeden hata ayıklama günlüğü. Yalnızca dinleyici bağlıysa çalışır:
 * geliştirme modunda arayüz, simülasyonda rapor bağlar; üretim derlemesinde hiç bağlanmaz.
 */
export interface BotDecision {
  round: number;
  player: number;
  personality: string;
  what: string;
  why: string;
}

let sink: ((d: BotDecision) => void) | null = null;

export function setBotDebugSink(fn: ((d: BotDecision) => void) | null) {
  sink = fn;
}

export function botDebugOn(): boolean {
  return sink !== null;
}

export function botDebug(d: BotDecision) {
  sink?.(d);
}
