-- Threat-awareness trainer log — run after 02-mistakes.sql (safe to re-run)

CREATE TABLE IF NOT EXISTS threat_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fen           text NOT NULL,
  found         integer NOT NULL DEFAULT 0,
  missed        integer NOT NULL DEFAULT 0,
  false_alarms  integer NOT NULL DEFAULT 0,
  time_taken_ms integer,
  played_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE threat_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON threat_log;
CREATE POLICY "allow all" ON threat_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS threat_log_played_at_idx ON threat_log (played_at DESC);
