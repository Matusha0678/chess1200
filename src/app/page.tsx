'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

import { supabase } from '@/lib/supabase';

const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DAY_NAMES   = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

// ── T14: Тема недели ──────────────────────────────────────────────────────────

interface WeekTheme {
  id: string;
  label: string;
  reason: string;
  trainers: Array<{ label: string; href: string }>;
}

const WEEK_THEMES: WeekTheme[] = [
  {
    id: 'hanging',
    label: 'Зевки фигур',
    reason: '',
    trainers: [
      { label: 'Проверка угроз',    href: '/threats' },
      { label: 'Банк ошибок',       href: '/mistakes?tag=hanging' },
      { label: 'Оцени позицию',     href: '/evaluate' },
    ],
  },
  {
    id: 'missed_tactic',
    label: 'Пропущенная тактика',
    reason: '',
    trainers: [
      { label: 'Жертвы',            href: '/sac' },
      { label: 'Банк ошибок',       href: '/mistakes?tag=missed_tactic' },
      { label: 'Угадай ход',        href: '/masters' },
    ],
  },
  {
    id: 'endgame',
    label: 'Эндшпили',
    reason: '',
    trainers: [
      { label: 'Эндшпили',          href: '/endgames' },
      { label: 'Мастера (эндшпиль)', href: '/masters' },
    ],
  },
  {
    id: 'deviation',
    label: 'Дебют',
    reason: '',
    trainers: [
      { label: 'Экзамен дебюта',    href: '/openings' },
      { label: 'Дебютный спринт',   href: '/sprint' },
      { label: 'Дебюты',            href: '/openings' },
    ],
  },
  {
    id: 'middlegame',
    label: 'Миттельшпиль',
    reason: '',
    trainers: [
      { label: 'Оцени позицию',     href: '/evaluate' },
      { label: 'Идеи позиций',      href: '/plans' },
    ],
  },
];

/** Returns Monday of the current week as YYYY-MM-DD */
function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

