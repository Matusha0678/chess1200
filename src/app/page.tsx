'use client';

import { useState, useEffect } from 'react';
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
  const [counts, setCounts] = useState<DayCounts | null>(null);

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
