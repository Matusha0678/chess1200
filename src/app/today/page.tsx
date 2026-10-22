'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentDay, isLightDay, getDayTheme } from '@/lib/day-utils';
import { CHESS_LINKS, START_RATING, TARGET_RATING, DAY_SPECIAL_TASKS, TAL_GAMES, GRANDMASTER_QUOTES } from '@/lib/constants';
import { getLevelInfo } from '@/lib/xp';
import { checkAndAwardBadges } from '@/lib/badges';
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

/* ── helpers ── */
function Lbl({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span className={`text-[12px] font-semibold tracking-[0.14em] uppercase ${gold ? 'text-[#FFFFFF]' : 'text-[#A0A0A0]'}`}>
      {children}
    </span>
  );
}

function CheckBtn({ done, label, onToggle }: { done: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      type="button"
      aria-label={done ? 'Снять отметку: ' + label : 'Отметить выполненным: ' + label}
      aria-pressed={done}
      className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer border-[1.5px]
        ${done ? 'bg-[#FFFFFF] border-[#FFFFFF]' : 'bg-transparent border-[#3A3A3A] hover:border-[#FFFFFF]'}`}
    >
      {done && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#050505" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </button>
  );
}

/* ── Block row (inline, no separate component) ── */
interface BlockDef {
  key: keyof DailyProgress;
  title: string;
  duration: string;
  description: string;
  links: { label: string; href: string }[];
}

function BlockRow({
  index,
  block,
  done,
  onToggle,
  isFirst,
}: {
  index: number;
  block: BlockDef;
  done: boolean;
  onToggle: () => void;
  isFirst: boolean;
}) {
  return (
    <div
      className={`grid gap-x-5 py-[14px] px-5 items-start
        ${!isFirst ? 'border-t border-[#1E1E1E]' : ''}
        [grid-template-columns:48px_minmax(0,1fr)_auto_44px]
        max-[720px]:[grid-template-columns:36px_minmax(0,1fr)_44px]`}
    >
      {/* number */}
      <span className={`font-cormorant text-[26px] font-semibold leading-[1.4] select-none ${done ? 'text-[#FFFFFF]' : 'text-[#606060]'}`}>
        {String(index).padStart(2, '0')}
      </span>

      {/* text */}
      <div className="flex flex-col">
        <span className={`text-[17px] font-semibold leading-snug ${done ? 'line-through text-[#686868]' : 'text-[#F5F5F5]'}`}>
          {block.title}
        </span>
        <span className={`text-[14px] mt-[3px] ${done ? 'text-[#3A3A3A]' : 'text-[#A0A0A0]'}`}>
          {block.description}
        </span>
        {/* actions — mobile: span to col 2, appear on row 2 */}
        {block.links.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-[10px] [grid-column:2/span_2] md:[grid-column:auto] md:mt-0 md:hidden">
            {/* mobile actions rendered here (hidden on desktop) */}
            {block.links.map(l => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center h-9 px-[14px] rounded-full border border-[#303030] text-[#E5E5E5] no-underline text-[13px] hover:border-[#FFFFFF] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* actions — desktop only (hidden on mobile via CSS) */}
      {block.links.length > 0 && (
        <div className="hidden md:flex flex-wrap gap-2 items-center justify-end">
          {block.links.map(l => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center h-9 px-[14px] rounded-full border border-[#303030] text-[#E5E5E5] no-underline text-[13px] hover:border-[#FFFFFF] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </div>
      )}

      {/* check button — always last col */}
      <div className="flex items-start justify-end">
        <CheckBtn done={done} label={block.title} onToggle={onToggle} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════ */
export default function TodayPage() {
  const day = getCurrentDay();
  const isLight = isLightDay(day);
  const theme = getDayTheme(day);
  const blocks = isLight ? BLOCKS_LIGHT : BLOCKS_NORMAL;

  const [progress, setProgress]       = useState<DailyProgress | null>(null);
  const [allProgress, setAllProgress] = useState<DailyProgress[]>([]);
  const [syncing, setSyncing]         = useState(false);
  const [syncResult, setSyncResult]   = useState<SyncResult | null>(null);
  const [totalXP, setTotalXP]         = useState(0);
  const [currentRating, setCurrentRating] = useState<number | null>(null);
  const [streak, setStreak]           = useState(0);
  const [magicDone, setMagicDone]     = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // Persist magic done state to localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`magic_day_${day}`);
    if (saved === 'true') setMagicDone(true);
  }, [day]);

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
    checkAndAwardBadges().catch(() => {});
  }

  async function doSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/chess-sync');
      const data: SyncResult = await res.json();
      setSyncResult(data);
      if (data.rating) setCurrentRating(data.rating);
      checkAndAwardBadges().catch(() => {});
    } finally {
      setSyncing(false);
    }
  }

  /* ── derived ── */
  const levelInfo      = getLevelInfo(totalXP);
  const specialTask    = DAY_SPECIAL_TASKS[day] ?? null;
  const talGame        = TAL_GAMES[(day - 1) % TAL_GAMES.length];
  const completedCount = blocks.filter(b => !!(progress?.[b.key])).length + (magicDone ? 1 : 0);
  const totalBlocks    = blocks.length + 1; // +1 for Магия дня
  const ratingDiff     = currentRating ? currentRating - START_RATING : 0;
  const displayRating  = currentRating ?? START_RATING;
  const daysCompleted  = allProgress.filter(p => p.day_complete).length || 1;
  const approxTime     = isLight ? '≈ 1 ч' : '≈ 1 ч 45 мин';

  const dashIdx      = theme.indexOf(' — ');
  const titleText    = dashIdx >= 0 ? theme.slice(0, dashIdx) : theme;
  const subtitleText = dashIdx >= 0 ? theme.slice(dashIdx + 3) : '';

  /* magic block def */
  const magicBlock: BlockDef = {
    key: 'block_warmup' as keyof DailyProgress, // placeholder key (unused for magic)
    title: 'Магия дня',
    duration: '10',
    description: `${talGame.white} — ${talGame.black}${talGame.year ? `, ${talGame.year}` : ''}${talGame.note ? `. ${talGame.note}` : ''}. Разыграй в Analysis. Перед каждым ходом белых — остановись и подумай.`,
    links: [{ label: 'Analysis', href: CHESS_LINKS.games }],
  };

  /* ── JSX ── */
  return (
    <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">

      {/* ════ 3-COLUMN GRID ════ */}
      <div className="grid gap-6
        xl:grid-cols-[300px_1fr_300px]
        md:grid-cols-[1fr_300px]
        grid-cols-1">

        {/* ── LEFT COLUMN: day info card ── */}
        <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-5 md:p-6 flex flex-col gap-5
          md:col-span-1 xl:col-span-1 xl:row-span-1">

          {/* eyebrow */}
          <div className="flex items-center gap-3">
            <Lbl gold>День {String(day).padStart(2, '0')} из 30</Lbl>
            <span className="w-8 h-px bg-[#303030]" />
            <Lbl>Тема</Lbl>
          </div>

          {/* title */}
          <h1 className="m-0 font-semibold text-[44px] leading-[0.98] tracking-[-0.015em]">
            {titleText}
          </h1>

          {/* subtitle */}
          {subtitleText && (
            <p className="m-0 italic text-[22px] leading-[1.2] text-[#FFFFFF]">
              {subtitleText}
            </p>
          )}

          {/* counter */}
          <div className="flex items-baseline gap-3">
            <span className="font-cormorant text-[36px] font-semibold leading-[1.1]">
              {completedCount}/{totalBlocks}
            </span>
            <span className="text-[14px] text-[#A0A0A0]">блоков · {approxTime}</span>
          </div>

          {/* 30-day strip */}
          <div className="flex flex-col gap-3 mt-auto">
            <div className="flex justify-between text-[14px] text-[#A0A0A0]">
              <span>Месяц тренировок</span>
              <span>
                <span className="text-[#F5F5F5] font-semibold">{daysCompleted}</span>
                {' / 30'}
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 30 }, (_, i) => {
                const d = i + 1;
                const prog = allProgress.find(p => p.day_number === d);
                const isToday = d === day;
                const isDone  = prog?.day_complete;
                const active  = isToday || isDone;
                return (
                  <div
                    key={d}
                    className={`flex-1 h-[6px] rounded-full ${active ? 'bg-[#FFFFFF]' : 'bg-[#1E1E1E]'}`}
                    style={{ transition: 'background 0.3s' }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* ── CENTER COLUMN: program card ── */}
        <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px]
          md:col-start-1 xl:col-start-2">

          {/* card header */}
          <div className="flex items-center justify-between px-5 py-[18px] border-b border-[#262626]">
            <Lbl>Программа дня</Lbl>
            <span className="text-[13px] text-[#A0A0A0]">
              <span className="text-[#F5F5F5]">{completedCount}</span>
              {' из '}<span className="text-[#F5F5F5]">{totalBlocks}</span>
              {' выполнено'}
            </span>
          </div>

          {/* block rows */}
          {blocks.map((block, i) => (
            <BlockRow
              key={block.key}
              index={i + 1}
              block={block}
              done={!!(progress?.[block.key])}
              onToggle={() => toggleBlock(block.key)}
              isFirst={i === 0}
            />
          ))}

          {/* Магия дня */}
          <BlockRow
            index={blocks.length + 1}
            block={magicBlock}
            done={magicDone}
            onToggle={() => {
              const newVal = !magicDone;
              setMagicDone(newVal);
              localStorage.setItem(`magic_day_${day}`, String(newVal));
            }}
            isFirst={blocks.length === 0}
          />
        </div>

        {/* ── RIGHT COLUMN: stats sidebar ── */}
        <div className="flex flex-col gap-5
          md:col-start-2 md:row-start-1 md:row-span-2
          xl:col-start-3 xl:row-start-1 xl:row-span-1">

          {/* Rating card */}
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] flex flex-col">
            <div className="flex items-center justify-between px-5 py-[14px] border-b border-[#262626]">
              <Lbl>Рейтинг · Рапид</Lbl>
              <button
                onClick={doSync}
                disabled={syncing}
                type="button"
                aria-label="Обновить рейтинг"
                className="w-9 h-9 rounded-full border border-[#303030] flex items-center justify-center text-[#A0A0A0] hover:border-[#FFFFFF] hover:text-[#F5F5F5] transition-colors cursor-pointer bg-transparent disabled:opacity-40"
              >
                <svg
                  width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={syncing ? 'animate-spin' : ''}
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3">
              <div className="p-4 flex flex-col gap-[2px]">
                <span className="text-[12px] text-[#A0A0A0]">Сейчас</span>
                <span className="font-cormorant text-[32px] font-semibold leading-[1.1]">{displayRating}</span>
              </div>
              <div className="p-4 flex flex-col gap-[2px] border-l border-[#1E1E1E]">
                <span className="text-[12px] text-[#A0A0A0]">Прирост</span>
                <span className={`font-cormorant text-[32px] font-semibold leading-[1.1] ${ratingDiff >= 0 ? 'text-[#D0D0D0]' : 'text-[#A0A0A0]'}`}>
                  {ratingDiff >= 0 ? '+' : ''}{ratingDiff}
                </span>
              </div>
              <div className="p-4 flex flex-col gap-[2px] border-l border-[#1E1E1E]">
                <span className="text-[12px] text-[#A0A0A0]">Цель</span>
                <span className="font-cormorant text-[32px] font-semibold leading-[1.1] text-[#FFFFFF]">{TARGET_RATING}</span>
              </div>
            </div>
          </div>

          {/* 2×2 stats card */}
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] grid grid-cols-2">
            <div className="p-4 flex flex-col gap-[2px]">
              <span className="text-[13px] text-[#A0A0A0]">Стрик</span>
              <span className="font-cormorant text-[28px] font-semibold leading-[1.1]">
                {streak > 0 ? streak : 0}
                <span className="font-sans text-[13px] font-normal text-[#A0A0A0]"> дней</span>
              </span>
            </div>
            <div className="p-4 flex flex-col gap-[2px] border-l border-[#1E1E1E]">
              <span className="text-[13px] text-[#A0A0A0]">Уровень</span>
              <span className="font-cormorant text-[28px] font-semibold leading-[1.1]">{levelInfo.name}</span>
            </div>
            <div className="p-4 flex flex-col gap-[2px] border-t border-[#1E1E1E]">
              <span className="text-[13px] text-[#A0A0A0]">Опыт</span>
              <span className="font-cormorant text-[28px] font-semibold leading-[1.1]">
                {totalXP}
                <span className="font-sans text-[13px] font-normal text-[#A0A0A0]"> XP</span>
              </span>
            </div>
            <div className="p-4 flex flex-col gap-[2px] border-t border-l border-[#1E1E1E]">
              <span className="text-[13px] text-[#A0A0A0]">Партий</span>
              <span className="font-cormorant text-[28px] font-semibold leading-[1.1]">
                {syncResult?.gamesCount ?? 0}
              </span>
            </div>
          </div>

          {/* Special task */}
          {specialTask && (
            <div className="bg-[#111111] border border-[#303030] rounded-[20px] p-5 flex flex-col gap-[10px]">
              <Lbl gold>Особое задание</Lbl>
              <p className="m-0 text-[22px] font-[500] leading-[1.25]">{specialTask}</p>
            </div>
          )}

          {/* Sync button */}
          <button
            onClick={doSync}
            disabled={syncing}
            type="button"
            className="h-11 w-full border border-[#303030] rounded-[14px] text-[#E5E5E5] text-[14px] hover:border-[#FFFFFF] transition-colors disabled:opacity-40 cursor-pointer bg-transparent"
          >
            {syncing ? 'Синхронизация...' : 'Обновить рейтинг'}
          </button>

          {/* Sync warnings */}
          {syncResult && (syncResult.lossStreakWarning || syncResult.blitzWarning || syncResult.latecastleGames.length > 0) && (
            <div className="flex flex-col gap-2">
              {syncResult.lossStreakWarning && (
                <div className="border border-[#5A2A2A] bg-[#1A0E0E] rounded-2xl px-4 py-3 text-[14px] text-[#A0A0A0]">
                  Стоп игре — только задачи и разбор
                </div>
              )}
              {syncResult.blitzWarning && (
                <div className="border border-[#5A4A1A] bg-[#1A160A] rounded-2xl px-4 py-3 text-[14px] text-[#D6A93E]">
                  Сыграна блиц/пуля — «Чистая неделя» потеряна
                </div>
              )}
              {syncResult.latecastleGames.length > 0 && (
                <div className="border border-[#3A3A2A] bg-[#141411] rounded-2xl px-4 py-3 text-[14px] text-[#686868]">
                  Поздняя рокировка в {syncResult.latecastleGames.length} {syncResult.latecastleGames.length === 1 ? 'партии' : 'партиях'}
                </div>
              )}
            </div>
          )}

          {/* Grandmaster quote — rotates by day */}
          {(() => {
            const quote = GRANDMASTER_QUOTES[(day - 1) % GRANDMASTER_QUOTES.length];
            return (
              <figure className="m-0 pt-4 px-4 border-t border-[#1E1E1E]">
                <blockquote className="m-0 italic text-[19px] leading-[1.35] text-[#E5E5E5]">
                  &ldquo;{quote.text}&rdquo;
                </blockquote>
                <figcaption className="mt-3 text-[13px] text-[#A0A0A0]">— {quote.author}</figcaption>
              </figure>
            );
          })()}

        </div>
      </div>
    </main>
  );
}
