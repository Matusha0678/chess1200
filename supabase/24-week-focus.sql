-- T14: week_focus — тема недели
-- Безопасно для повторного запуска

CREATE TABLE IF NOT EXISTS week_focus (
  week_start  date PRIMARY KEY,
  theme       text NOT NULL,
  reason      text NOT NULL DEFAULT '',
  chosen_by   text NOT NULL DEFAULT 'auto'  -- 'auto' | 'manual'
);

ALTER TABLE week_focus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all week_focus" ON week_focus;
CREATE POLICY "allow all week_focus" ON week_focus
  FOR ALL USING (true) WITH CHECK (true);
