'use client';
import { useState, useEffect, useCallback } from 'react';
import DayBlock from '@/components/DayBlock';
import { supabase } from '@/lib/supabase';
import { getCurrentDay, isLightDay, getDayTheme } from '@/lib/day-utils';
import { CHESS_LINKS, START_RATING, TARGET_RATING, DAY_SPECIAL_TASKS, TAL_GAMES } from '@/lib/constants';
import { getLevelInfo } from '@/lib/xp';
import type { DailyProgress, SyncResult } from '@/types';

const BLOCKS_NORMAL = [
  { key: 'block_warmup' as keyof DailyProgress, title: 'Разминка',  duration: '10', description: '5 задач «мат в 2» + 5 рейтинговых задач', links: [{ label: 'Задачи', href: CHESS_LINKS.puzzles }] },
  { key: 'block_theme'  as keyof DailyProgress, title: 'Тема дня',  duration: '25', description: 'Урок + 15–20 задач по теме дня', links: [{ label: 'Уроки', href: CHESS_LINKS.lessons }, { label: 'Задачи', href: CHESS_LINKS.puzzles }] },
  { key: 'block_game'   as keyof DailyProgress, title: 'Игра',      duration: '50', description: '3 партии в рапид 10 минут', links: [{ label: 'Играть рапид', href: CHESS_LINKS.play }] },
  { key: 'block_review' as keyof DailyProgress, title: 'Разбор',    duration: '20', description: 'Сначала сам, потом Game Review. Запиши главную ошибку.', links: [{ label: 'Game Review', href: CHESS_LINKS.review }, { label: 'Тетрадь', href: '/notebook' }] },
];

const BLOCKS_LIGHT = [
  { key: 'block_warmup' as keyof DailyProgress, title: 'Задачи', duration: '30', description: 'Puzzle Rush + рейтинговые задачи', links: [{ label: 'Puzzle Rush', href: CHESS_LINKS.puzzleRush }, { label: 'Задачи', href: CHESS_LINKS.puzzles }] },
  { key: 'block_game'   as keyof DailyProgress, title: 'Игра',   duration: '30', description: '2 партии в рапид + просмотр Insights', links: [{ label: 'Играть рапид', href: CHESS_LINKS.play }, { label: 'Insights', href: CHESS_LINKS.insights }] },
];

const C = 351.86;

