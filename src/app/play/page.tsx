'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { Board } from '@/components/board/Board';
import type { BoardArrow, BadgeKind } from '@/components/board/Board';
import { ClassIcon } from '@/components/ClassIcon';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { CONVERT_POSITIONS } from '@/data/convert';
import { classifyMove, computeAccuracy, CLASS_LABEL, CLASS_COLOR, explainMove, winProb, type MoveClass } from '@/lib/classify';
import { createBrowserEngine } from '@/lib/engine';
import type { Engine } from '@/lib/engine';

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'playing' | 'review';
type HandicapPiece = 'queen' | 'rook' | 'knight';
type PlayMode = 'free' | 'convert' | 'handicap';
type PlayerColor = 'w' | 'b';

interface MoveRecord {
  san: string;
  fenBefore: string;
  fenAfter: string;
  side: PlayerColor;
  uci: string;
  cls?: MoveClass;
  evalBefore?: number;  // white's POV cp
  evalAfter?: number;   // white's POV cp
  bestMove?: string;    // best move UCI in position before
}

interface GameStats {
  wins: number;
  draws: number;
  losses: number;
}

interface CoachInfo {
  cls: MoveClass;
  san: string;
  moveNum: number;
  evalBefore: number;
  evalAfter: number;
  bestMoveSan: string;
  bestMoveUci: string;
  color: 'w' | 'b';
}

interface KeyMistake {
  moveIdx: number;
  san: string;
  moveNum: number;
  drop: number;
  dropLabel: string;
  cls: MoveClass;
  fenBefore: string;
  fenAfter: string;
  uci: string;
  bestMoveUci: string;
  bestMoveSan: string;
}

const LEVEL_PRESETS: { label: string; skill: number }[] = [
  { label: 'Новичок', skill: 2 },
  { label: 'Любитель', skill: 6 },
  { label: 'Клубный', skill: 10 },
  { label: 'Сильный', skill: 14 },
  { label: 'Мастер', skill: 18 },
];

const HANDICAP_FENS: Record<HandicapPiece, string> = {
  queen:  'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  rook:   'r1bqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  knight: 'r1bqkb1r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
};

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function normalizeColor(raw: string | null): PlayerColor {
  if (!raw) return 'w';
  if (raw === 'white' || raw === 'w') return 'w';
  if (raw === 'black' || raw === 'b') return 'b';
  return 'w';
}

function closestPreset(level: number): number {
  let best = 0;
  let bestDiff = Infinity;
  LEVEL_PRESETS.forEach((p, i) => {
    const d = Math.abs(p.skill - level);
    if (d < bestDiff) { bestDiff = d; best = i; }
  });
  return best;
}

function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return uci;
  try {
    const chess = new Chess(fen);
    const mv = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length === 5 ? uci[4] as 'q' | 'r' | 'b' | 'n' : undefined,
    });
    return mv?.san ?? uci;
  } catch { return uci; }
}

function lineToWhiteCp(l: { cp: number | null; mate: number | null }): number {
  if (l.mate !== null) return l.mate > 0 ? 9900 : -9900;
  return l.cp ?? 0;
}

function evalBarPct(cpWhite: number): number {
  return Math.max(5, Math.min(95, 50 + cpWhite / 20));
}

function formatEval(cpWhite: number): string {
  if (cpWhite >= 9000) return '+M';
  if (cpWhite <= -9000) return '-M';
  return cpWhite >= 0 ? `+${(cpWhite / 100).toFixed(1)}` : (cpWhite / 100).toFixed(1);
}

function capturedPieces(fen: string, side: PlayerColor): string {
  const startCount: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1, P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 };
  const curCount: Record<string, number> = {};
  const board = fen.split(' ')[0];
  for (const ch of board) {
    if (/[a-zA-Z]/.test(ch) && ch !== '/') curCount[ch] = (curCount[ch] ?? 0) + 1;
  }
  const captured: string[] = [];
  const targets = side === 'w' ? 'pnbrq' : 'PNBRQ';
  for (const c of targets) {
    const start = startCount[c] ?? 0;
    const cur = curCount[c] ?? 0;
    const diff = start - cur;
    for (let i = 0; i < diff; i++) {
      captured.push(c === c.toUpperCase() ? '♙♘♗♖♕'['PNBRQ'.indexOf(c)] : '♟♞♝♜♛'['pnbrq'.indexOf(c)]);
    }
  }
  return captured.join('');
}

function getResultTitle(chess: Chess, playerColor: PlayerColor, surrendered: boolean): { title: string; color: string; reason: string } {
  if (surrendered) {
    const plyCount = chess.history().length;
    return { title: 'Поражение', color: 'var(--c-bad)', reason: `Ты сдался на ${Math.ceil(plyCount / 2)}-м ходу` };
  }
  if (chess.isCheckmate()) {
    const winner = chess.turn() === playerColor ? 'loss' : 'win';
    const plyCount = chess.history().length;
    if (winner === 'win') return { title: 'Победа!', color: 'var(--accent)', reason: `Мат на ${Math.ceil(plyCount / 2)}-м ходу` };
    return { title: 'Поражение', color: 'var(--c-bad)', reason: `Мат на ${Math.ceil(plyCount / 2)}-м ходу` };
  }
  if (chess.isStalemate()) return { title: 'Ничья', color: 'var(--muted)', reason: 'Пат' };
  if (chess.isThreefoldRepetition()) return { title: 'Ничья', color: 'var(--muted)', reason: 'Троекратное повторение' };
  if (chess.isInsufficientMaterial()) return { title: 'Ничья', color: 'var(--muted)', reason: 'Недостаточно материала' };
  if (chess.isDraw()) return { title: 'Ничья', color: 'var(--muted)', reason: 'Ничья' };
  return { title: 'Игра завершена', color: 'var(--muted)', reason: '' };
}

function getGameResult(chess: Chess, playerColor: PlayerColor, surrendered: boolean): 'win' | 'loss' | 'draw' {
  if (surrendered) return 'loss';
  if (chess.isCheckmate()) return chess.turn() === playerColor ? 'loss' : 'win';
  if (chess.isDraw()) return 'draw';
  return 'draw';
}

function coachCardStyle(cls: MoveClass | null): React.CSSProperties {
  if (!cls) return { border: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.03)' };
  if (cls === 'blunder') return { border: '1px solid rgba(217,83,79,0.4)', background: 'rgba(217,83,79,0.07)' };
  if (cls === 'mistake') return { border: '1px solid rgba(224,144,64,0.4)', background: 'rgba(224,144,64,0.07)' };
  if (cls === 'inaccuracy' || cls === 'miss') return { border: '1px solid rgba(230,200,74,0.4)', background: 'rgba(230,200,74,0.07)' };
  return { border: '1px solid rgba(129,182,76,0.4)', background: 'rgba(129,182,76,0.07)' };
}

