'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import { parsePgnMoves, classifyMistake, detectPhase, type ParsedMove } from '@/lib/mistakes';

// ── Game row type ─────────────────────────────────────────────────────────────

interface GameRow {
  id: string;
  pgn: string;
  color: string;
  result: string;
  played_at: string;
}

interface ProgressState {
  gameIndex: number;
  gameTotal: number;
  positionIndex: number;
  positionTotal: number;
  errorsFound: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH       = 15;
const SKIP_PLIES  = 6;
const MIN_LOSS    = 150;
const LOSING_BAD  = -800;
const WINNING_OK  = 500;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const [unanalyzedCount, setUnanalyzedCount] = useState<number | null>(null);
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [done, setDone]         = useState<{ cardsAdded: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { evalPosition, isReady } = useStockfish();
  const runningRef = useRef(false);

  useEffect(() => { void loadCount(); }, []);

  async function loadCount() {
    const { count } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .is('analyzed_at', null);
    setUnanalyzedCount(count ?? 0);
  }

  function stopAnalysis() {
    runningRef.current = false;
  }

  async function analyzeGames() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setDone(null);
    setLoadError(null);

    try {
      // Load up to BATCH unanalyzed games, most recent first
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('id,pgn,color,result,played_at')
        .is('analyzed_at', null)
        .order('played_at', { ascending: false })
        .limit(BATCH);

      if (gamesError) {
        setLoadError('Ошибка загрузки: ' + gamesError.message);
        return;
      }

      // Sort locally: losses first, then draws, then wins
      const gameList = [...(games ?? []) as GameRow[]].sort((a, b) => {
        const o: Record<string, number> = { loss: 0, draw: 1, win: 2 };
        return (o[a.result] ?? 2) - (o[b.result] ?? 2);
      });

      let totalErrors = 0;

      for (let gi = 0; gi < gameList.length; gi++) {
        if (!runningRef.current) break;

        const game = gameList[gi];
        const userColor = game.color === 'white' ? 'w' : 'b';

        let moves: ParsedMove[];
        try {
          moves = parsePgnMoves(game.pgn ?? '');
        } catch {
          await supabase.from('games').update({ analyzed_at: new Date().toISOString() }).eq('id', game.id);
          continue;
        }

        if (!moves.length) {
          await supabase.from('games').update({ analyzed_at: new Date().toISOString() }).eq('id', game.id);
          continue;
        }

        // Collect unique FENs to evaluate starting from SKIP_PLIES
        // fen_after[i] === fen_before[i+1], so we only add the final fen_after
        const fensToEval: string[] = [];
        const fenSet = new Set<string>();
        for (let i = SKIP_PLIES; i < moves.length; i++) {
          const fb = moves[i].fen_before;
          if (!fenSet.has(fb)) { fensToEval.push(fb); fenSet.add(fb); }
          if (i === moves.length - 1) {
            const fa = moves[i].fen_after;
            if (!fenSet.has(fa)) { fensToEval.push(fa); fenSet.add(fa); }
          }
        }

        // Evaluate all FENs sequentially with Stockfish
        const evalCache = new Map<string, { cp: number; bestMove: string }>();
        let aborted = false;

        for (let fi = 0; fi < fensToEval.length; fi++) {
          if (!runningRef.current) { aborted = true; break; }

          setProgress({
            gameIndex: gi + 1,
            gameTotal: gameList.length,
            positionIndex: fi + 1,
            positionTotal: fensToEval.length,
            errorsFound: totalErrors,
          });

          try {
            const result = await evalPosition(fensToEval[fi]);
            evalCache.set(fensToEval[fi], result);
          } catch {
            aborted = true;
            break;
          }
        }

        if (aborted) break;

        // Detect mistakes and write to DB
        for (let i = SKIP_PLIES; i < moves.length; i++) {
          if (!runningRef.current) { aborted = true; break; }

          const move = moves[i];
          if (move.color !== userColor) continue;

          const eb = evalCache.get(move.fen_before);
          const ea = evalCache.get(move.fen_after);
          if (!eb || !ea) continue;

          // Convert to user's perspective (positive = good for user)
          const evalBeforeUser = userColor === 'w' ? eb.cp : -eb.cp;
          const evalAfterUser  = userColor === 'w' ? ea.cp : -ea.cp;
          const evalLoss = evalBeforeUser - evalAfterUser;

          if (evalLoss < MIN_LOSS) continue;
          if (evalBeforeUser < LOSING_BAD) continue;  // already losing badly
          if (evalAfterUser > WINNING_OK) continue;   // still comfortably winning

          const tag   = classifyMistake(move.fen_before, move.san, eb.bestMove);
          const phase = detectPhase(move.fen_before, move.move_number);

          const { data: gaRow } = await supabase
            .from('game_analysis')
            .upsert({
              game_id: game.id,
              move_number: move.move_number,
              color: move.color,
              san: move.san,
              fen_before: move.fen_before,
              eval_before: eb.cp,
              eval_after: ea.cp,
              best_move: eb.bestMove,
            }, { onConflict: 'game_id,move_number,color' })
            .select('id')
            .single();

          const { error: mcError } = await supabase
            .from('mistake_cards')
            .upsert({
              game_id: game.id,
              game_analysis_id: gaRow?.id ?? null,
              fen_before: move.fen_before,
              my_move: move.san,
              best_move: eb.bestMove,
              eval_before: eb.cp,
              eval_loss: evalLoss,
              phase,
              tag,
            }, { onConflict: 'game_id,fen_before,my_move', ignoreDuplicates: true });

          if (!mcError) totalErrors++;
        }

        // Mark analyzed only after full completion of this game
        if (!aborted) {
          await supabase.from('games').update({ analyzed_at: new Date().toISOString() }).eq('id', game.id);
        }

        if (aborted) break;
      }

      if (runningRef.current) {
        setDone({ cardsAdded: totalErrors });
        await loadCount();
      }
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>Анализируем…</span>
            </div>
            <button onClick={stopAnalysis} className="ui-btn ui-btn-outline ui-btn-sm">Стоп</button>
          </div>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            Партия {progress.gameIndex}/{progress.gameTotal} · ход {progress.positionIndex}/{progress.positionTotal} · найдено {progress.errorsFound} ошибок
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
