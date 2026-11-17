-- T13: warmup_log — разминка 5 минут
-- Безопасно для повторного запуска

CREATE TABLE IF NOT EXISTS warmup_log (
  day        date PRIMARY KEY,
  steps_done int  NOT NULL DEFAULT 0,
  seconds    int  NOT NULL DEFAULT 0
);

ALTER TABLE warmup_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all warmup_log" ON warmup_log;
CREATE POLICY "allow all warmup_log" ON warmup_log
  FOR ALL USING (true) WITH CHECK (true);
