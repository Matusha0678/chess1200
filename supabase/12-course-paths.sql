-- safe to re-run

CREATE TABLE IF NOT EXISTS course_paths (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title      text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE course_paths ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON course_paths;
CREATE POLICY "allow all" ON course_paths FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS course_path_items (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  path_id   uuid REFERENCES course_paths(id)  ON DELETE CASCADE NOT NULL,
  course_id uuid REFERENCES courses(id)        ON DELETE CASCADE NOT NULL,
  ord       integer NOT NULL,
  UNIQUE (path_id, course_id)
);

ALTER TABLE course_path_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON course_path_items;
CREATE POLICY "allow all" ON course_path_items FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS course_path_items_path_idx ON course_path_items (path_id);

-- manual "skip prerequisite" unlocks
CREATE TABLE IF NOT EXISTS course_path_unlocks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  path_id     uuid REFERENCES course_paths(id)  ON DELETE CASCADE NOT NULL,
  course_id   uuid REFERENCES courses(id)        ON DELETE CASCADE NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  UNIQUE (path_id, course_id)
);

ALTER TABLE course_path_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON course_path_unlocks;
CREATE POLICY "allow all" ON course_path_unlocks FOR ALL USING (true) WITH CHECK (true);
