-- safe to re-run

CREATE TABLE IF NOT EXISTS explain_log (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid NOT NULL,
  ply       integer NOT NULL,
  ok        boolean NOT NULL,
  played_at timestamptz DEFAULT now()
);

ALTER TABLE explain_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON explain_log;
CREATE POLICY "allow all" ON explain_log FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS explain_log_lesson_id_idx ON explain_log (lesson_id);
