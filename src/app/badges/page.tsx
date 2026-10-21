'use client';
import { useState, useEffect } from 'react';
import { Star, Flame, Shield, Lock, Target, TrendingUp, Gem, Crown, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BADGE_DEFINITIONS } from '@/lib/constants';
import type { BadgeRecord } from '@/types';

const BADGE_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  first_day:    Star,
  streak_7:     Flame,
  clean_week:   Shield,
  castle_10:    Lock,
  mate_master:  Target,
  plus_100:     TrendingUp,
  rating_1000:  Gem,
  rating_1100:  Crown,
  rating_1200:  Trophy,
};

export default function BadgesPage() {
  const [earned, setEarned] = useState<BadgeRecord[]>([]);

  useEffect(() => {
    supabase.from('badges').select('*').then(({ data }) => {
      if (data) setEarned(data as BadgeRecord[]);
    });
  }, []);

  const earnedKeys = new Set(earned.map(b => b.badge_key));

  return (
    <main className="px-5 pt-8 pb-8 md:px-12 md:pt-12 max-w-2xl">

      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#444] mb-3">Достижения</p>
        <h1 className="font-cormorant text-[56px] font-light italic leading-[0.9] text-[#EAE8E3]">
          Награды
        </h1>
        <p className="text-sm text-[#333] mt-3">{earned.length} из {BADGE_DEFINITIONS.length}</p>
      </div>

      <div>
        {BADGE_DEFINITIONS.map((badge, i) => {
          const isEarned = earnedKeys.has(badge.key);
          const Icon = BADGE_ICONS[badge.key] ?? Star;
          const earnedAt = earned.find(b => b.badge_key === badge.key)?.earned_at;
          return (
            <div key={badge.key}
              className={`flex items-center gap-4 py-4 border-b border-[#181818] transition-opacity
                ${i === BADGE_DEFINITIONS.length - 1 ? 'border-b-0' : ''}
                ${isEarned ? '' : 'opacity-30'}`}>
              <div className={`w-8 h-8 flex items-center justify-center flex-shrink-0 border
                ${isEarned ? 'border-[#C9A96E]/30' : 'border-[#181818]'}`}>
                <Icon size={15} strokeWidth={1.5} className={isEarned ? 'text-[#C9A96E]' : 'text-[#2A2A2A]'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-light ${isEarned ? 'text-[#EAE8E3]' : 'text-[#333]'}`}>
                  {badge.label}
                </p>
                <p className="text-xs text-[#333] mt-0.5">{badge.description}</p>
              </div>
              {isEarned && earnedAt && (
                <p className="text-[10px] text-[#444] flex-shrink-0">
                  {new Date(earnedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
