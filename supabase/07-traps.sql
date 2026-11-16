CREATE TABLE IF NOT EXISTS trap_eval (
  trap_key    text        NOT NULL PRIMARY KEY,
  cp          integer,
  mate        integer,
  depth       integer     NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trap_eval ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON trap_eval;
CREATE POLICY "allow all" ON trap_eval FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS trap_hits (
  id       uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trap_key text        NOT NULL,
  type     text        NOT NULL CHECK (type IN ('caught', 'caught_self')),
  hit_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trap_hits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON trap_hits;
CREATE POLICY "allow all" ON trap_hits FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS trap_hits_key_idx ON trap_hits (trap_key);
CREATE INDEX IF NOT EXISTS trap_hits_type_idx ON trap_hits (trap_key, type);
