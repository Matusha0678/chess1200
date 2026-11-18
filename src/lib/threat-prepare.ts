import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import { analyseThreat } from './threat-logic';
import { nullFen, uciOf } from './see';
import type { Engine } from './engine';
import { supabase } from './supabase';

export interface ThreatPrepProgress {
  gamesChecked: number;
  gamesTotal: number;
  found: number;
}

interface GameAnalysisRow {
  fen_before: string;
  fen_after: string | null;
  move_uci: string | null;
  move_san: string | null;
  classification: string | null;
  cp_before: number | null;
  ply: number;
}

interface GameRow {
  id: string;
  pgn: string | null;
}

function isLastMoveOpponentAttack(fen: string, lastMoveUci: string | null): boolean {
  if (!lastMoveUci) return false;
  const c = new Chess(fen);
  // We're at my turn — last move was opponent's
  // Check if it was a capture or check
  // We reconstruct the board before the last move to check
  // Actually we just check if the move was a capture (uci length differs) or if I'm in check
  // Simple heuristic: if I was given check, or if the UCI implies a capture
  // Actually we need to look at what the opponent's move did to our pieces
  // The simplest approach: check if any of my pieces are under attack on the current board
  const me = c.turn() as Color;
  const opp: Color = me === 'w' ? 'b' : 'w';
  // Check if opponent's last move was a capture (notation won't tell us, so check if target square was occupied before)
  // We'll just check if I'm in check OR any of my pieces are attacked by opponent
  if (c.inCheck()) return true;
  // Check if the destination square of the last move attacks any of my pieces
  const to = lastMoveUci.slice(2, 4);
  for (const row of c.board()) {
    for (const q of row) {
      if (!q || q.color !== me || q.type === 'k') continue;
      if (c.attackers(q.square, opp).includes(to as never)) return true;
    }
  }
  // Check if it was a capture (we can check by FEN before / after — not available here, use length heuristic)
  // Just return true if the move destination attacks anything valuable
  return false;
}

