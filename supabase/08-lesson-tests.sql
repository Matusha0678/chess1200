CREATE TABLE IF NOT EXISTS lesson_tests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid REFERENCES course_lessons(id) ON DELETE CASCADE NOT NULL,
  score integer NOT NULL,
  max integer NOT NULL,
  wrong jsonb NOT NULL DEFAULT '[]',
  taken_at timestamptz DEFAULT now()
);

ALTER TABLE lesson_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON lesson_tests FOR ALL USING (true) WITH CHECK (true);
