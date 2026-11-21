'use client';

import { useEffect, useState } from 'react';
import { loadCoachContext, localDateStr, type CoachContext } from '@/lib/coach/context';
import { buildFallbackPlan, type Plan } from '@/lib/coach/plan';
import { ChatHeader } from '@/components/coach/ChatHeader';

export default function CoachPage() {
  const [ctx, setCtx] = useState<CoachContext | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [lessonNo, setLessonNo] = useState<number>(1);
  const today = localDateStr();

  useEffect(() => {
    (async () => {
      try {
        const context = await loadCoachContext(today);
        setCtx(context);
        // пока — всегда fallback-план, API подключим в следующем коммите
        const top = context.leaks.find(l => l.main) ?? context.leaks[0];
        const fb = buildFallbackPlan({
          daily_minutes: context.settings.daily_minutes,
          top_leak_key:  top?.key,
          top_leak_count: top?.count,
          tactics_acc:   context.tactics_acc_7d ?? undefined,
          openings_due:  context.openings_due,
        });
        setPlan(fb);
        // Занятие № N — пока заглушка (streak + 1)
        setLessonNo(Math.max(1, context.streak + 1));
      } catch (e) {
        console.error('coach context load failed', e);
      }
    })();
  }, [today]);

  return (
    <div className="page">
      <div className="coach-layout">
        <section
          className="coach-card coach-main"
          aria-labelledby="h-coach"
          style={{ background: 'var(--surface)' }}
        >
          <ChatHeader lessonNo={lessonNo} />

          <div className="coach-thread" role="log" aria-label="Переписка с Талем">
            {/* Пока пустое состояние для чата */}
            <div className="coach-day-divider">
              <span aria-hidden="true" />
              <span className="coach-day-label coach-day-label-today">
                Сегодня · {todayHumanRu(today)}
              </span>
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

                  {/* Карточка плана — рендер минимальный, детали в следующем коммите */}
                  <div className="coach-plan">
                    <div className="coach-plan-head">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <h2 className="coach-plan-title">План на сегодня</h2>
                        <span style={{ fontSize: 13, color: 'var(--text-2, #A39B8A)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatHours(plan.total_min)} · {plan.items.length} заданий
                        </span>
                      </div>
                    </div>
                    {plan.items.map((it, i) => (
                      <div key={it.key + i} id={`plan-${pad2(i + 1)}`} className="coach-plan-row">
                        <span className="coach-plan-row-num">{pad2(i + 1)}</span>
                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div className="coach-plan-row-title">{taskTitle(it.key)}<span style={{ color: 'var(--text-2, #A39B8A)' }}> · {it.what}</span></div>
                          <div className="coach-plan-row-why">{it.why}</div>
                        </div>
                        <div className="coach-plan-row-time">
                          <span className="coach-plan-row-time-main">{it.min} мин</span>
                        </div>
                        <div className="coach-plan-row-act">
                          <button type="button" className="coach-btn-line" style={{ height: 40, fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            Начать
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Composer — пока визуально; живая логика в следующем коммите */}
          <div className="coach-composer">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Почему такой план?', 'Разбери вчерашнюю партию', 'Отчитаться за день'].map(q => (
                <button key={q} type="button" className="coach-btn-line" style={{ height: 34, padding: '0 14px', fontSize: 13 }}>
                  {q}
                </button>
              ))}
            </div>
            <form style={{ margin: 0, display: 'flex', gap: 8 }}>
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
          {/* Заглушки карточек — наполнение в следующем коммите */}
          <section className="coach-card" style={{ padding: '22px 24px' }}>
            <div className="coach-eyebrow">Сегодня</div>
            <div style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>Карточка «Сегодня» готовится…</div>
          </section>
          <section className="coach-card" style={{ padding: '22px 24px' }}>
            <h3 className="coach-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, color: 'var(--ivory)' }}>Форма</h3>
            {ctx?.form.rating_now != null && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
                Рейтинг: <strong style={{ color: 'var(--ivory)' }}>{ctx.form.rating_now}</strong>
                {ctx.form.rating_7d_delta != null && <> · за неделю {ctx.form.rating_7d_delta > 0 ? '+' : ''}{ctx.form.rating_7d_delta}</>}
              </div>
            )}
          </section>
          <section className="coach-card" style={{ padding: '22px 24px' }}>
            <h3 className="coach-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, color: 'var(--ivory)' }}>Где ты теряешь очки</h3>
            {ctx && ctx.leaks.length === 0 && (
              <p style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                Синхронизируй партии рапид — тогда Таль увидит, где ты теряешь очки.
              </p>
            )}
            {ctx && ctx.leaks.length > 0 && (
              <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', fontSize: 13, color: 'var(--ivory)' }}>
                {ctx.leaks.map(l => <li key={l.key}>{l.label} — {l.count}</li>)}
              </ul>
            )}
          </section>
          <section className="coach-card" style={{ padding: '22px 24px' }}>
            <h3 className="coach-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, color: 'var(--ivory)' }}>Неделя</h3>
            {ctx && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
                Серия: <strong style={{ color: 'var(--ivory)' }}>{ctx.streak}</strong> дн. · Дисциплина за 30 дней: <strong style={{ color: 'var(--ivory)' }}>{ctx.discipline_30d}%</strong>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function formatHours(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

const TASK_TITLE: Record<string, string> = {
  tactics:  'Тактика',
  threats:  'Проверка угроз',
  openings: 'Дебюты',
  convert:  'Дожми партию',
  endgames: 'Эндшпили',
  sac:      'Жертвы',
  mistakes: 'Ошибки',
  blind:    'Расчёт вслепую',
  play:     'Партия',
  book:     'Книга',
  video:    'Видео',
};
function taskTitle(key: string): string { return TASK_TITLE[key] ?? key; }

const WEEKDAY_RU = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const MONTH_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function todayHumanRu(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAY_RU[d.getDay()]}, ${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
}
