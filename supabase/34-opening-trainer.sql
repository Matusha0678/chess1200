-- Тренажёр дебютов (docs/design/pages/openings/OPENINGS.md, раздел 11). Выполнять после 33-line-badge-class.sql.
-- safe to re-run
CREATE TABLE IF NOT EXISTS line_study (
  line_id      uuid PRIMARY KEY REFERENCES opening_lines(id) ON DELETE CASCADE,
  last_studied timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS opening_practice_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  opening_id    uuid REFERENCES openings(id) ON DELETE CASCADE,
  line_id       uuid REFERENCES opening_lines(id) ON DELETE CASCADE,
  practiced_at  timestamptz DEFAULT now(),
  correct       boolean NOT NULL,
  mastery_after integer
);
ALTER TABLE line_study ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON line_study;
CREATE POLICY "allow all" ON line_study FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE opening_practice_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON opening_practice_log;
CREATE POLICY "allow all" ON opening_practice_log FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS opening_practice_log_opening_idx ON opening_practice_log (opening_id, practiced_at);
