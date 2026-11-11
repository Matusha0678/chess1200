'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ChessBoardWrapper from '@/components/ChessBoardWrapper';
import { supabase } from '@/lib/supabase';
import type { Opening, OpeningLine, LineProgress, ChessMove } from '@/types/openings';

interface LineWithProgress extends OpeningLine {
  line_progress: LineProgress[];
}

interface Props {
  params: Promise<{ id: string }>;
}

// ── Move-level mistake recording ─────────────────────────────────────────────

async function recordMoveMistake(lineId: string, moveIndex: number) {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('line_move_progress')
    .select('id, incorrect_count')
    .eq('line_id', lineId)
    .eq('move_index', moveIndex)
    .maybeSingle();
  if (data) {
    const row = data as { id: string; incorrect_count: number };
    supabase
      .from('line_move_progress')
      .update({ incorrect_count: row.incorrect_count + 1, last_missed_at: now })
      .eq('id', row.id)
      .then(() => {});
  } else {
    supabase
      .from('line_move_progress')
      .insert({ line_id: lineId, move_index: moveIndex, incorrect_count: 1, last_missed_at: now })
      .then(() => {});
  }
}

// ── Spaced-repetition helpers ────────────────────────────────────────────────

function getWeight(prog: LineProgress | null): number {
  if (!prog || prog.mastery === 0) return 100;
  const now = new Date().toISOString();
  const isDue = prog.next_review <= now;
  if (isDue) return 80;
  if (prog.mastery <= 2) return 30;
  if (prog.mastery <= 4) return 15;
  return 5;
}

function weightedRandom(lines: LineWithProgress[], excludeIds: string[] = []): LineWithProgress | null {
  if (lines.length === 0) return null;
  // Exclude recently played lines only when there are alternatives
  const pool = lines.length > excludeIds.length
    ? lines.filter((l) => !excludeIds.includes(l.id))
    : lines;
  const source = pool.length > 0 ? pool : lines;
  const weights = source.map((l) => getWeight(l.line_progress?.[0] ?? null));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < source.length; i++) {
    r -= weights[i];
    if (r <= 0) return source[i];
  }
  return source[source.length - 1];
}

function nextReviewDate(mastery: number): string {
  const days: Record<number, number> = {
    0: 1,
    1: 3,
    2: 7,
    3: 14,
    4: 30,
    5: 60,
  };
  const d = days[Math.min(mastery, 5)] ?? 60;
  const date = new Date();
  date.setDate(date.getDate() + d);
  return date.toISOString();
}

function pluralLines(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 19) return 'линий';
  const last = n % 10;
  if (last === 1) return 'линия';
  if (last >= 2 && last <= 4) return 'линии';
  return 'линий';
}

function abbreviateLine(line: LineWithProgress, max = 10): string {
  const moves = line.moves.slice(0, max);
  const parts: string[] = [];
  moves.forEach((m, idx) => {
    if (m.color === 'w') parts.push(`${Math.floor(idx / 2) + 1}.`);
    parts.push(m.san);
  });
  if (line.moves.length > max) parts.push('...');
  return parts.join(' ');
}

// ── Move list renderer ────────────────────────────────────────────────────────

