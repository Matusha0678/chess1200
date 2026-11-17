-- T8: добавить kind 'personal' в таблицу courses
-- Безопасно для повторного запуска

-- Если есть CHECK constraint на kind, расширяем его
-- Сначала проверяем и удаляем старый constraint (если есть)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'courses'
      AND constraint_name = 'courses_kind_check'
  ) THEN
    ALTER TABLE courses DROP CONSTRAINT courses_kind_check;
  END IF;
END$$;

-- Добавляем новый constraint, включающий 'personal'
ALTER TABLE courses ADD CONSTRAINT courses_kind_check
  CHECK (kind IN ('opening','theme','endgame','tactics','structure','games','personal'));
