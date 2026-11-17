-- safe to re-run

-- Allow deviation mistakes without a game_id
ALTER TABLE mistake_cards ALTER COLUMN game_id DROP NOT NULL;

-- Add 'deviation' to the allowed tag values
ALTER TABLE mistake_cards DROP CONSTRAINT IF EXISTS mistake_cards_tag_check;
ALTER TABLE mistake_cards ADD CONSTRAINT mistake_cards_tag_check
  CHECK (tag IN ('hanging','missed_check','missed_tactic','positional','deviation'));

-- Track deviation attempts per line
CREATE TABLE IF NOT EXISTS deviation_log (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  line_id   text NOT NULL,
  ok        boolean NOT NULL,
  played_at timestamptz DEFAULT now()
);

ALTER TABLE deviation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON deviation_log;
CREATE POLICY "allow all" ON deviation_log FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS deviation_log_line_id_idx ON deviation_log (line_id);
