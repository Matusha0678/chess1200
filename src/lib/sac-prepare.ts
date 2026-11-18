import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import { quickSac, analyseSac, temptingMoves } from './sac-logic';
import type { SacResult } from './sac-logic';
import { play, uciOf, dist, kingSquare } from './see';
import { isMateFor, forSide } from './engine';
import type { Engine, EngineLine } from './engine';
import { supabase } from './supabase';

export interface PrepProgress {
  gamesChecked: number;
  gamesTotal: number;
  found: number;
  works: number;
  fails: number;
  error?: string;
}

interface GameRow {
  id: string;
  pgn: string;
  white: string;
  black: string;
}

export interface SacInsertRow {
  fen: string;
  move: string;
  san: string | null;
  kind: 'real' | 'fake';
  eval_before: number | null;   // centipawns for sac side S (mate → ±9000)
  eval_after: number | null;
  eval_no_sac: number | null;
  best_no_sac: string | null;
  pv: string | null;
  defenses: unknown[];
  accepted_pv: string | null;   // UCI space-separated, starts with opponent's capture
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

// Convert EngineLine to integer centipawns for side S.
// Mate for S → +9000, mate against S → −9000, else round(forSide * 100).
function toDbCp(line: EngineLine, S: Color): number {
  if (line.mate !== null) return isMateFor(line, S) ? 9000 : -9000;
  return Math.round(forSide(line, S) * 100);
}

// Human-readable outcome for a defense line from fenAfter position.
function lineOutcome(l: EngineLine, S: Color): string {
  const opp: Color = S === 'w' ? 'b' : 'w';
  if (isMateFor(l, S)) return `мат в ${Math.abs(l.mate!)} ходов`;
  const v = forSide(l, S);
  if (v >= 9) return 'выигрыш ферзя';
  if (v >= 5) return 'выигрыш ладьи';
  if (v >= 1.5) return `перевес +${v.toFixed(1)}`;
  return `${opp === 'w' ? 'белые' : 'чёрные'} отбиваются`;
}

function buildInsertRow(
  r: SacResult,
  fen: string,
  uci: string,
  gameId: string,
  plyNum: number,
  isDecoy: boolean,
): SacInsertRow | null {
  if (!r.isSac || !r.kind) return null;

  const kind: 'real' | 'fake' = r.kind === 'works' ? 'real' : 'fake';
  const S = r.S!;

  // Numeric evals for sac side S
  const evalBefore  = r.bestLine ? toDbCp(r.bestLine, S) : null;
  const evalAfter   = r.candLine ? toDbCp(r.candLine, S) : null;
  const evalNoSac   = r.altLine  ? toDbCp(r.altLine,  S) : null;
  const bestNoSac   = r.altLine?.move ?? null;

  // pv = first defense line from afterLines
  const afterLines = r.afterLines ?? [];
  const pv = afterLines[0]?.pv ? afterLines[0].pv.join(' ') : null;

  // defenses JSON with outcome strings
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
      outcome: lineOutcome(l, S),
    };
    void p; // play is kept for reference but outcome uses engine eval
  });

  // accepted_pv: UCI starting with opponent's capture (acc.pv)
  const acceptedPv = r.acceptedPvUci ? r.acceptedPvUci.join(' ') : null;

  // king_attack: sacSquare distance to opponent king
  let kingAttack = false;
  try {
    const c0 = new Chess(fen);
    const O: Color = S === 'w' ? 'b' : 'w';
    const oppKing = kingSquare(c0, O);
    if (r.sacSquare) {
      kingAttack = dist(r.sacSquare, oppKing) <= 2;
    }
  } catch { /* noop */ }

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
    accepted_pv: acceptedPv,
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

interface Candidate {
  fen: string;
  uci: string;
  ply: number;
  isDecoy: boolean;
}

interface TemptingCandidate {
  fen: string;
  uci: string;
  ply: number;
  san: string;
  distToKing: number;
}

