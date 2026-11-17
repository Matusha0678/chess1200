'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'chess.js';
import type { SquareHandlerArgs, PieceDropHandlerArgs } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import { findThreats, threatExplanation } from '@/lib/threats';
import type { Threat } from '@/lib/threats';

// ── Design tokens ─────────────────────────────────────────────────────────────

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.16em',
  color: 'var(--muted)', textTransform: 'uppercase',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  fen: string;
  myColor: 'w' | 'b';
}

type Phase = 'loading' | 'marking' | 'revealed' | 'defensive' | 'done';

interface SessionScore {
  found: number;
  missed: number;
  falseAlarms: number;
  xp: number;
  streak: number;
}

const BLITZ_SECONDS = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function colorOf(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] as 'w' | 'b';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ThreatsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [posIdx, setPosIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [marked, setMarked] = useState<Set<Square>>(new Set());
  const [threats, setThreats] = useState<Threat[]>([]);
  const [score, setScore] = useState<SessionScore>({ found: 0, missed: 0, falseAlarms: 0, xp: 0, streak: 0 });
  const [defensiveMoveResult, setDefensiveMoveResult] = useState<'correct' | 'wrong' | null>(null);
  const [blitzMode, setBlitzMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(BLITZ_SECONDS);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { getBestMove, startAnalysis, stopAnalysis, isReady } = useStockfish();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const posStartRef = useRef<number>(Date.now());
  const lastEvalRef = useRef<number>(0);

  // ── Load positions ──────────────────────────────────────────────────────────

  useEffect(() => {
    void loadPositions();
  }, []);

  async function loadPositions() {
    setLoadError(null);

    // Load from game_analysis where eval_loss is big (after my blunder = fen_before was just played by opp)
    // We want positions AFTER the opponent's move that led to my blunder.
    // game_analysis.fen_before is my position just before my mistake move.
    const { data: gaRows } = await supabase
      .from('game_analysis')
      .select('fen_before, color')
      .order('created_at', { ascending: false })
      .limit(60);

    // Also from mistake_cards
    const { data: mcRows } = await supabase
      .from('mistake_cards')
      .select('fen_before, game_id')
      .order('created_at', { ascending: false })
      .limit(60);

    const seen = new Set<string>();
    const pool: Position[] = [];

    for (const row of gaRows ?? []) {
      if (!row.fen_before || seen.has(row.fen_before)) continue;
      seen.add(row.fen_before);
      // fen_before is the position where it's MY turn to move
      // color = my piece color
      const myColor = (row.color ?? 'w') as 'w' | 'b';
      pool.push({ fen: row.fen_before, myColor });
    }

    for (const row of mcRows ?? []) {
      if (!row.fen_before || seen.has(row.fen_before)) continue;
      seen.add(row.fen_before);
      // In fen_before it's my turn — the side to move is me
      const myColor = colorOf(row.fen_before);
      pool.push({ fen: row.fen_before, myColor });
    }

    if (pool.length === 0) {
      setLoadError('Нет позиций для тренировки. Сначала проанализируй партии в разделе Партии.');
      return;
    }

    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    setPositions(pool);
    setPosIdx(0);
    setPhase('marking');
    posStartRef.current = Date.now();
  }

  // ── Blitz timer ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!blitzMode || phase !== 'marking') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeLeft(BLITZ_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          void reveal();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blitzMode, posIdx, phase]);

  // ── Current position ─────────────────────────────────────────────────────────

  const pos = positions[posIdx];

  // ── Mark / unmark squares ────────────────────────────────────────────────────

  function handleSquareClick({ square }: SquareHandlerArgs) {
    if (phase !== 'marking') return;
    const sq = square as Square;
    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(sq)) next.delete(sq);
      else next.add(sq);
      return next;
    });
  }

  // ── Reveal threats ───────────────────────────────────────────────────────────

  async function reveal() {
    if (!pos) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const computed = findThreats(pos.fen, pos.myColor);
    setThreats(computed);

    const timeTaken = Date.now() - posStartRef.current;

    // Score
    const threatenedSquares = new Set(computed.map(t => t.square));
    let found = 0;
    let falseAlarms = 0;

    for (const sq of marked) {
      if (threatenedSquares.has(sq)) found++;
      else falseAlarms++;
    }
    const missed = computed.filter(t => !marked.has(t.square)).length;

    const roundXp = found * 15 - missed * 5 - falseAlarms * 5;
    const xpGain = Math.max(0, roundXp);

    setScore(prev => ({
      found: prev.found + found,
      missed: prev.missed + missed,
      falseAlarms: prev.falseAlarms + falseAlarms,
      xp: prev.xp + xpGain,
      streak: found > 0 && missed === 0 && falseAlarms === 0
        ? prev.streak + 1
        : 0,
    }));

    // Log to threat_log
    await supabase.from('threat_log').insert({
      fen: pos.fen,
      found,
      missed,
      false_alarms: falseAlarms,
      time_taken_ms: timeTaken,
    });

    setPhase(computed.length > 0 ? 'revealed' : 'done');
  }

  // ── Defensive move phase ─────────────────────────────────────────────────────

  function startDefensivePhase() {
    setDefensiveMoveResult(null);
    setPhase('defensive');
    // Start Stockfish analysis so we're ready
    if (pos) {
      lastEvalRef.current = 0;
      startAnalysis(pos.fen, info => {
        if (info.cp !== undefined) lastEvalRef.current = info.cp;
      });
    }
  }

  const handleDefensiveDrop = useCallback(({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (phase !== 'defensive' || !pos) return false;
    if (!targetSquare) return false;

    // Let user make a move on the board — just check Stockfish eval
    const chess = new Chess(pos.fen);
    let moveResult;
    try {
      moveResult = chess.move({ from: sourceSquare as Square, to: targetSquare as Square, promotion: 'q' });
    } catch {
      return false;
    }
    if (!moveResult) return false;

    const newFen = chess.fen();
    stopAnalysis();

    // Run quick Stockfish check on resulting position
    getBestMove(newFen, 10, () => {
      // We already have the eval from the streaming analysis on original pos
      // Compare: if the new position is significantly better for me, it's correct
      const evalBefore = lastEvalRef.current;
      startAnalysis(newFen, info => {
        if (info.cp !== undefined) {
          const evalAfter = info.cp;
          // For white defending: higher is better for white
          const myColor = pos.myColor;
          const improvement = myColor === 'w'
            ? evalAfter - evalBefore
            : evalBefore - evalAfter;

          stopAnalysis();
          setDefensiveMoveResult(improvement >= -50 ? 'correct' : 'wrong');
        }
      });
    });

    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pos]);

  // ── Next position ────────────────────────────────────────────────────────────

  function nextPosition() {
    stopAnalysis();
    const next = posIdx + 1;
    if (next >= positions.length) {
      setPhase('done');
      return;
    }
    setPosIdx(next);
    setMarked(new Set());
    setThreats([]);
    setDefensiveMoveResult(null);
    posStartRef.current = Date.now();
    setPhase('marking');
  }

  // ── Board square styles ──────────────────────────────────────────────────────

  function buildSquareStyles(): Record<string, React.CSSProperties> {
    const styles: Record<string, React.CSSProperties> = {};

    if (phase === 'marking') {
      for (const sq of marked) {
        styles[sq] = { backgroundColor: 'rgba(255,200,0,0.45)', borderRadius: 0 };
      }
    }

    if (phase === 'revealed' || phase === 'defensive') {
      const threatenedSquares = new Set(threats.map(t => t.square));
      // Correctly marked = green; missed = red; false alarms = orange
      for (const sq of marked) {
        if (threatenedSquares.has(sq)) {
          styles[sq] = { backgroundColor: 'rgba(80,200,80,0.5)', borderRadius: 0 };
        } else {
          styles[sq] = { backgroundColor: 'rgba(255,100,100,0.4)', borderRadius: 0 };
        }
      }
      for (const threat of threats) {
        if (!marked.has(threat.square)) {
          // Missed threat
          styles[threat.square] = { backgroundColor: 'rgba(255,80,80,0.55)', borderRadius: 0 };
        }
        // Show attacker squares
        for (const atk of threat.attackers) {
          if (!styles[atk]) {
            styles[atk] = { backgroundColor: 'rgba(255,160,0,0.35)', borderRadius: 0 };
          }
        }
      }
    }

    return styles;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (phase === 'loading' && !loadError) {
    return (
      <div className="page" style={{ maxWidth: 800 }}>
        <Link href="/" className="page-back">← Сегодня</Link>
        <h1 className="page-title">Проверка угроз</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Загрузка позиций…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page" style={{ maxWidth: 800 }}>
        <Link href="/" className="page-back">← Сегодня</Link>
        <h1 className="page-title">Проверка угроз</h1>
        <div className="ui-banner ui-banner-warn" style={{ fontSize: 14 }}>{loadError}</div>
        <Link href="/games/analyze" className="ui-btn ui-btn-outline" style={{ alignSelf: 'flex-start' }}>
          → Анализ партий
        </Link>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Итоги сессии</h1>
            <p className="page-lead">Проверка угроз</p>
          </div>
        </div>
        <div className="stat-grid">
          {[
            { label: 'Найдено', value: score.found },
            { label: 'Пропущено', value: score.missed },
            { label: 'Ложных', value: score.falseAlarms },
            { label: 'XP', value: `+${score.xp}` },
          ].map(({ label, value }) => (
            <div key={label} className="stat-card">
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
        {score.streak > 2 && (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Серия точных ответов: {score.streak}</span>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => { setScore({ found: 0, missed: 0, falseAlarms: 0, xp: 0, streak: 0 }); setPositions([]); setPhase('loading'); void loadPositions(); }}
            className="ui-btn ui-btn-primary"
          >
            Ещё раз
          </button>
          <Link href="/" className="ui-btn ui-btn-outline">На главную</Link>
        </div>
      </div>
    );
  }

  const boardOrientation: 'white' | 'black' = pos?.myColor === 'w' ? 'white' : 'black';

  return (
    <div className="page" style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Link href="/" className="page-back">← Сегодня</Link>
          <h1 className="page-title">Что хочет соперник?</h1>
        </div>

        {/* Score bar */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={SECTION_LABEL}>ПОЗИЦИЯ</div>
            <div style={{ ...HEADING, fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {posIdx + 1}<span style={{ color: 'var(--muted)', fontSize: 16 }}>/{positions.length}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={SECTION_LABEL}>XP</div>
            <div style={{ ...HEADING, fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ivory)' }}>
              +{score.xp}
            </div>
          </div>
          {score.streak > 1 && (
            <div style={{ textAlign: 'right' }}>
              <div style={SECTION_LABEL}>СЕРИЯ</div>
              <div style={{ ...HEADING, fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ivory)' }}>
                {score.streak}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Board */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {/* Blitz timer bar */}
          {blitzMode && phase === 'marking' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ height: 3, background: 'var(--track)', marginBottom: 4 }}>
                <div style={{
                  height: '100%',
                  background: timeLeft < 10 ? 'var(--control)' : 'var(--ivory)',
                  width: `${(timeLeft / BLITZ_SECONDS) * 100}%`,
                  transition: 'width 1s linear',
                }} />
              </div>
              <span style={{ fontSize: 12, color: timeLeft < 10 ? 'var(--control)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                {timeLeft}с
              </span>
            </div>
          )}

          <Chessboard
            options={{
              position: pos?.fen ?? 'start',
              boardOrientation,
              allowDragging: phase === 'defensive',
              onSquareClick: phase === 'marking' ? handleSquareClick : undefined,
              onPieceDrop: phase === 'defensive' ? handleDefensiveDrop : undefined,
              squareStyles: buildSquareStyles(),
              boardStyle: { width: 420, height: 420 },
            }}
          />
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Phase: marking */}
          {phase === 'marking' && (
            <>
              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                <span style={SECTION_LABEL}>ЗАДАНИЕ</span>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
                  Кликни на свои фигуры, которым угрожает опасность.<br />
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>Шах, зевок фигуры, вилка</span>
                </p>
              </div>

              {marked.size > 0 && (
                <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 13 }}>
                  Отмечено: {[...marked].join(', ')}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => void reveal()}
                  style={{
                    height: 44, padding: '0 24px', fontSize: 14, fontWeight: 600,
                    background: 'var(--ivory)', color: 'var(--ink)', border: 'none', cursor: 'pointer',
                  }}
                >
                  {marked.size === 0 ? 'Угроз нет' : 'Проверить'}
                </button>
                <button
                  onClick={() => setBlitzMode(b => !b)}
                  style={{
                    height: 36, padding: '0 16px', fontSize: 12, fontWeight: 500,
                    background: 'transparent', color: blitzMode ? 'var(--ivory)' : 'var(--muted)',
                    border: `1px solid ${blitzMode ? 'var(--ivory)' : 'var(--hairline)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {blitzMode ? '⚡ Блиц вкл' : 'Блиц'}
                </button>
              </div>
            </>
          )}

          {/* Phase: revealed */}
          {phase === 'revealed' && (
            <>
              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                <span style={SECTION_LABEL}>УГРОЗЫ</span>
              </div>

              {threats.length === 0 ? (
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Прямых угроз нет. {marked.size === 0 ? 'Верно!' : 'Ложная тревога.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {threats.map((t, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>
                        {t.type === 'check' ? 'ШАХ' : t.type === 'hanging' ? 'ЗЕВОК' : 'ВИЛКА'}
                      </span>
                      <span style={{ fontSize: 13 }}>
                        {pos ? threatExplanation(t, pos.fen) : ''}
                      </span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          Клетка: <strong style={{ color: 'var(--ivory)' }}>{t.square.toUpperCase()}</strong>
                        </span>
                        {t.attackers.length > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            Атакует: <strong style={{ color: 'var(--ivory)' }}>{t.attackers.map(a => a.toUpperCase()).join(', ')}</strong>
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, marginTop: 2 }}>
                        {marked.has(t.square)
                          ? <span style={{ color: '#6ed67e' }}>Нашёл</span>
                          : <span style={{ color: 'var(--control)' }}>Пропустил</span>
                        }
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-round score */}
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)' }}>
                <span>Найдено: <strong style={{ color: 'var(--ivory)' }}>{[...marked].filter(sq => threats.some(t => t.square === sq)).length}</strong></span>
                <span>Пропущено: <strong style={{ color: threats.filter(t => !marked.has(t.square)).length > 0 ? 'var(--control)' : 'var(--ivory)' }}>{threats.filter(t => !marked.has(t.square)).length}</strong></span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {threats.length > 0 && isReady && (
                  <button
                    onClick={startDefensivePhase}
                    style={{
                      height: 44, padding: '0 20px', fontSize: 14, fontWeight: 600,
                      background: 'transparent', color: 'var(--ivory)',
                      border: '1px solid var(--ivory)', cursor: 'pointer',
                    }}
                  >
                    Защититься
                  </button>
                )}
                <button
                  onClick={nextPosition}
                  style={{
                    height: 44, padding: '0 20px', fontSize: 14, fontWeight: 600,
                    background: 'var(--ivory)', color: 'var(--ink)', border: 'none', cursor: 'pointer',
                  }}
                >
                  Дальше →
                </button>
              </div>
            </>
          )}

          {/* Phase: defensive */}
          {phase === 'defensive' && (
            <>
              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                <span style={SECTION_LABEL}>ЗАЩИТНЫЙ ХОД</span>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
                  Сделай ход, который нейтрализует угрозу.
                </p>
              </div>

              {defensiveMoveResult === 'correct' && (
                <div style={{ padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 14, color: '#6ed67e' }}>
                  Хороший ход! Угроза нейтрализована.
                </div>
              )}
              {defensiveMoveResult === 'wrong' && (
                <div style={{ padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 14, color: 'var(--control)' }}>
                  Угроза не нейтрализована. Попробуй ещё.
                </div>
              )}

              <button
                onClick={nextPosition}
                style={{
                  height: 44, padding: '0 20px', fontSize: 14, fontWeight: 600,
                  background: 'var(--ivory)', color: 'var(--ink)', border: 'none', cursor: 'pointer',
                }}
              >
                Дальше →
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
