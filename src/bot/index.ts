import type { BotLevel } from '../engine';
import { EasyBot } from './easy';
import { HardBot } from './hard';
import { MediumBot } from './medium';
import type { BotBrain } from './types';

export type { BotBrain } from './types';
export { MediumBot, MEDIUM_TUNING, type BotTuning } from './medium';
export { EasyBot, EASY_TUNING, botNoise } from './easy';
export { HardBot, HARD_TUNING } from './hard';
export { RusherBot } from './rusher';

const brains: Record<BotLevel, BotBrain> = {
  easy: new EasyBot(),
  medium: new MediumBot(),
  hard: new HardBot(),
};

export function getBot(level: BotLevel): BotBrain {
  return brains[level] ?? brains.medium;
}

export const BOT_LEVEL_NAME: Record<BotLevel, string> = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };
