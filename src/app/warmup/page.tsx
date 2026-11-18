'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { findThreats } from '@/lib/threats';
import type { Threat } from '@/lib/threats';
import { Board } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function movesListToFen(moves: Array<{ san: string }>): string {
  const chess = new Chess();
  for (const m of moves) {
    try { chess.move(m.san); } catch { break; }
  }
  return chess.fen();
}

function getFenForStep(data: StepData): string {
  if (data.kind === 'threat') return data.fen;
  if (data.kind === 'trap') return data.fen;
  if (data.kind === 'mistake') return data.fen;
  if (data.kind === 'line') return movesListToFen(data.moves);
  return START_FEN;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WarmupPage() {
  const { S } = useTrainerGeometry();
  const [steps, setSteps]           = useState<Step[]>([]);
  const [stepIdx, setStepIdx]       = useState(0);
  const [loading, setLoading]       = useState(true);
  const [timeLeft, setTimeLeft]     = useState(5 * 60);
  const [sqlMissing, setSqlMissing] = useState(false);
  const startTimeRef = useRef(0);
  const stepsDoneRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const [showThreatResult, setShowThreatResult] = useState(false);

  const buildSteps = useCallback(async (): Promise<Step[]> => {
    const result: Step[] = [];

    // Step 1–3: threat positions
    const { data: mcRows } = await supabase.from('mistake_cards').select('fen_before').order('created_at', { ascending: false }).limit(30);
    const threatFens: string[] = [];
    for (const row of (mcRows ?? []) as Array<{ fen_before: string }>) {
      if (threatFens.length >= 3) break;
      try {
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

    result.push({ kind: 'finish', data: { kind: 'finish' } });
    return result;
  }, []);

  async function finishWarmup(done: number) {
    clearInterval(timerRef.current!);
    const secs = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await supabase.from('warmup_log').upsert({ day: today, steps_done: done, seconds: secs });
    } catch (e) {
      const err = e as { code?: string };
      if (err?.code === '42P01') setSqlMissing(true);
    }
    if (done > 0) {
      const { data: xpRow } = await supabase.from('user_xp').select('total_xp').eq('id', 1).maybeSingle();
      const cur = (xpRow as { total_xp?: number } | null)?.total_xp ?? 0;
      await supabase.from('user_xp').upsert({ id: 1, total_xp: cur + done * 2 });
    }
  }

  useEffect(() => {
    (async () => {
      const stps = await buildSteps();
      setSteps(stps);
      setLoading(false);
      // Auto-start
      setStepIdx(0);
      stepsDoneRef.current = 0;
      setTimeLeft(5 * 60);
      startTimeRef.current = Date.now();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            void finishWarmup(stepsDoneRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildSteps]);

  function nextStep() {
    stepsDoneRef.current++;
    setStepIdx(prev => prev + 1);
    setShowThreatResult(false);
  }

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // ── Shared layout helpers ──────────────────────────────────────────────────

  if (sqlMissing) {
    return (
      <TrainerLayout
        topBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>Разминка</span>}
        board={<Board fen={START_FEN} size={S} orientation="white" interactive={false} />}
        bottomBar={<span />}
        panel={
          <div style={{ padding: 24 }}>
            <div style={{ padding: '16px 20px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 14, color: 'var(--muted)' }}>
              Выполни <strong>supabase/23-warmup-log.sql</strong>, затем повтори.
            </div>
          </div>
        }
      />
    );
  }

  if (loading) {
    return (
      <TrainerLayout
        topBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>Загрузка…</span>}
        board={<Board fen={START_FEN} size={S} orientation="white" interactive={false} />}
        bottomBar={<span />}
        panel={<div style={{ padding: 24, color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>}
      />
    );
  }

  const step = steps[stepIdx];
  if (!step) return null;
  const stepData = step.data;
  const currentFen = getFenForStep(stepData);

  const topBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        Шаг {Math.min(stepIdx + 1, steps.length)} / {steps.length}
      </span>
      <div style={{ flex: 1 }} />
      <span style={{
        fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: 600,
        color: timeLeft < 60 ? 'rgba(220,80,60,0.9)' : 'var(--muted)',
      }}>
        {fmtTime(timeLeft)}
      </span>
    </div>
  );

  // ── Panel content per step ─────────────────────────────────────────────────

  const skipBtn = (
    <button onClick={nextStep} style={{ height: 28, padding: '0 12px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
      Пропустить
    </button>
  );

  let panelContent: React.ReactNode = null;

  if (stepData.kind === 'threat') {
    panelContent = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div data-ui="panel-header" className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
          <span data-ui="panel-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>Что угрожает сопернику?</span>
          {skipBtn}
        </div>
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!showThreatResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stepData.threats.slice(0, 4).map((t, i) => (
                <button key={i} onClick={() => setShowThreatResult(true)}
                  style={{ height: 42, padding: '0 16px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--ivory)', fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
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
      </div>
    );
  } else if (stepData.kind === 'line') {
    panelContent = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div data-ui="panel-header" className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
          <span data-ui="panel-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>Повтори линию</span>
          {skipBtn}
        </div>
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--ivory)', padding: '12px 16px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
            {stepData.moves.slice(0, 10).reduce((acc: string, m, i) => {
              return acc + (m.color === 'w' ? `${Math.floor(i / 2) + 1}. ` : '') + m.san + ' ';
            }, '').trim()}
            {stepData.moves.length > 10 ? '…' : ''}
          </div>
          <Link href="/openings" style={{ fontSize: 13, color: 'var(--muted)' }}>→ Открыть дебюты</Link>
          <button onClick={nextStep} style={{ height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
            Знаю →
          </button>
        </div>
      </div>
    );
  } else if (stepData.kind === 'trap') {
    panelContent = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div data-ui="panel-header" className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
          <span data-ui="panel-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>Ловушка</span>
          {skipBtn}
        </div>
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
      </div>
    );
  } else if (stepData.kind === 'mistake') {
    panelContent = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div data-ui="panel-header" className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
          <span data-ui="panel-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>Ошибка из банка</span>
          {skipBtn}
        </div>
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
      </div>
    );
  } else if (stepData.kind === 'finish') {
    panelContent = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div data-ui="panel-header" className="panel-header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
          <span data-ui="panel-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>Разминка завершена!</span>
        </div>
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ivory)', lineHeight: 1.7, padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
            Перед каждым ходом спроси: что хочет сделать соперник?
          </p>
          <a href="https://chess.com" target="_blank" rel="noopener noreferrer"
            style={{ height: 48, padding: '0 28px', display: 'inline-flex', alignItems: 'center', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 15, fontWeight: 700, textDecoration: 'none', alignSelf: 'flex-start' }}>
            Идти играть →
          </a>
          <Link href="/" style={{ fontSize: 13, color: 'var(--muted)' }}>← На главную</Link>
        </div>
      </div>
    );
  }

  const bottomBarLabel =
    stepData.kind === 'threat' ? 'Угрозы' :
    stepData.kind === 'line' ? 'Дебютная линия' :
    stepData.kind === 'trap' ? 'Ловушка' :
    stepData.kind === 'mistake' ? 'Позиция' : '';

  return (
    <TrainerLayout
      topBar={topBar}
      board={<Board fen={currentFen} size={S} orientation="white" interactive={false} />}
      bottomBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>{bottomBarLabel}</span>}
      panel={panelContent ?? <div />}
    />
  );
}
