-- safe to re-run, run after 25-move-classes.sql
CREATE TABLE IF NOT EXISTS game_openings (
  game_id      uuid PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('in_line','deviation','other','hole','none')),
  ply          integer,              -- 0-based полуход события
  move_number  integer,
  color        text CHECK (color IN ('w','b')),
  fen_before   text,                 -- позиция до хода-события
  played       text,                 -- SAN
  played_uci   text,
  prev_uci     text,                 -- предыдущий ход (для подсветки последнего хода)
  expected     text[],               -- SAN ходов из линий
  expected_uci text[],
  opening_id   uuid REFERENCES openings(id) ON DELETE SET NULL,
  line_ids     uuid[],
  book_plies   integer NOT NULL DEFAULT 0,
  first        boolean NOT NULL DEFAULT false,
  cls          text,                 -- classification хода-отклонения
  loss         numeric,              -- его loss
  rep_hash     text NOT NULL,
  checked_at   timestamptz DEFAULT now()
);
ALTER TABLE game_openings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON game_openings;
CREATE POLICY "allow all" ON game_openings FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS game_openings_status_idx ON game_openings (status);
