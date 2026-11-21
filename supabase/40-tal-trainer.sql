-- Тренер Таль — run once in Supabase SQL Editor (safe to re-run)

CREATE TABLE IF NOT EXISTS tal_daily_log (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date       date NOT NULL,
  task_key   text NOT NULL,
  value      integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT tal_daily_log_date_task_key UNIQUE(date, task_key)
);

CREATE TABLE IF NOT EXISTS tal_chat (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tal_daily_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tal_chat      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all" ON tal_daily_log;
CREATE POLICY "allow all" ON tal_daily_log FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow all" ON tal_chat;
CREATE POLICY "allow all" ON tal_chat FOR ALL USING (true) WITH CHECK (true);
