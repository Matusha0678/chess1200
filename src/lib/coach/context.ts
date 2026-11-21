// Сбор статистики для тренера Таля. Клиент (страница /tal) и сервер (API) её используют.
// Переиспользует loadInsights (game_insights), generateInsights, ratingHistory.

import { supabase } from '@/lib/supabase';
import { loadInsights, type DemoInsight } from '@/lib/insights-store';
import { generateInsights, type Insight } from '@/lib/insights-analyzer';
import type { ItemKey } from './plan';

export interface LeakRow {
  key: ItemKey;       // задание плана, которое это лечит
  label: string;      // «Цейтнот», «Зевок фигуры», …
  count: number;      // сколько партий из 40
  main: boolean;      // главная ли причина
}

export interface RatingPoint { date: string; r: number; }

export interface FormInfo {
  rating_now: number | null;
  rating_7d_delta: number | null;
  rating_14d: RatingPoint[];
  goal_rating: number;
  big_goal_rating: number;
}

export interface YesterdayGame {
  id: string;
  color: 'w' | 'b';
  result: 'win' | 'loss' | 'draw';
  rating_me: number | null;
  rating_opp: number | null;
  opp: string | null;
  decisive_move_number: number | null;
  decisive_san: string | null;
  decisive_phase: string | null;
  decisive_best: string | null;
  time_trouble: boolean;
  missed_win: boolean;
}

export interface ItemProgress {
  key: ItemKey;
  done_today: number;   // число (задач, позиций, линий)
  manual_done: boolean; // ручная метка из coach_item_marks
}

export interface CoachSettings {
  daily_minutes: number;
  goal_rating: number;
  big_goal_rating: number;
  book_title: string | null;
  book_page: number | null;
  videos: Array<{ title: string; url: string }>;
}

export interface WeekDay {
  date: string;
  minutes_done: number;
  minutes_plan: number;
  is_today: boolean;
  is_future: boolean;
}

export interface CoachContext {
  date: string;
  settings: CoachSettings;
  form: FormInfo;
  leaks: LeakRow[];
  openings_due: number;
  tactics_acc_7d: number | null;    // 0..1
  progress: Record<ItemKey, ItemProgress>;
  yesterday: YesterdayGame | null;
  week: WeekDay[];                 // пн–вс, 7 элементов
  streak: number;
  best_streak: number;
  discipline_30d: number;          // 0..100 %
}

// ── Маппинг Insight типа на ключ задания ───────────────────────────────────

const LEAK_TO_KEY: Record<string, ItemKey> = {
  'time-trouble':    'tactics',
  'opening-losses':  'openings',
  'middlegame-blunders': 'threats',
  'endgame-errors':  'endgames',
  'missed-wins':     'convert',
  'blunder':         'mistakes',
  'tactics-missed':  'tactics',
  'bad-rating':      'tactics',
};

const LEAK_LABEL: Record<string, string> = {
  'time-trouble':         'Цейтнот',
  'opening-losses':       'Проваленные дебюты',
  'middlegame-blunders':  'Миттельшпиль',
  'endgame-errors':       'Эндшпиль',
  'missed-wins':          'Не дожал',
  'blunder':              'Зевок фигуры',
  'tactics-missed':       'Пропустил тактику',
  'bad-rating':           'Соперник сильнее',
};

function insightToLeak(i: Insight): LeakRow | null {
  const key = LEAK_TO_KEY[i.id];
  if (!key) return null;
  const count = i.stat ? parseInt(i.stat.value, 10) || 0 : 0;
  return {
    key, label: LEAK_LABEL[i.id] ?? i.title, count,
    main: i.severity === 'high',
  };
}

// ── Вспомогалки дат ───────────────────────────────────────────────────────

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function daysBack(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d);
}

// ── Основной сборщик ──────────────────────────────────────────────────────

