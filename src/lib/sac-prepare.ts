import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import { quickSac, analyseSac, temptingMoves } from './sac-logic';
import type { SacResult } from './sac-logic';
import { play, uciOf, dist, kingSquare } from './see';
import { fmtEval } from './engine';
import type { Engine, EngineLine } from './engine';
import { supabase } from './supabase';

export interface PrepProgress {
  gamesChecked: number;
  gamesTotal: number;
  found: number;
  works: number;
  fails: number;
}

interface GameRow {
  id: string;
  pgn: string;
  white: string;
  black: string;
}

interface SacInsertRow {
  fen: string;
  move: string;
  san: string | null;
  kind: 'real' | 'fake';
  eval_before: string | null;
  eval_after: string | null;
  eval_no_sac: string | null;
  best_no_sac: string | null;
  pv: string | null;
  defenses: unknown[];
  accepted_pv: string | null;
  sac_type: string | null;
  piece: string | null;
  material_given: number | null;
  king_attack: boolean;
  mate_in: number | null;
  mate_forced: boolean;
  score: number | null;
  pattern: string | null;
  is_decoy: boolean;
  game_id: string;
  ply: number;
  version: number;
  source: string;
}

function buildInsertRow(
  r: SacResult,
  fen: string,
  uci: string,
  gameId: string,
  plyNum: number,
  isDecoy: boolean,
  beforeLines: EngineLine[],
  afterLines: EngineLine[],
  accLine: string[],
): SacInsertRow | null {
  if (!r.isSac || !r.kind) return null;

  const kind: 'real' | 'fake' = r.kind === 'works' ? 'real' : 'fake';

  // pv = first defense line (opponent's best response)
  const pv = afterLines[0]?.pv ? afterLines[0].pv.join(' ') : null;

  // defenses JSON
  const defenses = afterLines.map((l) => {
    const c = new Chess(fen);
    try { c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); } catch { /* noop */ }
    const fenAfter = c.fen();
    const p = play(fenAfter, l.pv, 5);
    return {
      move: l.move,
      pv: l.pv,
      cp: l.cp,
      mate: l.mate,
      outcome: p.sans.join(' '),
    };
  });

  // king_attack: sacSquare distance to opponent king
  let kingAttack = false;
  try {
    const c0 = new Chess(fen);
    const S = c0.turn() as Color;
    const O: Color = S === 'w' ? 'b' : 'w';
    const oppKing = kingSquare(c0, O);
    if (r.sacSquare) {
      kingAttack = dist(r.sacSquare, oppKing) <= 2;
    }
  } catch { /* noop */ }

  // eval_before = best from same root search
  const bestLine = beforeLines[0];
  const altLine = bestLine.move === uci
    ? (beforeLines[1] ?? beforeLines[0])
    : beforeLines[0];

  const evalBefore = bestLine ? fmtEval(bestLine, fen.split(' ')[1] as 'w' | 'b') : null;

  // For eval_after: use cand (the sacrifice line)
  // We stored r.after already
  const evalAfter = r.after ?? null;
  const evalNoSac = r.alt ?? null;
  const bestNoSac = altLine?.move ?? null;

  return {
    fen,
    move: uci,
    san: r.san ?? null,
    kind,
    eval_before: evalBefore,
    eval_after: evalAfter,
    eval_no_sac: evalNoSac,
    best_no_sac: bestNoSac,
    pv,
    defenses,
    accepted_pv: accLine.join(' ') || null,
    sac_type: r.type ?? null,
    piece: r.sacPiece ?? null,
    material_given: r.given ?? null,
    king_attack: kingAttack,
    mate_in: r.mate_in ?? null,
    mate_forced: r.mate_forced ?? false,
    score: r.score ?? null,
    pattern: r.pattern ?? null,
    is_decoy: isDecoy,
    game_id: gameId,
    ply: plyNum,
    version: 2,
    source: 'master',
  };
}

function extractAcceptedPv(r: SacResult, fen: string, uci: string): string[] {
  // accepted = r.accepted (sans), but we need UCI line
  // The accepted_pv in r is stored as r.accepted (sans string)
  // We need to reconstruct from the analysis — but analyseSac stores it internally
  // The 'accepted' field on SacResult is a SANs string; we can't get UCIs back
  // Instead we'll use r.after which is the eval string — not UCI
  // Actually analyseSac doesn't expose the acc line UCIs directly
  // We'll store the SAN representation in accepted_pv for now
  void fen; void uci;
  return r.accepted ? r.accepted.split(' ') : [];
}

