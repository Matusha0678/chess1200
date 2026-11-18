'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { DeviationMode } from '@/components/DeviationMode';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { useBoardKeys } from '@/hooks/useBoardKeys';
import { KeyHelpDialog } from '@/components/KeyHelpDialog';
import type { Opening, OpeningLine } from '@/types/openings';

interface Props {
  params: Promise<{ id: string }>;
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function pluralLines(n: number) {
  if (n % 100 >= 11 && n % 100 <= 19) return 'линий';
  const last = n % 10;
  if (last === 1) return 'линия';
  if (last >= 2 && last <= 4) return 'линии';
  return 'линий';
}

export default function StudyPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { boardTheme, customPieces, showNotation } = useBoardTheme();

  const [opening, setOpening] = useState<Opening | null>(null);
  const [allLines, setAllLines] = useState<OpeningLine[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation state
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [studiedLineIds, setStudiedLineIds] = useState<Set<string>>(new Set());
  const [allDone, setAllDone] = useState(false);

  // Board state
  const [fen, setFen] = useState(INITIAL_FEN);
  const [chess] = useState(() => new Chess());
  const [autoPlay, setAutoPlay] = useState(false);
  const [highlightSquares, setHighlightSquares] = useState<Record<string, React.CSSProperties>>({});
  const [flipped, setFlipped] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Deviation state
  const [showDeviation, setShowDeviation] = useState(false);
  const [devStats, setDevStats] = useState<{ ok: number; total: number } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: openingData } = await supabase
        .from('openings')
        .select('*')
        .eq('id', id)
        .single();
      if (!openingData) { router.push('/openings'); return; }
      setOpening(openingData as Opening);

      const { data: linesData } = await supabase
        .from('opening_lines')
        .select('*')
        .eq('opening_id', id)
        .order('line_index');
      const lines = (linesData as OpeningLine[]) ?? [];
      setAllLines(lines);

      // Load persisted study progress
      const lineIds = lines.map(l => l.id);
      if (lineIds.length > 0) {
        const { data: studyData } = await supabase
          .from('line_study')
          .select('line_id')
          .in('line_id', lineIds);
        setStudiedLineIds(new Set((studyData ?? []).map((s: { line_id: string }) => s.line_id)));
      }

      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const currentLine = allLines[currentLineIndex] ?? null;

  // Load deviation stats for current line
  const currentLineId = currentLine?.id ?? null;
  useEffect(() => {
    if (!currentLineId) return;
    supabase.from('deviation_log').select('ok').eq('line_id', currentLineId).then(({ data }) => {
      if (data) setDevStats({ ok: data.filter((r: { ok: boolean }) => r.ok).length, total: data.length });
    });
  }, [currentLineId]);

  async function markLineStudied(lineId: string) {
    await supabase.from('line_study').upsert(
      { line_id: lineId, last_studied: new Date().toISOString() },
      { onConflict: 'line_id' }
    );
  }

  function resetBoard(lineIdx: number) {
    chess.reset();
    setFen(chess.fen());
    setCurrentMoveIndex(0);
    setCurrentLineIndex(lineIdx);
    setHighlightSquares({});
    setAutoPlay(false);
  }

