import { LEVELS } from './constants';

export const XP_BLOCK = 10;
export const XP_FULL_DAY_BONUS = 20;
export const XP_REVIEW_WRITTEN = 5;

export function getLevelInfo(totalXP: number) {
  let levelIdx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVELS[i].min) { levelIdx = i; break; }
  }
  const current = LEVELS[levelIdx];
  const next = LEVELS[levelIdx + 1];
  const progress = next
    ? ((totalXP - current.min) / (next.min - current.min)) * 100
    : 100;
  return {
    name: current.name,
    levelIdx,
    progress: Math.min(100, Math.max(0, progress)),
    nextName: next?.name ?? null,
    nextMin: next?.min ?? null,
    totalXP,
  };
}
