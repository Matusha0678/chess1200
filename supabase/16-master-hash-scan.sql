-- master_games: add pgn_hash (dedupe) + sac_scanned_at (incremental /sac prepare)
-- safe to re-run

ALTER TABLE master_games ADD COLUMN IF NOT EXISTS pgn_hash       text;
ALTER TABLE master_games ADD COLUMN IF NOT EXISTS sac_scanned_at timestamptz;

-- Unique index on pgn_hash — allows multiple NULLs (legacy rows), blocks dup hashes
CREATE UNIQUE INDEX IF NOT EXISTS master_games_pgn_hash_unique
  ON master_games (pgn_hash)
  WHERE pgn_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS master_games_sac_scanned_idx
  ON master_games (sac_scanned_at);

CREATE INDEX IF NOT EXISTS master_games_player_white_lower_idx
  ON master_games ((lower(white)));
CREATE INDEX IF NOT EXISTS master_games_player_black_lower_idx
  ON master_games ((lower(black)));
