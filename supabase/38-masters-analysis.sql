-- «Угадай ход» на странице партии мастера (docs/design/pages/masters/MASTERS.md, раздел 2.3). Safe to re-run.
-- Анализ партии храним целиком (все полуходы, топ-3 движка) — моменты считаются на странице для любой стороны и режима.
ALTER TABLE master_games
  ADD COLUMN IF NOT EXISTS analysis         jsonb,
  ADD COLUMN IF NOT EXISTS analysis_version int,
  ADD COLUMN IF NOT EXISTS analysis_at      timestamptz;
ALTER TABLE guess_log
  ADD COLUMN IF NOT EXISTS mode    text,
  ADD COLUMN IF NOT EXISTS skip    int,
  ADD COLUMN IF NOT EXISTS moments jsonb;
