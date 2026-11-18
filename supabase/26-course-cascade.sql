-- Ensure cascade deletes exist on course-related tables
-- Safe to run repeatedly: drops and recreates constraints only if they differ

-- course_lessons → courses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'course_lessons_course_id_fkey'
      AND table_name = 'course_lessons'
  ) THEN
    ALTER TABLE course_lessons DROP CONSTRAINT course_lessons_course_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='course_lessons' AND column_name='course_id') THEN
    ALTER TABLE course_lessons
      ADD CONSTRAINT course_lessons_course_id_fkey
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
  END IF;
END $$;

-- lesson_lines → course_lessons
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lesson_lines_lesson_id_fkey'
      AND table_name = 'lesson_lines'
  ) THEN
    ALTER TABLE lesson_lines DROP CONSTRAINT lesson_lines_lesson_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lesson_lines' AND column_name='lesson_id') THEN
    ALTER TABLE lesson_lines
      ADD CONSTRAINT lesson_lines_lesson_id_fkey
      FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE;
  END IF;
END $$;

-- lesson_progress → course_lessons
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lesson_progress_lesson_id_fkey'
      AND table_name = 'lesson_progress'
  ) THEN
    ALTER TABLE lesson_progress DROP CONSTRAINT lesson_progress_lesson_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lesson_progress' AND column_name='lesson_id') THEN
    ALTER TABLE lesson_progress
      ADD CONSTRAINT lesson_progress_lesson_id_fkey
      FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE;
  END IF;
END $$;

-- lesson_notes → course_lessons
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lesson_notes_lesson_id_fkey'
      AND table_name = 'lesson_notes'
  ) THEN
    ALTER TABLE lesson_notes DROP CONSTRAINT lesson_notes_lesson_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lesson_notes' AND column_name='lesson_id') THEN
    ALTER TABLE lesson_notes
      ADD CONSTRAINT lesson_notes_lesson_id_fkey
      FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE;
  END IF;
END $$;
