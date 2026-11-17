'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

import { supabase } from '@/lib/supabase';

const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DAY_NAMES   = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

interface DayCounts {
  openingsDue:  number;
  mistakesDue:  number;
  ideasDue:     number;
  guessedToday: boolean;
  totalLines:   number;
  totalMastered: number;
  streak:       number;
}

interface DailyGame {
  id: string;
  white: string;
  black: string;
  year: number | null;
  event: string;
  result: string;
  done: boolean;
}

interface DailyCombination {
  id: string;
  fen: string;
  kind: string;
  done: boolean;
}

function plural(n: number, one: string, few: string, many: string) {
  const m100 = n % 100, m10 = n % 10;
  if (m100 >= 11 && m100 <= 19) return `${n} ${many}`;
  if (m10 === 1) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

function calcStreak(practicedAts: string[]): number {
  if (practicedAts.length === 0) return 0;
  const unique = [...new Set(practicedAts.map(d => d.slice(0, 10)))].sort().reverse();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const yday = new Date(today); yday.setDate(yday.getDate() - 1);
  const ydayStr = yday.toISOString().slice(0, 10);
  if (unique[0] !== todayStr && unique[0] !== ydayStr) return 0;
  let streak = 0, checkStr = unique[0];
  for (const d of unique) {
    if (d === checkStr) {
      streak++;
      const next = new Date(checkStr + 'T00:00:00'); next.setDate(next.getDate() - 1);
      checkStr = next.toISOString().slice(0, 10);
    } else break;
  }
  return streak;
}

interface Task {
  key: string;
  label: string;
  count: number;
  href: string;
  hint: string;
  cta: string;
  done?: boolean;
}

function buildPlan(counts: DayCounts): Task[] {
  const tasks: Task[] = [];
  if (counts.openingsDue > 0) {
    tasks.push({
      key: 'openings',
      label: 'Повторить дебюты',
      count: counts.openingsDue,
      href: '/openings',
      hint: `${plural(counts.openingsDue, 'линия ждёт повторения', 'линии ждут повторения', 'линий ждут повторения')}`,
      cta: 'К дебютам',
    });
  }
  if (counts.mistakesDue > 0) {
    tasks.push({
      key: 'mistakes',
      label: 'Разобрать ошибки',
      count: counts.mistakesDue,
      href: '/mistakes',
      hint: `${plural(counts.mistakesDue, 'карточка', 'карточки', 'карточек')} в банке ошибок`,
      cta: 'Решать',
    });
  }
  if (counts.ideasDue > 0) {
    tasks.push({
      key: 'ideas',
      label: 'Идеи позиций',
      count: counts.ideasDue,
      href: '/plans',
      hint: `${plural(counts.ideasDue, 'идея', 'идеи', 'идей')} на повторении`,
      cta: 'Повторить',
    });
  }
  tasks.push({
    key: 'guess',
    label: 'Угадай дебют',
    count: counts.guessedToday ? 1 : 0,
    href: '/guess-opening',
    hint: counts.guessedToday ? 'Сегодня уже сыграно' : 'Ежедневная игра — 1 раунд в день',
    cta: counts.guessedToday ? 'Тренировка' : 'Играть',
    done: counts.guessedToday,
  });
  if (tasks.length < 3) {
    tasks.push({
      key: 'endgames',
      label: 'Эндшпиль дня',
      count: 1,
      href: '/endgames',
      hint: 'Случайная позиция — отработай технику',
      cta: 'Выбрать',
    });
  }
  return tasks.slice(0, 5);
}

export default function HomePage() {
  const [counts, setCounts]       = useState<DayCounts | null>(null);
  const [dailyGame, setDailyGame] = useState<DailyGame | null>(null);
  const [dailyComb, setDailyComb] = useState<DailyCombination | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Load daily picks (T12)
  useEffect(() => {
    (async () => {
      // Check daily_picks table
      const { data: picks, error } = await supabase.from('daily_picks').select('*').eq('day', today);
      if (error) return; // table may not exist yet

      const pickMap: Record<string, { ref_id: string; done: boolean }> = {};
      for (const p of (picks ?? []) as Array<{ kind: string; ref_id: string; done: boolean }>) {
        pickMap[p.kind] = p;
      }

      // Game pick
      let gamePick = pickMap['game'];
      if (!gamePick) {
        // Deterministic pick: use day seed to pick from master_games
        const { data: gamesData } = await supabase.from('master_games').select('id').limit(200);
        const games = (gamesData ?? []) as Array<{ id: string }>;
        if (games.length > 0) {
          const seed = new Date(today).getTime();
          const idx = seed % games.length;
          const ref_id = games[Math.abs(idx) % games.length].id;
          await supabase.from('daily_picks').upsert({ day: today, kind: 'game', ref_id, done: false, score: 0 });
          gamePick = { ref_id, done: false };
        }
      }
      if (gamePick) {
        const { data: g } = await supabase.from('master_games').select('id, white, black, year, event, result').eq('id', gamePick.ref_id).maybeSingle();
        if (g) setDailyGame({ ...(g as DailyGame), done: gamePick.done });
      }

      // Combination pick
      let combPick = pickMap['combination'];
      if (!combPick) {
        const { data: combs } = await supabase.from('sac_positions').select('id, fen, kind').eq('kind', 'real').limit(100);
        const combArr = (combs ?? []) as Array<{ id: string; fen: string; kind: string }>;
        if (combArr.length > 0) {
          const seed = new Date(today).getTime() + 1;
          const idx = Math.abs(seed) % combArr.length;
          const c = combArr[idx];
          await supabase.from('daily_picks').upsert({ day: today, kind: 'combination', ref_id: c.id, done: false, score: 0 });
          combPick = { ref_id: c.id, done: false };
          setDailyComb({ id: c.id, fen: c.fen, kind: c.kind, done: false });
        }
      } else {
        const { data: c } = await supabase.from('sac_positions').select('id, fen, kind').eq('id', combPick.ref_id).maybeSingle();
        if (c) setDailyComb({ ...(c as { id: string; fen: string; kind: string }), done: combPick.done });
      }
    })();
  }, [today]);

  useEffect(() => {
    (async () => {
      const now = new Date().toISOString();
      const today = new Date().toISOString().slice(0, 10);

      const [lineProgRes, mistakesRes, ideasRes, guessRes, totalLinesRes] = await Promise.all([
        supabase.from('line_progress').select('mastery, next_review, last_practiced'),
        supabase.from('mistake_cards').select('id', { count: 'exact', head: true }).lte('next_review', now),
        supabase.from('idea_progress').select('id', { count: 'exact', head: true }).lte('next_review', now),
        supabase.from('opening_guess_log').select('score').eq('day', today).maybeSingle(),
        supabase.from('opening_lines').select('id', { count: 'exact', head: true }),
      ]);

      const progress = lineProgRes.data ?? [];
      const openingsDue = progress.filter((p: { next_review: string; mastery: number }) =>
        p.mastery < 5 && p.next_review && p.next_review <= now
      ).length;
      const mastered = progress.filter((p: { mastery: number }) => p.mastery >= 5).length;
      const practicedAts = progress
        .map((p: { last_practiced: string | null }) => p.last_practiced)
        .filter((s: string | null): s is string => !!s);
      const streak = calcStreak(practicedAts);

      setCounts({
        openingsDue,
        mistakesDue:  mistakesRes.count ?? 0,
        ideasDue:     ideasRes.count ?? 0,
        guessedToday: !!guessRes.data,
        totalLines:   totalLinesRes.count ?? 0,
        totalMastered: mastered,
        streak,
      });
    })();
  }, []);

  if (!counts) {
    return (
      <div className="page">
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
      </div>
    );
  }

  const now = new Date();
  const dateLabel = `${DAY_NAMES[now.getDay()]}, ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;
  const plan = buildPlan(counts);
  const pendingTasks = plan.filter(t => !t.done && t.count > 0);
  const startHref = pendingTasks[0]?.href ?? plan[0]?.href ?? '/openings';

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Сегодня</h1>
          <p className="page-lead">
            {dateLabel}
            {counts.streak > 0 && (
              <> · серия <strong style={{ color: 'var(--ivory)' }}>{plural(counts.streak, 'день', 'дня', 'дней')}</strong></>
            )}
          </p>
        </div>
        <Link href={startHref} className="ui-btn ui-btn-primary ui-btn-lg">
          Начать
        </Link>
      </div>

      {/* Plan */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="ui-eyebrow">
          <span>План на сегодня</span>
          <span className="ui-eyebrow-line" />
          <span>{plan.length}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plan.map(t => (
            <Link
              key={t.key}
              href={t.href}
              className="ui-card"
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                textDecoration: 'none', color: 'inherit',
                padding: '14px 18px',
                opacity: t.done ? 0.65 : 1,
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-btn)',
                background: t.done ? 'var(--surface)' : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: t.done ? 'var(--muted)' : 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700, flexShrink: 0,
                fontFamily: 'var(--font-inter-tight, Inter Tight, Inter, sans-serif)',
              }}>
                {t.done ? '✓' : t.count}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 2 }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t.hint}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>
                {t.cta} →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Daily picks (T12) */}
      {(dailyGame || dailyComb) && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="ui-eyebrow">
            <span>На сегодня</span>
            <span className="ui-eyebrow-line" />
          </div>
          {dailyGame && (
            <Link href={`/masters/${dailyGame.id}`} className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none', color: 'inherit', padding: '14px 18px', opacity: dailyGame.done ? 0.65 : 1 }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-btn)', background: dailyGame.done ? 'var(--surface)' : 'color-mix(in srgb, var(--accent) 15%, transparent)', color: dailyGame.done ? 'var(--muted)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {dailyGame.done ? '✓' : '♛'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 2 }}>Партия дня</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{dailyGame.white} — {dailyGame.black}{dailyGame.year ? ` · ${dailyGame.year}` : ''}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>Смотреть →</div>
            </Link>
          )}
          {dailyComb && (
            <Link href="/sac" className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none', color: 'inherit', padding: '14px 18px', opacity: dailyComb.done ? 0.65 : 1 }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-btn)', background: dailyComb.done ? 'var(--surface)' : 'color-mix(in srgb, var(--accent) 15%, transparent)', color: dailyComb.done ? 'var(--muted)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {dailyComb.done ? '✓' : '⚔'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 2 }}>Комбинация дня</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Жертвовать или нет?</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>Играть →</div>
            </Link>
          )}
        </section>
      )}

      {/* Stats */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="ui-eyebrow">
          <span>Статистика</span>
          <span className="ui-eyebrow-line" />
          <span>репертуар</span>
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{counts.streak}</div>
            <div className="stat-label">{plural(counts.streak, 'день подряд', 'дня подряд', 'дней подряд')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{counts.totalLines}</div>
            <div className="stat-label">линий всего</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{counts.totalMastered}</div>
            <div className="stat-label">изучено</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{counts.openingsDue + counts.mistakesDue + counts.ideasDue}</div>
            <div className="stat-label">на повторении</div>
          </div>
        </div>
      </section>
    </div>
  );
}
