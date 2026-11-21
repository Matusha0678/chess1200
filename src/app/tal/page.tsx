'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Composer } from '@/components/coach/Composer';
import { DayDivider, TalMessage, Typing, UserMessage, type ChatMsg } from '@/components/coach/Message';

export default function CoachPage() {
  const [ctx, setCtx] = useState<CoachContext | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<{ time: string; reason: string } | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [manualMarks, setManualMarks] = useState<Record<ItemKey, boolean>>({} as Record<ItemKey, boolean>);
  const [lessonNo, setLessonNo] = useState<number>(1);
  const [sending, setSending] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(true);
  const today = localDateStr();
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const tempIdRef = useRef(0);

  // Загружает контекст, план (API), lessonNo, историю чата, ручные отметки
  const refresh = useCallback(async () => {
    try {
      const context = await loadCoachContext(today);
      setCtx(context);
      const marks: Record<string, boolean> = {};
      for (const k of Object.keys(context.progress)) {
        if (context.progress[k as ItemKey].manual_done) marks[k] = true;
      }
      setManualMarks(marks as Record<ItemKey, boolean>);

      const r = await fetch('/api/coach/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      });
      if (r.ok) {
        const j = await r.json() as { plan: Plan | null; id: string | null; version?: number; reason?: string | null };
        if (j.plan) {
          setPlan(j.plan);
          setPlanId(j.id ?? null);
          if (j.version && j.version > 1 && j.reason) {
            setUpdatedAt({ time: new Date().toTimeString().slice(0, 5), reason: j.reason });
          }
        }
      }

      const countRes = await supabase.from('coach_plans')
        .select('date')
        .lte('date', today);
      const uniqueDates = new Set(((countRes.data ?? []) as Array<{ date: string }>).map(x => x.date));
      setLessonNo(Math.max(1, uniqueDates.size));

      // История чата — последние 20 сообщений за 48 часов
      const since = new Date(); since.setDate(since.getDate() - 2);
      const chat = await supabase.from('tal_chat')
        .select('id, role, content, kind, created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .limit(50);
      const hist = (chat.data ?? []) as ChatMsg[];
      setMessages(hist);
    } catch (e) {
      console.error('coach refresh failed', e);
    }
  }, [today]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  // Обновлять данные при возврате на вкладку (ТЗ §5.3)
  useEffect(() => {
    function onVis() { if (document.visibilityState === 'visible') void refresh(); }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  // Обработчик ручной отметки
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

  // Отправка сообщения Талю
  async function handleSend(text: string) {
    if (sending) return;
    setSending(true);
    tempIdRef.current += 1;
    const tempId = `tmp-${tempIdRef.current}`;
    // Оптимистично рисуем своё сообщение
    const nowIso = new Date().toISOString();
    setMessages(prev => [...prev, { id: tempId, role: 'user', kind: 'text', content: text, created_at: nowIso }]);
    scrollToEnd();
    try {
      const r = await fetch('/api/tal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, user_message: text }),
      });
      if (r.ok) {
        const j = await r.json() as { reply: string; plan_updated?: { version: number; reason: string; plan: Plan } | null };
        if (j.plan_updated?.plan) {
          setPlan(j.plan_updated.plan);
          setUpdatedAt({ time: new Date().toTimeString().slice(0, 5), reason: j.plan_updated.reason });
        }
        await refresh();
        scrollToEnd();
      }
    } catch (e) {
      console.warn('send failed', e);
    } finally {
      setSending(false);
    }
  }

  function scrollToEnd() {
    requestAnimationFrame(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  // Загрузить ещё 20 старых сообщений
  async function loadOlder() {
    if (messages.length === 0) { setCanLoadMore(false); return; }
    const oldest = messages[0].created_at;
    const chat = await supabase.from('tal_chat')
      .select('id, role, content, kind, created_at')
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(20);
    const older = ((chat.data ?? []) as ChatMsg[]).reverse();
    if (older.length === 0) setCanLoadMore(false);
    else setMessages(prev => [...older, ...prev]);
  }

  // Состояния задач / totals / currentInfo / planKeyToNum
  const { itemStates, totals, currentInfo, planKeyToNum } = useMemo(() => {
    if (!plan || !ctx) {
      return {
        itemStates: {} as Record<ItemKey, ItemState>,
        totals: null,
        currentInfo: null,
        planKeyToNum: new Map<ItemKey, string>(),
      };
    }
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

    const doneCount = plan.items.filter(it => {
      const s = states[it.key];
      return s.manual_done || s.done_num / Math.max(1, it.target) >= 1;
    }).length;
    const doneMin = plan.items.reduce((sum, it) => {
      const s = states[it.key];
      const done = s.manual_done || s.done_num / Math.max(1, it.target) >= 1;
      return sum + (done ? it.min : Math.round(it.min * Math.min(1, s.done_num / Math.max(1, it.target))));
    }, 0);
    const totalMin = plan.total_min;
    const threshold = Math.round(totalMin * 0.6);
    const remainForStreak = Math.max(0, threshold - doneMin);

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
      totals: { doneCount, totalCount: plan.items.length, doneMin, totalMin, remainForStreak },
      currentInfo: currentInfoVal,
      planKeyToNum: keyToNum,
    };
  }, [plan, ctx, manualMarks]);

  // Сохраняем фактические минуты за день в tal_daily_log
  useEffect(() => {
    if (!totals) return;
    (async () => {
      try {
        await supabase.from('tal_daily_log').upsert(
          { date: today, task_key: 'coach_minutes', value: totals.doneMin },
          { onConflict: 'date,task_key' },
        );
      } catch { /* не критично */ }
    })();
  }, [totals, today]);

  const dateHuman = useMemo(() => todayHumanRu(today), [today]);
  const dailyPlanMinutes = ctx?.settings.daily_minutes ?? 120;

  // Делим сообщения на «вчера» и «сегодня» для разделителей
  const grouped = useMemo(() => {
    const yesterday = (() => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 1); return localDateStr(d); })();
    const todayMsgs: ChatMsg[] = [];
    const yMsgs: ChatMsg[] = [];
    const earlier: ChatMsg[] = [];
    for (const m of messages) {
      const d = m.created_at.slice(0, 10);
      if (d === today) todayMsgs.push(m);
      else if (d === yesterday) yMsgs.push(m);
      else earlier.push(m);
    }
    return { earlier, yMsgs, todayMsgs };
  }, [messages, today]);

  return (
    <div className="page">
      <div className="coach-layout">
        <section className="coach-card coach-main" aria-labelledby="h-coach" style={{ background: 'var(--surface)' }}>
          <ChatHeader lessonNo={lessonNo} />

          <div className="coach-thread" role="log" aria-label="Переписка с Талем">
            {canLoadMore && grouped.earlier.length === 0 && messages.length > 0 && (
              <button type="button" className="coach-btn-line" style={{ alignSelf: 'center', padding: '6px 14px', fontSize: 13 }} onClick={() => void loadOlder()}>
                Показать раньше
              </button>
            )}

            {grouped.earlier.length > 0 && (
              <>
                {grouped.earlier.map(m => renderMsg(m, plan, itemStates, planId, planKeyToNum, updatedAt, handleManualToggle))}
              </>
            )}

            {grouped.yMsgs.length > 0 && (
              <>
                <DayDivider label="Вчера" />
                {grouped.yMsgs.map(m => renderMsg(m, plan, itemStates, planId, planKeyToNum, updatedAt, handleManualToggle))}
              </>
            )}

            <DayDivider label={`Сегодня · ${dateHuman}`} today />
            {grouped.todayMsgs.length === 0 && plan && (
              <TalMessage m={{ id: 'morning-placeholder', role: 'assistant', kind: 'morning', content: plan.message, created_at: new Date().toISOString() }}>
                <PlanCard plan={plan} state={itemStates} tomorrow={new Set()} updatedAt={updatedAt} onManualToggle={handleManualToggle} />
              </TalMessage>
            )}
            {grouped.todayMsgs.map(m => renderMsg(m, plan, itemStates, planId, planKeyToNum, updatedAt, handleManualToggle))}

            {sending && <Typing />}
            <div ref={threadEndRef} />
          </div>

          <Composer disabled={sending} onSend={handleSend} />
        </section>

        <aside className="coach-side" aria-label="Сводка">
          {totals && (
            <TodayCard
              dateHuman={dateHuman}
              doneCount={totals.doneCount} totalCount={totals.totalCount}
              doneMin={totals.doneMin} totalMin={totals.totalMin}
              currentHref={currentInfo?.href ?? null}
              currentLabel={currentInfo?.label ?? null}
              remainForStreak={totals.remainForStreak}
            />
          )}
          {ctx && <FormCard form={ctx.form} streak={ctx.streak} best_streak={ctx.best_streak} />}
          {ctx && (
            <LeaksCard
              leaks={ctx.leaks}
              totalGames={40}
              totalLosses={ctx.leaks.reduce((s, l) => s + l.count, 0)}
              planKeyToNum={planKeyToNum}
            />
          )}
          {plan && <ChangesCard changes={plan.changes} planKeyToNum={planKeyToNum} since={updatedAt ? `Обновлено в ${updatedAt.time}` : 'После утреннего плана'} />}
          {ctx && <WeekCard week={ctx.week} dailyPlanMin={dailyPlanMinutes} discipline_30d={ctx.discipline_30d} />}
        </aside>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

function renderMsg(
  m: ChatMsg,
  plan: Plan | null,
  itemStates: Record<ItemKey, ItemState>,
  planId: string | null,
  _planKeyToNum: Map<ItemKey, string>,
  updatedAt: { time: string; reason: string } | null,
  onManualToggle: (key: ItemKey, done: boolean) => void,
) {
  if (m.role === 'user') return <UserMessage key={m.id} m={m} />;

  // Если morning — рендерим с планом (только для сегодняшнего plan_id-совпадения)
  if (m.kind === 'morning' && plan) {
    return (
      <TalMessage key={m.id} m={m}>
        <PlanCard plan={plan} state={itemStates} tomorrow={new Set()} updatedAt={updatedAt} onManualToggle={onManualToggle} />
      </TalMessage>
    );
  }
  return <TalMessage key={m.id} m={m} />;
}

const WEEKDAY_RU = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const MONTH_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function todayHumanRu(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAY_RU[d.getDay()]}, ${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
}
