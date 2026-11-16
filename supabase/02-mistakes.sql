-- safe to re-run, run after 01-games.sql

-- ── Add analyzed_at to games ─────────────────────────────────────────────────
ALTER TABLE games ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- ── game_analysis: one row per move in a game ────────────────────────────────
CREATE TABLE IF NOT EXISTS game_analysis (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id      uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number  integer NOT NULL,
  color        text NOT NULL CHECK (color IN ('w','b')),
  san          text NOT NULL,
  fen_before   text NOT NULL,
  eval_before  integer,       -- cp, white's POV (from chess.com %eval)
  eval_after   integer,       -- cp, white's POV
  best_move    text NOT NULL DEFAULT '',  -- UCI, filled by Stockfish
  UNIQUE(game_id, move_number, color)
);

-- ── mistake_cards: spaced-repetition cards ───────────────────────────────────
CREATE TABLE IF NOT EXISTS mistake_cards (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id         uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  game_analysis_id uuid REFERENCES game_analysis(id) ON DELETE SET NULL,
  fen_before      text NOT NULL,
  my_move         text NOT NULL,  -- SAN
  best_move       text NOT NULL DEFAULT '',  -- UCI
  eval_before     integer,        -- cp, white's POV
  eval_loss       integer NOT NULL,  -- always positive cp
  phase           text NOT NULL CHECK (phase IN ('opening','middlegame','endgame')),
  tag             text NOT NULL CHECK (tag IN ('hanging','missed_check','missed_tactic','positional')),
  mastery         integer NOT NULL DEFAULT 0,
  correct_count   integer NOT NULL DEFAULT 0,
  incorrect_count integer NOT NULL DEFAULT 0,
  last_practiced  timestamptz,
  next_review     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(game_id, fen_before, my_move)
);

-- ── RLS (open, like games table) ─────────────────────────────────────────────
ALTER TABLE game_analysis  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistake_cards   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON game_analysis;
CREATE POLICY "allow all" ON game_analysis  FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow all" ON mistake_cards;
CREATE POLICY "allow all" ON mistake_cards   FOR ALL USING (true) WITH CHECK (true);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS game_analysis_game_id_idx       ON game_analysis (game_id);
CREATE INDEX IF NOT EXISTS mistake_cards_next_review_idx   ON mistake_cards (next_review);
CREATE INDEX IF NOT EXISTS mistake_cards_game_id_idx       ON mistake_cards (game_id);
CREATE INDEX IF NOT EXISTS mistake_cards_tag_idx           ON mistake_cards (tag);
CREATE INDEX IF NOT EXISTS mistake_cards_phase_idx         ON mistake_cards (phase);
