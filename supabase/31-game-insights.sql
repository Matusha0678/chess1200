-- safe to re-run, run after 30-game-openings.sql
CREATE TABLE IF NOT EXISTS game_insights (
  game_id              uuid PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  my_color             text NOT NULL CHECK (my_color IN ('w','b')),
  result               text NOT NULL,
  decisive_move_number integer,
  decisive_san         text,
  decisive_phase       text,
  decisive_loss        numeric,
  decisive_cls         text,
  decisive_fen         text,
  decisive_best        text,
  clock_left           numeric,
  time_trouble         boolean NOT NULL DEFAULT false,
  missed_win           boolean NOT NULL DEFAULT false,
  max_my_win           numeric,
  errors_opening       integer NOT NULL DEFAULT 0,
  errors_middlegame    integer NOT NULL DEFAULT 0,
  errors_endgame       integer NOT NULL DEFAULT 0,
  avg_time_opening     numeric,
  avg_time_middlegame  numeric,
  avg_time_endgame     numeric,
  convert_fen          text,
  convert_move_number  integer,
  convert_eval         integer,
  convert_my_win       numeric,
  version              integer NOT NULL DEFAULT 1,
  computed_at          timestamptz DEFAULT now()
);
ALTER TABLE game_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON game_insights;
CREATE POLICY "allow all" ON game_insights FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS game_insights_result_idx ON game_insights (result);
