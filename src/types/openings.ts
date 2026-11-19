export interface Opening {
  id: string;
  name: string;
  eco_code?: string | null;
  color: 'white' | 'black' | 'both';
  pgn: string;
  total_lines: number;
  created_at: string;
}

export interface ChessMove {
  san: string;
  from: string;
  to: string;
  fen: string;  // FEN after this move
  color: 'w' | 'b';
}

export interface OpeningLine {
  id: string;
  opening_id: string;
  line_index: number;
  badge?: string | null;
  line_class?: string | null;
  moves: ChessMove[];
  line_type?: 'common' | 'sharp' | 'rare' | null;
  line_emoji?: string | null;
  created_at: string;
}

export interface LineProgress {
  id: string;
  line_id: string;
  correct_count: number;
  incorrect_count: number;
  last_practiced: string | null;
  next_review: string;
  mastery: number;  // 0-5, spaced repetition level
}

export interface LineWithProgress extends OpeningLine {
  progress?: LineProgress;
}

export interface OpeningWithStats extends Opening {
  lines_total: number;
  lines_mastered: number;
  lines_due: number;
}
