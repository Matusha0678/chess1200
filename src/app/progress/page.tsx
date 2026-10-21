'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentDay } from '@/lib/day-utils';
import { START_RATING, TARGET_RATING } from '@/lib/constants';
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
  const ratingDiff = latestRating - START_RATING;

  const stats = [
    { label: 'Рейтинг',           value: String(latestRating),                              color: 'text-[#EAE8E3]' },
    { label: 'Прирост',            value: `${ratingDiff >= 0 ? '+' : ''}${ratingDiff}`,      color: ratingDiff >= 0 ? 'text-[#4A7A5A]' : 'text-[#7A4A4A]' },
    { label: 'Дней завершено',     value: String(completedDays),                             color: 'text-[#EAE8E3]' },
    { label: 'Стрик',              value: streak > 0 ? `${streak} дн` : '—',                 color: streak > 0 ? 'text-[#C9A96E]' : 'text-[#444]' },
    { label: 'Рапид партий',       value: String(totalGames),                                color: 'text-[#EAE8E3]' },
    { label: 'Винрейт',            value: `${winPct}%`,                                      color: winPct >= 50 ? 'text-[#4A7A5A]' : 'text-[#7A4A4A]' },
    { label: 'Поздняя рокировка',  value: String(lateCastle),                               color: lateCastle > 0 ? 'text-[#7A4A4A]' : 'text-[#4A7A5A]' },
    { label: 'Блиц / пуля',        value: String(blitzCount),                               color: blitzCount > 0 ? 'text-[#7A4A4A]' : 'text-[#4A7A5A]' },
  ];

  return (
    <main className="px-5 pt-8 pb-8 md:px-12 md:pt-12 max-w-2xl">

      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#444] mb-3">Статистика</p>
        <h1 className="font-cormorant text-[56px] font-light italic leading-[0.9] text-[#EAE8E3]">
          Прогресс
        </h1>
      </div>

      {/* Rating chart */}
      <div className="border border-[#181818] p-5 mb-5">
        <div className="flex justify-between items-center mb-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#333]">Рейтинг / 30 дней</p>
          <div className="flex gap-3 text-[10px] text-[#333]">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-px bg-[#C9A96E] inline-block" />Факт
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-px bg-[#2A3A2A] inline-block" />{TARGET_RATING}
            </span>
          </div>
        </div>
        <RatingChart data={ratings} currentDay={day} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 border border-[#181818] mb-5">
        {stats.map(({ label, value, color }, i) => (
          <div key={label}
            className={`p-4 ${i % 2 === 0 ? 'border-r border-[#181818]' : ''} ${i < stats.length - 2 ? 'border-b border-[#181818]' : ''}`}>
            <p className="text-[9px] uppercase tracking-[0.15em] text-[#333] mb-1.5">{label}</p>
            <p className={`font-cormorant text-2xl font-light ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Calendar heatmap */}
      <div className="border border-[#181818] p-5">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#333] mb-4">Календарь</p>
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
                className={`aspect-square flex items-center justify-center text-[10px] transition-colors font-cormorant text-sm
                  ${isFuture ? 'text-[#1E1E1E]'
                  : isDone ? 'bg-[#C9A96E]/15 text-[#C9A96E] border border-[#C9A96E]/25'
                  : isPartial ? 'bg-[#181818] text-[#444]'
                  : isCurrent ? 'border border-[#2A2A2A] text-[#666]'
                  : 'text-[#252525]'}`}>
                {d}
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[10px] text-[#333]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#C9A96E]/15 border border-[#C9A96E]/25 inline-block" />Готово
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#181818] inline-block" />Частично
          </span>
        </div>
      </div>
    </main>
  );
}
