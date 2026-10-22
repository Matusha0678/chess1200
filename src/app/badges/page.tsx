'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BADGE_DEFINITIONS } from '@/lib/constants';
import type { BadgeRecord } from '@/types';

type IconName = 'flag' | 'flame' | 'shield' | 'rook' | 'crown' | 'trend' | 'star' | 'medal' | 'trophy'
  | 'target' | 'book' | 'stack' | 'zap' | 'knight' | 'bishop';

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  flag:   <><path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/></>,
  flame:  <path d="M12 3c1 3 5 5.2 5 10a5 5 0 0 1-10 0c0-2.6 1.4-4.2 2.6-5.2.2 2 1.4 3.2 2.4 3.2 0-3-1.2-5 0-8z"/>,
  shield: <><path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></>,
  rook:   <><path d="M5 4h3v2h2.5V4h3v2H16V4h3v4l-2 2v7h2v3H5v-3h2v-7L5 8z"/><path d="M7 10h10"/></>,
  crown:  <><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/><path d="M5 21h14"/></>,
  trend:  <><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></>,
  star:   <path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z"/>,
  medal:  <><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/><path d="M12 6.5v5M10 8h4"/></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/><path d="M12 14v4M8 21h8M9 18h6"/></>,
  target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
  book:   <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
  stack:  <><rect x="2" y="14" width="20" height="6" rx="2"/><rect x="5" y="8" width="14" height="6" rx="2"/><rect x="8" y="2" width="8" height="6" rx="2"/></>,
  zap:    <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
  knight: <><path d="M8 16h8"/><path d="M8 20h8"/><path d="M9 20V8c0-3 2-4 4-2l1 3 3-1v8c0 2-1 3-3 3H11c-2 0-3-1-2-3"/></>,
  bishop: <><path d="M12 2a2 2 0 0 1 2 2c0 1.5-1 2.5-1 4h-2c0-1.5-1-2.5-1-4a2 2 0 0 1 2-2z"/><path d="M8 20h8l-1-8H9z"/><path d="M7 20h10"/><path d="M12 8v4"/></>,
};

const BADGE_ICON_MAP: Record<string, IconName> = {
  // Дисциплина
  first_day:       'flag',
  streak_7:        'flame',
  streak_14:       'flame',
  streak_30:       'crown',
  clean_week:      'shield',
  full_month:      'trophy',
  // Тактика
  castle_10:       'rook',
  mate_master:     'crown',
  tactics_week:    'target',
  endgame_student: 'book',
  // Дебюты
  debut_first:     'book',
  debut_practiced: 'book',
  debut_mastered:  'star',
  repertoire_3:    'stack',
  // Таль
  tal_magic_5:     'zap',
  tal_magic_15:    'zap',
  tal_disciple:    'zap',
  // Рейтинг
  plus_50:         'trend',
  plus_100:        'trend',
  plus_200:        'trend',
  rating_900:      'star',
  rating_1000:     'star',
  rating_1100:     'medal',
  rating_1200:     'trophy',
  // Уровни
  level_knight:    'knight',
  level_bishop:    'bishop',
  level_rook:      'rook',
  level_queen:     'crown',
};

const BADGE_GROUPS = [
  { title: 'Дисциплина',    keys: ['first_day', 'streak_7', 'streak_14', 'streak_30', 'clean_week', 'full_month'] },
  { title: 'Тактика',       keys: ['castle_10', 'mate_master', 'tactics_week', 'endgame_student'] },
  { title: 'Дебюты',        keys: ['debut_first', 'debut_practiced', 'debut_mastered', 'repertoire_3'] },
  { title: 'Наследие Таля', keys: ['tal_magic_5', 'tal_magic_15', 'tal_disciple'] },
  { title: 'Рейтинг',       keys: ['plus_50', 'plus_100', 'plus_200', 'rating_900', 'rating_1000', 'rating_1100', 'rating_1200'] },
  { title: 'Уровни',        keys: ['level_knight', 'level_bishop', 'level_rook', 'level_queen'] },
];

function BadgeIcon({ name }: { name: IconName }) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

