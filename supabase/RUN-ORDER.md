# Порядок выполнения SQL-файлов

Выполняй по порядку в Supabase SQL editor. Каждый файл безопасен для повторного запуска.

| Файл | Описание |
|------|----------|
| schema.sql | Базовые таблицы и типы |
| openings-schema.sql | Таблицы дебютов |
| 01-games.sql | games, game_analysis |
| 02-mistakes.sql | mistake_cards |
| 03-threats.sql | threat_log |
| 04-endgames.sql | endgame_log |
| 05-plans.sql | plans, idea_progress |
| 06-game-log.sql | game_log |
| 07-traps.sql | traps |
| 08-lesson-tests.sql | lesson_tests |
| 09-deviation.sql | deviation_log |
| 10-explain-log.sql | explain_log |
| 11-course-kinds.sql | Добавляет kind 'openings' в courses |
| 12-course-paths.sql | course_paths |
| 13-opening-guess.sql | opening_guess_log |
| 14-masters.sql | master_games |
| 15-sac.sql | sac_positions, sac_log |
| 16-master-hash-scan.sql | master_hash_scan |
| 17-master-moments.sql | master_moments (T2) |
| 18-lesson-notes.sql | lesson_notes (T6) |
| 19-courses-personal.sql | Добавляет kind 'personal' в courses (T8) |
| 20-eval-log.sql | eval_log (T10) |
| 21-exam-log.sql | exam_log (T11) |
| 22-daily-picks.sql | daily_picks (T12) |
| 23-warmup-log.sql | warmup_log (T13) |
| 24-week-focus.sql | week_focus (T14) |
| 25-move-classes.sql | classification columns in game_analysis/games |
| 26-course-cascade.sql | cascade deletes on course-related tables |
| 27-sac-context.sql | game_id/ply/san/eval_no_sac/pv/defenses в sac_positions |
