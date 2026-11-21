// Achievement system — pure functions that compute earned/progress
// based on available metrics (games stats, line_progress counts, etc.)

import type { Game, GameStats } from './chesscom';

export interface Achievement {
  id: string;
  icon: string; // key for <AchievementIcon name={...} />
  title: string;
  desc: string;
  category: 'play' | 'study' | 'skill' | 'streak' | 'special';
  compute: (ctx: AchievementContext) => { progress: number; target: number };
}

export interface AchievementContext {
  games: Game[];
  stats: GameStats;
  totalLines: number;
  masteredLines: number;
  totalOpenings: number;
  streak: number;
}

export interface EarnedAchievement extends Achievement {
  progress: number;
  target: number;
  earned: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ═══════════════════════════════════════════════════════════════════
  //  PLAY — объём партий
  // ═══════════════════════════════════════════════════════════════════
  { id: 'first-game', icon: 'play', title: 'Первая партия', desc: 'Сыграй первую партию', category: 'play',
    compute: c => ({ progress: Math.min(1, c.games.length), target: 1 }) },
  { id: 'games-10', icon: 'gamepad', title: '10 партий', desc: 'Сыграй 10 партий', category: 'play',
    compute: c => ({ progress: Math.min(10, c.games.length), target: 10 }) },
  { id: 'games-50', icon: 'dices', title: '50 партий', desc: 'Сыграй 50 партий', category: 'play',
    compute: c => ({ progress: Math.min(50, c.games.length), target: 50 }) },
  { id: 'games-100', icon: 'mountain', title: '100 партий', desc: 'Сыграй 100 партий', category: 'play',
    compute: c => ({ progress: Math.min(100, c.games.length), target: 100 }) },
  { id: 'games-500', icon: 'compass', title: '500 партий', desc: 'Марафонец', category: 'play',
    compute: c => ({ progress: Math.min(500, c.games.length), target: 500 }) },
  { id: 'games-1000', icon: 'infinity', title: '1000 партий', desc: 'Легенда онлайн-шахмат', category: 'play',
    compute: c => ({ progress: Math.min(1000, c.games.length), target: 1000 }) },

