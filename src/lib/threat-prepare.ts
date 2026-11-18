import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import { analyseThreat } from './threat-logic';
import { uciOf } from './see';
import type { Engine } from './engine';
import { supabase } from './supabase';

export interface ThreatPrepProgress {
  gamesChecked: number;
  gamesTotal: number;
  found: number;
  noAnalyzedGames?: boolean;
  error?: string;
}

export interface ThreatAnalysisRow {
  move_number: number;
  color: 'w' | 'b';
  san: string;
  fen_before: string;
  eval_before: number | null;    // cp for white
  classification: string | null;
}

interface GameRow {
  id: string;
  pgn: string | null;
  color: string | null;          // 'white' | 'black'
}

export interface ThreatInsertRow {
  game_id: string;
  ply: number;
  fen: string;
  my_color: string;
  last_move_uci: string | null;
  last_move_san: string | null;
  has_threat: boolean;
  threat_uci: string | null;
  threat_san: string | null;
  threat_pv: string | null;
  targets: string[];
  optional_targets: string[];
  attacker_sq: string | null;
  motif: string | null;
  gain_cp: number | null;
  mate_in: number | null;
  difficulty: number;
  missed_in_game: boolean;
  my_move_san: string | null;
  version: number;
}

// Pure function: build threat rows for one game given pre-loaded analysis rows.
// Does NOT write to DB. Used by tests and by prepareThreatPositions.
export async function buildThreatRowsForGame(
  analysisRows: ThreatAnalysisRow[],
  gameId: string,
  gameColor: 'w' | 'b',
  engine: Engine,
  signal?: AbortSignal,
): Promise<ThreatInsertRow[]> {
  const rows: ThreatInsertRow[] = [];
  let positionsThisGame = 0;
  let noThreatCount = 0;

  for (let i = 0; i < analysisRows.length; i++) {
    if (signal?.aborted) break;
    if (positionsThisGame >= 3) break;

    const row = analysisRows[i];
    if (!row.fen_before) continue;

    // Compute ply
    const ply = (row.move_number - 1) * 2 + (row.color === 'w' ? 1 : 2);

    // Only positions before my moves
    if (row.color !== gameColor) continue;

    // Skip first 8 plies
    if (ply <= 8) continue;

    // Skip positions where I'm in check
    const c = new Chess(row.fen_before);
    if (c.inCheck()) continue;

    // Skip decided positions: |eval_before| > 400 cp
    const cpBefore = row.eval_before;
    if (cpBefore !== null && Math.abs(cpBefore) > 400) continue;

    const isMyError = row.classification === 'mistake' || row.classification === 'blunder';

    // Last move: UCI from previous row
    const prevRow = i > 0 ? analysisRows[i - 1] : null;
    const lastMoveSan = prevRow?.san ?? null;
    let lastMoveUci: string | null = null;
    if (prevRow?.fen_before && prevRow.san) {
      try {
        const pc = new Chess(prevRow.fen_before);
        const mv = pc.move(prevRow.san);
        if (mv) lastMoveUci = uciOf(mv);
      } catch { /* noop */ }
    }

    // Check if last opponent move was capture/check/attack
    let triggerByMove = false;
    if (lastMoveUci) {
      const pc = new Chess(row.fen_before);
      if (pc.inCheck()) {
        triggerByMove = true;
      } else {
        const to = lastMoveUci.slice(2, 4);
        const me = pc.turn() as Color;
        const opp: Color = me === 'w' ? 'b' : 'w';
        for (const boardRow of pc.board()) {
          for (const q of boardRow) {
            if (!q || q.color !== me || q.type === 'k') continue;
            if (pc.attackers(q.square, opp).includes(to as never)) {
              triggerByMove = true;
              break;
            }
          }
          if (triggerByMove) break;
        }
      }
    }

    if (!triggerByMove && !isMyError) continue;

    // Run threat analysis
    let result;
    try {
      const engineD14 = {
        analyse: (fen: string, opts?: { multipv?: number; depth?: number; searchmoves?: string[] }) =>
          engine.analyse(fen, { depth: 14, ...opts }),
      };
      result = await analyseThreat(engineD14, row.fen_before);
    } catch {
      continue;
    }

    if (!result.usable) continue;

    const hasThreat = result.hasThreat ?? false;
    const shouldSaveNoThreat = !hasThreat && (result.decoyOk ?? false) && noThreatCount < 3;

    if (!hasThreat && !shouldSaveNoThreat) continue;
    if (!hasThreat) noThreatCount++;
    if (hasThreat && (!result.targets || result.targets.length === 0)) continue;

    const missedInGame = hasThreat && isMyError;
    const myMoveSan = row.san ?? null;
    const gainCp = result.gain != null ? Math.round(result.gain * 100) : null;

    rows.push({
      game_id: gameId,
      ply,
      fen: row.fen_before,
      my_color: gameColor,
      last_move_uci: lastMoveUci,
      last_move_san: lastMoveSan,
      has_threat: hasThreat,
      threat_uci: result.threatUci ?? null,
      threat_san: result.T ?? null,
      threat_pv: result.threatPv ? result.threatPv.join(' ') : null,
      targets: result.targets ?? [],
      optional_targets: result.optional ?? [],
      attacker_sq: result.attacker ?? null,
      motif: result.motif ?? null,
      gain_cp: gainCp,
      mate_in: result.mate_in ?? null,
      difficulty: result.difficulty ?? 1,
      missed_in_game: missedInGame,
      my_move_san: myMoveSan,
      version: 2,
    });

    positionsThisGame++;
  }

  return rows;
}

