CREATE TABLE IF NOT EXISTS courses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  color text CHECK (color IN ('white','black','both')) NOT NULL DEFAULT 'white',
  opening text NOT NULL DEFAULT '',
  description text DEFAULT '',
  difficulty smallint DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_lessons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  lesson_order smallint NOT NULL DEFAULT 0,
  title text NOT NULL,
  summary text DEFAULT '',
  plan text DEFAULT '',
  mistakes text DEFAULT '',
  trap text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lesson_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid REFERENCES course_lessons(id) ON DELETE CASCADE NOT NULL,
  line_order smallint NOT NULL DEFAULT 0,
  moves jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS lesson_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid REFERENCES course_lessons(id) ON DELETE CASCADE NOT NULL,
  question_order smallint NOT NULL DEFAULT 0,
  fen text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid REFERENCES course_lessons(id) ON DELETE CASCADE NOT NULL UNIQUE,
  completed boolean DEFAULT false,
  guess_correct int DEFAULT 0,
  guess_total int DEFAULT 0,
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all" ON courses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON course_lessons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON lesson_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON lesson_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON lesson_progress FOR ALL USING (true) WITH CHECK (true);
