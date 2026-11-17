'use client';

import { useState, useEffect, useRef, use } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import type { Opening, OpeningLine, LineProgress, ChessMove } from '@/types/openings';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineWithProgress extends OpeningLine {
  line_progress: LineProgress[];
}

interface ExamLine {
  line: LineWithProgress;
  failed: boolean;
}

interface Props {
  params: Promise<{ id: string }>;
}

type ExamPhase = 'setup' | 'running' | 'done';

// ── SR helpers ────────────────────────────────────────────────────────────────

function nextReviewDate(mastery: number): string {
  const days: Record<number, number> = { 0: 1, 1: 3, 2: 7, 3: 14, 4: 30, 5: 60 };
  const d = new Date();
  d.setDate(d.getDate() + (days[Math.min(mastery, 5)] ?? 1));
  return d.toISOString();
}

async function updateLineProgress(line: LineWithProgress, correct: boolean) {
  const prog = line.line_progress?.[0] ?? null;
  const now = new Date().toISOString();
  const oldMastery = prog?.mastery ?? 0;
  const newMastery = correct ? Math.min(oldMastery + 1, 5) : Math.max(oldMastery - 1, 0);
  if (prog) {
    await supabase.from('line_progress').update({
      correct_count: (prog.correct_count ?? 0) + (correct ? 1 : 0),
      incorrect_count: (prog.incorrect_count ?? 0) + (correct ? 0 : 1),
      mastery: newMastery,
      next_review: nextReviewDate(newMastery),
      last_practiced: now,
    }).eq('id', prog.id);
  } else {
    await supabase.from('line_progress').insert({
      line_id: line.id,
      correct_count: correct ? 1 : 0,
      incorrect_count: correct ? 0 : 1,
      mastery: correct ? 1 : 0,
      next_review: nextReviewDate(correct ? 1 : 0),
      last_practiced: now,
    });
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExamPage({ params }: Props) {
  const { id } = use(params);
  const { boardTheme, customPieces, boardThemeId, pieceStyleId } = useBoardTheme();

  const [opening, setOpening] = useState<Opening | null>(null);
  const [allLines, setAllLines] = useState<LineWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<ExamPhase>('setup');
  const [mode, setMode] = useState<'all' | 'review'>('all');
  const [timerLimit, setTimerLimit] = useState(10 * 60); // seconds
  const [sqlMissing, setSqlMissing] = useState(false);

  // Exam state
  const [queue, setQueue]       = useState<LineWithProgress[]>([]);
  const [results, setResults]   = useState<ExamLine[]>([]);
  const [currentLine, setCurrentLine] = useState<LineWithProgress | null>(null);
  const [currentIdx, setCurrentIdx]   = useState(0);    // move index in line
  const [chess, setChess]             = useState<Chess | null>(null);
  const [wrongMove, setWrongMove]     = useState(false);
  const [timeLeft, setTimeLeft]       = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: openingData }, { data: linesData }] = await Promise.all([
      supabase.from('openings').select('*').eq('id', id).single(),
      supabase.from('opening_lines').select('*, line_progress(*)').eq('opening_id', id).order('line_index'),
    ]);
    if (openingData) setOpening(openingData as Opening);
    setAllLines((linesData ?? []) as LineWithProgress[]);
    setLoading(false);
  }

  function startExam() {
    const now = new Date().toISOString();
    const pool = mode === 'review'
      ? allLines.filter(l => { const p = l.line_progress?.[0]; return p && p.next_review <= now && p.mastery < 5; })
      : allLines;
    if (pool.length === 0) return;

    // Shuffle
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setResults([]);
    setTimeLeft(timerLimit);
    setPhase('running');
    startTimeRef.current = Date.now();

    // Start timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          finishExamWithResults(undefined, shuffled);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    loadLine(shuffled[0], shuffled);
  }

  function loadLine(line: LineWithProgress, q?: LineWithProgress[]) {
    const c = new Chess();
    setChess(c);
    setCurrentLine(line);
    setCurrentIdx(0);
    setWrongMove(false);

    // Auto-play opponent's first move if we play black
    const firstMove = line.moves[0];
    if (!firstMove) return;
    const myColor = firstMove.color === 'w' ? 'b' : 'w'; // I'm the other color
    // If line starts with white move and I'm black, auto-play first move
    if (myColor === 'b' && firstMove.color === 'w') {
      try { c.move({ from: firstMove.from, to: firstMove.to }); } catch { /* skip */ }
      setCurrentIdx(1);
    }
  }

  function handleDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!chess || !currentLine || phase !== 'running') return false;
    if (!targetSquare) return false;
    const expected = currentLine.moves[currentIdx];
    if (!expected) return false;
    if (sourceSquare !== expected.from || targetSquare !== expected.to) {
      setWrongMove(true);
      return false;
    }
    try { chess.move({ from: sourceSquare, to: targetSquare }); } catch { return false; }
    setWrongMove(false);
    setCurrentIdx(prev => prev + 1);

    const nextIdx = currentIdx + 1;
    // Auto-play opponent response
    const opp = currentLine.moves[nextIdx];
    if (opp && opp.color !== expected.color) {
      setTimeout(() => {
        try { chess.move({ from: opp.from, to: opp.to }); } catch { /* skip */ }
        const afterOpp = nextIdx + 1;
        setCurrentIdx(afterOpp);
        if (afterOpp >= currentLine.moves.length) {
          lineCompleted(currentLine, true);
        }
      }, 300);
    } else if (nextIdx >= currentLine.moves.length) {
      lineCompleted(currentLine, true);
    }
    return true;
  }

  async function lineCompleted(line: LineWithProgress, correct: boolean) {
    if (wrongMove || !correct) {
      await updateLineProgress(line, false);
      void showAnswer(line, false);
    } else {
      await updateLineProgress(line, true);
      void advanceToNext(line, true);
    }
  }

  async function showAnswer(line: LineWithProgress, correct: boolean) {
    setResults(prev => [...prev, { line, failed: !correct }]);
    // Brief pause to show correct move
    await new Promise(r => setTimeout(r, 1200));
    advanceToNext(line, correct);
  }

  function advanceToNext(line: LineWithProgress, correct: boolean) {
    setResults(prev => {
      const updated = prev.some(r => r.line.id === line.id) ? prev : [...prev, { line, failed: !correct }];
      return updated;
    });
    setQueue(prev => {
      const remaining = prev.slice(1);
      if (remaining.length === 0) {
        clearInterval(timerRef.current!);
        setPhase('done');
        const secs = Math.round((Date.now() - startTimeRef.current) / 1000);
        void saveResult([...results, { line, failed: !correct }], secs);
      } else {
        loadLine(remaining[0]);
      }
      return remaining;
    });
  }

  async function saveResult(res: ExamLine[], secs: number) {
    const total = res.length;
    const perfect = res.filter(r => !r.failed).length;
    try {
      await supabase.from('exam_log').insert({ opening_id: id, total, perfect, seconds: secs });
    } catch (e) {
      const err = e as { message?: string; code?: string };
      if (err?.code === '42P01' || err?.message?.includes('does not exist')) setSqlMissing(true);
    }
  }

  function finishExamWithResults(res?: ExamLine[], q?: LineWithProgress[]) {
    setPhase('done');
    clearInterval(timerRef.current!);
    const finalRes = res ?? results;
    const secs = Math.round((Date.now() - startTimeRef.current) / 1000);
    void saveResult(finalRes, secs);
  }

  const boardKey = `${boardThemeId}-${pieceStyleId}`;
  const fen = chess?.fen() ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const myColor = currentLine?.moves[0]?.color === 'w' ? 'b' : 'w';
  const orientation: 'white' | 'black' = myColor === 'w' ? 'white' : 'black';
  const totalInQueue = queue.length;

  function fmtTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function gradeLabel(pct: number): string {
    if (pct >= 90) return 'A';
    if (pct >= 75) return 'B';
    if (pct >= 60) return 'C';
    return 'D';
  }

  if (loading) return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 72px' }}>
      <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
    </main>
  );

  if (sqlMissing) return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 72px' }}>
      <Link href={`/openings/${id}`} style={{ fontSize: 13, color: 'var(--muted)' }}>← Дебют</Link>
      <div style={{ marginTop: 24, padding: '16px 20px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 14, color: 'var(--muted)' }}>
        Выполни <strong>supabase/21-exam-log.sql</strong>, затем повтори.
      </div>
    </main>
  );

  if (phase === 'setup') {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px 72px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Link href={`/openings/${id}`} style={{ fontSize: 13, color: 'var(--muted)' }}>← {opening?.name ?? 'Дебют'}</Link>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          Экзамен
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
          Линии идут в случайном порядке. Без подсказок и подсветки. Ошибка — показывается правильный ход, следующая линия.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>Режим</div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--hairline)' }}>
              <button onClick={() => setMode('all')} style={{ flex: 1, height: 36, border: 'none', background: mode === 'all' ? 'var(--track)' : 'transparent', color: mode === 'all' ? 'var(--ivory)' : 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Все линии ({allLines.length})
              </button>
              <button onClick={() => setMode('review')} style={{ flex: 1, height: 36, border: 'none', borderLeft: '1px solid var(--hairline)', background: mode === 'review' ? 'var(--track)' : 'transparent', color: mode === 'review' ? 'var(--ivory)' : 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Только на повтор
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>Таймер (минуты)</div>
            <input type="number" value={timerLimit / 60} onChange={e => setTimerLimit(Math.max(1, parseInt(e.target.value) || 10) * 60)} min={1} max={60}
              style={{ width: 80, height: 36, padding: '0 10px', fontSize: 14, background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ivory)', outline: 'none', fontFamily: 'inherit' }} />
          </div>

          <button onClick={startExam} disabled={allLines.length === 0} style={{ height: 48, padding: '0 32px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
            Начать экзамен
          </button>
        </div>
      </main>
    );
  }

  if (phase === 'done') {
    const total = results.length;
    const perfect = results.filter(r => !r.failed).length;
    const pct = total > 0 ? Math.round(perfect / total * 100) : 0;
    const failed = results.filter(r => r.failed);
    const secs = Math.round((Date.now() - startTimeRef.current) / 1000);

    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 72px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Link href={`/openings/${id}`} style={{ fontSize: 13, color: 'var(--muted)' }}>← {opening?.name ?? 'Дебют'}</Link>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          Экзамен завершён
        </h1>

        <div style={{ padding: '20px 24px', border: '1px solid var(--hairline)', background: 'var(--surface)', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.03em', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)", color: pct >= 75 ? 'rgba(100,220,100,0.95)' : pct >= 60 ? 'rgba(220,180,40,0.9)' : 'rgba(220,80,60,0.9)' }}>{pct}%</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Линий без ошибок: {perfect} / {total}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--ivory)' }}>{gradeLabel(pct)}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{fmtTime(secs)} затрачено</div>
          </div>
        </div>

        {failed.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>Линии с ошибками ({failed.length})</div>
            {failed.map(({ line }) => {
              const preview = line.moves.slice(0, 8).reduce((acc, m, i) => {
                return acc + (m.color === 'w' ? `${Math.floor(i/2)+1}. ` : '') + m.san + ' ';
              }, '').trim();
              return (
                <div key={line.id} style={{ padding: '10px 14px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 13, color: 'var(--muted)', fontFamily: 'monospace' }}>
                  {preview}{line.moves.length > 8 ? '…' : ''}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => { setPhase('setup'); }} style={{ height: 44, padding: '0 24px', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Ещё раз
          </button>
          <Link href={`/openings/${id}`} style={{ height: 44, padding: '0 24px', display: 'inline-flex', alignItems: 'center', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            К дебюту
          </Link>
        </div>
      </main>
    );
  }

  // Running
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 72px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Осталось: <strong style={{ color: 'var(--ivory)' }}>{totalInQueue}</strong></span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: timeLeft < 60 ? 'rgba(220,80,60,0.9)' : 'var(--muted)', fontWeight: 600 }}>
          ⏱ {fmtTime(timeLeft)}
        </span>
        <button onClick={() => { clearInterval(timerRef.current!); setPhase('done'); void saveResult(results, Math.round((Date.now() - startTimeRef.current)/1000)); }} style={{ height: 32, padding: '0 12px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          Завершить
        </button>
      </div>

      {/* Wrong move indicator */}
      {wrongMove && (
        <div style={{ padding: '10px 16px', background: 'rgba(220,80,60,0.1)', border: '1px solid rgba(220,80,60,0.3)', fontSize: 14, color: 'rgba(220,80,60,0.9)' }}>
          Неверный ход. Правильный: {currentLine?.moves[currentIdx]?.san}
        </div>
      )}

      {/* Board */}
      <div style={{ width: 'min(100%, 480px)', aspectRatio: '1' }}>
        <Chessboard
          key={boardKey}
          options={{
            position: fen,
            boardOrientation: orientation,
            onPieceDrop: handleDrop,
            allowDragging: true,
            boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
            darkSquareStyle:  { backgroundColor: boardTheme.dark },
            lightSquareStyle: { backgroundColor: boardTheme.light },
            pieces: customPieces,
            showNotation: true,
            animationDurationInMs: 150,
          }}
        />
      </div>

      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Сыграно: {results.length} / {results.length + totalInQueue}</div>
    </main>
  );
}
