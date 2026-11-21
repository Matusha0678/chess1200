-- «Ловушки», «Идеи позиций», «Дебютный спринт» (docs/design/pages/PAGES2.md). Safe to re-run. Выполнять после 32-puzzles.sql.

-- прогресс ловушек (ключ: lib:<id> для библиотеки, slug/lesson/line для курсов — как trap_key в trap_hits)
CREATE TABLE IF NOT EXISTS trap_progress (
  trap_key        text PRIMARY KEY,
  mastery         integer NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 5),
  next_review     timestamptz NOT NULL DEFAULT now(),
  correct_count   integer NOT NULL DEFAULT 0,
  incorrect_count integer NOT NULL DEFAULT 0,
  last_practiced  timestamptz
);

-- кеш ответов Lichess Opening Explorer для «Идей позиций»
CREATE TABLE IF NOT EXISTS position_explorer (
  pos_key    text NOT NULL,                       -- расстановка + ход + рокировки + en passant
  db         text NOT NULL CHECK (db IN ('masters', 'lichess')),
  data       jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pos_key, db)
);

-- забеги «Дебютного спринта»
CREATE TABLE IF NOT EXISTS sprint_log (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  played_at timestamptz NOT NULL DEFAULT now(),
  seconds   integer NOT NULL,
  score     integer NOT NULL,
  mistakes  integer NOT NULL,
  positions integer NOT NULL
);

-- задачи Lichess из дебютов пользователя («Тактика» → «Мои дебюты»)
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS opening_key text;
CREATE INDEX IF NOT EXISTS puzzles_opening_key_idx ON puzzles (opening_key);

ALTER TABLE trap_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON trap_progress;
CREATE POLICY "allow all" ON trap_progress FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE position_explorer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON position_explorer;
CREATE POLICY "allow all" ON position_explorer FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE sprint_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON sprint_log;
CREATE POLICY "allow all" ON sprint_log FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS trap_progress_next_review_idx ON trap_progress (next_review);
CREATE INDEX IF NOT EXISTS sprint_log_played_at_idx ON sprint_log (played_at DESC);