  // ═══════════════════════════════════════════════════════════════════
  //  SKILL — победы и точность
  // ═══════════════════════════════════════════════════════════════════
  { id: 'win-1', icon: 'medal', title: 'Первая победа', desc: 'Выиграй первую партию', category: 'skill',
    compute: c => {
      const wins = c.games.filter(g => g.result === 'win').length;
      return { progress: Math.min(1, wins), target: 1 };
    } },
  { id: 'win-10', icon: 'award', title: 'Десятка побед', desc: '10 побед всего', category: 'skill',
    compute: c => {
      const wins = c.games.filter(g => g.result === 'win').length;
      return { progress: Math.min(10, wins), target: 10 };
    } },
  { id: 'win-50', icon: 'trophy', title: 'Полсотни побед', desc: '50 побед всего', category: 'skill',
    compute: c => {
      const wins = c.games.filter(g => g.result === 'win').length;
      return { progress: Math.min(50, wins), target: 50 };
    } },
  { id: 'win-100', icon: 'crown', title: 'Сотня побед', desc: '100 побед — ты в элите', category: 'skill',
    compute: c => {
      const wins = c.games.filter(g => g.result === 'win').length;
      return { progress: Math.min(100, wins), target: 100 };
    } },
  { id: 'streak-3', icon: 'flame', title: 'Три подряд', desc: '3 победы подряд', category: 'skill',
    compute: c => ({ progress: Math.min(3, c.stats.longestWinStreak), target: 3 }) },
  { id: 'streak-5', icon: 'flame', title: 'Горячая серия', desc: '5 побед подряд', category: 'skill',
    compute: c => ({ progress: Math.min(5, c.stats.longestWinStreak), target: 5 }) },
  { id: 'streak-10', icon: 'zap', title: 'Непобедимый', desc: '10 побед подряд', category: 'skill',
    compute: c => ({ progress: Math.min(10, c.stats.longestWinStreak), target: 10 }) },
  { id: 'streak-20', icon: 'rocket', title: 'Легендарная серия', desc: '20 побед подряд', category: 'skill',
    compute: c => ({ progress: Math.min(20, c.stats.longestWinStreak), target: 20 }) },
  { id: 'accuracy-80', icon: 'target', title: 'Точный', desc: 'Партия с точностью ≥80%', category: 'skill',
    compute: c => {
      const best = bestAccuracy(c.games);
      return { progress: Math.min(80, Math.round(best)), target: 80 };
    } },
  { id: 'accuracy-90', icon: 'crosshair', title: 'Снайпер', desc: 'Точность ≥90%', category: 'skill',
    compute: c => {
      const best = bestAccuracy(c.games);
      return { progress: Math.min(90, Math.round(best)), target: 90 };
    } },
  { id: 'accuracy-95', icon: 'sparkles', title: 'Идеальная партия', desc: 'Точность ≥95%', category: 'skill',
    compute: c => {
      const best = bestAccuracy(c.games);
      return { progress: Math.min(95, Math.round(best)), target: 95 };
    } },
  { id: 'both-sides', icon: 'swap', title: 'С двух сторон', desc: 'Побеждай и белыми и чёрными', category: 'skill',
    compute: c => {
      const wasW = c.stats.white.win > 0 ? 1 : 0;
      const wasB = c.stats.black.win > 0 ? 1 : 0;
      return { progress: wasW + wasB, target: 2 };
    } },
  { id: 'beat-stronger', icon: 'shield', title: 'Против сильного', desc: 'Побед над соперником +100 рейтинга', category: 'skill',
    compute: c => {
      const beat = c.games.filter(g =>
        g.result === 'win' && g.rating_me != null && g.rating_opp != null && (g.rating_opp - g.rating_me) >= 100
      ).length;
      return { progress: Math.min(5, beat), target: 5 };
    } },
  { id: 'crush-win', icon: 'swords', title: 'Разгром', desc: 'Выиграй партию за ≤15 ходов', category: 'skill',
    compute: c => {
      const has = c.games.some(g => g.result === 'win' && g.moves_count > 0 && g.moves_count <= 15);
      return { progress: has ? 1 : 0, target: 1 };
    } },

  // ═══════════════════════════════════════════════════════════════════
  //  STUDY — дебюты и линии
  // ═══════════════════════════════════════════════════════════════════
  { id: 'opening-1', icon: 'book', title: 'Первый дебют', desc: 'Сохрани первый дебют', category: 'study',
    compute: c => ({ progress: c.totalOpenings > 0 ? 1 : 0, target: 1 }) },
  { id: 'openings-5', icon: 'book-open', title: 'Пять дебютов', desc: 'Сохрани 5 дебютов', category: 'study',
    compute: c => ({ progress: Math.min(5, c.totalOpenings), target: 5 }) },
  { id: 'openings-20', icon: 'library', title: 'Репертуар', desc: '20 дебютов в репертуаре', category: 'study',
    compute: c => ({ progress: Math.min(20, c.totalOpenings), target: 20 }) },
  { id: 'lines-10', icon: 'book', title: '10 линий', desc: '10 линий освоено', category: 'study',
    compute: c => ({ progress: Math.min(10, c.masteredLines), target: 10 }) },
  { id: 'lines-50', icon: 'book-open', title: '50 линий', desc: '50 линий освоено', category: 'study',
    compute: c => ({ progress: Math.min(50, c.masteredLines), target: 50 }) },
  { id: 'lines-100', icon: 'library', title: 'Знаток теории', desc: '100 линий освоено', category: 'study',
    compute: c => ({ progress: Math.min(100, c.masteredLines), target: 100 }) },
  { id: 'lines-250', icon: 'graduation', title: 'Профи теории', desc: '250 линий освоено', category: 'study',
    compute: c => ({ progress: Math.min(250, c.masteredLines), target: 250 }) },
  { id: 'lines-500', icon: 'brain', title: 'Энциклопедия', desc: '500 линий освоено', category: 'study',
    compute: c => ({ progress: Math.min(500, c.masteredLines), target: 500 }) },
  { id: 'eco-5', icon: 'puzzle', title: '5 дебютов в практике', desc: 'Сыграй 5 разных ЭКО', category: 'study',
    compute: c => {
      const ecos = new Set(c.games.map(g => g.eco_name).filter(Boolean));
      return { progress: Math.min(5, ecos.size), target: 5 };
    } },
  { id: 'eco-20', icon: 'lightbulb', title: 'Универсал', desc: 'Сыграй 20 разных ЭКО', category: 'study',
    compute: c => {
      const ecos = new Set(c.games.map(g => g.eco_name).filter(Boolean));
      return { progress: Math.min(20, ecos.size), target: 20 };
    } },

