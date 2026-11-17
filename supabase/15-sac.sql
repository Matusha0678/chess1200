-- sac_positions + sac_log — safe to re-run

CREATE TABLE IF NOT EXISTS sac_positions (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  fen         text    NOT NULL,
  move        text    NOT NULL,  -- UCI (e.g. "e1g1")
  kind        text    NOT NULL CHECK (kind IN ('real','fake')),
  eval_before integer,           -- centipawns, side-to-move POV
  eval_after  integer,
  source      text    NOT NULL DEFAULT 'master',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE sac_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON sac_positions;
CREATE POLICY "allow all" ON sac_positions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS sac_positions_kind_idx ON sac_positions (kind);

-- ── sac_log ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sac_log (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  position_id uuid        NOT NULL REFERENCES sac_positions(id) ON DELETE CASCADE,
  answer      text        NOT NULL CHECK (answer IN ('sac','calm')),
  ok          boolean     NOT NULL,
  played_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sac_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON sac_log;
CREATE POLICY "allow all" ON sac_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS sac_log_played_at_idx    ON sac_log (played_at DESC);
CREATE INDEX IF NOT EXISTS sac_log_position_id_idx  ON sac_log (position_id);
