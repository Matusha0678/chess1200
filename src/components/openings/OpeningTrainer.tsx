'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Square } from 'chess.js';
import { Board } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { LineList } from './LineList';
import type { LineRow } from './LineList';
import {
  FeedbackCard, TaskCard, GameNoteCard, StepsBar, MovesTable,
  PanelChip, PanelBtn, TrainerPanel,
} from './TrainerPanel';
import {
  toMoves, lineLabels, lineGroups, lineStatus, dueText, countStatuses,
  reviewQueue, learnQueue, hardQueue, sessionStart, learnStart,
  createRun, needsAuto, isMyTurn, auto, move, hint, restart, result, view, steps, moveItems,
  applyResult, inDays,
} from '@/lib/opening-trainer';
import type { ChessMove, Run, LessonProg, HardRow } from '@/lib/opening-trainer';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OpeningLine {
  id: string;
  index: number;
  moves: ChessMove[];
  prog: LessonProg | null;
  badge?: string | null;
  line_class?: string | null;
  opening_color?: 'white' | 'black' | 'both';
}

export interface GameDev {
  lineId: string;
  ply: number;
  played_uci: string;
  opp: string;
  date: string;
  result: 'win' | 'loss' | 'draw';
  daysAgo: number;
}

export type TrainerMode = 'review' | 'learn' | 'exam' | 'hard' | 'free';

