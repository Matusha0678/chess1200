-- feat/move-classes: add classification columns to game_analysis and games
-- Idempotent: uses IF NOT EXISTS / IF NOT EXISTS patterns.

-- game_analysis: per-move classification data
ALTER TABLE game_analysis ADD COLUMN IF NOT EXISTS classification  TEXT;
ALTER TABLE game_analysis ADD COLUMN IF NOT EXISTS win_before      NUMERIC;   -- white's win-prob before move  (0–1)
ALTER TABLE game_analysis ADD COLUMN IF NOT EXISTS win_after       NUMERIC;   -- white's win-prob after move   (0–1)
ALTER TABLE game_analysis ADD COLUMN IF NOT EXISTS loss            NUMERIC;   -- mover's win-prob loss         (0–1)

-- games: per-game accuracy summary
ALTER TABLE games ADD COLUMN IF NOT EXISTS accuracy_white    NUMERIC;   -- 0–100
ALTER TABLE games ADD COLUMN IF NOT EXISTS accuracy_black    NUMERIC;   -- 0–100
ALTER TABLE games ADD COLUMN IF NOT EXISTS analysis_version  INTEGER DEFAULT 0;

-- Index for fast filtering of games needing (re)analysis
CREATE INDEX IF NOT EXISTS idx_games_analysis_version ON games(analysis_version);
