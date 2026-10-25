import type { GameConfig, GameState } from '../engine';

const KEY = 'inek-surusu-saves';
export const AUTOSAVE_ID = 'auto';

export interface SaveSlot {
  id: string;
  name: string;
  date: number;
  round: number;
  players: string[];
  state: GameState;
}

function readAll(): SaveSlot[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as SaveSlot[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(slots: SaveSlot[]) {
  localStorage.setItem(KEY, JSON.stringify(slots));
}

export function listSaves(): SaveSlot[] {
  return readAll().sort((a, b) => b.date - a.date);
}

/** Kaydeder; depolama doluysa hata fırlatır. */
export function saveGame(state: GameState, name: string, id = `s${Date.now()}`): SaveSlot {
  const slot: SaveSlot = {
    id,
    name,
    date: Date.now(),
    round: state.round,
    players: state.players.map((p) => p.name),
    state,
  };
  const slots = readAll().filter((s) => s.id !== id);
  slots.push(slot);
  try {
    writeAll(slots);
  } catch {
    throw new Error('Tarayıcı depolama alanı dolu. Eski kayıtları silip tekrar deneyin.');
  }
  return slot;
}

export function autosave(state: GameState) {
  try {
    saveGame(state, 'Otomatik kayıt', AUTOSAVE_ID);
  } catch {
    // otomatik kayıt sessizce başarısız olabilir
  }
}

export function getSave(id: string): SaveSlot | null {
  return readAll().find((s) => s.id === id) ?? null;
}

export function deleteSave(id: string) {
  try {
    writeAll(readAll().filter((s) => s.id !== id));
  } catch {
    // yoksay
  }
}

export function exportState(state: GameState): string {
  return JSON.stringify({ app: 'inek-surusu', exportedAt: new Date().toISOString(), state });
}

/** JSON metninden oyun durumunu okur ve temel biçim kontrolü yapar. */
export function importState(text: string): GameState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Dosya geçerli bir JSON değil');
  }
  const obj = data as { state?: GameState } & Partial<GameState>;
  const state = (obj.state ?? obj) as GameState;
  if (!state || state.version !== 1 || !state.map || !Array.isArray(state.players) || !Array.isArray(state.owner)) {
    throw new Error('Bu dosya bir İnek Sürüsü kaydı değil');
  }
  if (state.owner.length !== state.map.width * state.map.height) throw new Error('Kayıt bozuk: harita boyutu tutarsız');
  return state;
}

// ------------------------------------------------------------------
// Kullanıcının kaydettiği kural ayarları (özel önayarlar)
// ------------------------------------------------------------------

const PRESET_KEY = 'inek-surusu-presets';

export interface SavedPreset {
  name: string;
  config: GameConfig;
  /** Harita boyutu çarpanı; size verilmişse kullanılmaz */
  mapScale: number;
  /** Elle girilmiş harita boyutu (yoksa oyuncu sayısına göre) */
  size: { width: number; height: number } | null;
}

export function listPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    const arr = raw ? (JSON.parse(raw) as SavedPreset[]) : [];
    return Array.isArray(arr) ? arr.filter((p) => p && typeof p.name === 'string' && p.config) : [];
  } catch {
    return [];
  }
}

/** Aynı adlı kayıt varsa üzerine yazar. */
export function savePreset(p: SavedPreset) {
  const all = listPresets().filter((x) => x.name !== p.name);
  all.push(p);
  all.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(all));
  } catch {
    throw new Error('Ayar kaydedilemedi: tarayıcı depolama alanı kullanılamıyor.');
  }
}

export function deletePreset(name: string) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(listPresets().filter((x) => x.name !== name)));
  } catch {
    // yoksay
  }
}