  // ═══════════════════════════════════════════════════════════════════
  //  STREAK — дни подряд
  // ═══════════════════════════════════════════════════════════════════
  { id: 'day-3', icon: 'check', title: 'Три дня подряд', desc: 'Тренируйся 3 дня', category: 'streak',
    compute: c => ({ progress: Math.min(3, c.streak), target: 3 }) },
  { id: 'day-7', icon: 'star', title: 'Неделя', desc: '7 дней подряд', category: 'streak',
    compute: c => ({ progress: Math.min(7, c.streak), target: 7 }) },
  { id: 'day-14', icon: 'calendar', title: 'Две недели', desc: '14 дней подряд', category: 'streak',
    compute: c => ({ progress: Math.min(14, c.streak), target: 14 }) },
  { id: 'day-30', icon: 'moon', title: 'Месяц', desc: '30 дней подряд', category: 'streak',
    compute: c => ({ progress: Math.min(30, c.streak), target: 30 }) },
  { id: 'day-100', icon: 'sun', title: '100 дней', desc: 'Целый сезон', category: 'streak',
    compute: c => ({ progress: Math.min(100, c.streak), target: 100 }) },
  { id: 'day-365', icon: 'infinity', title: 'Год', desc: 'Триста шестьдесят пять дней', category: 'streak',
    compute: c => ({ progress: Math.min(365, c.streak), target: 365 }) },

