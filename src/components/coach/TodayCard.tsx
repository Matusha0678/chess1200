// «Сегодня» (ТЗ §1.3.1): дата, «N из M заданий», минуты, кнопка Продолжить.
'use client';

import Link from 'next/link';

export interface TodayCardProps {
  dateHuman: string;           // «Суббота, 21 ноября»
  doneCount: number;
  totalCount: number;
  doneMin: number;
  totalMin: number;
  currentHref: string | null;   // ссылка на карточку текущего задания (#plan-NN)
  currentLabel: string | null;  // «03 Дебюты»
  remainForStreak: number;      // минут до 60%
}

export function TodayCard({
  dateHuman, doneCount, totalCount, doneMin, totalMin, currentHref, currentLabel, remainForStreak,
}: TodayCardProps) {
  const pct = totalMin > 0 ? Math.round((doneMin / totalMin) * 100) : 0;
  return (
    <section className="coach-card" aria-labelledby="h-today" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 id="h-today" className="coach-eyebrow" style={{ margin: 0 }}>Сегодня</h2>
        <span className="coach-serif" style={{ fontSize: 16, fontStyle: 'italic', color: 'var(--ivory)' }}>{dateHuman}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="coach-serif" style={{ fontSize: 46, fontStyle: 'italic', fontWeight: 500, lineHeight: 1, color: 'var(--ivory)' }}>{doneCount}</span>
          <span style={{ fontSize: 15, color: 'var(--text-2, #A39B8A)' }}>из {totalCount} заданий</span>
        </div>
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-2, #A39B8A)' }}>
          <span style={{ fontWeight: 600, color: 'var(--ivory)' }}>{doneMin}</span> из {totalMin} мин
        </span>
      </div>
      <div aria-hidden="true" style={{ position: 'relative', height: 3, background: 'var(--track)' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'var(--accent)' }} />
        <span style={{ position: 'absolute', left: '60%', top: -4, bottom: -4, width: 1, background: 'var(--ivory)' }} />
      </div>
      {currentHref ? (
        <Link
          href={currentHref}
          className="coach-btn-gold"
          style={{ height: 48, gap: 10, fontSize: 13 }}
        >
          Продолжить · {currentLabel}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" /><path d="M13 5l7 7-7 7" />
          </svg>
        </Link>
      ) : (
        <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--hairline-2)', color: 'var(--muted)', fontSize: 13 }}>
          План на сегодня готов
        </div>
      )}
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        {remainForStreak > 0 ? `Серия засчитается на 60% — ещё ${remainForStreak} мин` : 'Серия засчитана'}
      </span>
    </section>
  );
}