interface Props {
  opening: { id: string; name: string; color: 'white' | 'black' | 'both' };
  lines: OpeningLine[];
  hardRows: HardRow[];
  gameDevs: GameDev[];
  initialMode: TrainerMode;
  initialLineId?: string | null;
  isDemo: boolean;
  onUpdateProgress?: (
    lineId: string,
    perfect: boolean,
    row: { mastery: number; next_review: string; correct_count: number; incorrect_count: number; last_practiced: string },
    masteryAfter: number,
    xp: number,
    mistakePlies: number[],
  ) => void | Promise<void>;
  'data-demo'?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function myColorForLine(
  openingColor: 'white' | 'black' | 'both',
  lineId: string,
  lineOpeningColor?: 'white' | 'black' | 'both',
): 'w' | 'b' {
  const color = lineOpeningColor ?? openingColor;
  if (color === 'white') return 'w';
  if (color === 'black') return 'b';
  let h = 0;
  for (let i = 0; i < lineId.length; i++) h = (h * 31 + lineId.charCodeAt(i)) | 0;
  return (h & 1) === 0 ? 'w' : 'b';
}

function formatDueText(dt: string): string {
  if (dt === 'освоена') return '✓ освоена';
  return dt;
}

// ── Exam state ─────────────────────────────────────────────────────────────────

interface ExamResult {
  lineId: string;
  label: string;
  perfect: boolean;
  mistakeAt?: string;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function OpeningTrainer({
  opening, lines, hardRows, gameDevs,
  initialMode, initialLineId, isDemo, onUpdateProgress,
  ...rest
}: Props) {
  const { S } = useTrainerGeometry();
  const now = Date.now();

  // ── Flip ──────────────────────────────────────────────────────────────────
  const [flipped, setFlipped] = useState(false);

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<TrainerMode>(initialMode);

  // ── Queue ──────────────────────────────────────────────────────────────────
  const [okSet, setOkSet] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<string[]>(() => buildQueue(initialMode, lines, hardRows, initialLineId, new Set(gameDevs.map(g => g.lineId)), new Set(), now));
  const [qPos, setQPos] = useState(0);

  // ── Run ────────────────────────────────────────────────────────────────────
  const [run, setRun] = useState<Run | null>(null);
  const [currentLineId, setCurrentLineId] = useState<string | null>(null);

  // ── XP ────────────────────────────────────────────────────────────────────
  const [sessionXp, setSessionXp] = useState(0);

  // ── Summary / done ──────────────────────────────────────────────────────
  const [sessionDone, setSessionDone] = useState(false);
  const [sessionResults, setSessionResults] = useState<Array<{ lineId: string; perfect: boolean; days: number; masteryBefore: number; masteryAfter: number }>>([]);

  // ── Exam state ────────────────────────────────────────────────────────────
  const [examSetup, setExamSetup] = useState(mode === 'exam');
  const [examStarted, setExamStarted] = useState(false);
  const [examTimer, setExamTimer] = useState(0);
  const [examTimerInterval, setExamTimerInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [examDone, setExamDone] = useState(false);
  const [examMinutes, setExamMinutes] = useState(10);

  // ── Learn recall mode ────────────────────────────────────────────────────
  const [learnPhase, setLearnPhase] = useState<'learn' | 'recall' | 'done'>('learn');

  // ── Game note ────────────────────────────────────────────────────────────
  const [gameNoteShown, setGameNoteShown] = useState<{ lineId: string; ply: number; type: 'same' | 'correct' } | null>(null);

  // ── Lines state (mutable for demo) ───────────────────────────────────────
  const [linesState, setLinesState] = useState(lines);

  // ── Auto-move timer ───────────────────────────────────────────────────────
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Stable set of line IDs with game deviations ──────────────────────────
  const freshDevSet = useMemo(() => new Set(gameDevs.map(g => g.lineId)), [gameDevs]);

  function buildQueue(
    m: TrainerMode, ls: OpeningLine[], hrs: HardRow[], forceId: string | null | undefined,
    devSet: Set<string>, ok: Set<string>, t: number,
  ): string[] {
    const withProg = ls.map(l => ({ id: l.id, index: l.index, prog: l.prog }));
    if (m === 'review' || m === 'free') return reviewQueue(withProg, t, { freshDev: devSet, forceLineId: forceId ?? null });
    if (m === 'learn') return learnQueue(withProg, { forceLineId: forceId ?? null });
    if (m === 'exam') {
      if (isDemo) return ['L2', 'L1', 'L3', 'L4', 'L5', 'L6'].filter(id => ls.find(l => l.id === id));
      return ls.map(l => l.id);
    }
    if (m === 'hard') {
      const linesById: Record<string, { moves: ChessMove[]; myColor: 'w' | 'b' }> = {};
      for (const l of ls) linesById[l.id] = { moves: l.moves, myColor: myColorForLine(opening.color, l.id, l.opening_color) };
      return hardQueue(hrs, linesById).map(h => h.lineId);
    }
    return [];
    // unused vars warning suppression
    void ok; void forceId; void devSet;
  }

  const getLine = useCallback((id: string) => linesState.find(l => l.id === id) ?? null, [linesState]);

  // ── Start run for a line in queue position ────────────────────────────────
  const startRun = useCallback((lineId: string, m: TrainerMode, ok: Set<string>, lp?: 'learn' | 'recall') => {
    const line = linesState.find(l => l.id === lineId);
    if (!line) return;
    const myColor = myColorForLine(opening.color, lineId, line.opening_color);
    let startPly = 0;
    if (m === 'review' && lp !== 'recall') {
      startPly = sessionStart(line.moves, myColor, ok);
    } else if (m === 'learn') {
      const otherLines = linesState.filter(l => l.id !== lineId && l.prog !== null);
      startPly = learnStart(line.moves, otherLines);
    }
    const runMode = (m === 'hard' ? 'drill' : m === 'free' ? 'review' : lp === 'recall' ? 'review' : m) as 'review' | 'learn' | 'exam' | 'drill';
    const endPly = m === 'hard'
      ? (() => {
          const linesById: Record<string, { moves: ChessMove[]; myColor: 'w' | 'b' }> = {};
          for (const l of linesState) linesById[l.id] = { moves: l.moves, myColor: myColorForLine(opening.color, l.id, l.opening_color) };
          const hq = hardQueue(hardRows, linesById);
          const entry = hq.find(h => h.lineId === lineId);
          return entry ? entry.ply + 1 : line.moves.length;
        })()
      : line.moves.length;
    setRun(createRun(line.moves, myColor, runMode, { startPly, endPly }));
    setCurrentLineId(lineId);
    setGameNoteShown(null);
  }, [linesState, opening.color, hardRows]);

  // ── Initialize first run ──────────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'exam') return;
    const initDevSet = new Set(gameDevs.map(g => g.lineId));
    const q = buildQueue(mode, lines, hardRows, initialLineId, initDevSet, new Set(), now);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueue(q);
    setQPos(0);
    if (q.length > 0) {
      startRun(q[0], mode, okSet);
    } else {
      setSessionDone(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-move effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!run || !needsAuto(run)) return;
    const delay = mode === 'learn' ? 600 : 300;
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => {
      setRun(prev => {
        if (!prev || !needsAuto(prev)) return prev;
        const next = auto(prev);
        const newOk = new Set(okSet);
        for (const e of next.effects) if (e.type === 'ok' && e.key) newOk.add(e.key);
        if (newOk.size !== okSet.size) setOkSet(newOk);
        return next;
      });
    }, delay);
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, mode]);

