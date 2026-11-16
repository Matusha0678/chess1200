CREATE TABLE IF NOT EXISTS game_log (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fen          text        NOT NULL,
  mode         text        NOT NULL, -- 'free' | 'convert' | 'handicap'
  result       text        NOT NULL, -- 'win' | 'loss' | 'draw'
  player_color text        NOT NULL, -- 'w' | 'b'
  level        integer,
  pgn          text,
  played_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE game_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON game_log;
CREATE POLICY "allow all" ON game_log FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS game_log_played_at_idx ON game_log (played_at DESC);
CREATE INDEX IF NOT EXISTS game_log_mode_result_idx ON game_log (mode, result);
