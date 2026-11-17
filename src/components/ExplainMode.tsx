'use client';

import { useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import type { CourseLessonMove, Arrow, SquareMark, TestQuestion } from '@/types/courses';

// ── Constants ──────────────────────────────────────────────────────────────────

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MIN_COMMENT  = 40;
const MAX_QUESTIONS = 10;

const MARK_COLORS: Record<string, string> = {
  green:  'rgba(100,200, 80,0.55)',
  red:    'rgba(220, 60, 60,0.50)',
  yellow: 'rgba(220,180, 40,0.50)',
  blue:   'rgba( 60,130,220,0.50)',
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExplainQuestion {
  plyIndex: number;
  move:     CourseLessonMove;
  fenBefore: string;
  options:  string[];
  correctIdx: number;
}

export interface ExplainModeProps {
  moves: CourseLessonMove[];
  lessonId: string;
  boardOrientation: 'white' | 'black';
  boardTheme: { dark: string; light: string };
  customPieces?: Record<string, (props?: { fill?: string; square?: string; svgStyle?: React.CSSProperties }) => React.JSX.Element>;
  showNotation?: boolean;
  onClose: () => void;
  onDone: (failed: TestQuestion[]) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(moves: CourseLessonMove[]): ExplainQuestion[] {
  const eligible = moves
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !!m.comment && m.comment.length >= MIN_COMMENT);

  if (eligible.length < 3) return [];

  const allComments = eligible.map(e => e.m.comment!);

  const qs = eligible.map(({ m, i }) => {
    const correct = m.comment!;
    const others  = shuffle(allComments.filter(c => c !== correct)).slice(0, 2);
    if (others.length < 2) return null;
    const options    = shuffle([correct, ...others]);
    const correctIdx = options.indexOf(correct);
    const fenBefore  = i === 0 ? INITIAL_FEN : moves[i - 1].fen;
    return { plyIndex: i, move: m, fenBefore, options, correctIdx } satisfies ExplainQuestion;
  }).filter((q): q is ExplainQuestion => q !== null);

  return shuffle(qs).slice(0, MAX_QUESTIONS);
}

// ── Minimal arrow SVG ──────────────────────────────────────────────────────────

const SQ = 100;

function sqXY(sq: string, orientation: 'white' | 'black'): [number, number] {
  const fi = sq.charCodeAt(0) - 97;
  const ri = parseInt(sq[1], 10) - 1;
  const x  = orientation === 'white' ? fi * SQ + SQ / 2 : (7 - fi) * SQ + SQ / 2;
  const y  = orientation === 'white' ? (7 - ri) * SQ + SQ / 2 : ri * SQ + SQ / 2;
  return [x, y];
}

function arrowColor(c?: string) {
  if (c === 'green')  return 'rgba( 80,200, 80,0.80)';
  if (c === 'red')    return 'rgba(220, 60, 60,0.80)';
  if (c === 'blue')   return 'rgba( 60,150,220,0.80)';
  return 'rgba(220,180,40,0.80)';
}

function ArrowLayer({ arrows, orientation }: { arrows: Arrow[]; orientation: 'white' | 'black' }) {
  if (!arrows.length) return null;
  const HEAD_LEN = 28, HEAD_W = 22, SHAFT_W = 10;
  return (
    <svg viewBox="0 0 800 800"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}
      aria-hidden="true"
    >
      {arrows.map((a, i) => {
        const [x1, y1] = sqXY(a.from, orientation);
        const [x2, y2] = sqXY(a.to,   orientation);
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return null;
        const nx = dx / len, ny = dy / len;
        const sx2 = x2 - nx * HEAD_LEN, sy2 = y2 - ny * HEAD_LEN;
        const px = -ny, py = nx;
        const color = arrowColor(a.color);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={sx2} y2={sy2}
              stroke={color} strokeWidth={SHAFT_W} strokeLinecap="round" />
            <polygon
              points={`${x2},${y2} ${sx2+px*HEAD_W/2},${sy2+py*HEAD_W/2} ${sx2-px*HEAD_W/2},${sy2-py*HEAD_W/2}`}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ── Overlay ────────────────────────────────────────────────────────────────────

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(10,10,8,0.84)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflowY: 'auto', padding: '36px 16px 60px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'var(--surface)', border: '1px solid var(--hairline)',
        padding: 28, boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{
            margin: 0, fontSize: 18, fontWeight: 700,
            fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
          }}>{title}</h2>
          <button onClick={onClose} style={{
            width: 32, height: 32, border: '1px solid var(--hairline)',
            background: 'transparent', color: 'var(--muted)', fontSize: 16,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ExplainMode({
  moves, lessonId, boardOrientation, boardTheme, customPieces,
  showNotation = true, onClose, onDone,
}: ExplainModeProps) {
  const [questions]  = useState<ExplainQuestion[]>(() => buildQuestions(moves));
  const [qIdx,       setQIdx]       = useState(0);
  const [selected,   setSelected]   = useState<number | null>(null);
  const [score,      setScore]      = useState(0);
  const [wrongMoves, setWrongMoves] = useState<ExplainQuestion[]>([]);
  const [phase,      setPhase]      = useState<'question' | 'reveal' | 'done'>('question');

  // ── Empty state ───────────────────────────────────────────────────────────

  if (questions.length === 0) {
    return (
      <Overlay title="Объясни сам" onClose={onClose}>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
          Недостаточно ходов с комментариями (нужно минимум 3 хода с комментарием ≥ 40 символов).
        </p>
        <button onClick={onClose} style={SECONDARY}>Закрыть</button>
      </Overlay>
    );
  }

  const q     = questions[qIdx];
  const total = questions.length;
  const pct   = total > 0 ? Math.round((qIdx / total) * 100) : 0;

  // ── Select answer ─────────────────────────────────────────────────────────

  function handleSelect(optIdx: number) {
    if (selected !== null || phase === 'done') return;
    setSelected(optIdx);
    const correct = optIdx === q.correctIdx;
    if (correct) setScore(s => s + 1);
    else setWrongMoves(w => [...w, q]);
    supabase.from('explain_log').insert({ lesson_id: lessonId, ply: q.plyIndex, ok: correct });
    setPhase('reveal');
  }

  // ── Next question ─────────────────────────────────────────────────────────

  function handleNext() {
    if (qIdx === total - 1) {
      // Build TestQuestion objects for failed moves
      const allComments = questions.map(q2 => q2.move.comment!);
      const failed: TestQuestion[] = wrongMoves.map(wq => {
        const correct    = wq.move.comment!;
        const distractors = shuffle(allComments.filter(c => c !== correct)).slice(0, 2);
        const options    = shuffle([correct, ...distractors]);
        return {
          question:  `Почему ход ${wq.move.san}?`,
          options,
          answerIdx: options.indexOf(correct),
          why:       correct,
          fen:       wq.fenBefore,
        };
      });
      onDone(failed);
      setPhase('done');
    } else {
      setQIdx(i => i + 1);
      setSelected(null);
      setPhase('question');
    }
  }

  // ── Done screen ───────────────────────────────────────────────────────────

  if (phase === 'done') {
    const donePct = total > 0 ? Math.round((score / total) * 100) : 0;
    return (
      <Overlay title="Объясни сам — итог" onClose={onClose}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            fontSize: 64, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em',
            color: donePct >= 70 ? 'rgba(130,220,100,0.95)' : 'var(--ivory)',
            fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
          }}>
            {score} / {total}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
            {donePct}% правильно
          </div>
        </div>
        {wrongMoves.length > 0 && (
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            Ошибочные ходы добавлены в тест урока.
          </p>
        )}
        <button onClick={onClose} style={SECONDARY}>Закрыть</button>
      </Overlay>
    );
  }

  // ── Question screen ───────────────────────────────────────────────────────

  const answered = selected !== null;

  // Square styles: from+to highlight always; square marks after reveal
  const squareStyles: Record<string, React.CSSProperties> = {
    [q.move.from]: { background: 'rgba(255,255,255,0.09)' },
    [q.move.to]:   { background: 'rgba(255,255,255,0.22)' },
  };
  if (answered) {
    for (const s of (q.move.squares ?? [] as SquareMark[])) {
      squareStyles[s.square] = { background: MARK_COLORS[s.color] ?? MARK_COLORS.yellow };
    }
  }

  const arrows: Arrow[] = answered ? (q.move.arrows ?? []) : [];

  return (
    <Overlay title="Объясни сам" onClose={onClose}>
      {/* Progress */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{qIdx + 1} / {total}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{score} правильно</span>
        </div>
        <div style={{ height: 2, background: 'var(--track)' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--ivory)', transition: 'width 0.2s' }} />
        </div>
      </div>

      {/* Move label */}
      <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--muted)' }}>
        Ход{' '}
        <code style={{ color: 'var(--ivory)', fontFamily: 'monospace', fontSize: 15 }}>
          {q.move.color === 'w'
            ? `${Math.ceil((q.plyIndex + 1) / 2)}. ${q.move.san}`
            : `${Math.ceil((q.plyIndex + 1) / 2)}... ${q.move.san}`}
        </code>
      </div>

      {/* Board */}
      <div style={{ position: 'relative', maxWidth: 300, aspectRatio: '1', margin: '0 auto 18px', border: '1px solid var(--hairline)' }}>
        <Chessboard
          options={{
            position:         q.fenBefore,
            boardOrientation: boardOrientation,
            allowDragging:    false,
            squareStyles,
            boardStyle:       { borderRadius: 0, width: '100%', height: '100%' },
            darkSquareStyle:  { backgroundColor: boardTheme.dark },
            lightSquareStyle: { backgroundColor: boardTheme.light },
            pieces:           customPieces,
            showNotation,
            animationDurationInMs: 0,
            showAnimations:   false,
          }}
        />
        <ArrowLayer arrows={arrows} orientation={boardOrientation} />
      </div>

      {/* Question */}
      <p style={{
        margin: '0 0 14px', fontSize: 15, fontWeight: 700,
        color: 'var(--ivory)', lineHeight: 1.4,
        fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
      }}>
        Почему этот ход?
      </p>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {q.options.map((opt, oi) => {
          const isCorrect  = oi === q.correctIdx;
          const isSelected = oi === selected;
          let borderColor = 'var(--hairline)', bg = 'transparent', color = 'var(--muted)';
          if (answered) {
            if (isCorrect)       { borderColor = 'rgba(80,200,80,0.6)'; bg = 'rgba(80,200,80,0.08)'; color = 'rgba(130,220,100,0.95)'; }
            else if (isSelected) { borderColor = 'rgba(220,60,60,0.5)'; bg = 'rgba(220,60,60,0.06)'; color = 'rgba(220,100,80,0.9)'; }
          }
          return (
            <button key={oi} onClick={() => handleSelect(oi)} disabled={answered}
              style={{
                textAlign: 'left', padding: '9px 12px',
                border: `1px solid ${borderColor}`, background: bg, color,
                fontSize: 13, fontFamily: 'inherit',
                cursor: answered ? 'default' : 'pointer', lineHeight: 1.5,
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* Full comment revealed after answer */}
      {answered && (
        <div style={{
          margin: '0 0 16px', padding: '10px 14px',
          border: '1px solid var(--hairline)', background: 'var(--surface)',
          fontSize: 13, color: 'var(--ivory)', lineHeight: 1.6,
        }}>
          {q.move.comment}
        </div>
      )}

      {/* Next */}
      {answered && (
        <button onClick={handleNext} style={PRIMARY}>
          {qIdx === total - 1 ? 'Завершить' : 'Следующий →'}
        </button>
      )}
    </Overlay>
  );
}

// ── Style constants ────────────────────────────────────────────────────────────

const PRIMARY: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px',
  background: 'var(--ivory)', color: 'var(--ink)',
  fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
  flexShrink: 0, fontFamily: 'inherit',
};

const SECONDARY: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px',
  background: 'transparent', color: 'var(--muted)',
  fontSize: 13, border: '1px solid var(--hairline)', cursor: 'pointer',
  flexShrink: 0, fontFamily: 'inherit',
};
