-- Openings (e.g., "Scotch Game", "King's Gambit")
create table if not exists openings (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  eco_code text,
  color text default 'white' check (color in ('white', 'black', 'both')),
  pgn text not null,
  total_lines integer default 0,
  created_at timestamptz default now()
);

-- Individual lines (paths through the variation tree)
create table if not exists opening_lines (
  id uuid default gen_random_uuid() primary key,
  opening_id uuid references openings on delete cascade,
  line_index integer not null,
  moves jsonb not null,  -- ChessMove[]
  created_at timestamptz default now()
);

-- Progress tracking per line (spaced repetition)
create table if not exists line_progress (
  id uuid default gen_random_uuid() primary key,
  line_id uuid references opening_lines on delete cascade,
  correct_count integer default 0,
  incorrect_count integer default 0,
  last_practiced timestamptz,
  next_review timestamptz default now(),
  mastery integer default 0,  -- 0: new, 1-4: learning, 5: mastered
  unique(line_id)
);
