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

const MONTH_NAMES = [
  'января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря',
];
const DAY_NAMES = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const DAY_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

function plural(n: number, one: string, few: string, many: string) {
  const m100 = n % 100, m10 = n % 10;
  if (m100 >= 11 && m100 <= 19) return `${n} ${many}`;
  if (m10 === 1) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4) return `${n} ${few}`;
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

function calcStreak(practicedAts: string[]): number {
  if (practicedAts.length === 0) return 0;
  const unique = [...new Set(practicedAts.map(d => d.slice(0, 10)))].sort().reverse();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const yday = new Date(today); yday.setDate(yday.getDate() - 1);
  const ydayStr = yday.toISOString().slice(0, 10);
  if (unique[0] !== todayStr && unique[0] !== ydayStr) return 0;
  let streak = 0;
  let checkStr = unique[0];
  for (const d of unique) {
    if (d === checkStr) {
      streak++;
      const next = new Date(checkStr + 'T00:00:00');
      next.setDate(next.getDate() - 1);
      checkStr = next.toISOString().slice(0, 10);
    } else break;
  }
  return streak;
}

function ActivityChart({ counts }: { counts: number[] }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6 + i);
    return { dow: d.getDay(), count: counts[i], isToday: i === 6 };
  });
  const maxVal = Math.max(...counts, 1);
  const H = 44;

  return (
    <div className="flex items-end gap-[5px]" style={{ height: `${H + 20}px` }}>
      {days.map((day, i) => {
        const barH = day.count > 0 ? Math.max(4, Math.round((day.count / maxVal) * H)) : 2;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-[6px]">
            <div className="w-full flex items-end justify-center" style={{ height: `${H}px` }}>
              {day.count > 0 && (
                <div className="text-[9px] text-[#404040] mb-[2px] tabular-nums">{day.count}</div>
              )}
            </div>
            <div className="w-full" style={{ height: `${H}px`, position: 'relative', marginTop: `-${H}px` }}>
              <div
                className="w-full absolute bottom-0 rounded-t-[3px] transition-all"
                style={{
                  height: `${barH}px`,
                  backgroundColor: day.isToday
                    ? (day.count > 0 ? '#FFFFFF' : '#2A2A2A')
                    : (day.count > 0 ? '#404040' : '#1A1A1A'),
                }}
              />
            </div>
            <span className="text-[9px] font-medium" style={{ color: day.isToday ? '#808080' : '#3A3A3A' }}>
              {DAY_SHORT[day.dow]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MasteryBar({ dist, total }: { dist: number[]; total: number }) {
  if (total === 0) return null;
  const colors = ['#1E1E1E', '#2D2D2D', '#424242', '#636363', '#939393', '#E8E8E8'];
  const labels = ['Новые', 'Ур. 1', 'Ур. 2', 'Ур. 3', 'Ур. 4', 'Освоены'];

  return (
    <div className="flex flex-col gap-3">
      {/* Stacked bar */}
      <div className="flex h-[10px] rounded-full overflow-hidden gap-[1px]">
        {dist.map((count, level) => {
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={level}
              className="h-full"
              style={{ width: `${pct}%`, backgroundColor: colors[level], minWidth: count > 0 ? '2px' : 0 }}
              title={`${labels[level]}: ${count}`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {dist.map((count, level) => {
          if (count === 0) return null;
          return (
            <div key={level} className="flex items-center gap-[6px]">
              <span
                className="w-[7px] h-[7px] rounded-full inline-block shrink-0"
                style={{ backgroundColor: colors[level] }}
              />
              <span className="text-[11px] text-[#505050]">{labels[level]}: <span className="text-[#808080]">{count}</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [openings, setOpenings] = useState<OpeningRow[]>([]);
  const [streak, setStreak] = useState(0);
  const [weekCounts, setWeekCounts] = useState<number[]>(Array(7).fill(0));
  const [masteryDist, setMasteryDist] = useState<number[]>(Array(6).fill(0));
  const [totalLines, setTotalLines] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const now = new Date().toISOString();
      const thirtyAgo = new Date();
      thirtyAgo.setDate(thirtyAgo.getDate() - 29);
      thirtyAgo.setHours(0, 0, 0, 0);

      const [{ data: ops }, { data: logData }] = await Promise.all([
        supabase.from('openings').select('*').order('created_at', { ascending: false }),
        supabase.from('opening_practice_log').select('practiced_at').gte('practiced_at', thirtyAgo.toISOString()),
      ]);

      // ── Streak + activity chart ──────────────────────────────────────────────
      const practicedAts = (logData ?? []).map((r: { practiced_at: string }) => r.practiced_at);
      setStreak(calcStreak(practicedAts));

      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const counts = Array(7).fill(0);
      practicedAts.forEach((iso) => {
        const d = new Date(iso);
        d.setHours(0, 0, 0, 0);
        const diff = Math.round((todayMidnight.getTime() - d.getTime()) / 86400000);
        if (diff >= 0 && diff < 7) counts[6 - diff]++;
      });
      setWeekCounts(counts);

      if (!ops || ops.length === 0) { setLoading(false); return; }

      // ── Lines + progress ─────────────────────────────────────────────────────
      const ids = ops.map((o: Opening) => o.id);
      const { data: lines } = await supabase
        .from('opening_lines').select('id, opening_id').in('opening_id', ids);

      const lineIds = (lines ?? []).map((l: { id: string }) => l.id);
      const { data: prog } = lineIds.length > 0
        ? await supabase.from('line_progress').select('*').in('line_id', lineIds)
        : { data: [] as LineProgress[] };

      // ── Mastery distribution ─────────────────────────────────────────────────
      const dist = Array(6).fill(0);
      const practicedLineIds = new Set((prog ?? []).map((p: LineProgress) => p.line_id));
      (prog ?? []).forEach((p: LineProgress) => { dist[Math.min(p.mastery ?? 0, 5)]++; });
      dist[0] += lineIds.filter((id: string) => !practicedLineIds.has(id)).length;
      setMasteryDist(dist);
      setTotalLines(lineIds.length);

      // ── Per-opening rows ─────────────────────────────────────────────────────
      const rows: OpeningRow[] = ops.map((op: Opening) => {
        const opLines = (lines ?? []).filter((l: { id: string; opening_id: string }) => l.opening_id === op.id);
        const opLineIds = opLines.map((l: { id: string }) => l.id);
        const opProg = (prog ?? []).filter((p: LineProgress) => opLineIds.includes(p.line_id));
        const practicedIds = opProg.map((p: LineProgress) => p.line_id);

        const linesNew = opLineIds.filter((id: string) => !practicedIds.includes(id)).length;
        const linesDue = opProg.filter((p: LineProgress) => p.next_review <= now && p.mastery < 5).length;
        const linesMastered = opProg.filter((p: LineProgress) => p.mastery >= 5).length;
        const futureReviews = opProg
          .filter((p: LineProgress) => p.next_review > now && p.mastery < 5)
          .map((p: LineProgress) => p.next_review).sort();

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

    // Reload when browser restores this page from the back/forward cache
    // (bfcache bypasses React's lifecycle — component doesn't remount)
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) load(); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const totalDue     = openings.reduce((s, o) => s + o.linesDue, 0);
  const totalNew     = openings.reduce((s, o) => s + o.linesNew, 0);
  const todayTotal   = totalDue + totalNew;
  const totalMastered = openings.reduce((s, o) => s + o.linesMastered, 0);
  const nextReviewGlobal = openings.map(o => o.earliestNextReview).filter(Boolean).sort()[0] ?? null;
  const firstOpening = [...openings]
    .filter(o => o.linesDue + o.linesNew > 0)
    .sort((a, b) => (b.linesDue - a.linesDue) || (b.linesNew - a.linesNew))[0] ?? null;

  const today = new Date();
  const dateLabel = `${today.getDate()} ${MONTH_NAMES[today.getMonth()]}`;
  const dayLabel = DAY_NAMES[today.getDay()];
  const masteryPct = totalLines > 0 ? Math.round(totalMastered / totalLines * 100) : 0;

  if (loading) {
    return (
      <main className="max-w-[600px] mx-auto px-5 pt-10 pb-16">
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-[52px] w-48 bg-[#1E1E1E] rounded-[12px]" />
          <div className="grid grid-cols-3 gap-3">
            {[0,1,2].map(i => <div key={i} className="h-[88px] bg-[#0D0D0D] border border-[#1E1E1E] rounded-[16px]" />)}
          </div>
          <div className="h-32 bg-[#0D0D0D] border border-[#262626] rounded-[20px]" />
          <div className="h-[96px] bg-[#0D0D0D] border border-[#1E1E1E] rounded-[20px]" />
          <div className="h-[80px] bg-[#0D0D0D] border border-[#1E1E1E] rounded-[20px]" />
          {[0,1,2].map(i => <div key={i} className="h-[72px] bg-[#0D0D0D] border border-[#1E1E1E] rounded-[16px]" />)}
        </div>
      </main>
    );
  }

  if (openings.length === 0) {
    return (
      <main className="max-w-[600px] mx-auto px-5 pt-16 pb-16 flex flex-col items-center gap-5 text-center">
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
    <main className="max-w-[600px] mx-auto px-5 pt-10 pb-16">

      {/* ── Date header ───────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="text-[13px] text-[#404040] mb-[2px]">{dayLabel}</div>
        <h1 className="m-0 text-[30px] font-[600] leading-none text-[#F5F5F5]">{dateLabel}</h1>
      </div>

      {/* ── 3 stat chips ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">

        {/* Streak */}
        <div className="bg-[#0D0D0D] border border-[#1E1E1E] rounded-[16px] px-4 pt-4 pb-3 flex flex-col gap-[2px]">
          <div className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#505050] mb-1">Серия</div>
          <div className="flex items-baseline gap-[5px]">
            <span className="text-[30px] font-[700] tabular-nums leading-none text-[#F5F5F5]">{streak}</span>
            {streak > 0 && <span className="text-[18px] leading-none">🔥</span>}
          </div>
          <div className="text-[11px] text-[#404040] mt-[3px]">
            {streak === 0 ? 'начни сегодня' : streak === 1 ? 'день подряд' : streak < 5 ? 'дня подряд' : 'дней подряд'}
          </div>
        </div>

        {/* Today */}
        <div className={`bg-[#0D0D0D] border rounded-[16px] px-4 pt-4 pb-3 flex flex-col gap-[2px] ${todayTotal > 0 ? 'border-[#2A2A2A]' : 'border-[#1E1E1E]'}`}>
          <div className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#505050] mb-1">Сегодня</div>
          <div className="text-[30px] font-[700] tabular-nums leading-none text-[#F5F5F5]">{todayTotal}</div>
          <div className="text-[11px] text-[#404040] mt-[3px]">
            {todayTotal === 0
              ? 'всё готово'
              : totalDue > 0 && totalNew > 0
                ? `${totalDue} повт. · ${totalNew} нов.`
                : totalDue > 0 ? 'на повторение' : 'новые'}
          </div>
        </div>

        {/* Mastered */}
        <div className="bg-[#0D0D0D] border border-[#1E1E1E] rounded-[16px] px-4 pt-4 pb-3 flex flex-col gap-[2px]">
          <div className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#505050] mb-1">Освоено</div>
          <div className="flex items-baseline gap-[4px]">
            <span className="text-[30px] font-[700] tabular-nums leading-none text-[#F5F5F5]">{totalMastered}</span>
            <span className="text-[14px] text-[#383838] leading-none">/{totalLines}</span>
          </div>
          <div className="text-[11px] text-[#404040] mt-[3px]">{masteryPct}% репертуара</div>
        </div>
      </div>

      {/* ── Status card ──────────────────────────────────────────────────────── */}
      {todayTotal === 0 ? (
        <div className="bg-[#0D0D0D] border border-[#1E1E1E] rounded-[20px] px-7 py-7 mb-4 flex flex-col items-center gap-2 text-center">
          <div className="w-11 h-11 rounded-full bg-[#1A1A1A] flex items-center justify-center mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div className="text-[20px] font-[500] text-[#F5F5F5]">Всё готово на сегодня</div>
          {nextReviewGlobal ? (
            <div className="text-[14px] text-[#505050]">
              Следующее повторение — <span className="text-[#808080]">{formatNext(nextReviewGlobal)}</span>
            </div>
          ) : (
            <div className="text-[14px] text-[#505050]">Добавь новые линии в дебюты</div>
          )}
        </div>
      ) : (
        <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] px-7 py-6 mb-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[52px] font-[700] leading-none tabular-nums text-[#FFFFFF]">
              {todayTotal}
            </span>
            <span className="text-[20px] text-[#808080]">
              {todayTotal % 10 === 1 && todayTotal % 100 !== 11 ? 'линия' :
               todayTotal % 10 >= 2 && todayTotal % 10 <= 4 && !(todayTotal % 100 >= 12 && todayTotal % 100 <= 14) ? 'линии' : 'линий'}
            </span>
          </div>
          <div className="text-[13px] text-[#505050] mb-5">
            {totalDue > 0 && totalNew > 0
              ? `${plural(totalDue, 'повторение', 'повторения', 'повторений')} · ${plural(totalNew, 'новая', 'новые', 'новых')}`
              : totalDue > 0 ? 'пора повторить — забываешь' : 'ещё ни разу не тренировал'}
          </div>
          {firstOpening && (
            <Link
              href={`/openings/${firstOpening.id}/practice`}
              className="flex items-center justify-center h-11 w-full bg-white text-[#050505] hover:bg-[#ECECEC] rounded-full text-[14px] font-semibold transition-colors no-underline"
            >
              Начать тренировку →
            </Link>
          )}
        </div>
      )}

      {/* ── Activity chart ────────────────────────────────────────────────────── */}
      <div className="bg-[#0D0D0D] border border-[#1E1E1E] rounded-[20px] px-5 py-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#505050]">Активность</span>
          <span className="text-[11px] text-[#383838]">7 дней</span>
        </div>
        <ActivityChart counts={weekCounts} />
      </div>

      {/* ── Mastery distribution ─────────────────────────────────────────────── */}
      {totalLines > 0 && (
        <div className="bg-[#0D0D0D] border border-[#1E1E1E] rounded-[20px] px-5 py-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#505050]">Прогресс репертуара</span>
            <span className="text-[11px] text-[#383838]">{totalLines} линий</span>
          </div>
          <MasteryBar dist={masteryDist} total={totalLines} />
        </div>
      )}

      {/* ── Per-opening list ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#505050]">Дебюты</span>
        <Link href="/openings" className="text-[12px] text-[#404040] hover:text-[#808080] transition-colors no-underline">
          Все дебюты →
        </Link>
      </div>
      <div className="flex flex-col gap-[6px]">
        {openings
          .filter(o => o.linesTotal > 0)
          .sort((a, b) => (b.linesDue + b.linesNew) - (a.linesDue + a.linesNew))
          .map(o => {
            const toDoCount = o.linesDue + o.linesNew;
            const masteredPct = o.linesTotal > 0 ? Math.round(o.linesMastered / o.linesTotal * 100) : 0;

            return (
              <Link
                key={o.id}
                href={`/openings/${o.id}/practice`}
                className="flex items-center gap-4 bg-[#0D0D0D] border border-[#1A1A1A] hover:border-[#383838] rounded-[14px] px-5 py-[14px] no-underline transition-colors group"
              >
                {/* Icon */}
                <span className="text-[20px] leading-none select-none shrink-0 opacity-60">
                  {o.color === 'white' ? '♙' : o.color === 'black' ? '♟' : '♗'}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-[7px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[14px] font-[500] text-[#E0E0E0] truncate">{o.name}</span>
                      {o.eco_code && <span className="text-[11px] text-[#404040] shrink-0">{o.eco_code}</span>}
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
                        <span className="text-[#2E2E2E] font-normal text-[12px]">✓ готово</span>
                      )}
                    </div>
                  </div>

                  {/* Progress: mastered / total */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[2px] bg-[#1A1A1A] rounded-full overflow-hidden">
                      <div className="h-full bg-[#FFFFFF] rounded-full" style={{ width: `${masteredPct}%` }} />
                    </div>
                    <span className="text-[10px] text-[#363636] shrink-0 tabular-nums">
                      {o.linesMastered}/{o.linesTotal}
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <svg
                  className="text-[#282828] group-hover:text-[#606060] transition-colors shrink-0"
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
            );
          })}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
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
