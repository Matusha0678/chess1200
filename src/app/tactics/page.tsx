'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
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
import { DEMO_TACTICS } from '@/lib/demo-positions';
import type { ParsedPuzzle } from '@/lib/lichess-puzzles';

// ── Theme names ───────────────────────────────────────────────────────────────

const THEME_NAMES: Record<string, string> = {
  fork: 'Вилка',
  endgame: 'Эндшпиль',
  hangingPiece: 'Незащищённая фигура',
  advancedPawn: 'Проходная пешка',
  crushing: 'Решающее преимущество',
  promotion: 'Превращение',
  discoveredAttack: 'Вскрытое нападение',
  long: 'Длинная задача',
  mateIn1: 'Мат в 1',
  mateIn2: 'Мат в 2',
  mateIn3: 'Мат в 3',
  mix: 'Смесь',
  pin: 'Связка',
  skewer: 'Сквозной удар',
};

function themeRu(t: string): string {
  return THEME_NAMES[t] ?? t;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PuzzlePhase = 'loading' | 'intro' | 'solving' | 'correct' | 'wrong' | 'empty';

interface SessionScore {
  solved: number;
  errors: number;
  streak: number;
}

type SectionKey = 'themes' | 'weak' | 'mates' | 'woodpecker';

const SECTION_ITEMS: { key: SectionKey; label: string }[] = [
  { key: 'themes', label: 'По темам' },
  { key: 'weak', label: 'Мои слабые темы' },
  { key: 'mates', label: 'Маты' },
  { key: 'woodpecker', label: 'Метод дятла' },
];

// ── Main page inner ───────────────────────────────────────────────────────────

function TacticsPageInner() {
  const { S } = useTrainerGeometry();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === '1';

  const [puzzles, setPuzzles] = useState<ParsedPuzzle[]>([]);
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [moveIdx, setMoveIdx] = useState(0); // which solution move we're on (0-based, solver's moves are 0,2,4...)
  const [phase, setPhase] = useState<PuzzlePhase>('loading');
  const [boardFen, setBoardFen] = useState('start');
  const [score, setScore] = useState<SessionScore>({ solved: 0, errors: 0, streak: 0 });
  const [wrongArrow, setWrongArrow] = useState<BoardArrow | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [timer, setTimer] = useState(0);
  const [section, setSection] = useState<SectionKey>('themes');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Current puzzle
  const puzzle = puzzles[puzzleIdx] ?? null;

  // ── Load puzzles ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isDemo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPuzzles(DEMO_TACTICS);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPuzzleIdx(0);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMoveIdx(0);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('intro');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBoardFen(DEMO_TACTICS[0]?.fenStart ?? 'start');
      return;
    }
    // Real mode: would load from DB
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('empty');
  }, [isDemo]);

  // ── Intro animation: 400ms after mount, animate lastMove ───────────────────
  useEffect(() => {
    if (phase !== 'intro' || !puzzle) return;
    const t = setTimeout(() => {
      setBoardFen(puzzle.fen);
      setPhase('solving');
      setTimer(0);
      setWrongArrow(null);
      setHintUsed(false);
    }, 400);
    return () => clearTimeout(t);
  }, [phase, puzzle]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'solving') {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Handle move ─────────────────────────────────────────────────────────────
  const handleMove = useCallback((m: { from: Square; to: Square; promotion?: string }) => {
    if (phase !== 'solving' || !puzzle) return false;
    const solverMoveIdx = moveIdx; // 0,2,4... (solver moves at even positions)
    const expected = puzzle.solution[solverMoveIdx];
    if (!expected) return false;

    const played = m.from + m.to + (m.promotion ?? '');
    const isCorrect = played.slice(0, 4) === expected.slice(0, 4);

    if (isCorrect) {
      // Play the solver's move on a Chess instance to update board
      const c = new Chess(boardFen);
      c.move({ from: m.from, to: m.to, promotion: (m.promotion ?? 'q') as 'q' | 'r' | 'b' | 'n' });
      const afterSolverFen = c.fen();

      const nextSolverIdx = solverMoveIdx + 2;
      const oppMoveUci = puzzle.solution[solverMoveIdx + 1];

      if (!oppMoveUci) {
        // Puzzle solved!
        setBoardFen(afterSolverFen);
        setPhase('correct');
        setScore(s => ({ solved: s.solved + 1, errors: s.errors, streak: s.streak + 1 }));
        return true;
      }

      // Play opponent response
      setTimeout(() => {
        const c2 = new Chess(afterSolverFen);
        c2.move({ from: oppMoveUci.slice(0, 2), to: oppMoveUci.slice(2, 4), promotion: (oppMoveUci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n' });
        setBoardFen(c2.fen());
        setMoveIdx(nextSolverIdx);
        setWrongArrow(null);
      }, 300);

      setBoardFen(afterSolverFen);
      return true;
    } else {
      // Wrong move
      const correctUci = expected;
      setWrongArrow({
        from: correctUci.slice(0, 2) as Square,
        to: correctUci.slice(2, 4) as Square,
        color: 'var(--accent)', style: 'dashed', role: 'best',
      });
      setPhase('wrong');
      setScore(s => ({ solved: s.solved, errors: s.errors + 1, streak: 0 }));
      return false;
    }
  }, [phase, puzzle, moveIdx, boardFen]);

  // ── Next puzzle ─────────────────────────────────────────────────────────────
  const nextPuzzle = useCallback(() => {
    if (!puzzles.length) return;
    const nextIdx = (puzzleIdx + 1) % puzzles.length;
    const nextPuzzle = puzzles[nextIdx];
    setPuzzleIdx(nextIdx);
    setMoveIdx(0);
    setBoardFen(nextPuzzle.fenStart);
    setPhase('intro');
    setWrongArrow(null);
  }, [puzzles, puzzleIdx]);

  // ── Hint ─────────────────────────────────────────────────────────────────────
  const showHint = useCallback(() => {
    if (!puzzle || phase !== 'solving') return;
    const correctUci = puzzle.solution[moveIdx];
    if (!correctUci) return;
    setHintUsed(true);
    setWrongArrow({
      from: correctUci.slice(0, 2) as Square,
      to: correctUci.slice(2, 4) as Square,
      color: 'var(--accent)', style: 'dashed', role: 'best',
    });
  }, [puzzle, phase, moveIdx]);

  // ── Show solution ─────────────────────────────────────────────────────────────
  const showSolution = useCallback(() => {
    if (!puzzle) return;
    setPhase('wrong');
    setScore(s => ({ solved: s.solved, errors: s.errors + 1, streak: 0 }));
    const correctUci = puzzle.solution[moveIdx];
    if (correctUci) {
      setWrongArrow({
        from: correctUci.slice(0, 2) as Square,
        to: correctUci.slice(2, 4) as Square,
        color: 'var(--accent)', style: 'dashed', role: 'best',
      });
    }
  }, [puzzle, moveIdx]);

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (phase === 'correct' || phase === 'wrong') nextPuzzle();
      }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); showHint(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, nextPuzzle, showHint]);

  // ── Board orientation and interactivity ───────────────────────────────────────
  const orientation = puzzle?.solverColor === 'b' ? 'black' : 'white';
  const isInteractive = phase === 'solving';

  // Last move highlight
  const lastMoveArrow: BoardArrow | null = puzzle && phase !== 'intro' ? {
    from: puzzle.lastMoveUci.slice(0, 2) as Square,
    to: puzzle.lastMoveUci.slice(2, 4) as Square,
    color: 'rgba(205,160,40,0.6)', style: 'solid', role: 'played',
  } : null;

  const arrows: BoardArrow[] = [
    ...(lastMoveArrow && phase !== 'solving' ? [lastMoveArrow] : []),
    ...(wrongArrow ? [wrongArrow] : []),
  ];

  // ── Session panel ─────────────────────────────────────────────────────────────
  const session = (
    <SessionPanel
      title="Тактика"
      stats={[
        { label: 'решено', value: score.solved, color: 'var(--accent)' },
        { label: 'ошибок', value: score.errors, color: '#F08277' },
        { label: 'серия', value: score.streak, color: '#F4B45C' },
      ]}
      list={
        SECTION_ITEMS.map(({ key, label }) => {
          const isActive = section === key;
          return (
            <div
              key={key}
              onClick={() => setSection(key)}
              style={{
                padding: '10px 10px', cursor: 'pointer', borderRadius: 6,
                background: isActive ? 'var(--surface-2)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                fontSize: 14, color: isActive ? 'var(--ivory)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 400, transition: 'background 0.15s',
              }}
            >
              {label}
            </div>
          );
        })
      }
      footer={puzzle && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Тема: {puzzle.themes.slice(0, 2).map(themeRu).join(', ')}
        </div>
      )}
    />
  );

  // ── Panel content ─────────────────────────────────────────────────────────────
  const themeChips = puzzle?.themes.slice(0, 3).map(themeRu) ?? [];
  const isMate = puzzle?.themes.some(t => t.startsWith('mateIn')) ?? false;
  const panelTitle = isMate
    ? (puzzle?.themes.find(t => t.startsWith('mateIn')) ? themeRu(puzzle!.themes.find(t => t.startsWith('mateIn'))!) : 'Мат')
    : 'Найди лучший ход';

  const panel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div data-ui="panel-header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>
          Тренировка · Тактика
        </div>
        <div data-ui="panel-title" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)', marginTop: 2 }}>
          {phase === 'empty' ? 'Загрузи задачи' : panelTitle}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Theme chips */}
        {puzzle && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {themeChips.map(t => (
              <MoveChip key={t}>{t}</MoveChip>
            ))}
            <MoveChip>Рейтинг {puzzle.rating}</MoveChip>
            <MoveChip>{puzzle.solverColor === 'w' ? 'Ход белых' : 'Ход чёрных'}</MoveChip>
          </div>
        )}

        {/* Timer */}
        {phase === 'solving' && (
          <div style={{ fontSize: 13, color: 'var(--faint)', fontVariantNumeric: 'tabular-nums' }}>
            {timer} сек
          </div>
        )}

        {/* Feedback */}
        {phase === 'correct' && (
          <div data-ui="tactics-feedback" data-result="ok">
            <FeedbackCard variant="success" title="Решено!">
              {hintUsed ? 'Правильно, но с подсказкой' : `Время: ${timer} сек`}
            </FeedbackCard>
          </div>
        )}
        {phase === 'wrong' && (
          <div data-ui="tactics-feedback" data-result="fail">
            <FeedbackCard variant="danger" title="Не то">
              Правильный ход выделен стрелкой
            </FeedbackCard>
          </div>
        )}

        {/* Empty state */}
        {phase === 'empty' && (
          <div data-ui="tactics-empty" style={{ padding: '20px 0', fontSize: 15, color: 'var(--muted)', textAlign: 'center' }}>
            <button style={{
              padding: '10px 20px', background: 'var(--accent)', border: 'none',
              borderRadius: 'var(--radius-btn, 0px)', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Загрузи задачи
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div data-ui="panel-actions" style={{ padding: '14px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={showHint}
          disabled={phase !== 'solving' || hintUsed}
          style={{
            padding: '8px 14px', background: 'transparent',
            border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 0px)',
            color: phase !== 'solving' || hintUsed ? 'var(--faint)' : 'var(--ivory)',
            fontSize: 13, cursor: phase !== 'solving' || hintUsed ? 'default' : 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Подсказка <Kbd>H</Kbd>
        </button>
        <button
          onClick={showSolution}
          disabled={phase !== 'solving'}
          style={{
            padding: '8px 14px', background: 'transparent',
            border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 0px)',
            color: phase !== 'solving' ? 'var(--faint)' : 'var(--muted)',
            fontSize: 13, cursor: phase !== 'solving' ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Показать решение
        </button>
        <button
          onClick={nextPuzzle}
          style={{
            padding: '8px 14px', marginLeft: 'auto',
            background: phase === 'correct' ? 'var(--accent)' : 'var(--surface-2)',
            border: `1px solid ${phase === 'correct' ? 'transparent' : 'var(--hairline)'}`,
            borderRadius: 'var(--radius-btn, 0px)',
            color: phase === 'correct' ? '#fff' : 'var(--ivory)',
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
        {puzzle ? `Задача ${puzzleIdx + 1} / ${puzzles.length}` : 'Тактика'}
      </span>}
      board={
        <Board
          fen={boardFen}
          size={S}
          orientation={orientation}
          interactive={isInteractive}
          movableColor={puzzle?.solverColor}
          onMove={handleMove}
          arrows={arrows}
        />
      }
      bottomBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>
        {orientation === 'white' ? 'Ход белых' : 'Ход чёрных'}
      </span>}
      panel={panel}
      panelAttrs={isDemo ? { 'data-demo': 'tactics' } : {}}
    />
  );
}

// ── Suspense wrapper ──────────────────────────────────────────────────────────

export function TacticsPage() {
  return (
    <Suspense fallback={null}>
      <TacticsPageInner />
    </Suspense>
  );
}

export default TacticsPage;