export default function BadgesPage() {
  const [earned, setEarned] = useState<BadgeRecord[]>([]);

  useEffect(() => {
    supabase.from('badges').select('*').then(({ data }) => {
      if (data) setEarned(data as BadgeRecord[]);
    });
  }, []);

  const earnedKeys = new Set(earned.map(b => b.badge_key));
  const total = BADGE_DEFINITIONS.length;
  const earnedCount = earned.length;
  const pct = total ? Math.round((earnedCount / total) * 100) : 0;

  return (
    <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">

      {/* Page title */}
      <div className="flex flex-wrap justify-between items-end gap-6 mb-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-[14px] text-[12px] font-semibold tracking-[0.14em] uppercase text-[#FFFFFF]">
            <span>Достижения</span>
            <span className="w-10 h-px bg-[#303030]" />
            <span className="text-[#A0A0A0]">Коллекция</span>
          </div>
          <h1 className="m-0 text-[48px] font-[500] leading-[1] tracking-[-0.01em]">
            Награды
          </h1>
        </div>

        {/* Progress pill */}
        <div className="flex-[0_1_280px] bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-5 flex flex-col gap-3">
          <div className="flex justify-between items-baseline">
            <span className="text-[13px] text-[#A0A0A0]">Открыто</span>
            <span className="font-cormorant text-[30px] font-semibold leading-[1.1]">
              {earnedCount}<span className="text-[#686868]"> из {total}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#262626] overflow-hidden">
            <div className="h-full bg-[#FFFFFF] transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-6">
        {BADGE_GROUPS.map(group => {
          const groupBadges = group.keys.map(key => BADGE_DEFINITIONS.find(b => b.key === key)).filter(Boolean);
          return (
            <section key={group.title} className="bg-[#0D0D0D] border border-[#262626] rounded-[20px]">
              <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#262626]">
                <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">{group.title}</span>
                <span className="text-[13px] text-[#A0A0A0]">
                  {groupBadges.filter(b => b && earnedKeys.has(b.key)).length} / {groupBadges.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                {groupBadges.map(badge => {
                  if (!badge) return null;
                  const isGoal = badge.key === 'rating_1200';
                  const isEarned = earnedKeys.has(badge.key);
                  const iconName = (BADGE_ICON_MAP[badge.key] ?? 'star') as IconName;
                  const showActive = isEarned || isGoal;

                  return (
                    <article
                      key={badge.key}
                      className={`bg-[#0D0D0D] border rounded-[20px] p-4 flex flex-col items-center gap-2 text-center
                        ${isGoal
                          ? 'border-[#FFFFFF] bg-[#111111]'
                          : isEarned
                            ? 'border-[#FFFFFF]'
                            : 'border-[#262626]'}`}
                    >
                      {/* Icon circle */}
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center border mb-1
                        ${showActive
                          ? 'border-[#FFFFFF] text-[#FFFFFF]'
                          : 'border-[#3A3A3A] text-[#606060]'}`}
                        style={showActive
                          ? { boxShadow: 'inset 0 0 0 5px #0A0A0A, inset 0 0 0 6px #303030' }
                          : { boxShadow: 'inset 0 0 0 5px #0A0A0A, inset 0 0 0 6px #262626' }}
                      >
                        <BadgeIcon name={iconName} />
                      </div>

                      {/* Name */}
                      <span className={`text-[15px] font-semibold leading-[1.3] ${showActive ? 'text-[#F5F5F5]' : 'text-[#606060]'}`}>
                        {badge.label}
                      </span>

                      {/* Description */}
                      <span className={`text-[13px] leading-[1.4] ${showActive ? 'text-[#BCBCBC]' : 'text-[#3A3A3A]'}`}>
                        {badge.description}
                      </span>

                      {/* Status */}
                      <span className={`inline-flex items-center gap-[5px] text-[12px] font-semibold border rounded-full px-3 py-[4px] mt-1
                        ${isEarned || isGoal ? 'text-[#FFFFFF] border-[#303030]' : 'text-[#A0A0A0] border-[#303030]'}`}>
                        {!isEarned && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="5" y="11" width="14" height="10" rx="2"/>
                            <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
                          </svg>
                        )}
                        {isEarned ? 'Открыто' : isGoal ? 'Цель' : 'Закрыто'}
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
