export interface DailyProgress {
  id: number;
  day_number: number;
  date: string;
  block_warmup: boolean;
  block_theme: boolean;
  block_game: boolean;
  block_review: boolean;
  xp_earned: number;
  day_complete: boolean;
}

export interface RatingPoint {
  date: string;
  rating: number;
}

export interface GameLog {
  id: number;
  chess_com_id: string;
  played_at: string;
  time_control: string;
  result: string;
  castling_move: number | null;
  pgn: string;
}

export interface MistakeEntry {
  id: number;
  date: string;
  mistake_text: string;
  better_move: string;
  tag: string;
  game_log_id?: number;
}

export interface BadgeRecord {
  badge_key: string;
  earned_at: string;
}

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  freeze_used_this_week: boolean;
  freeze_available: boolean;
  last_completed_date: string | null;
  week_number: number;
}

export interface SyncResult {
  rating?: number;
  blitzWarning: boolean;
  lossStreakWarning: boolean;
  latecastleGames: string[];
  gamesCount: number;
  error?: string;
}
