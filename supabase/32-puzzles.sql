-- safe to re-run
CREATE TABLE IF NOT EXISTS puzzles (
  id         text PRIMARY KEY,
  fen_start  text NOT NULL,
  last_move  text NOT NULL,
  fen        text NOT NULL,
  solution   text[] NOT NULL,
  themes     text[] NOT NULL,
  rating     integer,
  plays      integer,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS puzzle_sets (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  puzzle_ids text[] NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  puzzle_id text NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  set_id    uuid REFERENCES puzzle_sets(id) ON DELETE SET NULL,
  cycle     integer,
  ok        boolean NOT NULL,
  seconds   numeric,
  played_at timestamptz DEFAULT now()
);
ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON puzzles;
CREATE POLICY "allow all" ON puzzles FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE puzzle_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON puzzle_sets;
CREATE POLICY "allow all" ON puzzle_sets FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE puzzle_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON puzzle_attempts;
CREATE POLICY "allow all" ON puzzle_attempts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS puzzles_themes_idx ON puzzles USING GIN (themes);
CREATE INDEX IF NOT EXISTS puzzle_attempts_puzzle_idx ON puzzle_attempts (puzzle_id);
CREATE INDEX IF NOT EXISTS puzzle_attempts_set_cycle_idx ON puzzle_attempts (set_id, cycle);
