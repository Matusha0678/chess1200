'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadCoachContext, localDateStr, type CoachContext } from '@/lib/coach/context';
import { ITEM_META, type Plan, type ItemKey } from '@/lib/coach/plan';
import { ChatHeader } from '@/components/coach/ChatHeader';
import { PlanCard, type ItemState } from '@/components/coach/PlanCard';
import { TodayCard } from '@/components/coach/TodayCard';
import { FormCard } from '@/components/coach/FormCard';
import { LeaksCard } from '@/components/coach/LeaksCard';
import { ChangesCard } from '@/components/coach/ChangesCard';
import { WeekCard } from '@/components/coach/WeekCard';

export default function CoachPage() {
  const [ctx, setCtx] = useState<CoachContext | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [manualMarks, setManualMarks] = useState<Record<ItemKey, boolean>>({} as Record<ItemKey, boolean>);
  const [lessonNo, setLessonNo] = useState<number>(1);
  const today = localDateStr();

  // Загрузка контекста и плана
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const context = await loadCoachContext(today);
        if (cancelled) return;
        setCtx(context);
        const marks: Record<string, boolean> = {};
        for (const key of Object.keys(context.progress)) {
          if (context.progress[key as ItemKey].manual_done) marks[key] = true;
        }
        setManualMarks(marks as Record<ItemKey, boolean>);

        // POST — создаёт план если ещё нет, иначе возвращает существующий
        const r = await fetch('/api/coach/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: today }),
        });
        if (r.ok) {
          const j = await r.json() as { plan: Plan | null };
          if (!cancelled && j.plan) setPlan(j.plan);
        }

        // Занятие № N — сколько дней с планом было до сегодня включительно
        const countRes = await supabase.from('coach_plans')
          .select('date', { count: 'exact', head: false })
          .lte('date', today);
        if (!cancelled) {
          const uniqueDates = new Set(((countRes.data ?? []) as Array<{ date: string }>).map(r => r.date));
          setLessonNo(Math.max(1, uniqueDates.size));
        }
      } catch (e) {
        console.error('coach load failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [today]);

  // Обработчик ручной отметки (ТЗ §1.2 — ручные item'ы переключаются повторным нажатием)
  async function handleManualToggle(key: ItemKey, done: boolean) {
    setManualMarks(prev => ({ ...prev, [key]: done }));
    try {
      if (done) {
        await supabase.from('coach_item_marks').upsert({ date: today, item_key: key, done: true });
      } else {
        await supabase.from('coach_item_marks').delete().eq('date', today).eq('item_key', key);
      }
    } catch (e) {
      console.warn('mark save failed', e);
    }
  }

  // Собираем ItemState для PlanCard и totals
  const { itemStates, totals, currentInfo, planKeyToNum } = useMemo(() => {
    if (!plan || !ctx) return { itemStates: {} as Record<ItemKey, ItemState>, totals: null, currentInfo: null, planKeyToNum: new Map<ItemKey, string>() };

    const states: Record<ItemKey, ItemState> = {} as Record<ItemKey, ItemState>;
    const keyToNum = new Map<ItemKey, string>();
    plan.items.forEach((it, i) => {
      const num = String(i + 1).padStart(2, '0');
      keyToNum.set(it.key, num);
      const prog = ctx.progress[it.key] ?? { done_today: 0, manual_done: false, key: it.key };
      const manual = manualMarks[it.key] ?? prog.manual_done;
      const ratio = manual ? 1 : (it.target > 0 ? Math.min(1, prog.done_today / it.target) : 0);
      states[it.key] = {
        done_num: prog.done_today,
        done_min: Math.round(it.min * ratio),
        manual_done: manual,
      };
    });

    const doneRows = plan.items.filter(it => (states[it.key].done_num / Math.max(1, it.target)) >= 1 || states[it.key].manual_done);
    const doneCount = doneRows.length;
    const doneMin = plan.items.reduce((sum, it) => {
      const s = states[it.key];
      const done = s.manual_done || s.done_num / Math.max(1, it.target) >= 1;
      return sum + (done ? it.min : Math.round(it.min * Math.min(1, s.done_num / Math.max(1, it.target))));
    }, 0);
    const totalMin = plan.total_min;
    const threshold = Math.round(totalMin * 0.6);
    const remainForStreak = Math.max(0, threshold - doneMin);

    // первый не сделанный
    let currentIdx = -1;
    for (let i = 0; i < plan.items.length; i++) {
      const it = plan.items[i];
      const s = states[it.key];
      const done = s.manual_done || s.done_num / Math.max(1, it.target) >= 1;
      if (!done) { currentIdx = i; break; }
    }

    let currentInfoVal: { href: string; label: string } | null = null;
    if (currentIdx >= 0) {
      const it = plan.items[currentIdx];
      const meta = ITEM_META[it.key];
      const num = keyToNum.get(it.key)!;
      currentInfoVal = {
        href: meta.href ?? `#plan-${num}`,
        label: `${num} ${meta.title}`,
      };
    }

    return {
      itemStates: states,
      totals: {
        doneCount, totalCount: plan.items.length, doneMin, totalMin, remainForStreak,
      },
      currentInfo: currentInfoVal,
      planKeyToNum: keyToNum,
    };
  }, [plan, ctx, manualMarks]);

  const dateHuman = useMemo(() => todayHumanRu(today), [today]);
  const dailyPlanMinutes = ctx?.settings.daily_minutes ?? 120;

  return (
    <div className="page">
      <div className="coach-layout">
        <section className="coach-card coach-main" aria-labelledby="h-coach" style={{ background: 'var(--surface)' }}>
          <ChatHeader lessonNo={lessonNo} />

          <div className="coach-thread" role="log" aria-label="Переписка с Талем">
            <div className="coach-day-divider">
              <span aria-hidden="true" />
              <span className="coach-day-label coach-day-label-today">Сегодня · {dateHuman}</span>
              <span aria-hidden="true" />
            </div>

            {plan && (
              <div className="coach-msg-tal">
                <span className="coach-crest coach-crest-sm coach-serif" aria-hidden="true">МТ</span>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="coach-msg-meta">
                    <span className="coach-msg-label-tal">Таль</span>
                    <span className="coach-msg-time">08:00 · утренний план</span>
                  </div>
                  <p className="coach-msg-quote">«{plan.message}»</p>
                  <PlanCard
                    plan={plan}
                    state={itemStates}
                    tomorrow={new Set()}
                    updatedAt={null}
                    onManualToggle={handleManualToggle}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Composer — функциональный блок в следующем коммите */}
          <div className="coach-composer">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Почему такой план?', 'Разбери вчерашнюю партию', 'Отчитаться за день'].map(q => (
                <button key={q} type="button" className="coach-btn-line" style={{ height: 34, padding: '0 14px', fontSize: 13 }}>
                  {q}
                </button>
              ))}
            </div>
            <form style={{ margin: 0, display: 'flex', gap: 8 }} onSubmit={e => e.preventDefault()}>
              <label htmlFor="tal-msg" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Сообщение Талю</label>
              <input id="tal-msg" type="text" placeholder="Написать Талю…" className="coach-composer-input" />
              <button type="submit" className="coach-btn-gold coach-composer-send" aria-label="Отправить">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" /><path d="M13 5l7 7-7 7" />
                </svg>
              </button>
            </form>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Таль видит твои партии, статистику и план</span>
          </div>
        </section>

        <aside className="coach-side" aria-label="Сводка">
          {totals && (
            <TodayCard
              dateHuman={dateHuman}
              doneCount={totals.doneCount}
              totalCount={totals.totalCount}
              doneMin={totals.doneMin}
              totalMin={totals.totalMin}
              currentHref={currentInfo?.href ?? null}
              currentLabel={currentInfo?.label ?? null}
              remainForStreak={totals.remainForStreak}
            />
          )}
          {ctx && (
            <FormCard form={ctx.form} streak={ctx.streak} best_streak={ctx.best_streak} />
          )}
          {ctx && (
            <LeaksCard
              leaks={ctx.leaks}
              totalGames={40}
              totalLosses={ctx.leaks.reduce((s, l) => s + l.count, 0)}
              planKeyToNum={planKeyToNum}
            />
          )}
          {plan && (
            <ChangesCard
              changes={plan.changes}
              planKeyToNum={planKeyToNum}
              since={null}
            />
          )}
          {ctx && (
            <WeekCard
              week={ctx.week}
              dailyPlanMin={dailyPlanMinutes}
              discipline_30d={ctx.discipline_30d}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

const WEEKDAY_RU = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const MONTH_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function todayHumanRu(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAY_RU[d.getDay()]}, ${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
}
