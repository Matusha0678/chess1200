-- Add line_type and line_emoji fields to opening_lines
ALTER TABLE opening_lines
  ADD COLUMN IF NOT EXISTS line_type text
    CHECK (line_type IS NULL OR line_type IN ('common', 'sharp', 'rare'));

ALTER TABLE opening_lines
  ADD COLUMN IF NOT EXISTS line_emoji text;
