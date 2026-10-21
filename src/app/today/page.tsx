'use client';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import DayBlock from '@/components/DayBlock';
import { supabase } from '@/lib/supabase';
import { getCurrentDay, isLightDay, getDayTheme } from '@/lib/day-utils';
import { CHESS_LINKS, START_RATING, TARGET_RATING, RATING_CHECKPOINTS, DAY_DATES, DAY_SPECIAL_TASKS, TAL_GAMES } from '@/lib/constants';
import { getLevelInfo } from '@/lib/xp';
import type { DailyProgress, SyncResult } from '@/types';

const BLOCKS_NORMAL = [
  { key: 'block_warmup' as keyof DailyProgress, title: 'Разминка',  duration: '10', description: '5 задач «мат в 2» + 5 рейтинговых задач', links: [{ label: 'Задачи', href: CHESS_LINKS.puzzles }] },
  { key: 'block_theme'  as keyof DailyProgress, title: 'Тема дня',  duration: '25', description: 'Урок + 15-20 задач по теме дня', links: [{ label: 'Уроки', href: CHESS_LINKS.lessons }, { label: 'Задачи', href: CHESS_LINKS.puzzles }] },
  { key: 'block_game'   as keyof DailyProgress, title: 'Игра',      duration: '50', description: '3 партии в рапид 10 минут', links: [{ label: 'Играть рапид', href: CHESS_LINKS.play }] },
  { key: 'block_review' as keyof DailyProgress, title: 'Разбор',    duration: '20', description: 'Сначала сам, потом Game Review. Запиши главную ошибку.', links: [{ label: 'Game Review', href: CHESS_LINKS.review }, { label: 'Тетрадь', href: '/notebook' }] },
];

const BLOCKS_LIGHT = [
  { key: 'block_warmup' as keyof DailyProgress, title: 'Задачи', duration: '30', description: 'Puzzle Rush + рейтинговые задачи', links: [{ label: 'Puzzle Rush', href: CHESS_LINKS.puzzleRush }, { label: 'Задачи', href: CHESS_LINKS.puzzles }] },
  { key: 'block_game'   as keyof DailyProgress, title: 'Игра',   duration: '30', description: '2 партии в рапид + просмотр Insights', links: [{ label: 'Играть рапид', href: CHESS_LINKS.play }, { label: 'Insights', href: CHESS_LINKS.insights }] },
];

