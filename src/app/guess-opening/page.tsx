'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import {
  STATIC_OPENINGS,
  guessScore,
  seededRNG,
  dateToSeed,
  buildInitialOptions,
  filterOptions,
  type OpeningDef,
} from '@/data/openings-names';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'idle' | 'playing' | 'done';

interface DayRecord {
  opening_id: string;
  score: number;
  moves_shown: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function movesToDisplay(moves: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) parts.push(`${Math.floor(i / 2) + 1}.`);
    parts.push(moves[i]);
  }
  return parts.join(' ');
}

function replayFen(moves: string[]): string {
  const chess = new Chess();
  for (const m of moves) {
    try { chess.move(m); } catch { break; }
  }
  return chess.fen();
}

function pluralMoves(n: number): string {
  if (n === 1) return 'ход';
  if (n >= 2 && n <= 4) return 'хода';
  return 'ходов';
}

function pluralOptions(n: number): string {
  if (n === 1) return 'вариант';
  if (n >= 2 && n <= 4) return 'варианта';
  return 'вариантов';
}

function pluralPoints(n: number): string {
  if (n === 1) return 'очко';
  if (n >= 2 && n <= 4) return 'очка';
  return 'очков';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GuessOpeningPage() {
  const { boardTheme, customPieces, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();

  const today    = useMemo(() => new Date(), []);
  const todayStr = today.toISOString().slice(0, 10);
  const seed     = dateToSeed(today);

  const [dayRecord, setDayRecord] = useState<DayRecord | null>(null);
  const [phase, setPhase]         = useState<Phase>('loading');

  // Game state
  const [scored, setScored]           = useState(false);
  const [target, setTarget]           = useState<OpeningDef | null>(null);
  const [revealed, setRevealed]       = useState<string[]>([]);
  const [initOptions, setInitOptions] = useState<OpeningDef[]>([]);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [correct, setCorrect]         = useState<boolean | null>(null);
  const [finalScore, setFinalScore]   = useState(0);

  useEffect(() => {
    async function load() {
      const dayRes = await supabase
        .from('opening_guess_log')
        .select('opening_id,score,moves_shown')
        .eq('day', todayStr)
        .maybeSingle();
      if (dayRes.data) setDayRecord(dayRes.data as DayRecord);
      setPhase('idle');
    }
    load();
  }, [todayStr]);

  function startGame(isScored: boolean) {
    const gameSeed = isScored ? seed : (seed + Date.now());
    const rng = seededRNG(gameSeed);
    const idx = Math.floor(rng() * STATIC_OPENINGS.length);
    const t = STATIC_OPENINGS[idx];
    const opts = buildInitialOptions(STATIC_OPENINGS, t, gameSeed);
    // Reveal first move immediately
    const firstRevealed = t.moves.length > 0 ? [t.moves[0]] : [];
    setScored(isScored);
    setTarget(t);
    setInitOptions(opts);
    setRevealed(firstRevealed);
    setSelectedId(null);
    setCorrect(null);
    setFinalScore(0);
    setPhase('playing');
  }

  const currentOptions = useMemo(
    () => (target ? filterOptions(initOptions, revealed) : []),
    [initOptions, revealed, target],
  );

  const fen = useMemo(() => replayFen(revealed), [revealed]);

  function revealNext() {
    if (!target) return;
    const nextIdx = revealed.length;
    if (nextIdx >= target.moves.length) return;
    const newRevealed = [...revealed, target.moves[nextIdx]];
    setRevealed(newRevealed);
    const remaining = filterOptions(initOptions, newRevealed);
    if (remaining.length === 1) handlePick(remaining[0].id, newRevealed);
  }

  async function handlePick(id: string, rev?: string[]) {
    if (!target || correct !== null) return;
    const usedRevealed = rev ?? revealed;
    const isCorrect = id === target.id;
    const sc = isCorrect ? guessScore(usedRevealed.length) : 0;

    setSelectedId(id);
    setCorrect(isCorrect);
    setFinalScore(sc);
    setPhase('done');

    if (scored) {
      await supabase.from('opening_guess_log').upsert({
        day: todayStr,
        opening_id: target.id,
        score: sc,
        moves_shown: usedRevealed.length,
      }, { onConflict: 'day' });
      setDayRecord({ opening_id: target.id, score: sc, moves_shown: usedRevealed.length });
    }
  }

  const boardKey = `${boardThemeId}-${pieceStyleId}`;
  const nextPts  = target ? guessScore(revealed.length + 1) : 10;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <main className="page-wrap">
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
      </main>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="page-wrap">
      {/* Header */}
      <div className="page-header">
        <Link href="/" className="ui-back">← Сегодня</Link>
        <div className="ui-eyebrow">
          <span>Ежедневная игра</span>
          <span className="ui-eyebrow-line" />
          <span>{todayStr}</span>
        </div>
        <h1 className="ui-h1">Угадай дебют</h1>
        <p className="ui-sub">Смотри ходы и определи дебют. Чем раньше угадаешь — тем больше очков.</p>
      </div>

      {/* Idle — start screen */}
      {phase === 'idle' && (
        <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {dayRecord ? (
            <div className="ui-card ui-card-lg">
              <div className="ui-eyebrow" style={{ marginBottom: 10 }}>
                <span>Сегодня сыграно</span>
              </div>
              <div style={{ fontSize: 44, fontWeight: 700, color: 'var(--ivory)', lineHeight: 1,
                fontFamily: 'var(--font-inter-tight, Inter Tight, Inter, sans-serif)' }}>
                {dayRecord.score} {pluralPoints(dayRecord.score)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
                {dayRecord.moves_shown} {pluralMoves(dayRecord.moves_shown)} показано
              </div>
            </div>
          ) : (
            <div className="ui-card ui-card-lg">
              <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65 }}>
                Ходы открываются по одному. После каждого хода можно угадать дебют из предложенных вариантов.
                Один зачётный раунд в день — потом можно тренироваться без очков.
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!dayRecord && (
              <button className="ui-btn ui-btn-primary" onClick={() => startGame(true)}>
                Играть (зачётный)
              </button>
            )}
            <button className="ui-btn ui-btn-ghost" onClick={() => startGame(false)}>
              Тренировка
            </button>
          </div>
        </div>
      )}

      {/* Playing / Done */}
      {(phase === 'playing' || phase === 'done') && target && (
        <div className="board-layout">
          {/* ── Board column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="board-wrap">
              <Chessboard
                key={boardKey}
                options={{
                  position: phase === 'done' && correct === false ? replayFen(target.moves) : fen,
                  boardOrientation: 'white',
                  allowDragging: false,
                  boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
                  darkSquareStyle:  { backgroundColor: boardTheme.dark },
                  lightSquareStyle: { backgroundColor: boardTheme.light },
                  pieces: customPieces,
                  showNotation: true,
                  animationDurationInMs: animationMs,
                }}
              />
            </div>

            {/* Moves text */}
            <div className="ui-card ui-card-sm" style={{ fontFamily: 'ui-monospace, monospace',
              fontSize: 14, lineHeight: 1.7, color: 'var(--ivory)', minHeight: 48 }}>
              {movesToDisplay(revealed)}
            </div>
          </div>

          {/* ── Right column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status bar */}
            {phase === 'playing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--ivory)' }}>{currentOptions.length}</strong> {pluralOptions(currentOptions.length)} осталось
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Сейчас: <strong style={{ color: 'var(--ivory)' }}>{guessScore(revealed.length)}</strong> {pluralPoints(guessScore(revealed.length))}
                </div>
                {revealed.length < target.moves.length && (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    След. ход: {nextPts} {pluralPoints(nextPts)}
                  </div>
                )}
              </div>
            )}

            {/* Result banner */}
            {phase === 'done' && (
              <div className={`ui-banner ${correct ? 'ui-banner-success' : 'ui-banner-danger'}`}>
                {correct ? (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ivory)', marginBottom: 6,
                      fontFamily: 'var(--font-inter-tight, Inter Tight, Inter, sans-serif)' }}>
                      Верно! +{finalScore} {pluralPoints(finalScore)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      <strong style={{ color: 'var(--ivory)' }}>{target.name}</strong>
                      {target.eco && <span> · ECO {target.eco}</span>}
                      <span> · {revealed.length} {pluralMoves(revealed.length)} показано</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ivory)', marginBottom: 6 }}>
                      Неверно — 0 очков
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Правильный ответ: <strong style={{ color: 'var(--ivory)' }}>{target.name}</strong>
                      {target.eco && <span> · ECO {target.eco}</span>}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Options */}
            <div className="options-grid">
              {currentOptions.map(opt => {
                const isPicked  = selectedId === opt.id;
                const isTarget  = opt.id === target.id;
                const showState = phase === 'done';
                const cls = showState && isTarget
                  ? 'option-card option-card-correct'
                  : showState && isPicked && !isTarget
                  ? 'option-card option-card-wrong'
                  : 'option-card';
                return (
                  <button
                    key={opt.id}
                    className={cls}
                    disabled={phase === 'done'}
                    onClick={() => handlePick(opt.id)}
                  >
                    {opt.name}
                    {opt.eco && <span className="option-card-eco">ECO {opt.eco}</span>}
                  </button>
                );
              })}
            </div>

            {/* Playing controls */}
            {phase === 'playing' && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {revealed.length < target.moves.length && (
                  <button className="ui-btn ui-btn-ghost" onClick={revealNext} title="Нажми, чтобы увидеть следующий ход">
                    Следующий ход →
                  </button>
                )}
                {revealed.length < target.moves.length && (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Нажми, чтобы увидеть следующий ход</span>
                )}
                {revealed.length >= target.moves.length && currentOptions.length > 1 && (
                  <div style={{ fontSize: 13, color: 'var(--muted)', alignSelf: 'center' }}>
                    Все ходы показаны — выбери вариант
                  </div>
                )}
              </div>
            )}

            {/* Done controls */}
            {phase === 'done' && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="ui-btn ui-btn-primary" onClick={() => startGame(false)}>
                  Ещё раз (тренировка)
                </button>
                <Link href="/" className="ui-btn ui-btn-outline">На главную</Link>
              </div>
            )}

            {/* Scoring legend */}
            {phase === 'playing' && (
              <div className="scoring-legend">
                {[1, 2, 3, 4, 5].map(n => (
                  <div key={n} className="scoring-slot">
                    <div className={`scoring-slot-pts ${revealed.length + 1 === n ? 'scoring-slot-pts-active' : ''}`}>
                      {guessScore(n)}
                    </div>
                    <div className="scoring-slot-label">после {n} {pluralMoves(n)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
