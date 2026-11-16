-- Games import — run once in Supabase SQL Editor (safe to re-run).

CREATE TABLE IF NOT EXISTS games (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source     text NOT NULL DEFAULT 'chesscom',
  url        text NOT NULL UNIQUE,
  pgn        text NOT NULL DEFAULT '',
  color      text NOT NULL CHECK (color IN ('white', 'black')),
  result     text NOT NULL CHECK (result IN ('win', 'draw', 'loss')),
  time_class text NOT NULL DEFAULT '',
  rating_me  integer,
  rating_opp integer,
  opp_name   text NOT NULL DEFAULT '',
  eco_name   text NOT NULL DEFAULT '',
  played_at  timestamptz NOT NULL,
  moves_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games_sync_state (
  id               integer PRIMARY KEY DEFAULT 1,
  username         text NOT NULL DEFAULT 'rozt1shka',
  last_synced_at   timestamptz,
  synced_archives  text[] DEFAULT '{}',
  CONSTRAINT only_one_row CHECK (id = 1)
);

INSERT INTO games_sync_state (id, username)
VALUES (1, 'rozt1shka')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE games            ENABLE ROW LEVEL SECURITY;
ALTER TABLE games_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all" ON games;
CREATE POLICY "allow all" ON games FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow all" ON games_sync_state;
CREATE POLICY "allow all" ON games_sync_state FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS games_played_at_idx  ON games (played_at DESC);
CREATE INDEX IF NOT EXISTS games_color_idx      ON games (color);
CREATE INDEX IF NOT EXISTS games_result_idx     ON games (result);
CREATE INDEX IF NOT EXISTS games_time_class_idx ON games (time_class);
