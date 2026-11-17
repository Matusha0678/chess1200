'use client';

import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useDeviationEngine } from '@/hooks/useDeviationEngine';
import { nextReviewDate } from '@/lib/mistakes';

// ── Types ──────────────────────────────────────────────────────────────────────

type Verdict = 'good' | 'inaccuracy' | 'mistake';

interface MoveResult {
  san: string;
  loss: number;
  verdict: Verdict;
  fenBefore: string;
  bestMove?: string;
}

type Phase = 'loading' | 'playing' | 'thinking' | 'done';

// ── Style helpers ──────────────────────────────────────────────────────────────

const SECONDARY: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px',
  background: 'transparent', border: '1px solid var(--hairline)',
  color: 'var(--muted)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
};

const PRIMARY_LINK: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px',
  background: 'var(--ivory)', color: 'var(--ink)',
  fontSize: 13, fontWeight: 600, textDecoration: 'none',
};

function verdictLabel(v: Verdict) {
  if (v === 'good')       return 'Хорошо';
  if (v === 'inaccuracy') return 'Неточно';
  return 'Ошибка';
}

function verdictColor(v: Verdict) {
  if (v === 'good')       return 'rgba(130,220,100,0.95)';
  if (v === 'inaccuracy') return 'rgba(220,180,40,0.9)';
  return 'rgba(220,80,80,0.9)';
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface DeviationModeProps {
  startFen: string;
  opponentLineUci: string;      // e.g. "e7e5"
  playerColor: 'w' | 'b';
  boardOrientation: 'white' | 'black';
  lineId: string;               // for deviation_log
  boardTheme: { dark: string; light: string };
  customPieces?: Record<string, (props?: { fill?: string; square?: string; svgStyle?: React.CSSProperties }) => React.JSX.Element>;
  showNotation?: boolean;
  onClose: () => void;
}

const MAX_USER_MOVES = 4;

// ── Component ──────────────────────────────────────────────────────────────────

export function DeviationMode({
  startFen, opponentLineUci, playerColor, boardOrientation,
  lineId, boardTheme, customPieces, showNotation = true, onClose,
}: DeviationModeProps) {
  const { analyze, isReady } = useDeviationEngine();

  const chessRef = useRef<Chess | null>(null);
  if (chessRef.current == null) {
    chessRef.current = new Chess(startFen);
  }

  const [phase,     setPhase]     = useState<Phase>('loading');
  const [currentFen, setCurrentFen] = useState(startFen);
  const [finalFen,  setFinalFen]  = useState(startFen);
  const [highlights, setHighlights] = useState<Record<string, React.CSSProperties>>({});
  const [deviationSan, setDeviationSan] = useState('');
  const [results,   setResults]   = useState<MoveResult[]>([]);
  const [lastVerdict, setLastVerdict] = useState<Verdict | null>(null);

  // Refs to avoid stale closures in async Stockfish callbacks
  const phaseRef      = useRef<Phase>('loading');
  const evalBeforeRef = useRef(0);
  const userMovesRef  = useRef(0);
  const resultsRef    = useRef<MoveResult[]>([]);

  function syncPhase(p: Phase) { phaseRef.current = p; setPhase(p); }

  // ── Boot: opponent plays deviation ─────────────────────────────────────────

  useEffect(() => {
    if (!isReady) return;

    analyze(startFen, 12, 3, (topResult) => {
      // Pick a move different from the line
      const lineFrom = opponentLineUci.slice(0, 2);
      const lineTo   = opponentLineUci.slice(2, 4);
      const other    = topResult.moves.find(m =>
        !(m.uci.slice(0, 2) === lineFrom && m.uci.slice(2, 4) === lineTo),
      );
      const chosenUci = other?.uci ?? topResult.moves[0]?.uci;
      if (!chosenUci) { onClose(); return; }

      const chess = chessRef.current!;
      const from  = chosenUci.slice(0, 2) as Square;
      const to    = chosenUci.slice(2, 4) as Square;
      const prom  = chosenUci[4] as 'q' | 'r' | 'b' | 'n' | undefined;

      let moveRes;
      try { moveRes = chess.move({ from, to, promotion: prom || undefined }); }
      catch { onClose(); return; }
      if (!moveRes) { onClose(); return; }

      setDeviationSan(moveRes.san);
      const fenAfterDev = chess.fen();
      setCurrentFen(fenAfterDev);
      setHighlights({
        [from]: { background: 'rgba(220,60,60,0.28)' },
        [to]:   { background: 'rgba(220,60,60,0.48)' },
      });

      // Baseline eval of position (user's turn)
      analyze(fenAfterDev, 10, 1, (evalRes) => {
        evalBeforeRef.current = evalRes.moves[0]?.cp ?? 0;
        syncPhase('playing');
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // ── Save & finish ──────────────────────────────────────────────────────────

  function finish(finalResults: MoveResult[]) {
    syncPhase('done');
    setFinalFen(chessRef.current?.fen() ?? startFen);

    const anyMistake = finalResults.some(r => r.verdict === 'mistake');
    supabase.from('deviation_log').insert({ line_id: lineId, ok: !anyMistake });

    for (const r of finalResults) {
      if (r.verdict !== 'mistake' || !r.bestMove) continue;
      supabase.from('mistake_cards').insert({
        fen_before: r.fenBefore,
        my_move:    r.san,
        best_move:  r.bestMove,
        eval_loss:  Math.max(0, r.loss),
        phase:      'opening',
        tag:        'deviation',
        next_review: nextReviewDate(0),
      });
    }
  }

  // ── Piece drop (user's move) ───────────────────────────────────────────────

  function handlePieceDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }): boolean {
    if (!targetSquare) return false;
    if (phaseRef.current !== 'playing') return false;

    const chess = chessRef.current!;
    const fenBefore = chess.fen();

    let moveRes;
    try {
      moveRes = chess.move({
        from: sourceSquare as Square,
        to:   targetSquare as Square,
        promotion: 'q',
      });
    } catch { return false; }
    if (!moveRes) return false;

    const userSan       = moveRes.san;
    const fenAfterUser  = chess.fen();
    setCurrentFen(fenAfterUser);
    setHighlights({
      [sourceSquare]: { background: 'rgba(255,255,100,0.28)' },
      [targetSquare]: { background: 'rgba(255,255,100,0.48)' },
    });
    syncPhase('thinking');

    const evalBefore = evalBeforeRef.current;

    analyze(fenAfterUser, 10, 1, (evalRes) => {
      const evalAfter  = evalRes.moves[0]?.cp ?? evalBefore;
      const bestMove   = evalRes.moves[0]?.uci;
      const loss = playerColor === 'w'
        ? evalBefore - evalAfter
        : evalAfter - evalBefore;
      const verdict: Verdict = loss < 50 ? 'good' : loss < 100 ? 'inaccuracy' : 'mistake';

      const mr: MoveResult = { san: userSan, loss, verdict, fenBefore, bestMove };
      resultsRef.current = [...resultsRef.current, mr];
      userMovesRef.current += 1;

      setResults([...resultsRef.current]);
      setLastVerdict(verdict);

      if (chess.isGameOver() || userMovesRef.current >= MAX_USER_MOVES) {
        finish(resultsRef.current);
        return;
      }

      // Engine response
      analyze(fenAfterUser, 12, 1, (engRes) => {
        const engUci  = engRes.moves[0]?.uci;
        const engEval = engRes.moves[0]?.cp ?? evalAfter;

        if (!engUci || chess.isGameOver()) { finish(resultsRef.current); return; }

        const eFrom = engUci.slice(0, 2) as Square;
        const eTo   = engUci.slice(2, 4) as Square;
        const eProm = engUci[4] as 'q' | 'r' | 'b' | 'n' | undefined;

        let engMove;
        try { engMove = chess.move({ from: eFrom, to: eTo, promotion: eProm || undefined }); }
        catch { finish(resultsRef.current); return; }
        if (!engMove) { finish(resultsRef.current); return; }

        setCurrentFen(chess.fen());
        setHighlights({
          [eFrom]: { background: 'rgba(60,100,220,0.28)' },
          [eTo]:   { background: 'rgba(60,100,220,0.48)' },
        });
        evalBeforeRef.current = engEval;
        syncPhase('playing');
      });
    });

    return true;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const anyMistake = results.some(r => r.verdict === 'mistake');

  if (phase === 'done') {
    return (
      <Overlay title="Отклонение — итог" onClose={onClose}>
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 18, fontWeight: 700, marginBottom: 12,
            color: anyMistake ? 'rgba(220,80,80,0.9)' : 'rgba(130,220,100,0.95)',
          }}>
            {anyMistake ? 'Преимущество потеряно' : 'Преимущество удержано ✓'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 18, textAlign: 'right' }}>
                  {i + 1}.
                </span>
                <code style={{ color: 'var(--ivory)', fontFamily: 'monospace', minWidth: 52 }}>{r.san}</code>
                <span style={{ color: verdictColor(r.verdict) }}>{verdictLabel(r.verdict)}</span>
                {r.loss > 10 && (
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>−{(r.loss / 100).toFixed(1)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onClose} style={SECONDARY}>Закрыть</button>
          <Link
            href={`/play?fen=${encodeURIComponent(finalFen)}&color=${playerColor === 'w' ? 'white' : 'black'}`}
            style={PRIMARY_LINK}
          >
            Играть отсюда →
          </Link>
        </div>
      </Overlay>
    );
  }

  const isUserTurn  = phase === 'playing';
  const movesDone   = results.length;

  return (
    <Overlay title="Отклонение" onClose={onClose}>
      {/* Status line */}
      <div style={{ marginBottom: 12, fontSize: 13, minHeight: 20 }}>
        {phase === 'loading' && <span style={{ color: 'var(--muted)' }}>Анализирую позицию…</span>}
        {phase === 'thinking' && <span style={{ color: 'var(--muted)' }}>Оцениваю ход…</span>}
        {phase === 'playing' && lastVerdict && (
          <span style={{ color: verdictColor(lastVerdict) }}>{verdictLabel(lastVerdict)} — ваш ход</span>
        )}
        {phase === 'playing' && !lastVerdict && deviationSan && (
          <span style={{ color: 'var(--muted)' }}>
            Соперник сыграл{' '}
            <strong style={{ color: 'rgba(220,60,60,0.9)' }}>{deviationSan}</strong>{' '}
            — ваш ход
          </span>
        )}
      </div>

      {/* Board */}
      <div style={{ maxWidth: 420, aspectRatio: '1', margin: '0 auto 14px', border: '1px solid var(--hairline)' }}>
        <Chessboard
          options={{
            position:         currentFen,
            boardOrientation: boardOrientation,
            allowDragging:    isUserTurn,
            squareStyles:     highlights,
            boardStyle:       { borderRadius: 0, width: '100%', height: '100%' },
            darkSquareStyle:  { backgroundColor: boardTheme.dark },
            lightSquareStyle: { backgroundColor: boardTheme.light },
            pieces:           customPieces,
            showNotation:     showNotation,
            animationDurationInMs: 180,
            onPieceDrop:      isUserTurn ? handlePieceDrop : undefined,
          }}
        />
      </div>

      {/* Move history */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          {results.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 18, textAlign: 'right' }}>{i + 1}.</span>
              <code style={{ color: 'var(--ivory)', fontFamily: 'monospace', minWidth: 50 }}>{r.san}</code>
              <span style={{ color: verdictColor(r.verdict) }}>{verdictLabel(r.verdict)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Progress */}
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em' }}>
        ХОД {movesDone} / {MAX_USER_MOVES}
      </div>
    </Overlay>
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
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, border: '1px solid var(--hairline)',
              background: 'transparent', color: 'var(--muted)', fontSize: 16,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
