'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { TaskPanel } from '@/components/trainer/TaskPanel';
import { Board } from '@/components/board/Board';
import { LessonTest } from '@/components/LessonTest';
import { ExplainMode } from '@/components/ExplainMode';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { supabase } from '@/lib/supabase';
import { CourseSidebar } from '@/components/course/CourseSidebar';
import { LinePanel } from '@/components/course/LinePanel';
import { PlayPanel } from '@/components/course/PlayPanel';
import { QuizPanel } from '@/components/course/QuizPanel';
import { SummaryPanel } from '@/components/course/SummaryPanel';
import {
  buildSteps, lessonLines, stepFen,
  boardMarks, moveLabel, sanNo,
  playStart, playMove, playHint, progressAfterRun,
  type LessonStep, type LessonLine, type LessonMove,
  type LessonStepLine,
  type PlayState, type QuizItem,
} from '@/lib/lesson';
import type { BoardArrow } from '@/components/board/Board';
import type { BadgeKind } from '@/components/ClassIcon';
import type { Square } from 'chess.js';
import type { CourseLessonMove, CourseLesson } from '@/types/courses';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface LessonMeta {
  id: string;
  lesson_order: number;
  title: string;
  linesCount?: number;
  steps?: LessonStep[];
}

interface LessonNote {
  id: string;
  lesson_id: string;
  line_order: number;
  ply: number;
  body: string;
  kind: 'note' | 'confused';
}

interface QuizResult {
  itemIdx: number;
  result: 'ok' | 'fail' | 'skip';
}

interface Props {
  courseId: string;
  lessonId: string;
  isDemo: boolean;
  course: { id: string; name: string; color: 'white' | 'black' | 'both' };
  allLessons: LessonMeta[];
  lesson: {
    id: string; title: string; goal?: string;
    blocks?: unknown[]; summary?: string; plan?: string; mistakes?: string; trap?: string;
  };
  lines: LessonLine[];
  questions: QuizItem[];
  lessonProgress: Record<string, { completed: boolean; guess_total?: number; guess_correct?: number }>;
  lessonTests: Record<string, { score: number; max: number }>;
  lessonNotes: LessonNote[];
  deviationLog: unknown[];
  confusedCount: number;
  initialStep?: number;
  initialPly?: number;
  initialMode?: 'watch' | 'play';
}

