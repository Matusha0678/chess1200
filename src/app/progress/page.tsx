'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentDay } from '@/lib/day-utils';
import { START_RATING } from '@/lib/constants';
import RatingChart from '@/components/RatingChart';
import type { RatingPoint, DailyProgress, GameLog } from '@/types';

export default function ProgressPage() {
  const [ratings, setRatings] = useState<RatingPoint[]>([]);
  const [allProgress, setAllProgress] = useState<DailyProgress[]>([]);
  const [games, setGames] = useState<GameLog[]>([]);
  const [streak, setStreak] = useState(0);
  const day = getCurrentDay();

  useEffect(() => {
    async function load() {
      const [{ data: rData }, { data: pData }, { data: gData }, { data: sData }] = await Promise.all([
        supabase.from('rating_history').select('*').order('date', { ascending: true }),
        supabase.from('daily_progress').select('*').order('day_number'),
        supabase.from('game_logs').select('*'),
        supabase.from('streak').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (rData) setRatings(rData as RatingPoint[]);
      if (pData) setAllProgress(pData as DailyProgress[]);
      if (gData) setGames(gData as GameLog[]);
      if (sData) setStreak((sData as { current_streak?: number }).current_streak ?? 0);
    }
    load();
  }, []);

  const latestRating = ratings.length ? ratings[ratings.length - 1].rating : START_RATING;
  const totalGames = games.filter(g => g.time_control === 'rapid').length;
  const wins = games.filter(g => g.time_control === 'rapid' && g.result === 'win').length;
  const winPct = totalGames ? Math.round((wins / totalGames) * 100) : 0;
  const lateCastle = games.filter(g => g.castling_move !== null && g.castling_move > 10).length;
  const blitzCount = games.filter(g => g.time_control === 'blitz' || g.time_control === 'bullet').length;

  return (
    <main className="max-w-md mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold mb-4">Прогресс</h1>

      {/* Rating chart */}
      <div className="bg-slate-800/60 rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm font-semibold">Рейтинг</p>
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" />Факт</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" />Цель 1200</span>
          </div>
        </div>
        <RatingChart data={ratings} currentDay={day} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: 'Текущий рейтинг', value: latestRating, color: 'text-amber-400' },
          { label: 'Прирост', value: `+${latestRating - START_RATING}`, color: latestRating > START_RATING ? 'text-green-400' : 'text-red-400' },
          { label: 'Партии рапид', value: totalGames, color: 'text-white' },
          { label: 'Винрейт', value: `${winPct}%`, color: winPct >= 50 ? 'text-green-400' : 'text-red-400' },
          { label: 'Стрик', value: `${streak} дней`, color: 'text-amber-400' },
          { label: 'Поздняя рокировка', value: lateCastle, color: lateCastle > 0 ? 'text-red-400' : 'text-green-400' },
          { label: 'Блиц/пуля (≡ 0)', value: blitzCount, color: blitzCount > 0 ? 'text-red-400' : 'text-green-400' },
          { label: 'Дней завершено', value: allProgress.filter(p => p.day_complete).length, color: 'text-white' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-800/60 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Calendar heatmap */}
      <div className="bg-slate-800/60 rounded-xl p-4">
        <p className="text-sm font-semibold mb-3">Календарь (дни 1–30)</p>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 30 }, (_, i) => {
            const d = i + 1;
            const prog = allProgress.find(p => p.day_number === d);
            const isCurrent = d === day;
            const isFuture = d > day;
            const isDone = prog?.day_complete;
            const isPartial = prog && !prog.day_complete && (prog.block_warmup || prog.block_theme || prog.block_game || prog.block_review);
            return (
              <div key={d}
                className={`aspect-square rounded-md flex items-center justify-center text-xs font-medium transition-colors
                  ${isFuture ? 'bg-slate-800 text-slate-600'
                  : isDone ? 'bg-green-600 text-white'
                  : isPartial ? 'bg-amber-700/60 text-amber-200'
                  : isCurrent ? 'bg-slate-600 text-white ring-1 ring-amber-400'
                  : 'bg-slate-700 text-slate-400'}`}>
                {d}
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-600 inline-block" /> Завершён</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-700/60 inline-block" /> Частично</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-700 inline-block" /> Пропущен</span>
        </div>
      </div>
    </main>
  );
}
