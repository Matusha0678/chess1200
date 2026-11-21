'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TalMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface DailyLog {
  date: string;
  task_key: string;
  value: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TASKS = [
  { key: 'rapid',      label: '3 партии рапид',       target: 3,  type: 'count' as const, href: '/play',    link: 'Играть'       },
  { key: 'analysis',   label: '3 анализа партий',      target: 3,  type: 'count' as const, href: '/games',   link: 'Мои партии'   },
  { key: 'puzzles',    label: '20 тактических задач',  target: 20, type: 'count' as const, href: '/tactics', link: 'Тактика'      },
  { key: 'book',       label: 'Книга 20 мин',          target: 1,  type: 'check' as const, href: null,       link: null           },
  { key: 'meditation', label: 'Медитация 10 мин',      target: 1,  type: 'check' as const, href: null,       link: null           },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr(): string {
  return localDateStr(new Date());
}

function formatDateRu(str: string): string {
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });
}

function getProgress(vals: Record<string, number>): number {
  const score = TASKS.reduce((sum, t) => sum + Math.min((vals[t.key] ?? 0) / t.target, 1), 0);
  return Math.round((score / TASKS.length) * 100);
}

function isDayDone(vals: Record<string, number>): boolean {
  return getProgress(vals) >= 60;
}

function buildContextText(vals: Record<string, number>, stk: number): string {
  const lines = TASKS.map(t => {
    const v = vals[t.key] ?? 0;
    return `${v >= t.target ? '✓' : '✗'} ${t.label}: ${v}/${t.target}`;
  });
  const pct = getProgress(vals);
  const streakNote = stk === 0
    ? 'Стрик сброшен — 0 дней подряд.'
    : stk >= 7
      ? `Стрик: ${stk} дней подряд — хорошая серия.`
      : `Стрик: ${stk} дней подряд.`;
  return `Выполнено сегодня (${pct}%):\n${lines.join('\n')}\n${streakNote}`;
}

