'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BADGE_DEFINITIONS } from '@/lib/constants';
import type { BadgeRecord } from '@/types';

function badgeEmoji(key: string): string {
  const map: Record<string, string> = {
    first_day:   '🌟',
    streak_7:    '🔥',
    clean_week:  '✨',
    castle_10:   '🏰',
    mate_master: '♟️',
    plus_100:    '📈',
    rating_1000: '💎',
    rating_1100: '👑',
    rating_1200: '🏆',
  };
  return map[key] ?? '🎖️';
}

export default function BadgesPage() {
  const [earned, setEarned] = useState<BadgeRecord[]>([]);

  useEffect(() => {
    supabase.from('badges').select('*').then(({ data }) => {
      if (data) setEarned(data as BadgeRecord[]);
    });
  }, []);

  const earnedKeys = new Set(earned.map(b => b.badge_key));

  return (
    <main className="max-w-md mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold mb-2">Награды</h1>
      <p className="text-sm text-slate-400 mb-5">{earned.length} из {BADGE_DEFINITIONS.length} получено</p>
      <div className="grid grid-cols-2 gap-3">
        {BADGE_DEFINITIONS.map(badge => {
          const isEarned = earnedKeys.has(badge.key);
          const earnedAt = earned.find(b => b.badge_key === badge.key)?.earned_at;
          return (
            <div key={badge.key}
              className={`rounded-xl p-4 border transition-all ${isEarned ? 'bg-amber-900/30 border-amber-600 shadow-amber-900/30 shadow-lg' : 'bg-slate-800/40 border-slate-700 opacity-50'}`}>
              <div className="text-3xl mb-2">{badgeEmoji(badge.key)}</div>
              <p className={`text-sm font-semibold mb-1 ${isEarned ? 'text-amber-300' : 'text-slate-400'}`}>{badge.label}</p>
              <p className="text-xs text-slate-500">{badge.description}</p>
              {isEarned && earnedAt && (
                <p className="text-xs text-amber-600 mt-1.5">{new Date(earnedAt).toLocaleDateString('ru-RU')}</p>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
