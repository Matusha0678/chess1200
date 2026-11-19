-- Disable RLS on line_progress and line_move_progress.
-- This app is single-user (see disable-rls.sql). Prior file 37-line-progress-rls.sql
-- enabled RLS with an "allow all" policy, which has been failing for the user —
-- writes silently return 0 rows. Disable RLS entirely to restore writes.
-- Safe to re-run.

ALTER TABLE line_progress       DISABLE ROW LEVEL SECURITY;
ALTER TABLE line_move_progress  DISABLE ROW LEVEL SECURITY;

-- Drop the old allow-all policies — no longer needed with RLS off.
DROP POLICY IF EXISTS "allow all" ON line_progress;
DROP POLICY IF EXISTS "allow all" ON line_move_progress;
