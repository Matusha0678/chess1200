// Карточка плана (ТЗ §1.2). Рендер списка заданий с состояниями.
'use client';

import Link from 'next/link';
import type { Plan, PlanItem, ItemKey } from '@/lib/coach/plan';
import { ITEM_META } from '@/lib/coach/plan';

export interface ItemState {
  // кусок информации о прогрессе одного задания
  done_num: number;   // число (задач / позиций / линий)
  done_min: number;   // минут за задание = min × min(1, done/target) или = min при ручной отметке
  manual_done: boolean;
}

export interface PlanCardProps {
  plan: Plan;
  state: Record<ItemKey, ItemState>;
  tomorrow: Set<ItemKey>;              // key'и из «на завтра» (через plan_patch)
  updatedAt?: { time: string; reason: string } | null;
  onManualToggle: (key: ItemKey, done: boolean) => void;
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function pluralTasks(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'заданий';
  if (mod10 === 1) return 'задание';
  if (mod10 >= 2 && mod10 <= 4) return 'задания';
  return 'заданий';
}
function formatHours(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
function itemProgress(it: PlanItem, s: ItemState): number {
  if (s.manual_done) return 1;
  if (!it.target) return 0;
  return Math.max(0, Math.min(1, s.done_num / it.target));
}

export function PlanCard({ plan, state, tomorrow, updatedAt, onManualToggle }: PlanCardProps) {
  // Состояния по каждому элементу
  const rows = plan.items.map((it, i) => {
    const s = state[it.key] ?? { done_num: 0, done_min: 0, manual_done: false };
    const prog = itemProgress(it, s);
    const isTomorrow = tomorrow.has(it.key);
    const done = !isTomorrow && prog >= 1;
    return { idx: i, item: it, s, prog, isTomorrow, done };
  });

  // Текущее — первое НЕ готовое и НЕ «на завтра»
  const currentIdx = rows.findIndex(r => !r.done && !r.isTomorrow);

  // Считаем сводку
  const doneCount = rows.filter(r => r.done).length;
  const totalMin = plan.total_min;
  const doneMin = rows.reduce((sum, r) => sum + Math.round(r.item.min * (r.done ? 1 : r.prog)), 0);
  const threshold = Math.round(totalMin * 0.6);
  const remainForStreak = Math.max(0, threshold - doneMin);

  return (
    <div className="coach-plan" id="plan">
      {/* Header */}
      <div className="coach-plan-head">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 className="coach-plan-title">План на сегодня</h2>
            {updatedAt && (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                Обновлён в {updatedAt.time} — {updatedAt.reason}
              </span>
            )}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-2, #A39B8A)', fontVariantNumeric: 'tabular-nums' }}>
            {formatHours(totalMin)} · {plan.items.length} {pluralTasks(plan.items.length)}
          </span>
        </div>

        {/* Строка прогресса */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px 16px', fontSize: 13 }}>
            <span style={{ color: 'var(--text-2, #A39B8A)' }}>
              <span style={{ fontWeight: 600, color: 'var(--ivory)' }}>Выполнено {doneCount} из {plan.items.length}</span>
              {' · '}{doneMin} из {totalMin} мин
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
              <span aria-hidden="true" style={{ width: 1, height: 12, background: 'var(--ivory)' }} />
              {remainForStreak > 0 ? `Серия засчитается на 60% — ещё ${remainForStreak} мин` : 'Серия засчитана'}
            </span>
          </div>

          {/* Лента дня */}
          <div className="coach-plan-ribbon">
            <div className="coach-plan-ribbon-track">
              {rows.map(r => (
                <div key={r.idx} className="coach-plan-ribbon-item" style={{ flex: `${Math.max(1, r.item.min)} 1 0px` }}>
                  <div className="coach-plan-ribbon-fill" style={{ width: `${Math.round(r.prog * 100)}%` }} />
                </div>
              ))}
            </div>
            <span aria-hidden="true" className="coach-plan-ribbon-mark" />
          </div>
          {/* Номера под лентой */}
          <div className="coach-plan-ribbon-labels" aria-hidden="true">
            {rows.map(r => (
              <span key={r.idx} style={{
                flex: `${Math.max(1, r.item.min)} 1 0px`,
                color: r.isTomorrow ? 'var(--muted)' : 'var(--ivory)',
              }}>
                {pad2(r.idx + 1)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Строки заданий */}
      {rows.map(r => {
        const num = pad2(r.idx + 1);
        const isCurrent = r.idx === currentIdx;
        const meta = ITEM_META[r.item.key];
        const classes = [
          'coach-plan-row',
          isCurrent ? 'coach-plan-row-current' : '',
          r.done ? 'coach-plan-row-done' : '',
          r.isTomorrow ? 'coach-plan-row-tomorrow' : '',
          !r.done && !r.isTomorrow && !isCurrent ? 'coach-plan-row-next' : '',
        ].filter(Boolean).join(' ');

        return (
          <div key={r.idx} id={`plan-${num}`} className={classes}>
            <span className="coach-plan-row-num">{num}</span>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div className="coach-plan-row-title">
                {meta.title}<span style={{ color: 'var(--text-2, #A39B8A)' }}> · {r.item.what}</span>
              </div>
              <div className="coach-plan-row-why">{r.item.why}</div>
            </div>
            <div className="coach-plan-row-time">
              <span className="coach-plan-row-time-main">{r.item.min} мин</span>
              {isCurrent && r.item.target > 1 && !r.done && r.s.done_num > 0 && (
                <span className="coach-plan-row-time-sub">{r.s.done_num} из {r.item.target}</span>
              )}
            </div>
            <div className="coach-plan-row-act">
              {renderAction(r, meta, onManualToggle)}
            </div>
            {isCurrent && !r.done && r.prog > 0 && (
              <span aria-hidden="true" className="coach-plan-row-progress-bar" style={{ width: `${Math.round(r.prog * 100)}%` }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderAction(
  r: { item: PlanItem; done: boolean; isTomorrow: boolean; prog: number; s: ItemState },
  meta: typeof ITEM_META[ItemKey],
  onManualToggle: (key: ItemKey, done: boolean) => void,
) {
  const hStyle = { height: 40, fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const };

  if (r.isTomorrow) {
    return <span className="coach-plan-row-tomorrow-label">на завтра</span>;
  }
  if (r.done) {
    return (
      <button type="button" className="coach-btn-done" style={hStyle}
        onClick={() => meta.manual && onManualToggle(r.item.key, false)}
        aria-label={`Снять отметку с задания ${r.item.key}`}
        disabled={!meta.manual}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Готово
      </button>
    );
  }

  // Not done. Если текущее и есть прогресс — «Продолжить» золотой.
  const label = r.prog > 0 ? 'Продолжить' : 'Начать';
  const isGold = r.prog > 0;

  // Ручное: кнопка «Отметить» вместо Начать
  if (meta.manual && !meta.href) {
    return (
      <button type="button" className="coach-btn-line" style={hStyle}
        onClick={() => onManualToggle(r.item.key, true)}>
        Отметить
      </button>
    );
  }

  if (!meta.href) {
    return <button type="button" className="coach-btn-line" style={hStyle} disabled>—</button>;
  }

  return (
    <Link href={meta.href} className={isGold ? 'coach-btn-gold' : 'coach-btn-line'} style={hStyle}>
      {label}
    </Link>
  );
}
