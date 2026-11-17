'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import { parsePgnMoves, classifyMistake, detectPhase } from '@/lib/mistakes';

// ── Game row type ─────────────────────────────────────────────────────────────

interface GameRow {
  id: string;
  pgn: string;
  color: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useBestMoveAsync() {
  const { getBestMove, isReady } = useStockfish();

  function getBestMoveAsync(fen: string, depth: number): Promise<string> {
    return new Promise<string>((resolve) => {
      getBestMove(fen, depth, resolve);
    });
  }

  return { getBestMoveAsync, isReady };
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface ProgressState {
  gameIndex: number;
  gameTotal: number;
  positionIndex: number;
  cardsAdded: number;
  errorsFound: number;
}

export default function AnalyzePage() {
  const [unanalyzedCount, setUnanalyzedCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [done, setDone] = useState<{ cardsAdded: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { getBestMoveAsync, isReady } = useBestMoveAsync();
  const runningRef = useRef(false);

  // Load unanalyzed count
  useEffect(() => {
    void loadCount();
  }, []);

  async function loadCount() {
    const { count } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .is('analyzed_at', null);
    setUnanalyzedCount(count ?? 0);
  }

  async function analyzeGames() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setDone(null);
    setLoadError(null);

    try {
      // 1. Load up to 30 unanalyzed games
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('id,pgn,color')
        .is('analyzed_at', null)
        .limit(30);

      if (gamesError) {
        setLoadError('Ошибка загрузки партий: ' + gamesError.message);
        return;
      }

      const gameList = (games ?? []) as GameRow[];
      let totalCardsAdded = 0;

      for (let gi = 0; gi < gameList.length; gi++) {
        const game = gameList[gi];
        const userColor = game.color === 'white' ? 'w' : 'b';

        let moves;
        try {
          moves = parsePgnMoves(game.pgn ?? '');
        } catch {
          // Skip unparseable games
          await supabase.from('games').update({ analyzed_at: new Date().toISOString() }).eq('id', game.id);
          continue;
        }

        for (let i = 0; i < moves.length; i++) {
          const move = moves[i];
          if (move.color !== userColor) continue;
          if (move.eval_after_cp === null) continue;

          // Find eval_before: last non-null eval_after from moves before this one
          let evalBefore = 0;
          for (let j = i - 1; j >= 0; j--) {
            if (moves[j].eval_after_cp !== null) {
              evalBefore = moves[j].eval_after_cp!;
              break;
            }
          }

          const evalAfter = move.eval_after_cp;
          const evalLoss = userColor === 'w'
            ? evalBefore - evalAfter
            : evalAfter - evalBefore;

          if (evalLoss < 100) continue;

          setProgress({
            gameIndex: gi + 1,
            gameTotal: gameList.length,
            positionIndex: i + 1,
            cardsAdded: totalCardsAdded,
            errorsFound: evalLoss,
          });

          // Get best move from Stockfish
          let bestMove = '';
          try {
            bestMove = await getBestMoveAsync(move.fen_before, 12);
          } catch {
            bestMove = '';
          }

          // Classify and detect phase
          const tag = classifyMistake(move.fen_before, move.san, bestMove);
          const phase = detectPhase(move.fen_before, move.move_number);

          // Upsert game_analysis
          const { data: gaRow } = await supabase
            .from('game_analysis')
            .upsert(
              {
                game_id: game.id,
                move_number: move.move_number,
                color: move.color,
                san: move.san,
                fen_before: move.fen_before,
                eval_before: evalBefore,
                eval_after: evalAfter,
                best_move: bestMove,
              },
              { onConflict: 'game_id,move_number,color' },
            )
            .select('id')
            .single();

          // Insert mistake_card (upsert by game_id, fen_before, my_move)
          const { error: mcError } = await supabase
            .from('mistake_cards')
            .upsert(
              {
                game_id: game.id,
                game_analysis_id: gaRow?.id ?? null,
                fen_before: move.fen_before,
                my_move: move.san,
                best_move: bestMove,
                eval_before: evalBefore,
                eval_loss: evalLoss,
                phase,
                tag,
              },
              { onConflict: 'game_id,fen_before,my_move', ignoreDuplicates: true },
            );

          if (!mcError) {
            totalCardsAdded++;
          }
        }

        // Mark game as analyzed
        await supabase
          .from('games')
          .update({ analyzed_at: new Date().toISOString() })
          .eq('id', game.id);
      }

      setDone({ cardsAdded: totalCardsAdded });
      await loadCount();
    } catch (err) {
      console.error('Analysis failed:', err);
      setLoadError('Ошибка анализа');
    } finally {
      runningRef.current = false;
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <div className="page">

      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/games" className="page-back">← Партии</Link>
          <h1 className="page-title">Анализ партий</h1>
        </div>
      </div>

      {/* Status bar */}
      <div className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Не проанализировано</span>
          <span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
            {unanalyzedCount ?? '…'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {unanalyzedCount === 0 ? 'все партии проанализированы' : 'партий ожидают анализа'}
          </span>
        </div>

        {!running && (
          <button
            onClick={() => void analyzeGames()}
            disabled={!isReady || unanalyzedCount === 0}
            className="ui-btn ui-btn-primary"
          >
            {!isReady ? 'Загрузка движка…' : 'Начать анализ'}
          </button>
        )}
      </div>

      {/* Running progress */}
      {running && progress && (
        <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>Анализируем…</span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            Партия {progress.gameIndex}/{progress.gameTotal} · Позиция {progress.positionIndex} · +{progress.cardsAdded} карточек
          </span>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round((progress.gameIndex / progress.gameTotal) * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Done */}
      {done && (
        <div className="ui-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)' }}>
              Готово. Создано {done.cardsAdded} карточек.
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Партии обработаны и добавлены в банк ошибок
            </span>
          </div>
          <Link href="/mistakes" className="ui-btn ui-btn-primary">
            Банк ошибок →
          </Link>
        </div>
      )}

      {/* Error */}
      {loadError && (
        <div className="ui-card" style={{ fontSize: 13, color: 'var(--control)' }}>
          {loadError}
        </div>
      )}

      {/* Info */}
      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 10 }}>Как работает</p>
        <ul style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'Загружаются партии с оценками %eval из chess.com',
            'Ходы с потерей > 100 сентипешек помечаются как ошибки',
            'Stockfish ищет лучший ход для каждой позиции',
            'Создаются карточки для повторения по методу интервальных повторений',
          ].map((text, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--muted)' }}>{text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