interface WeekFocusState {
  theme: WeekTheme;
  reason: string;
  chosenBy: 'auto' | 'manual';
  progress: number; // tasks done this week
  sqlMissing: boolean;
}

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
    key: 'sprint',
    label: 'Дебютный спринт',
    count: counts.guessedToday ? 1 : 0,
    href: '/sprint',
    hint: counts.guessedToday ? 'Сегодня уже сыграно' : 'Позиции из твоих линий на время',
    cta: counts.guessedToday ? 'Повторить' : 'Старт',
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
  const [counts, setCounts]           = useState<DayCounts | null>(null);
  const [dailyGame, setDailyGame]     = useState<DailyGame | null>(null);
  const [dailyComb, setDailyComb]     = useState<DailyCombination | null>(null);
  const [weekFocus, setWeekFocus]     = useState<WeekFocusState | null>(null);
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

  // T14: Тема недели
  useEffect(() => {
    (async () => {
      const weekStart = getWeekStart();
      const weekEnd = (() => {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
      })();

      // Try to load from week_focus table
      const { data: existing, error: fetchErr } = await supabase
        .from('week_focus')
        .select('theme, reason, chosen_by')
        .eq('week_start', weekStart)
        .maybeSingle();

      if (fetchErr?.code === '42P01') {
        // Table doesn't exist yet — use default theme without crash
        const def = WEEK_THEMES[0];
        setWeekFocus({ theme: def, reason: '', chosenBy: 'auto', progress: 0, sqlMissing: true });
        return;
      }

      let themeId: string;
      let reason: string;
      let chosenBy: 'auto' | 'manual' = 'auto';

      if (existing) {
        themeId = (existing as { theme: string; reason: string; chosen_by: string }).theme;
        reason = (existing as { theme: string; reason: string; chosen_by: string }).reason;
        chosenBy = (existing as { theme: string; reason: string; chosen_by: string }).chosen_by as 'auto' | 'manual';
      } else {
        // Auto-select: pick theme with most mistakes in last 30 days
        const since = (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().slice(0, 10);
        })();
        const { data: mistakeData } = await supabase
          .from('mistake_cards')
          .select('tag')
          .gte('created_at', since + 'T00:00:00');

        const tagCounts: Record<string, number> = { hanging: 0, missed_tactic: 0, endgame: 0, deviation: 0, middlegame: 0 };
        const total = (mistakeData ?? []).length;
        for (const row of (mistakeData ?? []) as Array<{ tag: string }>) {
          const t = row.tag;
          if (t in tagCounts) tagCounts[t]++;
        }

        // Pick the theme with the most matching tag
        let bestTag = 'hanging';
        let bestCount = 0;
        for (const [tag, cnt] of Object.entries(tagCounts)) {
          if (cnt > bestCount) { bestCount = cnt; bestTag = tag; }
        }

        themeId = bestTag;
        const themeLabel = WEEK_THEMES.find(t => t.id === bestTag)?.label ?? 'Зевки фигур';
        reason = total > 0
          ? `${themeLabel}: ${bestCount} из ${total} ошибок за 30 дней`
          : 'Нет данных об ошибках — используем тему по умолчанию';

        // Persist choice
        await supabase.from('week_focus').upsert({ week_start: weekStart, theme: themeId, reason, chosen_by: 'auto' });
      }

      const theme = WEEK_THEMES.find(t => t.id === themeId) ?? WEEK_THEMES[0];

      // Count progress this week: tasks done in various logs
      const [threatLogRes, mistakeLogRes, sacLogRes, evalLogRes, examLogRes, endgameLogRes] = await Promise.all([
        supabase.from('threat_log').select('id', { count: 'exact', head: true }).gte('played_at', weekStart + 'T00:00:00').lt('played_at', weekEnd + 'T00:00:00'),
        supabase.from('mistake_cards').select('id', { count: 'exact', head: true }).gte('last_practiced', weekStart + 'T00:00:00').lt('last_practiced', weekEnd + 'T00:00:00'),
        supabase.from('sac_log').select('id', { count: 'exact', head: true }).gte('played_at', weekStart + 'T00:00:00').lt('played_at', weekEnd + 'T00:00:00'),
        supabase.from('eval_log').select('id', { count: 'exact', head: true }).gte('played_at', weekStart + 'T00:00:00').lt('played_at', weekEnd + 'T00:00:00'),
        supabase.from('exam_log').select('id', { count: 'exact', head: true }).gte('taken_at', weekStart + 'T00:00:00').lt('taken_at', weekEnd + 'T00:00:00'),
        supabase.from('endgame_log').select('id', { count: 'exact', head: true }).gte('played_at', weekStart + 'T00:00:00').lt('played_at', weekEnd + 'T00:00:00'),
      ]);

      const progress = Math.min(10,
        (threatLogRes.count ?? 0) +
        (mistakeLogRes.count ?? 0) +
        (sacLogRes.count ?? 0) +
        (evalLogRes.count ?? 0) +
        (examLogRes.count ?? 0) +
        (endgameLogRes.count ?? 0),
      );

      // Store trainer hrefs in localStorage for sidebar badge
      try {
        localStorage.setItem('chess1200-week-focus', JSON.stringify({
          theme: themeId,
          trainers: theme.trainers.map(t => t.href.split('?')[0]),
        }));
      } catch { /* ignore */ }

      setWeekFocus({ theme, reason, chosenBy, progress, sqlMissing: false });
    })();
  }, []);

  async function changeWeekTheme(themeId: string) {
    const theme = WEEK_THEMES.find(t => t.id === themeId) ?? WEEK_THEMES[0];
    const weekStart = getWeekStart();
    await supabase.from('week_focus').upsert({ week_start: weekStart, theme: themeId, reason: 'Выбрано вручную', chosen_by: 'manual' });
    try {
      localStorage.setItem('chess1200-week-focus', JSON.stringify({
        theme: themeId,
        trainers: theme.trainers.map(t => t.href.split('?')[0]),
      }));
    } catch { /* ignore */ }
    setWeekFocus(prev => prev ? { ...prev, theme, reason: 'Выбрано вручную', chosenBy: 'manual' } : null);
  }

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

      {/* T14: Тема недели */}
      {weekFocus && !weekFocus.sqlMissing && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="ui-eyebrow">
            <span>Тема недели</span>
            <span className="ui-eyebrow-line" />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{weekFocus.progress}/10</span>
          </div>
          <div className="ui-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ivory)', marginBottom: 2 }}>{weekFocus.theme.label}</div>
                {weekFocus.reason && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{weekFocus.reason}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)' }}>{weekFocus.progress}/10</div>
                <div style={{ width: 80, height: 4, background: 'var(--surface)', borderRadius: 'var(--radius-btn)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, weekFocus.progress * 10)}%`, background: 'var(--accent)', transition: 'width 300ms', borderRadius: 'inherit' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {weekFocus.theme.trainers.slice(0, 1).map(tr => (
                <Link key={tr.href} href={tr.href}
                  className="ui-btn ui-btn-primary"
                  style={{ fontSize: 13, height: 34, padding: '0 16px' }}>
                  Тренировать тему
                </Link>
              ))}
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <select
                  value={weekFocus.theme.id}
                  onChange={e => void changeWeekTheme(e.target.value)}
                  style={{ height: 34, padding: '0 10px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 'var(--radius-btn)' }}
                >
                  {WEEK_THEMES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>
      )}
      {weekFocus?.sqlMissing && (
        <div style={{ padding: '10px 14px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 13, color: 'var(--muted)' }}>
          Выполни <strong>supabase/24-week-focus.sql</strong>, чтобы включить «Тему недели».
        </div>
      )}

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

      {/* Daily picks (T12) + Warmup (T13) */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="ui-eyebrow">
          <span>На сегодня</span>
          <span className="ui-eyebrow-line" />
        </div>
        <Link href="/warmup" className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none', color: 'inherit', padding: '14px 18px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-btn)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
            {`5'`}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 2 }}>Разминка 5 минут</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Угрозы, линия, ловушка, ошибка</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>Начать →</div>
        </Link>
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
            <div className="stat-label">дней подряд</div>
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
