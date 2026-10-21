'use client';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, TrendingUp } from 'lucide-react';
import DayBlock from '@/components/DayBlock';
import { supabase } from '@/lib/supabase';
import { getCurrentDay, isLightDay, getDayTheme } from '@/lib/day-utils';
import { CHESS_LINKS, START_RATING, RATING_CHECKPOINTS } from '@/lib/constants';
import { getLevelInfo } from '@/lib/xp';
import type { DailyProgress, SyncResult } from '@/types';

const BLOCKS_NORMAL = [
  {
    key: 'block_warmup' as keyof DailyProgress,
    title: 'Разминка',
    duration: '10',
    description: '5 задач «мат в 2» + 5 рейтинговых задач',
    links: [{ label: 'Задачи', href: CHESS_LINKS.puzzles }],
  },
  {
    key: 'block_theme' as keyof DailyProgress,
    title: 'Тема дня',
    duration: '25',
    description: 'Урок + 15-20 задач по теме дня',
    links: [{ label: 'Уроки', href: CHESS_LINKS.lessons }, { label: 'Задачи', href: CHESS_LINKS.puzzles }],
  },
  {
    key: 'block_game' as keyof DailyProgress,
    title: 'Игра',
    duration: '50',
    description: '3 партии в рапид 10 минут',
    links: [{ label: 'Играть рапид', href: CHESS_LINKS.play }],
  },
  {
    key: 'block_review' as keyof DailyProgress,
    title: 'Разбор',
    duration: '20',
    description: 'Сначала сам, потом Game Review. Запиши главную ошибку.',
    links: [{ label: 'Game Review', href: CHESS_LINKS.review }, { label: 'Тетрадь', href: '/notebook' }],
  },
];

const BLOCKS_LIGHT = [
  {
    key: 'block_warmup' as keyof DailyProgress,
    title: 'Задачи',
    duration: '30',
    description: 'Puzzle Rush + рейтинговые задачи',
    links: [{ label: 'Puzzle Rush', href: CHESS_LINKS.puzzleRush }, { label: 'Задачи', href: CHESS_LINKS.puzzles }],
  },
  {
    key: 'block_game' as keyof DailyProgress,
    title: 'Игра',
    duration: '30',
    description: '2 партии в рапид + просмотр Insights',
    links: [{ label: 'Играть рапид', href: CHESS_LINKS.play }, { label: 'Insights', href: CHESS_LINKS.insights }],
  },
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
    const { data: xpData } = await supabase.from('user_xp').select('*').eq('id', 1).maybeSingle();
    if (xpData) setTotalXP((xpData as { total_xp?: number }).total_xp ?? 0);
    const { data: ratingData } = await supabase.from('rating_history').select('rating').order('date', { ascending: false }).limit(1).maybeSingle();
    if (ratingData) setCurrentRating((ratingData as { rating: number }).rating);
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

  void START_RATING;

  const completedCount = blocks.filter(b => !!(progress?.[b.key])).length;

  return (
    <main className="max-w-md mx-auto px-5">
      {/* Top header */}
      <div className="pt-8 pb-6 flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#444] mb-1">Сегодня</p>
          <h1 className="text-4xl font-light tracking-tight text-[#EFEFEF]">День {day}<span className="text-[#333]">/30</span></h1>
          <p className="text-sm text-[#555] mt-1.5">{theme}</p>
        </div>
        <button onClick={doSync} disabled={syncing}
          className="mt-1 p-2 text-[#333] hover:text-[#888] transition-colors disabled:opacity-30">
          <RefreshCw size={16} strokeWidth={1.5} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Rating row */}
      <div className="border border-[#1E1E1E] rounded-lg p-4 mb-5 grid grid-cols-3 divide-x divide-[#1E1E1E]">
        <div className="pr-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-1">Рейтинг</p>
          <p className="text-2xl font-light text-[#EFEFEF]">{currentRating ?? '—'}</p>
        </div>
        <div className="px-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-1">Прирост</p>
          <p className={`text-2xl font-light ${ratingDiff >= 0 ? 'text-[#4A7A5A]' : 'text-[#7A4A4A]'}`}>
            {ratingDiff >= 0 ? '+' : ''}{ratingDiff}
          </p>
        </div>
        <div className="pl-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-1">Цель</p>
          <p className="text-2xl font-light text-[#A07840]">{targetToday}</p>
        </div>
      </div>

      {/* Alerts */}
      {syncResult?.lossStreakWarning && (
        <div className="flex items-center gap-2 border border-[#3A2020] rounded-lg px-4 py-3 mb-3">
          <AlertCircle size={14} strokeWidth={1.5} className="text-[#7A4A4A] flex-shrink-0" />
          <p className="text-xs text-[#7A4A4A]">Стоп игре — только задачи и разбор</p>
        </div>
      )}
      {syncResult?.blitzWarning && (
        <div className="flex items-center gap-2 border border-[#3A3020] rounded-lg px-4 py-3 mb-3">
          <AlertCircle size={14} strokeWidth={1.5} className="text-[#7A6A3A] flex-shrink-0" />
          <p className="text-xs text-[#7A6A3A]">Сыграна блиц/пуля — «Чистая неделя» потеряна</p>
        </div>
      )}
      {syncResult && syncResult.latecastleGames.length > 0 && (
        <div className="flex items-center gap-2 border border-[#2A2A1A] rounded-lg px-4 py-3 mb-3">
          <AlertCircle size={14} strokeWidth={1.5} className="text-[#666655] flex-shrink-0" />
          <p className="text-xs text-[#666655]">Поздняя рокировка в {syncResult.latecastleGames.length} партии</p>
        </div>
      )}

      {/* XP */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={12} strokeWidth={1.5} className="text-[#444]" />
            <span className="text-[10px] uppercase tracking-[0.15em] text-[#444]">{levelInfo.name}</span>
          </div>
          <span className="text-[10px] text-[#444]">{totalXP} XP</span>
        </div>
        <div className="h-[1px] bg-[#1E1E1E] rounded-full overflow-hidden">
          <div className="h-full bg-[#A07840] transition-all duration-700"
            style={{ width: `${levelInfo.progress}%` }} />
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#444]">Блоки</p>
        <p className="text-[10px] text-[#444]">{completedCount}/{blocks.length}</p>
      </div>

      {/* Blocks */}
      <div className="border border-[#1E1E1E] rounded-lg px-4 mb-6">
        {blocks.map(block => (
          <DayBlock
            key={block.key}
            title={block.title}
            duration={block.duration}
            description={block.description}
            links={block.links}
            isComplete={!!(progress?.[block.key])}
            onToggle={() => toggleBlock(block.key)}
          />
        ))}
      </div>

      {syncResult && syncResult.gamesCount > 0 && (
        <p className="text-center text-[10px] text-[#333] tracking-wide mb-4">
          Сыграно рапид сегодня: {syncResult.gamesCount}
        </p>
      )}
    </main>
  );
}