export async function prepareSacPositions(
  engine: Engine,
  filter: 'tal' | 'all',
  onProgress: (p: PrepProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Load master_games where sac_version < 2
  let query = supabase
    .from('master_games')
    .select('id,pgn,white,black')
    .lt('sac_version', 2)
    .limit(200);

  if (filter === 'tal') {
    query = query.or('white.ilike.%Tal%,black.ilike.%Tal%');
  }

  const { data: games, error } = await query;
  if (error || !games || games.length === 0) {
    if (error) console.error('prepareSacPositions: load error', error);
    return;
  }

  const gamesTotal = games.length;
  let gamesChecked = 0;
  let found = 0;
  let works = 0;
  let fails = 0;

  onProgress({ gamesChecked, gamesTotal, found, works, fails });

  for (const game of games as GameRow[]) {
    if (signal?.aborted) break;

    // Play through the PGN
    const chess = new Chess();
    try {
      chess.loadPgn(game.pgn);
    } catch {
      await supabase.from('master_games').update({ sac_version: 2 }).eq('id', game.id);
      gamesChecked++;
      onProgress({ gamesChecked, gamesTotal, found, works, fails });
      continue;
    }

    const history = chess.history({ verbose: true });
    const replay = new Chess();
    const candidates: Array<{ fen: string; uci: string; ply: number; isDecoy: boolean }> = [];
    let decoysThisGame = 0;

    for (let i = 0; i < history.length; i++) {
      if (signal?.aborted) break;

      const fen = replay.fen();
      const m = history[i];
      const uci = uciOf(m);
      const ply = i + 1;

      // Only after ply 10
      if (ply >= 10) {
        const q = quickSac(fen, uci);
        if (q.ok) {
          candidates.push({ fen, uci, ply, isDecoy: false });
        }

        // Also find tempting decoy moves
        if (decoysThisGame < 1) {
          const tempting = temptingMoves(fen).filter(u => u !== uci);
          for (const tu of tempting.slice(0, 3)) {
            candidates.push({ fen, uci: tu, ply, isDecoy: true });
          }
        }
      }

      try {
        replay.move({ from: m.from, to: m.to, promotion: m.promotion });
      } catch {
        break;
      }
    }

    // Analyse each candidate
    // Cache beforeLines per unique fen to avoid redundant analysis
    const beforeCache = new Map<string, EngineLine[]>();

    for (const cand of candidates) {
      if (signal?.aborted) break;

      let beforeLines = beforeCache.get(cand.fen);
      if (!beforeLines) {
        try {
          beforeLines = await engine.analyse(cand.fen, { multipv: 2 });
          beforeCache.set(cand.fen, beforeLines);
        } catch {
          continue;
        }
      }

      let result: SacResult;
      try {
        result = await analyseSac(engine, cand.fen, cand.uci, {
          fromMaster: true,
          before: beforeLines,
        });
      } catch {
        continue;
      }

      if (!result.isSac) continue;
      found++;

      // For decoys: only save if kind === 'fails' and keep
      if (cand.isDecoy && (result.kind !== 'fails' || !result.keep)) continue;
      if (!cand.isDecoy && !result.keep) continue;

      // Get afterLines for defenses display (analyseSac already did this internally, but we need them for insert)
      let afterLines: EngineLine[] = [];
      try {
        const c = new Chess(cand.fen);
        c.move({ from: cand.uci.slice(0, 2), to: cand.uci.slice(2, 4), promotion: cand.uci[4] || 'q' });
        afterLines = await engine.analyse(c.fen(), { multipv: 2 });
      } catch { /* noop */ }

      const accLine = extractAcceptedPv(result, cand.fen, cand.uci);

      const row = buildInsertRow(
        result,
        cand.fen,
        cand.uci,
        game.id,
        cand.ply,
        cand.isDecoy,
        beforeLines,
        afterLines,
        accLine,
      );

      if (!row) continue;

      await supabase.from('sac_positions').upsert(row, { onConflict: 'fen,move' });

      if (result.kind === 'works') works++;
      else if (result.kind === 'fails') {
        fails++;
        if (cand.isDecoy) decoysThisGame++;
      }

      onProgress({ gamesChecked, gamesTotal, found, works, fails });
    }

    // Mark game as processed
    await supabase.from('master_games').update({ sac_version: 2 }).eq('id', game.id);

    gamesChecked++;
    onProgress({ gamesChecked, gamesTotal, found, works, fails });
  }
}
