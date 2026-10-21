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
    <main className="max-w-md mx-auto px-5 pt-8">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#444] mb-1">Достижения</p>
      <h1 className="text-3xl font-light tracking-tight mb-1">Награды</h1>
      <p className="text-sm text-[#444] mb-6">{earned.length} из {BADGE_DEFINITIONS.length}</p>

      <div className="space-y-px">
        {BADGE_DEFINITIONS.map(badge => {
          const isEarned = earnedKeys.has(badge.key);
          const Icon = BADGE_ICONS[badge.key] ?? Star;
          const earnedAt = earned.find(b => b.badge_key === badge.key)?.earned_at;
          return (
            <div key={badge.key}
              className={`flex items-center gap-4 p-4 border transition-colors rounded-lg mb-1
                ${isEarned
                  ? 'border-[#A07840]/30 bg-[#A07840]/5'
                  : 'border-[#141414] opacity-40'}`}>
              <div className={`w-9 h-9 rounded flex items-center justify-center flex-shrink-0
                ${isEarned ? 'bg-[#A07840]/10' : 'bg-[#111]'}`}>
                <Icon size={16} strokeWidth={1.5} className={isEarned ? 'text-[#A07840]' : 'text-[#333]'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isEarned ? 'text-[#EFEFEF]' : 'text-[#444]'}`}>
                  {badge.label}
                </p>
                <p className="text-xs text-[#444] mt-0.5">{badge.description}</p>
              </div>
              {isEarned && earnedAt && (
                <p className="text-[10px] text-[#555] flex-shrink-0">
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
