-- 28: «Жертвы» v2 — умный отбор
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS version        integer NOT NULL DEFAULT 1;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS sac_type       text;      -- 'mate' | 'combination' | 'real'
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS piece          text;      -- 'n' | 'b' | 'r' | 'q'
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS material_given integer;   -- |d(2)| в пешках
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS king_attack    boolean DEFAULT false;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS mate_in        integer;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS mate_forced    boolean DEFAULT false;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS score          integer;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS accepted_pv    text;      -- UCI через пробел
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS pattern        text;
ALTER TABLE sac_positions ADD COLUMN IF NOT EXISTS is_decoy       boolean DEFAULT false;
ALTER TABLE master_games  ADD COLUMN IF NOT EXISTS sac_version    integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS sac_positions_version_idx ON sac_positions (version);
