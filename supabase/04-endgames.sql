-- endgame_log: records each endgame practice attempt
CREATE TABLE IF NOT EXISTS endgame_log (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  endgame_id    text        NOT NULL,
  category      text        NOT NULL,
  goal          text        NOT NULL CHECK (goal IN ('win', 'draw')),
  achieved      boolean     NOT NULL,
  moves_played  integer     NOT NULL DEFAULT 0,
  time_taken_ms integer,
  played_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE endgame_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON endgame_log;
CREATE POLICY "allow all" ON endgame_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS endgame_log_played_at_idx    ON endgame_log (played_at DESC);
CREATE INDEX IF NOT EXISTS endgame_log_endgame_id_idx   ON endgame_log (endgame_id);
CREATE INDEX IF NOT EXISTS endgame_log_category_idx     ON endgame_log (category);
