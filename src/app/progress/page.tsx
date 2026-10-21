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
  const ratingPct = Math.round(Math.max(0, Math.min(100, ((latestRating - START_RATING) / (TARGET_RATING - START_RATING)) * 100)));

  const tiles = [
    { label: 'Дней завершено', value: completedDays, suffix: '/ 30' },
    { label: 'Стрик',          value: streak > 0 ? streak : '—', suffix: streak > 0 ? 'дн' : '' },
    { label: 'Рапид партий',   value: totalGames, suffix: '' },
    { label: 'Винрейт',        value: totalGames ? `${winPct}%` : '0%', suffix: '' },
    { label: 'Поздняя рокировка', value: lateCastle, suffix: '' },
    { label: 'Блиц / пуля',   value: blitzCount, suffix: '' },
  ];

  return (
    <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">

      {/* Header */}
      <div className="flex flex-col gap-[18px] mb-14">
        <div className="flex items-center gap-[14px] text-[13px] font-semibold tracking-[0.16em] uppercase text-[#D6B97E]">
          <span>Статистика</span>
          <span className="w-10 h-px bg-[#5A4C33]" />
          <span className="text-[#B3AC9F]">День {day} из 30</span>
        </div>
        <h1 className="m-0 font-cormorant font-[500] text-[56px] md:text-[96px] leading-[0.98] tracking-[-0.015em]">
          Прогресс
        </h1>
      </div>

      {/* Chart + Rating card */}
      <div className="flex flex-wrap gap-6 items-stretch">

        {/* Chart card */}
        <section aria-label="Рейтинг за 30 дней" className="flex-[999_1_560px] min-w-0 bg-[#15130F] border border-[#2A2722] rounded-[28px] p-8 flex flex-col gap-6">
          <div className="flex flex-wrap justify-between items-baseline gap-4">
            <h2 className="m-0 font-cormorant font-[500] text-[34px] leading-[1.1]">Рейтинг за 30 дней</h2>
            <div className="flex gap-5 text-[14px] text-[#C9C2B5]">
              <span className="flex items-center gap-2">
                <span className="w-[18px] h-[3px] rounded-full bg-[#D6B97E] inline-block" />
                Факт
              </span>
              <span className="flex items-center gap-2">
                <span className="w-[18px] h-0 border-t-2 border-dashed border-[#8F887C] inline-block" />
                Нужный темп
              </span>
            </div>
          </div>
          <RatingChart data={ratings} currentDay={day} />
          <div className="flex justify-between text-[13px] text-[#B3AC9F] pt-1">
            <span>День 1</span><span>День 10</span><span>День 20</span><span>День 30</span>
          </div>
        </section>

        {/* Current rating card */}
        <aside className="flex-[1_1_340px] bg-[#1B1710] border border-[#4A3E28] rounded-[28px] p-8 flex flex-col justify-between gap-7">
          <div className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E]">Текущий рейтинг</span>
            <span className="font-cormorant text-[96px] md:text-[112px] font-[500] leading-[0.95]">{latestRating}</span>
            <span className="text-[16px] text-[#C9C2B5]">Рапид, chess.com</span>
          </div>
          <div className="flex flex-col gap-[10px]">
            <div className="flex justify-between text-[15px]">
              <span className="text-[#C9C2B5]">До цели</span>
              <span className="font-semibold">{TARGET_RATING - latestRating}</span>
            </div>
            <div className="h-2 rounded-full bg-[#2A2722] overflow-hidden">
              <div
                className="h-full bg-[#D6B97E] transition-all duration-700"
                style={{ width: `${ratingPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="text-[#C9C2B5]">Прирост</span>
              <span className={`font-semibold ${ratingDiff >= 0 ? 'text-[#9BD3A6]' : 'text-[#D36B6B]'}`}>
                {ratingDiff >= 0 ? '+' : ''}{ratingDiff}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Stat tiles */}
      <section aria-label="Статистика" className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
        {tiles.map(({ label, value, suffix }) => (
          <div key={label} className="bg-[#15130F] border border-[#2A2722] rounded-[20px] px-6 py-[22px] flex flex-col gap-1">
            <span className="text-[14px] text-[#B3AC9F]">{label}</span>
            <span className="font-cormorant text-[40px] font-semibold leading-[1.15]">
              {value}
              {suffix && <span className="font-sans text-[22px] text-[#8F887C]"> {suffix}</span>}
            </span>
          </div>
        ))}
      </section>

      {/* Calendar */}
      <section aria-label="Календарь" className="mt-[72px] flex flex-col gap-6">
        <div className="flex flex-wrap justify-between items-baseline gap-4">
          <h2 className="m-0 font-cormorant font-[500] text-[44px] leading-[1.1]">Календарь</h2>
          <div className="flex flex-wrap gap-5 text-[14px] text-[#C9C2B5]">
            <span className="flex items-center gap-2">
              <span className="w-[14px] h-[14px] rounded-[4px] bg-[#D6B97E] inline-block" />
              Готово
            </span>
            <span className="flex items-center gap-2">
              <span className="w-[14px] h-[14px] rounded-[4px] bg-[#3A3122] border border-[#5A4C33] inline-block box-border" />
              Частично
            </span>
            <span className="flex items-center gap-2">
              <span className="w-[14px] h-[14px] rounded-[4px] border border-[#D6B97E] inline-block box-border" />
              Сегодня
            </span>
          </div>
        </div>
        <div className="grid gap-[10px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
          {Array.from({ length: 30 }, (_, i) => {
            const d = i + 1;
            const prog = allProgress.find(p => p.day_number === d);
            const isToday = d === day;
            const isDone = prog?.day_complete;
            const isPartial = prog && !prog.day_complete &&
              (prog.block_warmup || prog.block_theme || prog.block_game || prog.block_review);
            return (
              <div
                key={d}
                className={[
                  'aspect-square rounded-[14px] border flex items-end pb-[10px] px-3 box-border text-[15px] font-semibold',
                  isDone   ? 'bg-[#D6B97E] border-[#D6B97E] text-[#0D0C0A]'
                  : isPartial ? 'bg-[#3A3122] border-[#5A4C33] text-[#F3EEE5]'
                  : isToday  ? 'bg-[#1B1710] border-[#D6B97E] text-[#D6B97E]'
                  : 'bg-[#121110] border-[#2A2722] text-[#B3AC9F]',
                ].join(' ')}
              >
                {d}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
