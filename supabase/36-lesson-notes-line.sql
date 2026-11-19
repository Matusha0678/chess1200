-- Урок курса: заметки к ходам знают линию урока (docs/design/pages/course/COURSE-LESSON.md, раздел 2.3).
-- Safe to re-run. Выполнять после 35-pages2.sql (номера 33–35 — из пакетов значков линий, дебютов и «Ловушек/Идей/Спринта»).
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS line_order int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS lesson_notes_lesson_line_idx ON lesson_notes (lesson_id, line_order);
