'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Board } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
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

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
  const { S } = useTrainerGeometry();

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
      const record = dayRes.data as DayRecord | null;
      if (record) setDayRecord(record);
      startGame(!record);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr]);

  function startGame(isScored: boolean) {
    const gameSeed = isScored ? seed : (seed + Date.now());
    const rng = seededRNG(gameSeed);
    const idx = Math.floor(rng() * STATIC_OPENINGS.length);
    const t = STATIC_OPENINGS[idx];
    const opts = buildInitialOptions(STATIC_OPENINGS, t, gameSeed);
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

  const nextPts = target ? guessScore(revealed.length + 1) : 10;

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <TrainerLayout
        topBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>Угадай дебют</span>}
        board={<Board fen={START_FEN} size={S} orientation="white" interactive={false} />}
        bottomBar={<span />}
        panel={<div style={{ padding: 24, color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>}
      />
    );
  }

  // ── Playing / Done ───────────────────────────────────────────────────────────

  if ((phase === 'playing' || phase === 'done') && target) {
    const boardFen = phase === 'done' && correct === false ? replayFen(target.moves) : fen;

    const panelHeader = (
      <div data-ui="panel-header" className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <div>
          <div data-ui="panel-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>Угадай дебют</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            {scored ? 'Зачётный раунд' : 'Тренировка'}
            {dayRecord && phase === 'done' && ` · ${dayRecord.score} ${pluralPoints(dayRecord.score)} сегодня`}
          </div>
        </div>
        <Link href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Сегодня</Link>
      </div>
    );

    const statusBar = phase === 'playing' && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '10px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--ivory)' }}>{currentOptions.length}</strong> {pluralOptions(currentOptions.length)} осталось
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          Сейчас: <strong style={{ color: 'var(--ivory)' }}>{guessScore(revealed.length)}</strong> {pluralPoints(guessScore(revealed.length))}
        </span>
        {revealed.length < target.moves.length && (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            След.: {nextPts} {pluralPoints(nextPts)}
          </span>
        )}
      </div>
    );

    const resultBanner = phase === 'done' && (
      <div className={`ui-banner ${correct ? 'ui-banner-success' : 'ui-banner-danger'}`} style={{ margin: '0 20px 0', flexShrink: 0 }}>
        {correct ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)', marginBottom: 4, fontFamily: 'var(--font-inter-tight, Inter Tight, Inter, sans-serif)' }}>
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
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', marginBottom: 4 }}>
              Неверно — 0 очков
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Правильный ответ: <strong style={{ color: 'var(--ivory)' }}>{target.name}</strong>
              {target.eco && <span> · ECO {target.eco}</span>}
            </div>
          </>
        )}
      </div>
    );

    return (
      <TrainerLayout
        topBar={
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {todayStr} {scored ? '· зачётный' : '· тренировка'}
          </span>
        }
        board={<Board fen={boardFen} size={S} orientation="white" interactive={false} />}
        bottomBar={
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: 'var(--ivory)' }}>
            {movesToDisplay(revealed) || '…'}
          </span>
        }
        panel={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {panelHeader}
            {statusBar}
            {resultBanner && <div style={{ paddingTop: 16 }}>{resultBanner}</div>}

            {/* Options */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                    <button className="ui-btn ui-btn-ghost" onClick={revealNext}>
                      Следующий ход →
                    </button>
                  )}
                  {revealed.length >= target.moves.length && currentOptions.length > 1 && (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
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
        }
      />
    );
  }

  // ── Idle fallback ────────────────────────────────────────────────────────────

  return (
    <TrainerLayout
      topBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>Угадай дебют</span>}
      board={<Board fen={START_FEN} size={S} orientation="white" interactive={false} />}
      bottomBar={<span />}
      panel={
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>Угадай дебют</div>
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
      }
    />
  );
}
