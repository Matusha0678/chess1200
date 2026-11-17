'use client';
import Link from 'next/link';

export interface SoftTodayProps {
  streak: number;
  todayTotal: number;
  totalDue: number;
  totalNew: number;
  mistakesDue: number;
  ideasDue: number;
  totalMastered: number;
  totalLines: number;
  firstOpeningId: string | null;
  firstOpeningName: string | null;
  pathCard: {
    pathId: string; pathTitle: string;
    stepOrd: number; courseId: string; courseName: string; pct: number;
  } | null;
  dateLabel: string;
  dayLabel: string;
}

const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
void MONTH_NAMES;

function StatCard({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) {
  const inner = (
    <div
      className="soft-card"
      style={{
        background: 'var(--surface)',
        padding: '16px 20px',
        display: 'flex', flexDirection: 'column', gap: 4,
        flex: '1 1 140px', minWidth: 0,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {label}
      </span>
      <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--ivory)' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sub}</span>}
    </div>
  );
  if (href) return <Link href={href} style={{ display: 'contents', textDecoration: 'none' }}>{inner}</Link>;
  return inner;
}

function NavCard({ label, href, icon, count }: { label: string; href: string; icon: React.ReactNode; count?: number }) {
  return (
    <Link
      href={href}
      className="soft-card"
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 20px', background: 'var(--surface)',
        textDecoration: 'none', color: 'var(--ivory)',
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{label}</span>
      {count !== undefined && count > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 24, height: 24, padding: '0 6px',
          background: 'var(--accent)', color: '#fff',
          fontSize: 12, fontWeight: 700, borderRadius: 99,
        }}>
          {count}
        </span>
      )}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

export function SoftToday({
  streak, todayTotal, totalDue, totalNew, mistakesDue, ideasDue,
  totalMastered, totalLines, firstOpeningId,
  pathCard, dateLabel, dayLabel,
}: SoftTodayProps) {
  const masteryPct = totalLines > 0 ? Math.round(totalMastered / totalLines * 100) : 0;

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 64px', boxSizing: 'border-box' }}>

      {/* ── Greeting ── */}
      <div style={{ marginBottom: 32, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
            {dayLabel}
          </div>
          <h1 style={{ margin: 0, fontSize: 40, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--ivory)' }}>
            {dateLabel}
          </h1>
        </div>

        {/* CTA button */}
        {firstOpeningId && todayTotal > 0 ? (
          <Link
            href={`/openings/${firstOpeningId}/practice`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              height: 52, padding: '0 28px',
              background: 'var(--accent)', color: '#fff',
              fontSize: 15, fontWeight: 700,
              borderRadius: 'var(--radius-btn)',
              boxShadow: 'var(--shadow-btn)',
              textDecoration: 'none',
            }}
          >
            Начать тренировку
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        ) : (
          <Link
            href="/openings"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              height: 52, padding: '0 28px',
              background: 'var(--surface)', color: 'var(--ivory)',
              fontSize: 15, fontWeight: 700, border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-btn)', textDecoration: 'none',
            }}
          >
            Дебюты
          </Link>
        )}
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
        <StatCard
          label="Серия"
          value={streak === 0 ? '—' : streak}
          sub={streak === 0 ? 'начни сегодня' : streak === 1 ? 'день' : streak < 5 ? 'дня подряд' : 'дней подряд'}
        />
        <StatCard
          label="Линии сегодня"
          value={todayTotal}
          sub={todayTotal === 0 ? 'всё готово' : totalDue > 0 && totalNew > 0 ? `${totalDue} повт · ${totalNew} нов` : totalDue > 0 ? 'на повторение' : 'новые'}
          href={firstOpeningId ? `/openings/${firstOpeningId}/practice` : '/openings'}
        />
        <StatCard
          label="Ошибки"
          value={mistakesDue}
          sub={mistakesDue === 0 ? 'нет карточек' : 'ожидают повторения'}
          href="/mistakes"
        />
        <StatCard
          label="Идеи"
          value={ideasDue}
          sub={ideasDue === 0 ? 'нет повторений' : 'ожидают повторения'}
          href="/plans"
        />
      </div>

      {/* ── 2-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'start' }}
        className="soft-two-col">

        {/* Left: progress */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Mastery bar */}
          {totalLines > 0 && (
            <div
              className="soft-card"
              style={{ background: 'var(--surface)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                  Прогресс репертуара
                </span>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {totalMastered} / {totalLines}
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--track)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: 'var(--accent)',
                  width: `${masteryPct}%`,
                  borderRadius: 99,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{masteryPct}% освоено</span>
            </div>
          )}

          {/* Мой путь */}
          {pathCard && (
            <div
              className="soft-card"
              style={{ background: 'var(--surface)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                  Мой путь · {pathCard.pathTitle}
                </span>
                <Link href="/courses/path" style={{ fontSize: 11, color: 'var(--muted)' }}>Все →</Link>
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ivory)', lineHeight: 1.3 }}>
                {String(pathCard.stepOrd).padStart(2, '0')}. {pathCard.courseName}
              </span>
              {pathCard.pct > 0 && (
                <div style={{ height: 6, background: 'var(--track)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--accent)', width: `${pathCard.pct}%`, borderRadius: 99 }} />
                </div>
              )}
              <Link
                href={`/courses/${pathCard.courseId}`}
                style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  height: 40, padding: '0 20px',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 13, fontWeight: 700,
                  borderRadius: 'var(--radius-btn)',
                  boxShadow: 'var(--shadow-btn)',
                  textDecoration: 'none',
                }}
              >
                Продолжить →
              </Link>
            </div>
          )}

          {/* Quick links: openings */}
          <NavCard label="Дебюты" href="/openings" icon="♟" count={todayTotal > 0 ? todayTotal : undefined} />
          <NavCard label="Случайная игра" href="/random" icon="⚡" />
        </div>

        {/* Right: navigation cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <NavCard label="Курсы" href="/courses" icon="📖" />
          <NavCard label="Банк ошибок" href="/mistakes" icon="🎯" count={mistakesDue > 0 ? mistakesDue : undefined} />
          <NavCard label="Идеи позиций" href="/plans" icon="💡" count={ideasDue > 0 ? ideasDue : undefined} />
          <NavCard label="Пути обучения" href="/courses/path" icon="🗺" />
        </div>
      </div>
    </main>
  );
}
