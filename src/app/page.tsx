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

const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DAY_NAMES_RU = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const DAY_NAMES_RU_UPPER = ['ВОСКРЕСЕНЬЕ','ПОНЕДЕЛЬНИК','ВТОРНИК','СРЕДА','ЧЕТВЕРГ','ПЯТНИЦА','СУББОТА'];
const DAY_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

// suppress unused variable warnings
void DAY_NAMES_RU;

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
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const yday = new Date(today); yday.setDate(yday.getDate() - 1);
  const ydayStr = yday.toISOString().slice(0, 10);
  if (unique[0] !== todayStr && unique[0] !== ydayStr) return 0;
  let streak = 0, checkStr = unique[0];
  for (const d of unique) {
    if (d === checkStr) {
      streak++;
      const next = new Date(checkStr + 'T00:00:00'); next.setDate(next.getDate() - 1);
      checkStr = next.toISOString().slice(0, 10);
    } else break;
  }
  return streak;
}

const EYEBROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
  color: 'var(--muted)', textTransform: 'uppercase',
};

const EYEBROW_LINE: React.CSSProperties = {
  width: 48, height: 1, background: 'var(--eyebrow-line)', flexShrink: 0,
};

const SECTION_HEADER: React.CSSProperties = {
  borderTop: '2px solid var(--ivory)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  minHeight: 48,
};

const LABEL: React.CSSProperties = {
  margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
  color: 'var(--ivory)', textTransform: 'uppercase',
};

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};

