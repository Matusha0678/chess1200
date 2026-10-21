'use client';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Zap, AlertTriangle, AlertCircle } from 'lucide-react';
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
    description: '5 «мат в 2» + 5 рейтинговых задач на chess.com',
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

  // Suppress unused import warning
  void START_RATING;

  return (
    <main className="max-w-md mx-auto px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-amber-400">День {day} из 30</h1>
          <p className="text-sm text-slate-400 mt-0.5">{theme}</p>
        </div>
        <button onClick={doSync} disabled={syncing}
          className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>

      {/* Rating */}
      <div className="bg-slate-800/60 rounded-xl p-3 mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Рейтинг</p>
          <p className="text-2xl font-bold text-white">{currentRating ?? '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Цель сегодня</p>
          <p className="text-2xl font-bold text-amber-400">{targetToday}+</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Целевой</p>
          <p className="text-lg font-bold text-slate-300">1200</p>
        </div>
      </div>

      {/* Banners */}
      {syncResult?.lossStreakWarning && (
        <div className="flex items-start gap-2 bg-red-900/50 border border-red-700 rounded-xl p-3 mb-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200 font-medium">Стоп игре на сегодня — только задачи и разбор</p>
        </div>
      )}
      {syncResult?.blitzWarning && (
        <div className="flex items-start gap-2 bg-yellow-900/50 border border-yellow-700 rounded-xl p-3 mb-3">
          <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-200 font-medium">Месяц без блица и пули — и «Чистая неделя» потеряна</p>
        </div>
      )}
      {syncResult && syncResult.latecastleGames.length > 0 && (
        <div className="flex items-start gap-2 bg-orange-900/50 border border-orange-700 rounded-xl p-3 mb-3">
          <AlertTriangle size={18} className="text-orange-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-orange-200">Поздняя рокировка в {syncResult.latecastleGames.length} партии — старайся до 10-го хода</p>
        </div>
      )}

      {/* XP bar */}
      <div className="bg-slate-800/60 rounded-xl p-3 mb-4">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-slate-400 flex items-center gap-1"><Zap size={12} className="text-amber-400" /> {levelInfo.name}</span>
          <span className="text-xs text-amber-400">{totalXP} XP</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
            style={{ width: `${levelInfo.progress}%` }} />
        </div>
        {levelInfo.nextName && (
          <p className="text-xs text-slate-500 mt-1">До {levelInfo.nextName}: {levelInfo.nextMin! - totalXP} XP</p>
        )}
      </div>

      {/* Blocks */}
      <div>
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

      {/* Games today */}
      {syncResult && syncResult.gamesCount > 0 && (
        <p className="text-center text-xs text-slate-500 mt-2">Сегодня сыграно рапид-партий: {syncResult.gamesCount}</p>
      )}
    </main>
  );
}
