-- 29: подготовленные позиции для «Проверки угроз»
CREATE TABLE IF NOT EXISTS threat_positions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          uuid REFERENCES games(id) ON DELETE CASCADE,
  ply              integer NOT NULL,
  fen              text NOT NULL,
  my_color         text NOT NULL CHECK (my_color IN ('w','b')),
  last_move_uci    text,
  last_move_san    text,
  has_threat       boolean NOT NULL,
  threat_uci       text,
  threat_san       text,
  threat_pv        text,                         -- UCI через пробел, от nullFen
  targets          text[] NOT NULL DEFAULT '{}',
  optional_targets text[] NOT NULL DEFAULT '{}',
  attacker_sq      text,                         -- откуда ходит T (для подсказки)
  motif            text,
  gain_cp          integer,
  mate_in          integer,
  difficulty       smallint NOT NULL DEFAULT 1,
  missed_in_game   boolean NOT NULL DEFAULT false,
  my_move_san      text,                         -- что я сыграл в партии
  version          integer NOT NULL DEFAULT 2,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (game_id, ply)
);
CREATE INDEX IF NOT EXISTS threat_positions_difficulty_idx ON threat_positions (difficulty);
ALTER TABLE threat_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON threat_positions;
CREATE POLICY "allow all" ON threat_positions FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE threat_log ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES threat_positions(id) ON DELETE SET NULL;
ALTER TABLE games      ADD COLUMN IF NOT EXISTS threats_scanned_at timestamptz;
