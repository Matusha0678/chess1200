import { supabase } from '@/lib/supabase';
import { START_RATING } from '@/lib/constants';

export async function checkAndAwardBadges(): Promise<string[]> {
  // Fetch all needed data in parallel
  const [
    { data: dailyProgress },
    { data: ratingRow },
    { data: gameLogs },
    { data: streakRow },
    { data: xpRow },
    { data: openingsData },
    { data: lineProgressData },
    { data: existingBadges },
  ] = await Promise.all([
    supabase.from('daily_progress').select('*'),
    supabase.from('rating_history').select('rating').order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('game_logs').select('*'),
    supabase.from('streak').select('*').eq('id', 1).maybeSingle(),
    supabase.from('user_xp').select('*').eq('id', 1).maybeSingle(),
    supabase.from('openings').select('id'),
    supabase.from('line_progress').select('mastery'),
    supabase.from('badges').select('badge_key'),
  ]);

  // Parse fetched data
  const allProgress = (dailyProgress ?? []) as Array<{
    day_number: number;
    day_complete: boolean;
    block_warmup: boolean;
    block_theme: boolean;
    block_game: boolean;
    block_review: boolean;
  }>;
  const latestRating: number = (ratingRow as { rating: number } | null)?.rating ?? START_RATING;
  const games = (gameLogs ?? []) as Array<{
    time_control: string;
    castling_move: number | null;
    result: string;
  }>;
  const currentStreak: number = (streakRow as { current_streak?: number } | null)?.current_streak ?? 0;
  const totalXP: number = (xpRow as { total_xp?: number } | null)?.total_xp ?? 0;
  const openingsCount: number = (openingsData ?? []).length;
  const lineProgRows = (lineProgressData ?? []) as Array<{ mastery: number }>;
  const earnedKeys = new Set((existingBadges ?? []).map((b: { badge_key: string }) => b.badge_key));

  // Derived values
  const completedDays = allProgress.filter(p => p.day_complete).length;

  // Check each badge condition
  const toAward: string[] = [];

  function check(key: string, condition: boolean) {
    if (!earnedKeys.has(key) && condition) {
      toAward.push(key);
    }
  }

  // Дисциплина
  check('first_day', completedDays >= 1);
  check('streak_7', currentStreak >= 7);
  check('streak_14', currentStreak >= 14);
  check('streak_30', currentStreak >= 30);
  check('full_month', completedDays >= 30);

  // clean_week: completedDays >= 2 AND no blitz/bullet games at all
  const hasBlitzOrBullet = games.some(g => g.time_control === 'blitz' || g.time_control === 'bullet');
  check('clean_week', completedDays >= 2 && !hasBlitzOrBullet);

  // Тактика
  const days1to7AllDone = [1,2,3,4,5,6,7].every(d => allProgress.find(p => p.day_number === d)?.day_complete === true);
  check('tactics_week', days1to7AllDone);

  const day13Done = allProgress.find(p => p.day_number === 13)?.day_complete === true;
  check('mate_master', day13Done);

  const endgameDays = [22,23,24,25,26].every(d => allProgress.find(p => p.day_number === d)?.day_complete === true);
  check('endgame_student', endgameDays);

  // castle_10: last 10 rapid games all have castling_move <= 10 (and castling_move NOT NULL)
  const rapidGames = games.filter(g => g.time_control === 'rapid');
  const last10Rapid = rapidGames.slice(-10);
  const castle10 = last10Rapid.length === 10 &&
    last10Rapid.every(g => g.castling_move !== null && (g.castling_move ?? 999) <= 10);
  check('castle_10', castle10);

  // Дебюты
  check('debut_first', openingsCount >= 1);
  check('repertoire_3', openingsCount >= 3);

  const hasMasteredLine = lineProgRows.some(l => l.mastery >= 5);
  check('debut_mastered', hasMasteredLine);

  const practicedLines = lineProgRows.filter(l => l.mastery >= 1).length;
  check('debut_practiced', practicedLines >= 10);

  // Рейтинг
  check('plus_50', latestRating - START_RATING >= 50);
  check('plus_100', latestRating - START_RATING >= 100);
  check('plus_200', latestRating - START_RATING >= 200);
  check('rating_900', latestRating >= 900);
  check('rating_1000', latestRating >= 1000);
  check('rating_1100', latestRating >= 1100);
  check('rating_1200', latestRating >= 1200);

  // XP levels
  check('level_knight', totalXP >= 100);
  check('level_bishop', totalXP >= 250);
  check('level_rook', totalXP >= 500);
  check('level_queen', totalXP >= 900);

  // Award new badges
  if (toAward.length > 0) {
    const now = new Date().toISOString();
    await supabase.from('badges').upsert(
      toAward.map(key => ({ badge_key: key, earned_at: now })),
      { onConflict: 'badge_key', ignoreDuplicates: true }
    );
  }

  return toAward;
}
