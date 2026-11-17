'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { SquareRenderer } from 'react-chessboard';
import Link from 'next/link';
import { playMove, playCapture, playCorrect, playWrong, playComplete } from '@/lib/sounds';
import { LessonTest } from '@/components/LessonTest';
import { DeviationMode } from '@/components/DeviationMode';
import { ExplainMode } from '@/components/ExplainMode';
import { MoveBadge, nagToLabel, ALL_LABELS, LABEL_META } from '@/components/MoveBadge';
import { KeyHelpDialog } from '@/components/KeyHelpDialog';
import type { MoveLabel } from '@/types/courses';
import { supabase } from '@/lib/supabase';
import type {
  CourseLessonMove,
  CourseLesson,
  LessonQuestion,
  SquareMark,
  Arrow,
  QuizItem,
  TestQuestion,
} from '@/types/courses';

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function getEffectiveLabel(m: CourseLessonMove | null | undefined): MoveLabel | null {
  if (!m) return null;
  if (m.label) return m.label;
  return nagToLabel(m.nags?.[0] ?? -1);
}

const MARK_COLORS: Record<string, string> = {
  green:  'rgba(100, 200,  80, 0.55)',
  red:    'rgba(220,  60,  60, 0.50)',
  yellow: 'rgba(220, 180,  40, 0.50)',
  blue:   'rgba(60,  130, 220, 0.50)',
};

const SQ = 100; // viewBox 0 0 800 800, 100 units per square

function squareXY(sq: string, orientation: 'white' | 'black'): [number, number] {
  const fi = sq.charCodeAt(0) - 97;
  const ri = parseInt(sq[1], 10) - 1;
  const x = orientation === 'white' ? fi * SQ + SQ / 2 : (7 - fi) * SQ + SQ / 2;
  const y = orientation === 'white' ? (7 - ri) * SQ + SQ / 2 : ri * SQ + SQ / 2;
  return [x, y];
}

function arrowColor(c?: string): string {
  if (c === 'green')  return 'rgba(80,  200,  80, 0.80)';
  if (c === 'red')    return 'rgba(220,  60,  60, 0.80)';
  if (c === 'yellow') return 'rgba(220, 180,  40, 0.80)';
  if (c === 'blue')   return 'rgba(60,  150, 220, 0.80)';
  return 'rgba(220, 180, 40, 0.80)';
}

function getCheckedKingSquare(fen: string): string | null {
  try {
    const chess = new Chess(fen);
    if (!chess.isCheck()) return null;
    const turn = chess.turn();
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === 'k' && p.color === turn) {
          return `${String.fromCharCode(97 + f)}${8 - r}`;
        }
      }
    }
  } catch { /* invalid fen */ }
  return null;
}

// ── Arrow SVG layer ───────────────────────────────────────────────────────────

interface ArrowLayerProps {
  arrows: Arrow[];
  fadingArrows: Arrow[];
  orientation: 'white' | 'black';
  animKey: number;
  animEnabled: boolean;
}

