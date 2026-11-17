-- T12: daily_picks — партия дня и комбинация дня
-- Безопасно для повторного запуска

CREATE TABLE IF NOT EXISTS daily_picks (
  day   date NOT NULL,
  kind  text NOT NULL CHECK (kind IN ('game', 'combination')),
  ref_id text NOT NULL,
  done  bool NOT NULL DEFAULT false,
  score int  NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

ALTER TABLE daily_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all daily_picks" ON daily_picks;
CREATE POLICY "allow all daily_picks" ON daily_picks
  FOR ALL USING (true) WITH CHECK (true);