function ActivityChart({ counts }: { counts: number[] }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - 6 + i);
    return { dow: d.getDay(), count: counts[i], isToday: i === 6 };
  });
  const maxVal = Math.max(...counts, 1);

  return (
    <div
      role="img"
      aria-label={`Активность за 7 дней: ${counts.reduce((a, b) => a + b, 0)} тренировок`}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, paddingTop: 8 }}
    >
      {days.map((day, i) => {
        const barH = day.count > 0 ? Math.max(4, Math.round((day.count / maxVal) * 54)) : 0;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              position: 'relative', height: 56,
              borderBottom: `2px solid ${day.isToday ? 'var(--ivory)' : 'var(--track)'}`,
            }}>
              {barH > 0 && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: barH, background: 'var(--ivory)',
                }} />
              )}
            </div>
            <span style={{
              fontSize: 12, textAlign: 'center',
              color: day.isToday ? 'var(--ivory)' : 'var(--muted)',
              fontWeight: day.isToday ? 600 : 400,
            }}>
              {DAY_SHORT[day.dow]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const MASTERY_COLORS = ['#6E6A61','#A8A499','#BFBBB4','#CFCCC6','#DEDAD7','#F2EFE7'];
const MASTERY_LABELS = ['Новые','Ур. 1','Ур. 2','Ур. 3','Ур. 4','Ур. 5'];

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
      const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 29); thirtyAgo.setHours(0,0,0,0);

      const [{ data: ops }, { data: logData }] = await Promise.all([
        supabase.from('openings').select('*').order('created_at', { ascending: false }),
        supabase.from('opening_practice_log').select('practiced_at').gte('practiced_at', thirtyAgo.toISOString()),
      ]);

      const practicedAts = (logData ?? []).map((r: { practiced_at: string }) => r.practiced_at);
      setStreak(calcStreak(practicedAts));

      const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
      const counts = Array(7).fill(0);
      practicedAts.forEach((iso) => {
        const d = new Date(iso); d.setHours(0,0,0,0);
        const diff = Math.round((todayMidnight.getTime() - d.getTime()) / 86400000);
        if (diff >= 0 && diff < 7) counts[6 - diff]++;
      });
      setWeekCounts(counts);

      if (!ops || ops.length === 0) { setLoading(false); return; }

      const ids = ops.map((o: Opening) => o.id);
      const { data: lines } = await supabase.from('opening_lines').select('id, opening_id').in('opening_id', ids);
      const lineIds = (lines ?? []).map((l: { id: string }) => l.id);
      const { data: prog } = lineIds.length > 0
        ? await supabase.from('line_progress').select('*').in('line_id', lineIds)
        : { data: [] as LineProgress[] };

      const dist = Array(6).fill(0);
      const practicedLineIds = new Set((prog ?? []).map((p: LineProgress) => p.line_id));
      (prog ?? []).forEach((p: LineProgress) => { dist[Math.min(p.mastery ?? 0, 5)]++; });
      dist[0] += lineIds.filter((id: string) => !practicedLineIds.has(id)).length;
      setMasteryDist(dist);
      setTotalLines(lineIds.length);

      const rows: OpeningRow[] = ops.map((op: Opening) => {
        const opLines = (lines ?? []).filter((l: { id: string; opening_id: string }) => l.opening_id === op.id);
        const opLineIds = opLines.map((l: { id: string }) => l.id);
        const opProg = (prog ?? []).filter((p: LineProgress) => opLineIds.includes(p.line_id));
        const practicedIds = opProg.map((p: LineProgress) => p.line_id);
        const linesNew = opLineIds.filter((id: string) => !practicedIds.includes(id)).length;
        const linesDue = opProg.filter((p: LineProgress) => p.next_review <= now && p.mastery < 5).length;
        const linesMastered = opProg.filter((p: LineProgress) => p.mastery >= 5).length;
        const futureReviews = opProg.filter((p: LineProgress) => p.next_review > now && p.mastery < 5).map((p: LineProgress) => p.next_review).sort();
        return { ...(op as Opening), linesTotal: opLines.length, linesNew, linesDue, linesMastered, earliestNextReview: futureReviews[0] ?? null };
      });

      setOpenings(rows);
      setLoading(false);
    }
    load();
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) load(); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const totalDue = openings.reduce((s, o) => s + o.linesDue, 0);
  const totalNew = openings.reduce((s, o) => s + o.linesNew, 0);
  const todayTotal = totalDue + totalNew;
  const totalMastered = openings.reduce((s, o) => s + o.linesMastered, 0);
  const nextReviewGlobal = openings.map(o => o.earliestNextReview).filter(Boolean).sort()[0] ?? null;
  const firstOpening = [...openings].filter(o => o.linesDue + o.linesNew > 0).sort((a, b) => (b.linesDue - a.linesDue) || (b.linesNew - a.linesNew))[0] ?? null;

  const today = new Date();
  const dateLabel = `${today.getDate()} ${MONTH_NAMES[today.getMonth()]}`;
  const dayLabelUpper = DAY_NAMES_RU_UPPER[today.getDay()];
  const masteryPct = totalLines > 0 ? Math.round(totalMastered / totalLines * 100) : 0;
  const sortedOpenings = [...openings].filter(o => o.linesTotal > 0).sort((a, b) => (b.linesDue + b.linesNew) - (a.linesDue + a.linesNew));

  const linesTodayWord = (() => {
    const n = todayTotal;
    const m100 = n % 100, m10 = n % 10;
    if (m100 >= 11 && m100 <= 19) return 'линий';
    if (m10 === 1) return 'линия';
    if (m10 >= 2 && m10 <= 4) return 'линии';
    return 'линий';
  })();

  const ctaSubtext = totalDue > 0 && totalNew > 0
    ? `${plural(totalDue, 'повторение', 'повторения', 'повторений')} · ${plural(totalNew, 'новая', 'новые', 'новых')}`
    : totalDue > 0 ? 'пора повторить — забываешь' : 'ещё ни разу не тренировал';

  if (loading) {
    return (
      <main style={{ maxWidth: 1600, margin: '0 auto', padding: '44px 48px 72px', display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'flex-start', boxSizing: 'border-box' }}>
        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }} className="animate-pulse">
          <div style={{ height: 88, width: 220, background: 'var(--surface)' }} />
          <div style={{ display: 'flex', borderTop: '2px solid var(--hairline)' }}>
            {[0,1,2].map(i => <div key={i} style={{ flex: '1 1 150px', height: 100, background: i > 0 ? 'var(--surface)' : undefined }} />)}
          </div>
          <div style={{ height: 160, background: 'var(--surface)' }} />
          <div style={{ height: 100, background: 'var(--surface)' }} />
        </div>
        <aside style={{ flex: '1 1 420px', maxWidth: 520, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }} className="animate-pulse">
          <div style={{ height: 300, background: 'var(--surface)' }} />
        </aside>
      </main>
    );
  }

  if (openings.length === 0) {
    return (
      <main style={{ maxWidth: 1600, margin: '0 auto', padding: '44px 48px 72px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center' }}>
        <h1 style={{ ...HEADING, fontSize: 88, fontWeight: 700, lineHeight: 0.88, letterSpacing: '-0.045em', margin: 0 }}>{dateLabel}</h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 320, margin: 0 }}>Добавь первый дебют — и можно начинать тренировки</p>
        <Link href="/openings/new" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 24px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}>
          + Добавить дебют
        </Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1600, margin: '0 auto', padding: '44px 48px 72px', display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'flex-start', boxSizing: 'border-box' }}>

      {/* ── Left column ── */}
      <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* 1. Date hero */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={EYEBROW}>
            <span>СЕГОДНЯ</span>
            <span style={EYEBROW_LINE} />
            <span>{dayLabelUpper}</span>
          </div>
          <h1 style={{ ...HEADING, margin: 0, fontWeight: 700, fontSize: 88, lineHeight: 0.88, letterSpacing: '-0.045em' }}>{dateLabel}</h1>
        </div>

        {/* 2. Stats band */}
        <div style={{ display: 'flex', flexWrap: 'wrap', borderTop: '2px solid var(--ivory)' }}>
          {/* СЕРИЯ */}
          <div style={{ flex: '1 1 150px', minWidth: 0, padding: '18px 20px 20px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--muted)', textTransform: 'uppercase' }}>СЕРИЯ</span>
            <span style={{ ...HEADING, fontWeight: 700, fontSize: 56, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{streak}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {streak === 0 ? 'начни сегодня' : streak === 1 ? 'день подряд' : streak < 5 ? 'дня подряд' : 'дней подряд'}
            </span>
          </div>
          {/* СЕГОДНЯ */}
          <div style={{ flex: '1 1 150px', minWidth: 0, padding: '18px 20px 20px 24px', borderLeft: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--muted)', textTransform: 'uppercase' }}>СЕГОДНЯ</span>
            <span style={{ ...HEADING, fontWeight: 700, fontSize: 56, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{todayTotal}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {todayTotal === 0 ? 'всё готово' : totalDue > 0 && totalNew > 0 ? `${totalDue} повт. · ${totalNew} нов.` : totalDue > 0 ? 'на повторение' : 'новые'}
            </span>
          </div>
          {/* ОСВОЕНО */}
          <div style={{ flex: '1 1 150px', minWidth: 0, padding: '18px 20px 20px 24px', borderLeft: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--muted)', textTransform: 'uppercase' }}>ОСВОЕНО</span>
            <span style={{ ...HEADING, fontWeight: 700, fontSize: 56, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
              {totalMastered}
              <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--muted)' }}> /{totalLines}</span>
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{masteryPct}% репертуара</span>
          </div>
        </div>

        {/* 3. Train CTA */}
        {todayTotal === 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, padding: 28, background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ ...HEADING, fontWeight: 600, fontSize: 24, letterSpacing: '-0.02em', color: 'var(--ivory)' }}>Всё готово на сегодня</span>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                {nextReviewGlobal ? `Следующее повторение — ${formatNext(nextReviewGlobal)}` : 'Добавь новые линии в дебюты'}
              </span>
            </div>
            <Link href="/openings" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, padding: '0 24px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>
              Дебюты →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, padding: 28, background: 'var(--ivory)', color: 'var(--ink)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                <span style={{ ...HEADING, fontWeight: 700, fontSize: 112, lineHeight: 0.82, letterSpacing: '-0.05em', fontVariantNumeric: 'tabular-nums' }}>{todayTotal}</span>
                <span style={{ ...HEADING, fontWeight: 600, fontSize: 28, lineHeight: 1, letterSpacing: '-0.02em' }}>{linesTodayWord}</span>
              </div>
              <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{ctaSubtext}</span>
            </div>
            {firstOpening && (
              <Link
                href={`/openings/${firstOpening.id}/practice`}
                style={{ flex: '0 1 300px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, background: 'var(--ink)', color: 'var(--ivory)', fontSize: 15, fontWeight: 600 }}
              >
                Начать тренировку
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
              </Link>
            )}
          </div>
        )}

        {/* 4. Activity */}
        <section>
          <div style={SECTION_HEADER}>
            <h2 style={LABEL}>АКТИВНОСТЬ</h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>7 дней</span>
          </div>
          <ActivityChart counts={weekCounts} />
        </section>

        {/* Mobile openings list */}
        <section style={{ display: 'block' }} className="lg:hidden">
          <div style={SECTION_HEADER}>
            <h2 style={LABEL}>ДЕБЮТЫ</h2>
            <div style={{ display: 'flex', gap: 4, marginRight: -8 }}>
              <Link href="/openings" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 8px', fontSize: 13, color: 'var(--muted)' }}>
                Все
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
              </Link>
              <Link href="/openings/new" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 8px', fontSize: 13, color: 'var(--muted)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                Добавить
              </Link>
            </div>
          </div>
          <OpeningsList openings={sortedOpenings} />
        </section>

      </div>

      {/* ── Right aside ── */}
      <aside style={{ flex: '1 1 420px', maxWidth: 520, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* 5. Openings list (desktop) */}
        <section className="hidden lg:block">
          <div style={SECTION_HEADER}>
            <h2 style={LABEL}>ДЕБЮТЫ</h2>
            <div style={{ display: 'flex', gap: 4, marginRight: -8 }}>
              <Link href="/openings" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 8px', fontSize: 13, color: 'var(--muted)' }}>
                Все
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
              </Link>
              <Link href="/openings/new" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 8px', fontSize: 13, color: 'var(--muted)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                Добавить
              </Link>
            </div>
          </div>
          <OpeningsList openings={sortedOpenings} />
        </section>

        {/* 6. Repertoire progress */}
        {totalLines > 0 && (
          <section>
            <div style={SECTION_HEADER}>
              <h2 style={LABEL}>ПРОГРЕСС РЕПЕРТУАРА</h2>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{totalLines} линий</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
              <div
                role="img"
                aria-label={`Прогресс: ${masteryDist[0]} новые, ${masteryDist.slice(1).reduce((a,b)=>a+b,0)} в прогрессе`}
                style={{ display: 'flex', height: 12, background: 'var(--track)' }}
              >
                {masteryDist.map((count, level) => count > 0 ? (
                  <span key={level} style={{ flex: `${count} 1 0`, background: MASTERY_COLORS[level] }} />
                ) : null)}
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
                {masteryDist.map((count, level) => count > 0 ? (
                  <span key={level} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 9, height: 9, background: MASTERY_COLORS[level], flexShrink: 0 }} />
                    {MASTERY_LABELS[level]}: <span style={{ color: 'var(--ivory)', fontWeight: 600 }}>{count}</span>
                  </span>
                ) : null)}
              </div>
            </div>
          </section>
        )}

      </aside>

    </main>
  );
}

function OpeningsList({ openings }: { openings: OpeningRow[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {openings.map((o, i) => {
        const dueCount = o.linesDue > 0 ? `${o.linesDue} повт.` : o.linesNew > 0 ? `${o.linesNew} нов.` : null;
        const isLast = i === openings.length - 1;
        const isWhite = o.color === 'white';
        const isBoth = o.color === 'both';
        return (
          <li key={o.id}>
            <Link
              href={`/openings/${o.id}/practice`}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px minmax(0, 1fr) auto',
                columnGap: 14, rowGap: 10,
                alignItems: 'center', padding: '16px 0',
                borderTop: '1px solid var(--hairline)',
                borderBottom: isLast ? '1px solid var(--hairline)' : undefined,
                color: 'var(--ivory)',
              }}
              className="row-hover-link"
            >
              {/* Row 1 col 1: king icon */}
              <span
                role="img"
                aria-label={isWhite ? 'Белые' : isBoth ? 'Оба цвета' : 'Чёрные'}
                style={{
                  fontFamily: "'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols 2','DejaVu Sans',sans-serif",
                  fontSize: 18, lineHeight: 1,
                  color: isWhite || isBoth ? 'var(--ivory)' : 'var(--ink)',
                  WebkitTextStroke: isWhite || isBoth ? 'none' : '0.8px var(--ivory)',
                }}
              >♚</span>
              {/* Row 1 col 2: name */}
              <span style={{
                fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
                fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{o.name}</span>
              {/* Row 1 col 3: count */}
              <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {dueCount}
              </span>
              {/* Row 2 col 1: empty */}
              <span />
              {/* Row 2 col 2: progress track */}
              <span style={{ display: 'block', height: 2, background: 'var(--track)' }}>
                {o.linesTotal > 0 && o.linesMastered > 0 && (
                  <span style={{ display: 'block', height: '100%', width: `${(o.linesMastered / o.linesTotal) * 100}%`, background: 'var(--ivory)' }} />
                )}
              </span>
              {/* Row 2 col 3: fraction */}
              <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {o.linesMastered}/{o.linesTotal}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
