-- Тренер Таль (новая страница /tal) — run once in Supabase SQL Editor (safe to re-run)
-- Запускать ПОСЛЕ 40-tal-trainer.sql.

CREATE TABLE IF NOT EXISTS coach_plans (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date       date NOT NULL,
  version    integer NOT NULL DEFAULT 1,
  plan       jsonb NOT NULL,
  reason     text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT coach_plans_date_version UNIQUE (date, version)
);

CREATE TABLE IF NOT EXISTS coach_item_marks (
  date       date NOT NULL,
  item_key   text NOT NULL,
  done       boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, item_key)
);

CREATE TABLE IF NOT EXISTS coach_settings (
  id              integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  daily_minutes   integer NOT NULL DEFAULT 120,
  goal_rating     integer NOT NULL DEFAULT 1200,
  big_goal_rating integer NOT NULL DEFAULT 2000,
  book_title      text,
  book_page       integer,
  videos          jsonb NOT NULL DEFAULT '[]'::jsonb
);
INSERT INTO coach_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE tal_chat ADD COLUMN IF NOT EXISTS kind    text NOT NULL DEFAULT 'text';
ALTER TABLE tal_chat ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES coach_plans(id) ON DELETE SET NULL;

ALTER TABLE coach_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_item_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_settings   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all" ON coach_plans;
CREATE POLICY "allow all" ON coach_plans FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow all" ON coach_item_marks;
CREATE POLICY "allow all" ON coach_item_marks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow all" ON coach_settings;
CREATE POLICY "allow all" ON coach_settings FOR ALL USING (true) WITH CHECK (true);