export default function TodayPage() {
  const day = getCurrentDay();
  const isLight = isLightDay(day);
  const theme = getDayTheme(day);
  const blocks = isLight ? BLOCKS_LIGHT : BLOCKS_NORMAL;

  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [allProgress, setAllProgress] = useState<DailyProgress[]>([]);
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
    const [{ data: xpData }, { data: ratingData }, { data: streakData }, { data: allProg }] = await Promise.all([
      supabase.from('user_xp').select('*').eq('id', 1).maybeSingle(),
      supabase.from('rating_history').select('rating').order('date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('streak').select('*').eq('id', 1).maybeSingle(),
      supabase.from('daily_progress').select('day_number,day_complete,block_warmup,block_theme,block_game,block_review').order('day_number'),
    ]);
    if (xpData) setTotalXP((xpData as { total_xp?: number }).total_xp ?? 0);
    if (ratingData) setCurrentRating((ratingData as { rating: number }).rating);
    if (streakData) setStreak((streakData as { current_streak?: number })?.current_streak ?? 0);
    if (allProg) setAllProgress(allProg as DailyProgress[]);
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
  const specialTask = DAY_SPECIAL_TASKS[day] ?? null;
  const talGame = TAL_GAMES[(day - 1) % TAL_GAMES.length];
  const completedCount = blocks.filter(b => !!(progress?.[b.key])).length;
  const totalBlocks = blocks.length + 1; // +1 for Магия дня
  const ringOffset = C - (C * completedCount) / totalBlocks;
  const left = totalBlocks - completedCount;
  const doneLabel = left === 0 ? 'День закрыт!' : `Осталось блоков: ${left}`;
  const ratingDiff = currentRating ? currentRating - START_RATING : 0;
  const displayRating = currentRating ?? START_RATING;

  const dashIdx = theme.indexOf(' — ');
  const titleText = dashIdx >= 0 ? theme.slice(0, dashIdx) : theme;
  const subtitleText = dashIdx >= 0 ? theme.slice(dashIdx + 3) : '';

  return (
    <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">

      {/* ── HERO ── */}
      <section className="flex flex-wrap gap-10 items-stretch">
        {/* Left: eyebrow + title */}
        <div className="flex-[999_1_560px] min-w-0 flex flex-col justify-end gap-[22px]">
          <div className="flex items-center gap-[14px] text-[13px] font-semibold tracking-[0.16em] uppercase text-[#D6B97E]">
            <span>День {String(day).padStart(2, '0')} из 30</span>
            <span className="w-10 h-px bg-[#5A4C33]" />
            <span className="text-[#B3AC9F]">Тема дня</span>
          </div>
          <h1 className="m-0 font-cormorant font-[500] text-[56px] md:text-[96px] leading-[0.98] tracking-[-0.015em]">
            {titleText}
          </h1>
          {subtitleText && (
            <p className="m-0 font-cormorant italic text-[28px] md:text-[36px] leading-[1.2] text-[#D6B97E]">
              {subtitleText}
            </p>
          )}
        </div>

        {/* Right: ring card */}
        <div className="flex-[1_1_380px] bg-[#15130F] border border-[#2A2722] rounded-[28px] p-8 flex flex-col gap-7">
          <div className="flex items-center gap-7">
            <div className="relative w-[132px] h-[132px] shrink-0">
              <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
                <circle cx="66" cy="66" r="56" fill="none" stroke="#2A2722" strokeWidth="8" />
                <circle cx="66" cy="66" r="56" fill="none" stroke="#D6B97E" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 66 66)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-cormorant text-[44px] font-semibold leading-none">
                  {completedCount}/{totalBlocks}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">Сегодня</span>
              <span className="text-[20px] font-semibold">{doneLabel}</span>
              <span className="text-[15px] text-[#B3AC9F]">≈ {isLight ? '1 ч' : '1 ч 45 мин'} тренировки</span>
            </div>
          </div>

          {/* 3 stats */}
          <div className="grid grid-cols-3 gap-3 border-t border-[#2A2722] pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-[#B3AC9F]">Рейтинг</span>
              <span className="font-cormorant text-[34px] font-semibold leading-[1.1]">{displayRating}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-[#B3AC9F]">Цель</span>
              <span className="font-cormorant text-[34px] font-semibold leading-[1.1] text-[#D6B97E]">{TARGET_RATING}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-[#B3AC9F]">Прирост</span>
              <span className={`font-cormorant text-[34px] font-semibold leading-[1.1] ${ratingDiff >= 0 ? 'text-[#9BD3A6]' : 'text-[#D36B6B]'}`}>
                {ratingDiff >= 0 ? '+' : ''}{ratingDiff}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 30-DAY STRIP ── */}
      <section aria-label="Месяц тренировок" className="mt-14 flex flex-col gap-[14px]">
        <div className="flex justify-between text-[14px] text-[#B3AC9F]">
          <span>Месяц тренировок</span>
          <span>
            <span className="text-[#F3EEE5] font-semibold">{allProgress.filter(p => p.day_complete).length || 1}</span>
            {' / 30 дней'}
          </span>
        </div>
        <div className="flex gap-[6px]">
          {Array.from({ length: 30 }, (_, i) => {
            const d = i + 1;
            const prog = allProgress.find(p => p.day_number === d);
            const isToday = d === day;
            const isDone = prog?.day_complete;
            const isActive = isToday || isDone;
            return (
              <div
                key={d}
                className={`flex-1 h-[10px] rounded-full ${isActive ? 'bg-[#D6B97E]' : 'bg-[#24221D]'}`}
                style={{ transition: 'background 0.3s' }}
              />
            );
          })}
        </div>
      </section>

      {/* ── PROGRAM + ASIDE ── */}
      <div className="mt-[72px] flex flex-wrap gap-12 items-start">

        {/* Program list */}
        <section aria-label="Программа дня" className="flex-[999_1_560px] min-w-0">
          <div className="flex items-baseline justify-between gap-4 pb-5">
            <h2 className="m-0 font-cormorant font-[500] text-[44px] leading-[1.1]">Программа дня</h2>
            <span className="text-[15px] text-[#B3AC9F]">{completedCount} из {totalBlocks} выполнено</span>
          </div>

          {blocks.map((block, i) => (
            <DayBlock
              key={block.key}
              index={i + 1}
              title={block.title}
              duration={block.duration}
              description={block.description}
              links={block.links}
              isComplete={!!(progress?.[block.key])}
              isActive={i === blocks.findIndex(b => !progress?.[b.key])}
              onToggle={() => toggleBlock(block.key)}
            />
          ))}

          {/* Магия дня — always last */}
          <DayBlock
            index={blocks.length + 1}
            title="Магия дня"
            duration="10"
            description={`${talGame.white} — ${talGame.black}${talGame.year ? `, ${talGame.year}` : ''}${talGame.note ? `. ${talGame.note}` : ''}. Разыграй в Analysis. Перед каждым ходом белых — остановись и подумай.`}
            links={[{ label: 'Analysis', href: CHESS_LINKS.games }]}
            isComplete={false}
            isActive={completedCount === blocks.length}
            onToggle={() => {}}
          />
        </section>

        {/* Aside */}
        <aside className="flex-[1_1_340px] flex flex-col gap-5">

          {/* 2×2 stat tiles */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Стрик', value: streak > 0 ? streak : 0, unit: 'дней' },
              { label: 'Уровень', value: levelInfo.name, unit: '' },
              { label: 'Опыт', value: totalXP, unit: 'XP' },
              { label: 'Партий', value: syncResult?.gamesCount ?? 0, unit: '' },
            ].map(({ label, value, unit }) => (
              <div key={label} className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-[22px]">
                <div className="text-[13px] text-[#B3AC9F]">{label}</div>
                <div className="font-cormorant text-[34px] md:text-[36px] font-semibold leading-[1.2]">
                  {value}{unit && <span className="font-sans text-[15px] font-medium text-[#B3AC9F]"> {unit}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Special task */}
          {specialTask && (
            <div className="bg-[#1B1710] border border-[#4A3E28] rounded-[24px] p-7 flex flex-col gap-3">
              <span className="text-[13px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E]">Особое задание</span>
              <p className="m-0 font-cormorant text-[28px] font-[500] leading-[1.2]">{specialTask}</p>
            </div>
          )}

          {/* Sync button */}
          <button
            onClick={doSync}
            disabled={syncing}
            className="flex items-center justify-center gap-3 h-11 rounded-full border border-[#34302A] text-[#B3AC9F] text-[14px] font-medium hover:border-[#D6B97E] hover:text-[#F3EEE5] transition-colors disabled:opacity-40 cursor-pointer bg-transparent"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={syncing ? 'animate-spin' : ''} aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {syncing ? 'Синхронизация...' : 'Обновить рейтинг'}
          </button>

          {syncResult && (syncResult.lossStreakWarning || syncResult.blitzWarning || syncResult.latecastleGames.length > 0) && (
            <div className="flex flex-col gap-2">
              {syncResult.lossStreakWarning && (
                <div className="border border-[#5A2A2A] bg-[#1A0E0E] rounded-2xl px-4 py-3 text-[14px] text-[#D36B6B]">
                  Стоп игре — только задачи и разбор
                </div>
              )}
              {syncResult.blitzWarning && (
                <div className="border border-[#5A4A1A] bg-[#1A160A] rounded-2xl px-4 py-3 text-[14px] text-[#D6A93E]">
                  Сыграна блиц/пуля — «Чистая неделя» потеряна
                </div>
              )}
              {syncResult.latecastleGames.length > 0 && (
                <div className="border border-[#3A3A2A] bg-[#141411] rounded-2xl px-4 py-3 text-[14px] text-[#8F887C]">
                  Поздняя рокировка в {syncResult.latecastleGames.length} {syncResult.latecastleGames.length === 1 ? 'партии' : 'партиях'}
                </div>
              )}
            </div>
          )}

          {/* Tal quote */}
          <figure className="m-0 mt-2 pt-7 border-t border-[#24221D]">
            <blockquote className="m-0 font-cormorant italic text-[26px] md:text-[28px] leading-[1.3] text-[#E7E1D6]">
              &ldquo;You must take your opponent into a deep dark forest where 2+2=5.&rdquo;
            </blockquote>
            <figcaption className="mt-[14px] text-[14px] text-[#B3AC9F]">— Михаил Таль</figcaption>
          </figure>
        </aside>
      </div>
    </main>
  );
}