  const handleNext = useCallback(() => {
    if (!currentLine) return;
    const idx = currentMoveIndex;

    if (idx >= currentLine.moves.length) {
      // All moves shown — mark studied, go next
      setStudiedLineIds(prev => new Set([...prev, currentLine.id]));
      markLineStudied(currentLine.id);
      const nextIdx = currentLineIndex + 1;
      if (nextIdx < allLines.length) {
        resetBoard(nextIdx);
      } else {
        setAllDone(true);
      }
      return;
    }

    const move = currentLine.moves[idx];
    try {
      chess.move({ from: move.from, to: move.to });
    } catch { return; }

    setFen(chess.fen());
    setHighlightSquares({
      [move.from]: { background: 'rgba(255,255,255,0.12)' },
      [move.to]:   { background: 'rgba(255,255,255,0.25)' },
    });
    setCurrentMoveIndex(idx + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLine, currentMoveIndex, currentLineIndex, allLines.length, chess]);

  const handlePrev = useCallback(() => {
    if (currentMoveIndex === 0) return;
    const targetIdx = currentMoveIndex - 1;
    chess.reset();
    if (currentLine) {
      for (let i = 0; i < targetIdx; i++) {
        try { chess.move({ from: currentLine.moves[i].from, to: currentLine.moves[i].to }); } catch { break; }
      }
    }
    setFen(chess.fen());
    setCurrentMoveIndex(targetIdx);
    if (targetIdx > 0 && currentLine) {
      const m = currentLine.moves[targetIdx - 1];
      setHighlightSquares({
        [m.from]: { background: 'rgba(255,255,255,0.12)' },
        [m.to]:   { background: 'rgba(255,255,255,0.25)' },
      });
    } else {
      setHighlightSquares({});
    }
  }, [currentMoveIndex, currentLine, chess]);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const handleNextLine = useCallback(() => {
    if (currentLineIndex < allLines.length - 1) resetBoard(currentLineIndex + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLineIndex, allLines.length]);

  useBoardKeys({
    enabled: !helpOpen && !showDeviation,
    onPrev:     handlePrev,
    onNext:     handleNext,
    onFlip:     () => setFlipped(f => !f),
    onNextLine: handleNextLine,
    onHelp:     () => setHelpOpen(true),
  });

  // Auto-play
  useEffect(() => {
    if (!autoPlay) return;
    if (!currentLine) return;
    if (currentMoveIndex >= currentLine.moves.length) {
      // Line done — auto-advance after pause
      const t = setTimeout(() => {
        setStudiedLineIds(prev => new Set([...prev, currentLine.id]));
        markLineStudied(currentLine.id);
        const nextIdx = currentLineIndex + 1;
        if (nextIdx < allLines.length) {
          resetBoard(nextIdx);
          // keep autoplay on
          setAutoPlay(true);
        } else {
          setAllDone(true);
        }
      }, 1200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { handleNext(); }, 900);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, currentMoveIndex, currentLineIndex]);

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 pt-8 pb-10">
        <div className="animate-pulse flex flex-col gap-5">
          <div className="h-4 w-40 rounded-full" style={{ background: 'var(--surface2, #1E1E1E)' }} />
          <div className="h-10 w-72 rounded-[8px]" style={{ background: 'var(--surface2, #1E1E1E)' }} />
          <div className="h-[500px] rounded-[12px]" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }} />
        </div>
      </div>
    );
  }

  if (!opening || allLines.length === 0) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 pt-8 pb-10">
        <Link href={`/openings/${id}`}
          className="inline-flex items-center gap-2 text-[13px] no-underline mb-6"
          style={{ color: 'var(--muted)' }}>
          ← Назад
        </Link>
        <div className="text-center py-20" style={{ color: 'var(--muted)' }}>
          <p className="text-[28px] font-semibold mb-3" style={{ color: 'var(--ivory)' }}>Нет линий для изучения</p>
          <p className="text-[15px]">Добавь PGN с вариациями к этому дебюту.</p>
        </div>
      </div>
    );
  }

  // Completion screen
  if (allDone) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 pt-10 pb-16 flex flex-col items-center justify-center min-h-[60vh] gap-8 text-center">
        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#050505" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <div>
          <h2 className="text-[36px] font-semibold m-0 mb-2" style={{ color: 'var(--ivory)' }}>Все линии изучены!</h2>
          <p className="text-[16px] m-0" style={{ color: 'var(--muted)' }}>
            {allLines.length} {pluralLines(allLines.length)} — {opening.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href={`/openings/${id}/practice`}
            className="h-11 px-8 bg-white text-[#050505] rounded-[10px] text-[15px] font-semibold no-underline flex items-center hover:bg-[#F0F0F0] transition-colors">
            Перейти к тренировке →
          </Link>
          <button onClick={() => { setAllDone(false); resetBoard(0); }}
            className="h-11 px-6 rounded-[10px] text-[14px] bg-transparent cursor-pointer transition-colors"
            style={{ border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
            Повторить изучение
          </button>
          <Link href={`/openings/${id}`}
            className="h-11 px-6 rounded-[10px] text-[14px] no-underline flex items-center transition-colors"
            style={{ border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
            К дебюту
          </Link>
        </div>
      </div>
    );
  }

  const lineDone = currentMoveIndex >= (currentLine?.moves.length ?? 0);
  const baseOrientation: 'white' | 'black' = opening.color === 'black' ? 'black' : 'white';
  const boardOrientation: 'white' | 'black' = flipped ? (baseOrientation === 'white' ? 'black' : 'white') : baseOrientation;
  const playerColorCode: 'w' | 'b' = opening.color === 'black' ? 'b' : 'w';
  const nextOpponentMove = currentLine && currentMoveIndex < currentLine.moves.length
    ? currentLine.moves[currentMoveIndex]
    : null;
  const deviationAvailable = !!nextOpponentMove && nextOpponentMove.color !== playerColorCode;

  return (
    <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <Link href={`/openings/${id}`}
          className="inline-flex items-center gap-2 text-[13px] no-underline"
          style={{ color: 'var(--muted)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          {opening.name}
        </Link>
        <div className="flex items-center gap-3 text-[13px]">
          <span style={{ color: 'var(--muted)' }}>Учёба</span>
          <span className="w-px h-4" style={{ background: 'var(--hairline)' }} />
          <span className="font-semibold" style={{ color: 'var(--ivory)' }}>
            {studiedLineIds.size} / {allLines.length}
          </span>
          <span style={{ color: 'var(--muted)' }}>изучено</span>
        </div>
      </div>

      {/* 3-col layout */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_260px] gap-4 items-start">

        {/* LEFT — line list */}
        <div className="rounded-[12px] overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--muted)' }}>
              Линии · {allLines.length}
            </span>
          </div>
          <div className="flex flex-col max-h-[560px] overflow-y-auto">
            {allLines.map((line, i) => {
              const isActive = i === currentLineIndex;
              const isStudied = studiedLineIds.has(line.id);
              const firstMoves = line.moves.slice(0, 4).map((m, mi) => {
                if (m.color === 'w') return `${Math.floor(mi / 2) + 1}.${m.san}`;
                return m.san;
              }).join(' ');
              return (
                <button key={line.id} onClick={() => resetBoard(i)}
                  className="text-left px-4 py-3 transition-colors cursor-pointer w-full"
                  style={{
                    background: isActive ? 'var(--surface2, #1A1A1A)' : 'transparent',
                    borderBottom: '1px solid var(--hairline)',
                  }}>
                  <div className="flex items-center gap-2 mb-[2px]">
                    <span className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>{String(i + 1).padStart(2, '0')}</span>
                    {isStudied && (
                      <span className="w-4 h-4 rounded-full bg-white flex items-center justify-center shrink-0">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#050505" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] font-mono truncate" style={{ color: isActive ? 'var(--ivory)' : 'var(--muted)' }}>
                    {firstMoves}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* CENTER — board + controls */}
        <div className="flex flex-col items-center gap-3">
          {/* Progress */}
          <div className="w-full flex items-center justify-between text-[13px]" style={{ color: 'var(--muted)' }}>
            <span>
              Линия <span className="font-semibold" style={{ color: 'var(--ivory)' }}>{currentLineIndex + 1}</span> из {allLines.length}
            </span>
            <span>
              Ход <span className="font-semibold" style={{ color: 'var(--ivory)' }}>{currentMoveIndex}</span> из {currentLine?.moves.length ?? 0}
            </span>
          </div>

          {/* Board */}
          <div className="w-full max-w-[560px] aspect-square rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--hairline)' }}>
            <Chessboard
              options={{
                position: fen,
                boardOrientation,
                allowDragging: false,
                squareStyles: highlightSquares,
                boardStyle: { borderRadius: '0', width: '100%', height: '100%' },
                darkSquareStyle: { backgroundColor: boardTheme.dark },
                lightSquareStyle: { backgroundColor: boardTheme.light },
              }}
            />
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button onClick={handlePrev} disabled={currentMoveIndex === 0}
              className="h-9 px-4 rounded-[8px] text-[13px] bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
              ← Назад
            </button>

            <button onClick={() => setAutoPlay(v => !v)}
              className="h-9 px-4 rounded-[8px] text-[13px] cursor-pointer transition-colors bg-transparent"
              style={autoPlay
                ? { border: '1px solid var(--ivory)', color: 'var(--ivory)' }
                : { border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
              {autoPlay ? '⏸ Авто' : '▶ Авто'}
            </button>

            {!lineDone ? (
              <button onClick={handleNext}
                className="h-9 px-5 bg-white text-[#050505] hover:bg-[#F0F0F0] rounded-[8px] text-[13px] font-semibold cursor-pointer transition-colors">
                Следующий ход →
              </button>
            ) : (
              <button onClick={handleNext}
                className="h-9 px-5 bg-white text-[#050505] hover:bg-[#F0F0F0] rounded-[8px] text-[13px] font-semibold cursor-pointer transition-colors">
                {currentLineIndex < allLines.length - 1 ? 'Следующая линия →' : 'Завершить →'}
              </button>
            )}

            <button onClick={() => setFlipped(f => !f)} title="F — перевернуть доску"
              className="h-9 w-9 flex items-center justify-center rounded-[8px] bg-transparent cursor-pointer transition-colors"
              style={{ border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
            </button>

            <button onClick={() => setHelpOpen(true)} title="? — клавиши"
              className="h-9 w-9 flex items-center justify-center rounded-[8px] bg-transparent cursor-pointer transition-colors text-[13px] font-semibold"
              style={{ border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
              ?
            </button>

            <button
              onClick={() => setShowDeviation(true)}
              disabled={!deviationAvailable}
              style={{ height: 36, padding: '0 12px', border: '1px solid var(--hairline)', background: 'transparent', color: deviationAvailable ? 'rgba(220,80,60,0.9)' : 'var(--muted)', fontSize: 11, fontFamily: 'inherit', cursor: deviationAvailable ? 'pointer' : 'default', letterSpacing: '0.08em', opacity: deviationAvailable ? 1 : 0.4, borderRadius: 8 }}
            >
              ОТКЛ
            </button>
          </div>

          {/* Deviation stats */}
          {devStats && devStats.total > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em' }}>
              Отклонения: {devStats.ok} / {devStats.total}
            </div>
          )}

          {lineDone && (
            <button onClick={() => resetBoard(currentLineIndex)}
              className="text-[13px] bg-transparent border-0 cursor-pointer transition-colors"
              style={{ color: 'var(--muted)' }}>
              Повторить линию
            </button>
          )}
        </div>

        {/* RIGHT — current line moves */}
        <div className="rounded-[12px] overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--muted)' }}>
              Ходы линии {currentLineIndex + 1}
            </span>
            {lineDone && (
              <span className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>Изучено ✓</span>
            )}
          </div>
          <div className="px-4 py-4 flex flex-col gap-[3px] max-h-[500px] overflow-y-auto">
            {currentLine && Array.from(
              { length: Math.ceil(currentLine.moves.length / 2) },
              (_, pairIdx) => {
                const wIdx = pairIdx * 2;
                const bIdx = pairIdx * 2 + 1;
                const wMove = currentLine.moves[wIdx];
                const bMove = currentLine.moves[bIdx];
                const isLastW = wIdx === currentMoveIndex - 1;
                const isLastB = bIdx === currentMoveIndex - 1;
                return (
                  <div key={pairIdx} className="grid grid-cols-[22px_1fr_1fr] gap-x-2 items-center">
                    <span className="text-[12px] text-right" style={{ color: 'var(--muted)' }}>{pairIdx + 1}.</span>
                    <span
                      className="text-[13px] font-mono px-1 py-[1px] rounded transition-colors"
                      style={{
                        color: wIdx < currentMoveIndex ? 'var(--ivory)' : 'var(--muted)',
                        background: isLastW ? 'var(--surface2, #2A2A2A)' : undefined,
                      }}>
                      {wMove?.san ?? ''}
                    </span>
                    <span
                      className="text-[13px] font-mono px-1 py-[1px] rounded transition-colors"
                      style={{
                        color: bIdx < currentMoveIndex ? 'var(--ivory)' : 'var(--muted)',
                        background: isLastB ? 'var(--surface2, #2A2A2A)' : undefined,
                      }}>
                      {bMove?.san ?? ''}
                    </span>
                  </div>
                );
              }
            )}
          </div>

          {/* Progress bar for this line */}
          {currentLine && currentLine.moves.length > 0 && (
            <div className="px-4 pb-4">
              <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'var(--surface2, #1E1E1E)' }}>
                <div
                  className="h-full bg-white rounded-full transition-all duration-300"
                  style={{ width: `${(currentMoveIndex / currentLine.moves.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Study progress summary */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--hairline)' }}>
            <span className="text-[12px]" style={{ color: 'var(--muted)' }}>Изучено линий</span>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--ivory)' }}>
              {studiedLineIds.size} / {allLines.length}
            </span>
          </div>
        </div>
      </div>

      {/* Deviation overlay */}
      {showDeviation && nextOpponentMove && currentLine && (
        <DeviationMode
          startFen={fen}
          opponentLineUci={nextOpponentMove.from + nextOpponentMove.to}
          playerColor={playerColorCode}
          boardOrientation={boardOrientation}
          lineId={currentLine.id}
          boardTheme={boardTheme}
          customPieces={customPieces}
          showNotation={showNotation}
          onClose={() => setShowDeviation(false)}
        />
      )}

      {helpOpen && (
        <KeyHelpDialog
          onClose={() => setHelpOpen(false)}
          keys={[
            { key: '← →',    desc: 'Шаг назад / вперёд' },
            { key: 'N',       desc: 'Следующая линия' },
            { key: 'F',       desc: 'Перевернуть доску' },
            { key: '?',       desc: 'Список клавиш' },
            { key: 'Ctrl+K',  desc: 'Поиск' },
          ]}
        />
      )}
    </div>
  );
}
