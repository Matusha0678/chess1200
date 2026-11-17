-- T6: lesson_notes — заметки и «не понял» к ходам уроков
-- Безопасно для повторного запуска: IF NOT EXISTS, DROP POLICY IF EXISTS

CREATE TABLE IF NOT EXISTS lesson_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  text NOT NULL,
  ply        int  NOT NULL,
  body       text NOT NULL DEFAULT '',
  kind       text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'confused')),
  resolved   bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Индекс для быстрого поиска по уроку
CREATE INDEX IF NOT EXISTS lesson_notes_lesson_id_idx ON lesson_notes(lesson_id);
CREATE INDEX IF NOT EXISTS lesson_notes_resolved_idx  ON lesson_notes(resolved) WHERE NOT resolved;

-- RLS: allow all (как у других таблиц)
ALTER TABLE lesson_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all lesson_notes" ON lesson_notes;
CREATE POLICY "allow all lesson_notes" ON lesson_notes
  FOR ALL USING (true) WITH CHECK (true);
