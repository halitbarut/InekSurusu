import type { GameMap, MineType, Terrain } from '../types';
import { buildStraitIndex, detectStraits } from './straits';

const MINE_CHARS: Record<string, MineType> = { G: 'gold', O: 'oil', I: 'iron', S: 'steel' };

/**
 * Metin çiziminden harita oluşturur:
 * `.` deniz, `~` göl, `#` kara, `G` altın, `O` petrol, `I` demir, `S` çelik.
 */
export function mapFromAscii(rows: string[], seed = 1): GameMap {
  const lines = rows.map((r) => r.trim()).filter((r) => r.length > 0);
  const height = lines.length;
  const width = lines[0].length;
  const terrain: Terrain[] = [];
  const mines: (MineType | null)[] = [];
  for (const line of lines) {
    if (line.length !== width) throw new Error('Tüm satırlar aynı uzunlukta olmalı');
    for (const ch of line) {
      terrain.push(ch === '.' ? 'sea' : ch === '~' ? 'lake' : 'land');
      mines.push(MINE_CHARS[ch] ?? null);
    }
  }
  const straits = detectStraits({ width, height }, terrain);
  return { width, height, seed, terrain, mines, straits, straitOf: buildStraitIndex(width * height, straits) };
}
