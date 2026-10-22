'use client';

import { useState, useEffect, useCallback, use } from 'react';
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

        setTimeout(() => {
          setCelebrating(false);
          setAllLines((latest) => {
            pickNextLine(latest);
            return latest;
          });
        }, 1500);
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
      <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16 flex flex-col items-center gap-8">
        <div className="w-full max-w-[480px] h-[480px] bg-[#15130F] border border-[#2A2722] rounded-[20px] animate-pulse" />
      </main>
    );
  }

  if (!opening || allLines.length === 0) {
    return (
      <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">
        <Link
          href={`/openings/${id}`}
          className="inline-flex items-center gap-2 text-[14px] text-[#B3AC9F] hover:text-[#F3EEE5] transition-colors no-underline mb-8"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Назад
        </Link>
        <div className="text-center py-20 text-[#B3AC9F]">
          <p className="font-cormorant text-[32px] mb-3">Нет линий для тренировки</p>
          <p className="text-[15px]">Добавь PGN с вариациями к этому дебюту.</p>
        </div>
      </main>
    );
  }

  const lineLabel = currentLine
    ? abbreviateLine(currentLine)
    : '';

  return (
    <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
        <Link
          href={`/openings/${id}`}
          className="inline-flex items-center gap-2 text-[14px] text-[#B3AC9F] hover:text-[#F3EEE5] transition-colors no-underline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Назад
        </Link>

        {/* Session stats */}
        <div className="flex items-center gap-5 text-[13px]">
          <span className="text-[#B3AC9F]">
            Линия{' '}
            <span className="text-[#F3EEE5] font-semibold">{sessionCount + 1}</span>
          </span>
          <span className="w-px h-4 bg-[#2A2722]" />
          <span className="text-[#9BD3A6] font-semibold">{sessionCorrect} верно</span>
          <span className="text-[#D36B6B] font-semibold">{sessionIncorrect} ошибок</span>
        </div>
      </div>

      {/* Opening name + subtitle */}
      <div className="flex flex-col gap-2 mb-8">
        <div className="flex items-center gap-[14px] text-[13px] font-semibold tracking-[0.16em] uppercase text-[#D6B97E]">
          <span>{opening.name}</span>
          <span className="w-8 h-px bg-[#5A4C33]" />
          <span className="text-[#B3AC9F]">Практика</span>
        </div>
        {currentLine && (
          <p className="m-0 text-[13px] font-mono text-[#5A5249] truncate max-w-[600px]">
            Вариация {(currentLine.line_index ?? 0) + 1}: {lineLabel}
          </p>
        )}
      </div>

      {/* Board area */}
      <div className="flex flex-wrap gap-12 items-start">
        {/* Board */}
        <div className="flex-[1_1_480px] relative">
          {celebrating && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0D0C0A]/80 rounded-[20px] backdrop-blur-sm">
              <div className="bg-[#15130F] border border-[#4A3E28] rounded-[24px] px-10 py-8 flex flex-col items-center gap-3 shadow-2xl">
                <span className="text-[48px] leading-none select-none">♛</span>
                <h3 className="m-0 font-cormorant font-[500] text-[36px] text-[#D6B97E]">
                  Линия освоена!
                </h3>
                {celebrationXP > 0 && (
                  <span className="text-[16px] text-[#9BD3A6] font-semibold">+{celebrationXP} XP</span>
                )}
              </div>
            </div>
          )}

          {currentLine && (
            <ChessBoardWrapper
              key={boardKey}
              line={currentLine.moves as ChessMove[]}
              playerColor={playerColor}
              onComplete={handleComplete}
              onMoveWrong={handleMoveWrong}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside className="flex-[1_1_260px] flex flex-col gap-4">
          {/* Session summary card */}
          <div className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-6">
            <div className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F] mb-4">
              Сессия
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[12px] text-[#B3AC9F]">Верно</div>
                <div className="font-cormorant text-[40px] font-semibold leading-[1.1] text-[#9BD3A6]">
                  {sessionCorrect}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-[#B3AC9F]">Ошибок</div>
                <div className="font-cormorant text-[40px] font-semibold leading-[1.1] text-[#D36B6B]">
                  {sessionIncorrect}
                </div>
              </div>
            </div>
          </div>

          {/* All lines overview */}
          <div className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-5">
            <div className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F] mb-3">
              Линии — {allLines.length} {pluralLines(allLines.length)}
            </div>
            <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto">
              {allLines.map((line, i) => {
                const prog = line.line_progress?.[0] ?? null;
                const isActive = currentLine?.id === line.id;
                return (
                  <div
                    key={line.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-[10px] transition-colors ${
                      isActive ? 'bg-[#2A2218] border border-[#4A3E28]' : 'border border-transparent'
                    }`}
                  >
                    <span className="text-[12px] text-[#5A5249] w-5 text-right shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-[3px]">
                      {Array.from({ length: 5 }, (_, dot) => (
                        <span
                          key={dot}
                          className={`inline-block w-[6px] h-[6px] rounded-full ${
                            dot < (prog?.mastery ?? 0) ? 'bg-[#D6B97E]' : 'bg-[#2A2722]'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-mono text-[#5A5249] truncate flex-1">
                      {line.moves.slice(0, 4).map((m, mi) => (mi === 0 ? '1.' : '') + m.san).join(' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Skip button */}
          <button
            onClick={handleSkip}
            className="border border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E] hover:text-[#F3EEE5] rounded-full px-6 py-3 text-[14px] font-medium transition-colors bg-transparent cursor-pointer"
          >
            Следующая линия
          </button>
        </aside>
      </div>
    </main>
  );
}
