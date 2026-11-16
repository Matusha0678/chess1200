-- idea_progress: spaced-repetition progress for "Идея позиции" cards
-- idea_key format: {lesson_id}:idea:{sequential_index}
CREATE TABLE IF NOT EXISTS idea_progress (
  idea_key    text        NOT NULL PRIMARY KEY,
  mastery     integer     NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 5),
  next_review timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE idea_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON idea_progress;
CREATE POLICY "allow all" ON idea_progress FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idea_progress_next_review_idx ON idea_progress (next_review);
