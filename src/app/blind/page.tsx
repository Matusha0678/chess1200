'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Board } from '@/components/board/Board';
import type { BoardArrow } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { SessionPanel } from '@/components/trainer/SessionPanel';
import { FeedbackCard } from '@/components/ui/FeedbackCard';
import { MoveChip } from '@/components/ui/MoveChip';
import { Kbd } from '@/components/ui/Kbd';
import { DEMO_BLIND, DEMO_TACTICS } from '@/lib/demo-positions';
import type { ParsedPuzzle } from '@/lib/lichess-puzzles';

// ── Types ─────────────────────────────────────────────────────────────────────

type BlindPhase = 'intro' | 'thinking' | 'answered' | 'empty';
type BlindLevel = 1 | 2 | 3;

const BLIND_LEVEL_KEY = 'blind-level';

function loadLevel(): BlindLevel {
  if (typeof window === 'undefined') return 1;
  try {
    const v = localStorage.getItem(BLIND_LEVEL_KEY);
    if (v === '1' || v === '2' || v === '3') return parseInt(v) as BlindLevel;
  } catch { /* ignore */ }
  return 1;
}

interface SessionScore {
  correct: number;
  errors: number;
  streak: number;
}

// ── SAN move display helper ───────────────────────────────────────────────────

function computeSanLine(fen: string, solution: string[], count: number): string[] {
  const c = new Chess(fen);
  const sans: string[] = [];
  for (let i = 0; i < count && i < solution.length; i++) {
    const uci = solution[i];
    const r = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n' });
    if (!r) break;
    sans.push(r.san);
  }
  return sans;
}

// ── Main page inner ───────────────────────────────────────────────────────────

