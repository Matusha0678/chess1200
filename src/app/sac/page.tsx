'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Board } from '@/components/board/Board';
import type { BoardArrow, BadgeKind } from '@/components/board/Board';
import { DEMO_SAC } from '@/lib/demo-positions';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { SessionPanel } from '@/components/trainer/SessionPanel';
import { EvalBar } from '@/components/trainer/EvalBar';
import { FeedbackCard } from '@/components/ui/FeedbackCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MoveChip } from '@/components/ui/MoveChip';
import { Kbd } from '@/components/ui/Kbd';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { prepareSacPositions } from '@/lib/sac-prepare';
import type { PrepProgress as SacPrepProgress } from '@/lib/sac-prepare';
import { fenAfterSac, lineSan, lineOutcome as sacTextLineOutcome } from '@/lib/sac-text';
import { createBrowserEngine } from '@/lib/engine';
import type { Engine } from '@/lib/engine';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SacPosition {
  id: string;
  fen: string;
  move: string;
  san: string | null;
  kind: 'real' | 'fake';
  eval_before: number | null;   // centipawns for sac side S
  eval_after: number | null;
  eval_no_sac: number | null;
  best_no_sac: string | null;
  pv: string | null;
  defenses: Array<{ move: string; pv: string[]; cp: number | null; mate: number | null; outcome: string }> | null;
  accepted_pv: string | null;
  sac_type: string | null;
  piece: string | null;
  material_given: number | null;
  king_attack: boolean | null;
  mate_in: number | null;
  mate_forced: boolean | null;
  score: number | null;
  pattern: string | null;
  is_decoy: boolean | null;
  game_id: string | null;
  ply: number | null;
  version: number;
  source: string | null;
}

interface SacStats {
  total: number;
  correct: number;
  streak: number;
  missedReal: number;
  wrongFake: number;
  xp: number;
}

// ── Piece name helpers ────────────────────────────────────────────────────────

const PIECE_ACC: Record<string, string> = {
  p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля',
};

// Возвращает тип взятой фигуры на клетке to в позиции fen (или null).
function capturedPieceType(fen: string, sacUci: string): string | null {
  try {
    const ch = new Chess(fen);
    const to = sacUci.slice(2, 4) as Square;
    const piece = ch.get(to);
    return piece ? piece.type : null;
  } catch { return null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const r = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    return r?.san ?? uci;
  } catch { return uci; }
}

