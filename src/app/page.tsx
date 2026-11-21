'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

import { supabase } from '@/lib/supabase';
import { MiniBoard } from '@/components/board/MiniBoard';

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
  keyFen?: string | null;
}

interface DailyCombination {
  id: string;
  fen: string;
  kind: string;
  done: boolean;
}

interface DailyOpening {
  id: string;
  name: string;
  color: 'white' | 'black' | 'both';
  previewFen: string;
  totalLines: number;
  dueNow: number;
}

function plural(n: number, one: string, few: string, many: string) {
  const m100 = n % 100, m10 = n % 10;
  if (m100 >= 11 && m100 <= 19) return `${n} ${many}`;
  if (m10 === 1) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return plural(mins, 'минуту назад', 'минуты назад', 'минут назад');
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return plural(hrs, 'час назад', 'часа назад', 'часов назад');
  const days = Math.floor(hrs / 24);
  if (days < 30) return plural(days, 'день назад', 'дня назад', 'дней назад');
  const months = Math.floor(days / 30);
  return plural(months, 'месяц назад', 'месяца назад', 'месяцев назад');
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

interface RecentOpening {
  openingId: string;
  openingName: string;
  color: 'white' | 'black' | 'both';
  lastPracticed: string;
  masteryAvg: number;
  totalLines: number;
  dueNow: number;
  previewFen: string;
}

export default function HomePage() {
  const [counts, setCounts]           = useState<DayCounts | null>(null);
  const [dailyGame, setDailyGame]     = useState<DailyGame | null>(null);
  const [dailyComb, setDailyComb]     = useState<DailyCombination | null>(null);
  const [weekFocus, setWeekFocus]     = useState<WeekFocusState | null>(null);
  const [recentOpenings, setRecentOpenings] = useState<RecentOpening[]>([]);
  const [topInsight, setTopInsight] = useState<import('@/lib/insights-analyzer').Insight | null>(null);
  const [dailyOpening, setDailyOpening] = useState<DailyOpening | null>(null);
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
        if (g) {
          const { data: mm } = await supabase.from('master_moments')
            .select('fen').eq('game_id', gamePick.ref_id).order('ply', { ascending: true }).limit(1);
          const keyFen = (mm && mm.length > 0) ? (mm[0] as { fen: string }).fen : null;
          setDailyGame({ ...(g as DailyGame), done: gamePick.done, keyFen });
        }
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

  // Recent openings (top 3 most recently practiced)
  useEffect(() => {
    (async () => {
      const nowIso = new Date().toISOString();
      const { data: lp } = await supabase
        .from('line_progress')
        .select('line_id, mastery, last_practiced, next_review')
        .not('last_practiced', 'is', null)
        .order('last_practiced', { ascending: false })
        .limit(60);
      if (!lp || lp.length === 0) return;

      // Map line_id → opening_id
      const lineIds = (lp as Array<{ line_id: string }>).map(r => r.line_id);
      const { data: linesData } = await supabase
        .from('opening_lines').select('id, opening_id').in('id', lineIds);
      const lineToOpening = new Map<string, string>();
      for (const l of (linesData ?? []) as Array<{ id: string; opening_id: string }>) {
        lineToOpening.set(l.id, l.opening_id);
      }

      // Group: opening_id → earliest last_practiced in the recent set
      const openingLastPracticed = new Map<string, string>();
      for (const row of lp as Array<{ line_id: string; last_practiced: string }>) {
        const oid = lineToOpening.get(row.line_id);
        if (!oid) continue;
        if (!openingLastPracticed.has(oid)) openingLastPracticed.set(oid, row.last_practiced);
      }

      const openingIds = Array.from(openingLastPracticed.keys()).slice(0, 3);
      if (openingIds.length === 0) return;

      const { data: openingsData } = await supabase
        .from('openings').select('id, name, color').in('id', openingIds);
      const openingMap = new Map<string, { id: string; name: string; color: 'white' | 'black' | 'both' }>();
      for (const o of (openingsData ?? []) as Array<{ id: string; name: string; color: 'white' | 'black' | 'both' }>) {
        openingMap.set(o.id, o);
      }

      // Aggregate stats per opening + preview FEN
      const { data: allLinesData } = await supabase
        .from('opening_lines').select('id, opening_id, moves').in('opening_id', openingIds);
      const openingToLineIds = new Map<string, string[]>();
      const openingToPreviewFen = new Map<string, string>();
      for (const l of (allLinesData ?? []) as Array<{ id: string; opening_id: string; moves: unknown }>) {
        if (!openingToLineIds.has(l.opening_id)) openingToLineIds.set(l.opening_id, []);
        openingToLineIds.get(l.opening_id)!.push(l.id);
        // Capture preview FEN from the first line's ~6th ply
        if (!openingToPreviewFen.has(l.opening_id) && Array.isArray(l.moves) && l.moves.length > 0) {
          const moves = l.moves as Array<{ fen?: string }>;
          const idx = Math.min(moves.length - 1, 5);
          const fen = moves[idx]?.fen;
          if (fen) openingToPreviewFen.set(l.opening_id, fen);
        }
      }

      const allLineIds = Array.from(openingToLineIds.values()).flat();
      const { data: progsData } = await supabase
        .from('line_progress').select('line_id, mastery, next_review').in('line_id', allLineIds);
      const progsByLine = new Map<string, { mastery: number; next_review: string | null }>();
      for (const p of (progsData ?? []) as Array<{ line_id: string; mastery: number; next_review: string | null }>) {
        progsByLine.set(p.line_id, p);
      }

      const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const result: RecentOpening[] = openingIds.map(oid => {
        const op = openingMap.get(oid);
        if (!op) return null;
        const ids = openingToLineIds.get(oid) ?? [];
        let masterySum = 0, dueNow = 0, count = 0;
        for (const id of ids) {
          const p = progsByLine.get(id);
          if (!p) continue;
          masterySum += p.mastery ?? 0;
          if (p.mastery < 5 && p.next_review && p.next_review <= nowIso) dueNow++;
          count++;
        }
        return {
          openingId: op.id,
          openingName: op.name,
          color: op.color,
          lastPracticed: openingLastPracticed.get(oid)!,
          masteryAvg: count > 0 ? masterySum / count : 0,
          totalLines: ids.length,
          dueNow,
          previewFen: openingToPreviewFen.get(oid) ?? START_FEN,
        };
      }).filter((x): x is RecentOpening => x !== null);

      setRecentOpenings(result);
    })();
  }, []);

  // Load «Дебют дня» (deterministic by date)
  useEffect(() => {
    (async () => {
      try {
        const { data: ops } = await supabase.from('openings').select('id, name, color').limit(200);
        if (!ops || ops.length === 0) return;
        const seed = new Date(today).getTime();
        const idx = Math.abs(seed) % ops.length;
        const op = ops[idx] as { id: string; name: string; color: 'white' | 'black' | 'both' };
        // Load one line for preview FEN + count of due lines
        const { data: linesData } = await supabase.from('opening_lines').select('id, moves').eq('opening_id', op.id);
        const ids = (linesData ?? []).map((l: { id: string }) => l.id);
        const firstLine = (linesData ?? [])[0] as { moves?: Array<{ fen?: string }> } | undefined;
        const previewFen = firstLine?.moves?.[Math.min(firstLine.moves.length - 1, 5)]?.fen
          ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        let dueNow = 0;
        if (ids.length > 0) {
          const nowIso = new Date().toISOString();
          const { data: progsData } = await supabase.from('line_progress').select('mastery, next_review').in('line_id', ids);
          for (const p of (progsData ?? []) as Array<{ mastery: number; next_review: string | null }>) {
            if (p.mastery < 5 && p.next_review && p.next_review <= nowIso) dueNow++;
          }
        }
        setDailyOpening({
          id: op.id, name: op.name, color: op.color,
          previewFen, totalLines: ids.length, dueNow,
        });
      } catch { /* ignore */ }
    })();
  }, [today]);

  // Load top insight for home teaser
  useEffect(() => {
    (async () => {
      try {
        const { loadInsights } = await import('@/lib/insights-store');
        const { generateInsights } = await import('@/lib/insights-analyzer');
        const data = await loadInsights(false);
        // Filter last 30 days
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const filtered = data.filter(d => d.date && new Date(d.date) >= cutoff);
        const insights = generateInsights(filtered);
        if (insights.length > 0) setTopInsight(insights[0]);
      } catch { /* ignore — no games is fine */ }
    })();
  }, []);

  if (!counts) {
    return (
      <div className="page">
        {/* Header skeleton */}
        <div className="page-head">
          <div className="page-head-text" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton h={34} w={160} />
            <Skeleton h={16} w={280} />
          </div>
          <Skeleton h={44} w={180} />
        </div>
        {/* Plan skeleton */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          <Skeleton h={14} w={200} />
          {[0,1,2].map(i => (
            <div key={i} className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px' }}>
              <Skeleton h={44} w={44} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton h={15} w="40%" />
                <Skeleton h={13} w="65%" />
              </div>
            </div>
          ))}
        </section>
      </div>
    );
  }

  const now = new Date();
  const dateLabel = `${DAY_NAMES[now.getDay()]}, ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;
  const plan = buildPlan(counts);
  const pendingTasks = plan.filter(t => !t.done && t.count > 0);
  const startHref = pendingTasks[0]?.href ?? plan[0]?.href ?? '/openings';

  // Streak milestone banner (dismissible, remembered via localStorage)
  const streakMilestones = [7, 14, 30, 50, 100, 200, 365];
  const activeMilestone = streakMilestones.includes(counts.streak) ? counts.streak : null;
  const milestoneDismissKey = activeMilestone ? `streak-milestone-${activeMilestone}` : null;
  const showMilestone = activeMilestone != null
    && typeof window !== 'undefined'
    && !localStorage.getItem(milestoneDismissKey!);

  return (
    <div className="page">
      {/* Hero */}
      <section className="hero-today">
        {/* Decorative chess king */}
        <svg
          aria-hidden="true"
          className="hero-chess-piece"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M19 22H5v-2h14v2zm-2.68-6c.98-1.09 1.68-2.52 1.68-4.5a5.25 5.25 0 0 0-3.1-4.78L13 8l1.08-1.08.99.99A.75.75 0 0 0 16 7.5V5a.75.75 0 0 0-.75-.75H13.5V3h-3v1.25H8.75A.75.75 0 0 0 8 5v2.5a.75.75 0 0 0 1.26.55l.99-1 1.08 1.08-1.9-1.28A5.25 5.25 0 0 0 6.34 11.5c0 1.98.7 3.41 1.68 4.5h8.3zM7 18h10v-1H7v1zm.5-2h9v-.72a4.98 4.98 0 0 1-9 0V16z" />
        </svg>

        {/* Decorative floating accents */}
        <div aria-hidden="true" className="hero-blob hero-blob-1" />
        <div aria-hidden="true" className="hero-blob hero-blob-2" />

        <div className="hero-content">
          <div className="hero-meta">
            <span className="hero-date-chip">
              <span className="hero-date-dot" />
              {dateLabel}
            </span>
            {counts.streak > 0 && (
              <span className="hero-streak-chip">
                <span className="hero-streak-flame">★</span>
                <strong>{counts.streak}</strong>
                <span>{plural(counts.streak, 'день', 'дня', 'дней')} подряд</span>
              </span>
            )}
          </div>

          <h1 className="hero-title">Сегодня</h1>

          <div className="hero-sub">
            {pendingTasks.length > 0
              ? <>На повестке <strong>{pendingTasks.length}</strong> {pendingTasks.length === 1 ? 'задача' : pendingTasks.length <= 4 ? 'задачи' : 'задач'}. Погнали.</>
              : <>Все линии в графике. Можно просто поиграть.</>}
          </div>

          <div className="hero-actions">
            <Link href={startHref} className="ui-btn ui-btn-primary ui-btn-lg" style={{ gap: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="6,3 21,12 6,21" />
              </svg>
              Начать тренировку
            </Link>
            <Link href="/openings" className="ui-btn ui-btn-ghost ui-btn-lg" style={{ gap: 8 }}>
              Все дебюты
            </Link>
          </div>

          {/* Hero stats strip */}
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-num">{counts.openingsDue}</div>
              <div className="hero-stat-label">линий<br/>на повтор</div>
            </div>
            <div className="hero-stats-divider" />
            <div className="hero-stat">
              <div className="hero-stat-num">{counts.totalMastered}</div>
              <div className="hero-stat-label">линий<br/>изучено</div>
            </div>
            <div className="hero-stats-divider" />
            <div className="hero-stat">
              <div className="hero-stat-num">{counts.mistakesDue}</div>
              <div className="hero-stat-label">ошибок<br/>разобрать</div>
            </div>
            <div className="hero-stats-divider" />
            <div className="hero-stat">
              <div className="hero-stat-num">{counts.streak}</div>
              <div className="hero-stat-label">дней<br/>подряд</div>
            </div>
          </div>
        </div>
      </section>

      {/* Streak milestone */}
      {showMilestone && activeMilestone != null && (
        <StreakMilestoneBanner
          streak={activeMilestone}
          onDismiss={() => { if (milestoneDismissKey) localStorage.setItem(milestoneDismissKey, '1'); }}
        />
      )}

      {/* Top insight from assistant */}
      {topInsight && (
        <Link
          href="/stats"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: '14px 18px',
            background: topInsight.severity === 'high'
              ? 'color-mix(in srgb, #E0574A 10%, var(--surface))'
              : topInsight.severity === 'med'
                ? 'color-mix(in srgb, #F0A43A 10%, var(--surface))'
                : topInsight.severity === 'good'
                  ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))'
                  : 'color-mix(in srgb, #4A90E2 10%, var(--surface))',
            border: `1px solid ${
              topInsight.severity === 'high'
                ? 'color-mix(in srgb, #E0574A 30%, var(--hairline))'
                : topInsight.severity === 'med'
                  ? 'color-mix(in srgb, #F0A43A 30%, var(--hairline))'
                  : topInsight.severity === 'good'
                    ? 'color-mix(in srgb, var(--accent) 30%, var(--hairline))'
                    : 'color-mix(in srgb, #4A90E2 25%, var(--hairline))'
            }`,
            borderRadius: 'var(--radius-card, 0px)',
            textDecoration: 'none', color: 'inherit',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 16, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'color-mix(in srgb, var(--bg) 50%, transparent)',
            fontSize: 16, fontWeight: 700,
            color: topInsight.severity === 'high' ? '#E0574A'
              : topInsight.severity === 'med' ? '#F0A43A'
                : topInsight.severity === 'good' ? 'var(--accent)' : '#4A90E2',
          }}>
            {topInsight.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 2, fontWeight: 600, letterSpacing: 0.05 }}>АССИСТЕНТ</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)', marginBottom: 2 }}>{topInsight.title}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{topInsight.body}</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0, opacity: 0.7 }}>Разбор →</div>
        </Link>
      )}

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

      {/* Continue — top 3 recent openings */}
      {recentOpenings.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="bold-section-head">
            <span className="bold-section-num">01</span>
            <div>
              <div className="bold-section-title">Продолжить</div>
              <div className="bold-section-sub">Последние {recentOpenings.length} {recentOpenings.length === 1 ? 'дебют' : recentOpenings.length <= 4 ? 'дебюта' : 'дебютов'}, которые ты тренировал</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentOpenings.map(r => (
              <Link
                key={r.openingId}
                href={`/openings/${r.openingId}`}
                className="ui-card"
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  textDecoration: 'none', color: 'inherit', padding: '12px 14px 12px 12px',
                }}
              >
                <div data-ui="eg-board" style={{ flexShrink: 0 }}>
                  <MiniBoard
                    fen={r.previewFen}
                    orientation={r.color === 'black' ? 'black' : 'white'}
                    size={56}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 2,
                    overflow: 'hidden',
                  }}>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1, minWidth: 0,
                    }}>{r.openingName}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>{timeAgo(r.lastPracticed)}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>мастерство {Math.round((r.masteryAvg / 5) * 100)}%</span>
                    {r.dueNow > 0 && (
                      <>
                        <span style={{ opacity: 0.5 }}>·</span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '1px 8px',
                          background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
                          color: 'var(--accent)',
                          borderRadius: 999,
                          fontSize: 11, fontWeight: 600,
                        }}>
                          {r.dueNow} на повтор
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 15, color: 'var(--muted)', flexShrink: 0, opacity: 0.7 }}>→</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Plan */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="bold-section-head">
          <span className="bold-section-num">03</span>
          <div>
            <div className="bold-section-title">План на сегодня</div>
            <div className="bold-section-sub">{plan.length} {plan.length === 1 ? 'задача' : plan.length <= 4 ? 'задачи' : 'задач'} под твой уровень</div>
          </div>
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

      {/* Daily picks — cinematic 2-col grid */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="bold-section-head">
          <span className="bold-section-num">02</span>
          <div>
            <div className="bold-section-title">На сегодня</div>
            <div className="bold-section-sub">Три быстрых действия от нас</div>
          </div>
        </div>

        {/* Warmup — special full-width hero card */}
        <Link href="/warmup" className="daily-hero-card" data-done={false}>
          <div className="daily-hero-badge">5′</div>
          <div className="daily-hero-content">
            <div className="daily-hero-kicker">БЫСТРЫЙ СТАРТ</div>
            <div className="daily-hero-title">Разминка 5 минут</div>
            <div className="daily-hero-sub">Угрозы · Линия · Ловушка · Ошибка · Напоминание</div>
          </div>
          <div className="daily-hero-cta">
            <span>Начать</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="6,3 21,12 6,21" />
            </svg>
          </div>
        </Link>

        {/* Game + Combo + Opening — 3-col grid */}
        {(dailyGame || dailyComb || dailyOpening) && (
          <div className="daily-grid daily-grid-3">
            {dailyOpening && (
              <Link href={`/openings/${dailyOpening.id}`} className="daily-tile">
                <div className="daily-tile-board">
                  <MiniBoard fen={dailyOpening.previewFen} orientation={dailyOpening.color === 'black' ? 'black' : 'white'} size={240} />
                  <div className="daily-tile-gradient" />
                  <div className="daily-tile-kicker">ДЕБЮТ ДНЯ</div>
                  {dailyOpening.dueNow > 0 && (
                    <div className="daily-tile-done-stamp" style={{ background: 'color-mix(in srgb, var(--accent) 80%, #000)', top: 12 }}>
                      {dailyOpening.dueNow} на повтор
                    </div>
                  )}
                </div>
                <div className="daily-tile-body">
                  <div className="daily-tile-title">{dailyOpening.name}</div>
                  <div className="daily-tile-meta">
                    <span>{dailyOpening.color === 'white' ? 'Белыми' : dailyOpening.color === 'black' ? 'Чёрными' : 'За оба'}</span>
                    <span>{dailyOpening.totalLines} {dailyOpening.totalLines === 1 ? 'линия' : dailyOpening.totalLines <= 4 ? 'линии' : 'линий'}</span>
                  </div>
                </div>
              </Link>
            )}
            {dailyGame && (
              <Link href={`/masters/${dailyGame.id}`} className="daily-tile" data-done={dailyGame.done}>
                <div className="daily-tile-board">
                  {dailyGame.keyFen ? (
                    <MiniBoard fen={dailyGame.keyFen} size={240} />
                  ) : (
                    <div className="daily-tile-fallback">♛</div>
                  )}
                  {dailyGame.done && <div className="daily-tile-done-stamp">✓ сделано</div>}
                  <div className="daily-tile-gradient" />
                  <div className="daily-tile-kicker">ПАРТИЯ ДНЯ</div>
                </div>
                <div className="daily-tile-body">
                  <div className="daily-tile-title">{dailyGame.white} — {dailyGame.black}</div>
                  <div className="daily-tile-meta">
                    {dailyGame.year && <span>{dailyGame.year}</span>}
                    {dailyGame.keyFen && <span>Ключевой момент — что сыграет мастер?</span>}
                  </div>
                </div>
              </Link>
            )}
            {dailyComb && (
              <Link href="/sac" className="daily-tile" data-done={dailyComb.done}>
                <div className="daily-tile-board">
                  {dailyComb.fen ? (
                    <MiniBoard fen={dailyComb.fen} size={240} />
                  ) : (
                    <div className="daily-tile-fallback">⚔</div>
                  )}
                  {dailyComb.done && <div className="daily-tile-done-stamp">✓ сделано</div>}
                  <div className="daily-tile-gradient" />
                  <div className="daily-tile-kicker">КОМБИНАЦИЯ</div>
                </div>
                <div className="daily-tile-body">
                  <div className="daily-tile-title">Жертвовать или нет?</div>
                  <div className="daily-tile-meta">
                    <span>Реальная позиция из партии мастера</span>
                  </div>
                </div>
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Цитата Таля — декоративная плашка */}
      <Link href="/tal" className="tal-quote-card" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="tal-quote-card-kicker">ТРЕНЕР ТАЛЬ</div>
        <p className="tal-quote-card-text">
          «Атакуйте там, где соперник слабее&nbsp;всего.»
        </p>
        <div className="tal-quote-card-sig">— M. Tal</div>
      </Link>

      {/* Stats */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="bold-section-head">
          <span className="bold-section-num">04</span>
          <div>
            <div className="bold-section-title">Статистика</div>
            <div className="bold-section-sub">Общие цифры по репертуару</div>
          </div>
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

function Skeleton({ h, w }: { h: number; w: string | number }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{
        height: h, width: w,
        borderRadius: 'var(--radius-btn, 4px)',
      }}
    />
  );
}

function StreakMilestoneBanner({ streak, onDismiss }: { streak: number; onDismiss: () => void }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  const title = streak === 7
    ? 'Неделя подряд!'
    : streak === 14 ? 'Две недели подряд!'
    : streak === 30 ? 'Месяц подряд!'
    : streak === 50 ? '50 дней подряд!'
    : streak === 100 ? '100 дней подряд!'
    : streak === 200 ? '200 дней подряд!'
    : streak === 365 ? 'Год подряд!'
    : `${streak} дней подряд!`;
  const message = streak >= 30
    ? 'Мощная серия. Продолжай в том же духе.'
    : streak >= 14 ? 'Регулярность уже видна. Не сбавляй.'
    : 'Отличная привычка. Дальше — больше.';
  return (
    <div
      role="status"
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 18,
        padding: '18px 22px',
        background: `linear-gradient(135deg,
          color-mix(in srgb, var(--accent) 18%, var(--surface)) 0%,
          color-mix(in srgb, var(--accent) 8%, var(--surface)) 45%,
          var(--surface) 100%)`,
        border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--hairline))',
        borderRadius: 'var(--radius-card, 0px)',
        color: 'var(--ivory)',
        overflow: 'hidden',
      }}
    >
      {/* Decorative bokeh — subtle */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: -60, right: -40,
          width: 180, height: 180, borderRadius: '50%',
          background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 70%)',
          filter: 'blur(8px)',
          animation: 'heroGlow 3.6s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', bottom: -70, left: '30%',
          width: 140, height: 140, borderRadius: '50%',
          background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 70%)',
          filter: 'blur(10px)',
          animation: 'heroGlow 4.8s ease-in-out infinite reverse',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {/* Sparkles around badge */}
        {[
          { top: -8, left: 10, sx: -20, sy: -14, delay: '0s' },
          { top: 12, left: -10, sx: -24, sy: 16, delay: '0.5s' },
          { top: 40, left: 50, sx: 20, sy: 20, delay: '1s' },
          { top: -6, left: 45, sx: 22, sy: -16, delay: '0.3s' },
          { top: 28, left: -14, sx: -28, sy: 0, delay: '1.2s' },
        ].map((s, i) => (
          <span
            key={i}
            className="sparkle"
            aria-hidden="true"
            style={{
              top: s.top, left: s.left,
              ['--sx' as string]: `${s.sx}px`,
              ['--sy' as string]: `${s.sy}px`,
              animationDelay: s.delay,
            } as React.CSSProperties}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />
            </svg>
          </span>
        ))}
        <div
          className="streak-milestone-badge"
          style={{
            width: 54, height: 54, borderRadius: 27,
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 110%, #fff) 0%, var(--accent) 100%)',
            color: 'var(--accent-contrast, #fff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 700,
          }}
        >
          ★
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: 17, fontWeight: 800, marginBottom: 3,
          fontFamily: 'var(--font-inter-tight, Inter Tight, Inter, sans-serif)',
          letterSpacing: '-0.015em',
        }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{message}</div>
      </div>
      <button
        onClick={() => { onDismiss(); setVisible(false); }}
        aria-label="Скрыть"
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--muted)', fontSize: 18, cursor: 'pointer',
          padding: '0 4px', lineHeight: 1,
          position: 'relative', zIndex: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
