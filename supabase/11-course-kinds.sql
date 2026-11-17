-- safe to re-run

ALTER TABLE courses ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'opening';
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_kind_check;
ALTER TABLE courses ADD CONSTRAINT courses_kind_check
  CHECK (kind IN ('opening','theme','endgame','tactics','structure','games'));
ALTER TABLE courses ADD COLUMN IF NOT EXISTS topic text;

ALTER TABLE lesson_lines ADD COLUMN IF NOT EXISTS start_fen text;