function fenMoveNumber(fen: string): number {
  const parts = fen.split(' ');
  return parseInt(parts[5] ?? '1', 10);
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} сек`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m} мин ${s} сек` : `${m} мин`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h} ч ${mm} мин` : `${h} ч`;
}

// ── Phrase builder (LOGIC.md 1.10) ───────────────────────────────────────────

function buildPhrase(pos: SacPosition, san: string, afterSacFen: string | null): string {
  const { kind, pattern, sac_type, mate_in, mate_forced, piece, is_decoy } = pos;

  if (kind === 'fake') {
    const defUci = (() => {
      if (pos.defenses && pos.defenses.length > 0) return pos.defenses[0].move;
      if (pos.pv) return pos.pv.split(' ')[0];
      return null;
    })();
    const defSan = defUci && afterSacFen
      ? uciToSan(afterSacFen, defUci)
      : (defUci ?? 'лучший ход');

    if (!is_decoy) {
      return `${san} — соперник берёт ${PIECE_ACC[piece ?? 'n'] ?? 'фигуру'} и спокойно защищается: ${defSan}.`;
    }
    return `${san} — соперник берёт ${PIECE_ACC[piece ?? 'n'] ?? 'фигуру'} и спокойно защищается: ${defSan}.`;
  }

  // kind === 'real'
  if (pattern === 'greek_gift') {
    return `${san} — греческая жертва: слон отдаётся, чтобы раскрыть короля.`;
  }
  if (sac_type === 'mate') {
    if (mate_forced && mate_in) {
      return `${san} — жертва ведёт к мату за ${mate_in} ходов.`;
    }
    if (mate_in) {
      const defUci = pos.defenses?.[0]?.move ?? pos.pv?.split(' ')[0] ?? null;
      const defSan = defUci && afterSacFen
        ? uciToSan(afterSacFen, defUci)
        : (defUci ?? 'лучший ход');
      return `${san} — если взять ${PIECE_ACC[piece ?? 'n'] ?? 'фигуру'}, мат за ${mate_in} ходов. Лучшая защита — ${defSan}.`;
    }
    return `${san} — жертва ведёт к матовой атаке.`;
  }
  if (pattern === 'exchange' || (piece === 'r' && (pos.material_given ?? 0) === 2)) {
    return `${san} — жертва качества: ладья за лёгкую фигуру ради атаки.`;
  }
  if (sac_type === 'combination') {
    return `${san} — комбинация: после взятия материал возвращается с прибылью.`;
  }
  // real
  if (pos.king_attack) {
    return `${san} — за ${PIECE_ACC[piece ?? 'n'] ?? 'фигуру'} ты получаешь атаку на короля.`;
  }
  return `${san} — за ${PIECE_ACC[piece ?? 'n'] ?? 'фигуру'} ты получаешь инициативу.`;
}

function buildGaveGot(
  pos: SacPosition,
  capturedType: string | null,
  acceptedPvArr: string[] | null,
): { gave: string; got: string; gotBad: boolean } {
  const { kind, sac_type, piece, king_attack } = pos;
  const pieceAcc = PIECE_ACC[piece ?? 'n'] ?? 'фигуру';

  // «Отдал»: если взятие — «{фигуру} за {взятую}», без скобок.
  let gave: string;
  if (capturedType) {
    const capturedAcc = PIECE_ACC[capturedType] ?? 'фигуру';
    gave = `${pieceAcc} за ${capturedAcc}`;
  } else {
    gave = pieceAcc;
  }

  let got = '';
  let gotBad = false;

  if (kind === 'fake') {
    got = 'ничего — соперник отбивается';
    gotBad = true;
  } else if (sac_type === 'mate') {
    got = pos.mate_forced ? 'мат' : 'мат (если взять)';
  } else if (sac_type === 'combination') {
    // По lineOutcome с accepted_pv, maxPlies = 8
    if (acceptedPvArr && acceptedPvArr.length > 0) {
      const outcome = sacTextLineOutcome(pos.fen, pos.move, acceptedPvArr, null, null, 8);
      if (outcome === 'выигрыш ферзя') got = 'ферзя';
      else if (outcome.startsWith('выигрыш материала')) got = outcome.replace('выигрыш ', '');
      else got = 'материал назад';
    } else {
      got = 'материал назад';
    }
  } else if (king_attack) {
    got = 'атаку на короля';
  } else {
    got = 'инициативу';
  }

  return { gave, got, gotBad };
}

function buildChipText(pos: SacPosition): string {
  const { kind, sac_type, mate_in, mate_forced } = pos;
  if (kind === 'fake') return 'Жертва не работает';
  if (sac_type === 'mate') {
    if (mate_forced) return `Жертва с матом (${mate_in ?? '?'} ходов)`;
    return 'Жертва с матом';
  }
  if (sac_type === 'combination') return 'Комбинация';
  return 'Настоящая жертва';
}



function cpToEvalStr(cp: number): string {
  if (cp >= 9000) return `M${100 - Math.round(cp / 100)}`;
  if (cp <= -9000) return `−M${100 - Math.round(-cp / 100)}`;
  const v = cp / 100;
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

function displayBestNoSac(fen: string, bns: string | null): string | null {
  if (!bns) return null;
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bns)) return uciToSan(fen, bns);
  return bns;
}

function detectCheckSquare(fen: string, uci: string): import('chess.js').Square | null {
  try {
    const ch = new Chess(fen);
    ch.move({ from: uci.slice(0, 2) as import('chess.js').Square, to: uci.slice(2, 4) as import('chess.js').Square, promotion: (uci[4] ?? 'q') as 'q' });
    if (!ch.inCheck()) return null;
    for (const row of ch.board()) {
      for (const cell of row) {
        if (cell?.type === 'k' && cell.color === ch.turn()) return cell.square as import('chess.js').Square;
      }
    }
  } catch { /* noop */ }
  return null;
}

function wp(cp: number): number {
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

// ── Main ──────────────────────────────────────────────────────────────────────

function SacPageInner() {
  const { S } = useTrainerGeometry();
  const { animationMs } = useBoardTheme();
  const searchParams = useSearchParams();
  const demoKey = searchParams.get('demo') as 'works' | 'fails' | null;
  const isDemo = demoKey === 'works' || demoKey === 'fails';

  const [positions, setPositions]     = useState<SacPosition[]>([]);
  const [loading, setLoading]         = useState(true);
  const [stats, setStats]             = useState<SacStats>({ total: 0, correct: 0, streak: 0, missedReal: 0, wrongFake: 0, xp: 0 });

  const [current, setCurrent]         = useState<SacPosition | null>(null);
  const [answered, setAnswered]       = useState<{ answer: 'sac' | 'calm'; ok: boolean } | null>(null);
  const [revealed, setRevealed]       = useState(false);

  type Preview = null | { kind: 'line'; idx: number } | { kind: 'nosac' };
  const [preview, setPreview] = useState<Preview>(null);

  type Step = { line: number; ply: number; playing: boolean } | null;
  const [step, setStep] = useState<Step>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // History: completed positions with their answers
  const [history, setHistory] = useState<Array<{ pos: SacPosition; answer: 'sac' | 'calm'; ok: boolean }>>([]);

  // Filter: 'tal' or 'all'
  const [prepFilter, setPrepFilter] = useState<'tal' | 'all'>('tal');

  // Prepare mode
  const [preparing, setPreparing]         = useState(false);
  const [prepProgress, setPrepProgress]   = useState<SacPrepProgress | null>(null);
  const [prepError, setPrepError]         = useState<string | null>(null);
  const [prepStartedAt, setPrepStartedAt] = useState<number>(0);
  const prepStopRef = useRef(false);
  const engineRef   = useRef<(Engine & { quit(): void; init(): Promise<void> }) | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  const [remaining, setRemaining]   = useState<number | null>(null);
  const [scanned, setScanned]       = useState<number | null>(null);
  const [masterCount, setMasterCount] = useState<number | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    void refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepFilter]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Step navigation
      if (step !== null && current && answered) {
        if (e.key === 'Escape') {
          e.preventDefault();
          stopPlay();
          setStep(null);
          setPreview(null);
          (document.activeElement as HTMLElement | null)?.blur();
          return;
        }
        const def = current.defenses?.[step.line];
        const pvArr = def ? (Array.isArray(def.pv) ? def.pv : (def.pv as string).split(' ')) : [];
        const maxPly = Math.min(pvArr.length, 4) - 1;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          stopPlay();
          if (step.ply < maxPly) setStep({ line: step.line, ply: step.ply + 1, playing: false });
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          stopPlay();
          if (step.ply === 0) {
            setStep(null);
            setPreview(null);
            (document.activeElement as HTMLElement | null)?.blur();
          } else {
            setStep({ line: step.line, ply: step.ply - 1, playing: false });
          }
          return;
        }
      }

      if ((e.key === '1' || e.key === 'j' || e.key === 'J') && !answered && current && !preparing) {
        e.preventDefault();
        void handleAnswer('sac');
      }
      if ((e.key === '2' || e.key === 'k' || e.key === 'K') && !answered && current && !preparing) {
        e.preventDefault();
        void handleAnswer('calm');
      }
      if ((e.key === ' ' || e.key === 'Enter') && answered && positions.length > 0) {
        e.preventDefault();
        pickRandom(positions);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, current, preparing, positions, step]);

  async function loadData() {
    if (isDemo && demoKey) {
      const d = DEMO_SAC[demoKey];
      const p: SacPosition = {
        ...d,
        kind: d.kind,
        eval_before: d.eval_before,
        eval_after: d.eval_after,
        eval_no_sac: d.eval_no_sac,
        best_no_sac: displayBestNoSac(d.fen, d.best_no_sac),
        pv: d.pv,
        defenses: d.defenses.map(def => ({ ...def, pv: Array.isArray(def.pv) ? [...def.pv] : (def.pv as unknown as string).split(' ') })),
        accepted_pv: d.accepted_pv,
      };
      setPositions([p]);
      setCurrent(p);
      setAnswered(null);
      setRevealed(false);
      setStep(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [posRes, logRes] = await Promise.all([
      supabase.from('sac_positions').select('*').eq('version', 2).order('score', { ascending: false }).limit(500),
      supabase.from('sac_log').select('answer,ok,played_at').order('played_at', { ascending: false }).limit(200),
    ]);
    const pos = (posRes.data ?? []) as SacPosition[];
    setPositions(pos);

    const logs = (logRes.data ?? []) as Array<{ answer: string; ok: boolean }>;
    let streak = 0;
    for (const l of logs) { if (!l.ok) break; streak++; }
    const missed = logs.filter(l => l.answer === 'calm' && !l.ok).length;
    const wrong  = logs.filter(l => l.answer === 'sac'  && !l.ok).length;
    const correct = logs.filter(l => l.ok).length;
    const xp = correct * 20;
    setStats({
      total: logs.length,
      correct,
      streak, missedReal: missed, wrongFake: wrong, xp,
    });

    if (pos.length > 0) pickRandom(pos);
    setLoading(false);
  }

  async function refreshCounts() {
    const baseQ1 = supabase
      .from('master_games')
      .select('id', { count: 'exact', head: true })
      .lt('sac_version', 2);
    const baseQ2 = supabase
      .from('master_games')
      .select('id', { count: 'exact', head: true })
      .gte('sac_version', 2);
    const baseQMaster = supabase
      .from('master_games')
      .select('id', { count: 'exact', head: true });

    if (prepFilter === 'tal') {
      const { count: remCount } = await baseQ1.or('white.ilike.%Tal%,black.ilike.%Tal%');
      const { count: scannedCount } = await baseQ2.or('white.ilike.%Tal%,black.ilike.%Tal%');
      const { count: mc } = await baseQMaster.or('white.ilike.%Tal%,black.ilike.%Tal%');
      setRemaining(remCount ?? 0);
      setScanned(scannedCount ?? 0);
      setMasterCount(mc ?? 0);
    } else {
      const { count: remCount } = await baseQ1;
      const { count: scannedCount } = await baseQ2;
      const { count: mc } = await baseQMaster;
      setRemaining(remCount ?? 0);
      setScanned(scannedCount ?? 0);
      setMasterCount(mc ?? 0);
    }
  }

  function stopPlay() {
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    playTimerRef.current = null;
  }

  function startPlay(line: number, pv: string[]) {
    stopPlay();
    const maxPly = Math.min(pv.length, 4) - 1;
    setStep({ line, ply: 0, playing: true });
    setPreview(null);
    function advance(curPly: number) {
      if (curPly >= maxPly) {
        setStep({ line, ply: curPly, playing: false });
        return;
      }
      playTimerRef.current = setTimeout(() => {
        const next = curPly + 1;
        setStep({ line, ply: next, playing: next < maxPly });
        advance(next);
      }, 900);
    }
    advance(0);
  }

  function pickRandom(pool: SacPosition[]) {
    if (!pool.length) return;
    stopPlay();
    const idx = Math.floor(Math.random() * pool.length);
    setCurrent(pool[idx]);
    setAnswered(null);
    setRevealed(false);
    setStep(null);
    setPreview(null);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
  }

  async function handleAnswer(answer: 'sac' | 'calm') {
    if (!current || answered) return;
    stopPlay();
    const ok = answer === 'sac' ? current.kind === 'real' : current.kind === 'fake';
    // Always play the sac move on the board
    setRevealed(false);
    setStep(null);
    setPreview(null);
    setAnswered({ answer, ok });

    // After animation completes, reveal overlays
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    const delay = (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      ? 0
      : animationMs + 50;
    revealTimerRef.current = setTimeout(() => setRevealed(true), delay);

    setHistory(h => [...h, { pos: current, answer, ok }]);
    setStats(s => ({
      ...s,
      total: s.total + 1,
      correct: ok ? s.correct + 1 : s.correct,
      streak:  ok ? s.streak  + 1 : 0,
      missedReal: (!ok && answer === 'calm') ? s.missedReal + 1 : s.missedReal,
      wrongFake:  (!ok && answer === 'sac')  ? s.wrongFake  + 1 : s.wrongFake,
      xp: ok ? s.xp + 20 : s.xp,
    }));

    if (!isDemo) {
      await supabase.from('sac_log').insert({ position_id: current.id, answer, ok });
    }
  }

  // ── Prepare ────────────────────────────────────────────────────────────────

  async function handlePrepare() {
    if (preparing) return;
    prepStopRef.current = false;
    abortRef.current = new AbortController();
    setPreparing(true);
    setPrepProgress({ gamesChecked: 0, gamesTotal: 0, found: 0, works: 0, fails: 0 });
    setPrepError(null);
    setPrepStartedAt(Date.now());

    try {
      if (!engineRef.current) {
        engineRef.current = await createBrowserEngine();
      }

      await prepareSacPositions(
        engineRef.current,
        prepFilter,
        (p) => {
          setPrepProgress(p);
          if (p.error) setPrepError(p.error);
        },
        abortRef.current.signal,
      );

      await refreshCounts();

      const { data: fresh } = await supabase
        .from('sac_positions')
        .select('*')
        .eq('version', 2)
        .order('score', { ascending: false })
        .limit(500);
      if (fresh) {
        setPositions(fresh as SacPosition[]);
        if (!current && fresh.length > 0) pickRandom(fresh as SacPosition[]);
      }
    } catch (e) {
      console.error('prepareSacPositions failed:', e);
    } finally {
      setPreparing(false);
    }
  }

  function stopPrepare() {
    prepStopRef.current = true;
    abortRef.current?.abort();
  }

  const startSolving = useCallback(() => {
    if (positions.length > 0) pickRandom(positions);
  }, [positions]);

  if (loading) return (
    <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
  );

  const sideToMove = current ? (current.fen.split(' ')[1] === 'w' ? 'white' : 'black') : 'white';
  const oppSide = sideToMove === 'white' ? 'black' : 'white';
  const correctPct = stats.total > 0 ? Math.round(100 * stats.correct / stats.total) : null;
  const sacSan = current ? (current.san ?? uciToSan(current.fen, current.move)) : '';
  const moveNum = current ? fenMoveNumber(current.fen) : 1;

  // ETA calc
  const prepEta: number | null = (() => {
    if (!prepProgress || !preparing || prepProgress.gamesChecked === 0) return null;
    const elapsed = (Date.now() - prepStartedAt) / 1000;
    const perGame = elapsed / prepProgress.gamesChecked;
    return Math.max(0, perGame * (prepProgress.gamesTotal - prepProgress.gamesChecked));
  })();

  // ── Computed values ─────────────────────────────────────────────────────────
  const afterSacFen = current ? fenAfterSac(current.fen, current.move) : null;

  // displayFen:
  //   - step active: position after sac + first (ply+1) moves from def.pv
  //   - nosac hover: pre-sac fen
  //   - answered: post-sac fen
  //   - question: pre-sac fen
  const displayFen = (() => {
    if (!current) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (answered && step !== null) {
      // Play sac then pv[0..ply]
      const def = current.defenses?.[step.line];
      const pvArr = def ? (Array.isArray(def.pv) ? def.pv : (def.pv as string).split(' ')) : [];
      const sliced = pvArr.slice(0, step.ply + 1);
      let curFen = afterSacFen ?? current.fen;
      for (const uci of sliced) {
        if (!uci || uci.length < 4) break;
        try {
          const ch = new Chess(curFen);
          ch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n' });
          curFen = ch.fen();
        } catch { break; }
      }
      return curFen;
    }
    if (answered && preview?.kind === 'nosac') return current.fen;
    if (answered) return afterSacFen ?? current.fen;
    return current.fen;
  })();

  // lastMove for step mode
  const stepLastMove: { from: Square; to: Square } | null = (() => {
    if (!current || step === null || !answered) return null;
    const def = current.defenses?.[step.line];
    const pvArr = def ? (Array.isArray(def.pv) ? def.pv : (def.pv as string).split(' ')) : [];
    const uci = pvArr[step.ply];
    if (!uci || uci.length < 4) return null;
    return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square };
  })();

  // ── Board arrows, tints, rings, badges ─────────────────────────────────────
  const sacTints: Partial<Record<Square, string>> = {};
  const sacRings: Partial<Record<Square, string>> = {};
  const sacBadges: Partial<Record<Square, BadgeKind>> = {};
  const sacArrows: BoardArrow[] = [];
  let sacCheckSquare: Square | null = null;

  if (current && !answered) {
    const from = current.move.slice(0, 2) as Square;
    const to   = current.move.slice(2, 4) as Square;
    sacArrows.push({ from, to, color: '#F0A43A', style: 'dashed', opacity: 0.9, role: 'offer' });
    sacTints[from] = 'rgba(240,164,58,.22)';
    sacTints[to]   = 'rgba(240,164,58,.18)';
    sacRings[to]   = '#F0A43A';
  }

  if (current && answered && revealed && step === null) {
    const from = current.move.slice(0, 2) as Square;
    const to   = current.move.slice(2, 4) as Square;
    const works = current.kind === 'real';

    if (preview?.kind === 'nosac') {
      // Show only best arrow, no tints, no badges (pre-sac position)
      const bnsRaw = current.best_no_sac;
      const bns = bnsRaw ? displayBestNoSac(current.fen, bnsRaw) : null;
      // need UCI for the arrow — if bnsRaw is UCI use it, else try to get from SAN
      if (bnsRaw && /^[a-h][1-8][a-h][1-8]/.test(bnsRaw)) {
        sacArrows.push({ from: bnsRaw.slice(0, 2) as Square, to: bnsRaw.slice(2, 4) as Square, color: '#81B64C', style: 'dashed', role: 'best' });
      } else if (bns) {
        try {
          const ch = new Chess(current.fen);
          const mv = ch.move(bns);
          if (mv) sacArrows.push({ from: mv.from as Square, to: mv.to as Square, color: '#81B64C', style: 'dashed', role: 'best' });
        } catch { /* noop */ }
      }
    } else if (preview?.kind === 'line') {
      const def = current.defenses?.[preview.idx];
      sacTints[from] = works ? 'rgba(38,194,163,.45)' : 'rgba(224,87,74,.40)';
      sacTints[to]   = works ? 'rgba(38,194,163,.55)' : 'rgba(224,87,74,.50)';
      if (works) sacBadges[to] = 'brilliant';
      else {
        const wpB = wp(current.eval_before ?? 0);
        const wpA = wp(current.eval_after ?? 0);
        sacBadges[to] = wpB - wpA >= 0.20 ? 'blunder' : 'mistake';
      }
      sacCheckSquare = detectCheckSquare(current.fen, current.move);
      if (def?.pv) {
        const pvArr = Array.isArray(def.pv) ? def.pv : (def.pv as string).split(' ');
        pvArr.slice(0, 4).forEach((uci, idx) => {
          if (!uci || uci.length < 4) return;
          const isOpp = idx % 2 === 0;
          sacArrows.push({
            from: uci.slice(0, 2) as Square,
            to:   uci.slice(2, 4) as Square,
            color: isOpp ? '#E0574A' : '#4A90E2',
            style: 'solid',
            opacity: 0.85,
            label: String(idx + 1),
            role: isOpp ? 'line-opp' : 'line-me',
          });
        });
      }
    } else {
      // Normal answered state (not hovering)
      sacTints[from] = works ? 'rgba(38,194,163,.45)' : 'rgba(224,87,74,.40)';
      sacTints[to]   = works ? 'rgba(38,194,163,.55)' : 'rgba(224,87,74,.50)';
      sacCheckSquare = detectCheckSquare(current.fen, current.move);

      if (works) {
        sacBadges[to] = 'brilliant';
        if (current.accepted_pv) {
          const pvMoves = current.accepted_pv.split(' ').filter(Boolean);
          // pv[0] = opp capture (line-opp, label 1), pv[1] = my move (plan, label 2)
          const lineOppUci = pvMoves[0];
          const planUci    = pvMoves[1];
          if (lineOppUci && lineOppUci.length >= 4) {
            sacArrows.push({
              from: lineOppUci.slice(0, 2) as Square, to: lineOppUci.slice(2, 4) as Square,
              color: '#E0574A', style: 'solid', opacity: 0.85, label: '1', role: 'line-opp',
            });
          }
          if (planUci && planUci.length >= 4) {
            sacArrows.push({
              from: planUci.slice(0, 2) as Square, to: planUci.slice(2, 4) as Square,
              color: '#4A90E2', style: 'solid', opacity: 0.7, label: '2', role: 'plan',
            });
          }
        }
      } else {
        const wpB = wp(current.eval_before ?? 0);
        const wpA = wp(current.eval_after ?? 0);
        sacBadges[to] = wpB - wpA >= 0.20 ? 'blunder' : 'mistake';
        if (current.pv) {
          const pvMoves = current.pv.split(' ').filter(Boolean);
          const refuteUci = pvMoves[0];
          if (refuteUci && refuteUci.length >= 4) {
            sacArrows.push({
              from: refuteUci.slice(0, 2) as Square, to: refuteUci.slice(2, 4) as Square,
              color: '#E0574A', style: 'solid', opacity: 0.85, role: 'threat',
            });
          }
        }
      }
    }
  }

  // Check square when step active
  if (current && answered && step !== null && stepLastMove) {
    // detect check in the displayFen position
    try {
      const ch = new Chess(displayFen);
      if (ch.inCheck()) {
        for (const row of ch.board()) {
          for (const cell of row) {
            if (cell?.type === 'k' && cell.color === ch.turn()) {
              sacCheckSquare = cell.square as Square;
            }
          }
        }
      }
    } catch { /* noop */ }
  }

  // ── EvalBar: use cp from eval_after ────────────────────────────────────────
  const evalCp = answered && current ? current.eval_after : null;
  const evalBarNode = answered && evalCp != null
    ? <EvalBar cp={evalCp} orientation={sideToMove} />
    : undefined;

  // ── Filter toggle ──────────────────────────────────────────────────────────
  const filterToggle = (
    <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--hairline)', overflow: 'hidden' }}>
      {(['Таль', 'Все мастера'] as const).map((label, i) => {
        const active = i === 0 ? prepFilter === 'tal' : prepFilter === 'all';
        return (
          <button
            key={label}
            onClick={() => setPrepFilter(i === 0 ? 'tal' : 'all')}
            style={{
              flex: 1, height: 36, fontSize: 13, fontWeight: 500,
              background: active ? 'var(--track)' : 'transparent',
              color: active ? 'var(--ivory)' : 'var(--muted)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  // ── Prep block in session ──────────────────────────────────────────────────
  const prepBlock = (
    <div data-ui="sac-prep" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)' }}>
          {preparing ? 'Подготовка позиций' : 'Подготовить позиции'}
        </span>
      </div>
      {preparing && prepProgress ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            Проверено {prepProgress.gamesChecked} из {prepProgress.gamesTotal} партий · найдено {prepProgress.found}
            {prepEta != null && ` · ~${formatEta(prepEta)}`}
          </div>
          <ProgressBar value={prepProgress.gamesChecked} max={Math.max(1, prepProgress.gamesTotal)} height={6} />
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
          {scanned != null ? `Готово ${scanned} позиций` : '—'}
          {remaining != null && remaining > 0 ? ` · ещё ${remaining} партий не проверено` : ''}
        </div>
      )}
      {prepError && (
        <div style={{ fontSize: 13, color: '#E0574A', lineHeight: 1.4 }}>{prepError}</div>
      )}
      <button
        onClick={preparing ? stopPrepare : handlePrepare}
        disabled={!preparing && remaining === 0}
        style={{
          height: 36, fontSize: 13, fontWeight: 600,
          background: preparing ? 'var(--surface-2)' : 'var(--accent)',
          color: preparing ? 'var(--muted)' : '#fff',
          border: preparing ? '1px solid var(--hairline-2)' : 'none',
          cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
          opacity: (!preparing && remaining === 0) ? 0.5 : 1,
        }}
      >
        {preparing
          ? 'Стоп'
          : remaining === 0 ? 'Нечего обрабатывать'
          : scanned && scanned > 0 ? `Подготовить ещё 200 партий`
          : 'Подготовить позиции'}
      </button>
    </div>
  );

  // ── Session list ───────────────────────────────────────────────────────────
  const sessionList = positions.length === 0 ? (
    <div style={{
      margin: '10px',
      padding: '14px',
      border: '1px dashed rgba(255,255,255,.14)',
      borderRadius: 10,
      fontSize: 14,
      color: 'var(--muted)',
      textAlign: 'center',
    }}>
      Здесь появятся позиции после подготовки
    </div>
  ) : (
    <>
      {positions.slice(0, 20).map((p, i) => {
        const isCur = current?.id === p.id;
        const done = history.find(h => h.pos.id === p.id);
        return (
          <div
            key={p.id}
            onClick={() => { setCurrent(p); setAnswered(null); setRevealed(false); setStep(null); setPreview(null); if (revealTimerRef.current) clearTimeout(revealTimerRef.current); }}
            style={{
              display: 'grid',
              gridTemplateColumns: '26px 1fr auto',
              alignItems: 'center',
              gap: 8,
              height: 50,
              padding: '0 10px',
              borderRadius: 10,
              position: 'relative',
              background: isCur ? 'var(--track)' : 'transparent',
              cursor: 'pointer',
              opacity: 1,
            }}
          >
            {isCur && (
              <div style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: '#81B64C' }} />
            )}
            <div style={{ display: 'grid', placeItems: 'center', fontSize: 13, color: isCur ? '#81B64C' : 'var(--control)', fontWeight: isCur ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
              {done
                ? <span style={{ fontSize: 14, color: done.ok ? '#81B64C' : '#E0574A' }}>{done.ok ? '✓' : '✗'}</span>
                : <span>{i + 1}</span>
              }
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {done ? `${p.san ?? uciToSan(p.fen, p.move)} · ${p.kind === 'real' ? 'работает' : 'не работает'}` : `Позиция ${i + 1}`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--control)', marginTop: 1 }}>
                {done ? (done.answer === 'sac' ? 'ты: жертвую' : 'ты: не жертвую') : (isCur ? 'текущая' : 'партия мастера')}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );

  // ── Session panel ──────────────────────────────────────────────────────────
  const sessionPanel = (
    <SessionPanel
      title="Сессия"
      rightNote={positions.length > 0 ? `осталось ${positions.filter(p => !history.find(h => h.pos.id === p.id)).length}` : undefined}
      stats={[
        { value: correctPct != null ? correctPct : 0, label: 'верных %', color: '#81B64C' },
        { value: stats.missedReal, label: 'пропустил', color: '#F4B45C' },
        { value: stats.wrongFake, label: 'ложная', color: '#E0574A' },
      ]}
      controls={filterToggle}
      prepBlock={prepBlock}
      listLabel={positions.length > 0 ? `Позиции` : undefined}
      listRight={positions.length > 0 ? `${positions.length}` : undefined}
      list={sessionList}
      footer={
        positions.length > 0 ? (
          <button
            onClick={() => pickRandom(positions)}
            style={{
              width: '100%', height: 44, fontSize: 15, fontWeight: 600,
              background: 'var(--surface-2)', border: '1px solid var(--hairline-2)',
              color: 'var(--ivory)', cursor: 'pointer', fontFamily: 'inherit',
              borderRadius: 'var(--radius-btn)',
            }}
          >
            Случайная позиция
          </button>
        ) : undefined
      }
    />
  );

  // ── Player bars ────────────────────────────────────────────────────────────
  const topBarNode = (
    <div data-ui="player-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--track)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>{oppSide === 'white' ? '♙' : '♟'}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
          {oppSide === 'white' ? 'Белые' : 'Чёрные'}
        </span>
      </div>
      {current && (
        <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
          ход {moveNum}
        </span>
      )}
    </div>
  );

  const bottomBarNode = (
    <div data-ui="player-bottom" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--track)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>{sideToMove === 'white' ? '♙' : '♟'}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
          {sideToMove === 'white' ? 'Белые' : 'Чёрные'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· ты решаешь за них</span>
      </div>
    </div>
  );

  // ── Board ──────────────────────────────────────────────────────────────────
  const boardNode = (
    <Board
      fen={displayFen}
      orientation={sideToMove}
      size={S}
      interactive={false}
      dimmed={!current}
      lastMove={stepLastMove ?? undefined}
      tints={sacTints as Partial<Record<Square, string>>}
      rings={sacRings as Partial<Record<Square, string>>}
      badges={sacBadges as Partial<Record<Square, BadgeKind>>}
      arrows={sacArrows}
      checkSquare={sacCheckSquare}
    />
  );

  // ── Panel content ──────────────────────────────────────────────────────────
  const panelNode = (
    <div data-demo={isDemo ? demoKey ?? undefined : undefined} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div data-ui="panel-header" style={{ padding: '20px 24px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <span>Тренировка · Жертвы</span>
          {positions.length > 0 && (
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
              {stats.total} / {positions.length}
            </span>
          )}
        </div>
        {stats.total > 0 && (
          <ProgressBar value={stats.correct} max={stats.total} height={4} />
        )}
        <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          {positions.length === 0 && !preparing
            ? 'Жертвовать или нет?'
            : preparing
            ? 'Готовлю позиции'
            : 'Жертвовать или нет?'}
        </div>

        {/* Chips under title */}
        {current && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
              {sideToMove === 'white' ? 'Ход белых' : 'Ход чёрных'}
            </span>
            {answered && current && (
              <>
                <span style={{
                  fontSize: 13, padding: '3px 10px', borderRadius: 20,
                  background: answered.ok ? 'rgba(129,182,76,.12)' : 'rgba(224,87,74,.12)',
                  border: `1px solid ${answered.ok ? 'rgba(129,182,76,.4)' : 'rgba(224,87,74,.4)'}`,
                  color: answered.ok ? '#81B64C' : '#F08277',
                }}>
                  {answered.ok ? 'Верно' : 'Неверно'}
                </span>
                <span style={{
                  fontSize: 13, padding: '3px 10px', borderRadius: 20,
                  background: current.kind === 'real' ? 'rgba(38,194,163,.12)' : 'rgba(224,87,74,.12)',
                  border: `1px solid ${current.kind === 'real' ? 'rgba(38,194,163,.4)' : 'rgba(224,87,74,.4)'}`,
                  color: current.kind === 'real' ? '#26C2A3' : '#F08277',
                }}>
                  {buildChipText(current)}
                </span>
                {answered.ok && (
                  <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 20, background: 'rgba(129,182,76,.12)', border: '1px solid rgba(129,182,76,.4)', color: '#81B64C' }}>
                    +20 XP
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 24px' }}>

        {/* Empty state */}
        {positions.length === 0 && !preparing && (
          <div data-ui="sac-empty" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'rgba(129,182,76,.14)', border: '1px solid rgba(129,182,76,.3)', borderRadius: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(129,182,76,.14)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 28, color: 'var(--accent)' }}>
                ⚔
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ivory)', marginBottom: 4 }}>Позиций пока нет</div>
                <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Сайт найдёт жертвы в партиях мастеров и проверит каждую движком. Около 10 минут на 200 партий, вкладку не закрывай.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { n: '01', text: 'Находим ходы, где фигура отдаётся' },
                { n: '02', text: 'Движок проверяет, работает ли жертва' },
                { n: '03', text: 'Позиции появляются в списке слева' },
              ].map(({ n, text }) => (
                <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{n}</span>
                  <span style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5, paddingTop: 5 }}>{text}</span>
                </div>
              ))}
            </div>
            {masterCount != null && masterCount > 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Партий {prepFilter === 'tal' ? 'Таля' : 'мастеров'} уже загружено: {masterCount}
              </div>
            )}
            {prepError && (
              <div style={{ fontSize: 13, color: '#E0574A', lineHeight: 1.4 }}>{prepError}</div>
            )}
          </div>
        )}

        {/* Preparing state */}
        {preparing && prepProgress && (
          <div data-ui="sac-prep-progress" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 24 }}>
                🗄
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ivory)' }}>Готовлю позиции</div>
                <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 2 }}>
                  Движок проверяет жертвы в партиях {prepFilter === 'tal' ? 'Таля' : 'мастеров'}. Можно уже решать найденные.
                </div>
              </div>
            </div>
            <ProgressBar value={prepProgress.gamesChecked} max={Math.max(1, prepProgress.gamesTotal)} height={8} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              <span>Проверено {prepProgress.gamesChecked} из {prepProgress.gamesTotal} партий</span>
              {prepEta != null && <span>осталось ~{formatEta(prepEta)}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[
                { label: 'найдено', value: prepProgress.found, color: 'var(--ivory)' },
                { label: 'работают', value: prepProgress.works, color: '#81B64C' },
                { label: 'не работают', value: prepProgress.fails, color: '#E0574A' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: '10px 12px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)', textAlign: 'center' }}>
                  <b style={{ display: 'block', fontSize: 20, color, fontVariantNumeric: 'tabular-nums' }}>{value}</b>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
              Вкладку не закрывай, пока идёт подготовка
            </div>
          </div>
        )}

        {/* Question state */}
        {!answered && current && !preparing && (
          <>
            <div data-ui="sac-offer" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>Предложение</div>
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em',
                background: 'rgba(240,164,58,.12)', border: '1px solid rgba(240,164,58,.45)',
                color: '#F4B45C', borderRadius: 10, padding: '6px 14px',
                marginBottom: 8,
              }}>
                <MoveChip>{sacSan}</MoveChip>
              </div>
              <div style={{ fontSize: 15, color: 'var(--ivory)', lineHeight: 1.5 }}>
                Это возможная жертва материала. Доверься интуиции.
              </div>
            </div>

            <div data-ui="sac-weigh" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20, padding: '14px 16px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10 }}>
              {[
                { text: 'Сколько материала ты отдаёшь?' },
                { text: 'Сколько фигур защищают короля соперника?' },
                { text: 'Какие у тебя шахи и угрозы после взятия?' },
              ].map(({ text }, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 32 }}>
                  <span style={{ fontSize: 18, color: 'var(--muted)', flexShrink: 0 }}>·</span>
                  <span style={{ fontSize: 15, color: 'var(--ivory)' }}>{text}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Answer state */}
        {answered && current && (() => {
          const works = current.kind === 'real';
          const title =
            answered.answer === 'sac'
              ? (works ? 'Верно! Жертва работает' : 'Неверно — жертва не работает')
              : (works ? 'Неверно — жертва работает' : 'Верно — жертва не работает');

          // SAN for best_no_sac
          const bnsRaw = current.best_no_sac;
          const bnsSan = bnsRaw ? displayBestNoSac(current.fen, bnsRaw) : null;

          // Defense lines in SAN
          const sacFenForLines = afterSacFen ?? current.fen;

          // accepted_pv array
          const acceptedPvArr = current.accepted_pv ? current.accepted_pv.split(' ').filter(Boolean) : null;

          // captured piece type
          const capturedType = capturedPieceType(current.fen, current.move);

          const { gave, got, gotBad } = buildGaveGot(current, capturedType, acceptedPvArr);

          return (
            <>
              <div data-ui="sac-feedback" data-result={works ? 'works' : 'fails'} style={{ marginBottom: 16 }}>
                <FeedbackCard
                  variant={answered.ok ? 'success' : 'danger'}
                  title={title}
                >
                  {buildPhrase(current, sacSan, afterSacFen)}
                </FeedbackCard>
              </div>

              {/* Eval pair */}
              {(current.eval_after != null || current.eval_no_sac != null) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  <div
                    data-ui="sac-eval-no"
                    onMouseEnter={() => { if (step === null) setPreview({ kind: 'nosac' }); }}
                    onFocus={() => { if (step === null) setPreview({ kind: 'nosac' }); }}
                    onMouseLeave={() => { if (step === null) setPreview(null); }}
                    onBlur={() => { if (step === null) setPreview(null); }}
                    tabIndex={0}
                    style={{
                      background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--hairline-2)',
                      cursor: 'default', outline: 'none',
                      ...(preview?.kind === 'nosac' ? { background: 'rgba(74,144,226,.12)', border: '1px solid rgba(74,144,226,.5)' } : {}),
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                      без жертвы{bnsSan ? ` (${bnsSan})` : ''}
                    </span>
                    <b style={{ fontSize: 20, color: works ? 'var(--ivory)' : '#81B64C', fontVariantNumeric: 'tabular-nums' }}>
                      {current.eval_no_sac != null ? cpToEvalStr(current.eval_no_sac) : '—'}
                    </b>
                  </div>
                  <div
                    data-ui="sac-eval-after"
                    style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--hairline-2)' }}
                  >
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                      после {sacSan}
                    </span>
                    <b style={{ fontSize: 20, color: works ? '#81B64C' : '#F08277', fontVariantNumeric: 'tabular-nums' }}>
                      {current.eval_after != null ? cpToEvalStr(current.eval_after) : '—'}
                    </b>
                  </div>
                </div>
              )}

              {/* Defenses ("если ...") */}
              {current.defenses && current.defenses.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {current.defenses.slice(0, 2).map((def, i) => {
                    const pvArr = Array.isArray(def.pv) ? def.pv : (def.pv as string).split(' ');
                    const sanMoves = lineSan(sacFenForLines, pvArr.slice(0, 4));
                    const outcome = sacTextLineOutcome(current.fen, current.move, pvArr, def.cp, def.mate);
                    const isActive = step?.line === i;
                    const isHovered = step === null && preview?.kind === 'line' && preview.idx === i;
                    return (
                      <div
                        key={i}
                        data-ui="sac-line"
                        onMouseEnter={() => { if (step === null) setPreview({ kind: 'line', idx: i }); }}
                        onFocus={() => { if (step === null) setPreview({ kind: 'line', idx: i }); }}
                        onMouseLeave={() => { if (step === null) setPreview(null); }}
                        onBlur={() => { if (step === null) setPreview(null); }}
                        tabIndex={0}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13,
                          padding: '6px 8px', borderRadius: 8, cursor: 'default', outline: 'none',
                          ...((isActive || isHovered)
                            ? { background: 'rgba(74,144,226,.12)', border: '1px solid rgba(74,144,226,.5)' }
                            : { border: '1px solid transparent' }),
                        }}
                      >
                        {/* ▶ play button */}
                        {(() => {
                          const pvArr2 = current.defenses?.[i] ? (Array.isArray(current.defenses[i].pv) ? current.defenses[i].pv as string[] : (current.defenses[i].pv as string).split(' ')) : [];
                          const isPlaying = step?.line === i && step.playing;
                          const isDone = step?.line === i && !step.playing && step.ply === Math.min(pvArr2.length, 4) - 1;
                          const isActive = step?.line === i;
                          return (
                            <button
                              data-ui="sac-line-play"
                              data-line={i}
                              onMouseDown={e => e.preventDefault()}
                              onClick={e => {
                                e.stopPropagation();
                                if (isPlaying) {
                                  stopPlay();
                                  setStep({ line: i, ply: step!.ply, playing: false });
                                } else if (isDone || (isActive && !isPlaying)) {
                                  startPlay(i, pvArr2);
                                } else {
                                  startPlay(i, pvArr2);
                                }
                                setPreview(null);
                              }}
                              style={{
                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontFamily: 'inherit',
                                background: isPlaying ? 'rgba(74,144,226,.85)' : 'var(--surface-2)',
                                border: `1px solid ${isPlaying ? 'rgba(74,144,226,.85)' : 'var(--hairline-2, var(--hairline))'}`,
                                color: isPlaying ? '#fff' : 'var(--ivory)',
                              }}
                            >
                              {isPlaying ? '❚❚' : isDone ? '↻' : '▶'}
                            </button>
                          );
                        })()}
                        <span
                          style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1, cursor: 'default' }}
                          onClick={() => {
                            const pvArr2 = current.defenses?.[i] ? (Array.isArray(current.defenses[i].pv) ? current.defenses[i].pv as string[] : (current.defenses[i].pv as string).split(' ')) : [];
                            startPlay(i, pvArr2);
                            setPreview(null);
                          }}
                        >если</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {sanMoves.map((san, j) => {
                            const isStepActive = step?.line === i && step.ply === j;
                            return (
                              <button
                                key={j}
                                data-ui="sac-line-move"
                                data-line={i}
                                data-ply={j}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  stopPlay();
                                  if (isStepActive) {
                                    setStep(null);
                                    setPreview(null);
                                    (document.activeElement as HTMLElement | null)?.blur();
                                  } else {
                                    setStep({ line: i, ply: j, playing: false });
                                    setPreview(null);
                                  }
                                }}
                                style={{
                                  padding: '2px 8px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                                  fontFamily: 'inherit', fontWeight: isStepActive ? 600 : 400,
                                  color: isStepActive ? '#fff' : 'var(--ivory)',
                                  background: isStepActive ? 'rgba(74,144,226,.28)' : 'var(--surface-2)',
                                  border: isStepActive ? '1px solid rgba(74,144,226,.75)' : '1px solid var(--hairline)',
                                }}
                              >
                                {san}
                              </button>
                            );
                          })}
                          <span
                            style={{ color: 'var(--muted)', fontSize: 13, alignSelf: 'center', cursor: 'default' }}
                            onClick={() => {
                              const pvArr2 = current.defenses?.[i] ? (Array.isArray(current.defenses[i].pv) ? current.defenses[i].pv as string[] : (current.defenses[i].pv as string).split(' ')) : [];
                              startPlay(i, pvArr2);
                              setPreview(null);
                            }}
                          >— {outcome}</span>
                        </div>
                      </div>
                    );
                  })}
                  {step !== null ? (
                    <div data-ui="sac-step" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ivory)', marginTop: 2 }}>
                      <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          stopPlay();
                          if (step.ply === 0) { setStep(null); setPreview(null); (document.activeElement as HTMLElement | null)?.blur(); }
                          else setStep({ line: step.line, ply: step.ply - 1, playing: false });
                        }}
                        style={{ width: 32, height: 28, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)', cursor: 'pointer', fontSize: 14, color: 'var(--ivory)', flexShrink: 0 }}
                      >‹</button>
                      {/* Middle ▶/⏸/↻ button */}
                      {(() => {
                        const def = current.defenses?.[step.line];
                        const pvArr = def ? (Array.isArray(def.pv) ? def.pv as string[] : (def.pv as string).split(' ')) : [];
                        const maxPly = Math.min(pvArr.length, 4) - 1;
                        const isPlaying = step.playing;
                        const isDone = !step.playing && step.ply === maxPly;
                        return (
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              if (isPlaying) {
                                stopPlay();
                                setStep({ line: step.line, ply: step.ply, playing: false });
                              } else {
                                startPlay(step.line, pvArr);
                              }
                            }}
                            style={{
                              width: 32, height: 28, borderRadius: 8, cursor: 'pointer', fontSize: 13, flexShrink: 0,
                              background: 'rgba(74,144,226,.85)', border: '1px solid rgba(74,144,226,.85)', color: '#fff',
                            }}
                          >
                            {isPlaying ? '❚❚' : isDone ? '↻' : '▶'}
                          </button>
                        );
                      })()}
                      <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          stopPlay();
                          const def = current.defenses?.[step.line];
                          const pvArr = def ? (Array.isArray(def.pv) ? def.pv : (def.pv as string).split(' ')) : [];
                          const maxPly = Math.min(pvArr.length, 4) - 1;
                          if (step.ply < maxPly) setStep({ line: step.line, ply: step.ply + 1, playing: false });
                        }}
                        style={{ width: 32, height: 28, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)', cursor: 'pointer', fontSize: 14, color: 'var(--ivory)', flexShrink: 0 }}
                      >›</button>
                      {(() => {
                        const def = current.defenses?.[step.line];
                        const pvArr = def ? (Array.isArray(def.pv) ? def.pv : (def.pv as string).split(' ')) : [];
                        const n = Math.min(pvArr.length, 4);
                        return <span style={{ fontWeight: 600 }}>Ход {step.ply + 1} из {n}</span>;
                      })()}
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', color: 'var(--muted)' }}>
                        <Kbd>←</Kbd><Kbd>→</Kbd><span>листать</span>
                        <span style={{ marginLeft: 4 }}><Kbd>Esc</Kbd><span> к ответу</span></span>
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--faint, var(--muted))', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span>↖</span>
                      <span>Наведи — стрелки на доске. Нажми на вариант — проиграю его.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Gave / Got */}
              <div data-ui="sac-gave-got" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--hairline-2)' }}>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Отдал</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>{gave}</span>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--hairline-2)' }}>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Получил</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: gotBad ? '#E0574A' : 'var(--ivory)' }}>{got}</span>
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* Footer: actions */}
      <div data-ui="panel-actions" style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!answered && current && !preparing && (
          <>
            <div data-ui="sac-choice" style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => void handleAnswer('sac')}
                style={{
                  flex: 1, height: 64, fontSize: 17, fontWeight: 700,
                  background: 'rgba(240,164,58,.14)',
                  border: '1px solid rgba(240,164,58,.55)',
                  color: '#F4B45C',
                  boxShadow: '0 4px 0 rgba(240,164,58,.25)',
                  cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                Жертвую
                <Kbd>1</Kbd>
              </button>
              <button
                onClick={() => void handleAnswer('calm')}
                style={{
                  flex: 1, height: 64, fontSize: 17, fontWeight: 700,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--hairline-2)',
                  color: '#E8E5E0',
                  boxShadow: '0 4px 0 rgba(0,0,0,.25)',
                  cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                Не жертвую
                <Kbd>2</Kbd>
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
              Доверься чутью: ответ сразу, без долгого расчёта
            </div>
          </>
        )}

        {answered && positions.length > 0 && (
          <>
            <button
              onClick={() => pickRandom(positions)}
              style={{
                height: 52, fontSize: 18, fontWeight: 700,
                background: '#81B64C', boxShadow: '0 4px 0 #5E8C35',
                color: '#fff', border: 'none', cursor: 'pointer',
                borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              Дальше
              <Kbd>Пробел</Kbd>
            </button>
            {current?.game_id && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Link
                  href={`/masters/${current.game_id}?ply=${current.ply ?? 0}`}
                  style={{
                    flex: 1, height: 40, fontSize: 14, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--surface-2)', border: '1px solid var(--hairline-2)',
                    color: 'var(--ivory)', borderRadius: 'var(--radius-btn)', textDecoration: 'none',
                  }}
                >
                  Открыть партию
                </Link>
              </div>
            )}
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
              Сыграй атаку против движка, чтобы закрепить идею
            </div>
          </>
        )}

        {positions.length === 0 && !preparing && (
          <>
            <button
              onClick={handlePrepare}
              style={{
                height: 52, fontSize: 16, fontWeight: 700,
                background: 'var(--accent)', color: '#fff',
                border: 'none', cursor: 'pointer',
                borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
              }}
            >
              Подготовить позиции
            </button>
            <Link
              href="/masters"
              style={{
                height: 44, fontSize: 15, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface-2)', border: '1px solid var(--hairline-2)',
                color: 'var(--ivory)', borderRadius: 'var(--radius-btn)', textDecoration: 'none',
              }}
            >
              Загрузить партии мастеров
            </Link>
          </>
        )}

        {preparing && positions.length > 0 && (
          <button
            onClick={startSolving}
            style={{
              height: 52, fontSize: 16, fontWeight: 700,
              background: '#81B64C', boxShadow: '0 4px 0 #5E8C35',
              color: '#fff', border: 'none', cursor: 'pointer',
              borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            Решать найденные
            <Kbd>{positions.length}</Kbd>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <TrainerLayout
      session={sessionPanel}
      topBar={topBarNode}
      board={boardNode}
      evalBar={evalBarNode}
      bottomBar={bottomBarNode}
      panel={panelNode}
      panelAttrs={isDemo && demoKey ? { 'data-demo': demoKey } : undefined}
    />
  );
}

export default function SacPage() {
  return <Suspense><SacPageInner /></Suspense>;
}
