-- Course format v1: run once in the Supabase SQL editor (after supabase-courses.sql).
-- Safe to run twice. Old courses keep working: the new columns have defaults.

ALTER TABLE courses        ADD COLUMN IF NOT EXISTS level     text DEFAULT '';
ALTER TABLE courses        ADD COLUMN IF NOT EXISTS language  text DEFAULT 'ru';
ALTER TABLE courses        ADD COLUMN IF NOT EXISTS source_md text DEFAULT '';   -- original file, to re-import after edits

ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS goal   text  DEFAULT '';
-- Full compiled lesson in reading order: text / line (with variations) / plan / mistakes / trap / summary / quiz.
-- The lesson viewer should read this. summary/plan/mistakes/trap stay filled for the old viewer.
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS blocks jsonb DEFAULT '[]';

ALTER TABLE lesson_lines   ADD COLUMN IF NOT EXISTS title    text DEFAULT '';
ALTER TABLE lesson_lines   ADD COLUMN IF NOT EXISTS intro_md text DEFAULT '';
ALTER TABLE lesson_lines   ADD COLUMN IF NOT EXISTS outro_md text DEFAULT '';

ALTER TABLE lesson_questions ADD COLUMN IF NOT EXISTS why text DEFAULT '';
