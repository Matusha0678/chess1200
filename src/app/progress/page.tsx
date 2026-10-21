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
      if (sData) setStreak((sData as { current_streak?: number })?.current_streak ?? 0);
    }
    load();
  }, []);

  const latestRating = ratings.length ? ratings[ratings.length - 1].rating : START_RATING;
  const totalGames = games.filter(g => g.time_control === 'rapid').length;
  const wins = games.filter(g => g.time_control === 'rapid' && g.result === 'win').length;
  const winPct = totalGames ? Math.round((wins / totalGames) * 100) : 0;
  const lateCastle = games.filter(g => g.castling_move !== null && (g.castling_move ?? 0) > 10).length;
  const blitzCount = games.filter(g => g.time_control === 'blitz' || g.time_control === 'bullet').length;
  const completedDays = allProgress.filter(p => p.day_complete).length;

  const stats = [
    { label: 'Рейтинг', value: latestRating, color: 'text-[#EFEFEF]' },
    { label: 'Прирост', value: `${latestRating - START_RATING >= 0 ? '+' : ''}${latestRating - START_RATING}`, color: latestRating >= START_RATING ? 'text-[#4A7A5A]' : 'text-[#7A4A4A]' },
    { label: 'Дней завершено', value: completedDays, color: 'text-[#EFEFEF]' },
    { label: 'Стрик', value: `${streak}д`, color: streak > 0 ? 'text-[#A07840]' : 'text-[#444]' },
    { label: 'Рапид партий', value: totalGames, color: 'text-[#EFEFEF]' },
    { label: 'Винрейт', value: `${winPct}%`, color: winPct >= 50 ? 'text-[#4A7A5A]' : 'text-[#7A4A4A]' },
    { label: 'Поздняя рокировка', value: lateCastle, color: lateCastle > 0 ? 'text-[#7A4A4A]' : 'text-[#4A7A5A]' },
    { label: 'Блиц / пуля', value: blitzCount, color: blitzCount > 0 ? 'text-[#7A4A4A]' : 'text-[#4A7A5A]' },
  ];

  return (
    <main className="max-w-md mx-auto px-5 pt-8 pb-8">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#444] mb-1">Статистика</p>
      <h1 className="text-3xl font-light tracking-tight mb-6">Прогресс</h1>

      {/* Rating chart */}
      <div className="border border-[#1E1E1E] rounded-lg p-4 mb-5">
        <div className="flex justify-between items-center mb-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#444]">Рейтинг / 30 дней</p>
          <div className="flex gap-3 text-[10px] text-[#333]">
            <span className="flex items-center gap-1.5"><span className="w-4 h-px bg-[#A07840] inline-block" />Факт</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-px bg-[#2A3A2A] inline-block" />1200</span>
          </div>
        </div>
        <RatingChart data={ratings} currentDay={day} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-px bg-[#1E1E1E] rounded-lg overflow-hidden border border-[#1E1E1E] mb-5">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="bg-[#111] p-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#444] mb-1.5">{label}</p>
            <p className={`text-2xl font-light ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Calendar heatmap */}
      <div className="border border-[#1E1E1E] rounded-lg p-4">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-4">Календарь</p>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 30 }, (_, i) => {
            const d = i + 1;
            const prog = allProgress.find(p => p.day_number === d);
            const isCurrent = d === day;
            const isFuture = d > day;
            const isDone = prog?.day_complete;
            const isPartial = prog && !prog.day_complete &&
              (prog.block_warmup || prog.block_theme || prog.block_game || prog.block_review);
            return (
              <div key={d}
                className={`aspect-square rounded flex items-center justify-center text-[10px] transition-colors
                  ${isFuture ? 'text-[#222]'
                  : isDone ? 'bg-[#A07840]/20 text-[#A07840] border border-[#A07840]/30'
                  : isPartial ? 'bg-[#1E1E1E] text-[#555]'
                  : isCurrent ? 'border border-[#2A2A2A] text-[#888]'
                  : 'text-[#2A2A2A]'}`}>
                {d}
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[10px] text-[#333]">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#A07840]/20 border border-[#A07840]/30 inline-block" />Готово</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1E1E1E] inline-block" />Частично</span>
        </div>
      </div>
    </main>
  );
}
