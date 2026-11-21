'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { computeStats, type Game } from '@/lib/chesscom';
import { evaluate, CATEGORY_LABEL, CATEGORY_COLOR, type Achievement } from '@/lib/achievements';
import { AchievementIcon } from '@/components/AchievementIcon';

type Row = ReturnType<typeof evaluate>[number];

function calcStreakFromProgs(progs: { last_practiced: string | null }[]): number {
  const dates = progs
    .map(p => p.last_practiced?.slice(0, 10))
    .filter((s): s is string => !!s);
  if (dates.length === 0) return 0;
  const unique = Array.from(new Set(dates)).sort().reverse();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const yday = new Date(today); yday.setDate(yday.getDate() - 1);
  const ydayStr = yday.toISOString().slice(0, 10);
  if (unique[0] !== todayStr && unique[0] !== ydayStr) return 0;
  let streak = 0;
  let cursor = unique[0];
  for (const d of unique) {
    if (d === cursor) {
      streak++;
      const dd = new Date(cursor); dd.setDate(dd.getDate() - 1);
      cursor = dd.toISOString().slice(0, 10);
    } else {
      break;
    }
  }
  return streak;
}

export default function AchievementsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows]       = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [gamesRes, linesProgRes, linesTotalRes, openingsTotalRes] = await Promise.all([
          supabase.from('games').select('*').order('played_at', { ascending: false }).limit(500),
          supabase.from('line_progress').select('mastery, last_practiced'),
          supabase.from('opening_lines').select('id', { count: 'exact', head: true }),
          supabase.from('openings').select('id', { count: 'exact', head: true }),
        ]);
        const games: Game[] = (gamesRes.data ?? []) as Game[];
        const stats = computeStats(games);
        const progs = (linesProgRes.data ?? []) as Array<{ mastery: number; last_practiced: string | null }>;
        const masteredLines = progs.filter(p => p.mastery >= 5).length;
        const totalLines = linesTotalRes.count ?? 0;
        const totalOpenings = openingsTotalRes.count ?? 0;
        const streak = calcStreakFromProgs(progs);
        setRows(evaluate({ games, stats, totalLines, masteredLines, totalOpenings, streak }));
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const earned = rows.filter(r => r.earned);
  const pending = rows.filter(r => !r.earned);
  const byCategory: Record<Achievement['category'], Row[]> = {
    play: [], study: [], skill: [], streak: [], special: [],
  };
  for (const r of rows) byCategory[r.category].push(r);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/" className="page-back">← На главную</Link>
          <h1 className="page-title">Достижения</h1>
          <p className="page-lead">
            {loading ? 'Считаем…' : `${earned.length} из ${rows.length} получено`}
            {!loading && pending.length > 0 && <> · {pending.length} в прогрессе</>}
          </p>
        </div>
      </div>

      {!loading && rows.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">Нет данных</div>
          <div className="empty-state-text">Сыграй партии и возвращайся сюда.</div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          Загружаем прогресс…
        </div>
      ) : (
        (['play', 'skill', 'study', 'streak', 'special'] as const).map(cat => {
          const list = byCategory[cat];
          if (list.length === 0) return null;
          const catEarned = list.filter(r => r.earned).length;
          return (
            <section key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="bold-section-head">
                <span className="bold-section-num" style={{ background: `linear-gradient(140deg, ${CATEGORY_COLOR[cat]} 0%, color-mix(in srgb, ${CATEGORY_COLOR[cat]} 60%, var(--muted)) 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {String(list.length).padStart(2, '0')}
                </span>
                <div>
                  <div className="bold-section-title">{CATEGORY_LABEL[cat]}</div>
                  <div className="bold-section-sub">Получено {catEarned} из {list.length}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {list.map(a => (
                  <div key={a.id} style={{
                    padding: '14px 16px',
                    background: a.earned
                      ? `color-mix(in srgb, ${CATEGORY_COLOR[cat]} 14%, var(--surface))`
                      : 'var(--surface)',
                    border: `1px solid ${a.earned
                      ? `color-mix(in srgb, ${CATEGORY_COLOR[cat]} 40%, var(--hairline))`
                      : 'var(--hairline)'}`,
                    borderRadius: 'var(--radius-card, 0px)',
                    opacity: a.earned ? 1 : 0.55,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 20,
                        background: a.earned ? CATEGORY_COLOR[cat] : 'var(--surface-2)',
                        color: a.earned ? 'var(--accent-contrast, #fff)' : 'var(--muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <AchievementIcon name={a.icon} size={20} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ivory)' }}>{a.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.desc}</div>
                      </div>
                    </div>
                    {!a.earned && a.target > 1 && (
                      <div>
                        <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round((a.progress / a.target) * 100)}%`, height: '100%', background: CATEGORY_COLOR[cat], transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                          {a.progress} / {a.target}
                        </div>
                      </div>
                    )}
                    {a.earned && (
                      <div style={{ fontSize: 11, color: CATEGORY_COLOR[cat], fontWeight: 700, letterSpacing: 0.05, textTransform: 'uppercase' }}>
                        ✓ получено
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