  // ── Handle board move ─────────────────────────────────────────────────────
  const handleMove = useCallback((from: Square, to: Square) => {
    if (!run || !isMyTurn(run)) return;

    const newRun = move(run, from, to);
    // Collect ok keys
    const newOk = new Set(okSet);
    for (const e of newRun.effects) if (e.type === 'ok' && e.key) newOk.add(e.key);
    if (newOk.size !== okSet.size) setOkSet(newOk);

    // Check for game deviation note
    const lineId = currentLineId;
    if (lineId && newRun.wrong) {
      const dev = gameDevs.find(g => g.lineId === lineId && g.ply === newRun.wrong!.ply);
      if (dev) {
        const isSame = `${from}${to}` === dev.played_uci;
        setGameNoteShown({ lineId, ply: dev.ply, type: isSame ? 'same' : 'correct' });
      }
    } else if (lineId && !newRun.wrong) {
      const expLine = getLine(lineId);
      if (expLine && run.ply < expLine.moves.length) {
        const expMove = expLine.moves[run.ply];
        if (from === expMove.from && to === expMove.to) {
          const dev = gameDevs.find(g => g.lineId === lineId && g.ply === run.ply);
          if (dev) {
            setGameNoteShown({ lineId, ply: run.ply, type: 'correct' });
          }
        }
      }
    }

    setRun(newRun);
  }, [run, okSet, currentLineId, gameDevs, getLine]);

  // ── After line done ───────────────────────────────────────────────────────
  const handleLineDone = useCallback((runResult: Run) => {
    if (!currentLineId) return;
    const line = getLine(currentLineId);
    if (!line) return;

    const res = result(runResult);
    const isAfterLearn = mode === 'learn' && learnPhase === 'recall';
    const applied = applyResult(line.prog, res.perfect, Date.now(), { afterLearn: isAfterLearn });

    setSessionXp(prev => prev + applied.xp);
    setSessionResults(prev => [...prev, {
      lineId: currentLineId, perfect: res.perfect,
      days: applied.days, masteryBefore: applied.masteryBefore, masteryAfter: applied.masteryAfter,
    }]);

    // Update line prog in state
    setLinesState(prev => prev.map(l =>
      l.id === currentLineId ? { ...l, prog: { ...applied.row, correct_count: applied.row.correct_count, incorrect_count: applied.row.incorrect_count } } : l,
    ));

    const mistakePlies = runResult.mistakes.filter(m => m.kind === 'wrong').map(m => m.ply);
    void onUpdateProgress?.(currentLineId, res.perfect, applied.row, applied.masteryAfter, applied.xp, mistakePlies);
  }, [currentLineId, getLine, mode, learnPhase, onUpdateProgress]);

