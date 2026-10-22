'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ChessBoardWrapper from '@/components/ChessBoardWrapper';
import { supabase } from '@/lib/supabase';
import { checkAndAwardBadges } from '@/lib/badges';
import type { Opening, OpeningLine, LineProgress, ChessMove } from '@/types/openings';

interface LineWithProgress extends OpeningLine {
  line_progress: LineProgress[];
}

interface Props {
  params: Promise<{ id: string }>;
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

function weightedRandom(lines: LineWithProgress[]): LineWithProgress | null {
  if (lines.length === 0) return null;
  const weights = lines.map((l) => getWeight(l.line_progress?.[0] ?? null));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < lines.length; i++) {
    r -= weights[i];
    if (r <= 0) return lines[i];
  }
  return lines[lines.length - 1];
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

  // Per-line tracking
  const [hadWrongMove, setHadWrongMove] = useState(false);

  // Celebration overlay
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationXP, setCelebrationXP] = useState(0);

  // Player color for current line
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');

  // Board reset key — increment to remount ChessBoardWrapper with a fresh state
  const [boardKey, setBoardKey] = useState(0);

  // Played moves for side panel
  const [playedMoves, setPlayedMoves] = useState<string[]>([]);

  // Hint state
  const [hintActive, setHintActive] = useState(false);

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
        firstLine = weightedRandom(lines);
      }

      if (firstLine) {
        setCurrentLine(firstLine);
        setPlayerColor(resolveColor(openingData as Opening, firstLine));
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
      const next = weightedRandom(latestLines);
      if (next && opening) {
        setCurrentLine(next);
        setPlayerColor(resolveColor(opening, next));
        setHadWrongMove(false);
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

  async function updateProgress(line: LineWithProgress, correct: boolean) {
    const existingProg = line.line_progress?.[0] ?? null;
    const now = new Date().toISOString();

    if (correct) {
      const oldMastery = existingProg?.mastery ?? 0;
      const newMastery = Math.min(oldMastery + 1, 5);
      const xpEarned = hadWrongMove ? 0 : 5;

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

      // Award XP if no wrong moves
      if (xpEarned > 0) {
        const { data: xpRow } = await supabase
          .from('user_xp')
          .select('total_xp')
          .eq('id', 1)
          .maybeSingle();

        const currentXp = (xpRow as { total_xp?: number } | null)?.total_xp ?? 0;
        await supabase
          .from('user_xp')
          .upsert({ id: 1, total_xp: currentXp + xpEarned }, { onConflict: 'id' });
      }

      // Refresh line in allLines state with updated progress
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

      return xpEarned;
    } else {
      // Wrong — demote mastery
      const oldMastery = existingProg?.mastery ?? 0;
      const newMastery = Math.max(oldMastery - 1, 0);

      if (existingProg) {
        await supabase
          .from('line_progress')
          .update({
            incorrect_count: (existingProg.incorrect_count ?? 0) + 1,
            mastery: newMastery,
            next_review: now,
            last_practiced: now,
          })
          .eq('id', existingProg.id);
      } else {
        await supabase.from('line_progress').insert({
          line_id: line.id,
          correct_count: 0,
          incorrect_count: 1,
          mastery: 0,
          next_review: now,
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
                next_review: now,
                last_practiced: now,
              }
            : {
                id: '',
                line_id: line.id,
                correct_count: 0,
                incorrect_count: 1,
                mastery: 0,
                next_review: now,
                last_practiced: now,
              };
          return { ...l, line_progress: [updatedProg] };
        }),
      );

      return 0;
    }
  }

  // ── onComplete callback from ChessBoardWrapper ─────────────────────────────

  const handleComplete = useCallback(
    async (correct: boolean) => {
      if (!currentLine) return;

      if (correct) {
        setSessionCorrect((c) => c + 1);
        const xp = await updateProgress(currentLine, true);
        setCelebrationXP(xp);
        setCelebrating(true);
        checkAndAwardBadges().catch(() => {});

        setTimeout(() => {
          setCelebrating(false);
          setAllLines((latest) => {
            pickNextLine(latest);
            return latest;
          });
        }, 1800);
      } else {
        setSessionIncorrect((c) => c + 1);
        await updateProgress(currentLine, false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentLine, hadWrongMove],
  );

  const handleMoveWrong = useCallback(() => {
    setHadWrongMove(true);
  }, []);

  function handleSkip() {
    setAllLines((latest) => {
      pickNextLine(latest);
      return latest;
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6 flex flex-col items-center gap-6">
        <div className="w-full max-w-[600px] aspect-square bg-[#0D0D0D] border border-[#262626] rounded-[20px] animate-pulse" />
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
      {/* Celebration overlay — full-screen, above everything */}
      {celebrating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050505]/90">
          <div className="font-cormorant text-[80px] leading-none text-[#FFFFFF]">✓</div>
          <div className="font-cormorant text-[48px] font-[500] mt-4 text-[#F5F5F5]">
            Линия освоена!
          </div>
          {celebrationXP > 0 && (
            <div className="text-[20px] text-[#D0D0D0] mt-2 font-medium">
              +{celebrationXP} XP
            </div>
          )}
        </div>
      )}

      <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">
        {/* Header row: back + opening name + session stats */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <Link
            href={`/openings/${id}`}
            className="inline-flex items-center gap-2 text-[13px] text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors no-underline"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Дебюты
          </Link>

          <div className="flex items-center gap-3">
            <span className="font-cormorant text-[26px] leading-none text-[#F5F5F5] font-[500]">
              {opening.name}
            </span>
            <span className="w-px h-4 bg-[#262626]" />
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#FFFFFF]">
              Практика
            </span>
          </div>

          {/* Session stats inline */}
          <div className="flex items-center gap-4 text-[14px]">
            <span className="text-[#A0A0A0]">Сессия:</span>
            <span className="font-semibold text-[#D0D0D0]">{sessionCorrect} ✓</span>
            <span className="font-semibold text-[#A0A0A0]">{sessionIncorrect} ✗</span>
          </div>
        </div>

        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_240px] xl:grid-cols-[220px_1fr_260px] gap-5 items-start">

          {/* Left column — move list panel */}
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#262626]">
              <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Сыгранные ходы</span>
            </div>
            <div className="px-4 py-3 max-h-[500px] overflow-y-auto">
              <MoveList moves={playedMoves} />
            </div>
          </div>

          {/* Center column — board + hint button */}
          <div className="flex flex-col items-center gap-3">
            {/* Player color indicator */}
            <div className="text-[13px] text-[#A0A0A0] self-start">
              {playerColor === 'w' ? '♙ Вы играете белыми' : '♟ Вы играете чёрными'}
            </div>

            {/* Board */}
            {currentLine && (
              <ChessBoardWrapper
                key={boardKey}
                line={currentLine.moves as ChessMove[]}
                playerColor={playerColor}
                onComplete={handleComplete}
                onMoveWrong={handleMoveWrong}
                showHint={hintActive}
                onMovesChange={(moves) => setPlayedMoves(moves)}
              />
            )}

            {/* Hint button */}
            <button
              onClick={() => { setHintActive(true); setTimeout(() => setHintActive(false), 2000); }}
              className="h-9 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-5 text-[14px] transition-colors bg-transparent cursor-pointer flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              Подсказка
            </button>
          </div>

          {/* Right column — controls */}
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-5 flex flex-col gap-5">
            {/* Current line */}
            <div className="flex flex-col gap-3">
              <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">
                Текущая линия
              </span>
              {currentLine && (
                <>
                  <p className="m-0 text-[14px] font-mono text-[#A0A0A0] leading-relaxed break-words">
                    {lineLabel}
                  </p>
                  {/* Mastery dots */}
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

            {/* Played moves in right panel */}
            {playedMoves.length > 0 && (
              <div className="flex flex-col gap-[3px] border-t border-[#1E1E1E] pt-3">
                <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0] mb-2">Ходы</span>
                <MoveList moves={playedMoves} />
              </div>
            )}

            <div className="border-t border-[#1E1E1E]" />

            {/* Session stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-[2px]">
                <span className="text-[13px] text-[#A0A0A0]">Верно</span>
                <span className="font-cormorant text-[32px] font-semibold leading-[1.1] text-[#D0D0D0]">
                  {sessionCorrect}
                </span>
              </div>
              <div className="flex flex-col gap-[2px]">
                <span className="text-[13px] text-[#A0A0A0]">Ошибок</span>
                <span className="font-cormorant text-[32px] font-semibold leading-[1.1] text-[#A0A0A0]">
                  {sessionIncorrect}
                </span>
              </div>
            </div>

            <div className="text-[13px] text-[#505050]">
              Линия {sessionCount + 1} из {allLines.length} {pluralLines(allLines.length)}
            </div>

            <div className="border-t border-[#1E1E1E]" />

            {/* All lines mini-list */}
            <div className="flex flex-col gap-[6px] max-h-[200px] overflow-y-auto">
              {allLines.map((line, i) => {
                const prog = line.line_progress?.[0] ?? null;
                const isActive = currentLine?.id === line.id;
                return (
                  <div
                    key={line.id}
                    className={`flex items-center gap-3 px-3 py-[6px] rounded-[10px] transition-colors ${
                      isActive ? 'bg-[#1A1A1A] border border-[#303030]' : 'border border-transparent'
                    }`}
                  >
                    <span className="text-[12px] text-[#505050] w-5 text-right shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-[3px] shrink-0">
                      {Array.from({ length: 5 }, (_, dot) => (
                        <span
                          key={dot}
                          className={`inline-block w-[6px] h-[6px] rounded-full ${
                            dot < (prog?.mastery ?? 0) ? 'bg-[#FFFFFF]' : 'bg-[#262626]'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[12px] font-mono text-[#505050] truncate flex-1">
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
              className="h-11 w-full border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-6 text-[15px] font-medium transition-colors bg-transparent cursor-pointer"
            >
              Следующая
            </button>

            {/* Back link */}
            <Link
              href={`/openings/${id}`}
              className="inline-flex items-center justify-center gap-1 text-[13px] text-[#505050] hover:text-[#A0A0A0] transition-colors no-underline text-center"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
              К дебюту
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