export async function loadCoachContext(date: string): Promise<CoachContext> {
  // 1. settings
  const settingsRes = await supabase.from('coach_settings').select('*').eq('id', 1).maybeSingle();
  const s = (settingsRes.data as Partial<CoachSettings> | null) ?? {};
  const settings: CoachSettings = {
    daily_minutes:   s.daily_minutes   ?? 120,
    goal_rating:     s.goal_rating     ?? 1200,
    big_goal_rating: s.big_goal_rating ?? 2000,
    book_title:      s.book_title      ?? null,
    book_page:       s.book_page       ?? null,
    videos:          Array.isArray(s.videos) ? s.videos : [],
  };

  // 2. Insights и Form (из game_insights/games)
  const insightsList = await loadInsights(false).catch(() => [] as DemoInsight[]);
  const rapidList = insightsList.filter(i => i.time_class === 'rapid').slice(0, 40);

  const generated = generateInsights(rapidList);
  const leaks: LeakRow[] = [];
  const seenKeys = new Set<ItemKey>();
  for (const g of generated) {
    const leak = insightToLeak(g);
    if (!leak || seenKeys.has(leak.key)) continue;
    seenKeys.add(leak.key);
    leaks.push(leak);
    if (leaks.length >= 6) break;
  }
  if (leaks.length > 0) {
    const main = leaks.find(l => l.main);
    if (!main) leaks[0].main = true;
  }

  // Рейтинг rapid за 14 дней — отдельный запрос, чтобы не зависеть от game_insights.
  const sinceIso = new Date(); sinceIso.setDate(sinceIso.getDate() - 14);
  const ratingRes = await supabase.from('games')
    .select('rating_me, played_at')
    .eq('time_class', 'rapid')
    .gte('played_at', sinceIso.toISOString())
    .order('played_at', { ascending: true })
    .limit(400);
  const points14: RatingPoint[] = [];
  for (const r of (ratingRes.data ?? []) as Array<{ rating_me: number | null; played_at: string | null }>) {
    if (r.rating_me != null && r.played_at) points14.push({ date: r.played_at.slice(0, 10), r: r.rating_me });
  }
  const latestRating = points14.length > 0 ? points14[points14.length - 1].r : null;
  const weekAgoRating = points14.find(p => p.date >= daysBack(7))?.r ?? null;
  const form: FormInfo = {
    rating_now: latestRating,
    rating_7d_delta: latestRating != null && weekAgoRating != null ? latestRating - weekAgoRating : null,
    rating_14d: points14,
    goal_rating: settings.goal_rating,
    big_goal_rating: settings.big_goal_rating,
  };

  // 3. Вчерашняя рейтинговая партия
  const yesterday = daysBack(1);
  const gRes = await supabase.from('games')
    .select('id, my_color, result, rating_me, rating_opp, opp_name, played_at, time_class')
    .eq('time_class', 'rapid')
    .gte('played_at', yesterday + 'T00:00:00')
    .lt('played_at', yesterday + 'T23:59:59')
    .order('played_at', { ascending: false })
    .limit(1);
  let yGame: YesterdayGame | null = null;
  if (gRes.data && gRes.data.length > 0) {
    const g = gRes.data[0] as Record<string, unknown>;
    const giRes = await supabase.from('game_insights').select('*').eq('game_id', g.id as string).maybeSingle();
    const gi = (giRes.data as Record<string, unknown> | null) ?? {};
    yGame = {
      id: g.id as string,
      color: (g.my_color as 'w' | 'b') ?? 'w',
      result: (g.result as 'win' | 'loss' | 'draw') ?? 'draw',
      rating_me: (g.rating_me as number | null) ?? null,
      rating_opp: (g.rating_opp as number | null) ?? null,
      opp: (g.opp_name as string | null) ?? null,
      decisive_move_number: (gi.decisive_move_number as number | null) ?? null,
      decisive_san: (gi.decisive_san as string | null) ?? null,
      decisive_phase: (gi.decisive_phase as string | null) ?? null,
      decisive_best: (gi.decisive_best as string | null) ?? null,
      time_trouble: (gi.time_trouble as boolean) ?? false,
      missed_win: (gi.missed_win as boolean) ?? false,
    };
  }

  // 4. Тактика за 7 дней — средняя точность
  const since7 = daysBack(7);
  const tRes = await supabase.from('puzzle_attempts')
    .select('ok, played_at')
    .gte('played_at', since7 + 'T00:00:00')
    .limit(500);
  let tactics_acc_7d: number | null = null;
  if (tRes.data && tRes.data.length > 0) {
    const ok = (tRes.data as Array<{ ok: boolean }>).filter(r => r.ok).length;
    tactics_acc_7d = ok / tRes.data.length;
  }

  // 5. Линии к повторению
  const nowIso = new Date().toISOString();
  const lpRes = await supabase.from('line_progress')
    .select('id', { count: 'exact', head: true })
    .lte('next_review', nowIso);
  const openings_due = lpRes.count ?? 0;

  // 6. Прогресс сегодня — считаем из разных логов + ручные отметки
  const todayStart = date + 'T00:00:00';
  const todayEnd   = date + 'T23:59:59';
  const marksRes = await supabase.from('coach_item_marks').select('item_key, done').eq('date', date);
  const markedKeys = new Set<ItemKey>(
    (marksRes.data ?? [])
      .filter((m: unknown) => (m as { done: boolean }).done)
      .map((m: unknown) => (m as { item_key: ItemKey }).item_key),
  );

  async function countInRange(table: string, column: string): Promise<number> {
    const r = await supabase.from(table).select('id', { count: 'exact', head: true })
      .gte(column, todayStart).lt(column, todayEnd);
    return r.count ?? 0;
  }

  const [
    tacticsDone, threatsDone, openingsDone, endgamesDone, sacDone, mistakesDone,
  ] = await Promise.all([
    countInRange('puzzle_attempts', 'played_at'),
    countInRange('threat_log', 'played_at'),
    countInRange('opening_practice_log', 'practiced_at'),
    countInRange('endgame_log', 'played_at'),
    countInRange('sac_log', 'played_at'),
    countInRange('mistake_cards', 'last_practiced'),
  ]);

  // Играть: партия + есть ли по ней game_analysis
  const playRes = await supabase.from('games').select('id')
    .eq('time_class', 'rapid')
    .gte('played_at', todayStart).lt('played_at', todayEnd).limit(20);
  let playDone = 0;
  if (playRes.data && playRes.data.length > 0) {
    const ids = (playRes.data as Array<{ id: string }>).map(x => x.id);
    const anRes = await supabase.from('game_analysis').select('game_id').in('game_id', ids);
    playDone = (anRes.data ?? []).length;
  }

  const progress: Record<ItemKey, ItemProgress> = {
    tactics:  { key: 'tactics',  done_today: tacticsDone,  manual_done: markedKeys.has('tactics') },
    threats:  { key: 'threats',  done_today: threatsDone,  manual_done: markedKeys.has('threats') },
    openings: { key: 'openings', done_today: openingsDone, manual_done: markedKeys.has('openings') },
    convert:  { key: 'convert',  done_today: 0,            manual_done: markedKeys.has('convert') },
    endgames: { key: 'endgames', done_today: endgamesDone, manual_done: markedKeys.has('endgames') },
    sac:      { key: 'sac',      done_today: sacDone,      manual_done: markedKeys.has('sac') },
    mistakes: { key: 'mistakes', done_today: mistakesDone, manual_done: markedKeys.has('mistakes') },
    blind:    { key: 'blind',    done_today: 0,            manual_done: markedKeys.has('blind') },
    play:     { key: 'play',     done_today: playDone,     manual_done: markedKeys.has('play') },
    book:     { key: 'book',     done_today: 0,            manual_done: markedKeys.has('book') },
    video:    { key: 'video',    done_today: 0,            manual_done: markedKeys.has('video') },
  };

  // 7. Неделя (пн-вс) + серия + дисциплина
  const monday = (() => {
    const d = new Date(date + 'T12:00:00');
    const off = (d.getDay() === 0 ? -6 : 1 - d.getDay());
    d.setDate(d.getDate() + off);
    return d;
  })();
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    weekDates.push(localDateStr(d));
  }
  const dailyRes = await supabase.from('tal_daily_log')
    .select('date, task_key, value')
    .in('task_key', ['coach_minutes', 'coach_plan_minutes'])
    .in('date', weekDates);
  const minutesDoneByDate = new Map<string, number>();
  const minutesPlanByDate = new Map<string, number>();
  for (const r of (dailyRes.data ?? []) as Array<{ date: string; task_key: string; value: number }>) {
    if (r.task_key === 'coach_minutes') minutesDoneByDate.set(r.date, r.value);
    if (r.task_key === 'coach_plan_minutes') minutesPlanByDate.set(r.date, r.value);
  }
  const todayLocal = localDateStr();
  const week: WeekDay[] = weekDates.map(d => ({
    date: d,
    minutes_done: minutesDoneByDate.get(d) ?? 0,
    minutes_plan: minutesPlanByDate.get(d) ?? 0,
    is_today: d === todayLocal,
    is_future: d > todayLocal,
  }));

  // Серия и дисциплина за 30 дней
  const since30 = daysBack(30);
  const histRes = await supabase.from('tal_daily_log')
    .select('date, task_key, value')
    .in('task_key', ['coach_minutes', 'coach_plan_minutes'])
    .gte('date', since30);
  const histDone = new Map<string, number>();
  const histPlan = new Map<string, number>();
  for (const r of (histRes.data ?? []) as Array<{ date: string; task_key: string; value: number }>) {
    if (r.task_key === 'coach_minutes') histDone.set(r.date, r.value);
    if (r.task_key === 'coach_plan_minutes') histPlan.set(r.date, r.value);
  }
  function isDaySuccess(d: string): boolean {
    const done = histDone.get(d) ?? 0;
    const plan = histPlan.get(d) ?? 0;
    if (plan === 0) return false;
    return done / plan >= 0.6;
  }
  // Серия: назад от сегодня (или вчера, если сегодня не завершён)
  let streak = 0;
  const startDate = new Date(date + 'T12:00:00');
  if (!isDaySuccess(localDateStr(startDate))) startDate.setDate(startDate.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const d = localDateStr(startDate);
    if (!isDaySuccess(d)) break;
    streak++;
    startDate.setDate(startDate.getDate() - 1);
  }
  // Лучший streak за 30 дней — упрощённо
  let best_streak = 0, cur = 0;
  for (let i = 30; i >= 0; i--) {
    const d = daysBack(i);
    if (isDaySuccess(d)) { cur++; best_streak = Math.max(best_streak, cur); }
    else cur = 0;
  }
  // Дисциплина — доля дней с планом, где done/plan >= 60%
  let plannedDays = 0, successDays = 0;
  for (let i = 30; i >= 0; i--) {
    const d = daysBack(i);
    const plan = histPlan.get(d) ?? 0;
    if (plan > 0) {
      plannedDays++;
      if (isDaySuccess(d)) successDays++;
    }
  }
  const discipline_30d = plannedDays > 0 ? Math.round((successDays / plannedDays) * 100) : 0;

  return {
    date, settings, form, leaks, openings_due, tactics_acc_7d,
    progress, yesterday: yGame, week, streak, best_streak, discipline_30d,
  };
}