export async function prepareThreatPositions(
  engine: Engine,
  onProgress: (p: ThreatPrepProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Only games that have been analyzed with analysis_version >= 2
  const { data: games, error: gErr } = await supabase
    .from('games')
    .select('id,pgn,color')
    .is('threats_scanned_at', null)
    .not('analyzed_at', 'is', null)
    .gte('analysis_version', 2)
    .limit(100);

  if (gErr) {
    onProgress({ gamesChecked: 0, gamesTotal: 0, found: 0, error: `Ошибка базы: ${gErr.message}. Выполни SQL 27–29 (supabase/RUN-ORDER.md)` });
    return;
  }
  if (!games || games.length === 0) {
    // Check if there ARE analyzed games (just already scanned)
    const { count } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .not('analyzed_at', 'is', null)
      .gte('analysis_version', 2);
    onProgress({
      gamesChecked: 0, gamesTotal: 0, found: 0,
      noAnalyzedGames: (count ?? 0) === 0,
    });
    return;
  }

  const gamesTotal = games.length;
  let gamesChecked = 0;
  let found = 0;

  onProgress({ gamesChecked, gamesTotal, found });

  for (const game of games as GameRow[]) {
    if (signal?.aborted) break;

    // my color: 'w' or 'b' from game.color
    const gameColor: 'w' | 'b' = game.color === 'white' ? 'w' : 'b';

    // Load game_analysis rows with correct columns
    const { data: analysis, error: aErr } = await supabase
      .from('game_analysis')
      .select('move_number,color,san,fen_before,eval_before,classification')
      .eq('game_id', game.id)
      .order('move_number', { ascending: true })
      .order('color', { ascending: false }); // 'w' (119) > 'b' (98): descending puts 'w' first

    if (aErr) {
      onProgress({ gamesChecked, gamesTotal, found, error: `Ошибка загрузки анализа: ${aErr.message}. Выполни SQL 27–29 (supabase/RUN-ORDER.md)` });
      // Don't mark game — retry next time
      gamesChecked++;
      onProgress({ gamesChecked, gamesTotal, found });
      continue;
    }

    if (!analysis || analysis.length === 0) {
      // No analysis rows yet — skip without marking (will be analyzed later)
      gamesChecked++;
      onProgress({ gamesChecked, gamesTotal, found });
      continue;
    }

    const typedRows = analysis as ThreatAnalysisRow[];

    const threatRows = await buildThreatRowsForGame(
      typedRows, game.id, gameColor, engine, signal,
    );

    let gameHadError = false;
    for (const tRow of threatRows) {
      if (signal?.aborted) break;
      const { error: uErr } = await supabase
        .from('threat_positions')
        .upsert(tRow, { onConflict: 'game_id,ply' });
      if (uErr) {
        onProgress({ gamesChecked, gamesTotal, found, error: `Ошибка сохранения: ${uErr.message}. Выполни SQL 27–29 (supabase/RUN-ORDER.md)` });
        gameHadError = true;
        break;
      }
      found++;
      onProgress({ gamesChecked, gamesTotal, found });
    }

    if (!gameHadError) {
      const { error: markErr } = await supabase
        .from('games')
        .update({ threats_scanned_at: new Date().toISOString() })
        .eq('id', game.id);
      if (markErr) {
        onProgress({ gamesChecked, gamesTotal, found, error: `Ошибка обновления партии: ${markErr.message}` });
      }
    }

    gamesChecked++;
    onProgress({ gamesChecked, gamesTotal, found });
  }
}
