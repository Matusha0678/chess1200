-- Enable RLS + allow-all policy for line_progress and line_move_progress
-- (anon key needs write access; pattern matches opening_practice_log in 34-opening-trainer.sql)
-- Safe to re-run.

ALTER TABLE line_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON line_progress;
CREATE POLICY "allow all" ON line_progress FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE line_move_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON line_move_progress;
CREATE POLICY "allow all" ON line_move_progress FOR ALL USING (true) WITH CHECK (true);
