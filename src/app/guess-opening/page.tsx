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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GuessOpeningPage() {
  const { boardTheme, customPieces, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();

  const today      = useMemo(() => new Date(), []);
  const todayStr   = today.toISOString().slice(0, 10);
  const seed       = dateToSeed(today);

  // All available openings (static + user's from DB)
  const [pool, setPool]       = useState<OpeningDef[]>(STATIC_OPENINGS);
  const [dayRecord, setDayRecord] = useState<DayRecord | null>(null);
  const [phase, setPhase]     = useState<Phase>('loading');

  // Game state
  const [scored, setScored]   = useState(false);
  const [target, setTarget]   = useState<OpeningDef | null>(null);
  const [revealed, setRevealed]   = useState<string[]>([]);
  const [initOptions, setInitOptions] = useState<OpeningDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correct, setCorrect]      = useState<boolean | null>(null);
  const [finalScore, setFinalScore] = useState(0);

  // Load user openings + today's record
  useEffect(() => {
    async function load() {
      const [openingsRes, dayRes] = await Promise.all([
        supabase.from('openings').select('id,name').limit(100),
        supabase.from('opening_guess_log').select('opening_id,score,moves_shown').eq('day', todayStr).maybeSingle(),
      ]);
      const userOpenings: OpeningDef[] = (openingsRes.data ?? []).map(
        (o: { id: string; name: string }) => ({ id: `user-${o.id}`, name: o.name, moves: [] }),
      ).filter((o: OpeningDef) => o.moves.length === 0); // skip: no moves, can't be a target
      void userOpenings;
      // We only use static openings as targets (user openings have no moves in STATIC_OPENINGS)
      setPool(STATIC_OPENINGS);
      if (dayRes.data) setDayRecord(dayRes.data as DayRecord);
      setPhase('idle');
    }
    load();
  }, [todayStr]);

  function startGame(isScored: boolean) {
    const rng = seededRNG(seed + (isScored ? 0 : Date.now()));
    const idx = Math.floor(rng() * pool.length);
    const t = pool[idx];
    const opts = buildInitialOptions(pool, t, seed + (isScored ? 0 : Date.now()));
    setScored(isScored);
    setTarget(t);
    setInitOptions(opts);
    setRevealed([]);
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

    // If only 1 option remains after reveal, auto-finish
    const remaining = filterOptions(initOptions, newRevealed);
    if (remaining.length === 1) {
      handlePick(remaining[0].id, newRevealed);
    }
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

    // Save scored round (only once per day)
    if (scored && isCorrect) {
      await supabase.from('opening_guess_log').upsert({
        day: todayStr,
        opening_id: target.id,
        score: sc,
        moves_shown: usedRevealed.length,
      }, { onConflict: 'day' });
      setDayRecord({ opening_id: target.id, score: sc, moves_shown: usedRevealed.length });
    } else if (scored && !isCorrect) {
      await supabase.from('opening_guess_log').upsert({
        day: todayStr,
        opening_id: target.id,
        score: 0,
        moves_shown: usedRevealed.length,
      }, { onConflict: 'day' });
      setDayRecord({ opening_id: target.id, score: 0, moves_shown: usedRevealed.length });
    }
  }

  const boardKey = `${boardThemeId}-${pieceStyleId}`;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <main style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
        Загрузка…
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 20px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
          ← Сегодня
        </Link>
        <h1 style={{ margin: '10px 0 4px', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)' }}>
          Угадай дебют
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
          {todayStr} · Смотри ходы и определи дебют
        </p>
      </div>

      {/* Idle — start screen */}
      {phase === 'idle' && (
        <div style={{ maxWidth: 480 }}>
          {dayRecord ? (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-card)', padding: 24, marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                Сегодня сыграно
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--ivory)', marginBottom: 4 }}>
                {dayRecord.score} очков
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {dayRecord.moves_shown} {dayRecord.moves_shown === 1 ? 'ход' : 'хода'} показано
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-card)', padding: 24, marginBottom: 24,
            }}>
              <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
                Ходы открываются по одному. После каждого хода можно угадать дебют из предложенных вариантов.
                Чем раньше угадаешь — тем больше очков. Один зачётный раунд в день.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            {!dayRecord && (
              <button
                onClick={() => startGame(true)}
                style={{
                  height: 40, padding: '0 20px', borderRadius: 'var(--radius-btn)',
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Играть (зачётный)
              </button>
            )}
            <button
              onClick={() => startGame(false)}
              style={{
                height: 40, padding: '0 20px', borderRadius: 'var(--radius-btn)',
                background: 'transparent', color: 'var(--ivory)',
                border: '1px solid var(--hairline)', fontSize: 14, cursor: 'pointer',
              }}
            >
              Тренировка
            </button>
          </div>
        </div>
      )}

      {/* Playing or done */}
      {(phase === 'playing' || phase === 'done') && target && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,400px) 1fr', gap: 32, alignItems: 'start' }}>

          {/* Left — board */}
          <div>
            <div style={{ width: '100%', aspectRatio: '1', border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
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

            {/* Moves shown */}
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-card)', fontSize: 15, fontFamily: 'monospace',
              color: 'var(--ivory)', lineHeight: 1.7,
              minHeight: 44,
            }}>
              {revealed.length === 0
                ? <span style={{ color: 'var(--muted)', fontFamily: 'inherit', fontSize: 13 }}>Ходы появятся здесь…</span>
                : movesToDisplay(revealed)
              }
            </div>
          </div>

          {/* Right — options + controls */}
          <div>
            {/* Score bar */}
            {phase === 'playing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {currentOptions.length} {currentOptions.length === 1 ? 'вариант' : currentOptions.length <= 4 ? 'варианта' : 'вариантов'} осталось
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ivory)' }}>
                  {guessScore(revealed.length)} {guessScore(revealed.length) === 1 ? 'очко' : 'очков'} за правильный ответ сейчас
                </div>
              </div>
            )}

            {/* Result banner */}
            {phase === 'done' && (
              <div style={{
                marginBottom: 20, padding: '14px 18px',
                background: correct ? 'rgba(129,182,76,0.15)' : 'rgba(200,80,80,0.12)',
                border: `1px solid ${correct ? 'rgba(129,182,76,0.4)' : 'rgba(200,80,80,0.3)'}`,
                borderRadius: 'var(--radius-card)',
              }}>
                {correct ? (
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)', marginBottom: 4 }}>
                      Верно! +{finalScore} очков
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {target.name} · {revealed.length} {revealed.length === 1 ? 'ход' : 'хода'} показано
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', marginBottom: 4 }}>
                      Неверно — 0 очков
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Правильный ответ: <strong style={{ color: 'var(--ivory)' }}>{target.name}</strong>
                    </div>
                    {target.eco && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>ECO {target.eco}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Options grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {currentOptions.map(opt => {
                const isPicked  = selectedId === opt.id;
                const isTarget  = opt.id === target.id;
                const showState = phase === 'done';
                let bg = 'var(--surface)';
                let border = '1px solid var(--hairline)';
                let textColor = 'var(--ivory)';
                if (showState && isTarget)       { bg = 'rgba(129,182,76,0.15)'; border = '1px solid rgba(129,182,76,0.5)'; }
                if (showState && isPicked && !isTarget) { bg = 'rgba(200,80,80,0.12)'; border = '1px solid rgba(200,80,80,0.4)'; textColor = 'var(--muted)'; }
                return (
                  <button
                    key={opt.id}
                    disabled={phase === 'done'}
                    onClick={() => handlePick(opt.id)}
                    style={{
                      padding: '12px 14px', textAlign: 'left',
                      background: bg, border, borderRadius: 'var(--radius-card)',
                      color: textColor, fontSize: 13, lineHeight: 1.4,
                      cursor: phase === 'done' ? 'default' : 'pointer',
                      fontWeight: showState && isTarget ? 600 : 400,
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    {opt.name}
                    {opt.eco && <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{opt.eco}</span>}
                  </button>
                );
              })}
            </div>

            {/* Controls */}
            {phase === 'playing' && (
              <div style={{ display: 'flex', gap: 10 }}>
                {revealed.length < target.moves.length && (
                  <button
                    onClick={revealNext}
                    style={{
                      height: 38, padding: '0 18px', borderRadius: 'var(--radius-btn)',
                      background: 'var(--surface)', border: '1px solid var(--hairline)',
                      color: 'var(--ivory)', fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    Следующий ход
                  </button>
                )}
                {revealed.length >= target.moves.length && currentOptions.length > 1 && (
                  <div style={{ fontSize: 13, color: 'var(--muted)', alignSelf: 'center' }}>
                    Все ходы показаны — выбери вариант
                  </div>
                )}
              </div>
            )}

            {phase === 'done' && (
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  onClick={() => startGame(false)}
                  style={{
                    height: 38, padding: '0 18px', borderRadius: 'var(--radius-btn)',
                    background: 'var(--surface)', border: '1px solid var(--hairline)',
                    color: 'var(--ivory)', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Тренировка снова
                </button>
                <Link
                  href="/"
                  style={{
                    height: 38, padding: '0 18px', borderRadius: 'var(--radius-btn)',
                    background: 'transparent', border: '1px solid var(--hairline)',
                    color: 'var(--muted)', fontSize: 14, textDecoration: 'none',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  На главную
                </Link>
              </div>
            )}

            {/* Scoring legend */}
            {phase === 'playing' && (
              <div style={{ marginTop: 20, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                  Очки за правильный ответ
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                  {[1,2,3,4,5].map(n => (
                    <div key={n} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: revealed.length + 1 === n ? 'var(--accent)' : 'var(--muted)' }}>
                        {guessScore(n)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{n} ход{n === 1 ? '' : n <= 4 ? 'а' : 'ов'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile: stack columns */}
      <style>{`
        @media (max-width: 700px) {
          .guess-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
