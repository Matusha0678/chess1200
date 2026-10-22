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
    <main className="max-w-[1320px] mx-auto px-5 md:px-10 pt-10 pb-16">

      {/* Page title */}
      <div className="flex flex-col gap-3 mb-8">
        <div className="flex items-center gap-[14px] text-[12px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E]">
          <span>Статистика</span>
          <span className="w-10 h-px bg-[#5A4C33]" />
          <span className="text-[#B3AC9F]">День {day} из 30</span>
        </div>
        <h1 className="m-0 font-cormorant text-[64px] font-[500] leading-[1] tracking-[-0.01em]">
          Прогресс
        </h1>
      </div>

      {/* Chart + Rating – two-col */}
      <div className="flex flex-wrap gap-6 items-stretch">

        {/* Chart card – main */}
        <section aria-label="Рейтинг за 30 дней" className="flex-[999_1_600px] min-w-0 bg-[#15130F] border border-[#2A2722] rounded-[20px] p-7 md:p-8 flex flex-col gap-6">
          <div className="flex justify-between items-center border-b border-[#2A2722] pb-[18px]">
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">Рейтинг за 30 дней</span>
            <div className="flex gap-5 text-[13px] text-[#C9C2B5]">
              <span className="flex items-center gap-2">
                <span className="w-[14px] h-[3px] rounded-full bg-[#D6B97E] inline-block" />
                Факт
              </span>
              <span className="flex items-center gap-2">
                <span className="w-[14px] h-0 border-t-2 border-dashed border-[#8F887C] inline-block" />
                Нужный темп
              </span>
            </div>
          </div>
          <RatingChart data={ratings} currentDay={day} />
          <div className="flex justify-between text-[12px] text-[#B3AC9F]">
            <span>День 1</span><span>День 10</span><span>День 20</span><span>День 30</span>
          </div>
        </section>

        {/* Rating card – side */}
        <aside className="flex-[1_1_360px] min-w-0 bg-[#1B1710] border border-[#4A3E28] rounded-[20px] p-7 md:p-8 flex flex-col justify-between gap-6">
          <div className="flex flex-col gap-[6px]">
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E]">Текущий рейтинг</span>
            <span className="font-cormorant text-[30px] font-semibold leading-[1.1]">{latestRating}</span>
            <span className="text-[13px] text-[#C9C2B5]">Рапид, chess.com</span>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-[14px]">
              <span className="text-[#C9C2B5]">До цели</span>
              <span className="font-semibold">{TARGET_RATING - latestRating}</span>
            </div>
            <div className="h-2 rounded-full bg-[#2A2722] overflow-hidden">
              <div
                className="h-full bg-[#D6B97E] transition-all duration-700"
                style={{ width: `${ratingPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="text-[#C9C2B5]">Прирост</span>
              <span className={`font-semibold ${ratingDiff >= 0 ? 'text-[#9BD3A6]' : 'text-[#D36B6B]'}`}>
                {ratingDiff >= 0 ? '+' : ''}{ratingDiff}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Stat tiles */}
      <section aria-label="Статистика" className="mt-6 bg-[#15130F] border border-[#2A2722] rounded-[20px]">
        <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#2A2722]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">Показатели</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3">
          {tiles.map(({ label, value, suffix }, i) => (
            <div
              key={label}
              className={`p-5 flex flex-col gap-[2px]
                ${i >= 2 ? 'border-t border-[#24221D]' : ''}
                ${i % 2 !== 0 ? 'border-l border-[#24221D]' : ''}
                md:${i >= 3 ? 'border-t border-[#24221D]' : ''}
                md:${i % 3 !== 0 ? 'border-l border-[#24221D]' : ''}`}
            >
              <span className="text-[13px] text-[#B3AC9F]">{label}</span>
              <span className="font-cormorant text-[30px] font-semibold leading-[1.1]">
                {value}
                {suffix && <span className="font-sans text-[16px] text-[#8F887C]"> {suffix}</span>}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Calendar */}
      <section aria-label="Календарь" className="mt-6 bg-[#15130F] border border-[#2A2722] rounded-[20px]">
        <div className="flex flex-wrap justify-between items-center px-5 py-[18px] border-b border-[#2A2722] gap-4">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">Календарь</span>
          <div className="flex flex-wrap gap-4 text-[13px] text-[#C9C2B5]">
            <span className="flex items-center gap-2">
              <span className="w-[12px] h-[12px] rounded-[3px] bg-[#D6B97E] inline-block" />
              Готово
            </span>
            <span className="flex items-center gap-2">
              <span className="w-[12px] h-[12px] rounded-[3px] bg-[#3A3122] border border-[#5A4C33] inline-block box-border" />
              Частично
            </span>
            <span className="flex items-center gap-2">
              <span className="w-[12px] h-[12px] rounded-[3px] border border-[#D6B97E] inline-block box-border" />
              Сегодня
            </span>
          </div>
        </div>
        <div className="p-5">
          <div className="grid gap-[10px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
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
                    'aspect-square rounded-[12px] border flex items-end pb-[8px] px-2 box-border text-[14px] font-semibold',
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
        </div>
      </section>

      {/* Resources */}
      <section className="mt-6 bg-[#15130F] border border-[#2A2722] rounded-[20px]">
        <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#2A2722]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">Ресурсы</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-5">
          {[
            { label: 'Мои партии',      href: 'https://www.chess.com/games/archive/rozt1shka', desc: 'Архив на chess.com' },
            { label: 'Insights',        href: 'https://www.chess.com/insights',                desc: 'Аналитика игры' },
            { label: 'Opening Explorer',href: 'https://www.chess.com/explorer',                desc: 'База дебютов' },
            { label: 'Мой профиль',     href: 'https://www.chess.com/member/rozt1shka',        desc: 'chess.com' },
            { label: 'Game Review',     href: 'https://www.chess.com/analysis',                desc: 'Разбор партий' },
            { label: 'Задачи',          href: 'https://www.chess.com/puzzles',                 desc: 'Тактика' },
          ].map(link => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
              className="bg-[#0D0C0A] border border-[#2A2722] rounded-[14px] p-4 flex flex-col gap-1 no-underline hover:border-[#D6B97E] transition-colors group">
              <span className="text-[15px] font-semibold text-[#F3EEE5] group-hover:text-[#D6B97E] transition-colors">{link.label}</span>
              <span className="text-[13px] text-[#B3AC9F]">{link.desc}</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