function simpleMarkdown(md: string): React.ReactNode {
  return md.split('\n').map((line, i) => {
    if (line.startsWith('- ')) return <li key={i} style={{ marginLeft: 16 }} dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />;
    if (line.trim() === '') return <br key={i} />;
    return <p key={i} style={{ margin: '4px 0' }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />;
  });
}

function getCheckSquare(fen: string): Square | null {
  try {
    const c = new Chess(fen);
    if (!c.isCheck()) return null;
    const turn = c.turn();
    const board = c.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === 'k' && p.color === turn) {
          return `${String.fromCharCode(97 + f)}${8 - r}` as Square;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function LessonPage({
  courseId, lessonId, isDemo,
  course, allLessons, lesson,
  lines: rawLines, questions,
  lessonProgress, lessonTests, lessonNotes,
  confusedCount,
  initialStep, initialPly, initialMode,
}: Props) {
  const router = useRouter();
  const { boardTheme, customPieces, showNotation } = useBoardTheme();

  // Build steps and lines (stable since they come from props)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps = useMemo(() => buildSteps(lesson as any, rawLines, questions), [lesson, rawLines, questions]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = useMemo(() => lessonLines(lesson as any, rawLines), [lesson, rawLines]);

  // Load done steps from localStorage — ALL HOOKS MUST COME BEFORE ANY RETURNS
  const [doneSteps, setDoneSteps] = useState<Set<number>>(() => {
    if (isDemo) return new Set<number>();
    try {
      const raw = localStorage.getItem(`chess1200-lesson-steps:${lessonId}`);
      if (raw) return new Set(JSON.parse(raw) as number[]);
    } catch { /* ignore */ }
    return new Set<number>();
  });

  const [currentStep, setCurrentStep] = useState(() => initialStep ?? 0);
  const [currentPly, setCurrentPly] = useState(initialPly ?? 0);
  const [mode, setMode] = useState<'watch' | 'play'>(initialMode ?? 'watch');
  const [orientation, setOrientation] = useState<'white' | 'black'>(
    course.color === 'black' ? 'black' : 'white'
  );
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [viewingVariant, setViewingVariant] = useState(false);
  const [variantMoves, setVariantMoves] = useState<LessonMove[]>([]);
  const [variantPly, setVariantPly] = useState(0);
  const [variantFromPly, setVariantFromPly] = useState(0);

  const [playState, setPlayState] = useState<PlayState | null>(null);
  const [playArrows, setPlayArrows] = useState<BoardArrow[]>([]);
  const [playResult, setPlayResult] = useState<'ok' | 'fail' | 'info' | 'done' | null>(null);
  const [lastPlayedMove, setLastPlayedMove] = useState<{ san: string; ply: number } | null>(null);
  const [playedLinesMask, setPlayedLinesMask] = useState<Set<number>>(new Set());

  const [currentQuizIdx, setCurrentQuizIdx] = useState(0);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [quizFen, setQuizFen] = useState<string | null>(null);
  const [quizArrows, setQuizArrows] = useState<BoardArrow[]>([]);

  const [sessionQuizCorrect, setSessionQuizCorrect] = useState(0);
  const [sessionQuizTotal, setSessionQuizTotal] = useState(0);
  const [sessionPlayFirstTry, setSessionPlayFirstTry] = useState(0);
  const [sessionPlayTotal, setSessionPlayTotal] = useState(0);
  const [sessionLinesDone, setSessionLinesDone] = useState<Set<number>>(new Set());

  const [notes, setNotes] = useState<LessonNote[]>(lessonNotes);
  const [showTest, setShowTest] = useState(false);
  const [showExplain, setShowExplain] = useState(false);

  // Derived: safe step index clamped to valid range
  const safeStepIdx = Math.min(Math.max(currentStep, 0), steps.length - 1);
  const step = steps[safeStepIdx] ?? steps[0];

  // Current line index (0 if not a line step)
  const lineIdx = step?.kind === 'line' ? (step as LessonStepLine).line : 0;
  const currentLine: LessonLine = lines[lineIdx] ?? { moves: [], intro_md: '', outro_md: '', start_fen: null };

  const nextStepTitle: string | null = safeStepIdx < steps.length - 1 ? steps[safeStepIdx + 1].title : null;
  const movableColor = course.color === 'black' ? 'b' : 'w';

  // Mark step done
  const markStepDone = useCallback((stepNum: number) => {
    setDoneSteps(prev => {
      const next = new Set(prev);
      next.add(stepNum);
      if (!isDemo) {
        try { localStorage.setItem(`chess1200-lesson-steps:${lessonId}`, JSON.stringify([...next])); } catch { /* ignore */ }
      }
      return next;
    });
  }, [isDemo, lessonId]);

  // Auto-play stop
  const stopAutoPlay = useCallback(() => {
    setIsAutoPlaying(false);
    if (autoPlayTimerRef.current) { clearTimeout(autoPlayTimerRef.current); autoPlayTimerRef.current = null; }
  }, []);

  const startAutoPlay = useCallback(() => {
    if (!step || step.kind !== 'line') return;
    setIsAutoPlaying(true);
  }, [step]);

  // Navigate to step
  const goToStep = useCallback((stepIdx: number) => {
    setCurrentStep(stepIdx);
    setCurrentPly(0);
    setMode('watch');
    setViewingVariant(false);
    setVariantMoves([]);
    setVariantPly(0);
    setPlayState(null);
    setPlayArrows([]);
    setPlayResult(null);
    setIsAutoPlaying(false);
    setCurrentQuizIdx(0);
    setQuizResults([]);
    setQuizFen(null);
    setQuizArrows([]);
    router.replace(`?step=${stepIdx + 1}`, { scroll: false });
  }, [router]);

  const goToNextStep = useCallback(() => {
    markStepDone(safeStepIdx + 1);
    if (safeStepIdx < steps.length - 1) goToStep(safeStepIdx + 1);
  }, [safeStepIdx, steps.length, goToStep, markStepDone]);

  // Auto-play effect
  useEffect(() => {
    if (!isAutoPlaying || !step || step.kind !== 'line' || viewingVariant) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsAutoPlaying(false);
      return;
    }
    const moves = currentLine.moves;
    if (currentPly >= moves.length) { setIsAutoPlaying(false); return; }
    const m = moves[currentPly];
    const commentLen = m?.comment?.length ?? 0;
    const delay = Math.min(1100 + 22 * commentLen, 2200);
    const timer = setTimeout(() => {
      setCurrentPly(p => {
        const next = p + 1;
        if (next >= moves.length) setIsAutoPlaying(false);
        return next;
      });
    }, delay);
    autoPlayTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [isAutoPlaying, currentPly, currentLine.moves, step, viewingVariant]);

  // Start play mode
  const handleStartPlay = useCallback(() => {
    const st = playStart(currentLine, movableColor);
    setPlayState(st);
    setPlayArrows([]);
    setPlayResult('info');
    setLastPlayedMove(null);
    setMode('play');
    setCurrentPly(0);
    setViewingVariant(false);
  }, [currentLine, movableColor]);

  // Handle board move in play mode
  const handlePlayMove = useCallback(async (m: { from: Square; to: Square }) => {
    if (!playState || mode !== 'play') return false;
    const r = playMove(playState, currentLine, m.from, m.to);
    if (r.result === 'none') return false;

    if (r.result === 'ok') {
      if (r.played) setLastPlayedMove({ san: r.played.san, ply: playState.ply + 1 });
      setPlayResult('ok');
      setPlayArrows([]);
      setPlayState(r.st);

      if (r.st.done) {
        setPlayResult('done');
        setSessionPlayFirstTry(prev => prev + r.st.firstTry);
        setSessionPlayTotal(prev => prev + r.st.mine);
        setSessionLinesDone(prev => { const n = new Set(prev); n.add(lineIdx); return n; });

        if (!isDemo) {
          const allLineIdxs = steps.filter(s => s.kind === 'line').map(s => (s as LessonStepLine).line);
          const nextPlayedMask = new Set(playedLinesMask);
          nextPlayedMask.add(lineIdx);
          const allPlayed = allLineIdxs.every(i => nextPlayedMask.has(i));
          setPlayedLinesMask(nextPlayedMask);

          const prev = lessonProgress[lessonId];
          const updated = progressAfterRun(prev ?? null, r.st, allPlayed);
          try {
            await supabase.from('lesson_progress').upsert({
              lesson_id: lessonId, ...updated,
              completed_at: updated.completed ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'lesson_id' });
          } catch { /* ignore */ }
        }
      } else {
        setTimeout(() => setPlayResult('info'), 400);
      }
      return true;
    } else {
      setPlayResult('fail');
      setPlayArrows(r.arrows as BoardArrow[]);
      setPlayState(r.st);
      setLastPlayedMove({ san: m.from + m.to, ply: playState.ply + 1 });
      return false;
    }
  }, [playState, mode, currentLine, lineIdx, steps, playedLinesMask, lessonId, isDemo, lessonProgress]);


  // Add note
  const handleNoteAdd = useCallback(async (ply: number, lineOrder: number, body: string) => {
    const note: LessonNote = { id: `note-${Date.now()}`, lesson_id: lessonId, line_order: lineOrder, ply, body, kind: 'note' };
    setNotes(prev => [...prev, note]);
    if (!isDemo) {
      try { await supabase.from('lesson_notes').insert({ lesson_id: lessonId, line_order: lineOrder, ply, body, kind: 'note', resolved: false }); } catch { /* ignore */ }
    }
  }, [isDemo, lessonId]);

  const handleConfusedAdd = useCallback(async (ply: number, lineOrder: number) => {
    const note: LessonNote = { id: `confused-${Date.now()}`, lesson_id: lessonId, line_order: lineOrder, ply, body: '(не понял)', kind: 'confused' };
    setNotes(prev => [...prev, note]);
    if (!isDemo) {
      try { await supabase.from('lesson_notes').insert({ lesson_id: lessonId, line_order: lineOrder, ply, body: '(не понял)', kind: 'confused', resolved: false }); } catch { /* ignore */ }
    }
  }, [isDemo, lessonId]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const isLine = step?.kind === 'line';

      if (isLine || mode === 'play') {
        if (e.key === 'ArrowLeft' || e.key === 'z' || e.key === 'Z') {
          e.preventDefault(); stopAutoPlay();
          if (viewingVariant) setVariantPly(p => Math.max(0, p - 1));
          else setCurrentPly(p => Math.max(0, p - 1));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault(); stopAutoPlay();
          if (viewingVariant) setVariantPly(p => Math.min(variantMoves.length, p + 1));
          else setCurrentPly(p => Math.min(currentLine.moves.length, p + 1));
        } else if (e.key === 'Home') {
          e.preventDefault(); stopAutoPlay();
          if (viewingVariant) setVariantPly(0); else setCurrentPly(0);
        } else if (e.key === 'End') {
          e.preventDefault(); stopAutoPlay();
          if (viewingVariant) setVariantPly(variantMoves.length); else setCurrentPly(currentLine.moves.length);
        } else if (e.key === ' ') {
          e.preventDefault();
          if (mode !== 'play') { if (isAutoPlaying) { stopAutoPlay(); } else { startAutoPlay(); } }
        } else if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          if (viewingVariant) {
            setViewingVariant(false); setVariantMoves([]); setVariantPly(0);
          } else if (isLine && currentPly > 0) {
            const m = currentLine.moves[currentPly - 1];
            if (m?.variations?.length) {
              setVariantMoves(m.variations[0]);
              setVariantFromPly(currentPly);
              setVariantPly(0);
              setViewingVariant(true);
            }
          }
        }
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setOrientation(o => o === 'white' ? 'black' : 'white');
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (viewingVariant) { setViewingVariant(false); setVariantMoves([]); setVariantPly(0); }
        else if (mode === 'play') { setMode('watch'); setPlayState(null); setPlayArrows([]); setPlayResult(null); }
      }

      if (mode === 'play' && playState) {
        if (e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          const r = playHint(playState, currentLine);
          setPlayState(r.st); setPlayArrows(r.arrows as BoardArrow[]);
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          const st = playStart(currentLine, movableColor);
          setPlayState(st); setPlayArrows([]); setPlayResult('info'); setLastPlayedMove(null);
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (isLine && currentPly >= currentLine.moves.length && nextStepTitle) goToNextStep();
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (safeStepIdx > 0) goToStep(safeStepIdx - 1);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [step, mode, viewingVariant, currentPly, variantMoves, currentLine, variantPly, isAutoPlaying,
    playState, movableColor, nextStepTitle, goToNextStep, goToStep, safeStepIdx, stopAutoPlay, startAutoPlay]);

  // Guard — should not happen since steps always has at least summary
  if (!step) return null;

  // Current FEN
  const fen = (() => {
    if (mode === 'play' && playState) {
      const ply = playState.ply;
      if (ply === 0) return currentLine.start_fen ?? START_FEN;
      return currentLine.moves[ply - 1]?.fen ?? currentLine.start_fen ?? START_FEN;
    }
    if (step.kind === 'line') {
      if (viewingVariant) {
        const baseFen = variantFromPly <= 1 ? (currentLine.start_fen ?? START_FEN) : (currentLine.moves[variantFromPly - 2]?.fen ?? currentLine.start_fen ?? START_FEN);
        if (variantPly === 0) return baseFen;
        return variantMoves[variantPly - 1]?.fen ?? baseFen;
      }
      if (currentPly === 0) return currentLine.start_fen ?? START_FEN;
      return currentLine.moves[currentPly - 1]?.fen ?? currentLine.start_fen ?? START_FEN;
    }
    if ((step.kind === 'quiz' || step.kind === 'idea') && quizFen) return quizFen;
    return stepFen(steps, safeStepIdx, lines);
  })();

  // Board marks
  const marks = (() => {
    if (mode === 'play') {
      return { arrows: playArrows as BoardArrow[], tints: {} as Partial<Record<Square, string>>, badges: {} as Partial<Record<Square, BadgeKind>>, lastMove: null };
    }
    if (step.kind === 'quiz' || step.kind === 'idea') {
      return { arrows: quizArrows, tints: {} as Partial<Record<Square, string>>, badges: {} as Partial<Record<Square, BadgeKind>>, lastMove: null };
    }
    if (step.kind !== 'line') {
      return { arrows: [] as BoardArrow[], tints: {} as Partial<Record<Square, string>>, badges: {} as Partial<Record<Square, BadgeKind>>, lastMove: null };
    }
    const mv = viewingVariant
      ? (variantPly > 0 ? variantMoves[variantPly - 1] : null)
      : (currentPly > 0 ? currentLine.moves[currentPly - 1] : null);
    const bm = boardMarks(mv as CourseLessonMove | null);
    return {
      arrows: bm.arrows as BoardArrow[],
      tints: bm.tints as Partial<Record<Square, string>>,
      badges: bm.badges as Partial<Record<Square, BadgeKind>>,
      lastMove: bm.lastMove as { from: Square; to: Square } | null,
    };
  })();

  const checkSquare = getCheckSquare(fen);

  // Board settings
  const isInteractive = mode === 'play' && !!playState && !playState.done;
  const boardSize = typeof window !== 'undefined'
    ? Math.min(Math.floor((window.innerHeight - 56 - 40 - 64) / 8) * 8, 760)
    : 560;

  // Top/bottom bar labels
  const isBlackBottom = orientation === 'black';
  const topPlayerColor = isBlackBottom ? 'w' : 'b';
  const topLabel = topPlayerColor === 'w' ? 'Белые' : 'Чёрные';

  let topBarRight = '';
  if (step.kind === 'line' && currentPly > 0 && !viewingVariant) {
    const m = currentLine.moves[currentPly - 1];
    if (m) {
      const lbl = moveLabel(m as CourseLessonMove);
      topBarRight = `после ${sanNo(currentLine.start_fen ?? null, currentPly, m.san)}${lbl ? ` ${lbl}` : ''} · ход ${m.color === 'w' ? 'белых' : 'чёрных'}`;
    }
  } else if (currentPly === 0 && step.kind === 'line') {
    topBarRight = 'начальная позиция';
  }

  // Enrich allLessons with steps
  const enrichedLessons = allLessons.map(l => {
    const lSteps = l.id === lessonId ? steps : (l.steps ?? []);
    const lineSteps = lSteps.filter(s => s.kind === 'line');
    return { ...l, linesCount: lineSteps.length || 1, steps: lSteps };
  });

  // Stepper
  const stepperEl = (
    <div data-ui="lesson-stepper" style={{ display: 'flex', gap: 3, marginTop: 10 }}>
      {steps.map((s, i) => {
        const done = doneSteps.has(i + 1);
        const isCur = i === safeStepIdx;
        return (
          <div key={i} title={s.title} onClick={() => goToStep(i)} style={{
            flex: 1, height: 4, borderRadius: 2, cursor: 'pointer',
            background: done ? 'var(--accent)' : isCur ? 'var(--ivory)' : 'var(--track, #2A2A2A)',
            border: isCur ? '1px solid var(--ivory)' : '1px solid transparent',
            transition: 'background 0.2s',
          }} />
        );
      })}
    </div>
  );

  const breadcrumb = `Урок ${(allLessons.findIndex(l => l.id === lessonId) + 1) || 1} · ${lesson.title}`;
  const stepChip = (
    <span style={{ fontSize: 13, padding: '3px 8px', background: 'var(--track, #2A2A2A)', color: 'var(--muted)', borderRadius: 4 }}>
      шаг {safeStepIdx + 1} из {steps.length}
    </span>
  );

  // Render right panel based on step kind
  function renderPanel(): React.ReactNode {
    if (mode === 'play' && playState) {
      return (
        <TaskPanel breadcrumb={breadcrumb} titleSize={26}
          title={playResult === 'ok' ? 'Верно' : playResult === 'fail' ? 'Не тот ход' : playResult === 'done' ? 'Линия сыграна' : 'Твой ход'}
          progressBar={stepperEl} actions={null}
        >
          <PlayPanel
            line={currentLine} lineIdx={lineIdx} totalLines={lines.length}
            playState={playState} lastResult={playResult} lastPlayedMove={lastPlayedMove}
            onHint={() => { const r = playHint(playState, currentLine); setPlayState(r.st); setPlayArrows(r.arrows as BoardArrow[]); }}
            onRestart={() => { const st = playStart(currentLine, movableColor); setPlayState(st); setPlayArrows([]); setPlayResult('info'); setLastPlayedMove(null); }}
            onExitPlay={() => { setMode('watch'); setPlayState(null); setPlayArrows([]); setPlayResult(null); }}
            onNextStep={goToNextStep} nextStepTitle={nextStepTitle}
          />
        </TaskPanel>
      );
    }

    if (step.kind === 'line') {
      const hasRichData = currentLine.moves.some(m =>
        (m.arrows?.length ?? 0) > 0 || (m.squares?.length ?? 0) > 0 || (m.nags?.length ?? 0) > 0 || !!m.label
      );
      const lineChip = lines.length > 1 ? (
        <span style={{ fontSize: 13, padding: '3px 8px', background: 'var(--track, #2A2A2A)', color: 'var(--muted)', borderRadius: 4 }}>
          Линия {lineIdx + 1} из {lines.length}
        </span>
      ) : null;
      return (
        <TaskPanel breadcrumb={breadcrumb} title={step.title} titleSize={26} chips={<>{lineChip}{stepChip}</>} progressBar={stepperEl}
          actions={
            <div data-ui="lesson-modes" style={{ display: 'flex', gap: 6 }}>
              <button data-ui="lesson-mode-play" onClick={handleStartPlay} style={{ flex: 1, height: 40, fontSize: 13, background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer', color: 'var(--ivory)' }}>
                Сыграй сам
              </button>
              <button data-ui="lesson-explain" onClick={() => setShowExplain(true)} style={{ flex: 1, height: 40, fontSize: 13, background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer', color: 'var(--ivory)' }}>
                Объясни сам
              </button>
            </div>
          }
        >
          <LinePanel
            line={currentLine} lineIdx={lineIdx} totalLines={lines.length} currentPly={currentPly}
            viewingVariant={viewingVariant} variantMoves={variantMoves} variantPly={variantPly} variantFromPly={variantFromPly}
            notes={notes} isDemo={isDemo}
            onPlyClick={ply => { stopAutoPlay(); setCurrentPly(ply); }}
            onVariantOpen={(m, basePly) => {
              if (m.variations?.length) {
                setVariantMoves(m.variations[0]); setVariantFromPly(basePly); setVariantPly(0); setViewingVariant(true);
              }
            }}
            onVariantClose={() => { setViewingVariant(false); setVariantMoves([]); setVariantPly(0); }}
            onPrev={() => { stopAutoPlay(); if (viewingVariant) setVariantPly(p => Math.max(0, p - 1)); else setCurrentPly(p => Math.max(0, p - 1)); }}
            onNext={() => { stopAutoPlay(); if (viewingVariant) setVariantPly(p => Math.min(variantMoves.length, p + 1)); else setCurrentPly(p => Math.min(currentLine.moves.length, p + 1)); }}
            onPlay={() => isAutoPlaying ? stopAutoPlay() : startAutoPlay()}
            onNextStep={goToNextStep} nextStepTitle={nextStepTitle} isAutoPlaying={isAutoPlaying}
            onNoteAdd={handleNoteAdd} onConfusedAdd={handleConfusedAdd} hasRichData={hasRichData}
          />
        </TaskPanel>
      );
    }

    if (step.kind === 'text') {
      const lineSteps = steps.filter(s => s.kind === 'line');
      return (
        <TaskPanel breadcrumb={breadcrumb} title={step.title} titleSize={26} chips={stepChip} progressBar={stepperEl}
          actions={
            <button data-ui="lesson-next-step" onClick={goToNextStep} style={{ width: '100%', padding: '10px 0', fontSize: 15, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer' }}>
              {nextStepTitle ? `Начать: ${nextStepTitle}` : 'Дальше'}
            </button>
          }
        >
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {lesson.goal && (
              <div style={{ padding: '12px 14px', border: '2px solid var(--accent)', borderRadius: 8, fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5 }}>
                <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Цель</span>
                {lesson.goal}
              </div>
            )}
            {step.md && (
              <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ivory)' }}>{simpleMarkdown(step.md)}</div>
            )}
            {safeStepIdx === 0 && lineSteps.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>В уроке</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {steps.filter(s => s.kind !== 'summary').map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', padding: '4px 0' }}>
                      <span style={{ width: 20, height: 20, background: 'var(--track, #2A2A2A)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{i + 1}</span>
                      {s.title}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TaskPanel>
      );
    }

    if (step.kind === 'plan' || step.kind === 'mistakes' || step.kind === 'trap') {
      const stepFenVal = stepFen(steps, safeStepIdx, lines);
      return (
        <TaskPanel breadcrumb={breadcrumb} title={step.title} titleSize={26} chips={stepChip} progressBar={stepperEl}
          actions={
            <button data-ui="lesson-next-step" onClick={goToNextStep} style={{ width: '100%', padding: '10px 0', fontSize: 15, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer' }}>
              {nextStepTitle ? `Дальше: ${nextStepTitle}` : 'Дальше'}
            </button>
          }
        >
          <div style={{ padding: '20px 24px' }}>
            <div data-ui="lesson-text" style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ivory)' }}>
              {simpleMarkdown(step.md)}
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--muted)' }}>
              На доске — конец линии.{' '}
              <a data-ui="lesson-play-from" href={`/play?fen=${encodeURIComponent(stepFenVal)}&color=${course.color === 'black' ? 'black' : 'white'}`} style={{ color: 'var(--accent, #81B64C)', textDecoration: 'underline' }}>
                Играть отсюда →
              </a>
            </div>
          </div>
        </TaskPanel>
      );
    }

    if (step.kind === 'quiz' || step.kind === 'idea') {
      const quizStep = step as { kind: string; title: string; items: QuizItem[] };
      return (
        <TaskPanel breadcrumb={breadcrumb} title={quizStep.title} titleSize={26} chips={stepChip} progressBar={stepperEl} actions={null}>
          <QuizPanel
            items={quizStep.items} stepTitle={quizStep.title}
            onNextStep={goToNextStep} nextStepTitle={nextStepTitle}
            onBoardArrows={arrows => setQuizArrows(arrows)}
            onQuizFen={f => setQuizFen(f)}
            currentQuizIdx={currentQuizIdx}
            onQuizIdxChange={idx => { setCurrentQuizIdx(idx); setQuizResults([]); setQuizArrows([]); }}
            quizResults={quizResults}
            onQuizResult={result => {
              setQuizResults(prev => {
                const next = [...prev, result];
                if (next.length === quizStep.items.length) markStepDone(safeStepIdx + 1);
                return next;
              });
              setSessionQuizCorrect(c => result.result === 'ok' ? c + 1 : c);
              setSessionQuizTotal(t => t + 1);
            }}
          />
        </TaskPanel>
      );
    }

    if (step.kind === 'summary') {
      if (!doneSteps.has(safeStepIdx + 1)) markStepDone(safeStepIdx + 1);
      const curLessonIdx = allLessons.findIndex(l => l.id === lessonId);
      const nextLesson = curLessonIdx >= 0 ? allLessons[curLessonIdx + 1] : undefined;
      return (
        <TaskPanel breadcrumb={breadcrumb} title="Итог урока" titleSize={26}
          chips={doneSteps.size >= steps.length - 1 ? <span style={{ fontSize: 12, padding: '3px 8px', background: 'rgba(129,182,76,0.12)', color: 'var(--accent)', borderRadius: 4 }}>все шаги пройдены</span> : stepChip}
          progressBar={stepperEl} actions={null}
        >
          <SummaryPanel
            summaryMd={(step as { md: string }).md ?? ''}
            lessonTitle={lesson.title}
            linesTotal={lines.length} linesDone={sessionLinesDone.size}
            quizCorrect={sessionQuizCorrect} quizTotal={sessionQuizTotal}
            playFirstTry={sessionPlayFirstTry} playTotal={sessionPlayTotal}
            testResult={lessonTests[lessonId] ?? null}
            allStepsDone={doneSteps.size >= steps.length - 1}
            onTest={() => setShowTest(true)}
            onNextLesson={() => { if (nextLesson) router.push(`/courses/${courseId}/${nextLesson.id}`); }}
            onPlayFrom={() => { const f = stepFen(steps, safeStepIdx, lines); router.push(`/play?fen=${encodeURIComponent(f)}&color=${course.color === 'black' ? 'black' : 'white'}`); }}
            nextLessonTitle={nextLesson?.title ?? null}
          />
        </TaskPanel>
      );
    }

    return (
      <TaskPanel breadcrumb={breadcrumb} title={step.title} titleSize={26} progressBar={stepperEl} actions={null}>
        <div style={{ padding: 24 }}><span style={{ color: 'var(--muted)' }}>Неизвестный тип шага</span></div>
      </TaskPanel>
    );
  }

  const topBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
      <span>{topLabel}</span>
      {topBarRight && <span>· {topBarRight}</span>}
    </div>
  );

  const bottomBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize: 13, color: 'var(--muted)' }}>
      <span>{(orientation === 'black') === (course.color === 'black') ? 'ты' : 'соперник'}</span>
      {lines.length > 1 && step.kind === 'line' ? (
        <span>Линия {lineIdx + 1} из {lines.length}</span>
      ) : (
        <span>{step.title}</span>
      )}
    </div>
  );

  const boardEl = (
    <Board
      fen={fen} orientation={orientation} size={boardSize}
      interactive={isInteractive} movableColor={movableColor}
      onMove={isInteractive ? handlePlayMove : undefined}
      lastMove={marks.lastMove ?? undefined}
      tints={marks.tints} badges={marks.badges}
      arrows={marks.arrows as BoardArrow[]}
      checkSquare={checkSquare}
    />
  );

  const sidebar = (
    <CourseSidebar
      courseId={courseId} lessonId={lessonId}
      courseName={course.name} courseColor={course.color}
      lessons={enrichedLessons}
      lessonProgress={lessonProgress} lessonTests={lessonTests}
      confusedCount={confusedCount}
      currentStepIdx={safeStepIdx} doneSteps={doneSteps}
      onStepClick={goToStep}
    />
  );

  return (
    <>
      <TrainerLayout
        session={sidebar} topBar={topBar} board={boardEl} bottomBar={bottomBar}
        panel={renderPanel()}
        panelAttrs={isDemo ? { 'data-demo': 'course' } : undefined}
      />

      {showTest && (
        <LessonTest
          lesson={lesson as unknown as CourseLesson}
          moves={currentLine.moves as unknown as CourseLessonMove[]}
          lessonId={lessonId} courseId={courseId}
          nextLesson={allLessons[allLessons.findIndex(l => l.id === lessonId) + 1] as { id: string; title: string } | undefined}
          onClose={() => setShowTest(false)}
          onPassed={() => setShowTest(false)}
        />
      )}

      {showExplain && step.kind === 'line' && (
        <ExplainMode
          moves={currentLine.moves as unknown as CourseLessonMove[]}
          startFen={currentLine.start_fen ?? undefined}
          lessonId={lessonId} boardOrientation={orientation}
          boardTheme={boardTheme} customPieces={customPieces} showNotation={showNotation}
          onClose={() => setShowExplain(false)}
          onDone={() => setShowExplain(false)}
        />
      )}
    </>
  );
}
