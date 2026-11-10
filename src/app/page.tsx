'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Opening, LineProgress } from '@/types/openings';

interface OpeningRow extends Opening {
  linesTotal: number;
  linesDue: number;
  linesNew: number;
  linesMastered: number;
  earliestNextReview: string | null;
}

function plural(n: number, one: string, few: string, many: string) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 19) return `${n} ${many}`;
  if (mod10 === 1) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

function formatNext(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (h < 1) return 'скоро';
  if (h < 24) return `через ${h} ч.`;
  if (d === 1) return 'завтра';
  if (d < 7) return `через ${d} дн.`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [openings, setOpenings] = useState<OpeningRow[]>([]);

  useEffect(() => {
    async function load() {
      const now = new Date().toISOString();

      const { data: ops } = await supabase
        .from('openings').select('*').order('created_at', { ascending: false });

      if (!ops || ops.length === 0) { setLoading(false); return; }

      const ids = ops.map(o => o.id);

      const { data: lines } = await supabase
        .from('opening_lines').select('id, opening_id').in('opening_id', ids);

      const lineIds = (lines ?? []).map(l => l.id);

      const { data: prog } = lineIds.length > 0
        ? await supabase.from('line_progress').select('*').in('line_id', lineIds)
        : { data: [] as LineProgress[] };

      const rows: OpeningRow[] = ops.map(op => {
        const opLines = (lines ?? []).filter(l => l.opening_id === op.id);
        const opLineIds = opLines.map(l => l.id);
        const opProg = (prog ?? []).filter(p => opLineIds.includes(p.line_id));
        const practicedIds = opProg.map(p => p.line_id);

        const linesNew      = opLineIds.filter(id => !practicedIds.includes(id)).length;
        const linesDue      = opProg.filter(p => p.next_review <= now && p.mastery < 5).length;
        const linesMastered = opProg.filter(p => p.mastery >= 5).length;

        const futureReviews = opProg
          .filter(p => p.next_review > now && p.mastery < 5)
          .map(p => p.next_review).sort();

        return {
          ...(op as Opening),
          linesTotal: opLines.length,
          linesNew,
          linesDue,
          linesMastered,
          earliestNextReview: futureReviews[0] ?? null,
        };
      });

      setOpenings(rows);
      setLoading(false);
    }
    load();
  }, []);

  const totalDue  = openings.reduce((s, o) => s + o.linesDue, 0);
  const totalNew  = openings.reduce((s, o) => s + o.linesNew, 0);
  const todayTotal = totalDue + totalNew;

  const nextReviewGlobal = openings
    .map(o => o.earliestNextReview).filter(Boolean).sort()[0] ?? null;

  // Opening to start with: most urgent first
  const firstOpening = [...openings]
    .filter(o => o.linesDue + o.linesNew > 0)
    .sort((a, b) => (b.linesDue - a.linesDue) || (b.linesNew - a.linesNew))[0] ?? null;

  if (loading) {
    return (
      <main className="max-w-[560px] mx-auto px-5 pt-12 pb-16">
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-8 w-28 bg-[#1E1E1E] rounded-[8px]" />
          <div className="h-32 bg-[#0D0D0D] border border-[#262626] rounded-[20px]" />
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[72px] bg-[#0D0D0D] border border-[#1E1E1E] rounded-[16px]" />
          ))}
        </div>
      </main>
    );
  }

  // ── No openings yet ────────────────────────────────────────────────────────
  if (openings.length === 0) {
    return (
      <main className="max-w-[560px] mx-auto px-5 pt-16 pb-16 flex flex-col items-center gap-5 text-center">
        <div className="text-[72px] leading-none select-none mt-4">♟</div>
        <h1 className="m-0 text-[36px] font-[500] leading-[1.1]">Нет дебютов</h1>
        <p className="m-0 text-[15px] text-[#808080] max-w-[320px]">
          Добавь первый дебют — и можно начинать тренировки
        </p>
        <Link
          href="/openings/new"
          className="mt-2 h-11 flex items-center gap-2 bg-white text-[#050505] hover:bg-[#ECECEC] rounded-full px-7 text-[14px] font-semibold transition-colors no-underline"
        >
          + Добавить дебют
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-[560px] mx-auto px-5 pt-10 pb-16">

      {/* Page title */}
      <h1 className="m-0 mb-6 text-[13px] font-semibold tracking-[0.14em] uppercase text-[#505050]">
        Сегодня
      </h1>

      {/* ── Status card ─────────────────────────────────────────────────────── */}
      {todayTotal === 0 ? (
        // All done for today
        <div className="bg-[#0D0D0D] border border-[#1E1E1E] rounded-[20px] px-8 py-8 mb-4 flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-full bg-[#1A1A1A] flex items-center justify-center mb-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div className="text-[22px] font-[500] text-[#F5F5F5]">Всё готово на сегодня</div>
          {nextReviewGlobal ? (
            <div className="text-[14px] text-[#505050]">
              Следующее повторение — <span className="text-[#808080]">{formatNext(nextReviewGlobal)}</span>
            </div>
          ) : (
            <div className="text-[14px] text-[#505050]">Добавь новые линии в дебюты</div>
          )}
        </div>
      ) : (
        // Has lines to practice
        <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] px-7 py-7 mb-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[56px] font-[700] leading-none tabular-nums text-[#FFFFFF]">
              {todayTotal}
            </span>
            <span className="text-[22px] text-[#808080]">
              {todayTotal % 10 === 1 && todayTotal % 100 !== 11 ? 'линия' :
               todayTotal % 10 >= 2 && todayTotal % 10 <= 4 && !(todayTotal % 100 >= 12 && todayTotal % 100 <= 14) ? 'линии' : 'линий'}
            </span>
          </div>
          <div className="text-[14px] text-[#505050] mb-6">
            {totalDue > 0 && totalNew > 0
              ? `${plural(totalDue, 'на повторение', 'на повторение', 'на повторение')} · ${plural(totalNew, 'новая', 'новые', 'новых')}`
              : totalDue > 0
                ? 'пора повторить — забываешь'
                : 'ещё ни разу не тренировал'}
          </div>
          {firstOpening && (
            <Link
              href={`/openings/${firstOpening.id}/practice`}
              className="flex items-center justify-center h-11 w-full bg-white text-[#050505] hover:bg-[#ECECEC] rounded-full text-[14px] font-semibold transition-colors no-underline"
            >
              Начать тренировку
            </Link>
          )}
        </div>
      )}

      {/* ── Per-opening list ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-[6px]">
        {openings
          .filter(o => o.linesTotal > 0)
          .sort((a, b) => (b.linesDue + b.linesNew) - (a.linesDue + a.linesNew))
          .map(o => {
            const toDoCount = o.linesDue + o.linesNew;
            const practicedCount = o.linesTotal - o.linesNew;
            const progressPct = o.linesTotal > 0 ? Math.round(practicedCount / o.linesTotal * 100) : 0;

            return (
              <Link
                key={o.id}
                href={`/openings/${o.id}/practice`}
                className="flex items-center gap-4 bg-[#0D0D0D] border border-[#1A1A1A] hover:border-[#383838] rounded-[14px] px-5 py-[14px] no-underline transition-colors group"
              >
                {/* Piece icon */}
                <span className="text-[22px] leading-none select-none shrink-0 opacity-70">
                  {o.color === 'white' ? '♙' : o.color === 'black' ? '♟' : '♗'}
                </span>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-[7px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[14px] font-[500] text-[#E0E0E0] truncate">
                        {o.name}
                      </span>
                      {o.eco_code && (
                        <span className="text-[11px] text-[#404040] shrink-0">{o.eco_code}</span>
                      )}
                    </div>
                    <div className="shrink-0 text-[13px] font-semibold">
                      {toDoCount > 0 ? (
                        <span className={o.linesDue > 0 ? 'text-[#FFFFFF]' : 'text-[#808080]'}>
                          {o.linesDue > 0 && o.linesNew > 0
                            ? `${o.linesDue} повт. · ${o.linesNew} нов.`
                            : o.linesDue > 0
                              ? `${plural(o.linesDue, 'повторение', 'повторения', 'повторений')}`
                              : `${plural(o.linesNew, 'новая', 'новые', 'новых')}`}
                        </span>
                      ) : (
                        <span className="text-[#2E2E2E] font-normal">готово</span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[2px] bg-[#1A1A1A] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#FFFFFF] rounded-full"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#383838] shrink-0 tabular-nums">
                      {practicedCount}/{o.linesTotal}
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <svg
                  className="text-[#282828] group-hover:text-[#606060] transition-colors shrink-0"
                  width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
            );
          })}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#141414]">
        <Link href="/openings" className="text-[13px] text-[#404040] hover:text-[#808080] transition-colors no-underline">
          Все дебюты
        </Link>
        <Link href="/openings/new" className="text-[13px] text-[#404040] hover:text-[#808080] transition-colors no-underline">
          + Добавить дебют
        </Link>
      </div>

    </main>
  );
}
