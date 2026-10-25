import type { GameMap } from '../engine';
import { MINE_COLOR } from './format';

export const PAINT = {
  paper: '#fbf8ef',
  land: '#fffdf6',
  sea: '#bcd6ee',
  lake: '#9fd6c9',
  strait: '#c0392b',
  pencil: '#3b3a36',
};

/** Küçük harita önizlemesi (kareler, göller, boğazlar ve madenler) */
export function paintThumb(canvas: HTMLCanvasElement, map: GameMap) {
  const ctx = canvas.getContext('2d')!;
  const s = Math.min(canvas.width / map.width, canvas.height / map.height);
  const ox = (canvas.width - map.width * s) / 2;
  const oy = (canvas.height - map.height * s) / 2;
  ctx.fillStyle = PAINT.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < map.terrain.length; i++) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const t = map.terrain[i];
    ctx.fillStyle = map.straitOf[i] >= 0 ? PAINT.strait : t === 'sea' ? PAINT.sea : t === 'lake' ? PAINT.lake : PAINT.land;
    ctx.fillRect(ox + x * s, oy + y * s, s, s);
    const m = map.mines[i];
    if (m) {
      ctx.fillStyle = MINE_COLOR[m];
      ctx.beginPath();
      ctx.arc(ox + (x + 0.5) * s, oy + (y + 0.5) * s, Math.max(1, s * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = PAINT.pencil;
  ctx.strokeRect(ox, oy, map.width * s, map.height * s);
}
