create table if not exists rating_history (
  id bigserial primary key,
  date date not null unique,
  rating integer not null,
  created_at timestamptz default now()
);

create table if not exists daily_progress (
  id bigserial primary key,
  day_number integer not null unique,
  date date not null,
  block_warmup boolean default false,
  block_theme boolean default false,
  block_game boolean default false,
  block_review boolean default false,
  xp_earned integer default 0,
  day_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists game_logs (
  id bigserial primary key,
  chess_com_id text not null unique,
  played_at date not null,
  time_control text not null,
  result text not null,
  castling_move integer,
  pgn text,
  created_at timestamptz default now()
);

create table if not exists mistake_notebook (
  id bigserial primary key,
  date date not null,
  mistake_text text not null,
  better_move text not null,
  tag text not null,
  game_log_id bigint references game_logs(id),
  created_at timestamptz default now()
);

create table if not exists badges (
  id bigserial primary key,
  badge_key text not null unique,
  earned_at timestamptz default now()
);

create table if not exists streak (
  id bigserial primary key,
  current_streak integer default 0,
  longest_streak integer default 0,
  freeze_used_this_week boolean default false,
  freeze_available boolean default true,
  last_completed_date date,
  week_number integer default 0,
  updated_at timestamptz default now()
);

create table if not exists user_xp (
  id bigserial primary key,
  total_xp integer default 0,
  level integer default 1,
  updated_at timestamptz default now()
);
