-- 27: контекст для позиций «Жертвовать или нет?»
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS game_id     uuid REFERENCES master_games(id) ON DELETE SET NULL;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS ply         integer;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS san         text;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS eval_no_sac integer;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS best_no_sac text;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS pv          text;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS defenses    jsonb DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS sac_positions_game_id_idx ON sac_positions (game_id);
