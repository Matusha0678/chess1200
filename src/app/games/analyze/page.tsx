'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import { parsePgnMoves, detectPhase, classifyMistake, type ParsedMove } from '@/lib/mistakes';
import { classifyMove, winProb, computeAccuracy, type MoveClass } from '@/lib/classify';
import { materialGain } from '@/lib/threats';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  mistakesFound: number;
}

interface EvalData {
  cpWhite: number;
  bestMove: string;
  secondBestCpWhite?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH            = 15;
const ANALYSIS_VERSION = 2;
// movetime options (ms) — toggled by user
const MOVETIME_FAST    = 120;
const MOVETIME_DEFAULT = 250;
const MOVETIME_DEEP    = 400;

// Minimum mover's win-prob loss to create a mistake card
const MIN_LOSS_FOR_CARD = 0.10;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Check if the move played equals the engine's top move UCI. */
function isEngineMoveCheck(fenBefore: string, san: string, bestMoveUci: string): boolean {
  if (!bestMoveUci || bestMoveUci.length < 4) return false;
  const chess = new Chess(fenBefore);
  const from  = bestMoveUci.slice(0, 2) as Square;
  const to    = bestMoveUci.slice(2, 4) as Square;
  const promo = bestMoveUci.length === 5
    ? (bestMoveUci[4] as 'q' | 'r' | 'b' | 'n')
    : undefined;
  try {
    const r = chess.move({ from, to, promotion: promo });
    return r?.san === san;
  } catch { return false; }
}

/** True if the move recaptures on the square the opponent just vacated. */
function isRecaptureCheck(move: ParsedMove, prevMove: ParsedMove | null): boolean {
  return !!(prevMove && move.captured && move.to === prevMove.to);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const [unanalyzedCount, setUnanalyzedCount] = useState<number | null>(null);
  const [running,  setRunning]  = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [done,     setDone]     = useState<{ cardsAdded: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [movetime, setMovetime] = useState(MOVETIME_DEFAULT);
  const { evalPositionMultiPV, isReady } = useStockfish();
  const runningRef = useRef(false);

  useEffect(() => { void loadCount(); }, []);

  async function loadCount() {
    // Count games not yet analysed with this version
    const { count } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .or('analyzed_at.is.null,analysis_version.is.null,analysis_version.lt.' + ANALYSIS_VERSION);
    setUnanalyzedCount(count ?? 0);
  }

  function stopAnalysis() { runningRef.current = false; }

  async function analyzeGames() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setDone(null);
    setLoadError(null);

    try {
      // Load up to BATCH games that need (re)analysis
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('id,pgn,color,result,played_at')
        .or('analyzed_at.is.null,analysis_version.is.null,analysis_version.lt.' + ANALYSIS_VERSION)
        .order('played_at', { ascending: false })
        .limit(BATCH);

      if (gamesError) {
        setLoadError('Ошибка загрузки: ' + gamesError.message);
        return;
      }

      // Losses first → draws → wins
      const gameList = [...(games ?? []) as GameRow[]].sort((a, b) => {
        const o: Record<string, number> = { loss: 0, draw: 1, win: 2 };
        return (o[a.result] ?? 2) - (o[b.result] ?? 2);
      });

      let totalMistakes = 0;

      for (let gi = 0; gi < gameList.length; gi++) {
        if (!runningRef.current) break;

        const game     = gameList[gi];
        const userColor: 'w' | 'b' = game.color === 'white' ? 'w' : 'b';

        let moves: ParsedMove[];
        try {
          moves = parsePgnMoves(game.pgn ?? '');
        } catch {
          await markAnalyzed(game.id, null, null);
          continue;
        }
        if (!moves.length) {
          await markAnalyzed(game.id, null, null);
          continue;
        }

        // ── Collect unique FENs for all positions ──────────────────────────
        const fensToEval: string[] = [];
        const fenSet = new Set<string>();
        for (const m of moves) {
          if (!fenSet.has(m.fen_before)) { fensToEval.push(m.fen_before); fenSet.add(m.fen_before); }
        }
        const lastFenAfter = moves[moves.length - 1].fen_after;
        if (!fenSet.has(lastFenAfter)) fensToEval.push(lastFenAfter);

        // ── Evaluate every position with MultiPV=2 ─────────────────────────
        const evalCache = new Map<string, EvalData>();
        let aborted = false;

        for (let fi = 0; fi < fensToEval.length; fi++) {
          if (!runningRef.current) { aborted = true; break; }

          setProgress({
            gameIndex:     gi + 1,
            gameTotal:     gameList.length,
            positionIndex: fi + 1,
            positionTotal: fensToEval.length,
            mistakesFound: totalMistakes,
          });

          try {
            const lines = await evalPositionMultiPV(fensToEval[fi], 2, movetime);
            if (lines.length > 0) {
              evalCache.set(fensToEval[fi], {
                cpWhite:          lines[0].cpWhite,
                bestMove:         lines[0].move,
                secondBestCpWhite: lines[1]?.cpWhite,
              });
            }
          } catch { aborted = true; break; }
        }

        if (aborted) break;

        // ── Classify every move and build DB rows ──────────────────────────
        const wpLossesWhite: number[] = [];
        const wpLossesBlack: number[] = [];
        let prevMoverLoss: number | null = null;

        const gaUpserts: object[] = [];
        const mcUpserts: object[] = [];

        for (let i = 0; i < moves.length; i++) {
          const move    = moves[i];
          const edBefore = evalCache.get(move.fen_before);
          const edAfter  = evalCache.get(move.fen_after);
          if (!edBefore || !edAfter) { prevMoverLoss = null; continue; }

          const evalBefore = edBefore.cpWhite;
          const evalAfter  = edAfter.cpWhite;

          const wpB = winProb(evalBefore);
          const wpA = winProb(evalAfter);
          const moverLoss = move.color === 'w'
            ? Math.max(0, wpB - wpA)
            : Math.max(0, wpA - wpB);

          // Win-prob losses for accuracy
          if (move.color === 'w') wpLossesWhite.push(moverLoss);
          else                    wpLossesBlack.push(moverLoss);

          // Brilliant detection: piece left hanging ≥300 cp after move
          const oppColor: 'w' | 'b' = move.color === 'w' ? 'b' : 'w';
          const hasRealSacrifice = move.captured === undefined &&
            materialGain(move.fen_after, move.to, oppColor) >= 300;

          // Only legal move check
          let isOnlyLegal = false;
          try {
            const ch = new Chess(move.fen_before);
            isOnlyLegal = ch.moves().length === 1;
          } catch { /* ignore */ }

          const phase = detectPhase(move.fen_before, move.move_number);
          const prevMove = i > 0 ? moves[i - 1] : null;

          const cls: MoveClass = classifyMove({
            evalBefore,
            evalAfter,
            evalSecondBest: edBefore.secondBestCpWhite,
            color:          move.color,
            isEngineMove:   isEngineMoveCheck(move.fen_before, move.san, edBefore.bestMove),
            plyNumber:      i + 1,
            phase,
            hasRealSacrifice,
            isRecapture:    isRecaptureCheck(move, prevMove),
            isOnlyLegalMove: isOnlyLegal,
            opponentPrevLoss: (prevMove && prevMove.color !== move.color)
              ? (prevMoverLoss ?? undefined)
              : undefined,
          });

          prevMoverLoss = moverLoss;

          gaUpserts.push({
            game_id:        game.id,
            move_number:    move.move_number,
            color:          move.color,
            san:            move.san,
            fen_before:     move.fen_before,
            eval_before:    evalBefore,
            eval_after:     evalAfter,
            best_move:      edBefore.bestMove,
            classification: cls,
            win_before:     wpB,
            win_after:      wpA,
            loss:           moverLoss,
          });

          // mistake_cards only for user's error moves
          if (
            move.color === userColor &&
            moverLoss >= MIN_LOSS_FOR_CARD &&
            (cls === 'mistake' || cls === 'blunder' || cls === 'miss')
          ) {
            const tag   = classifyMistake(move.fen_before, move.san, edBefore.bestMove);
            mcUpserts.push({
              game_id:          game.id,
              fen_before:       move.fen_before,
              my_move:          move.san,
              best_move:        edBefore.bestMove,
              eval_before:      evalBefore,
              eval_loss:        Math.round(moverLoss * 1000),
              phase,
              tag,
            });
          }
        }

        // ── Write to DB ────────────────────────────────────────────────────
        if (gaUpserts.length > 0) {
          await supabase.from('game_analysis').upsert(gaUpserts, {
            onConflict: 'game_id,move_number,color',
          });
        }

        for (const row of mcUpserts) {
          const { error } = await supabase
            .from('mistake_cards')
            .upsert(row, { onConflict: 'game_id,fen_before,my_move', ignoreDuplicates: true });
          if (!error) totalMistakes++;
        }

        const accWhite = computeAccuracy(wpLossesWhite);
        const accBlack = computeAccuracy(wpLossesBlack);
        await markAnalyzed(game.id, accWhite, accBlack);
      }

      if (runningRef.current) {
        setDone({ cardsAdded: totalMistakes });
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

  async function markAnalyzed(id: string, accW: number | null, accB: number | null) {
    await supabase.from('games').update({
      analyzed_at:      new Date().toISOString(),
      accuracy_white:   accW,
      accuracy_black:   accB,
      analysis_version: ANALYSIS_VERSION,
    }).eq('id', id);
  }

  const movetimeLabel = movetime === MOVETIME_FAST ? 'Быстро' : movetime === MOVETIME_DEEP ? 'Глубоко' : 'Стандарт';

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
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Ожидают анализа</span>
          <span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
            {unanalyzedCount ?? '…'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {unanalyzedCount === 0 ? 'все партии проанализированы' : 'партий'}
          </span>
        </div>

        {!running && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => void analyzeGames()}
              disabled={!isReady || unanalyzedCount === 0}
              className="ui-btn ui-btn-primary"
            >
              {!isReady ? 'Загрузка движка…' : 'Начать анализ'}
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              {[MOVETIME_FAST, MOVETIME_DEFAULT, MOVETIME_DEEP].map(mt => (
                <button
                  key={mt}
                  onClick={() => setMovetime(mt)}
                  className={`ui-btn ui-btn-sm ${mt === movetime ? 'ui-btn-primary' : 'ui-btn-outline'}`}
                >
                  {mt === MOVETIME_FAST ? 'Быстро' : mt === MOVETIME_DEEP ? 'Глубоко' : 'Стандарт'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Running */}
      {running && progress && (
        <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>
                Анализируем… ({movetimeLabel})
              </span>
            </div>
            <button onClick={stopAnalysis} className="ui-btn ui-btn-outline ui-btn-sm">Стоп</button>
          </div>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            Партия {progress.gameIndex}/{progress.gameTotal} · позиция {progress.positionIndex}/{progress.positionTotal} · ошибок: {progress.mistakesFound}
          </span>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round((progress.positionIndex / Math.max(1, progress.positionTotal)) * 100)}%` }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Не закрывай вкладку</span>
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
              Каждый ход получил оценку, точность записана в партии
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
            'Stockfish оценивает каждую позицию с двумя главными линиями',
            'Каждый ход классифицируется: Зевок, Ошибка, Неточность, Хороший, Лучший, Блестящий…',
            'Считается точность (%) для белых и чёрных по формуле Lichess',
            'Карточки создаются только для зевков, ошибок и упущенных шансов',
          ].map((text, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--muted)' }}>{text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
