'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { EvalBar } from '@/components/trainer/EvalBar';
import { Board } from '@/components/board/Board';
import type { BoardArrow } from '@/components/board/Board';
import { GuessSidebar } from './GuessSidebar';
import { GuessPanel } from './GuessPanel';
import {
  parseGame, prepareItems, selectMoments,
  scoreGuess, userCp as computeUserCp, resultArrows,
  defaultSide, surname, sanNo, hintText,
  type AnalysisEntry,
  type Verdict, type MomentKind,
} from '@/lib/masters';
import { supabase } from '@/lib/supabase';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { useStockfish } from '@/hooks/useStockfish';
import type { MultiPVLine } from '@/hooks/useStockfish';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GameData {
  id: string;
  white: string;
  black: string;
  event: string;
  year: number | null;
  result: string;
  pgn: string;
  analysis?: AnalysisEntry[] | null;
  analysis_version?: number | null;
}

interface Answer {
  ply: number;
  pts: 0 | 1 | 2;
  san: string;
  kind: MomentKind;
  userUci: string;
  masterUci: string;
}

interface ResultData {
  item: ReturnType<typeof prepareItems>[number];
  userUci: string;
  userSan: string;
  verdict: Verdict;
  pts: 0 | 1 | 2;
  userCpVal: number | null;
}

type Phase = 'overview' | 'watch' | 'ask' | 'result' | 'done';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GuessPageProps {
  gameData: GameData;
  libraryNames: string[];
  history: { side: 'white' | 'black'; score: number; mode: string }[];
  isDemo: boolean;
  demoUserEvals?: Record<string, number>;
  analysisMissing?: boolean; // DB columns don't exist yet
  panelDemoAttr?: string;
}

function getStoredSettings() {
  if (typeof window === 'undefined') return { mode: 'key' as const, side: null as null, skip: 10 };
  try {
    const v = localStorage.getItem('masters-guess-settings');
    if (!v) return { mode: 'key' as const, side: null as null, skip: 10 };
    const p = JSON.parse(v);
    return { mode: p.mode ?? 'key', side: p.side ?? null, skip: p.skip ?? 10 };
  } catch { return { mode: 'key' as const, side: null as null, skip: 10 }; }
}