function calcStreak(byDate: Record<string, Record<string, number>>): number {
  let n = 0;
  const d = new Date();
  if (!isDayDone(byDate[localDateStr(d)] ?? {})) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    if (!isDayDone(byDate[localDateStr(d)] ?? {})) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ── Shared micro-styles ───────────────────────────────────────────────────────

const btnBase: React.CSSProperties = {
  width: 24, height: 24,
  border: '1px solid var(--hairline)',
  background: 'transparent',
  cursor: 'pointer', fontSize: 15, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TalPage() {
  const [values, setValues]     = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<TalMessage[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [streak, setStreak]     = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  // ── Core: call Tal AI ──────────────────────────────────────────────────────

  const callTal = useCallback(async (
    userContent: string | null,
    isGreeting: boolean,
    withValues: Record<string, number>,
    withStreak: number,
    withMessages: TalMessage[]
  ) => {
    setLoading(true);

    const nextMessages: TalMessage[] = userContent
      ? [...withMessages, { role: 'user', content: userContent, created_at: new Date().toISOString() }]
      : withMessages;

    if (userContent) {
      setMessages(nextMessages);
      await supabase.from('tal_chat').insert({ role: 'user', content: userContent });
    }

    try {
      const res = await fetch('/api/tal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          context: {
            tasks: withValues,
            streak: withStreak,
            isGreeting,
            contextText: buildContextText(withValues, withStreak),
          },
        }),
      });

      const data = await res.json() as { content?: string; error?: string };
      const talContent = data.content ?? (data.error ? `Ошибка: ${data.error}` : 'Таль молчит...');

      const talMsg: TalMessage = { role: 'assistant', content: talContent, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, talMsg]);
      await supabase.from('tal_chat').insert({ role: 'assistant', content: talContent });
    } catch {
      // silent — chat still works
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load data on mount ─────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const today = todayStr();
    const monthAgo = localDateStr(new Date(Date.now() - 31 * 86400000));

    const [{ data: todayLogs }, { data: allLogs }, { data: chatRows }] = await Promise.all([
      supabase.from('tal_daily_log').select('task_key, value').eq('date', today),
      supabase.from('tal_daily_log').select('date, task_key, value').gte('date', monthAgo).order('date', { ascending: false }),
      supabase.from('tal_chat').select('id, role, content, created_at').order('created_at', { ascending: false }).limit(40),
    ]);

    // Tasks
    const vals: Record<string, number> = {};
    for (const row of todayLogs ?? []) vals[row.task_key] = row.value;
    setValues(vals);

    // Streak
    const byDate: Record<string, Record<string, number>> = {};
    for (const row of (allLogs ?? []) as DailyLog[]) {
      if (!byDate[row.date]) byDate[row.date] = {};
      byDate[row.date][row.task_key] = row.value;
    }
    const stk = calcStreak(byDate);
    setStreak(stk);

    // Messages
    const loaded: TalMessage[] = ((chatRows ?? []) as TalMessage[]).reverse();
    setMessages(loaded);

    // Auto-greet if no Tal message today
    const hasGreeting = loaded.some(m =>
      m.role === 'assistant' &&
      m.created_at &&
      localDateStr(new Date(m.created_at)) === today
    );
    if (!hasGreeting) {
      await callTal(null, true, vals, stk, loaded);
    }
  }, [callTal]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Event handlers ─────────────────────────────────────────────────────────

  async function updateTask(key: string, delta: number) {
    const task = TASKS.find(t => t.key === key)!;
    const current = values[key] ?? 0;
    const newVal = Math.max(0, Math.min(current + delta, task.target * 3));
    const updated = { ...values, [key]: newVal };
    setValues(updated);
    await supabase.from('tal_daily_log').upsert(
      { date: todayStr(), task_key: key, value: newVal, updated_at: new Date().toISOString() },
      { onConflict: 'date,task_key' }
    );
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const content = input.trim();
    setInput('');
    await callTal(content, false, values, streak, messages);
  }

  async function handleReport() {
    const lines = TASKS.map(t => {
      const v = values[t.key] ?? 0;
      return `${v >= t.target ? '✓' : '✗'} ${t.label}: ${v}/${t.target}`;
    });
    await callTal(`Отчёт за сегодня:\n${lines.join('\n')}`, false, values, streak, messages);
  }

  const progress = getProgress(values);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 40px' }}>

      {/* Hero banner — Tal portrait */}
      <div className="tal-hero" aria-hidden="false">
        <div className="tal-hero-bg" />
        <div className="tal-hero-overlay" />
        <div className="tal-hero-text">
          <div className="tal-hero-kicker">CHESS 1200 · ТРЕНЕР</div>
          <h1 className="tal-hero-title">Михаил Таль</h1>
          <p className="tal-hero-quote">
            «Атакуйте там, где соперник слабее&nbsp;всего.»
          </p>
          <div className="tal-hero-sig">— M. Tal</div>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, borderBottom: '1px solid var(--hairline)', paddingBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
            CHESS 1200
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px', margin: 0, color: 'var(--ivory)', lineHeight: 1 }}>
            ТРЕНЕР ТАЛЬ
          </h1>
          <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Строгий. Честный. Атакующий.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: streak > 0 ? 'var(--accent)' : 'var(--hairline-2)', lineHeight: 1 }}>
            {streak}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 2 }}>
            {streak === 1 ? 'день подряд' : streak >= 2 && streak <= 4 ? 'дня подряд' : 'дней подряд'}
          </div>
        </div>
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Plan ──────────────────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.2px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>
            ПЛАН — {formatDateRu(todayStr())}
          </div>

          <div style={{ border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
            {TASKS.map((task, i) => {
              const val = values[task.key] ?? 0;
              const done = val >= task.target;
              return (
                <div key={task.key} style={{ padding: '11px 14px', borderBottom: i < TASKS.length - 1 ? '1px solid var(--hairline)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
                      <span style={{
                        width: 18, height: 18, border: '1px solid',
                        borderColor: done ? 'var(--accent)' : 'var(--control)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, flexShrink: 0, fontWeight: 700,
                        color: done ? 'var(--accent)' : 'transparent',
                        background: done ? 'var(--accent-soft)' : 'transparent',
                        transition: 'all 0.15s',
                      }}>
                        {done ? '✓' : ''}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: done ? 'var(--muted)' : 'var(--ivory)', textDecoration: done ? 'line-through' : 'none' }}>
                          {task.label}
                        </div>
                        {task.href && (
                          <Link href={task.href} style={{ fontSize: 11, color: 'var(--accent)' }}>
                            → {task.link}
                          </Link>
                        )}
                      </div>
                    </div>

                    {task.type === 'count' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <button onClick={() => updateTask(task.key, -1)} style={{ ...btnBase, color: 'var(--muted)' }}>−</button>
                        <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: done ? 'var(--accent)' : 'var(--ivory)', fontWeight: done ? 600 : 400 }}>
                          {val}/{task.target}
                        </span>
                        <button onClick={() => updateTask(task.key, 1)} style={{ ...btnBase, color: 'var(--ivory)' }}>+</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => updateTask(task.key, done ? -1 : 1)}
                        style={{ padding: '4px 10px', fontSize: 11, border: '1px solid', borderColor: done ? 'var(--accent)' : 'var(--hairline)', background: done ? 'var(--accent-soft)' : 'transparent', color: done ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', letterSpacing: '0.5px', textTransform: 'uppercase' }}
                      >
                        {done ? 'Готово' : 'Отметить'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 5, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              <span>ПРОГРЕСС</span>
              <span style={{ color: progress >= 60 ? 'var(--accent)' : 'var(--ivory)', fontWeight: 600 }}>{progress}%</span>
            </div>
            <div style={{ height: 2, background: 'var(--hairline)' }}>
              <div style={{ height: '100%', background: 'var(--accent)', width: `${progress}%`, opacity: progress >= 60 ? 1 : 0.4, transition: 'width 0.3s ease' }} />
            </div>
          </div>

          {/* Report button */}
          <button
            onClick={handleReport}
            disabled={loading}
            style={{ marginTop: 14, width: '100%', padding: '10px 0', border: '1px solid var(--hairline)', background: 'transparent', color: loading ? 'var(--muted)' : 'var(--ivory)', fontSize: 12, fontWeight: 600, cursor: loading ? 'default' : 'pointer', letterSpacing: '1px', textTransform: 'uppercase' }}
          >
            Отчитаться Талю
          </button>
        </div>

        {/* ── Chat ──────────────────────────────────────────────────────────── */}
        <div style={{ border: '1px solid var(--hairline)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 190px)', minHeight: 480 }}>

          {/* Chat header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ width: 38, height: 38, background: 'var(--bg)', border: '1px solid var(--hairline-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ivory)', flexShrink: 0 }}>
              МТ
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>Михаил Таль</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>8-й чемпион мира · Волшебник из Риги</div>
            </div>
            <div style={{ fontSize: 10, color: loading ? 'var(--accent)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              {loading ? 'думает...' : 'онлайн'}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && !loading && (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', margin: 'auto' }}>
                Таль ещё не пришёл...
              </div>
            )}

            {messages.map((m, i) => (
              <div key={m.id ?? i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '78%', padding: '9px 13px', background: m.role === 'user' ? 'var(--surface-2)' : 'var(--bg)', border: '1px solid', borderColor: m.role === 'user' ? 'var(--hairline-2)' : 'var(--hairline)', fontSize: 14, lineHeight: 1.55, color: m.role === 'user' ? 'var(--muted)' : 'var(--ivory)', whiteSpace: 'pre-wrap' }}>
                  {m.role === 'assistant' && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 5 }}>
                      ТАЛЬ
                    </div>
                  )}
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '9px 13px', border: '1px solid var(--hairline)', background: 'var(--bg)', fontSize: 13, color: 'var(--muted)' }}>
                  · · ·
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder="Написать Талю..."
              disabled={loading}
              style={{ flex: 1, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--hairline)', color: 'var(--ivory)', fontSize: 14, outline: 'none' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--ivory)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--hairline)'; }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
              style={{ padding: '8px 18px', background: input.trim() && !loading ? 'var(--ivory)' : 'var(--surface-2)', color: input.trim() && !loading ? 'var(--ink)' : 'var(--muted)', border: '1px solid var(--hairline)', fontSize: 14, fontWeight: 600, cursor: input.trim() && !loading ? 'pointer' : 'default', transition: 'all 0.15s' }}
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
