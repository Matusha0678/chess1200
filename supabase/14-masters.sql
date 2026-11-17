-- master_games + guess_log — safe to re-run

CREATE TABLE IF NOT EXISTS master_games (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  white      text        NOT NULL DEFAULT '',
  black      text        NOT NULL DEFAULT '',
  event      text        NOT NULL DEFAULT '',
  year       integer,
  result     text        NOT NULL DEFAULT '*'
                         CHECK (result IN ('1-0','0-1','1/2-1/2','*')),
  pgn        text        NOT NULL,
  tags       text[]      NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE master_games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON master_games;
CREATE POLICY "allow all" ON master_games FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS master_games_white_idx ON master_games (white);
CREATE INDEX IF NOT EXISTS master_games_black_idx ON master_games (black);
CREATE INDEX IF NOT EXISTS master_games_year_idx  ON master_games (year DESC);

-- ── guess_log ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guess_log (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id    uuid        NOT NULL REFERENCES master_games(id) ON DELETE CASCADE,
  side       text        NOT NULL CHECK (side IN ('white','black')),
  score      integer     NOT NULL DEFAULT 0,
  max_score  integer     NOT NULL DEFAULT 0,
  played_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE guess_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON guess_log;
CREATE POLICY "allow all" ON guess_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS guess_log_game_id_idx   ON guess_log (game_id);
CREATE INDEX IF NOT EXISTS guess_log_played_at_idx ON guess_log (played_at DESC);