function BlindPageInner() {
  const { S } = useTrainerGeometry();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === '1';

  const [puzzle, setPuzzle] = useState<ParsedPuzzle | null>(null);
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [phase, setPhase] = useState<BlindPhase>('empty');
  const [boardFen, setBoardFen] = useState('start');
  const [level, setLevel] = useState<BlindLevel>(1);
  const [score, setScore] = useState<SessionScore>({ correct: 0, errors: 0, streak: 0 });
  const [selectedFrom, setSelectedFrom] = useState<Square | null>(null);
  const [selectedTo, setSelectedTo] = useState<Square | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctSan, setCorrectSan] = useState<string>('');
  const [sanLine, setSanLine] = useState<string[]>([]);
  const [animatingFen, setAnimatingFen] = useState<string | null>(null);

  // Load level from localStorage
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLevel(loadLevel());
  }, []);

  // Puzzles for demo mode — use all DEMO_TACTICS filtered by having enough solution moves for the level
  const demoPuzzles = DEMO_TACTICS.filter(p => p.solution.length >= 3);

  // ── Load puzzle ─────────────────────────────────────────────────────────────
  const loadPuzzle = useCallback((p: ParsedPuzzle) => {
    setPuzzle(p);
    setPhase('intro');
    setBoardFen(p.fenStart);
    setSelectedFrom(null);
    setSelectedTo(null);
    setHintUsed(false);
    setIsCorrect(null);
    setCorrectSan('');
    setAnimatingFen(null);

    // Compute the SAN line to display (first 2*L moves)
    setSanLine([]);
  }, []);

  useEffect(() => {
    if (isDemo) {
      const p = DEMO_BLIND;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadPuzzle(p);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('empty');
    }
  }, [isDemo, loadPuzzle]);

  // ── Intro animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'intro' || !puzzle) return;
    const t = setTimeout(() => {
      setBoardFen(puzzle.fen);
      // Compute san line for 2*L moves
      const L = level;
      const line = computeSanLine(puzzle.fen, puzzle.solution, 2 * L);
      setSanLine(line);
      setPhase('thinking');
    }, 400);
    return () => clearTimeout(t);
  }, [phase, puzzle, level]);

  // ── Handle square click for 2-click move ────────────────────────────────────
  const handleSquareClick = useCallback((sq: Square) => {
    if (phase !== 'thinking' || !puzzle) return;

    if (!selectedFrom) {
      setSelectedFrom(sq);
    } else {
      if (selectedFrom === sq) {
        // Deselect
        setSelectedFrom(null);
        return;
      }
      const to = sq;
      setSelectedTo(to);

      // Compute the expected move: advance 2*L moves in the puzzle, then solution[2*L]
      const L = level;
      const targetMoveUci = puzzle.solution[2 * L];
      if (!targetMoveUci) {
        setSelectedFrom(null);
        setSelectedTo(null);
        return;
      }

      const played = selectedFrom + to;
      const expected = targetMoveUci.slice(0, 4);
      const correct = played === expected;

      setIsCorrect(correct);

      if (correct) {
        setScore(s => ({ correct: s.correct + 1, errors: s.errors, streak: s.streak + 1 }));
        setPhase('answered');

        // Animate all moves: first 2*L moves + the target move
        const allMoves = [...puzzle.solution.slice(0, 2 * L + 1)];
        let currentFen = puzzle.fen;
        allMoves.forEach((uci, i) => {
          setTimeout(() => {
            const c = new Chess(currentFen);
            c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n' });
            const nextFen = c.fen();
            currentFen = nextFen;
            setAnimatingFen(nextFen);
          }, (i + 1) * 900);
        });
      } else {
        setScore(s => ({ correct: s.correct, errors: s.errors + 1, streak: 0 }));
        setPhase('answered');

        // Compute SAN of the correct move
        const c = new Chess(puzzle.fen);
        puzzle.solution.slice(0, 2 * L).forEach(uci => {
          c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n' });
        });
        const r = c.move({ from: targetMoveUci.slice(0, 2), to: targetMoveUci.slice(2, 4), promotion: (targetMoveUci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n' });
        setCorrectSan(r?.san ?? targetMoveUci.slice(0, 4));
      }
    }
  }, [phase, puzzle, selectedFrom, level]);

  // ── Board display FEN ────────────────────────────────────────────────────────
  const displayFen = animatingFen ?? boardFen;

  // ── Rings for selected squares ───────────────────────────────────────────────
  const rings: Partial<Record<Square, string>> = {};
  if (selectedFrom) rings[selectedFrom] = 'rgba(74,144,226,0.8)';
  if (selectedTo && phase === 'answered') rings[selectedTo] = isCorrect ? 'rgba(129,182,76,0.8)' : 'rgba(224,87,74,0.8)';

  // ── Wrong answer arrow ───────────────────────────────────────────────────────
  const arrows: BoardArrow[] = [];
  if (phase === 'answered' && !isCorrect && puzzle) {
    const L = level;
    const targetMoveUci = puzzle.solution[2 * L];
    if (targetMoveUci) {
      arrows.push({
        from: targetMoveUci.slice(0, 2) as Square,
        to: targetMoveUci.slice(2, 4) as Square,
        color: '#81B64C', style: 'dashed', role: 'best',
      });
    }
  }

  // ── Hint: highlight from-square ──────────────────────────────────────────────
  const hintRings: Partial<Record<Square, string>> = { ...rings };
  if (hintUsed && puzzle && phase === 'thinking') {
    const L = level;
    const targetMoveUci = puzzle.solution[2 * L];
    if (targetMoveUci) {
      hintRings[targetMoveUci.slice(0, 2) as Square] = 'rgba(129,182,76,0.6)';
    }
  }

  // ── Hint handler ─────────────────────────────────────────────────────────────
  const showHint = useCallback(() => {
    if (phase !== 'thinking') return;
    setHintUsed(true);
  }, [phase]);

  // ── Show moves handler (reveal sanLine hint) ──────────────────────────────────
  const showMoves = useCallback(() => {
    if (!puzzle) return;
    const L = level;
    const line = computeSanLine(puzzle.fen, puzzle.solution, 2 * L);
    setSanLine(line);
  }, [puzzle, level]);

  // ── Next puzzle ───────────────────────────────────────────────────────────────
  const nextPuzzle = useCallback(() => {
    if (!demoPuzzles.length) return;
    const nextIdx = (puzzleIdx + 1) % demoPuzzles.length;
    setPuzzleIdx(nextIdx);
    loadPuzzle(demoPuzzles[nextIdx]);
  }, [demoPuzzles, puzzleIdx, loadPuzzle]);

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (phase === 'answered') nextPuzzle();
      }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); showHint(); }
      if (e.key === 'Escape') {
        setSelectedFrom(null);
        setSelectedTo(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, nextPuzzle, showHint]);

  const updateLevel = useCallback((l: BlindLevel) => {
    setLevel(l);
    try { localStorage.setItem(BLIND_LEVEL_KEY, String(l)); } catch { /* ignore */ }
  }, []);

  const orientation = puzzle?.solverColor === 'b' ? 'black' : 'white';

  // ── Session panel ─────────────────────────────────────────────────────────────
  const session = (
    <SessionPanel
      title="Вслепую"
      stats={[
        { label: 'верно', value: score.correct, color: '#81B64C' },
        { label: 'ошибок', value: score.errors, color: '#F08277' },
        { label: 'серия', value: score.streak, color: '#F4B45C' },
      ]}
      controls={
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Уровень (ходов в уме)</div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)', padding: 3 }}>
            {([1, 2, 3] as const).map(l => {
              const labels = { 1: '1 ход', 2: '2 хода', 3: '3 хода' };
              const isActive = level === l;
              return (
                <button
                  key={l}
                  onClick={() => updateLevel(l)}
                  style={{
                    flex: 1, padding: '5px 2px', border: 'none',
                    background: isActive ? 'var(--surface)' : 'transparent',
                    color: isActive ? 'var(--ivory)' : 'var(--muted)',
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer', borderRadius: 'var(--radius-btn, 0px)',
                    fontFamily: 'inherit', transition: 'background 0.15s',
                  }}
                >
                  {labels[l]}
                </button>
              );
            })}
          </div>
        </div>
      }
      list={
        <div style={{ padding: '10px 10px' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Задачи из «Тактики»: {demoPuzzles.length} подходят
          </div>
        </div>
      }
    />
  );

  // ── Panel content ─────────────────────────────────────────────────────────────
  const L = level;
  const taskText = puzzle
    ? `Представь эти ходы и найди следующий ход ${puzzle.solverColor === 'w' ? 'белых' : 'чёрных'}. Доска не двигается.`
    : '';

  const panel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div data-ui="panel-header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>
          Тренировка · Расчёт вслепую
        </div>
        <div data-ui="panel-title" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)', marginTop: 2 }}>
          Представь ходы
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Chips */}
        {puzzle && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <MoveChip>{L} {L === 1 ? 'ход' : L < 5 ? 'хода' : 'ходов'} в уме</MoveChip>
            <MoveChip>Рейтинг {puzzle.rating}</MoveChip>
          </div>
        )}

        {/* Move line */}
        {sanLine.length > 0 && (
          <div data-ui="blind-line" style={{
            padding: '12px 14px', background: 'var(--surface-2)',
            border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)',
          }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
              Ходы для расчёта:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 15, fontWeight: 600 }}>
              {sanLine.map((san, i) => {
                const isWhite = puzzle && (puzzle.fen.split(' ')[1] === 'b' ? i % 2 === 0 : i % 2 === 1);
                return (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {isWhite !== undefined && i % 2 === 0 && (
                      <span style={{ fontSize: 13, color: 'var(--faint)', fontWeight: 400 }}>
                        {/* move number */}
                      </span>
                    )}
                    <MoveChip>{san}</MoveChip>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Task description */}
        {phase === 'thinking' && (
          <div data-ui="blind-task" style={{
            padding: '12px 14px', background: 'var(--surface-2)',
            border: '1px solid var(--accent)', borderRadius: 'var(--radius-card, 0px)',
            fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5,
          }}>
            {taskText}
            {selectedFrom && (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                Выбрана клетка: <strong style={{ color: 'var(--ivory)' }}>{selectedFrom}</strong>. Теперь кликни целевую клетку.
              </div>
            )}
          </div>
        )}

        {/* Feedback */}
        {phase === 'answered' && isCorrect && (
          <div data-ui="blind-feedback" data-result="ok">
            <FeedbackCard variant="success" title="Верно, ты увидел позицию">
              Расчёт на {L} {L === 1 ? 'ход' : L < 5 ? 'хода' : 'ходов'} правильный
            </FeedbackCard>
          </div>
        )}
        {phase === 'answered' && !isCorrect && (
          <div data-ui="blind-feedback" data-result="fail">
            <FeedbackCard variant="danger" title={`Не то. Здесь ${correctSan}`}>
              Правильный ход выделен стрелкой
            </FeedbackCard>
          </div>
        )}

        {/* Empty state */}
        {phase === 'empty' && (
          <div style={{ padding: '20px 0', fontSize: 15, color: 'var(--muted)', textAlign: 'center' }}>
            Нет задач для тренировки вслепую
          </div>
        )}
      </div>

      {/* Actions */}
      <div data-ui="panel-actions" style={{ padding: '14px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={showHint}
          disabled={phase !== 'thinking' || hintUsed}
          style={{
            padding: '8px 14px', background: 'transparent',
            border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 0px)',
            color: phase !== 'thinking' || hintUsed ? 'var(--faint)' : 'var(--ivory)',
            fontSize: 13, cursor: phase !== 'thinking' || hintUsed ? 'default' : 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Подсказка <Kbd>H</Kbd>
        </button>
        <button
          onClick={showMoves}
          style={{
            padding: '8px 14px', background: 'transparent',
            border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 0px)',
            color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Показать ходы
        </button>
        <button
          onClick={nextPuzzle}
          style={{
            padding: '8px 14px', marginLeft: 'auto',
            background: phase === 'answered' ? 'var(--accent)' : 'var(--surface-2)',
            border: `1px solid ${phase === 'answered' ? 'transparent' : 'var(--hairline)'}`,
            borderRadius: 'var(--radius-btn, 0px)',
            color: phase === 'answered' ? '#fff' : 'var(--ivory)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Дальше <Kbd>Space</Kbd>
        </button>
      </div>
    </div>
  );

  return (
    <TrainerLayout
      session={session}
      topBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>
        {puzzle ? `Задача ${puzzleIdx + 1}` : 'Расчёт вслепую'}
      </span>}
      board={
        <Board
          fen={displayFen}
          size={S}
          orientation={orientation}
          interactive={false}
          onSquareClick={phase === 'thinking' ? handleSquareClick : undefined}
          rings={hintRings}
          arrows={arrows}
        />
      }
      bottomBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>
        Кликни две клетки чтобы сделать ход
      </span>}
      panel={panel}
      panelAttrs={isDemo ? { 'data-demo': 'blind' } : {}}
    />
  );
}

// ── Suspense wrapper ──────────────────────────────────────────────────────────

export function BlindPage() {
  return (
    <Suspense fallback={null}>
      <BlindPageInner />
    </Suspense>
  );
}

export default BlindPage;