function saveSettings(s: { mode: string; side: string | null; skip: number }) {
  try { localStorage.setItem('masters-guess-settings', JSON.stringify(s)); } catch { /**/ }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GuessPage({
  gameData, libraryNames, history, isDemo, demoUserEvals = {},
  analysisMissing = false, panelDemoAttr,
}: GuessPageProps) {
  const { S, showLeft } = useTrainerGeometry();
  const { getMultiPV, getEval, isReady: engineReady } = useStockfish();

  // ── Settings — initialized from localStorage once on mount ──
  const [mode, setMode] = useState<'key' | 'sac' | 'all'>(() => {
    const s = getStoredSettings();
    return (s.mode as 'key' | 'sac' | 'all') || 'key';
  });
  const [side, setSide] = useState<'white' | 'black'>(() => {
    const s = getStoredSettings();
    return s.side ? (s.side as 'white' | 'black') : defaultSide(gameData, libraryNames);
  });
  const [skip, setSkip] = useState(() => {
    const s = getStoredSettings();
    return s.skip ?? 10;
  });

  // ── Game data ──
  const moves = useMemo(() => parseGame(gameData.pgn), [gameData.pgn]);
  const [analysis, setAnalysis] = useState<AnalysisEntry[] | null>(gameData.analysis ?? null);

  // ── Analysis progress ──
  const [analyzing, setAnalyzing] = useState<{ done: number; total: number } | null>(null);
  const stopAnalysisRef = useRef(false);

  // ── Prepared items and moments ──
  const items = useMemo(() => analysis ? prepareItems(moves, analysis) : [], [moves, analysis]);
  const moments = useMemo(() => items.length > 0 ? selectMoments(items, { mode, side, skip }) : [], [items, mode, side, skip]);

  // ── Game phase state ──
  const [phase, setPhase] = useState<Phase>('overview');
  const [displayPly, setDisplayPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [watchPaused, setWatchPaused] = useState(false);
  const [currentMomentIdx, setCurrentMomentIdx] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [hintShown, setHintShown] = useState<string | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [evalHidden, setEvalHidden] = useState(false);
  const lineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lineDisplayPly, setLineDisplayPly] = useState<number | null>(null);

  // Phase ref for closures
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // ── Eval from analysis ──
  const getEvalCpForPly = useCallback((ply: number) => {
    if (!analysis) return null;
    const entry = analysis[ply]; // analysis[ply] has ply+1
    if (!entry) return null;
    const cp = entry.top[0]?.cp ?? null;
    if (cp == null) return null;
    const color = moves[ply]?.color ?? 'w';
    return color === 'w' ? cp : -cp;
  }, [analysis, moves]);

  // ── Background analysis of full game ──
  const startAnalysis = useCallback(async () => {
    if (!engineReady || isDemo) return;
    stopAnalysisRef.current = false;
    setAnalyzing({ done: 0, total: moves.length });

    const hasNewCols = !analysisMissing;
    const result: AnalysisEntry[] = [];

    for (let i = 0; i < moves.length; i++) {
      if (stopAnalysisRef.current) break;
      const mv = moves[i];

      const lines = await new Promise<MultiPVLine[]>(res => getMultiPV(mv.fen, 14, 3, res));
      const top3: AnalysisEntry['top'] = lines.map(l => ({
        uci: l.move,
        cp: l.mate != null ? (l.mate > 0 ? 9900 : -9900) : (l.cp ?? 0),
        pv: [],
        san: '',
        pvSan: [],
      }));

      // Determine master_cp
      const masterUci = mv.uci.slice(0, 4);
      const inTop = top3.find(t => t.uci.slice(0, 4) === masterUci);
      let master_cp: number;
      if (inTop) {
        master_cp = inTop.cp;
      } else {
        const evalAfter = await new Promise<{ cp?: number; mate?: number }>(res => getEval(mv.fenAfter, 14, r => res(r)));
        const rawCp = evalAfter.mate != null ? (evalAfter.mate > 0 ? 9900 : -9900) : (evalAfter.cp ?? 0);
        master_cp = -rawCp; // from opponent's perspective → flip
      }

      result.push({ ply: mv.ply, uci: mv.uci, master_cp, top: top3 });
      setAnalyzing({ done: i + 1, total: moves.length });
    }

    setAnalysis(result);
    setAnalyzing(null);

    // Save to DB
    if (!stopAnalysisRef.current && hasNewCols) {
      try {
        await supabase.from('master_games').update({
          analysis: result, analysis_version: 2, analysis_at: new Date().toISOString(),
        }).eq('id', gameData.id);
      } catch { /**/ }
    }
  }, [engineReady, isDemo, moves, getMultiPV, getEval, gameData.id, analysisMissing]);

  // Auto-start analysis if needed
  useEffect(() => {
    if (isDemo) return;
    if (analysis !== null) return; // already have analysis
    if (!engineReady) return;
    const needsAnalysis = !gameData.analysis_version || gameData.analysis_version < 2;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (needsAnalysis) startAnalysis();
  }, [engineReady, isDemo, analysis, gameData.analysis_version, startAnalysis]);

  // ── Watch auto-advance ──
  useEffect(() => {
    if (phase !== 'watch' || watchPaused) return;
    if (moves.length === 0) return;

    if (displayPly >= moves.length) {
      // Game over
      finishGame();
      return;
    }

    const nextMove = moves[displayPly];
    const myColor = side === 'white' ? 'w' : 'b';
    const isMyMove = nextMove.color === myColor;
    const nextPly = displayPly + 1;
    const isMoment = isMyMove && moments.some(m => m.ply === nextPly);

    if (isMoment) {
      const extraDelay = displayPly > 0 && moves[displayPly - 1]?.comment ? 2000 : 0;
      const t = setTimeout(() => {
        if (phaseRef.current !== 'watch') return;
        const idx = moments.findIndex(m => m.ply === nextPly);
        setCurrentMomentIdx(idx);
        setEvalHidden(true);
        setHintShown(null);
        setHintUsed(false);
        setPhase('ask');
      }, extraDelay + 300);
      return () => clearTimeout(t);
    }

    const commentDelay = displayPly > 0 && moves[displayPly - 1]?.comment ? 2000 : 0;
    const t = setTimeout(() => {
      if (phaseRef.current !== 'watch') return;
      setDisplayPly(p => p + 1);
      setEvalCp(getEvalCpForPly(displayPly));
    }, 800 + commentDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayPly, phase, watchPaused, moves, moments, side]);

  // Update eval when display ply changes in overview/done
  useEffect(() => {
    if (phase === 'overview' || phase === 'done') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEvalCp(getEvalCpForPly(displayPly));
    }
  }, [displayPly, phase, getEvalCpForPly]);

  // ── Game controls ──
  function startGame() {
    if (moments.length === 0 && !analyzing) return;
    setAnswers([]);
    setResultData(null);
    setCurrentMomentIdx(null);
    setDisplayPly(0);
    setEvalCp(getEvalCpForPly(0));
    setEvalHidden(false);
    setWatchPaused(false);
    setPhase('watch');
    saveSettings({ mode, side, skip });
  }

  function stopGame() {
    if (lineTimerRef.current) { clearTimeout(lineTimerRef.current); lineTimerRef.current = null; }
    setPhase('overview');
    setDisplayPly(0);
    setEvalCp(getEvalCpForPly(0));
    setEvalHidden(false);
    setResultData(null);
    setCurrentMomentIdx(null);
    setAnswers([]);
    setWatchPaused(false);
  }

  function jumpToNextMoment() {
    // Find the next unanswered moment
    const answeredPlies = new Set(answers.map(a => a.ply));
    const nextMoment = moments.find(m => !answeredPlies.has(m.ply));
    if (!nextMoment) {
      finishGame();
      return;
    }
    const idx = moments.indexOf(nextMoment);
    setDisplayPly(nextMoment.ply - 1);
    setCurrentMomentIdx(idx);
    setEvalHidden(true);
    setHintShown(null);
    setHintUsed(false);
    setEvalCp(null);
    setPhase('ask');
  }

  function handleUserMove(from: Square, to: Square) {
    if (phase !== 'ask' || currentMomentIdx == null) return false;
    const moment = moments[currentMomentIdx];
    const fen = moment.fen;

    // Validate the move
    let moveSan = '';
    let uci = from + to;
    try {
      const ch = new Chess(fen);
      const piece = ch.get(from);
      const isPromo = piece?.type === 'p' && ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));
      if (isPromo) uci = from + to + 'q';
      const m = ch.move({ from, to, promotion: isPromo ? 'q' : undefined });
      if (!m) return false;
      moveSan = m.san;
    } catch { return false; }

    // Compute user cp
    const ucpFromAnalysis = computeUserCp(moment, uci, demoUserEvals);

    const { pts, verdict } = scoreGuess(moment, uci, ucpFromAnalysis, hintUsed);

    // For the master result, advance displayPly to show the move
    const newDisplayPly = verdict === 'master' ? moment.ply : displayPly;
    if (verdict === 'master') setDisplayPly(moment.ply);

    const newAnswer: Answer = {
      ply: moment.ply, pts, san: moment.san,
      kind: moment.kind ?? 'quiet', userUci: uci, masterUci: moment.uci,
    };

    // Update answers immediately so session list shows the move
    setAnswers(prev => [...prev, newAnswer]);

    setResultData({ item: moment, userUci: uci, userSan: moveSan, verdict, pts, userCpVal: ucpFromAnalysis });
    setEvalHidden(false);

    // For non-master: compute user eval async if not in demo and not from top-3
    if (!isDemo && ucpFromAnalysis == null && verdict !== 'master') {
      try {
        const ch2 = new Chess(fen);
        ch2.move({ from, to, promotion: 'q' });
        const fenAfterUser = ch2.fen();
        getEval(fenAfterUser, 16, r => {
          const rawCp = r.mate != null ? (r.mate > 0 ? 9900 : -9900) : (r.cp ?? 0);
          const userCpFromEngine = -rawCp; // flip from opponent's perspective
          setResultData(prev => prev ? { ...prev, userCpVal: userCpFromEngine } : prev);
        });
      } catch { /**/ }
    }

    setEvalCp(getEvalCpForPly(newDisplayPly));
    setPhase('result');
    return true;
  }

  function handleNext() {
    if (phase !== 'result') return;
    // Advance to after master's move
    if (currentMomentIdx == null) return;
    const moment = moments[currentMomentIdx];
    setDisplayPly(moment.ply);
    setEvalCp(getEvalCpForPly(moment.ply));

    // Find next moment
    const answeredPlies = new Set(answers.map(a => a.ply));
    const remaining = moments.filter(m => !answeredPlies.has(m.ply));

    if (remaining.length === 0) {
      finishGame();
      return;
    }

    setResultData(null);
    setEvalHidden(false);
    setWatchPaused(false);
    setPhase('watch');
  }

  function skipMoment() {
    if (phase !== 'ask' || currentMomentIdx == null) return;
    const moment = moments[currentMomentIdx];
    const newAnswer: Answer = {
      ply: moment.ply, pts: 0, san: moment.san,
      kind: moment.kind ?? 'quiet', userUci: '', masterUci: moment.uci,
    };
    setAnswers(prev => [...prev, newAnswer]);
    // Show result with master's move
    setResultData({
      item: moment, userUci: moment.uci, userSan: moment.san,
      verdict: 'master', pts: 0, userCpVal: moment.masterCp,
    });
    setDisplayPly(moment.ply);
    setEvalHidden(false);
    setEvalCp(getEvalCpForPly(moment.ply));
    setPhase('result');
  }

  async function finishGame() {
    const finalAnswers = answers;
    const totalPts = finalAnswers.reduce((s, a) => s + a.pts, 0);
    const maxPts = finalAnswers.length * 2;
    setPhase('done');

    if (!isDemo) {
      const logData: Record<string, unknown> = {
        game_id: gameData.id, side, score: totalPts, max_score: maxPts,
      };
      if (!analysisMissing) {
        logData.mode = mode;
        logData.skip = skip;
        logData.moments = finalAnswers.map(a => ({
          ply: a.ply, pts: a.pts, user: a.userUci, master: a.masterUci,
        }));
      }
      try { await supabase.from('guess_log').insert(logData); } catch { /**/ }
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const p = phaseRef.current;
      if (e.key === 'F' || e.key === 'f') { setFlipped(v => !v); return; }
      if (p === 'overview') {
        if (e.key === 'ArrowRight') setDisplayPly(x => Math.min(moves.length, x + 1));
        if (e.key === 'ArrowLeft') setDisplayPly(x => Math.max(0, x - 1));
        if (e.key === 'Home') setDisplayPly(0);
        if (e.key === 'End') setDisplayPly(moves.length);
        if (e.key === 'Enter') startGame();
      }
      if (p === 'watch') {
        if (e.key === ' ') { e.preventDefault(); setWatchPaused(v => !v); }
        if (e.key === 'n' || e.key === 'N') jumpToNextMoment();
        if (e.key === 'Escape') stopGame();
      }
      if (p === 'ask') {
        if (e.key === 'h' || e.key === 'H') handleHint();
        if (e.key === 'n' || e.key === 'N') skipMoment();
        if (e.key === 'Escape') stopGame();
      }
      if (p === 'result') {
        if (e.key === 'Enter') handleNext();
        if (e.key === 'Escape') stopGame();
      }
      if (p === 'done') {
        if (e.key === 'Enter') handleAgain();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, displayPly, moves.length, moments, answers, currentMomentIdx, hintUsed]);

  function handleHint() {
    if (phase !== 'ask' || currentMomentIdx == null) return;
    const moment = moments[currentMomentIdx];
    setHintShown(hintText(moment.kind ?? 'quiet'));
    setHintUsed(true);
  }

  function handleAgain() {
    setAnswers([]);
    setResultData(null);
    setCurrentMomentIdx(null);
    setDisplayPly(0);
    setEvalHidden(false);
    setWatchPaused(false);
    setPhase('watch');
  }

  function handleLinePlay() {
    if (!resultData) return;
    // Show engine variant: advance through top line moves
    const pvItem = resultData.item.top.find(t => t.uci.slice(0, 4) === resultData.item.uci.slice(0, 4)) ?? resultData.item.top[0];
    if (!pvItem?.pvSan?.length) return;
    const startPly = resultData.item.ply;
    setLineDisplayPly(startPly);

    // replay line using chess.js
    const chess = new Chess(resultData.item.fen);
    chess.move({ from: resultData.item.uci.slice(0, 2) as Square, to: resultData.item.uci.slice(2, 4) as Square, promotion: 'q' });
    const fens = [chess.fen()];
    for (const san of pvItem.pvSan.slice(1, 6)) {
      try { chess.move(san); fens.push(chess.fen()); } catch { break; }
    }

    let step = 0;
    const advance = () => {
      if (step < fens.length) {
        setLineDisplayPly(startPly + step);
        step++;
        lineTimerRef.current = setTimeout(advance, 900);
      } else {
        setLineDisplayPly(null);
      }
    };
    lineTimerRef.current = setTimeout(advance, 100);
  }

  // ── Board data ─────────────────────────────────────────────────────────────
  const myColor = side === 'white' ? 'w' : 'b';
  const orientation: 'white' | 'black' = flipped ? (side === 'white' ? 'black' : 'white') : side;

  const boardFen = useMemo(() => {
    if (lineDisplayPly != null && resultData) {
      // Show line variant position
      if (lineDisplayPly === resultData.item.ply) return resultData.item.fenAfter;
      // Try to advance from fenAfter
      const pvItem = resultData.item.top.find(t => t.uci.slice(0, 4) === resultData.item.uci.slice(0, 4)) ?? resultData.item.top[0];
      if (pvItem?.pvSan?.length) {
        const ch = new Chess(resultData.item.fenAfter);
        const steps = lineDisplayPly - resultData.item.ply;
        for (let i = 0; i < steps && i < pvItem.pvSan.length - 1; i++) {
          try { ch.move(pvItem.pvSan[i + 1]); } catch { break; }
        }
        return ch.fen();
      }
    }

    if (phase === 'result' && resultData) {
      if (resultData.verdict === 'master') return resultData.item.fenAfter;
      return resultData.item.fen;
    }
    if (phase === 'ask' && currentMomentIdx != null) {
      return moments[currentMomentIdx].fen;
    }
    if (displayPly === 0) return INITIAL_FEN;
    return moves[displayPly - 1]?.fenAfter ?? INITIAL_FEN;
  }, [phase, displayPly, moves, resultData, currentMomentIdx, moments, lineDisplayPly]);

  const boardArrows: BoardArrow[] = useMemo(() => {
    if (phase !== 'result' || !resultData || resultData.verdict === 'master') return [];
    const arrows = resultArrows(resultData.item, resultData.userUci, resultData.verdict);
    return arrows.map(a => ({
      from: a.from as Square, to: a.to as Square,
      color: a.color, role: a.role as BoardArrow['role'],
      label: a.label,
    }));
  }, [phase, resultData]);

  const boardBadges = useMemo(() => {
    if (phase === 'result' && resultData?.verdict === 'master') {
      const to = resultData.item.uci.slice(2, 4) as Square;
      return { [to]: 'found' as const };
    }
    return {};
  }, [phase, resultData]);

  const boardInteractive = phase === 'ask';
  const boardLastMove = useMemo(() => {
    if (phase === 'overview' || phase === 'done') {
      if (displayPly > 0) {
        const mv = moves[displayPly - 1];
        return { from: mv.uci.slice(0, 2) as Square, to: mv.uci.slice(2, 4) as Square };
      }
    }
    if (phase === 'result' && resultData?.verdict === 'master') {
      return { from: resultData.item.uci.slice(0, 2) as Square, to: resultData.item.uci.slice(2, 4) as Square };
    }
    return null;
  }, [phase, displayPly, moves, resultData]);

  // ── Player name strings ────────────────────────────────────────────────────
  const whiteSurname = surname(gameData.white);
  const blackSurname = surname(gameData.black);
  const whiteLabel = `${gameData.white}${side === 'white' ? ' · ты' : ''}`;
  const blackLabel = `${gameData.black}${side === 'black' ? ' · ты' : ''}`;

  // Location/year string
  const locationYear = [gameData.event, gameData.year].filter(Boolean).join(' · ');

  // After-current-move label
  const moveLabel = (() => {
    if (displayPly === 0) return 'начальная позиция';
    if (displayPly === moves.length) return `конец партии · ${sanNo(moves[moves.length - 1].ply, moves[moves.length - 1].san)} · ${gameData.result}`;
    const mv = moves[displayPly - 1];
    return `после ${sanNo(mv.ply, mv.san)} · ход ${mv.color === 'w' ? 'чёрных' : 'белых'}`;
  })();

  // ── Record ─────────────────────────────────────────────────────────────────
  const record = useMemo(() => {
    const relevant = history.filter(h => h.side === side && (!h.mode || h.mode === mode));
    if (!relevant.length) return null;
    return Math.max(...relevant.map(h => h.score));
  }, [history, side, mode]);

  // ── Eval bar cp (white's perspective) ─────────────────────────────────────
  const evalBarCp = evalHidden ? null : (evalCp ?? 0);

  // ── Board component ───────────────────────────────────────────────────────
  const board = (
    <Board
      fen={boardFen}
      orientation={orientation}
      size={S}
      interactive={boardInteractive}
      movableColor={boardInteractive ? myColor : undefined}
      onMove={({ from, to }) => handleUserMove(from, to)}
      lastMove={boardLastMove}
      arrows={boardArrows.length > 0 ? boardArrows : undefined}
      badges={Object.keys(boardBadges).length > 0 ? boardBadges : undefined}
    />
  );

  const evalBarEl = evalHidden ? (
    <div
      data-ui="eval-hidden"
      style={{
        width: 24, height: S, background: '#403D3A', borderRadius: 5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span style={{ color: '#888', fontSize: 10, transform: 'rotate(-90deg)', whiteSpace: 'nowrap' }}>?</span>
    </div>
  ) : (
    <div style={{ height: S }}>
      <EvalBar cp={evalBarCp ?? 0} />
    </div>
  );

  // ── Top/bottom bar labels ─────────────────────────────────────────────────
  const topLabel = orientation === 'white' ? blackLabel : whiteLabel;
  const bottomLabel = orientation === 'white' ? whiteLabel : blackLabel;
  const topBarEl = (
    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
      {orientation === 'white' ? gameData.black : gameData.white}
      <span style={{ marginLeft: 12 }}>{moveLabel}</span>
    </span>
  );
  const bottomBarEl = (
    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
      {orientation === 'white' ? gameData.white : gameData.black}
      {locationYear && <span style={{ marginLeft: 12 }}>{locationYear}</span>}
    </span>
  );
  void topLabel; void bottomLabel;

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const sidebar = (
    <GuessSidebar
      gameId={gameData.id}
      mode={mode}
      side={side}
      skip={skip}
      moments={moments}
      answers={answers.map(a => ({ ply: a.ply, pts: a.pts, san: a.san, kind: a.kind }))}
      record={record}
      phase={phase}
      currentPly={moments[currentMomentIdx ?? -1]?.ply ?? null}
      analyzing={analyzing}
      analysisMissing={analysisMissing}
      onModeChange={v => { setMode(v); saveSettings({ mode: v, side, skip }); }}
      onSideChange={v => { setSide(v); saveSettings({ mode, side: v, skip }); setFlipped(false); }}
      onSkipChange={v => { setSkip(v); saveSettings({ mode, side, skip: v }); }}
      whiteName={whiteSurname}
      blackName={blackSurname}
      onOtherGame={!isDemo ? undefined : undefined}
      onMomentClick={ply => {
        if (phase !== 'done') return;
        const ans = answers.find(a => a.ply === ply);
        if (!ans) return;
        setDisplayPly(ans.ply);
      }}
    />
  );

  // ── Panel ─────────────────────────────────────────────────────────────────
  const panel = (
    <GuessPanel
      phase={phase}
      game={gameData}
      moves={moves}
      moments={moments}
      currentMomentIdx={currentMomentIdx}
      answers={answers.map(a => ({ ply: a.ply, pts: a.pts, san: a.san, kind: a.kind }))}
      record={record}
      resultData={resultData}
      hintShown={hintShown}
      side={side}
      whiteSurname={whiteSurname}
      blackSurname={blackSurname}
      displayPly={displayPly}
      watchPaused={watchPaused}
      analyzing={analyzing}
      analysisMissing={analysisMissing}
      isDemo={isDemo}
      onStart={startGame}
      onNext={handleNext}
      onStop={stopGame}
      onPause={() => setWatchPaused(v => !v)}
      onJump={jumpToNextMoment}
      onSkipMoment={skipMoment}
      onHint={handleHint}
      onLinePlay={handleLinePlay}
      onAgain={handleAgain}
      onMoveClick={ply => {
        if (phase === 'overview' || phase === 'done') setDisplayPly(ply);
      }}
      onRecalcAnalysis={() => {
        setAnalysis(null);
        startAnalysis();
      }}
    />
  );

  return (
    <TrainerLayout
      session={showLeft ? sidebar : undefined}
      topBar={topBarEl}
      board={board}
      evalBar={evalBarEl}
      bottomBar={bottomBarEl}
      panel={panel}
      panelAttrs={panelDemoAttr ? { 'data-demo': panelDemoAttr } : undefined}
    />
  );
}
