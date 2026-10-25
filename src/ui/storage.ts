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

// ------------------------------------------------------------------
// Elle çizilen haritalar
// ------------------------------------------------------------------

const MAP_KEY = 'inek-surusu-maps';

export interface SavedMap {
  id: string;
  name: string;
  date: number;
  /** Harita metni (draftToRows biçimi) */
  rows: string[];
}

export function listMaps(): SavedMap[] {
  try {
    const raw = localStorage.getItem(MAP_KEY);
    const arr = raw ? (JSON.parse(raw) as SavedMap[]) : [];
    return Array.isArray(arr) ? arr.filter((m) => m && Array.isArray(m.rows)).sort((a, b) => b.date - a.date) : [];
  } catch {
    return [];
  }
}

export function getMap(id: string): SavedMap | null {
  return listMaps().find((m) => m.id === id) ?? null;
}

/** Kaydeder (aynı kimlik varsa üzerine yazar); depolama doluysa hata fırlatır. */
export function saveMap(m: Omit<SavedMap, 'date'>): SavedMap {
  const slot = { ...m, date: Date.now() };
  const all = listMaps().filter((x) => x.id !== m.id);
  all.push(slot);
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(all));
  } catch {
    throw new Error('Tarayıcı depolama alanı dolu. Eski kayıtları silip tekrar deneyin.');
  }
  return slot;
}

export function deleteMap(id: string) {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(listMaps().filter((m) => m.id !== id)));
  } catch {
    // yoksay
  }
}

export function exportMap(m: Pick<SavedMap, 'name' | 'rows'>): string {
  return JSON.stringify({ app: 'inek-surusu-map', name: m.name, rows: m.rows }, null, 1);
}

/** JSON metninden harita okur (biçim kontrolü draftFromRows ile ayrıca yapılmalı). */
export function importMap(text: string): { name: string; rows: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Dosya geçerli bir JSON değil');
  }
  const o = data as { app?: string; name?: string; rows?: string[] };
  if (!o || !Array.isArray(o.rows)) throw new Error('Bu dosya bir İnek Sürüsü haritası değil');
  return { name: String(o.name ?? 'İçe aktarılan harita').slice(0, 40), rows: o.rows };
}