  // ═══════════════════════════════════════════════════════════════════
  //  SPECIAL — фан и нестандарт
  // ═══════════════════════════════════════════════════════════════════
  { id: 'night-owl', icon: 'moon', title: 'Ночная сова', desc: '5 партий после 23:00', category: 'special',
    compute: c => {
      const late = c.games.filter(g => {
        if (!g.played_at) return false;
        const h = new Date(g.played_at).getHours();
        return h >= 23 || h < 4;
      }).length;
      return { progress: Math.min(5, late), target: 5 };
    } },
  { id: 'early-bird', icon: 'sun', title: 'Ранняя пташка', desc: '5 партий до 7:00', category: 'special',
    compute: c => {
      const early = c.games.filter(g => {
        if (!g.played_at) return false;
        const h = new Date(g.played_at).getHours();
        return h >= 4 && h < 7;
      }).length;
      return { progress: Math.min(5, early), target: 5 };
    } },
  { id: 'weekend-warrior', icon: 'flame', title: 'Воин выходного дня', desc: '20 партий в выходные', category: 'special',
    compute: c => {
      const we = c.games.filter(g => {
        if (!g.played_at) return false;
        const dow = new Date(g.played_at).getDay();
        return dow === 0 || dow === 6;
      }).length;
      return { progress: Math.min(20, we), target: 20 };
    } },
  { id: 'rating-up-50', icon: 'trending', title: 'Прогресс', desc: 'Рейтинг вырос на 50 за всё время', category: 'special',
    compute: c => {
      const delta = (c.stats.maxRating ?? 0) - (c.stats.minRating ?? Infinity);
      return { progress: Math.min(50, Math.max(0, Math.round(delta))), target: 50 };
    } },
  { id: 'rating-up-200', icon: 'rocket', title: 'Большой прогресс', desc: 'Рейтинг вырос на 200', category: 'special',
    compute: c => {
      const delta = (c.stats.maxRating ?? 0) - (c.stats.minRating ?? Infinity);
      return { progress: Math.min(200, Math.max(0, Math.round(delta))), target: 200 };
    } },
  { id: 'hit-1300', icon: 'target', title: 'Цель 1300', desc: 'Достичь рейтинга 1300', category: 'special',
    compute: c => ({ progress: Math.min(1300, c.stats.maxRating ?? 0), target: 1300 }) },
  { id: 'hit-1500', icon: 'mountain', title: 'Планка 1500', desc: 'Достичь рейтинга 1500', category: 'special',
    compute: c => ({ progress: Math.min(1500, c.stats.maxRating ?? 0), target: 1500 }) },
  { id: 'hit-1800', icon: 'crown', title: 'Выше 1800', desc: 'Достичь рейтинга 1800', category: 'special',
    compute: c => ({ progress: Math.min(1800, c.stats.maxRating ?? 0), target: 1800 }) },
  { id: 'comeback', icon: 'snowflake', title: 'Камбэк', desc: 'Победа после 3 поражений подряд', category: 'special',
    compute: c => {
      const chrono = [...c.games].sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
      let losses = 0;
      let has = false;
      for (const g of chrono) {
        if (g.result === 'loss') losses++;
        else if (g.result === 'win' && losses >= 3) { has = true; break; }
        else losses = 0;
      }
      return { progress: has ? 1 : 0, target: 1 };
    } },
  { id: 'marathon-day', icon: 'hourglass', title: 'Марафон', desc: '10 партий за один день', category: 'special',
    compute: c => {
      const byDay = new Map<string, number>();
      for (const g of c.games) {
        if (!g.played_at) continue;
        const d = g.played_at.slice(0, 10);
        byDay.set(d, (byDay.get(d) ?? 0) + 1);
      }
      const max = Math.max(0, ...byDay.values());
      return { progress: Math.min(10, max), target: 10 };
    } },
  { id: 'long-game', icon: 'clock', title: 'Длиннейшая', desc: 'Партия 80+ ходов', category: 'special',
    compute: c => {
      const has = c.games.some(g => g.moves_count >= 80);
      return { progress: has ? 1 : 0, target: 1 };
    } },
];

function bestAccuracy(games: Game[]): number {
  let best = 0;
  for (const g of games) {
    const a = g.color === 'white' ? g.accuracy_white : g.accuracy_black;
    if (a != null && a > best) best = a;
  }
  return best;
}

export function evaluate(ctx: AchievementContext): EarnedAchievement[] {
  return ACHIEVEMENTS.map(a => {
    const { progress, target } = a.compute(ctx);
    return { ...a, progress, target, earned: progress >= target };
  });
}

export function recentlyEarned(ctx: AchievementContext, limit = 3): EarnedAchievement[] {
  const earned = evaluate(ctx).filter(a => a.earned);
  return earned
    .sort((a, b) => b.target - a.target)
    .slice(0, limit);
}

export const CATEGORY_LABEL: Record<Achievement['category'], string> = {
  play: 'Игра',
  study: 'Учёба',
  skill: 'Мастерство',
  streak: 'Привычка',
  special: 'Особые',
};

export const CATEGORY_COLOR: Record<Achievement['category'], string> = {
  play:    '#4A90E2',
  study:   '#F0A43A',
  skill:   'var(--accent)',
  streak:  '#E0574A',
  special: '#C77DFF',
};