  // ── Advance to next line ──────────────────────────────────────────────────
  const advanceQueue = useCallback(() => {
    const nextPos = qPos + 1;
    if (nextPos >= queue.length) {
      setSessionDone(true);
      return;
    }
    setQPos(nextPos);
    setLearnPhase('learn');
    startRun(queue[nextPos], mode, okSet);
  }, [qPos, queue, mode, okSet, startRun]);

  // ── Hint ──────────────────────────────────────────────────────────────────
  const handleHint = useCallback(() => {
    if (!run) return;
    setRun(hint(run));
  }, [run]);

  // ── Skip ──────────────────────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    advanceQueue();
  }, [advanceQueue]);

  // ── Restart ───────────────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    if (!run) return;
    setRun(restart(run));
  }, [run]);

  // ── Next after done ────────────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    if (!run || run.phase !== 'done') return;
    if (mode === 'learn' && learnPhase === 'learn') {
      setLearnPhase('recall');
      if (currentLineId) startRun(currentLineId, 'review', okSet, 'recall');
      return;
    }
    handleLineDone(run);
    advanceQueue();
  }, [run, mode, learnPhase, currentLineId, okSet, startRun, handleLineDone, advanceQueue]);

  // ── Mode change ───────────────────────────────────────────────────────────
  const handleModeChange = useCallback((m: 'review' | 'learn' | 'exam') => {
    setMode(m);
    setSessionDone(false);
    setSessionResults([]);
    setLearnPhase('learn');
    if (m === 'exam') {
      setExamSetup(true);
      setExamStarted(false);
      setExamDone(false);
      setExamResults([]);
      return;
    }
    const q = buildQueue(m, linesState, hardRows, null, freshDevSet, okSet, Date.now());
    setQueue(q);
    setQPos(0);
    if (q.length > 0) startRun(q[0], m, okSet);
    else setSessionDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesState, hardRows, okSet, freshDevSet, startRun]);

  // ── Line click ────────────────────────────────────────────────────────────
  const handleLineClick = useCallback((id: string) => {
    const idx = queue.indexOf(id);
    if (idx >= 0) {
      setQPos(idx);
    }
    setLearnPhase('learn');
    startRun(id, mode === 'exam' || mode === 'hard' ? 'review' : mode, okSet);
    setCurrentLineId(id);
  }, [queue, mode, okSet, startRun]);

  // ── Exam ──────────────────────────────────────────────────────────────────
  const handleExamStart = useCallback(() => {
    setExamSetup(false);
    setExamStarted(true);
    setExamDone(false);
    setExamResults([]);
    setExamTimer(0);
    const interval = setInterval(() => setExamTimer(t => t + 1), 1000);
    setExamTimerInterval(interval);
    const q = buildQueue('exam', linesState, hardRows, null, freshDevSet, okSet, Date.now());
    setQueue(q);
    setQPos(0);
    if (q.length > 0) startRun(q[0], 'exam', okSet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesState, hardRows, okSet, freshDevSet, startRun]);

  const handleExamFinish = useCallback(() => {
    if (examTimerInterval) { clearInterval(examTimerInterval); setExamTimerInterval(null); }
    setExamDone(true);
    setExamStarted(false);
  }, [examTimerInterval]);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (key === 'h' || key === 'р') { e.preventDefault(); handleHint(); }
      if (key === 'n' || key === 'т') { e.preventDefault(); handleSkip(); }
      if (key === 'r' || key === 'к') { e.preventDefault(); handleRestart(); }
      if (key === 'f' || key === 'а') { e.preventDefault(); setFlipped(v => !v); }
      if (key === 'enter' || key === ' ') {
        e.preventDefault();
        if (run?.phase === 'done') handleNext();
        else if (examSetup) handleExamStart();
      }
      if (key === 'escape') { e.preventDefault(); setFlipped(false); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleHint, handleSkip, handleRestart, handleNext, run, examSetup, handleExamStart]);

  // ── Derived view ───────────────────────────────────────────────────────────
  const v = run ? view(run) : null;
  const stepsData = run ? steps(run) : null;
  const movesData = run ? moveItems(run) : null;
  const lineId = currentLineId;
  const line = lineId ? getLine(lineId) : null;
  const myColor = lineId ? myColorForLine(opening.color, lineId, line?.opening_color) : 'w';

  // Orientation respects flip
  const baseOrientation: 'white' | 'black' = myColor === 'w' ? 'white' : 'black';
  const orientation: 'white' | 'black' = flipped ? (baseOrientation === 'white' ? 'black' : 'white') : baseOrientation;

  // ── Memoised heavy computations ───────────────────────────────────────────
  const labelsMyColor = opening.color !== 'both' ? (opening.color === 'white' ? 'w' : 'b') as 'w' | 'b' : null;
  const labelsArr = useMemo(
    () => lineLabels(linesState, labelsMyColor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linesState, labelsMyColor],
  );

  const lineRows: LineRow[] = useMemo(() => {
    const t = Date.now();
    return linesState.map((l, i) => ({
      id: l.id,
      index: l.index,
      label: labelsArr[i] ?? `Линия ${l.index + 1}`,
      badge: l.badge ?? null,
      line_class: l.line_class ?? null,
      prog: l.prog,
      status: lineStatus(l.prog, t),
      dueText: formatDueText(dueText(l.prog, t)),
      isFreshDev: freshDevSet.has(l.id),
    }));
  }, [linesState, labelsArr, freshDevSet]);

  const counts = useMemo(
    () => countStatuses(linesState.map(l => l.prog), Date.now()),
    [linesState],
  );
  const groups = useMemo(() => lineGroups(linesState), [linesState]);

  // ── Board arrows / rings ──────────────────────────────────────────────────
  const boardArrows = v ? v.arrows.map(a => ({
    from: a.from as Square,
    to: a.to as Square,
    color: a.role === 'played' ? '#E05050' : '#81B64C',
    style: (a.style === 'dashed' ? 'dashed' : 'solid') as 'solid' | 'dashed',
  })) : [];
  const boardRings = v ? v.rings as Partial<Record<Square, string>> : {};
  const lastMove = v?.lastMove as { from: Square; to: Square } | null | undefined;

  // ── Board top/bottom bars ──────────────────────────────────────────────────
  const oppColor = myColor === 'w' ? 'Чёрные' : 'Белые';
  const moveDesc = run && run.ply > 0 && line
    ? (() => {
        const ply = run.ply - 1;
        const m2 = line.moves[ply];
        const no = Math.floor(ply / 2) + 1;
        const san = m2?.san ?? '';
        const color = m2?.color === 'w' ? 'белых' : 'чёрных';
        return `после ${no}${m2?.color === 'w' ? '.' : '...'} ${san} · ход ${color}`;
      })()
    : 'начальная позиция';

  // ── Game note text ────────────────────────────────────────────────────────
  const gameNoteEl = (() => {
    if (!gameNoteShown || !line) return null;
    const dev = gameDevs.find(g => g.lineId === gameNoteShown.lineId && g.ply === gameNoteShown.ply);
    if (!dev) return null;
    const played = line.moves[dev.ply];
    const playedStr = played ? `${Math.floor(dev.ply / 2) + 1}... ${played.san}` : dev.played_uci;
    if (gameNoteShown.type === 'same') {
      return <GameNoteCard>Та же ошибка, что в партии с <strong>{dev.opp}</strong> {dev.date} — там ты {dev.result === 'loss' ? 'проиграл' : dev.result === 'win' ? 'выиграл' : 'сыграл вничью'}.</GameNoteCard>;
    }
    return <GameNoteCard>В партии с <strong>{dev.opp}</strong> {dev.date} ты здесь сыграл <strong>{playedStr}</strong> — теперь верно.</GameNoteCard>;
  })();

  // ── Exam timer display ────────────────────────────────────────────────────
  const examTimerStr = (() => {
    const m2 = Math.floor(examTimer / 60);
    const s2 = examTimer % 60;
    return `${m2}:${s2.toString().padStart(2, '0')}`;
  })();

  // ── Summary ───────────────────────────────────────────────────────────────
  const summaryEl = sessionDone ? (
    <div data-ui="op-summary" style={{ padding: '0 24px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { v: sessionResults.length, label: 'линии' },
          { v: sessionResults.filter(r2 => r2.perfect).length, label: 'без ошибок' },
          { v: sessionXp, label: '+XP' },
        ].map(item => (
          <div key={item.label} style={{ textAlign: 'center', padding: '10px 4px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--hairline)' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ivory)' }}>{item.v}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.label}</div>
          </div>
        ))}
      </div>
      {sessionResults.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Как прошло</div>
          {sessionResults.map((sr, i) => {
            const l2 = getLine(sr.lineId);
            const lbl = labelsArr[linesState.findIndex(l3 => l3.id === sr.lineId)] ?? sr.lineId;
            return (
              <div key={i} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--hairline)', color: 'var(--muted)' }}>
                <span style={{ color: 'var(--ivory)', fontWeight: 500 }}>{lbl}</span>
                {sr.perfect
                  ? <span style={{ color: '#81B64C' }}> — без ошибок · уровень {sr.masteryBefore} → {sr.masteryAfter} · {inDays(sr.days)}</span>
                  : <span style={{ color: '#E8A23A' }}> — с ошибкой · снова {inDays(sr.days)}</span>}
                {!l2 && null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  // ── Task text ─────────────────────────────────────────────────────────────
  const taskEl = (() => {
    if (!run || !line) return null;
    const startPly = run.startPly;
    if (mode === 'learn' && learnPhase === 'learn' && startPly > 0) {
      const knownMoves = line.moves.slice(0, startPly);
      const lastKnown = knownMoves[knownMoves.length - 1];
      if (lastKnown) {
        const no = Math.floor((startPly - 1) / 2) + 1;
        const san = lastKnown.san;
        return (
          <TaskCard>
            Начало до <strong>{no}{lastKnown.color === 'w' ? '.' : '...'} {san}</strong> ты уже знаешь — его пропускаем. Ходи по стрелке.
            <br /><span style={{ color: 'var(--muted)', fontSize: 13 }}>В конце сыграешь эту линию по памяти.</span>
          </TaskCard>
        );
      }
    }
    if (mode === 'review' && run.startPly > 0) {
      const no = Math.floor(run.startPly / 2) + (run.moves[run.startPly]?.color === 'b' ? 1 : 1);
      return (
        <TaskCard>
          Начало линии ты уже сыграл сегодня — продолжаем с {no}-го хода.
        </TaskCard>
      );
    }
    if (mode === 'review') {
      return <TaskCard>Вспомни ход из своей линии. Подсказка — H (засчитается как ошибка).</TaskCard>;
    }
    if (learnPhase === 'recall') {
      return <TaskCard>Теперь по памяти — без стрелок.</TaskCard>;
    }
    return null;
  })();

  // ── Main panel content ────────────────────────────────────────────────────
  const panelContent = (() => {
    if (examSetup) {
      const allLines = linesState.length;
      const dueLines = linesState.filter(l => lineStatus(l.prog, now) === 'due').length;
      return (
        <div data-ui="op-exam-setup" style={{ padding: '0 24px' }}>
          <TaskCard>Все линии подряд, без подсказок. Одна ошибка — линия не засчитана.</TaskCard>
          <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--muted)' }}>
            Все линии · {allLines} &nbsp;/&nbsp; К повторению · {dueLines}
          </div>
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[5, 10, 15, 20].map(m2 => (
              <button
                key={m2}
                onClick={() => setExamMinutes(m2)}
                style={{
                  height: 32, padding: '0 14px',
                  background: examMinutes === m2 ? 'var(--accent)' : 'transparent',
                  border: '1px solid var(--hairline)', color: examMinutes === m2 ? '#fff' : 'var(--muted)',
                  borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                }}
              >
                {m2} мин
              </button>
            ))}
          </div>
          <button
            data-ui="op-exam-start"
            onClick={handleExamStart}
            style={{
              height: 44, width: '100%', background: 'var(--accent)', border: 'none',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              borderRadius: 'var(--radius-btn, 6px)', fontFamily: 'inherit',
            }}
          >
            Начать экзамен
          </button>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>Enter</div>
        </div>
      );
    }

    if (examDone) {
      const perfect = examResults.filter(r2 => r2.perfect).length;
      const pct = examResults.length > 0 ? Math.round(perfect / examResults.length * 100) : 0;
      return (
        <div data-ui="op-exam-result" style={{ padding: '0 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ivory)', marginBottom: 12 }}>
            {perfect} из {examResults.length} без ошибок · {pct}% · {examTimerStr}
          </div>
          {examResults.filter(r2 => !r2.perfect).map((r2, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--muted)', padding: '3px 0' }}>
              {r2.label} — ошибка {r2.mistakeAt ? `на ${r2.mistakeAt}` : ''}
            </div>
          ))}
        </div>
      );
    }

    return (
      <>
        {v && v.feedback && (
          <FeedbackCard result={v.feedback.result} text={v.feedback.text} />
        )}
        {gameNoteEl}
        {taskEl}
        {stepsData && stepsData.items.length > 0 && (
          <StepsBar steps={stepsData.items} label={stepsData.label} />
        )}
        {movesData && movesData.length > 0 && (
          <MovesTable items={movesData} />
        )}
        {summaryEl}
      </>
    );
  })();

  // ── Actions ───────────────────────────────────────────────────────────────
  const actionsEl = (() => {
    if (examSetup || examDone) return <div />;

    if (sessionDone) {
      const newCount = linesState.filter(l => !l.prog).length;
      const dueCount = linesState.filter(l => lineStatus(l.prog, Date.now()) === 'due').length;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {newCount > 0 && (
            <PanelBtn primary onClick={() => handleModeChange('learn')} dataUi="op-next">
              Учить новые · {newCount}
            </PanelBtn>
          )}
          <PanelBtn onClick={() => handleModeChange('review')}>
            {dueCount > 0 ? `Повторять · ${dueCount}` : 'Повторять'}
          </PanelBtn>
        </div>
      );
    }

    if (!run) return <div />;
    const isDone = run.phase === 'done';

    if (examStarted) {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <PanelBtn dataUi="op-skip" onClick={() => { handleLineDone(run); advanceQueue(); }}>Пропустить линию</PanelBtn>
          <PanelBtn dataUi="op-exam-finish" onClick={handleExamFinish}>Закончить экзамен</PanelBtn>
        </div>
      );
    }

    if (isDone) {
      if (mode === 'learn' && learnPhase === 'learn') {
        return <PanelBtn primary dataUi="op-recall" onClick={handleNext}>Сыграть по памяти Enter</PanelBtn>;
      }
      return <PanelBtn primary dataUi="op-next" onClick={handleNext}>Дальше Enter</PanelBtn>;
    }

    if (mode === 'learn') {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <PanelBtn dataUi="op-watch">▶ Смотреть</PanelBtn>
          <PanelBtn dataUi="op-skip" onClick={handleSkip}>Пропустить N</PanelBtn>
          <PanelBtn dataUi="op-restart" onClick={handleRestart}>Заново R</PanelBtn>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <PanelBtn dataUi="op-hint" onClick={handleHint} disabled={!isMyTurn(run) || run.phase !== 'play'}>
          Подсказка H
        </PanelBtn>
        <PanelBtn dataUi="op-skip" onClick={handleSkip}>Пропустить N</PanelBtn>
        <PanelBtn dataUi="op-restart" onClick={handleRestart}>Заново R</PanelBtn>
      </div>
    );
  })();

  // ── Chips ─────────────────────────────────────────────────────────────────
  const modeLabels: Record<TrainerMode, string> = {
    review: 'Повторение', learn: 'Учить', exam: 'Экзамен',
    hard: 'Трудные ходы', free: 'Свободная тренировка',
  };
  const colorLabel = opening.color === 'white' ? 'Белыми' : opening.color === 'black' ? 'Чёрными' : 'За оба';
  const chips = (
    <>
      <PanelChip>{modeLabels[mode]}</PanelChip>
      <PanelChip>{colorLabel}</PanelChip>
      {run && line && line.prog && (
        <PanelChip>Уровень {line.prog.mastery}/5</PanelChip>
      )}
      {mode === 'learn' && !line?.prog && <PanelChip color="#8FB4DA">Новая линия</PanelChip>}
      {lineId && freshDevSet.has(lineId) && <PanelChip color="#E8A23A">Из партии</PanelChip>}
      {learnPhase === 'recall' && <PanelChip>По памяти</PanelChip>}
      {examStarted && (
        <span data-ui="op-timer" style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>
          {examTimerStr}
        </span>
      )}
    </>
  );

  const panelTitle = (() => {
    if (examSetup) return 'Экзамен';
    if (examDone) return 'Результат экзамена';
    if (sessionDone) {
      if (mode === 'review' || mode === 'free') return queue.length === 0 ? 'Всё повторено' : 'На сегодня всё';
      if (mode === 'learn') return 'Новые линии выучены';
      if (mode === 'hard') return 'Трудные ходы пройдены';
      return 'Итог сессии';
    }
    return v?.title ?? 'Дебюты';
  })();

  const panelAttrs: Record<string, string> = {};
  if (isDemo && rest['data-demo']) panelAttrs['data-demo'] = rest['data-demo'];

  return (
    <TrainerLayout
      session={
        <LineList
          openingName={opening.name}
          openingColor={opening.color}
          counts={{ mastered: counts.mastered, due: counts.due, new: counts.new, learning: counts.learning }}
          mode={mode}
          lines={lineRows}
          groups={groups}
          hardCount={hardRows.length}
          activeLineId={currentLineId}
          onModeChange={handleModeChange}
          onLineClick={handleLineClick}
          onAddLines={() => {}}
          onMenu={() => {}}
        />
      }
      topBar={
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {oppColor} · соперник &nbsp;
          <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{moveDesc}</span>
        </span>
      }
      board={
        <Board
          fen={v?.fen ?? (line?.moves[0] ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')}
          size={S}
          orientation={orientation}
          interactive={!!run && isMyTurn(run) && run.phase !== 'done'}
          movableColor={myColor}
          onMove={({ from, to }) => { handleMove(from as Square, to as Square); return true; }}
          lastMove={lastMove ?? undefined}
          arrows={boardArrows}
          rings={boardRings}
        />
      }
      bottomBar={
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          ты · {opening.name}
        </span>
      }
      panel={
        <TrainerPanel
          breadcrumb={`Дебюты · ${opening.name}`}
          progress={!sessionDone && !examSetup && !examDone ? { current: qPos + 1, total: queue.length } : undefined}
          xp={sessionXp > 0 ? sessionXp : undefined}
          title={panelTitle}
          chips={chips}
          actions={actionsEl}
        >
          <div style={{ padding: '12px 0' }}>
            {panelContent}
          </div>
        </TrainerPanel>
      }
      panelAttrs={panelAttrs}
    />
  );
}
