-- T10: eval_log — результаты тренажёра «Оцени позицию»
-- Безопасно для повторного запуска

CREATE TABLE IF NOT EXISTS eval_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fen        text NOT NULL,
  my_eval    text NOT NULL CHECK (my_eval IN ('white', 'equal', 'black')),
  my_factors text[] NOT NULL DEFAULT '{}',
  engine_cp  int,
  ok         bool NOT NULL,
  played_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_log_played_at_idx ON eval_log(played_at DESC);

ALTER TABLE eval_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all eval_log" ON eval_log;
CREATE POLICY "allow all eval_log" ON eval_log
  FOR ALL USING (true) WITH CHECK (true);
