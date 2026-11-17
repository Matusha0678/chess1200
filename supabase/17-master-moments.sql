-- master_moments: pre-computed key moments for «Угадай ход»
-- + moments_analyzed_at flag on master_games. Safe to re-run.

CREATE TABLE IF NOT EXISTS master_moments (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id        uuid        NOT NULL REFERENCES master_games(id) ON DELETE CASCADE,
  ply            integer     NOT NULL,
  fen            text        NOT NULL,
  master_move    text        NOT NULL,                    -- UCI
  best_move      text        NOT NULL DEFAULT '',          -- UCI
  second_gap_cp  integer,                                  -- |best.cp - second.cp|, side-to-move POV
  kind           text        NOT NULL CHECK (kind IN ('sac','check','capture','annotated')),
  created_at     timestamptz DEFAULT now(),
  UNIQUE (game_id, ply)
);

ALTER TABLE master_moments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON master_moments;
CREATE POLICY "allow all" ON master_moments FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS master_moments_game_id_idx ON master_moments (game_id);
CREATE INDEX IF NOT EXISTS master_moments_kind_idx    ON master_moments (kind);

ALTER TABLE master_games
  ADD COLUMN IF NOT EXISTS moments_analyzed_at timestamptz;