// ── Коротенький текст контекста для AI-промпта ─────────────────────────────

export function buildContextText(ctx: CoachContext, previousPlan?: { items: Array<{ key: ItemKey; min: number; what: string }> }): string {
  const lines: string[] = [];
  lines.push(`Сегодня: ${ctx.date}. Минут на день: ${ctx.settings.daily_minutes}.`);
  if (ctx.form.rating_now != null) {
    lines.push(`Рейтинг рапид: ${ctx.form.rating_now}. За неделю: ${ctx.form.rating_7d_delta ?? 0}. Цель: ${ctx.form.goal_rating}.`);
  }
  if (ctx.leaks.length > 0) {
    lines.push('Причины поражений за 40 партий:');
    for (const l of ctx.leaks) lines.push(`  — ${l.label}: ${l.count}${l.main ? ' (главная)' : ''}`);
  }
  if (ctx.yesterday) {
    const y = ctx.yesterday;
    const res = y.result === 'win' ? 'победа' : y.result === 'loss' ? 'поражение' : 'ничья';
    const extra = y.decisive_san ? `. Переломный ход — ${y.decisive_san} (${y.decisive_phase}, ход ${y.decisive_move_number}). Лучше было: ${y.decisive_best ?? '?'}` : '';
    lines.push(`Вчера рапид: ${res} против ${y.opp ?? '?'} (${y.rating_opp ?? '?'})${extra}${y.time_trouble ? '. Цейтнот.' : ''}${y.missed_win ? '. Упустил выигрыш.' : ''}`);
  }
  if (ctx.tactics_acc_7d != null) {
    lines.push(`Тактика 7 дней: точность ${Math.round(ctx.tactics_acc_7d * 100)}%.`);
  }
  if (ctx.openings_due > 0) lines.push(`Дебюты: ${ctx.openings_due} линий к повторению.`);
  if (previousPlan && previousPlan.items.length > 0) {
    lines.push('Вчерашний план:');
    for (const it of previousPlan.items) lines.push(`  — ${it.key}: ${it.what} (${it.min} мин)`);
  }
  lines.push(`Серия: ${ctx.streak} дней.`);
  if (ctx.settings.book_title) lines.push(`Книга: ${ctx.settings.book_title}${ctx.settings.book_page ? `, стр. ${ctx.settings.book_page}` : ''}.`);
  return lines.join('\n');
}
