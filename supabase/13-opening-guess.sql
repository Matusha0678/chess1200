-- opening_guess_log: one row per played day (scored round)
-- safe to re-run

CREATE TABLE IF NOT EXISTS opening_guess_log (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  day         date        NOT NULL UNIQUE,
  opening_id  text        NOT NULL DEFAULT '',
  score       integer     NOT NULL DEFAULT 0,
  moves_shown integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE opening_guess_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON opening_guess_log;
CREATE POLICY "allow all" ON opening_guess_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS opening_guess_log_day_idx ON opening_guess_log (day DESC);
