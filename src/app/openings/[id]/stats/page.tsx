'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import type { Opening, OpeningLine, LineProgress } from '@/types/openings';

interface PracticeLogEntry {
  id: string;
  line_id: string;
  practiced_at: string;
  correct: boolean;
  mastery_after: number;
}

interface LineWithProgress extends OpeningLine {
  line_progress: LineProgress[];
}

interface DayBar {
  label: string;
  total: number;
  correct: number;
}

interface Props {
  params: Promise<{ id: string }>;
}

const COLOR_LABEL: Record<string, string> = { white: 'Белые', black: 'Чёрные', both: 'Оба цвета' };
const COLOR_ICON: Record<string, string>  = { white: '♙', black: '♟', both: '♗' };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// Custom tooltip for BarChart
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#050505] border border-[#262626] rounded-[10px] px-3 py-2 text-[12px]">
      <div className="text-[#A0A0A0] mb-1">{label}</div>
      <div className="text-[#F5F5F5] font-semibold">{payload[0].value} линий</div>
    </div>
  );
}

export default function OpeningStatsPage({ params }: Props) {
  const { id } = use(params);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [lines, setLines] = useState<LineWithProgress[]>([]);
  const [logs, setLogs] = useState<PracticeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: op }, { data: linesData }, { data: logsData }] = await Promise.all([
        supabase.from('openings').select('*').eq('id', id).single(),
        supabase.from('opening_lines').select('*, line_progress(*)').eq('opening_id', id).order('line_index'),
        supabase.from('opening_practice_log').select('*').eq('opening_id', id).order('practiced_at', { ascending: true }),
      ]);
      if (!op) return;
      setOpening(op as Opening);
      setLines((linesData as LineWithProgress[]) ?? []);
      setLogs((logsData as PracticeLogEntry[]) ?? []);
      setLoading(false);
    }
    load();
  }, [id]);

  // ── Derived stats ───────────────────────────────────────────────────────────

  const progress = lines.flatMap((l) => l.line_progress ?? []);
  const linesTotal = lines.length;

  // Mastery distribution: lines at each level 0-5
  const masteryDist = [0, 1, 2, 3, 4, 5].map((m) => ({
    level: m,
    count: m === 0
      ? (lines.length - progress.length) + progress.filter((p) => p.mastery === 0).length
      : progress.filter((p) => p.mastery === m).length,
  }));
  const maxMasteryCount = Math.max(...masteryDist.map((d) => d.count), 1);

  // Total stats
  const totalAttempts = logs.length;
  const totalCorrect  = logs.filter((l) => l.correct).length;
  const accuracy      = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : null;

  // Days with at least one practice
  const daySet = new Set(logs.map((l) => l.practiced_at.split('T')[0]));
  const daysPracticed = daySet.size;

  // 30-day activity chart (sliding window ending today)
  const dayBars: DayBar[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const iso = d.toISOString().split('T')[0];
    const dayLogs = logs.filter((l) => l.practiced_at.startsWith(iso));
    return {
      label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      total: dayLogs.length,
      correct: dayLogs.filter((l) => l.correct).length,
    };
  });

  // Session history (group by date, most recent first, last 20)
  const sessionMap = new Map<string, { total: number; correct: number }>();
  for (const log of logs) {
    const date = log.practiced_at.split('T')[0];
    const s = sessionMap.get(date) ?? { total: 0, correct: 0 };
    sessionMap.set(date, { total: s.total + 1, correct: s.correct + (log.correct ? 1 : 0) });
  }
  const sessions = [...sessionMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 20)
    .map(([date, s]) => ({
      date,
      label: fmtDate(date),
      total: s.total,
      correct: s.correct,
      acc: Math.round(s.correct / s.total * 100),
    }));

  // Best session
  const bestSession = sessions.length
    ? sessions.reduce((best, s) => s.total > best.total ? s : best, sessions[0])
    : null;

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">
        <div className="animate-pulse flex flex-col gap-6">
          <div className="h-4 w-40 bg-[#1E1E1E] rounded-full" />
          <div className="h-10 w-80 bg-[#1E1E1E] rounded-[10px]" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-[#0D0D0D] border border-[#262626] rounded-[16px]" />
            ))}
          </div>
          <div className="h-64 bg-[#0D0D0D] border border-[#262626] rounded-[20px]" />
        </div>
      </main>
    );
  }

  if (!opening) return null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-10">

      {/* Back */}
      <Link
        href={`/openings/${id}`}
        className="inline-flex items-center gap-2 text-[13px] text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors no-underline mb-6"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        {opening.name}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {opening.eco_code && (
              <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#FFFFFF] bg-[#1A1A1A] border border-[#303030] rounded-[8px] px-[10px] py-[4px]">
                {opening.eco_code}
              </span>
            )}
            <span className="flex items-center gap-[6px] text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0] bg-[#0D0D0D] border border-[#262626] rounded-[8px] px-[10px] py-[4px]">
              <span className="text-[15px] leading-none">{COLOR_ICON[opening.color]}</span>
              {COLOR_LABEL[opening.color]}
            </span>
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#505050]">
              Статистика
            </span>
          </div>
          <h1 className="m-0 font-[500] text-[40px] leading-[1] tracking-[-0.01em]">
            {opening.name}
          </h1>
        </div>

        <Link
          href={`/openings/${id}/practice`}
          className="h-10 flex items-center gap-2 bg-white text-[#050505] hover:bg-[#F0F0F0] rounded-full px-6 text-[14px] font-semibold transition-colors no-underline"
        >
          Тренировка →
        </Link>
      </div>

      {/* ── Top stat tiles ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Попыток всего',   value: totalAttempts || '—' },
          { label: 'Верных ходов',    value: totalCorrect  || '—' },
          { label: 'Дней практики',   value: daysPracticed || '—' },
          { label: 'Точность',        value: accuracy !== null ? `${accuracy}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#0D0D0D] border border-[#262626] rounded-[16px] p-5 flex flex-col gap-[3px]">
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#505050]">{label}</span>
            <span className="font-cormorant text-[36px] font-semibold leading-[1.1] text-[#F5F5F5]">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Two-col: mastery dist + best session ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 mb-6">

        {/* Mastery distribution */}
        <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-6">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#505050]">
              Распределение по уровню
            </span>
            <span className="text-[12px] text-[#505050]">{linesTotal} линий</span>
          </div>

          <div className="flex gap-2 items-end" style={{ height: 100 }}>
            {masteryDist.map(({ level, count }) => {
              const pct = Math.round((count / maxMasteryCount) * 80);
              const heightPx = Math.max(pct, count > 0 ? 6 : 2);
              const opacity = level === 0 ? 0.18 : level === 1 ? 0.3 : level === 2 ? 0.45 : level === 3 ? 0.6 : level === 4 ? 0.8 : 1;
              return (
                <div key={level} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[11px] tabular-nums text-[#505050]">{count}</span>
                  <div
                    className="w-full rounded-[4px] transition-all"
                    style={{
                      height: heightPx,
                      backgroundColor: `rgba(255,255,255,${opacity})`,
                    }}
                  />
                  <span className="text-[11px] text-[#404040] font-mono">{level}</span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between mt-4 text-[11px] text-[#404040]">
            <span>Не начато</span>
            <span>Освоено</span>
          </div>

          {/* Progress bar: mastered (≥4) */}
          {linesTotal > 0 && (
            <div className="mt-4 flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-[#505050]">
                <span>Освоено (уровень ≥4)</span>
                <span>{progress.filter(p => p.mastery >= 4).length} / {linesTotal}</span>
              </div>
              <div className="h-[4px] w-full bg-[#1E1E1E] rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${Math.round(progress.filter(p => p.mastery >= 4).length / linesTotal * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Best session + due info */}
        <div className="flex flex-col gap-4">
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-5 flex flex-col gap-3">
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#505050]">Лучшая сессия</span>
            {bestSession ? (
              <>
                <span className="font-cormorant text-[40px] font-semibold leading-[1]">{bestSession.total}</span>
                <span className="text-[13px] text-[#505050]">{bestSession.label} · {bestSession.acc}% верно</span>
              </>
            ) : (
              <span className="text-[13px] text-[#505050]">Нет данных</span>
            )}
          </div>

          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-5 flex flex-col gap-3">
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#505050]">К повторению сейчас</span>
            {(() => {
              const due = progress.filter(p => p.next_review <= new Date().toISOString() && p.mastery < 5).length;
              return (
                <>
                  <span className="font-cormorant text-[40px] font-semibold leading-[1]">{due}</span>
                  <span className="text-[13px] text-[#505050]">
                    {due === 0 ? 'Всё на месте' : 'линий ждут повторения'}
                  </span>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── 30-day activity chart ─────────────────────────────────────────────── */}
      <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#505050]">
            Активность · последние 30 дней
          </span>
          <span className="text-[12px] text-[#505050]">Линий в день</span>
        </div>

        {totalAttempts === 0 ? (
          <div className="h-[140px] flex items-center justify-center text-[13px] text-[#404040]">
            Пока нет данных — начни тренировку
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={dayBars} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={6}>
              <XAxis
                dataKey="label"
                tick={{ fill: '#505050', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: '#1E1E1E' }}
                interval={5}
              />
              <YAxis
                tick={{ fill: '#505050', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                {dayBars.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.total > 0 ? '#FFFFFF' : '#1E1E1E'}
                    fillOpacity={entry.total > 0 ? 0.9 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Session history ───────────────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px]">
          <div className="px-5 py-[18px] border-b border-[#262626]">
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#505050]">
              История сессий
            </span>
          </div>

          {/* Header row */}
          <div className="grid grid-cols-[1fr_80px_80px_80px] gap-x-4 px-5 py-3 border-b border-[#1E1E1E]">
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#404040]">Дата</span>
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#404040] text-right">Линий</span>
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#404040] text-right">Верно</span>
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#404040] text-right">Точность</span>
          </div>

          {sessions.map((s, i) => (
            <div
              key={s.date}
              className={`grid grid-cols-[1fr_80px_80px_80px] gap-x-4 px-5 py-4 items-center ${i > 0 ? 'border-t border-[#1A1A1A]' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-[13px] text-[#F5F5F5]">{s.label}</span>
                {/* mini activity bar */}
                <div className="flex-1 h-[3px] bg-[#1E1E1E] rounded-full overflow-hidden max-w-[80px]">
                  <div
                    className="h-full bg-white rounded-full"
                    style={{ width: `${Math.min(100, (s.total / (bestSession?.total ?? 1)) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="font-cormorant text-[20px] font-semibold text-[#D0D0D0] text-right tabular-nums">
                {s.total}
              </span>
              <span className="font-cormorant text-[20px] font-semibold text-[#A0A0A0] text-right tabular-nums">
                {s.correct}
              </span>
              <span className={`font-cormorant text-[20px] font-semibold text-right tabular-nums ${
                s.acc >= 80 ? 'text-[#F5F5F5]' : s.acc >= 60 ? 'text-[#A0A0A0]' : 'text-[#686868]'
              }`}>
                {s.acc}%
              </span>
            </div>
          ))}
        </div>
      )}

    </main>
  );
}