const chipStyle: React.CSSProperties = {
  height: 26, display: 'inline-flex', alignItems: 'center', padding: '0 10px',
  borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--hairline)',
  fontSize: 13, color: 'var(--ivory)',
};

// ── Main component ────────────────────────────────────────────────────────────

function PlayContent() {
  const params = useSearchParams();
  const router = useRouter();

  // URL params
  const rawFen = params.get('fen') ?? '';
  const rawColor = params.get('color');
  const rawLevel = parseInt(params.get('level') ?? '10', 10);
  const rawMode = (params.get('mode') ?? 'free') as PlayMode;

  // Settings
  const [pendingColor, setPendingColor] = useState<PlayerColor | 'any'>(() => {
    if (rawColor === 'any') return 'any';
    return normalizeColor(rawColor);
  });
  const [activeColor, setActiveColor] = useState<PlayerColor>(() => {
    if (rawColor === 'any') return Math.random() < 0.5 ? 'w' : 'b';
    return normalizeColor(rawColor);
  });
  const [level, setLevel] = useState(() => isNaN(rawLevel) ? 10 : Math.max(0, Math.min(20, rawLevel)));
  const [mode, setMode] = useState<PlayMode>(rawMode);
  const [handicapPiece, setHandicapPiece] = useState<HandicapPiece | null>(null);
  const [presetIdx, setPresetIdx] = useState(() => closestPreset(isNaN(rawLevel) ? 10 : rawLevel));

  // localStorage settings
  const [showEvalBar, setShowEvalBar] = useState(() => {
    try { return (JSON.parse(localStorage.getItem('play-coach') ?? '{}') as { showEvalBar?: boolean }).showEvalBar ?? true; } catch { return true; }
  });
  const [showBadges, setShowBadges] = useState(() => {
    try { return (JSON.parse(localStorage.getItem('play-coach') ?? '{}') as { showBadges?: boolean }).showBadges ?? true; } catch { return true; }
  });

  // Convert mode
  const [convertIdx, setConvertIdx] = useState(0);
  const [convertStats, setConvertStats] = useState<{ wins: number; total: number } | null>(null);

  // Stats
  const [stats, setStats] = useState<GameStats>({ wins: 0, draws: 0, losses: 0 });
  const [playerName, setPlayerName] = useState('');

  // Game state — fen and turn are state so render is correct
  const [fen, setFen] = useState(START_FEN);
  const [turn, setTurn] = useState<PlayerColor>('w');
  const [gamePhase, setGamePhase] = useState<GamePhase>('playing');
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const [resultInfo, setResultInfo] = useState<{ title: string; color: string; reason: string } | null>(null);
  // moveHistory as state for render; also mirrored in ref for callbacks
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const moveHistoryRef = useRef<MoveRecord[]>([]);

  // Move navigation
  const [viewIdx, setViewIdx] = useState(-1);

  // Eval
  const [evalCpWhite, setEvalCpWhite] = useState<number | null>(null);
  const [isEvalAnalyzing, setIsEvalAnalyzing] = useState(false);

  // Coach
  const [coach, setCoach] = useState<CoachInfo | null>(null);

  // Hint
  const [hintArrow, setHintArrow] = useState<string | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Surrender
  const [surrenderConfirm, setSurrenderConfirm] = useState(false);

  // After-game review
  const [reviewing, setReviewing] = useState(false);
  const [reviewAnalysisDone, setReviewAnalysisDone] = useState(false);
  const [keyMistakes, setKeyMistakes] = useState<KeyMistake[]>([]);
  const [selectedMistake, setSelectedMistake] = useState<number | null>(null);

  // Chess object in ref (not state — doesn't trigger re-renders)
  const chessRef = useRef(new Chess(START_FEN));

  // Coach engine
  const coachEngineRef = useRef<(Engine & { quit(): void }) | null>(null);
  const coachEngineReady = useRef(false);

  const { getBestMove, getEval, setSkillLevel, isReady: sfReady, stopAnalysis } = useStockfish();
  const { S } = useTrainerGeometry();

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    setSkillLevel(level);
  }, [level, setSkillLevel]);

  useEffect(() => {
    supabase.from('game_log').select('result').in('mode', ['free', 'convert', 'handicap'])
      .then(({ data }) => {
        if (!data) return;
        const wins = data.filter(r => r.result === 'win').length;
        const draws = data.filter(r => r.result === 'draw').length;
        const losses = data.filter(r => r.result === 'loss').length;
        setStats({ wins, draws, losses });
      });
    supabase.from('games_sync_state').select('username').eq('id', 1).maybeSingle()
      .then(({ data }) => {
        if (data) setPlayerName((data as { username: string }).username);
      });
    supabase.from('game_log').select('result').eq('mode', 'convert')
      .then(({ data }) => {
        if (!data) return;
        setConvertStats({ total: data.length, wins: data.filter(r => r.result === 'win').length });
      });
  }, []);

  // ── Coach engine ──────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    createBrowserEngine().then(eng => {
      if (!mounted) { eng.quit(); return; }
      coachEngineRef.current = eng;
      coachEngineReady.current = true;
    }).catch(() => {});
    return () => {
      mounted = false;
      coachEngineRef.current?.quit();
      coachEngineRef.current = null;
      coachEngineReady.current = false;
    };
  }, []);

  // ── Save settings ─────────────────────────────────────────────────────────

  const saveSettings = useCallback((evalBar: boolean, badges: boolean) => {
    try { localStorage.setItem('play-coach', JSON.stringify({ showEvalBar: evalBar, showBadges: badges })); } catch { /* ignore */ }
  }, []);

  // ── URL update ────────────────────────────────────────────────────────────

  const updateUrl = useCallback((c: PlayerColor | 'any', l: number, m: PlayMode) => {
    const url = new URL(window.location.href);
    url.searchParams.set('color', c);
    url.searchParams.set('level', String(l));
    url.searchParams.set('mode', m);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  // ── Get start FEN ─────────────────────────────────────────────────────────

  const getStartFen = useCallback((md: PlayMode, ci: number, hp: HandicapPiece | null): string => {
    if (md === 'convert') return CONVERT_POSITIONS[ci].fen;
    if (md === 'handicap' && hp) return HANDICAP_FENS[hp];
    if (rawFen) {
      try { new Chess(rawFen); return rawFen; } catch { /* fall through */ }
    }
    return START_FEN;
  }, [rawFen]);

  // ── Game reset ────────────────────────────────────────────────────────────

  const startNewGame = useCallback((opts?: {
    color?: PlayerColor | 'any';
    lvl?: number;
    md?: PlayMode;
    piece?: HandicapPiece | null;
    revenge?: boolean;
  }) => {
    const color = opts?.color ?? pendingColor;
    const lvl = opts?.lvl ?? level;
    const md = opts?.md ?? mode;
    const piece = opts?.piece !== undefined ? opts.piece : handicapPiece;

    let pc: PlayerColor;
    if (color === 'any') {
      pc = opts?.revenge ? (activeColor === 'w' ? 'b' : 'w') : (Math.random() < 0.5 ? 'w' : 'b');
    } else {
      pc = opts?.revenge ? (color === 'w' ? 'b' : 'w') : color;
    }

    let newConvertIdx = convertIdx;
    if (md === 'convert') {
      newConvertIdx = (convertIdx + 1) % CONVERT_POSITIONS.length;
      setConvertIdx(newConvertIdx);
    }

    const startFen = getStartFen(md, newConvertIdx, piece);
    chessRef.current = new Chess(startFen);

    moveHistoryRef.current = [];
    setMoveHistory([]);
    hasStartedRef.current = false;
    isProcessingRef.current = false;
    setIsProcessing(false);
    setActiveColor(pc);
    setFen(startFen);
    setTurn(chessRef.current.turn() as PlayerColor);
    setGamePhase('playing');
    setResultInfo(null);
    setSurrenderConfirm(false);
    setCoach(null);
    setEvalCpWhite(null);
    setHintArrow(null);
    setViewIdx(-1);
    setReviewing(false);
    setReviewAnalysisDone(false);
    setKeyMistakes([]);
    setSelectedMistake(null);
    stopAnalysis();

    updateUrl(color, lvl, md);
  }, [pendingColor, level, mode, handicapPiece, activeColor, convertIdx, getStartFen, stopAnalysis, updateUrl]);

  // ── Log game ──────────────────────────────────────────────────────────────

  const logGame = useCallback(async (startFen: string, result: 'win' | 'loss' | 'draw', md: PlayMode, pc: PlayerColor, lvl: number) => {
    try {
      await supabase.from('game_log').insert({
        fen: startFen, mode: md, result,
        player_color: pc, level: lvl,
        pgn: chessRef.current.pgn(),
      });
      setStats(s => ({
        wins: s.wins + (result === 'win' ? 1 : 0),
        draws: s.draws + (result === 'draw' ? 1 : 0),
        losses: s.losses + (result === 'loss' ? 1 : 0),
      }));
    } catch { /* non-critical */ }
  }, []);

  // ── After-game analysis ───────────────────────────────────────────────────

  const runReviewAnalysis = useCallback(async (
    startFen: string,
    surrenderedResult: boolean,
    history: MoveRecord[],
    pc: PlayerColor,
    md: PlayMode,
    lvl: number,
  ) => {
    setReviewing(true);

    // Build a mutable copy to enrich with evals
    const enriched: MoveRecord[] = history.map(m => ({ ...m }));

    if (coachEngineReady.current && coachEngineRef.current) {
      const engine = coachEngineRef.current;
      for (const mv of enriched) {
        if (mv.evalBefore === undefined) {
          try {
            const lines = await engine.analyse(mv.fenBefore, { depth: 14 });
            if (lines[0]) {
              mv.evalBefore = lineToWhiteCp(lines[0]);
              if (!mv.bestMove) mv.bestMove = lines[0].move;
            }
          } catch { /* ignore */ }
        }
        if (mv.evalAfter === undefined) {
          const chessAfter = new Chess(mv.fenAfter);
          if (chessAfter.isCheckmate()) {
            mv.evalAfter = chessAfter.turn() === 'b' ? 9900 : -9900;
          } else if (chessAfter.isDraw()) {
            mv.evalAfter = 0;
          } else {
            try {
              const lines = await engine.analyse(mv.fenAfter, { depth: 14 });
              if (lines[0]) mv.evalAfter = lineToWhiteCp(lines[0]);
            } catch { /* ignore */ }
          }
        }
      }
    }

    // Classify all player moves
    let plyNumber = 0;
    for (const mv of enriched) {
      plyNumber++;
      if (mv.side !== pc) continue;
      if (mv.evalBefore === undefined || mv.evalAfter === undefined || mv.cls) continue;
      const phase = plyNumber < 20 ? 'opening' : plyNumber < 60 ? 'middlegame' : 'endgame';
      mv.cls = classifyMove({
        evalBefore: mv.evalBefore,
        evalAfter: mv.evalAfter,
        color: mv.side,
        isEngineMove: mv.uci === mv.bestMove,
        plyNumber,
        phase,
      });
    }

    // Update move history state with enriched data
    moveHistoryRef.current = enriched;
    setMoveHistory(enriched);

    // Find key mistakes
    const mistakes: KeyMistake[] = [];
    let mi = 0;
    for (let i = 0; i < enriched.length; i++) {
      const mv = enriched[i];
      if (mv.side !== pc) continue;
      mi++;
      if (mv.evalBefore === undefined || mv.evalAfter === undefined) continue;
      const drop = pc === 'w' ? (mv.evalBefore - mv.evalAfter) : (mv.evalAfter - mv.evalBefore);
      if (drop < 50) continue;
      const cls = mv.cls ?? 'mistake';
      if (cls !== 'blunder' && cls !== 'mistake' && cls !== 'inaccuracy') continue;
      const bestMoveSan = mv.bestMove ? uciToSan(mv.fenBefore, mv.bestMove) : '';
      let dropLabel: string;
      if (pc === 'w') {
        if ((mv.evalBefore ?? 0) >= 9000 && (mv.evalAfter ?? 0) < 9000) dropLabel = 'упустил мат';
        else if ((mv.evalAfter ?? 0) <= -9000) dropLabel = 'мат';
        else dropLabel = `-${Math.min(20, drop / 100).toFixed(1)}`;
      } else {
        if ((mv.evalBefore ?? 0) <= -9000 && (mv.evalAfter ?? 0) > -9000) dropLabel = 'упустил мат';
        else if ((mv.evalAfter ?? 0) >= 9000) dropLabel = 'мат';
        else dropLabel = `-${Math.min(20, drop / 100).toFixed(1)}`;
      }
      mistakes.push({
        moveIdx: i,
        san: mv.san,
        moveNum: mi,
        drop,
        dropLabel,
        cls,
        fenBefore: mv.fenBefore,
        fenAfter: mv.fenAfter,
        uci: mv.uci,
        bestMoveUci: mv.bestMove ?? '',
        bestMoveSan,
      });
    }
    mistakes.sort((a, b) => {
      const rank = (c: MoveClass) => c === 'blunder' ? 0 : c === 'mistake' ? 1 : 2;
      if (rank(a.cls) !== rank(b.cls)) return rank(a.cls) - rank(b.cls);
      return b.drop - a.drop;
    });

    const top3 = mistakes.slice(0, 3);
    setKeyMistakes(top3);
    if (top3.length > 0) setSelectedMistake(0);

    // Log game
    const result = getGameResult(chessRef.current, pc, surrenderedResult);
    logGame(startFen, result, md, pc, lvl);

    setReviewAnalysisDone(true);
    setReviewing(false);
  }, [logGame]);

  // ── Handle game over ──────────────────────────────────────────────────────

  const handleGameOver = useCallback((startFen: string, surrenderedNow: boolean, history: MoveRecord[], pc: PlayerColor, md: PlayMode, lvl: number) => {
    stopAnalysis();
    setIsEvalAnalyzing(false);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setHintArrow(null);
    setResultInfo(getResultTitle(chessRef.current, pc, surrenderedNow));
    setGamePhase('review');
    runReviewAnalysis(startFen, surrenderedNow, history, pc, md, lvl);
  }, [stopAnalysis, hintTimerRef, runReviewAnalysis]);

  // ── Stockfish move ────────────────────────────────────────────────────────

  const requestStockfishMove = useCallback((currentFen: string, pc: PlayerColor, startFen: string, md: PlayMode, lvl: number) => {
    getBestMove(currentFen, 14, (uciMove) => {
      setTimeout(() => {
        try {
          const chess = chessRef.current;
          const from = uciMove.slice(0, 2);
          const to = uciMove.slice(2, 4);
          const promotion = uciMove[4] as 'q' | 'r' | 'b' | 'n' | undefined;
          const mv = chess.move({ from, to, promotion });
          if (mv) {
            const newFen = chess.fen();
            const newRecord: MoveRecord = {
              san: mv.san,
              fenBefore: currentFen,
              fenAfter: newFen,
              side: mv.color as PlayerColor,
              uci: from + to + (promotion ?? ''),
            };
            moveHistoryRef.current = [...moveHistoryRef.current, newRecord];
            setMoveHistory(h => [...h, newRecord]);
            setFen(newFen);
            setTurn(chess.turn() as PlayerColor);
            if (chess.isGameOver()) {
              isProcessingRef.current = false;
              setIsProcessing(false);
              handleGameOver(startFen, false, moveHistoryRef.current, pc, md, lvl);
              return;
            }
            if (showEvalBar) {
              setIsEvalAnalyzing(true);
              getEval(newFen, 18, (result) => {
                const sideToMove = newFen.split(' ')[1] ?? 'w';
                let cpW: number;
                if (result.mate !== undefined) {
                  const absVal = result.mate > 0 ? 9900 : -9900;
                  cpW = sideToMove === 'b' ? -absVal : absVal;
                } else {
                  cpW = result.cp !== undefined ? (sideToMove === 'w' ? result.cp : -result.cp) : 0;
                }
                setEvalCpWhite(cpW);
                setIsEvalAnalyzing(false);
              });
            }
          }
        } catch { /* ignore */ }
        isProcessingRef.current = false;
        setIsProcessing(false);
      }, 300);
    });
  }, [getBestMove, getEval, handleGameOver, showEvalBar]);

  // ── Classify my move via coach engine ─────────────────────────────────────

  const evaluateMyMove = useCallback(async (fenBefore: string, fenAfter: string, san: string, uci: string, plyNum: number, pc: PlayerColor) => {
    if (!coachEngineReady.current || !coachEngineRef.current) return;
    const engine = coachEngineRef.current;
    try {
      const beforeLines = await engine.analyse(fenBefore, { depth: 16, multipv: 2 });
      const evalBefore = beforeLines[0] ? lineToWhiteCp(beforeLines[0]) : 0;
      const evalSecondBest = beforeLines[1] ? lineToWhiteCp(beforeLines[1]) : undefined;
      const bestMoveUci = beforeLines[0]?.move ?? '';
      const bestMoveSan = bestMoveUci ? uciToSan(fenBefore, bestMoveUci) : '';

      const chessAfter = new Chess(fenAfter);
      let evalAfter: number;
      if (chessAfter.isCheckmate()) {
        evalAfter = chessAfter.turn() === 'b' ? 9900 : -9900;
      } else if (chessAfter.isDraw()) {
        evalAfter = 0;
      } else {
        const afterLines = await engine.analyse(fenAfter, { depth: 16 });
        evalAfter = afterLines[0] ? lineToWhiteCp(afterLines[0]) : 0;
      }

      const phase = plyNum < 20 ? 'opening' : plyNum < 60 ? 'middlegame' : 'endgame';
      const cls = classifyMove({
        evalBefore,
        evalAfter,
        evalSecondBest,
        color: pc,
        isEngineMove: uci === bestMoveUci,
        plyNumber: plyNum,
        phase,
      });

      const updated = moveHistoryRef.current.map(r =>
        r.uci === uci && r.fenBefore === fenBefore
          ? { ...r, evalBefore, evalAfter, bestMove: bestMoveUci, cls }
          : r
      );
      moveHistoryRef.current = updated;
      setMoveHistory(updated);

      const moveNum = Number(fenBefore.split(' ')[5]);
      const info: CoachInfo = {
        cls, san, moveNum, evalBefore, evalAfter, bestMoveSan, bestMoveUci, color: pc,
      };
      setCoach(info);
    } catch { /* ignore */ }
  }, []);

  // ── Player move ───────────────────────────────────────────────────────────

  const handleMove = useCallback(({ from, to, promotion }: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }): boolean => {
    if (isProcessingRef.current || !sfReady || gamePhase !== 'playing') return false;
    if (turn !== activeColor) return false;
    if (viewIdx !== -1) return false;

    const chess = chessRef.current;
    const startFen = getStartFen(mode, convertIdx, handicapPiece);
    const fenBefore = chess.fen();
    let mv;
    try {
      mv = chess.move({ from, to, promotion: promotion ?? 'q' });
    } catch { return false; }
    if (!mv) return false;

    const newFen = chess.fen();
    const uci = from + to + (mv.promotion ?? '');
    const plyNum = moveHistoryRef.current.length + 1;

    const newRecord: MoveRecord = {
      san: mv.san,
      fenBefore,
      fenAfter: newFen,
      side: activeColor,
      uci,
    };
    moveHistoryRef.current = [...moveHistoryRef.current, newRecord];
    setMoveHistory(h => [...h, newRecord]);

    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setHintArrow(null);
    isProcessingRef.current = true;
    setIsProcessing(true);
    setFen(newFen);
    setTurn(chess.turn() as PlayerColor);

    if (chess.isGameOver()) {
      isProcessingRef.current = false;
      setIsProcessing(false);
      handleGameOver(startFen, false, moveHistoryRef.current, activeColor, mode, level);
      return true;
    }

    if (showBadges || showEvalBar) {
      if (showEvalBar) setIsEvalAnalyzing(true);
      void evaluateMyMove(fenBefore, newFen, mv.san, uci, plyNum, activeColor);
    }

    requestStockfishMove(newFen, activeColor, startFen, mode, level);
    return true;
  }, [sfReady, gamePhase, turn, activeColor, viewIdx, getStartFen, mode, convertIdx, handicapPiece, hintTimerRef, handleGameOver, level, showBadges, showEvalBar, evaluateMyMove, requestStockfishMove]);

  // ── Bot moves first ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!sfReady || hasStartedRef.current || gamePhase !== 'playing') return;
    hasStartedRef.current = true;
    if (turn !== activeColor) {
      const startFen = getStartFen(mode, convertIdx, handicapPiece);
      isProcessingRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsProcessing(true);
      requestStockfishMove(chessRef.current.fen(), activeColor, startFen, mode, level);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sfReady, activeColor, gamePhase]);

  // ── Undo ──────────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (isProcessingRef.current || gamePhase !== 'playing') return;
    const history = moveHistoryRef.current;
    const chess = chessRef.current;
    let newHistory = [...history];
    // undo stockfish's last move
    if (newHistory.length > 0 && newHistory[newHistory.length - 1].side !== activeColor) {
      chess.undo();
      newHistory = newHistory.slice(0, -1);
    }
    // undo my last move
    if (newHistory.length > 0 && newHistory[newHistory.length - 1].side === activeColor) {
      chess.undo();
      newHistory = newHistory.slice(0, -1);
    }
    moveHistoryRef.current = newHistory;
    setMoveHistory(newHistory);
    setFen(chess.fen());
    setTurn(chess.turn() as PlayerColor);
    setCoach(null);
    setHintArrow(null);
  }, [gamePhase, activeColor]);

  // ── Hint ──────────────────────────────────────────────────────────────────

  const handleHint = useCallback(() => {
    if (gamePhase !== 'playing' || isProcessingRef.current || !sfReady) return;
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    getBestMove(chessRef.current.fen(), 16, (uciMove) => {
      setHintArrow(uciMove);
      hintTimerRef.current = setTimeout(() => setHintArrow(null), 3000);
    });
  }, [gamePhase, sfReady, getBestMove]);

  // ── Surrender ─────────────────────────────────────────────────────────────

  const handleSurrender = useCallback(() => {
    if (!surrenderConfirm) { setSurrenderConfirm(true); return; }
    setSurrenderConfirm(false);
    const startFen = getStartFen(mode, convertIdx, handicapPiece);
    handleGameOver(startFen, true, moveHistoryRef.current, activeColor, mode, level);
  }, [surrenderConfirm, getStartFen, mode, convertIdx, handicapPiece, handleGameOver, activeColor, level]);

  // ── Move navigation ───────────────────────────────────────────────────────

  const totalMoves = moveHistory.length;
  const navFirst = useCallback(() => setViewIdx(0), []);
  const navPrev  = useCallback(() => setViewIdx(i => Math.max(0, (i === -1 ? totalMoves - 1 : i) - 1)), [totalMoves]);
  const navNext  = useCallback(() => {
    setViewIdx(i => {
      const cur = i === -1 ? totalMoves : i;
      return cur >= totalMoves - 1 ? -1 : cur + 1;
    });
  }, [totalMoves]);
  const navLast  = useCallback(() => setViewIdx(-1), []);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'h' || e.key === 'H') handleHint();
      if (e.key === 'z' || e.key === 'Z') handleUndo();
      if (e.key === 'n' || e.key === 'N') startNewGame();
      if (e.key === 'r' || e.key === 'R' && gamePhase === 'review') startNewGame({ revenge: true });
      if (e.key === 'ArrowLeft')  { e.preventDefault(); navPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); navNext(); }
      if (e.key === 'Home')       { e.preventDefault(); navFirst(); }
      if (e.key === 'End')        { e.preventDefault(); navLast(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleHint, handleUndo, startNewGame, gamePhase, navPrev, navNext, navFirst, navLast]);

  // ── Computed ──────────────────────────────────────────────────────────────

  const isPlayerTurn = gamePhase === 'playing' && !isProcessing && turn === activeColor && viewIdx === -1;

  // FEN to display
  const displayFen = viewIdx === -1 ? fen : (moveHistory[viewIdx]?.fenAfter ?? fen);

  // Last move highlight
  const lastMoveHighlight: { from: Square; to: Square } | null = (() => {
    const idx = viewIdx === -1 ? moveHistory.length - 1 : viewIdx;
    const mv = moveHistory[idx];
    if (!mv) return null;
    return { from: mv.uci.slice(0, 2) as Square, to: mv.uci.slice(2, 4) as Square };
  })();

  // Arrows
  const arrows: BoardArrow[] = [];
  if (hintArrow && hintArrow.length >= 4 && gamePhase === 'playing') {
    arrows.push({ from: hintArrow.slice(0, 2) as Square, to: hintArrow.slice(2, 4) as Square, color: 'var(--accent)', style: 'dashed', role: 'best' });
  }
  // Mistake arrows: only when viewing the mistake position (not while navigating history)
  const shownMistake = gamePhase === 'review' && selectedMistake !== null && viewIdx === -1 ? keyMistakes[selectedMistake] ?? null : null;
  if (shownMistake) {
    arrows.push({ from: shownMistake.uci.slice(0, 2) as Square, to: shownMistake.uci.slice(2, 4) as Square, color: 'var(--c-bad)', role: 'played' });
    if (shownMistake.bestMoveUci.length >= 4) {
      arrows.push({ from: shownMistake.bestMoveUci.slice(0, 2) as Square, to: shownMistake.bestMoveUci.slice(2, 4) as Square, color: 'var(--accent)', style: 'dashed', role: 'best' });
    }
  }

  // Badges
  const badges: Partial<Record<Square, BadgeKind>> = {};
  if (showBadges) {
    if (gamePhase === 'playing') {
      const myLastMove = [...moveHistory].reverse().find(m => m.side === activeColor);
      if (myLastMove?.cls) badges[myLastMove.uci.slice(2, 4) as Square] = myLastMove.cls as BadgeKind;
    } else if (gamePhase === 'review' && viewIdx !== -1) {
      // Show badge for the move being viewed in history
      const mv = moveHistory[viewIdx];
      if (mv?.cls && mv.side === activeColor) badges[mv.uci.slice(2, 4) as Square] = mv.cls as BadgeKind;
    }
  }

  // Captured pieces
  const myCaptures = capturedPieces(fen, activeColor);
  const botCaptures = capturedPieces(fen, activeColor === 'w' ? 'b' : 'w');

  // Result info (set as state when game ends — no ref access during render)

  // Eval bar: in review mode, derive from move history to update on navigation
  const evalCpForBar = (() => {
    if (gamePhase === 'review') {
      if (viewIdx !== -1) {
        const ev = moveHistory[viewIdx]?.evalAfter;
        if (ev !== undefined) return ev;
      } else {
        const prevIdx = shownMistake && shownMistake.moveIdx > 0 ? shownMistake.moveIdx - 1 : moveHistory.length - 1;
        const ev = moveHistory[prevIdx]?.evalAfter;
        if (ev !== undefined) return ev;
      }
    }
    return evalCpWhite;
  })();
  const evalPct = evalCpForBar !== null ? evalBarPct(evalCpForBar) : 50;

  // Level label
  const presetLabel = LEVEL_PRESETS[presetIdx]?.label ?? 'Клубный';

  // Move list rows
  const moveRows: Array<{ num: number; white?: MoveRecord; black?: MoveRecord }> = [];
  {
    let w: MoveRecord | undefined;
    let mn = 1;
    for (let i = 0; i < moveHistory.length; i++) {
      const mv = moveHistory[i];
      if (mv.side === 'w') {
        w = mv;
      } else {
        moveRows.push({ num: mn, white: w, black: mv });
        w = undefined;
        mn++;
      }
    }
    if (w) moveRows.push({ num: mn, white: w });
  }

  const currentMoveIdx = viewIdx === -1 ? moveHistory.length - 1 : viewIdx;

  // Accuracy
  const myMoves = moveHistory.filter(m => m.side === activeColor);
  const accuracyLosses: number[] = myMoves.map(m => {
    if (m.evalBefore === undefined || m.evalAfter === undefined) return 0;
    const wpB = m.side === 'w' ? winProb(m.evalBefore) : 1 - winProb(m.evalBefore);
    const wpA = m.side === 'w' ? winProb(m.evalAfter) : 1 - winProb(m.evalAfter);
    return Math.max(0, wpB - wpA);
  });
  const accuracy = computeAccuracy(accuracyLosses);

  const classCounts: Partial<Record<MoveClass, number>> = {};
  for (const m of myMoves) {
    if (m.cls) classCounts[m.cls] = (classCounts[m.cls] ?? 0) + 1;
  }

  // FEN for review board
  const reviewFen = gamePhase === 'review' && shownMistake && viewIdx === -1
    ? shownMistake.fenBefore
    : displayFen;

  // ── Session panel ─────────────────────────────────────────────────────────

  const sessionPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '20px 20px 14px', flexShrink: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ivory)', lineHeight: 1.2 }}>Партия</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>против Stockfish</div>
      </div>

      <div data-ui="session-stats" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
        margin: '0 20px',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {([
          { label: 'Победы', value: stats.wins, color: 'var(--accent)' },
          { label: 'Ничьи', value: stats.draws, color: 'var(--muted)' },
          { label: 'Поражения', value: stats.losses, color: 'var(--c-bad)' },
        ] as const).map(({ label, value, color }, i) => (
          <div key={label} style={{
            padding: '10px 0', textAlign: 'center',
            borderRight: i < 2 ? '1px solid var(--hairline)' : 'none',
          }}>
            <b style={{ display: 'block', fontSize: 20, fontWeight: 700, color: color as string, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{value}</b>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Color selector */}
      <div style={{ margin: '14px 20px 0', flexShrink: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Твой цвет</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['w', '♔', 'Белые'], ['b', '♚', 'Чёрные'], ['any', '⇄', 'Любой']] as const).map(([c, icon, lbl]) => (
            <button key={c} onClick={() => { setPendingColor(c); updateUrl(c, level, mode); }}
              style={{
                flex: 1, height: 36, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                background: pendingColor === c ? 'var(--accent)' : 'transparent',
                color: pendingColor === c ? '#fff' : 'var(--ivory)',
                border: `1px solid ${pendingColor === c ? 'var(--accent)' : 'var(--hairline)'}`,
                borderRadius: 'var(--radius-btn)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <span style={{ fontSize: 15 }}>{icon}</span>
              <span>{lbl}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Skill level */}
      <div style={{ margin: '14px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Сила Stockfish</span>
          <span style={{ fontSize: 13, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>{presetLabel} · {level}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {LEVEL_PRESETS.map((p, i) => (
            <button key={i} onClick={() => { setPresetIdx(i); setLevel(p.skill); updateUrl(pendingColor, p.skill, mode); }}
              style={{
                flex: 1, height: 32, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                fontWeight: presetIdx === i ? 700 : 400,
                color: presetIdx === i ? '#fff' : 'var(--muted)',
                background: presetIdx === i ? 'var(--accent)' : 'transparent',
                border: `1px solid ${presetIdx === i ? 'var(--accent)' : 'var(--hairline)'}`,
                borderRadius: 'var(--radius-btn)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px',
              }}
            >{p.skill}</button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          <span>слабее</span><span>сильнее</span>
        </div>
      </div>

      {/* Mode list */}
      <div data-ui="session-list" style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 0', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div onClick={() => { setMode('free'); updateUrl(pendingColor, level, 'free'); }}
          style={{ padding: '10px 12px', cursor: 'pointer', background: mode === 'free' ? 'var(--surface-2)' : 'transparent', border: `1px solid ${mode === 'free' ? 'var(--hairline)' : 'transparent'}`, borderRadius: 'var(--radius-card)' }}
        >
          <div style={{ fontSize: 14, fontWeight: mode === 'free' ? 600 : 400, color: 'var(--ivory)' }}>Обычная партия</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{rawFen ? 'с позиции из ссылки' : 'с начала'}</div>
        </div>

        <div onClick={() => { setMode('convert'); updateUrl(pendingColor, level, 'convert'); }}
          style={{ padding: '10px 12px', cursor: 'pointer', background: mode === 'convert' ? 'var(--surface-2)' : 'transparent', border: `1px solid ${mode === 'convert' ? 'var(--hairline)' : 'transparent'}`, borderRadius: 'var(--radius-card)' }}
        >
          <div style={{ fontSize: 14, fontWeight: mode === 'convert' ? 600 : 400, color: 'var(--ivory)' }}>Реализация перевеса</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            {CONVERT_POSITIONS.length} позиций
            {convertStats !== null && convertStats.total > 0 && ` · выиграно ${convertStats.wins} из ${convertStats.total}`}
          </div>
        </div>

        <div>
          <div onClick={() => { setMode('handicap'); updateUrl(pendingColor, level, 'handicap'); }}
            style={{ padding: '10px 12px', cursor: 'pointer', background: mode === 'handicap' ? 'var(--surface-2)' : 'transparent', border: `1px solid ${mode === 'handicap' ? 'var(--hairline)' : 'transparent'}`, borderRadius: 'var(--radius-card)' }}
          >
            <div style={{ fontSize: 14, fontWeight: mode === 'handicap' ? 600 : 400, color: 'var(--ivory)' }}>С форой</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Stockfish без фигуры</div>
          </div>
          {mode === 'handicap' && (
            <div style={{ display: 'flex', gap: 6, padding: '6px 12px 10px' }}>
              {(['queen', 'rook', 'knight'] as HandicapPiece[]).map(p => {
                const labels: Record<HandicapPiece, string> = { queen: 'Без ферзя', rook: 'Без ладьи', knight: 'Без коня' };
                return (
                  <button key={p} onClick={() => setHandicapPiece(p)}
                    style={{
                      flex: 1, height: 32, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      background: handicapPiece === p ? 'var(--accent)' : 'transparent',
                      color: handicapPiece === p ? '#fff' : 'var(--ivory)',
                      border: `1px solid ${handicapPiece === p ? 'var(--accent)' : 'var(--hairline)'}`,
                      borderRadius: 'var(--radius-btn)',
                    }}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer button */}
      <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
        {gamePhase === 'review' ? (
          <button onClick={() => startNewGame({ revenge: true })}
            style={{ width: '100%', height: 44, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            Реванш
            <kbd data-allow-small style={{ fontSize: 12, background: 'rgba(0,0,0,.2)', borderRadius: 3, padding: '1px 5px', fontStyle: 'normal' }}>R</kbd>
          </button>
        ) : (
          <button onClick={() => startNewGame()}
            style={{ width: '100%', height: 44, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', background: 'var(--surface-2)', color: 'var(--ivory)', border: '1px solid var(--hairline)', cursor: 'pointer', borderRadius: 'var(--radius-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            Новая партия
            <kbd data-allow-small style={{ fontSize: 12, background: 'rgba(255,255,255,.08)', borderRadius: 3, padding: '1px 5px', fontStyle: 'normal', color: 'var(--muted)' }}>N</kbd>
          </button>
        )}
      </div>
    </div>
  );

  // ── Player strips ─────────────────────────────────────────────────────────

  const botColor = activeColor === 'w' ? 'b' : 'w';

  const topPlayer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{botColor === 'w' ? '♔' : '♚'}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>Stockfish</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· уровень {level} · {presetLabel.toLowerCase()}</span>
      </div>
      {botCaptures && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{botCaptures}</span>}
    </div>
  );

  const statusChip = (
    <div style={{
      height: 26, padding: '0 10px', borderRadius: 6, display: 'flex', alignItems: 'center',
      fontSize: 13, fontWeight: 600, flexShrink: 0,
      background: gamePhase === 'review'
        ? (resultInfo ? resultInfo.color + '20' : 'rgba(255,255,255,.06)')
        : isPlayerTurn ? 'rgba(129,182,76,.15)' : 'rgba(255,255,255,.06)',
      color: gamePhase === 'review'
        ? (resultInfo?.color ?? 'var(--muted)')
        : isPlayerTurn ? 'var(--accent)' : 'var(--muted)',
    }}>
      {gamePhase === 'review'
        ? (resultInfo?.title ?? 'Игра завершена')
        : isPlayerTurn ? 'Твой ход' : 'Stockfish думает…'}
    </div>
  );

  const bottomPlayer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 4, background: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff' }}>
          {playerName ? playerName[0].toUpperCase() : 'Я'}
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>{playerName || 'ты'}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {activeColor === 'w' ? 'белые' : 'чёрные'}</span>
        {myCaptures && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{myCaptures}</span>}
      </div>
      {statusChip}
    </div>
  );

  // ── Eval bar ──────────────────────────────────────────────────────────────

  const evalBar = (
    <div data-ui="eval-bar" style={{
      width: 24, height: '100%', borderRadius: 'var(--radius-card)', overflow: 'hidden',
      background: '#403D3A', position: 'relative',
      opacity: showEvalBar ? 1 : 0, transition: 'opacity 0.3s',
    }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: isEvalAnalyzing ? 'rgba(237,235,231,0.35)' : '#EDEBE7',
        height: `${evalPct}%`,
        transition: isEvalAnalyzing ? 'none' : 'height 0.5s ease, background 0.3s ease',
      }} />
    </div>
  );

  // ── Board ─────────────────────────────────────────────────────────────────

  const boardContent = (
    <Board
      fen={reviewFen}
      orientation={activeColor === 'w' ? 'white' : 'black'}
      size={S}
      interactive={isPlayerTurn}
      onMove={isPlayerTurn ? handleMove : undefined}
      lastMove={lastMoveHighlight}
      badges={badges}
      arrows={arrows}
    />
  );

  // ── Right panel ───────────────────────────────────────────────────────────

  const panelTitle = gamePhase === 'review'
    ? (resultInfo?.title ?? 'Игра завершена')
    : isPlayerTurn ? 'Твой ход' : 'Stockfish думает…';

  const panelTitleColor = gamePhase === 'review' ? (resultInfo?.color ?? 'var(--ivory)') : 'var(--ivory)';
  const moveCount = Math.ceil(moveHistory.length / 2);

  const taskPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div data-ui="panel-header" style={{ padding: '20px 24px 14px', flexShrink: 0, borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <span>Играть · {mode === 'free' ? 'обычная' : mode === 'convert' ? 'реализация' : 'с форой'}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>ход {moveCount}</span>
        </div>
        <div data-ui="panel-title" style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: panelTitleColor, lineHeight: 1.2 }}>
          {panelTitle}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={chipStyle}>{activeColor === 'w' ? '♙ Белые' : '♟ Чёрные'}</span>
          <span style={chipStyle}>Уровень {level} · {presetLabel.toLowerCase()}</span>
          {gamePhase === 'review' && resultInfo && <span style={{ ...chipStyle, color: resultInfo.color }}>{resultInfo.reason}</span>}
          {showEvalBar && (gamePhase === 'review' && resultInfo
            ? <span style={chipStyle}>
                {resultInfo.title === 'Ничья' ? '½–½' : resultInfo.title === 'Победа!' ? (activeColor === 'w' ? '1–0' : '0–1') : (activeColor === 'w' ? '0–1' : '1–0')}
              </span>
            : evalCpWhite !== null && <span style={chipStyle}>{formatEval(evalCpWhite)}</span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Coach / Review */}
        {gamePhase === 'playing' ? (
          <div data-ui="play-coach" style={{ margin: '16px 24px 0', padding: '14px 16px', borderRadius: 'var(--radius-card)', flexShrink: 0, ...coachCardStyle(coach?.cls ?? null) }}>
            {coach ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ClassIcon cls={coach.cls as BadgeKind} size={28} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: CLASS_COLOR[coach.cls] }}>
                    {coach.moveNum}. {coach.san} — {CLASS_LABEL[coach.cls]}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {explainMove({
                    cls: coach.cls,
                    playedSan: coach.san,
                    bestSan: coach.bestMoveSan || undefined,
                    evalBefore: coach.evalBefore,
                    evalAfter: coach.evalAfter,
                    color: coach.color,
                  })}
                  <span style={{ marginLeft: 8, color: 'var(--faint)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatEval(coach.evalBefore)} → {formatEval(coach.evalAfter)}
                  </span>
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>Сделай ход — тренер оценит его</span>
            )}
          </div>
        ) : (
          <div data-ui="play-review" style={{ margin: '16px 24px 0', flexShrink: 0 }}>
            {reviewing ? (
              <div style={{ padding: '16px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)', fontSize: 14, color: 'var(--muted)' }}>
                Разбираю партию…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {reviewAnalysisDone && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(accuracy)}%
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--muted)' }}>точность</span>
                  </div>
                )}
                {reviewAnalysisDone && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'] as MoveClass[]).map(cls => {
                      const count = classCounts[cls] ?? 0;
                      if (count === 0) return null;
                      return (
                        <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)' }}>
                          <ClassIcon cls={cls as BadgeKind} size={18} />
                          <span style={{ fontSize: 14, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{CLASS_LABEL[cls]}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {keyMistakes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Главные ошибки</div>
                    {keyMistakes.map((km, idx) => (
                      <div key={idx} onClick={() => { setSelectedMistake(idx); setViewIdx(-1); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                          border: `1px solid ${selectedMistake === idx ? CLASS_COLOR[km.cls] + '60' : 'var(--hairline)'}`,
                          borderRadius: 'var(--radius-card)',
                          background: selectedMistake === idx ? CLASS_COLOR[km.cls] + '10' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <ClassIcon cls={km.cls as BadgeKind} size={20} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 14, color: 'var(--ivory)', fontWeight: 600 }}>{km.moveNum}. {km.san}</span>
                          {km.bestMoveSan && <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 6 }}>· лучше {km.bestMoveSan}</span>}
                        </div>
                        <span style={{ fontSize: 14, color: 'var(--c-bad)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {km.dropLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Move list */}
        <div data-ui="play-moves" style={{ flex: 1, overflowY: 'auto', padding: '12px 24px', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {moveHistory.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexShrink: 0 }}>
              {([['‹‹', navFirst], ['‹', navPrev], ['›', navNext], ['››', navLast]] as const).map(([lbl, fn]) => (
                <button key={lbl} onClick={fn}
                  style={{ width: 32, height: 28, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)' }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
          {moveRows.map((row, ri) => (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr', gap: 2, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right', paddingRight: 4, fontVariantNumeric: 'tabular-nums' }}>
                {row.num}.
              </span>
              {([row.white, row.black] as (MoveRecord | undefined)[]).map((mv, si) => {
                if (!mv) return <div key={si} />;
                const mvIdx = moveHistory.indexOf(mv);
                const isActive = mvIdx === currentMoveIdx;
                return (
                  <div key={si} onClick={() => setViewIdx(mvIdx)}
                    style={{
                      padding: '3px 6px', fontSize: 14, cursor: 'pointer',
                      fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
                      background: isActive ? 'var(--accent)' : 'transparent',
                      color: isActive ? '#fff' : 'var(--ivory)',
                      borderRadius: 'var(--radius-btn)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {mv.san}
                    {showBadges && mv.cls && <ClassIcon cls={mv.cls as BadgeKind} size={16} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Toggles */}
        <div style={{ padding: '10px 24px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => { const v = !showEvalBar; setShowEvalBar(v); saveSettings(v, showBadges); }}
            style={{ height: 32, padding: '0 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: showEvalBar ? 'rgba(129,182,76,.12)' : 'transparent', color: showEvalBar ? 'var(--accent)' : 'var(--muted)', border: `1px solid ${showEvalBar ? 'rgba(129,182,76,.4)' : 'var(--hairline)'}`, borderRadius: 'var(--radius-btn)' }}
          >
            Полоса оценки
          </button>
          <button onClick={() => { const v = !showBadges; setShowBadges(v); saveSettings(showEvalBar, v); }}
            style={{ height: 32, padding: '0 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: showBadges ? 'rgba(129,182,76,.12)' : 'transparent', color: showBadges ? 'var(--accent)' : 'var(--muted)', border: `1px solid ${showBadges ? 'rgba(129,182,76,.4)' : 'var(--hairline)'}`, borderRadius: 'var(--radius-btn)' }}
          >
            Значки ходов
          </button>
        </div>
      </div>

      {/* Panel actions */}
      <div data-ui="panel-actions" style={{ padding: '16px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
        {gamePhase === 'playing' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleHint}
                style={{ flex: 1, height: 40, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', background: hintArrow ? 'rgba(129,182,76,.12)' : 'transparent', color: hintArrow ? 'var(--accent)' : 'var(--ivory)', border: `1px solid ${hintArrow ? 'rgba(129,182,76,.4)' : 'var(--hairline)'}`, borderRadius: 'var(--radius-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                Подсказка
                <kbd data-allow-small style={{ fontSize: 12, background: 'rgba(255,255,255,.08)', borderRadius: 3, padding: '1px 5px', fontStyle: 'normal', color: 'var(--muted)' }}>H</kbd>
              </button>
              <button onClick={handleUndo}
                style={{ flex: 1, height: 40, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: 'var(--ivory)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                Отменить ход
                <kbd data-allow-small style={{ fontSize: 12, background: 'rgba(255,255,255,.08)', borderRadius: 3, padding: '1px 5px', fontStyle: 'normal', color: 'var(--muted)' }}>Z</kbd>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSurrender}
                style={{ flex: 1, height: 40, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', background: surrenderConfirm ? 'rgba(224,87,74,.12)' : 'transparent', color: surrenderConfirm ? 'var(--c-bad)' : 'var(--muted)', border: `1px solid ${surrenderConfirm ? 'rgba(224,87,74,.4)' : 'var(--hairline)'}`, borderRadius: 'var(--radius-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {surrenderConfirm ? 'Подтвердить?' : '⚑ Сдаться'}
              </button>
              <button onClick={() => startNewGame()}
                style={{ flex: 1, height: 40, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: 'var(--ivory)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                Новая партия
                <kbd data-allow-small style={{ fontSize: 12, background: 'rgba(255,255,255,.08)', borderRadius: 3, padding: '1px 5px', fontStyle: 'normal', color: 'var(--muted)' }}>N</kbd>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => startNewGame({ revenge: true })}
              style={{ height: 44, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-btn)' }}
            >
              Новая партия
            </button>
            {shownMistake && (
              <button
                onClick={() => {
                  const targetFen = shownMistake.fenBefore;
                  const t = new Chess(targetFen).turn();
                  router.push(`/play?fen=${encodeURIComponent(targetFen)}&color=${t}&level=${level}&mode=free`);
                }}
                style={{ height: 40, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: 'var(--ivory)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)' }}
              >
                Играть с этого хода
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <TrainerLayout
      session={sessionPanel}
      topBar={topPlayer}
      evalBar={evalBar}
      board={boardContent}
      bottomBar={bottomPlayer}
      panel={taskPanel}
    />
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export default function PlayPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - var(--topbar-h))', color: 'var(--muted)', fontSize: 14 }}>
        Загрузка…
      </div>
    }>
      <PlayContent />
    </Suspense>
  );
}
