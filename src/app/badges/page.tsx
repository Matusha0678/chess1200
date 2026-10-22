'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BADGE_DEFINITIONS } from '@/lib/constants';
import type { BadgeRecord } from '@/types';

type IconName = 'flag' | 'flame' | 'shield' | 'rook' | 'crown' | 'trend' | 'star' | 'medal' | 'trophy';

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
};

const BADGE_ICON_MAP: Record<string, IconName> = {
  first_day:   'flag',
  streak_7:    'flame',
  clean_week:  'shield',
  castle_10:   'rook',
  mate_master: 'crown',
  plus_100:    'trend',
  rating_1000: 'star',
  rating_1100: 'medal',
  rating_1200: 'trophy',
};

const BADGE_GROUPS = [
  { title: 'Дисциплина', keys: ['first_day', 'streak_7', 'clean_week'] },
  { title: 'Навыки',     keys: ['castle_10', 'mate_master'] },
  { title: 'Рейтинг',   keys: ['plus_100', 'rating_1000', 'rating_1100', 'rating_1200'] },
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
    <main className="max-w-[1320px] mx-auto px-5 md:px-10 pt-10 pb-16">

      {/* Page title */}
      <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-[14px] text-[12px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E]">
            <span>Достижения</span>
            <span className="w-10 h-px bg-[#5A4C33]" />
            <span className="text-[#B3AC9F]">Коллекция</span>
          </div>
          <h1 className="m-0 font-cormorant text-[64px] font-[500] leading-[1] tracking-[-0.01em]">
            Награды
          </h1>
        </div>

        {/* Progress pill */}
        <div className="flex-[0_1_280px] bg-[#15130F] border border-[#2A2722] rounded-[20px] p-5 flex flex-col gap-3">
          <div className="flex justify-between items-baseline">
            <span className="text-[13px] text-[#B3AC9F]">Открыто</span>
            <span className="font-cormorant text-[30px] font-semibold leading-[1.1]">
              {earnedCount}<span className="text-[#8F887C]"> из {total}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#2A2722] overflow-hidden">
            <div className="h-full bg-[#D6B97E] transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-6">
        {BADGE_GROUPS.map(group => {
          const groupBadges = group.keys.map(key => BADGE_DEFINITIONS.find(b => b.key === key)).filter(Boolean);
          return (
            <section key={group.title} className="bg-[#15130F] border border-[#2A2722] rounded-[20px]">
              <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#2A2722]">
                <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">{group.title}</span>
                <span className="text-[13px] text-[#B3AC9F]">
                  {groupBadges.filter(b => b && earnedKeys.has(b.key)).length} / {groupBadges.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-5">
                {groupBadges.map(badge => {
                  if (!badge) return null;
                  const isGoal = badge.key === 'rating_1200';
                  const isEarned = earnedKeys.has(badge.key);
                  const iconName = (BADGE_ICON_MAP[badge.key] ?? 'star') as IconName;
                  const showActive = isEarned || isGoal;

                  return (
                    <article
                      key={badge.key}
                      className={`bg-[#15130F] border rounded-[20px] p-5 flex flex-col items-center gap-2 text-center
                        ${isGoal
                          ? 'border-[#D6B97E] bg-[#1B1710]'
                          : isEarned
                            ? 'border-[#D6B97E]'
                            : 'border-[#2A2722]'}`}
                    >
                      {/* Icon circle */}
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center border mb-1
                        ${showActive
                          ? 'border-[#D6B97E] text-[#D6B97E]'
                          : 'border-[#4A463F] text-[#6F695F]'}`}
                        style={showActive
                          ? { boxShadow: 'inset 0 0 0 5px #100F0D, inset 0 0 0 6px #5A4C33' }
                          : { boxShadow: 'inset 0 0 0 5px #100F0D, inset 0 0 0 6px #2A2722' }}
                      >
                        <BadgeIcon name={iconName} />
                      </div>

                      {/* Name */}
                      <span className={`text-[15px] font-semibold leading-[1.3] ${showActive ? 'text-[#F3EEE5]' : 'text-[#6F695F]'}`}>
                        {badge.label}
                      </span>

                      {/* Description */}
                      <span className={`text-[13px] leading-[1.4] ${showActive ? 'text-[#C9C2B5]' : 'text-[#4A463F]'}`}>
                        {badge.description}
                      </span>

                      {/* Status */}
                      <span className={`inline-flex items-center gap-[5px] text-[12px] font-semibold border rounded-full px-3 py-[4px] mt-1
                        ${isEarned || isGoal ? 'text-[#D6B97E] border-[#5A4C33]' : 'text-[#B3AC9F] border-[#34302A]'}`}>
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