function MoveList({ moves }: { moves: string[] }) {
  if (moves.length === 0) {
    return <span className="text-[13px] text-[#505050]">Ходы пока не сделаны</span>;
  }
  return (
    <div className="flex flex-col gap-[3px]">
      {Array.from({ length: Math.ceil(moves.length / 2) }, (_, pairIdx) => {
        const w = moves[pairIdx * 2];
        const b = moves[pairIdx * 2 + 1];
        const isLastW = pairIdx * 2 === moves.length - 1;
        const isLastB = pairIdx * 2 + 1 === moves.length - 1;
        return (
          <div key={pairIdx} className="grid grid-cols-[24px_1fr_1fr] gap-x-2 items-center">
            <span className="text-[12px] text-[#505050] text-right">{pairIdx + 1}.</span>
            <span className={`text-[13px] font-mono px-1 py-[1px] rounded ${isLastW ? 'bg-[#1A1A1A] text-[#FFFFFF] font-semibold' : 'text-[#A0A0A0]'}`}>{w ?? ''}</span>
            <span className={`text-[13px] font-mono px-1 py-[1px] rounded ${isLastB ? 'bg-[#1A1A1A] text-[#FFFFFF] font-semibold' : 'text-[#A0A0A0]'}`}>{b ?? ''}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PracticePage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceLineId = searchParams.get('line');

  const [opening, setOpening] = useState<Opening | null>(null);
  const [allLines, setAllLines] = useState<LineWithProgress[]>([]);
  const [currentLine, setCurrentLine] = useState<LineWithProgress | null>(null);
  const [loading, setLoading] = useState(true);

  // Session stats
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionIncorrect, setSessionIncorrect] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);


  // Celebration / feedback overlay
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationXP, setCelebrationXP] = useState(0);
  const [celebrationCorrect, setCelebrationCorrect] = useState(true);

  // Player color for current line
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');

  // Board reset key — increment to remount ChessBoardWrapper with a fresh state
  const [boardKey, setBoardKey] = useState(0);

  // Played moves for side panel
  const [playedMoves, setPlayedMoves] = useState<string[]>([]);

  // Hint state
  const [hintActive, setHintActive] = useState(false);

  // Board flip
  const [boardFlipped, setBoardFlipped] = useState(false);

  // Session-done: all due/new lines exhausted
  const [sessionDone, setSessionDone] = useState(false);

  // Anti-repeat: remember last N picked line IDs
  const recentLineIds = useRef<string[]>([]);

  const [boardStatus, setBoardStatus] = useState<{
    feedback: 'correct' | 'wrong' | null;
    isPlayerTurn: boolean;
    isComplete: boolean;
    reviewsRemaining: number;
  }>({ feedback: null, isPlayerTurn: false, isComplete: false, reviewsRemaining: 0 });

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: openingData } = await supabase
        .from('openings')
        .select('*')
        .eq('id', id)
        .single();

      if (!openingData) {
        router.push('/openings');
        return;
      }

      setOpening(openingData as Opening);

      const { data: linesData } = await supabase
        .from('opening_lines')
        .select('*, line_progress(*)')
        .eq('opening_id', id)
        .order('line_index');

      const lines = (linesData as LineWithProgress[]) ?? [];
      setAllLines(lines);

      if (lines.length === 0) {
        setLoading(false);
        return;
      }

      // If a specific line was requested via ?line=
      let firstLine: LineWithProgress | null = null;
      if (forceLineId) {
        firstLine = lines.find((l) => l.id === forceLineId) ?? null;
      }
      if (!firstLine) {
        const now = new Date().toISOString();
        const dueOrNew = lines.filter((l) => {
          const prog = l.line_progress?.[0] ?? null;
          if (!prog) return true;
          return prog.next_review <= now && prog.mastery < 5;
        });
        setSessionTotal(dueOrNew.length);
        firstLine = dueOrNew.length > 0 ? weightedRandom(dueOrNew) : null;
      }

      if (firstLine) {
        setCurrentLine(firstLine);
        setPlayerColor(resolveColor(openingData as Opening, firstLine));
      } else {
        setSessionDone(true);
      }

      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Color resolution ───────────────────────────────────────────────────────

  function resolveColor(op: Opening, _line: LineWithProgress): 'w' | 'b' {
    if (op.color === 'white') return 'w';
    if (op.color === 'black') return 'b';
    return Math.random() < 0.5 ? 'w' : 'b';
  }

  // ── Pick next line ─────────────────────────────────────────────────────────

  const pickNextLine = useCallback(
    (latestLines: LineWithProgress[]) => {
      const now = new Date().toISOString();
      const dueOrNew = latestLines.filter((l) => {
        const prog = l.line_progress?.[0] ?? null;
        if (!prog) return true;
        return prog.next_review <= now && prog.mastery < 5;
      });

      if (dueOrNew.length === 0) {
        setSessionDone(true);
        return;
      }

      const next = weightedRandom(dueOrNew, recentLineIds.current);
      if (next && opening) {
        const maxRecent = Math.min(5, Math.max(1, Math.floor(dueOrNew.length / 3)));
        recentLineIds.current = [next.id, ...recentLineIds.current].slice(0, maxRecent);

        setCurrentLine(next);
        setPlayerColor(resolveColor(opening, next));
        setBoardKey((k) => k + 1);
        setSessionCount((c) => c + 1);
        setPlayedMoves([]);
        setHintActive(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opening],
  );

  // ── Update progress after completing a line ────────────────────────────────

  async function updateProgress(line: LineWithProgress, hadMistakes: boolean) {
    const existingProg = line.line_progress?.[0] ?? null;
    const now = new Date().toISOString();
    const oldMastery = existingProg?.mastery ?? 0;

    if (!hadMistakes) {
      // Perfect run → promote mastery, award XP
      const newMastery = Math.min(oldMastery + 1, 5);
      const xpEarned = 5;

      if (existingProg) {
        await supabase
          .from('line_progress')
          .update({
            correct_count: (existingProg.correct_count ?? 0) + 1,
            mastery: newMastery,
            next_review: nextReviewDate(newMastery),
            last_practiced: now,
          })
          .eq('id', existingProg.id);
      } else {
        await supabase.from('line_progress').insert({
          line_id: line.id,
          correct_count: 1,
          incorrect_count: 0,
          mastery: 1,
          next_review: nextReviewDate(1),
          last_practiced: now,
        });
      }

      const { data: xpRow } = await supabase
        .from('user_xp')
        .select('total_xp')
        .eq('id', 1)
        .maybeSingle();
      const currentXp = (xpRow as { total_xp?: number } | null)?.total_xp ?? 0;
      await supabase
        .from('user_xp')
        .upsert({ id: 1, total_xp: currentXp + xpEarned }, { onConflict: 'id' });

      setAllLines((prev) =>
        prev.map((l) => {
          if (l.id !== line.id) return l;
          const updatedProg: LineProgress = existingProg
            ? {
                ...existingProg,
                correct_count: (existingProg.correct_count ?? 0) + 1,
                mastery: newMastery,
                next_review: nextReviewDate(newMastery),
                last_practiced: now,
              }
            : {
                id: '',
                line_id: line.id,
                correct_count: 1,
                incorrect_count: 0,
                mastery: 1,
                next_review: nextReviewDate(1),
                last_practiced: now,
              };
          return { ...l, line_progress: [updatedProg] };
        }),
      );

      supabase.from('opening_practice_log').insert({
        opening_id: line.opening_id,
        line_id: line.id,
        practiced_at: now,
        correct: true,
        mastery_after: newMastery,
      }).then(() => {});

      return xpEarned;
    } else {
      // Had mistakes → mastery stays, shorter review interval (don't demote, don't promote)
      const newMastery = oldMastery;
      const reviewInterval = Math.max(0, oldMastery - 1);

      if (existingProg) {
        await supabase
          .from('line_progress')
          .update({
            incorrect_count: (existingProg.incorrect_count ?? 0) + 1,
            mastery: newMastery,
            next_review: nextReviewDate(reviewInterval),
            last_practiced: now,
          })
          .eq('id', existingProg.id);
      } else {
        await supabase.from('line_progress').insert({
          line_id: line.id,
          correct_count: 0,
          incorrect_count: 1,
          mastery: 0,
          next_review: nextReviewDate(0),
          last_practiced: now,
        });
      }

      setAllLines((prev) =>
        prev.map((l) => {
          if (l.id !== line.id) return l;
          const updatedProg: LineProgress = existingProg
            ? {
                ...existingProg,
                incorrect_count: (existingProg.incorrect_count ?? 0) + 1,
                mastery: newMastery,
                next_review: nextReviewDate(reviewInterval),
                last_practiced: now,
              }
            : {
                id: '',
                line_id: line.id,
                correct_count: 0,
                incorrect_count: 1,
                mastery: 0,
                next_review: nextReviewDate(0),
                last_practiced: now,
              };
          return { ...l, line_progress: [updatedProg] };
        }),
      );

      supabase.from('opening_practice_log').insert({
        opening_id: line.opening_id,
        line_id: line.id,
        practiced_at: now,
        correct: false,
        mastery_after: newMastery,
      }).then(() => {});

      return 0;
    }
  }

  // ── onComplete callback from ChessBoardWrapper ─────────────────────────────

  const handleComplete = useCallback(
    async (correct: boolean, hadMistakes: boolean) => {
      if (!currentLine || !correct) return;

      if (!hadMistakes) {
        setSessionCorrect((c) => c + 1);
      } else {
        setSessionIncorrect((c) => c + 1);
      }

      const xp = await updateProgress(currentLine, hadMistakes);
      setCelebrationXP(xp);
      setCelebrationCorrect(!hadMistakes);
      setCelebrating(true);

      setTimeout(() => {
        setCelebrating(false);
        setAllLines((latest) => {
          pickNextLine(latest);
          return latest;
        });
      }, 1800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentLine],
  );

  const handleMoveMistake = useCallback((moveIndex: number) => {
    if (!currentLine) return;
    recordMoveMistake(currentLine.id, moveIndex);
  }, [currentLine]);

  function handleSkip() {
    setAllLines((latest) => {
      pickNextLine(latest);
      return latest;
    });
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setHintActive(true);
        setTimeout(() => setHintActive(false), 2000);
      }
      if ((e.key === 'n' || e.key === 'N' || e.key === ' ') && !celebrating) {
        e.preventDefault();
        setAllLines((latest) => {
          pickNextLine(latest);
          return latest;
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickNextLine, celebrating]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // CSS value shared between board column width and sidebar max-height calc
  const boardSize = 'min(calc(100vh - 213px), calc(100vw - 376px))';

  // Feedback bar appearance driven by boardStatus
  const { feedback: bf, isPlayerTurn: bpt, isComplete: bic, reviewsRemaining: brev } = boardStatus;
  const feedbackText = bf === 'correct'
    ? 'Верно!'
    : bf === 'wrong'
      ? 'Неверный ход — правильный выделен золотым'
      : brev > 0
        ? `Повтори ход${brev > 1 ? ` (${brev} осталось)` : ''}`
        : bic
          ? 'Линия завершена!'
          : bpt
            ? 'Ваш ход'
            : 'Соперник думает…';
  const feedbackIcon = bf === 'correct' ? '✓' : bf === 'wrong' ? '✗' : null;
  const feedbackBg = bf === 'correct'
    ? 'bg-[#141414] border-[#303030]'
    : bf === 'wrong'
      ? 'bg-[#1A1A1A] border-[#404040]'
      : 'bg-[#0D0D0D] border-[#262626]';
  const feedbackColor = bf === 'correct'
    ? 'text-[#D0D0D0]'
    : bf === 'wrong'
      ? 'text-[#A0A0A0]'
      : 'text-[#A0A0A0]';

  if (loading) {
    return (
      <main className="h-[calc(100vh-64px)] overflow-hidden flex flex-col items-center justify-center px-5 pt-5 pb-6">
        <div
          className="bg-[#0D0D0D] border border-[#262626] rounded-[4px] animate-pulse"
          style={{ width: boardSize, height: boardSize }}
        />
      </main>
    );
  }

  if (!opening || allLines.length === 0) {
    return (
      <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">
        <Link
          href={`/openings/${id}`}
          className="inline-flex items-center gap-2 text-[13px] text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors no-underline mb-6"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Назад
        </Link>
        <div className="text-center py-20 text-[#A0A0A0]">
          <p className="font-cormorant text-[32px] mb-3">Нет линий для тренировки</p>
          <p className="text-[15px]">Добавь PGN с вариациями к этому дебюту.</p>
        </div>
      </main>
    );
  }

  const lineLabel = currentLine ? abbreviateLine(currentLine) : '';
  const currentLineMastery = currentLine?.line_progress?.[0]?.mastery ?? 0;

  return (
    <>
      {/* Overlay: session done */}
      {sessionDone && !celebrating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050505]">
          <div className="text-[64px] leading-none select-none mb-6">✓</div>
          <div className="text-[32px] font-[500] text-[#F5F5F5] mb-2">На сегодня всё!</div>
          <div className="text-[15px] text-[#808080] mb-8">
            {sessionCorrect + sessionIncorrect > 0
              ? `${sessionCorrect + sessionIncorrect} ${pluralLines(sessionCorrect + sessionIncorrect)} пройдено`
              : 'Нечего повторять сегодня'}
          </div>
          <div className="flex gap-3">
            <a
              href="/"
              className="h-11 flex items-center bg-white text-[#050505] hover:bg-[#ECECEC] rounded-full px-7 text-[14px] font-semibold transition-colors no-underline"
            >
              На главную
            </a>
            <button
              onClick={() => {
                setSessionDone(false);
                setAllLines((latest) => {
                  const next = weightedRandom(latest, recentLineIds.current);
                  if (next && opening) {
                    recentLineIds.current = [next.id, ...recentLineIds.current].slice(0, 5);
                    setCurrentLine(next);
                    setPlayerColor(resolveColor(opening, next));
                    setBoardKey((k) => k + 1);
                    setSessionCount((c) => c + 1);
                    setPlayedMoves([]);
                    setHintActive(false);
                  }
                  return latest;
                });
              }}
              className="h-11 flex items-center border border-[#383838] text-[#A0A0A0] hover:border-[#A0A0A0] hover:text-[#F5F5F5] rounded-full px-7 text-[14px] transition-colors bg-transparent cursor-pointer"
            >
              Продолжить
            </button>
          </div>
        </div>
      )}

      {/* Overlay: correct or wrong completion */}
      {celebrating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050505]/90">
          {celebrationCorrect ? (
            <>
              <div className="font-cormorant text-[80px] leading-none text-[#FFFFFF]">✓</div>
              <div className="font-cormorant text-[48px] font-[500] mt-4 text-[#F5F5F5]">
                Линия освоена!
              </div>
              {celebrationXP > 0 && (
                <div className="text-[20px] text-[#D0D0D0] mt-2 font-medium">
                  +{celebrationXP} XP
                </div>
              )}
            </>
          ) : (
            <>
              <div className="font-cormorant text-[80px] leading-none text-[#686868]">○</div>
              <div className="font-cormorant text-[48px] font-[500] mt-4 text-[#A0A0A0]">
                Запомни линию
              </div>
            </>
          )}
        </div>
      )}

      {/* Full-viewport container — no scroll, nav=64px already above */}
      <main className="h-[calc(100vh-64px)] overflow-hidden flex flex-col px-5 md:px-10 pt-5 pb-6">

        {/* Center group: board + sidebar */}
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="flex items-start" style={{ gap: '36px' }}>

            {/* ── Board column ── */}
            <div className="flex flex-col flex-shrink-0" style={{ width: boardSize }}>

              {/* Player bar — 44px */}
              <div className="h-11 flex items-center justify-between gap-2 text-[13px] text-[#A0A0A0]">
                <span className="flex items-center gap-2">
                  {playerColor === 'w'
                    ? <><span className="text-[15px]">♙</span> Вы играете белыми</>
                    : <><span className="text-[15px]">♟</span> Вы играете чёрными</>}
                </span>
                <button
                  onClick={() => setBoardFlipped(f => !f)}
                  title="Перевернуть доску"
                  className={[
                    'flex items-center justify-center w-8 h-8 rounded transition-colors shrink-0',
                    boardFlipped ? 'bg-[#1E1E1E] text-[#F5F5F5]' : 'hover:bg-[#1A1A1A] text-[#505050] hover:text-[#A0A0A0]',
                  ].join(' ')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 16V4m0 0L3 8m4-4l4 4"/>
                    <path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
                  </svg>
                </button>
              </div>

              {/* 10px gap */}
              <div className="h-[10px] flex-shrink-0" />

              {/* Board — square, fills column width */}
              <div
                className="flex-shrink-0"
                style={{ width: boardSize, height: boardSize }}
              >
                {currentLine && (
                  <ChessBoardWrapper
                    key={boardKey}
                    line={currentLine.moves as ChessMove[]}
                    playerColor={playerColor}
                    onComplete={handleComplete}
                    onMoveMistake={handleMoveMistake}
                    showHint={hintActive}
                    flipBoard={boardFlipped}
                    onMovesChange={(moves) => setPlayedMoves(moves)}
                    onStatusChange={setBoardStatus}
                  />
                )}
              </div>

              {/* Feedback bar — 44px */}
              <div
                className={`h-11 flex-shrink-0 rounded-[12px] border px-5 text-[15px] font-medium transition-all duration-300 flex items-center gap-3 ${feedbackBg} ${feedbackColor}`}
              >
                {feedbackIcon
                  ? <span className="text-[17px] font-bold leading-none shrink-0">{feedbackIcon}</span>
                  : <span className="text-[17px] leading-none shrink-0 opacity-60">
                      {bpt ? '○' : bic ? '✓' : '…'}
                    </span>
                }
                <span>{feedbackText}</span>
              </div>
            </div>

            {/* ── Right sidebar ── */}
            <div
              className="flex-shrink-0 w-[260px] bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-5 flex flex-col gap-4 overflow-y-auto"
              style={{ maxHeight: `calc(${boardSize} + 98px)` }}
            >
              {/* Opening name + back link */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-cormorant text-[22px] leading-none text-[#F5F5F5] font-[500]">
                    {opening.name}
                  </span>
                  <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#505050]">
                    Практика
                  </span>
                </div>
                <Link
                  href={`/openings/${id}`}
                  className="shrink-0 h-8 flex items-center gap-1 text-[12px] text-[#505050] hover:text-[#A0A0A0] transition-colors no-underline"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                  </svg>
                  Назад
                </Link>
              </div>

              {/* Session progress */}
              {(() => {
                const done = sessionCorrect + sessionIncorrect;
                const remaining = Math.max(0, sessionTotal - done);
                const pct = sessionTotal > 0 ? Math.min(100, (done / sessionTotal) * 100) : 0;
                return (
                  <div className="flex flex-col gap-[8px]">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-[#505050]">Прогресс сессии</span>
                      <span className="text-[#D0D0D0] font-semibold tabular-nums">{done} / {sessionTotal}</span>
                    </div>
                    <div className="h-[3px] bg-[#1A1A1A] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#505050]">
                        {remaining > 0
                          ? `${remaining} ${remaining === 1 ? 'осталась' : remaining < 5 ? 'осталось' : 'осталось'}`
                          : 'всё сделано'}
                      </span>
                      <span className="flex items-center gap-2">
                        {sessionCorrect > 0 && <span className="text-[#606060]">{sessionCorrect} ✓</span>}
                        {sessionIncorrect > 0 && <span className="text-[#404040]">{sessionIncorrect} ✗</span>}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="border-t border-[#1E1E1E]" />

              {/* Current line + mastery */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#505050]">
                  Текущая линия
                </span>
                {currentLine && (
                  <>
                    <p className="m-0 text-[13px] font-mono text-[#A0A0A0] leading-relaxed break-words">
                      {lineLabel}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-[5px]">
                        {Array.from({ length: 5 }, (_, dot) => (
                          <span
                            key={dot}
                            className={`inline-block w-[8px] h-[8px] rounded-full transition-colors ${
                              dot < currentLineMastery ? 'bg-[#FFFFFF]' : 'bg-[#262626]'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[12px] text-[#505050]">{currentLineMastery}/5</span>
                    </div>
                  </>
                )}
              </div>

              {/* Hint button */}
              <button
                onClick={() => { setHintActive(true); setTimeout(() => setHintActive(false), 2000); }}
                className="h-9 w-full border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-5 text-[13px] transition-colors bg-transparent cursor-pointer flex items-center justify-center gap-2"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                Подсказка
              </button>
              <div className="flex justify-between text-[11px] text-[#404040]">
                <span>H — подсказка</span>
                <span>N / Space — следующая</span>
              </div>

              <div className="border-t border-[#1E1E1E]" />

              {/* Played moves */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#505050]">Ходы</span>
                <MoveList moves={playedMoves} />
              </div>

              <div className="border-t border-[#1E1E1E]" />

              {/* All-time stats */}
              {(() => {
                const atCorrect = allLines.reduce((s, l) => s + (l.line_progress?.[0]?.correct_count ?? 0), 0);
                const atIncorrect = allLines.reduce((s, l) => s + (l.line_progress?.[0]?.incorrect_count ?? 0), 0);
                const atTotal = atCorrect + atIncorrect;
                const atAccuracy = atTotal > 0 ? Math.round(atCorrect / atTotal * 100) : null;
                const lastPracticed = allLines
                  .map(l => l.line_progress?.[0]?.last_practiced ?? null)
                  .filter(Boolean)
                  .sort()
                  .at(-1) ?? null;
                if (atTotal === 0) return null;
                return (
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#505050]">За всё время</span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div className="flex flex-col gap-[1px]">
                        <span className="text-[11px] text-[#505050]">Попыток</span>
                        <span className="font-cormorant text-[22px] font-semibold leading-[1.1] text-[#F5F5F5]">{atTotal}</span>
                      </div>
                      <div className="flex flex-col gap-[1px]">
                        <span className="text-[11px] text-[#505050]">Точность</span>
                        <span className="font-cormorant text-[22px] font-semibold leading-[1.1] text-[#D0D0D0]">
                          {atAccuracy !== null ? `${atAccuracy}%` : '—'}
                        </span>
                      </div>
                    </div>
                    {lastPracticed && (
                      <span className="text-[11px] text-[#505050]">
                        Последнее: {(() => {
                          const diffDays = Math.floor((Date.now() - new Date(lastPracticed).getTime()) / 86400000);
                          if (diffDays === 0) return 'Сегодня';
                          if (diffDays === 1) return 'Вчера';
                          return `${diffDays} дн. назад`;
                        })()}
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="border-t border-[#1E1E1E]" />

              {/* All lines mini-list */}
              <div className="flex flex-col gap-[5px]">
                {allLines.map((line, i) => {
                  const prog = line.line_progress?.[0] ?? null;
                  const isActive = currentLine?.id === line.id;
                  return (
                    <div
                      key={line.id}
                      className={`flex items-center gap-2 px-2 py-[5px] rounded-[8px] transition-colors ${
                        isActive ? 'bg-[#1A1A1A] border border-[#303030]' : 'border border-transparent'
                      }`}
                    >
                      <span className="text-[11px] text-[#505050] w-4 text-right shrink-0">{i + 1}</span>
                      <div className="flex items-center gap-[3px] shrink-0">
                        {Array.from({ length: 5 }, (_, dot) => (
                          <span
                            key={dot}
                            className={`inline-block w-[5px] h-[5px] rounded-full ${
                              dot < (prog?.mastery ?? 0) ? 'bg-[#FFFFFF]' : 'bg-[#262626]'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] font-mono text-[#505050] truncate flex-1">
                        {line.moves.slice(0, 4).map((m, mi) => (mi === 0 ? '1.' : '') + m.san).join(' ')}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-[#1E1E1E]" />

              {/* Next button */}
              <button
                onClick={handleSkip}
                className="h-10 w-full border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-6 text-[14px] font-medium transition-colors bg-transparent cursor-pointer"
              >
                Следующая
              </button>
            </div>

          </div>
        </div>
      </main>
    </>
  );
}