function ArrowLayer({ arrows, fadingArrows, orientation, animKey, animEnabled }: ArrowLayerProps) {
  if (arrows.length === 0 && fadingArrows.length === 0) return null;

  const SHAFT_W  = 10;
  const HEAD_LEN = 28;
  const HEAD_W   = 22;

  function drawArrow(arrow: Arrow, key: string, grow: boolean) {
    const [x1, y1] = squareXY(arrow.from, orientation);
    const [x2, y2] = squareXY(arrow.to, orientation);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return null;
    const nx = dx / len, ny = dy / len;
    const sx2 = x2 - nx * HEAD_LEN;
    const sy2 = y2 - ny * HEAD_LEN;
    const shaftLen = Math.sqrt((sx2 - x1) ** 2 + (sy2 - y1) ** 2);
    const px = -ny, py = nx;
    const color = arrowColor(arrow.color);

    if (!grow) {
      return (
        <g key={key} style={{ animation: 'arrowFadeOut 0.32s ease-out forwards' }}>
          <line x1={x1} y1={y1} x2={sx2} y2={sy2} stroke={color} strokeWidth={SHAFT_W} strokeLinecap="round" />
          <polygon
            points={`${x2},${y2} ${sx2 + px * HEAD_W / 2},${sy2 + py * HEAD_W / 2} ${sx2 - px * HEAD_W / 2},${sy2 - py * HEAD_W / 2}`}
            fill={color}
          />
        </g>
      );
    }

    const duration = animEnabled ? '0.28s' : '0s';
    return (
      <g key={key}>
        <line
          x1={x1} y1={y1} x2={sx2} y2={sy2}
          stroke={color} strokeWidth={SHAFT_W} strokeLinecap="round"
          style={{
            strokeDasharray: shaftLen,
            strokeDashoffset: animEnabled ? shaftLen : 0,
            animation: animEnabled ? `arrowGrow ${duration} ease-out forwards` : undefined,
          }}
        />
        <polygon
          points={`${x2},${y2} ${sx2 + px * HEAD_W / 2},${sy2 + py * HEAD_W / 2} ${sx2 - px * HEAD_W / 2},${sy2 - py * HEAD_W / 2}`}
          fill={color}
          style={{
            opacity: animEnabled ? 0 : 1,
            animation: animEnabled ? `arrowHeadFade 0.1s ${duration} ease-out forwards` : undefined,
          }}
        />
      </g>
    );
  }

  return (
    <svg
      viewBox="0 0 800 800"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}
      aria-hidden="true"
    >
      {fadingArrows.map((arrow, i) => drawArrow(arrow, `fade-${i}`, false))}
      {arrows.map((arrow, i) => drawArrow(arrow, `${animKey}-${i}`, true))}
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveTab = 'moves' | 'summary' | 'plan' | 'mistakes' | 'trap' | 'questions' | 'quiz';

export interface LessonViewerProps {
  moves: CourseLessonMove[];
  startFen?: string;
  boardOrientation: 'white' | 'black';
  boardTheme: { dark: string; light: string };
  customPieces?: Record<string, (props?: { fill?: string; square?: string; svgStyle?: React.CSSProperties }) => React.JSX.Element>;
  animationMs: number;
  showNotation: boolean;
  boardThemeId: string;
  pieceStyleId: string;
  lesson: CourseLesson;
  questions: LessonQuestion[];
  courseId: string;
  lessonId: string;
  prevLesson: CourseLesson | null;
  nextLesson: CourseLesson | null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function LessonViewer({
  moves, startFen, boardOrientation, boardTheme, customPieces,
  animationMs, showNotation, boardThemeId, pieceStyleId,
  lesson, questions, courseId, lessonId, prevLesson, nextLesson,
}: LessonViewerProps) {
  const lineStartFen = startFen ?? INITIAL_FEN;

  // ── Core state ─────────────────────────────────────────────────────────────

  const [moveIndex,  setMoveIndex]  = useState(0);
  const [flipped,    setFlipped]    = useState(false);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [playSpeed,  setPlaySpeed]  = useState<0.5 | 1 | 2>(1);
  const [animEnabled,setAnimEnabled]= useState(() =>
    typeof window !== 'undefined'
      ? !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : true
  );
  const [variantMoves, setVariantMoves] = useState<CourseLessonMove[] | null>(null);
  const [variantIdx,   setVariantIdx]   = useState(0);
  const [activeTab,    setActiveTab]    = useState<ActiveTab>('moves');

  // ── Interactive feature state ──────────────────────────────────────────────

  const [isGuessMode, setIsGuessMode] = useState(false);
  const [guessScore,  setGuessScore]  = useState(0);
  const [guessTotal,  setGuessTotal]  = useState(0);
  // guessFails/result keyed to moveIndex — avoids setState-in-effect
  const [guessAtMove, setGuessAtMove] = useState<{ idx: number; fails: number; result: 'correct' | 'wrong' | null }>({ idx: -1, fails: 0, result: null });
  const [isCinema,    setIsCinema]    = useState(false);
  const [soundOn,     setSoundOn]     = useState(false);
  const [showEndPanel,setShowEndPanel]= useState(false);
  const [showTest,      setShowTest]      = useState(false);
  const [lessonPassed,  setLessonPassed]  = useState(false);
  const [showDeviation, setShowDeviation] = useState(false);
  const [devStats,      setDevStats]      = useState<{ ok: number; total: number } | null>(null);
  const [showExplain,   setShowExplain]   = useState(false);
  const [explainFailed, setExplainFailed] = useState<TestQuestion[]>([]);

  // ── Notes (T6) ─────────────────────────────────────────────────────────────
  const [notesByPly,   setNotesByPly]   = useState<Record<number, { id: string; body: string; kind: string }[]>>({});
  const [noteInput,    setNoteInput]    = useState('');
  const [savingNote,   setSavingNote]   = useState(false);
  const [notesLoaded,  setNotesLoaded]  = useState(false);

  // Load all notes for lesson once
  useEffect(() => {
    supabase.from('lesson_notes').select('id, ply, body, kind').eq('lesson_id', lessonId).eq('resolved', false)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<number, { id: string; body: string; kind: string }[]> = {};
        for (const n of data as Array<{ id: string; ply: number; body: string; kind: string }>) {
          if (!map[n.ply]) map[n.ply] = [];
          map[n.ply].push({ id: n.id, body: n.body, kind: n.kind });
        }
        setNotesByPly(map);
        setNotesLoaded(true);
      });
  }, [lessonId]);

  async function saveNote(kind: 'note' | 'confused') {
    if (savingNote) return;
    const body = kind === 'confused' ? '(не понял)' : noteInput.trim();
    if (!body) return;
    setSavingNote(true);
    const ply = activeIdx;
    const { data } = await supabase.from('lesson_notes').insert({ lesson_id: lessonId, ply, body, kind }).select('id').single();
    if (data) {
      setNotesByPly(prev => {
        const next = { ...prev };
        if (!next[ply]) next[ply] = [];
        next[ply] = [...next[ply], { id: (data as { id: string }).id, body, kind }];
        return next;
      });
    }
    setNoteInput('');
    setSavingNote(false);
  }

  const soundOnRef = useRef(false);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  // Load deviation stats for this lesson
  useEffect(() => {
    supabase.from('deviation_log').select('ok').eq('line_id', lessonId).then(({ data }) => {
      if (data) setDevStats({ ok: data.filter(r => r.ok).length, total: data.length });
    });
  }, [lessonId]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const activeMoves = variantMoves ?? moves;
  const activeIdx   = variantMoves ? variantIdx : moveIndex;
  const orientation: 'white' | 'black' = flipped
    ? (boardOrientation === 'white' ? 'black' : 'white')
    : boardOrientation;

  const variantStartFen = variantMoves ? (moves[moveIndex - 2]?.fen ?? lineStartFen) : lineStartFen;
  const currentFen = variantMoves
    ? (variantIdx === 0 ? variantStartFen : variantMoves[variantIdx - 1].fen)
    : (moveIndex === 0 ? lineStartFen : moves[moveIndex - 1].fen);

  const currentMove     = activeIdx > 0 ? activeMoves[activeIdx - 1] : null;
  const currentComment  = currentMove?.comment ?? null;
  const currentArrows   = currentMove?.arrows   ?? [];
  const currentVariants = !variantMoves && currentMove?.variations?.length ? currentMove.variations : null;

  const checkedKingSquare = useMemo(() => getCheckedKingSquare(currentFen), [currentFen]);
  const captureSquare     = currentMove?.san.includes('x') ? currentMove.to : null;
  const currentSquares    = useMemo(() => currentMove?.squares ?? [], [currentMove]);
  const currentLabel      = getEffectiveLabel(currentMove);

  const squareMarkMap = useMemo(() => {
    const m: Record<string, SquareMark> = {};
    for (const s of currentSquares) m[s.square] = s;
    return m;
  }, [currentSquares]);

  // Fading arrows
  const prevArrowsRef = useRef<Arrow[]>([]);
  const [fadingArrows, setFadingArrows] = useState<Arrow[]>([]);
  useEffect(() => {
    const prev = prevArrowsRef.current;
    prevArrowsRef.current = currentArrows;
    if (!animEnabled || prev.length === 0) { setFadingArrows([]); return; }
    setFadingArrows(prev);
    const t = setTimeout(() => setFadingArrows([]), 340);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, animEnabled]);

  // Key moments
  const keyMoveIndices = useMemo(() =>
    moves.reduce<number[]>((acc, m, i) => {
      if ((m.nags?.length ?? 0) > 0 || (m.arrows?.length ?? 0) > 0 || (m.squares?.length ?? 0) > 0) acc.push(i + 1);
      return acc;
    }, []),
  [moves]);

  const boardKey = `${boardThemeId}-${pieceStyleId}`;

  // Guess mode — fails/result reset automatically when moveIndex changes
  const guessFails  = guessAtMove.idx === moveIndex ? guessAtMove.fails  : 0;
  const guessResult = guessAtMove.idx === moveIndex ? guessAtMove.result : null;

  const nextMoveForGuess = !variantMoves && moveIndex < moves.length ? moves[moveIndex] : null;
  const isGuessPending = isGuessMode && !!nextMoveForGuess &&
    ((nextMoveForGuess.nags?.length ?? 0) > 0 || (nextMoveForGuess.arrows?.length ?? 0) > 0);
  const hintArrows: Arrow[] = isGuessPending && guessFails >= 2 && nextMoveForGuess
    ? [{ from: nextMoveForGuess.from, to: nextMoveForGuess.to, color: 'yellow' }]
    : [];

  // Quiz blocks from lesson.blocks
  const quizBlocks = useMemo(() =>
    (lesson.blocks ?? []).filter((b): b is { type: 'quiz'; title: string; items: QuizItem[] } => b.type === 'quiz'),
  [lesson.blocks]);

  const lastFen = moves.length > 0 ? moves[moves.length - 1].fen : lineStartFen;

  const playerColorCode: 'w' | 'b' = boardOrientation === 'white' ? 'w' : 'b';
  const nextOpponentMove = !variantMoves && moveIndex < moves.length ? moves[moveIndex] : null;
  const deviationAvailable = !!nextOpponentMove && nextOpponentMove.color !== playerColorCode;

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goTo = useCallback((idx: number) => {
    if (variantMoves) {
      setVariantIdx(Math.max(0, Math.min(idx, variantMoves.length)));
    } else {
      setMoveIndex(Math.max(0, Math.min(idx, moves.length)));
      setIsPlaying(false);
    }
  }, [variantMoves, moves.length]);

  const goToRef            = useRef(goTo);
  const activeIdxRef       = useRef(activeIdx);
  const activeLenRef       = useRef(activeMoves.length);
  const isPlayingRef       = useRef(isPlaying);
  const variantRef         = useRef(variantMoves);
  const currentVariantsRef = useRef(currentVariants);
  const isGuessPendingRef  = useRef(isGuessPending);
  const isCinemaRef        = useRef(isCinema);
  useEffect(() => { goToRef.current = goTo; }, [goTo]);
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);
  useEffect(() => { activeLenRef.current = activeMoves.length; }, [activeMoves.length]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { variantRef.current = variantMoves; }, [variantMoves]);
  useEffect(() => { currentVariantsRef.current = currentVariants; }, [currentVariants]);
  useEffect(() => { isGuessPendingRef.current = isGuessPending; }, [isGuessPending]);
  useEffect(() => { isCinemaRef.current = isCinema; }, [isCinema]);

  const enterVariant = useCallback((varMoves: CourseLessonMove[]) => {
    setVariantMoves(varMoves); setVariantIdx(0); setIsPlaying(false);
  }, []);
  const exitVariant = useCallback(() => {
    setVariantMoves(null); setVariantIdx(0);
  }, []);

  // ── Auto-play ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying) return;
    if (isGuessPending) return; // pause at key moves in guess mode
    if (activeIdx >= activeMoves.length) {
      const t = setTimeout(() => setIsPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const nextMove = activeMoves[activeIdx];
    const comment  = nextMove?.comment ?? '';
    const baseMs   = 1100;
    const extraMs  = Math.min(comment.length * 22, 2200);
    const delay    = Math.round((baseMs + extraMs) / playSpeed);
    const t = setTimeout(() => {
      if (variantMoves) setVariantIdx(i => i + 1);
      else setMoveIndex(i => i + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [isPlaying, activeIdx, activeMoves, playSpeed, variantMoves, isGuessPending]);

  // ── Keyboard ───────────────────────────────────────────────────────────────

  const [keyHelpOpen, setKeyHelpOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isCinemaRef.current && e.key === 'Escape') { setIsCinema(false); return; }
      if (keyHelpOpen && (e.key === 'Escape' || e.key === '?')) { e.preventDefault(); setKeyHelpOpen(false); return; }
      switch (e.key) {
        case 'ArrowRight':
          if (!isGuessPendingRef.current) { e.preventDefault(); goToRef.current(activeIdxRef.current + 1); }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goToRef.current(activeIdxRef.current - 1);
          break;
        case 'z': case 'Z':
          e.preventDefault();
          goToRef.current(activeIdxRef.current - 1);
          break;
        case ' ':
          e.preventDefault();
          if (!isGuessPendingRef.current) setIsPlaying(p => !p);
          break;
        case 'f': case 'F':
          e.preventDefault();
          setFlipped(f => !f);
          break;
        case 'v': case 'V':
          e.preventDefault();
          if (variantRef.current) exitVariant();
          else if (currentVariantsRef.current?.[0]) enterVariant(currentVariantsRef.current[0]);
          break;
        case '?':
          e.preventDefault();
          setKeyHelpOpen(true);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitVariant, enterVariant, keyHelpOpen]);

  // ── Effects: sound, end-of-lesson, cinema ─────────────────────────────────

  // Sound on move advance
  useEffect(() => {
    if (moveIndex === 0 || !soundOnRef.current) return;
    const m = moves[moveIndex - 1];
    if (!m) return;
    if (m.san.includes('x')) playCapture();
    else playMove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveIndex]);

  // End-of-lesson: sound + auto-show end panel
  const prevMoveIndexRef = useRef(0);
  useEffect(() => {
    const prev = prevMoveIndexRef.current;
    prevMoveIndexRef.current = moveIndex;
    if (moveIndex >= moves.length && prev < moves.length && moves.length > 0 && !variantMoves) {
      if (soundOnRef.current) playComplete();
      if (!isGuessMode) {
        const t = setTimeout(() => setShowEndPanel(true), 1300);
        return () => clearTimeout(t);
      }
    }
  }, [moveIndex, isGuessMode, moves.length, variantMoves]);

  // Cinema Esc
  useEffect(() => {
    if (!isCinema) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsCinema(false); };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isCinema]);

  // ── squareRenderer ─────────────────────────────────────────────────────────

  const squareRenderer = useCallback<SquareRenderer>(({ square, children }) => {
    const isCheck      = square === checkedKingSquare;
    const isCapture    = square === captureSquare;
    const mark         = squareMarkMap[square];
    const moveLabel    = currentMove?.to === square ? currentLabel : null;
    const isGuessTo    = isGuessPending && nextMoveForGuess?.to === square;

    if (!isCheck && !isCapture && !mark && !moveLabel && !isGuessTo) return <>{children}</>;

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {children}
        {isCheck && animEnabled && <div className="sq-check" aria-hidden="true" />}
        {isCheck && !animEnabled && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(220,50,50,0.30)', pointerEvents: 'none' }} aria-hidden="true" />
        )}
        {mark && (
          <div
            key={`mark-${activeIdx}-${square}`}
            className={animEnabled ? 'sq-mark sq-mark-pulse' : 'sq-mark'}
            style={{ background: MARK_COLORS[mark.color] ?? MARK_COLORS.yellow }}
            aria-hidden="true"
          />
        )}
        {isCapture && animEnabled && <div key={`flash-${activeIdx}`} className="sq-flash" aria-hidden="true" />}
        {moveLabel && <MoveBadge key={`badge-${activeIdx}`} label={moveLabel} variant="square" />}
        {isGuessTo && (
          <div style={{ position: 'absolute', inset: 0, border: '2px dashed rgba(220,180,40,0.5)', pointerEvents: 'none', zIndex: 5 }} aria-hidden="true" />
        )}
      </div>
    );
  }, [checkedKingSquare, captureSquare, squareMarkMap, currentMove, currentLabel, activeIdx, animEnabled, isGuessPending, nextMoveForGuess]);

  // ── squareStyles ───────────────────────────────────────────────────────────

  const squareStyles = useMemo((): Record<string, React.CSSProperties> => {
    if (!currentMove) return {};
    return {
      [currentMove.from]: { background: 'rgba(255,255,255,0.09)' },
      [currentMove.to]:   { background: 'rgba(255,255,255,0.20)' },
    };
  }, [currentMove]);

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'moves',    label: 'Ходы' },
    { id: 'summary',  label: 'Итог' },
    { id: 'plan',     label: 'План' },
    { id: 'mistakes', label: 'Ошибки' },
    ...(lesson.trap        ? [{ id: 'trap'      as ActiveTab, label: 'Ловушка' }] : []),
    ...(questions.length   ? [{ id: 'questions' as ActiveTab, label: `Задачи (${questions.length})` }] : []),
    ...(quizBlocks.length  ? [{ id: 'quiz'      as ActiveTab, label: 'Квиз' }] : []),
  ];

  const pct = activeMoves.length > 0 ? (activeIdx / activeMoves.length) * 100 : 0;
  const boardAnimClass = guessResult === 'correct' ? 'board-guess-correct'
    : guessResult === 'wrong' ? 'board-guess-wrong' : '';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Guess mode banner */}
      {isGuessMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '8px 14px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 13 }}>
          <span style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>РЕЖИМ УГАДАЙ ХОД</span>
          <span style={{ color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>{guessScore} / {guessTotal}</span>
          {isGuessPending && (
            <span style={{ color: 'rgba(220,180,40,0.9)', animation: animEnabled ? 'fadeComment 0.3s ease-out' : undefined }}>
              ← угадай ход
            </span>
          )}
          <button
            onClick={() => { setIsGuessMode(false); setGuessScore(0); setGuessTotal(0); setGuessAtMove({ idx: -1, fails: 0, result: null }); }}
            style={{ marginLeft: 'auto', height: 28, padding: '0 10px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Выйти
          </button>
        </div>
      )}

      {/* 2-column grid */}
      <div className="lesson-grid">

        {/* ── LEFT: board ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Board wrapper (shake/flash applied here, outside overflow:hidden) */}
          <div className={boardAnimClass} style={{ maxWidth: 560, width: '100%' }}>
            <div style={{ position: 'relative', aspectRatio: '1', width: '100%', border: '1px solid var(--board-border)', overflow: 'hidden' }}>
              {/* Filter wrapper for variant mode */}
              <div style={{ width: '100%', height: '100%', filter: variantMoves ? 'saturate(0.55) brightness(0.78)' : undefined, transition: animEnabled ? 'filter 0.4s ease' : undefined }}>
                <Chessboard
                  key={boardKey}
                  options={{
                    position: currentFen,
                    boardOrientation: orientation,
                    allowDragging: isGuessPending,
                    squareStyles,
                    squareRenderer,
                    arrows: [],
                    boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
                    darkSquareStyle:  { backgroundColor: boardTheme.dark },
                    lightSquareStyle: { backgroundColor: boardTheme.light },
                    pieces: customPieces,
                    showNotation,
                    animationDurationInMs: animEnabled ? animationMs : 0,
                    showAnimations: animEnabled,
                    onPieceDrop: isGuessPending ? ({ sourceSquare, targetSquare }) => {
                      if (!nextMoveForGuess || !targetSquare) return false;
                      const isCorrect = sourceSquare === nextMoveForGuess.from && targetSquare === nextMoveForGuess.to;
                      const capturedIdx = moveIndex;
                      const currentFails = guessFails;
                      if (isCorrect) {
                        if (currentFails === 0) setGuessScore(s => s + 1);
                        setGuessTotal(t => t + 1);
                        setGuessAtMove({ idx: capturedIdx, fails: currentFails, result: 'correct' });
                        if (soundOnRef.current) playCorrect();
                        setTimeout(() => {
                          setGuessAtMove(s => s.idx === capturedIdx ? { ...s, result: null } : s);
                          setMoveIndex(i => i === capturedIdx ? Math.min(i + 1, moves.length) : i);
                        }, 700);
                      } else {
                        const newFails = currentFails + 1;
                        if (currentFails === 0) setGuessTotal(t => t + 1);
                        setGuessAtMove({ idx: capturedIdx, fails: newFails, result: 'wrong' });
                        if (soundOnRef.current) playWrong();
                        setTimeout(() => setGuessAtMove(s => s.idx === capturedIdx ? { ...s, result: null } : s), 500);
                      }
                      return false;
                    } : undefined,
                  }}
                />
                <ArrowLayer
                  arrows={[...currentArrows, ...hintArrows]}
                  fadingArrows={fadingArrows}
                  orientation={orientation}
                  animKey={activeIdx}
                  animEnabled={animEnabled}
                />
              </div>

              {/* Guess feedback overlays */}
              {guessResult === 'correct' && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(80,200,80,0.12)', pointerEvents: 'none', zIndex: 20, animation: 'fadeOut 0.7s ease-out forwards' }} aria-hidden="true" />
              )}
              {guessResult === 'wrong' && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(220,60,60,0.12)', pointerEvents: 'none', zIndex: 20, animation: 'fadeOut 0.5s ease-out forwards' }} aria-hidden="true" />
              )}

              {/* VARIANT badge */}
              {variantMoves && (
                <div style={{ position: 'absolute', top: 8, left: 8, padding: '3px 8px', fontSize: 11, letterSpacing: '0.08em', background: 'rgba(20,20,18,0.88)', color: 'var(--muted)', border: '1px solid var(--hairline)', backdropFilter: 'blur(4px)' }}>
                  ВАРИАНТ
                </div>
              )}

              {/* Hint label after 2 fails */}
              {isGuessPending && guessFails >= 2 && (
                <div style={{ position: 'absolute', top: 8, right: 8, padding: '3px 8px', fontSize: 11, letterSpacing: '0.08em', background: 'rgba(20,20,18,0.88)', color: 'rgba(220,180,40,0.9)', border: '1px solid rgba(220,180,40,0.3)' }}>
                  подсказка ↑
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div
            role="progressbar" aria-valuenow={activeIdx} aria-valuemax={activeMoves.length}
            style={{ position: 'relative', height: 3, background: 'var(--track)', cursor: 'pointer', maxWidth: 560 }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              goTo(Math.round(((e.clientX - rect.left) / rect.width) * activeMoves.length));
            }}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: 'var(--ivory)', transition: animEnabled ? 'width 0.15s' : 'none' }} />
            {keyMoveIndices.map(idx => (
              <div key={idx} onClick={e => { e.stopPropagation(); goTo(idx); }}
                style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${(idx / moves.length) * 100}%`, background: idx <= moveIndex ? 'var(--ivory)' : 'var(--control)', cursor: 'pointer', transform: 'translateX(-50%)' }}
              />
            ))}
          </div>

          {/* Comment box */}
          <div
            key={`comment-${activeIdx}`}
            style={{ minHeight: 44, maxWidth: 560, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 14, lineHeight: 1.6, color: currentComment ? 'var(--ivory)' : 'var(--muted)', animation: animEnabled && currentComment ? 'fadeComment 0.22s ease-out' : undefined }}
          >
            {currentComment
              ? <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {currentLabel && <MoveBadge label={currentLabel} variant="inline" />}
                  <span>{currentComment}</span>
                </span>
              : 'Комментарий к ходу'
            }
          </div>

          {/* Notes (T6) */}
          {notesLoaded && (
            <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(notesByPly[activeIdx] ?? []).map(n => (
                <div key={n.id} style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 10px', border: '1px solid var(--hairline)', background: n.kind === 'confused' ? 'rgba(220,80,60,0.07)' : 'rgba(100,180,255,0.07)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: n.kind === 'confused' ? 'rgba(220,80,60,0.9)' : 'rgba(100,180,255,0.9)', flexShrink: 0 }}>{n.kind === 'confused' ? '?' : '✎'}</span>
                  <span>{n.body}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && noteInput.trim()) void saveNote('note'); }}
                  placeholder="Заметка к ходу…"
                  style={{ flex: 1, height: 32, padding: '0 10px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ivory)', outline: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={() => void saveNote('note')} disabled={!noteInput.trim() || savingNote} style={{ height: 32, padding: '0 12px', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  Сохранить
                </button>
                <button onClick={() => void saveNote('confused')} disabled={savingNote} title="Не понял этот ход" style={{ height: 32, padding: '0 12px', background: 'rgba(220,80,60,0.08)', border: '1px solid rgba(220,80,60,0.3)', color: 'rgba(220,80,60,0.9)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  Не понял
                </button>
              </div>
            </div>
          )}

          {/* Variants */}
          {currentVariants && !variantMoves && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 560 }}>
              {currentVariants.map((varMoves, vi) => {
                const fvm = varMoves[0];
                const moveNum = fvm?.color === 'w' ? Math.ceil(moveIndex / 2) : Math.floor(moveIndex / 2);
                const prefix  = fvm?.color === 'w' ? `${moveNum}. ` : `${moveNum}... `;
                const preview = prefix + varMoves.slice(0, 3).map(m => m.san).join(' ');
                return (
                  <div key={vi} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', flexShrink: 0 }}>Вариант</span>
                    <code style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>{preview}{varMoves.length > 3 ? '…' : ''}</code>
                    <button onClick={() => enterVariant(varMoves)} style={{ height: 28, padding: '0 12px', flexShrink: 0, background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                      Смотреть
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {variantMoves && (
            <div style={{ maxWidth: 560 }}>
              <button onClick={exitVariant} style={{ height: 32, padding: '0 14px', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                ← Вернуться к основной линии
              </button>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: 560 }}>
            <button onClick={() => goTo(activeIdx - 1)} disabled={activeIdx === 0} aria-label="Предыдущий ход" style={ctrlBtn(activeIdx === 0)}>←</button>
            <button onClick={() => setIsPlaying(p => !p)} disabled={activeIdx >= activeMoves.length && !isPlaying} aria-label={isPlaying ? 'Пауза' : 'Автовоспроизведение'} style={{ ...ctrlBtn(false), minWidth: 40 }}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button onClick={() => goTo(activeIdx + 1)} disabled={activeIdx >= activeMoves.length} aria-label="Следующий ход" style={ctrlBtn(activeIdx >= activeMoves.length)}>→</button>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>{activeIdx} / {activeMoves.length}</span>

            <div style={{ display: 'flex', border: '1px solid var(--hairline)', marginLeft: 'auto' }}>
              {([0.5, 1, 2] as const).map(s => (
                <button key={s} onClick={() => setPlaySpeed(s)} style={{ height: 32, padding: '0 10px', border: 'none', background: playSpeed === s ? 'var(--track)' : 'transparent', color: playSpeed === s ? 'var(--ivory)' : 'var(--muted)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {s}×
                </button>
              ))}
            </div>

            <button onClick={() => setFlipped(f => !f)} title="Перевернуть (F)" style={ctrlBtn(false)}>↕</button>

            <button onClick={() => setIsCinema(true)} title="Кино-режим" style={{ ...ctrlBtn(false), fontSize: 12 }}>⛶</button>

            <button onClick={() => setAnimEnabled(a => !a)} title="Анимации" style={toggleBtn(animEnabled)}>
              {animEnabled ? 'ANIM ✓' : 'ANIM'}
            </button>

            <button onClick={() => setSoundOn(s => !s)} title="Звук" style={toggleBtn(soundOn)}>
              {soundOn ? 'ЗВУК ✓' : 'ЗВУК'}
            </button>

            <button
              onClick={() => {
                const entering = !isGuessMode;
                setIsGuessMode(entering);
                if (entering) { setGuessScore(0); setGuessTotal(0); setGuessAtMove({ idx: -1, fails: 0, result: null }); setShowEndPanel(false); goTo(0); }
              }}
              title="Режим угадай ход"
              style={{ height: 32, padding: '0 10px', border: '1px solid var(--hairline)', background: isGuessMode ? 'rgba(220,180,40,0.1)' : 'transparent', color: isGuessMode ? 'rgba(220,180,40,0.9)' : 'var(--muted)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.08em' }}
            >
              {isGuessMode ? 'УГАДАЙ ✓' : 'УГАДАЙ'}
            </button>

            <button
              onClick={() => setShowDeviation(true)}
              disabled={!deviationAvailable}
              title="Отклонение от линии"
              style={{ height: 32, padding: '0 10px', border: '1px solid var(--hairline)', background: 'transparent', color: deviationAvailable ? 'rgba(220,80,60,0.9)' : 'var(--muted)', fontSize: 11, fontFamily: 'inherit', cursor: deviationAvailable ? 'pointer' : 'default', letterSpacing: '0.08em', opacity: deviationAvailable ? 1 : 0.45 }}
            >
              ОТКЛ
            </button>

            <button
              onClick={() => setShowExplain(true)}
              title="Объясни сам — режим вопросов по комментариям"
              style={{ height: 32, padding: '0 10px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.08em' }}
            >
              ОБЪЯСНИ
            </button>
          </div>

          {/* Deviation stats */}
          {devStats && devStats.total > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', maxWidth: 560 }}>
              Отклонения: {devStats.ok} / {devStats.total}
            </div>
          )}
        </div>

        {/* ── RIGHT: lesson panel ── */}
        <div style={{ border: '1px solid var(--hairline)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
            <h2 style={{ fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)", margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
              {lesson.title}
            </h2>
          </div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--hairline)', overflowX: 'auto' }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--ivory)' : '2px solid transparent', color: activeTab === tab.id ? 'var(--ivory)' : 'var(--muted)', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', flexShrink: 0, marginBottom: -1 }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ padding: 20, overflowY: 'auto', maxHeight: 480 }}>
            {activeTab === 'moves'    && <><MoveListPanel moves={moves} currentIndex={variantMoves ? -1 : moveIndex} onMoveClick={idx => { exitVariant(); goTo(idx); }} animEnabled={animEnabled} notesByPly={notesByPly} /><BadgeLegend /></>}
            {activeTab === 'summary'  && <LessonText text={lesson.summary} />}
            {activeTab === 'plan'     && <LessonText text={lesson.plan} />}
            {activeTab === 'mistakes' && <LessonText text={lesson.mistakes} />}
            {activeTab === 'trap'     && <LessonText text={lesson.trap} />}
            {activeTab === 'questions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {questions.map((q, i) => <QuestionBlock key={q.id} q={q} idx={i} />)}
              </div>
            )}
            {activeTab === 'quiz' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {quizBlocks.map((block, bi) => (
                  <div key={bi}>
                    {block.title && <p style={{ margin: '0 0 12px', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>{block.title}</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {block.items.map((item, ii) => <QuizChoiceBlock key={ii} item={item} idx={ii + 1} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingTop: 24, borderTop: '1px solid var(--hairline)' }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          {prevLesson && (
            <Link href={`/courses/${courseId}/${prevLesson.id}`} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, color: 'var(--muted)' }}>
              <span style={{ fontSize: 11, letterSpacing: '0.08em' }}>← ПРЕДЫДУЩИЙ</span>
              <span style={{ fontSize: 14, color: 'var(--ivory)' }}>{prevLesson.title}</span>
            </Link>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <Link href={`/courses/${courseId}/${lessonId}/practice`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 48, padding: '0 28px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>
            Тренировать
          </Link>
          <button
            onClick={() => setShowTest(true)}
            style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 20px', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 500, border: '1px solid var(--hairline)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Тест
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 120, display: 'flex', justifyContent: 'flex-end' }}>
          {nextLesson && (
            <Link href={`/courses/${courseId}/${nextLesson.id}`} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, color: 'var(--muted)', textAlign: 'right' }}>
              <span style={{ fontSize: 11, letterSpacing: '0.08em' }}>СЛЕДУЮЩИЙ →</span>
              <span style={{ fontSize: 14, color: 'var(--ivory)' }}>{nextLesson.title}</span>
            </Link>
          )}
        </div>
      </div>

      {/* End of lesson panel */}
      {showEndPanel && !variantMoves && (
        <div style={{ padding: '24px 28px', border: '1px solid var(--hairline)', background: 'var(--surface)', animation: animEnabled ? 'fadeIn 0.4s ease-out' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Урок завершён{lessonPassed ? ' ✓' : ''}
            </h3>
            {isGuessMode && guessTotal > 0 && (
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                Угадано с первого раза: <strong style={{ color: 'var(--ivory)' }}>{guessScore} / {guessTotal}</strong>
              </span>
            )}
          </div>
          {lesson.summary && (
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--muted)', lineHeight: 1.7 }}>{lesson.summary}</p>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href={`/play?fen=${encodeURIComponent(lastFen)}&color=${boardOrientation}`}
              style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px', border: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 13, flexShrink: 0 }}
            >
              Играть отсюда →
            </Link>
            {nextLesson && (
              <Link
                href={`/courses/${courseId}/${nextLesson.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, flexShrink: 0 }}
              >
                Следующий урок →
              </Link>
            )}
            <button
              onClick={() => setShowTest(true)}
              style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, flexShrink: 0, border: 'none', cursor: 'pointer' }}
            >
              Тест →
            </button>
          </div>
        </div>
      )}

      {/* Lesson test overlay */}
      {showTest && (
        <LessonTest
          lesson={lesson}
          moves={moves}
          lessonId={lessonId}
          courseId={courseId}
          nextLesson={nextLesson}
          extraQuestions={explainFailed.length > 0 ? explainFailed : undefined}
          onClose={() => setShowTest(false)}
          onPassed={() => setLessonPassed(true)}
        />
      )}

      {/* Explain mode overlay */}
      {showExplain && (
        <ExplainMode
          moves={moves}
          startFen={startFen}
          lessonId={lessonId}
          boardOrientation={orientation}
          boardTheme={boardTheme}
          customPieces={customPieces}
          showNotation={showNotation}
          onClose={() => setShowExplain(false)}
          onDone={(failed) => { setExplainFailed(failed); setShowExplain(false); }}
        />
      )}

      {/* Deviation overlay */}
      {showDeviation && nextOpponentMove && (
        <DeviationMode
          startFen={currentFen}
          opponentLineUci={nextOpponentMove.from + nextOpponentMove.to}
          playerColor={playerColorCode}
          boardOrientation={orientation}
          lineId={lessonId}
          boardTheme={boardTheme}
          customPieces={customPieces}
          showNotation={showNotation}
          onClose={() => setShowDeviation(false)}
        />
      )}

      {/* Key help dialog */}
      {keyHelpOpen && (
        <KeyHelpDialog
          onClose={() => setKeyHelpOpen(false)}
          keys={[
            { key: '← →',    desc: 'Шаг назад / вперёд' },
            { key: 'Z',      desc: 'Шаг назад (отмена)' },
            { key: 'Пробел', desc: 'Воспроизвести / пауза' },
            { key: 'F',      desc: 'Перевернуть доску' },
            { key: 'V',      desc: 'Войти / выйти из варианта' },
            { key: '?',      desc: 'Список клавиш' },
            { key: 'Ctrl+K', desc: 'Поиск' },
          ]}
        />
      )}

      {/* Cinema overlay */}
      {isCinema && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <div style={{ position: 'relative', width: 'min(80vh, 80vw)', aspectRatio: '1', flexShrink: 0 }}>
            <Chessboard
              key={`cinema-${boardKey}`}
              options={{
                position: currentFen,
                boardOrientation: orientation,
                allowDragging: false,
                squareStyles,
                squareRenderer,
                arrows: [],
                boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
                darkSquareStyle:  { backgroundColor: boardTheme.dark },
                lightSquareStyle: { backgroundColor: boardTheme.light },
                pieces: customPieces,
                showNotation,
                animationDurationInMs: animEnabled ? animationMs : 0,
                showAnimations: animEnabled,
              }}
            />
            <ArrowLayer
              arrows={[...currentArrows, ...hintArrows]}
              fadingArrows={fadingArrows}
              orientation={orientation}
              animKey={activeIdx}
              animEnabled={animEnabled}
            />
          </div>

          {/* Subtitle */}
          <div style={{ minHeight: 56, maxWidth: 680, width: '90%', textAlign: 'center' }}>
            {currentComment && (
              <p
                key={`sub-${activeIdx}`}
                style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: 'var(--ivory)', animation: animEnabled ? 'fadeComment 0.3s ease-out' : undefined, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 8 }}
              >
                {currentLabel && <MoveBadge label={currentLabel} variant="inline" />}
                <span>{currentComment}</span>
              </p>
            )}
          </div>

          {/* Cinema controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => goTo(activeIdx - 1)} disabled={activeIdx === 0} style={ctrlBtn(activeIdx === 0)}>←</button>
            <button onClick={() => setIsPlaying(p => !p)} disabled={activeIdx >= activeMoves.length && !isPlaying} style={{ ...ctrlBtn(false), minWidth: 44, fontSize: 15 }}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button onClick={() => goTo(activeIdx + 1)} disabled={activeIdx >= activeMoves.length} style={ctrlBtn(activeIdx >= activeMoves.length)}>→</button>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 60 }}>{activeIdx} / {activeMoves.length}</span>
            <button onClick={() => setIsCinema(false)} style={{ height: 32, padding: '0 14px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 16 }}>
              Выйти (Esc)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function ctrlBtn(disabled: boolean): React.CSSProperties {
  return {
    height: 32, width: 32, padding: 0,
    border: '1px solid var(--hairline)',
    background: 'transparent',
    color: disabled ? 'var(--track)' : 'var(--ivory)',
    fontSize: 14, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

function toggleBtn(active: boolean): React.CSSProperties {
  return {
    height: 32, padding: '0 10px',
    border: '1px solid var(--hairline)',
    background: 'transparent',
    color: active ? 'var(--ivory)' : 'var(--muted)',
    fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.08em',
  };
}

// ── LessonText ────────────────────────────────────────────────────────────────

function LessonText({ text }: { text?: string | null }) {
  return (
    <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
      {text || 'Нет данных'}
    </p>
  );
}

// ── QuestionBlock ─────────────────────────────────────────────────────────────

function QuestionBlock({ q, idx }: { q: LessonQuestion; idx: number }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', border: '1px solid var(--hairline)' }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>Задача {idx + 1}</span>
      <code style={{ fontSize: 11, color: 'var(--control)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{q.fen}</code>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ivory)', fontWeight: 500 }}>{q.question}</p>
      {!revealed ? (
        <button onClick={() => setRevealed(true)} style={{ alignSelf: 'flex-start', height: 32, padding: '0 14px', border: '1px solid var(--control)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Показать ответ
        </button>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{q.answer}</p>
      )}
    </div>
  );
}

// ── QuizChoiceBlock ───────────────────────────────────────────────────────────

function QuizChoiceBlock({ item, idx }: { item: QuizItem; idx: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const answered = selected !== null;

  if (item.type === 'puzzle') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', border: '1px solid var(--hairline)' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Задание {idx}</span>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5 }}>{item.question}</p>
        {!answered ? (
          <button onClick={() => setSelected('show')} style={{ alignSelf: 'flex-start', height: 30, padding: '0 12px', border: '1px solid var(--control)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Ответ
          </button>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--ivory)' }}>{item.answer}</strong>
            {item.why ? ` — ${item.why}` : ''}
          </p>
        )}
      </div>
    );
  }

  // type === 'choice'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', border: '1px solid var(--hairline)' }}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Вопрос {idx}</span>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5, fontWeight: 500 }}>{item.question}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {Object.entries(item.options).map(([key, text]) => {
          const isCorrect  = key === item.answer;
          const isSelected = key === selected;
          const borderColor = answered
            ? isCorrect ? 'rgba(80,200,80,0.6)' : isSelected ? 'rgba(220,60,60,0.5)' : 'var(--hairline)'
            : 'var(--hairline)';
          const bg = answered
            ? isCorrect ? 'rgba(80,200,80,0.08)' : isSelected ? 'rgba(220,60,60,0.06)' : 'transparent'
            : 'transparent';
          const color = answered && isCorrect ? 'rgba(130,220,100,0.95)' : 'var(--muted)';
          return (
            <button
              key={key}
              onClick={() => !answered && setSelected(key)}
              disabled={answered}
              style={{ textAlign: 'left', padding: '8px 12px', border: `1px solid ${borderColor}`, background: bg, color, fontSize: 13, fontFamily: 'inherit', cursor: answered ? 'default' : 'pointer', lineHeight: 1.5, transition: answered ? 'none' : 'border-color 0.15s, background 0.15s' }}
            >
              <span style={{ fontWeight: 600, marginRight: 6 }}>{key}.</span>{text}
            </button>
          );
        })}
      </div>
      {answered && item.why && (
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, borderLeft: '2px solid var(--hairline)', paddingLeft: 10 }}>
          {item.why}
        </p>
      )}
    </div>
  );
}

// ── MoveListPanel ─────────────────────────────────────────────────────────────

function MoveListPanel({
  moves, currentIndex, onMoveClick, animEnabled, notesByPly,
}: {
  moves: CourseLessonMove[];
  currentIndex: number;
  onMoveClick: (idx: number) => void;
  animEnabled: boolean;
  notesByPly?: Record<number, { id: string; body: string; kind: string }[]>;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: animEnabled ? 'smooth' : 'auto' });
  }, [currentIndex, animEnabled]);

  if (moves.length === 0) return <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>Нет ходов</p>;

  const pairs = Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => ({
    w: moves[i * 2], b: moves[i * 2 + 1], wi: i * 2, bi: i * 2 + 1,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {pairs.map(({ w, b, wi, bi }) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gap: '0 4px', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {Math.floor(wi / 2) + 1}.
          </span>
          <MoveBtn m={w} idx={wi + 1} current={currentIndex} onClick={onMoveClick} refProp={wi + 1 === currentIndex ? activeRef : undefined} hasNote={!!(notesByPly?.[wi + 1]?.length)} />
          {b && <MoveBtn m={b} idx={bi + 1} current={currentIndex} onClick={onMoveClick} refProp={bi + 1 === currentIndex ? activeRef : undefined} hasNote={!!(notesByPly?.[bi + 1]?.length)} />}
        </div>
      ))}
    </div>
  );
}

function MoveBtn({ m, idx, current, onClick, refProp, hasNote }: {
  m: CourseLessonMove; idx: number; current: number;
  onClick: (idx: number) => void;
  refProp?: React.RefObject<HTMLButtonElement | null>;
  hasNote?: boolean;
}) {
  const isActive  = idx === current;
  const label     = getEffectiveLabel(m);
  const hasArrows = (m.arrows?.length ?? 0) > 0;
  return (
    <button
      ref={refProp}
      onClick={() => onClick(idx)}
      style={{ padding: '3px 6px', fontSize: 13, fontFamily: 'monospace', textAlign: 'left', cursor: 'pointer', border: 'none', background: isActive ? 'var(--track)' : 'transparent', color: idx <= current ? 'var(--ivory)' : 'var(--muted)', fontWeight: isActive ? 700 : 400, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 4 }}
    >
      {m.san}
      {label     && <MoveBadge label={label} variant="inline" />}
      {hasArrows && !label && <span style={{ fontSize: 9, color: 'var(--control)', lineHeight: 1 }}>▸</span>}
      {hasNote   && <span style={{ fontSize: 9, color: 'rgba(100,180,255,0.9)', lineHeight: 1 }} title="Есть заметка">✎</span>}
    </button>
  );
}

function BadgeLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, letterSpacing: '0.08em' }}
      >
        {open ? '▾' : '▸'} ЧТО ЗНАЧАТ ЗНАЧКИ
      </button>
      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {ALL_LABELS.map(lbl => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MoveBadge label={lbl} variant="inline" />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{LABEL_META[lbl].name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
