import type { BotLevel } from '../engine';
import { MediumBot } from './medium';
import type { BotBrain } from './types';

export type { BotBrain } from './types';
export { MediumBot, MEDIUM_TUNING, type BotTuning } from './medium';
export { RusherBot } from './rusher';

const brains: Record<BotLevel, BotBrain> = {
  medium: new MediumBot(),
};

export function getBot(level: BotLevel): BotBrain {
  return brains[level] ?? brains.medium;
}
