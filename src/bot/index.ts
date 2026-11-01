import type { BotLevel } from '../engine';
import { EasyBot } from './easy';
import { HardBot } from './hard';
import { MediumBot } from './medium';
import { RealisticBot } from './realistic';
import type { BotBrain } from './types';

export type { BotBrain } from './types';
export { MediumBot, MEDIUM_TUNING, autoUpkeepAction, type BotTuning } from './medium';
export { EasyBot, EASY_TUNING, botNoise } from './easy';
export { HardBot, HARD_TUNING } from './hard';
export { RusherBot } from './rusher';
export { RealisticBot, personalityOf, traitsOf } from './realistic';
export { PERSONALITIES, PERSONALITY_NAME, PHRASES, phraseText, type Personality } from './phrases';
export { botDebugOn, setBotDebugSink, type BotDecision } from './debug';

const brains: Record<BotLevel, BotBrain> = {
  easy: new EasyBot(),
  medium: new MediumBot(),
  hard: new HardBot(),
  realistic: new RealisticBot(),
};

export function getBot(level: BotLevel): BotBrain {
  return brains[level] ?? brains.medium;
}

export const BOT_LEVEL_NAME: Record<BotLevel, string> = { easy: 'Kolay', medium: 'Orta', hard: 'Zor', realistic: 'Gerçekçi' };
export { responseAction, timeoutAction } from './timeout';
export { nextBotAction } from './driver';
export { TutorialBot } from './tutorial';
