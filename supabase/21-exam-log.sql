-- T11: exam_log — результаты экзамена дебюта
-- Безопасно для повторного запуска

CREATE TABLE IF NOT EXISTS exam_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id text NOT NULL,
  total      int  NOT NULL,
  perfect    int  NOT NULL,
  seconds    int  NOT NULL,
  taken_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_log_opening_id_idx ON exam_log(opening_id);
CREATE INDEX IF NOT EXISTS exam_log_taken_at_idx   ON exam_log(taken_at DESC);

ALTER TABLE exam_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all exam_log" ON exam_log;
CREATE POLICY "allow all exam_log" ON exam_log
  FOR ALL USING (true) WITH CHECK (true);
