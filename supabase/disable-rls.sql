-- Disable RLS for all tables (single-user app, no auth needed)
alter table rating_history  disable row level security;
alter table daily_progress  disable row level security;
alter table game_logs       disable row level security;
alter table mistake_notebook disable row level security;
alter table badges          disable row level security;
alter table streak          disable row level security;
alter table user_xp         disable row level security;
