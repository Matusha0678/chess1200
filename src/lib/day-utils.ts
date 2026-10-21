import { APP_START_DATE, LIGHT_DAYS, DAY_THEMES } from './constants';
import { differenceInCalendarDays, parseISO } from 'date-fns';

export function getCurrentDay(): number {
  const start = parseISO(APP_START_DATE);
  const today = new Date();
  const diff = differenceInCalendarDays(today, start) + 1;
  return Math.max(1, Math.min(30, diff));
}

export function isLightDay(day: number): boolean {
  return LIGHT_DAYS.includes(day);
}

export function getDayTheme(day: number): string {
  return DAY_THEMES[day] ?? 'День ' + day;
}

export function getTargetRatingForDay(day: number): number | null {
  const checkpoints: [number, [number, number]][] = [
    [7,  [880, 920]],
    [14, [960, 1000]],
    [21, [1050, 1100]],
    [30, [1150, 1200]],
  ];
  for (let i = 0; i < checkpoints.length; i++) {
    const [d, [lo]] = checkpoints[i];
    if (day <= d) {
      const prevEntry = checkpoints[i - 1];
      const prevTarget = prevEntry ? (prevEntry[1][0] + prevEntry[1][1]) / 2 : 823;
      const progress = day / d;
      return Math.round(prevTarget + (lo - prevTarget) * progress);
    }
  }
  return 1200;
}
