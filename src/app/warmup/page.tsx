'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { findThreats } from '@/lib/threats';
import type { Threat } from '@/lib/threats';

// ── Types ─────────────────────────────────────────────────────────────────────

type StepKind = 'threat' | 'line' | 'trap' | 'mistake' | 'finish';

interface Step {
  kind: StepKind;
  data: StepData;
}

type StepData =
  | { kind: 'threat'; fen: string; threats: Threat[]; answered: boolean; correct: boolean | null }
  | { kind: 'line'; lineId: string; moves: Array<{ san: string; from: string; to: string; color: 'w' | 'b' }>; name: string }
  | { kind: 'trap'; fen: string; question: string; answer: string }
  | { kind: 'mistake'; fen: string; best_move: string; tag: string }
  | { kind: 'finish' };

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WarmupPage() {
  const [steps, setSteps]           = useState<Step[]>([]);
  const [stepIdx, setStepIdx]       = useState(0);
  const [loading, setLoading]       = useState(true);
  const [started, setStarted]       = useState(false);
  const [timeLeft, setTimeLeft]     = useState(5 * 60);
  const [stepsDone, setStepsDone]   = useState(0);
  const [sqlMissing, setSqlMissing] = useState(false);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  // Threat step state
  const [threatAnswer, setThreatAnswer] = useState<string | null>(null);
  const [showThreatResult, setShowThreatResult] = useState(false);

  const buildSteps = useCallback(async (): Promise<Step[]> => {
    const result: Step[] = [];

    // Step 1–3: threat positions
    const { data: mcRows } = await supabase.from('mistake_cards').select('fen_before').order('created_at', { ascending: false }).limit(30);
    const threatFens: string[] = [];
    for (const row of (mcRows ?? []) as Array<{ fen_before: string }>) {
      if (threatFens.length >= 3) break;
      try {
        // Determine whose turn it is so we look for threats against them
        const fenColor = row.fen_before.split(' ')[1] as 'w' | 'b';
        const threats = findThreats(row.fen_before, fenColor);
        if (threats.length > 0) {
          result.push({ kind: 'threat', data: { kind: 'threat', fen: row.fen_before, threats, answered: false, correct: null } });
          threatFens.push(row.fen_before);
        }
      } catch { /* skip */ }
    }

    // Step 4: overdue line
    const now = new Date().toISOString();
    const { data: lineProgs } = await supabase.from('line_progress').select('line_id, next_review, mastery').lte('next_review', now).lt('mastery', 5).limit(5);
    if (lineProgs && lineProgs.length > 0) {
      const prog = (lineProgs as Array<{ line_id: string; next_review: string; mastery: number }>)[0];
      const { data: lineData } = await supabase.from('opening_lines').select('id, moves').eq('id', prog.line_id).maybeSingle();
      if (lineData) {
        const ld = lineData as { id: string; moves: Array<{ san: string; from: string; to: string; color: 'w' | 'b' }> };
        result.push({ kind: 'line', data: { kind: 'line', lineId: ld.id, moves: ld.moves, name: 'Линия на повтор' } });
      }
    }

    // Step 5: trap
    const { data: trapData } = await supabase.from('traps').select('id, fen, question, answer').limit(10);
    if (trapData && trapData.length > 0) {
      const trap = (trapData as Array<{ id: string; fen: string; question: string; answer: string }>)[Math.floor(Math.random() * trapData.length)];
      result.push({ kind: 'trap', data: { kind: 'trap', fen: trap.fen, question: trap.question, answer: trap.answer } });
    }

    // Step 6: mistake card
    const { data: mistakeData } = await supabase.from('mistake_cards').select('id, fen_before, best_move, tag').order('next_review', { ascending: true }).limit(1);
    if (mistakeData && mistakeData.length > 0) {
      const m = (mistakeData as Array<{ fen_before: string; best_move: string; tag: string }>)[0];
      result.push({ kind: 'mistake', data: { kind: 'mistake', fen: m.fen_before, best_move: m.best_move, tag: m.tag } });
    }

    // Finish
    result.push({ kind: 'finish', data: { kind: 'finish' } });
    return result;
  }, []);

  useEffect(() => {
    (async () => {
      const stps = await buildSteps();
      setSteps(stps);
      setLoading(false);
    })();
  }, [buildSteps]);

  async function startWarmup() {
    setStarted(true);
    setStepIdx(0);
    setTimeLeft(5 * 60);
    setStepsDone(0);
    startTimeRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          void finishWarmup(stepsDone);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function finishWarmup(done: number) {
    clearInterval(timerRef.current!);
    const secs = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await supabase.from('warmup_log').upsert({ day: today, steps_done: done, seconds: secs });
    } catch (e) {
      const err = e as { code?: string };
      if (err?.code === '42P01') setSqlMissing(true);
    }
    // Add XP
    if (done > 0) {
      const { data: xpRow } = await supabase.from('user_xp').select('total_xp').eq('id', 1).maybeSingle();
      const cur = (xpRow as { total_xp?: number } | null)?.total_xp ?? 0;
      await supabase.from('user_xp').upsert({ id: 1, total_xp: cur + done * 2 });
    }
  }

  function nextStep() {
    setStepsDone(prev => prev + 1);
    setStepIdx(prev => prev + 1);
    setThreatAnswer(null);
    setShowThreatResult(false);
  }

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  }

  if (sqlMissing) {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ padding: '16px 20px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 14, color: 'var(--muted)' }}>
          Выполни <strong>supabase/23-warmup-log.sql</strong>, затем повтори.
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
      </main>
    );
  }

  if (!started) {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px 72px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--muted)' }}>← Сегодня</Link>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          Разминка 5 минут
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
          Быстрая тренировка: угрозы, повторение линии, ловушка, ошибка.
          Всего {steps.length - 1} шагов.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.filter(s => s.kind !== 'finish').map((s, i) => (
            <div key={i} style={{ padding: '10px 14px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 10 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{i + 1}.</span>
              <span>
                {s.kind === 'threat' ? 'Угрозы соперника'
                 : s.kind === 'line' ? 'Повтор линии'
                 : s.kind === 'trap' ? 'Ловушка'
                 : s.kind === 'mistake' ? 'Ошибка из банка'
                 : ''}
              </span>
            </div>
          ))}
        </div>
        <button onClick={() => void startWarmup()} style={{ height: 48, padding: '0 32px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
          Начать разминку
        </button>
      </main>
    );
  }

  const step = steps[stepIdx];
  if (!step) return null;

  const stepData = step.data;

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '24px 24px 72px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Шаг {Math.min(stepIdx + 1, steps.length)} / {steps.length}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: timeLeft < 60 ? 'rgba(220,80,60,0.9)' : 'var(--muted)', fontWeight: 600 }}>
          {fmtTime(timeLeft)}
        </span>
        <button onClick={nextStep} style={{ height: 32, padding: '0 12px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          Пропустить
        </button>
      </div>

      {/* Step content */}
      {stepData.kind === 'threat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Что угрожает сопернику?</h2>
          <div style={{ padding: '12px 16px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 13, color: 'var(--muted)' }}>
            FEN: <code style={{ fontSize: 12 }}>{stepData.fen.slice(0, 40)}…</code>
          </div>
          {!showThreatResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stepData.threats.slice(0, 4).map((t, i) => (
                <button key={i} onClick={() => { setThreatAnswer(t.square); setShowThreatResult(true); }}
                  style={{ height: 42, padding: '0 16px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--ivory)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  {t.type} на {t.square}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 14, color: 'rgba(100,220,100,0.95)' }}>
                Угрозы: {stepData.threats.map(t => `${t.type} на ${t.square}`).join(', ')}
              </div>
              <button onClick={nextStep} style={{ height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                Следующий →
              </button>
            </div>
          )}
        </div>
      )}

      {stepData.kind === 'line' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Повтори линию</h2>
          <div style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--ivory)', padding: '12px 16px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
            {stepData.moves.slice(0, 10).reduce((acc: string, m, i) => {
              return acc + (m.color === 'w' ? `${Math.floor(i/2)+1}. ` : '') + m.san + ' ';
            }, '').trim()}
            {stepData.moves.length > 10 ? '…' : ''}
          </div>
          <Link href={`/openings`} style={{ fontSize: 13, color: 'var(--muted)' }}>→ Открыть дебюты</Link>
          <button onClick={nextStep} style={{ height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
            Знаю →
          </button>
        </div>
      )}

      {stepData.kind === 'trap' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Ловушка</h2>
          <div style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.6 }}>{stepData.question}</div>
          {!showThreatResult ? (
            <button onClick={() => setShowThreatResult(true)} style={{ height: 40, padding: '0 20px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
              Показать ответ
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ padding: '10px 14px', border: '1px solid rgba(100,220,100,0.3)', background: 'rgba(100,220,100,0.07)', fontSize: 14, color: 'rgba(100,220,100,0.95)' }}>
                {stepData.answer}
              </div>
              <button onClick={nextStep} style={{ height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                Следующий →
              </button>
            </div>
          )}
        </div>
      )}

      {stepData.kind === 'mistake' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Ошибка из банка</h2>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Тег: {stepData.tag}</div>
          {!showThreatResult ? (
            <button onClick={() => setShowThreatResult(true)} style={{ height: 40, padding: '0 20px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
              Показать лучший ход
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 14, color: 'var(--ivory)', fontFamily: 'monospace' }}>{stepData.best_move}</div>
              <Link href="/mistakes" style={{ fontSize: 13, color: 'var(--muted)' }}>→ Открыть банк ошибок</Link>
              <button onClick={nextStep} style={{ height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                Следующий →
              </button>
            </div>
          )}
        </div>
      )}

      {stepData.kind === 'finish' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 0' }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Разминка завершена!</h2>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ivory)', lineHeight: 1.7, padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
            Перед каждым ходом спроси: что хочет сделать соперник?
          </p>
          <a href="https://chess.com" target="_blank" rel="noopener noreferrer"
            style={{ height: 48, padding: '0 28px', display: 'inline-flex', alignItems: 'center', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
            Идти играть →
          </a>
          <Link href="/" style={{ fontSize: 13, color: 'var(--muted)' }}>← На главную</Link>
        </div>
      )}
    </main>
  );
}
