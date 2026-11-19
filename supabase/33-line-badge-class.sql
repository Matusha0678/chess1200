-- adds badge and line_class columns to opening_lines (safe to re-run)
ALTER TABLE opening_lines
  ADD COLUMN IF NOT EXISTS badge text,
  ADD COLUMN IF NOT EXISTS line_class text;