export async function prepareThreatPositions(
  engine: Engine,
  onProgress: (p: ThreatPrepProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Load games where threats_scanned_at IS NULL that have game_analysis rows
  const { data: games, error: gErr } = await supabase
    .from('games')
    .select('id,pgn')
    .is('threats_scanned_at', null)
    .limit(100);

  if (gErr || !games || games.length === 0) {
    if (gErr) console.error('prepareThreatPositions: load error', gErr);
    return;
  }

  const gamesTotal = games.length;
  let gamesChecked = 0;
  let found = 0;

  onProgress({ gamesChecked, gamesTotal, found });

  for (const game of games as GameRow[]) {
    if (signal?.aborted) break;

    // Load game_analysis rows ordered by ply
    const { data: analysis } = await supabase
      .from('game_analysis')
      .select('fen_before,fen_after,move_uci,move_san,classification,cp_before,ply')
      .eq('game_id', game.id)
      .order('ply', { ascending: true });

    if (!analysis || analysis.length === 0) {
      await supabase.from('games').update({ threats_scanned_at: new Date().toISOString() }).eq('id', game.id);
      gamesChecked++;
      onProgress({ gamesChecked, gamesTotal, found });
      continue;
    }

    const rows = analysis as GameAnalysisRow[];
    let positionsThisGame = 0;
    let noThreatCount = 0;

    // Reconstruct PGN to find last-move info
    // Build a map from fen_before to what preceded it
    // For last move: fen_before[i] was reached by move_san[i-1]
    for (let i = 0; i < rows.length; i++) {
      if (signal?.aborted) break;
      if (positionsThisGame >= 3) break;

      const row = rows[i];
      if (!row.fen_before) continue;

      // Skip first 8 plies
      const ply = row.ply ?? (i + 1);
      if (ply <= 8) continue;

      // Skip positions where I'm in check
      const c = new Chess(row.fen_before);
      if (c.inCheck()) continue;

      // Check if |cur| > 4 (already decided)
      const cpBefore = row.cp_before;
      if (cpBefore !== null && Math.abs(cpBefore) > 400) continue;

      const isMyError = row.classification === 'mistake' || row.classification === 'blunder';

      // Last move: get from previous row
      const prevRow = i > 0 ? rows[i - 1] : null;
      const lastMoveUci = prevRow?.move_uci ?? null;
      const lastMoveSan = prevRow?.move_san ?? null;

      // Check if last opponent move was capture/check/attack
      const triggerByMove = isLastMoveOpponentAttack(row.fen_before, lastMoveUci);

      // Only run engine for triggered positions
      if (!triggerByMove && !isMyError) continue;

      // Run threat analysis at depth 14
      let result;
      try {
        // Use a custom depth of 14 for threat analysis
        // We need to override the default depth; create a wrapper
        const engineD14 = {
          analyse: (fen: string, opts?: { multipv?: number; depth?: number; searchmoves?: string[] }) =>
            engine.analyse(fen, { depth: 14, ...opts }),
        };
        result = await analyseThreat(engineD14, row.fen_before);
      } catch {
        continue;
      }

      if (!result.usable) continue;

      // Determine if we should save this position
      const hasThreat = result.hasThreat ?? false;
      const shouldSaveNoThreat = !hasThreat && (result.decoyOk ?? false) && noThreatCount < 3;

      if (!hasThreat && !shouldSaveNoThreat) continue;
      if (!hasThreat) noThreatCount++;

      // Check targets exist for threat positions
      if (hasThreat && (!result.targets || result.targets.length === 0)) continue;

      // missed_in_game: threat exists AND my classification was mistake/blunder
      const missedInGame = hasThreat && isMyError;

      // Build last_move_san from prevRow
      const myMoveSan = row.move_san ?? null;

      // gain_cp: convert gain to centipawns
      const gainCp = result.gain != null ? Math.round(result.gain * 100) : null;

      // threat_pv: UCI line from nullFen
      const nf = nullFen(row.fen_before);
      let threatPvUci: string | null = null;
      if (hasThreat && result.line) {
        // result.line is SANs — we need UCI
        // Re-derive from analyseThreat internals... we can't easily get back UCI
        // Use nf + play the SAN moves to get UCI
        try {
          const nfc = new Chess(nf);
          const sanMoves = result.line.split(' ');
          const ucis: string[] = [];
          for (const san of sanMoves.slice(0, 6)) {
            const mv = nfc.move(san);
            if (!mv) break;
            ucis.push(uciOf(mv));
          }
          threatPvUci = ucis.join(' ');
        } catch { /* noop */ }
      }

      // attacker_sq: where the threat move comes from
      const attackerSq = result.attacker ?? null;

      await supabase.from('threat_positions').upsert({
        game_id: game.id,
        ply,
        fen: row.fen_before,
        my_color: c.turn() as string,
        last_move_uci: lastMoveUci,
        last_move_san: lastMoveSan,
        has_threat: hasThreat,
        threat_uci: attackerSq && result.T ? (() => {
          // Build threat UCI from attacker_sq + target
          // T is SAN, attacker is sq; we need to find the destination from T
          try {
            const nfc2 = new Chess(nf);
            const mv = nfc2.move(result.T);
            if (mv) return uciOf(mv);
          } catch { /* noop */ }
          return null;
        })() : null,
        threat_san: result.T ?? null,
        threat_pv: threatPvUci,
        targets: result.targets ?? [],
        optional_targets: result.optional ?? [],
        attacker_sq: attackerSq,
        motif: result.motif ?? null,
        gain_cp: gainCp,
        mate_in: result.mate_in ?? null,
        difficulty: result.difficulty ?? 1,
        missed_in_game: missedInGame,
        my_move_san: myMoveSan,
        version: 2,
      }, { onConflict: 'game_id,ply' });

      positionsThisGame++;
      found++;
      onProgress({ gamesChecked, gamesTotal, found });
    }

    await supabase.from('games').update({ threats_scanned_at: new Date().toISOString() }).eq('id', game.id);
    gamesChecked++;
    onProgress({ gamesChecked, gamesTotal, found });
  }
}