export default function TodayPage() {
  const day = getCurrentDay();
  const isLight = isLightDay(day);
  const theme = getDayTheme(day);
  const blocks = isLight ? BLOCKS_LIGHT : BLOCKS_NORMAL;

  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [totalXP, setTotalXP] = useState(0);
  const [currentRating, setCurrentRating] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);

  const today = new Date().toISOString().split('T')[0];

  const loadProgress = useCallback(async () => {
    const { data } = await supabase.from('daily_progress').select('*').eq('day_number', day).maybeSingle();
    if (data) {
      setProgress(data as DailyProgress);
    } else {
      const { data: created } = await supabase.from('daily_progress').insert({
        day_number: day, date: today,
        block_warmup: false, block_theme: false, block_game: false, block_review: false,
        xp_earned: 0, day_complete: false,
      }).select().maybeSingle();
      if (created) setProgress(created as DailyProgress);
    }
    const [{ data: xpData }, { data: ratingData }, { data: streakData }] = await Promise.all([
      supabase.from('user_xp').select('*').eq('id', 1).maybeSingle(),
      supabase.from('rating_history').select('rating').order('date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('streak').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (xpData) setTotalXP((xpData as { total_xp?: number }).total_xp ?? 0);
    if (ratingData) setCurrentRating((ratingData as { rating: number }).rating);
    if (streakData) setStreak((streakData as { current_streak?: number })?.current_streak ?? 0);
  }, [day, today]);

  useEffect(() => { loadProgress(); }, [loadProgress]);

  async function toggleBlock(key: keyof DailyProgress) {
    if (!progress) return;
    const currentVal = progress[key];
    if (typeof currentVal !== 'boolean') return;
    const newVal = !currentVal;
    const update: Partial<DailyProgress> = { [key]: newVal };
    const updated = { ...progress, ...update };
    const allDone = updated.block_warmup && updated.block_game &&
      (isLight || (updated.block_theme && updated.block_review));
    const xp = [updated.block_warmup, updated.block_theme, updated.block_game, updated.block_review]
      .filter(Boolean).length * 10 + (allDone ? 20 : 0);
    update.xp_earned = xp;
    update.day_complete = allDone;
    await supabase.from('daily_progress').update(update).eq('id', progress.id);
    setProgress({ ...updated, xp_earned: xp, day_complete: !!allDone });
    await supabase.from('user_xp').upsert({ id: 1, total_xp: totalXP + (newVal ? 10 : -10) }, { onConflict: 'id' });
    setTotalXP(t => t + (newVal ? 10 : -10));
  }

  async function doSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/chess-sync');
      const data: SyncResult = await res.json();
      setSyncResult(data);
      if (data.rating) setCurrentRating(data.rating);
    } finally {
      setSyncing(false);
    }
  }

  const levelInfo = getLevelInfo(totalXP);
  const checkpointEntry = Object.entries(RATING_CHECKPOINTS).find(([d]) => parseInt(d) >= day);
  const targetToday = checkpointEntry ? checkpointEntry[1][0] : 1200;
  const ratingDiff = currentRating ? currentRating - START_RATING : 0;
  const specialTask = DAY_SPECIAL_TASKS[day] ?? null;
  const talGame = TAL_GAMES[(day - 1) % TAL_GAMES.length];
  const dayDate = DAY_DATES[day] ?? '';

  const firstIncompleteIdx = blocks.findIndex(b => !progress?.[b.key]);
  const completedCount = blocks.filter(b => !!(progress?.[b.key])).length;

  const circumference = 2 * Math.PI * 56;
  const totalRange = TARGET_RATING - START_RATING;
  const ratingProg = currentRating ? Math.max(0, Math.min(1, (currentRating - START_RATING) / totalRange)) : 0;
  const dashOffset = circumference * (1 - ratingProg);

  return (
    <div className="md:flex md:min-h-screen">

      {/* ── LEFT CONTENT ── */}
      <main className="relative flex-1 px-5 pt-8 pb-4 md:px-12 md:pt-12 md:pb-12 md:border-r md:border-[#181818] overflow-hidden">

        {/* Watermark */}
        <div className="absolute right-0 top-4 leading-none text-[#EAE8E3] pointer-events-none select-none hidden md:block"
          style={{ fontSize: '240px', opacity: 0.022, fontFamily: 'serif' }}>♞</div>

        {/* Header */}
        <div className="flex items-start justify-between mb-7">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#444]">{dayDate}</span>
              <span className="w-5 h-px bg-[#C9A96E] shrink-0" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#333]">День {day} / 30</span>
            </div>
            <h1 className="font-cormorant text-[48px] md:text-[64px] font-light italic leading-[0.92] text-[#EAE8E3]"
              style={{ letterSpacing: '-0.01em' }}>
              {theme}
            </h1>
          </div>
          <button onClick={doSync} disabled={syncing}
            className="mt-1 p-2 text-[#333] hover:text-[#666] transition-colors disabled:opacity-30 shrink-0">
            <RefreshCw size={15} strokeWidth={1.5} className={syncing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Mobile: rating strip */}
        <div className="md:hidden grid grid-cols-3 divide-x divide-[#181818] border border-[#181818] mb-5">
          <div className="px-4 py-3">
            <p className="text-[9px] uppercase tracking-[0.15em] text-[#444] mb-1">Рейтинг</p>
            <p className="font-cormorant text-2xl font-light text-[#EAE8E3]">{currentRating ?? '—'}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[9px] uppercase tracking-[0.15em] text-[#444] mb-1">Прирост</p>
            <p className={`font-cormorant text-2xl font-light ${ratingDiff >= 0 ? 'text-[#4A7A5A]' : 'text-[#7A4A4A]'}`}>
              {ratingDiff >= 0 ? '+' : ''}{ratingDiff}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[9px] uppercase tracking-[0.15em] text-[#444] mb-1">Цель</p>
            <p className="font-cormorant text-2xl font-light text-[#C9A96E]">{targetToday}</p>
          </div>
        </div>

        {/* Alerts */}
        {syncResult?.lossStreakWarning && (
          <div className="flex items-center gap-2 border border-[#3A2020] px-4 py-3 mb-3">
            <AlertCircle size={13} strokeWidth={1.5} className="text-[#7A4A4A] shrink-0" />
            <p className="text-xs text-[#7A4A4A]">Стоп игре — только задачи и разбор</p>
          </div>
        )}
        {syncResult?.blitzWarning && (
          <div className="flex items-center gap-2 border border-[#3A3020] px-4 py-3 mb-3">
            <AlertCircle size={13} strokeWidth={1.5} className="text-[#7A6A3A] shrink-0" />
            <p className="text-xs text-[#7A6A3A]">Сыграна блиц/пуля — «Чистая неделя» потеряна</p>
          </div>
        )}
        {syncResult && syncResult.latecastleGames.length > 0 && (
          <div className="flex items-center gap-2 border border-[#2A2A1A] px-4 py-3 mb-3">
            <AlertCircle size={13} strokeWidth={1.5} className="text-[#666655] shrink-0" />
            <p className="text-xs text-[#666655]">Поздняя рокировка в {syncResult.latecastleGames.length} партии</p>
          </div>
        )}

        {/* XP bar */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] uppercase tracking-[0.15em] text-[#333]">{levelInfo.name}</span>
            <span className="text-[10px] text-[#333]">{totalXP} XP</span>
          </div>
          <div className="h-px bg-[#181818]">
            <div className="h-full bg-[#C9A96E] transition-all duration-700"
              style={{ width: `${levelInfo.progress}%` }} />
          </div>
        </div>

        {/* Blocks header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#181818]">
          <span className="text-[10px] uppercase tracking-[0.25em] text-[#333]">Программа дня</span>
          <span className="text-[10px] text-[#333]">{completedCount}/{blocks.length}</span>
        </div>

        {/* Timeline blocks */}
        <div className="relative py-1 before:content-[''] before:absolute before:left-[7px] before:top-6 before:bottom-6 before:w-px before:bg-[#181818]">
          {blocks.map((block, i) => (
            <DayBlock
              key={block.key}
              index={i + 1}
              title={block.title}
              duration={block.duration}
              description={block.description}
              links={block.links}
              isComplete={!!(progress?.[block.key])}
              isActive={i === firstIncompleteIdx}
              onToggle={() => toggleBlock(block.key)}
            />
          ))}
          {/* Магия дня — 5th block, always */}
          <DayBlock
            index={blocks.length + 1}
            title="Магия дня"
            duration="10"
            description={`${talGame.white} — ${talGame.black}${talGame.year ? `, ${talGame.year}` : ''}${talGame.note ? `. ${talGame.note}` : ''}. Разыграй в Analysis. Перед каждым ходом белых — остановись и подумай: что бы ты сыграл?`}
            links={[{ label: 'Analysis', href: CHESS_LINKS.games }]}
            isComplete={false}
            isActive={completedCount === blocks.length}
            onToggle={() => {}}
          />
        </div>

        {/* Special task (mobile only) */}
        {specialTask && (
          <div className="mt-5 border border-[#181818] px-4 py-3 md:hidden">
            <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-1.5">Особое задание</p>
            <p className="text-sm text-[#555] leading-relaxed">{specialTask}</p>
          </div>
        )}

        {syncResult && syncResult.gamesCount > 0 && (
          <p className="text-center text-[10px] text-[#333] tracking-wide mt-4 md:hidden">
            Рапид сегодня: {syncResult.gamesCount}
          </p>
        )}
      </main>

      {/* ── RIGHT PANEL (desktop only) ── */}
      <aside className="hidden md:flex md:w-[360px] md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto md:p-10 bg-[#0A0A0A]">

        {/* Ring chart */}
        <div className="mb-8">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#333] mb-5">Прогресс к {TARGET_RATING}</p>
          <div className="flex items-center gap-6">
            <div className="relative w-[130px] h-[130px] shrink-0">
              <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="65" cy="65" r="56" fill="none" stroke="#181818" strokeWidth="5" />
                <circle cx="65" cy="65" r="56" fill="none" stroke="#C9A96E" strokeWidth="5"
                  strokeLinecap="butt"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  style={{ transition: 'stroke-dashoffset 1s ease' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-cormorant text-[38px] font-light text-[#EAE8E3] leading-none">
                  {currentRating ?? '—'}
                </span>
                <span className="text-[10px] text-[#444] mt-1 tracking-wider">→ {targetToday}</span>
              </div>
            </div>
            <div>
              <div className="mb-4">
                <p className="text-[9px] uppercase tracking-[0.2em] text-[#444] mb-1">Прирост</p>
                <p className={`font-cormorant text-3xl font-light ${ratingDiff >= 0 ? 'text-[#4A7A5A]' : 'text-[#7A4A4A]'}`}>
                  {ratingDiff >= 0 ? '+' : ''}{ratingDiff}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-[#444] mb-0.5">{levelInfo.name}</p>
                <p className="text-[10px] text-[#333]">{totalXP} XP</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 border border-[#181818] mb-8">
          {[
            { label: 'Стрик',   value: streak > 0 ? `${streak} д` : '—' },
            { label: 'Уровень', value: levelInfo.name },
            { label: 'Блоки',   value: `${completedCount}/${blocks.length}` },
            { label: 'Партий',  value: syncResult?.gamesCount ? `${syncResult.gamesCount}` : '—' },
          ].map(({ label, value }, i) => (
            <div key={label}
              className={`px-4 py-3 ${i % 2 === 0 ? 'border-r border-[#181818]' : ''} ${i < 2 ? 'border-b border-[#181818]' : ''}`}>
              <p className="text-[9px] uppercase tracking-[0.2em] text-[#333] mb-1">{label}</p>
              <p className="font-cormorant text-2xl font-light text-[#EAE8E3]">{value}</p>
            </div>
          ))}
        </div>

        {/* Special task */}
        {specialTask && (
          <div className="border border-[#181818] px-4 py-3 mb-6">
            <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-1.5">Особое задание</p>
            <p className="text-sm text-[#555] leading-relaxed">{specialTask}</p>
          </div>
        )}

        {syncResult && syncResult.gamesCount > 0 && (
          <p className="text-[10px] text-[#333] tracking-wide mb-4">
            Рапид сегодня: {syncResult.gamesCount}
          </p>
        )}

        {/* Tal quote */}
        <div className="mt-auto pt-6 border-t border-[#181818]">
          <p className="font-cormorant text-[17px] italic font-light text-[#555] leading-[1.65] mb-3">
            &ldquo;You must take your opponent into a deep dark forest where 2+2=5.&rdquo;
          </p>
          <p className="text-[9px] uppercase tracking-[0.25em] text-[#2A2A2A]">Михаил Таль</p>
        </div>
      </aside>
    </div>
  );
}