// Pure function: analyse one game and return all rows that would be saved.
// Does NOT write to DB. Used by tests and by prepareSacPositions.
export async function buildSacRowsForGame(
  pgn: string,
  gameId: string,
  engine: Engine,
  filter: 'tal' | 'all',
  gameWhite: string,
  gameBlack: string,
): Promise<SacInsertRow[]> {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return [];
  }

  const history = chess.history({ verbose: true });
  const replay = new Chess();
  const realCandidates: Candidate[] = [];
  const allTempting: TemptingCandidate[] = [];

  // Determine Tal's side if Tal filter
  let talSide: Color | null = null;
  if (filter === 'tal') {
    if (gameWhite.toLowerCase().includes('tal')) talSide = 'w';
    else if (gameBlack.toLowerCase().includes('tal')) talSide = 'b';
    else return []; // Tal not in this game
  }

  for (let i = 0; i < history.length; i++) {
    const fen = replay.fen();
    const m = history[i];
    const uci = uciOf(m);
    const ply = i + 1;
    const turn = replay.turn() as Color;

    // Tal filter: only Tal's moves
    if (talSide !== null && turn !== talSide) {
      try { replay.move({ from: m.from, to: m.to, promotion: m.promotion }); } catch { break; }
      continue;
    }

    // Only after ply 10
    if (ply >= 10) {
      const q = quickSac(fen, uci);
      if (q.ok) {
        realCandidates.push({ fen, uci, ply, isDecoy: false });
      }

      // Collect tempting moves from this position for decoy candidates
      const tempting = temptingMoves(fen).filter(u => u !== uci);
      for (const tu of tempting) {
        try {
          const c = new Chess(fen);
          const mv = c.move({ from: tu.slice(0, 2), to: tu.slice(2, 4), promotion: tu[4] || 'q' });
          const O: Color = turn === 'w' ? 'b' : 'w';
          const kSq = kingSquare(new Chess(fen), O);
          allTempting.push({
            fen, uci: tu, ply,
            san: mv.san,
            distToKing: dist(tu.slice(2, 4), kSq),
          });
        } catch { /* noop */ }
      }
    }

    try {
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    } catch {
      break;
    }
  }

  // Sort tempting moves: checks first, then by distance to king
  allTempting.sort((a, b) => {
    const aIsCheck = /[+#]/.test(a.san) ? 0 : 1;
    const bIsCheck = /[+#]/.test(b.san) ? 0 : 1;
    if (aIsCheck !== bIsCheck) return aIsCheck - bIsCheck;
    return a.distToKing - b.distToKing;
  });
  const topDecoys = allTempting.slice(0, 3);

  const candidates: Candidate[] = [
    ...realCandidates,
    ...topDecoys.map(d => ({ fen: d.fen, uci: d.uci, ply: d.ply, isDecoy: true })),
  ];

  const beforeCache = new Map<string, EngineLine[]>();
  const rows: SacInsertRow[] = [];
  let decoysFound = 0;

  for (const cand of candidates) {
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

    if (cand.isDecoy && (result.kind !== 'fails' || !result.keep)) continue;
    if (!cand.isDecoy && !result.keep) continue;
    if (cand.isDecoy && decoysFound >= 1) continue;

    const row = buildInsertRow(result, cand.fen, cand.uci, gameId, cand.ply, cand.isDecoy);
    if (!row) continue;

    rows.push(row);

    if (cand.isDecoy) decoysFound++;
  }

  return rows;
}

export async function prepareSacPositions(
  engine: Engine,
  filter: 'tal' | 'all',
  onProgress: (p: PrepProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  let query = supabase
    .from('master_games')
    .select('id,pgn,white,black')
    .lt('sac_version', 2)
    .limit(200);

  if (filter === 'tal') {
    query = query.or('white.ilike.%Tal%,black.ilike.%Tal%');
  }

  const { data: games, error } = await query;
  if (error) {
    onProgress({ gamesChecked: 0, gamesTotal: 0, found: 0, works: 0, fails: 0, error: `Ошибка базы: ${error.message}. Выполни SQL 27–29 (supabase/RUN-ORDER.md)` });
    return;
  }
  if (!games || games.length === 0) {
    onProgress({ gamesChecked: 0, gamesTotal: 0, found: 0, works: 0, fails: 0 });
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

    const rows = await buildSacRowsForGame(
      game.pgn,
      game.id,
      engine,
      filter,
      game.white,
      game.black,
    );

    // If PGN failed to parse, rows is empty; mark game anyway
    let gameHadError = false;

    for (const row of rows) {
      if (signal?.aborted) break;
      const { error: upsertErr } = await supabase
        .from('sac_positions')
        .upsert(row, { onConflict: 'fen,move' });
      if (upsertErr) {
        onProgress({ gamesChecked, gamesTotal, found, works, fails, error: `Ошибка сохранения: ${upsertErr.message}. Выполни SQL 27–29 (supabase/RUN-ORDER.md)` });
        gameHadError = true;
        break;
      }

      found++;
      if (row.kind === 'real') works++;
      else if (row.kind === 'fake') fails++;
      onProgress({ gamesChecked, gamesTotal, found, works, fails });
    }

    if (gameHadError) {
      // Don't mark this game as processed — will retry next time
      gamesChecked++;
      onProgress({ gamesChecked, gamesTotal, found, works, fails });
      continue;
    }

    // All rows saved — mark game as processed
    const { error: markErr } = await supabase
      .from('master_games')
      .update({ sac_version: 2 })
      .eq('id', game.id);
    if (markErr) {
      onProgress({ gamesChecked, gamesTotal, found, works, fails, error: `Ошибка обновления партии: ${markErr.message}` });
    }

    gamesChecked++;
    onProgress({ gamesChecked, gamesTotal, found, works, fails });
  }
}
