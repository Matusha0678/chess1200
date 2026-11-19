'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Square } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Board } from '@/components/board/Board';
import type { BoardArrow } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { SessionPanel } from '@/components/trainer/SessionPanel';
import { TaskPanel } from '@/components/trainer/TaskPanel';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import {
  toMoves,
  type ChessMove,
  type LessonProg,
} from '@/lib/opening-trainer';
import {
  sprintItems,
  sprintOrder,
  sprintCheck,
  rng,
  type SprintItem,
  type SprintLine,
} from '@/lib/sprint';

// ── types ─────────────────────────────────────────────────────────────────────

interface OpeningRow {
  id: string;
  name: string;
  color: 'white' | 'black' | 'both';
}

interface OpeningLineRow {
  id: string;
  opening_id: string;
  moves: ChessMove[];
}

interface LineProgressRow {
  line_id: string;
  mastery: number;
  next_review: string;
  correct_count: number;
  incorrect_count: number;
}

interface LineMoveProgRow {
  line_id: string;
  move_index: number;
  incorrect_count: number;
}

interface SprintLogRow {
  played_at: string;
  seconds: number;
  score: number;
  mistakes: number;
  positions: number;
}

interface OpeningInfo {
  id: string;
  name: string;
  lineCount: number;
}

interface LogEntry {
  san: string;
  ok: boolean;
  played?: string;
  opening: string;
  numSan: string;
}

type Phase = 'idle' | 'run' | 'end';

// ── demo data (SPRINT.md §5) ──────────────────────────────────────────────────

const DEMO_LINES: Array<{ id: string; openingId: string; openingName: string; myColor: 'w' | 'b'; sans: string }> = [
  { id: 'L1', openingId: 'demo-dragon', openingName: 'Ускоренный дракон', myColor: 'b', sans: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nxc6 bxc6 Qd4 Nf6 e5 Nd5 e6 f6' },
  { id: 'L2', openingId: 'demo-dragon', openingName: 'Ускоренный дракон', myColor: 'b', sans: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6 Be2 Nxd4 Qxd4 Bg7 Be3 O-O Qd2 Be6' },
  { id: 'L3', openingId: 'demo-dragon', openingName: 'Ускоренный дракон', myColor: 'b', sans: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 Qa5 O-O O-O Bb3 d6' },
  { id: 'L4', openingId: 'demo-dragon', openingName: 'Ускоренный дракон', myColor: 'b', sans: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Nb3 Nf6 Be2 O-O O-O d6' },
  { id: 'L5', openingId: 'demo-dragon', openingName: 'Ускоренный дракон', myColor: 'b', sans: 'e4 c5 Nf3 Nc6 Bb5 g6 Bxc6 dxc6 d3 Bg7 h3 Nf6 Nc3 O-O' },
  { id: 'L6', openingId: 'demo-dragon', openingName: 'Ускоренный дракон', myColor: 'b', sans: 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6' },
  { id: 'S1', openingId: 'demo-scotch', openingName: 'Шотландская партия', myColor: 'w', sans: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nxc6 Qf6 Qd2 dxc6 Nc3' },
  { id: 'S2', openingId: 'demo-scotch', openingName: 'Шотландская партия', myColor: 'w', sans: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4' },
];

const DEMO_OPENINGS: OpeningInfo[] = [
  { id: 'demo-dragon', name: 'Ускоренный дракон', lineCount: 6 },
  { id: 'demo-scotch', name: 'Шотландская партия', lineCount: 2 },
];

const DEMO_LOG: SprintLogRow[] = [
  { played_at: new Date(Date.now() - 86400000).toISOString(), seconds: 180, score: 27, mistakes: 1, positions: 28 },
  { played_at: new Date(Date.now() - 2 * 86400000).toISOString(), seconds: 180, score: 22, mistakes: 3, positions: 25 },
  { played_at: new Date(Date.now() - 4 * 86400000).toISOString(), seconds: 60, score: 11, mistakes: 1, positions: 12 },
];

// Fixed demo first 5 positions (SPRINT.md §5)
const DEMO_FIXED_KEYS: Array<{ lineId: string; ply: number }> = [
  { lineId: 'L2', ply: 7 },   // 4... g6
  { lineId: 'L5', ply: 5 },   // 3... g6
  { lineId: 'L3', ply: 9 },   // 5... Bg7
  { lineId: 'L6', ply: 3 },   // 2... Nf6
  { lineId: 'S2', ply: 6 },   // 4. Nxd4 (white move after 3...exd4)
];

// ── helpers ───────────────────────────────────────────────────────────────────

const plural = (n: number, a: string, b: string, c: string): string => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return a;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return b;
  return c;
};

const pointsPlural = (n: number) => plural(n, 'очко', 'очка', 'очков');
const errorsPlural = (n: number) => plural(n, 'ошибка', 'ошибки', 'ошибок');
const runsPlural = (n: number) => plural(n, 'забег', 'забега', 'забегов');

function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function moveNo(k: number): number { return Math.floor(k / 2) + 1; }

function numSanOf(item: SprintItem): string {
  const prefix = item.myColor === 'w' ? `${moveNo(item.ply)}. ` : `${moveNo(item.ply)}... `;
  return prefix + item.san;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayMs = 86400000;
  const diff = Math.floor((now.getTime() - d.getTime()) / dayMs);
  if (diff <= 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  if (diff < 7) return `${diff} ${plural(diff, 'день', 'дня', 'дней')} назад`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ── page ─────────────────────────────────────────────────────────────────────

function SprintPageInner() {
  const params = useSearchParams();
  const demo = params.get('demo') === '1';
  const { S } = useTrainerGeometry();

  // settings
  const [timeSec, setTimeSec] = useState<number>(180);
  const [selectedOpenings, setSelectedOpenings] = useState<Set<string>>(new Set());

  // data
  const [openings, setOpenings] = useState<OpeningInfo[]>([]);
  const [linesData, setLinesData] = useState<SprintLine[]>([]);
  const [lineOpening, setLineOpening] = useState<Map<string, { id: string; name: string }>>(new Map());
  const [hardKeys, setHardKeys] = useState<Set<string>>(new Set());
  const [recentLog, setRecentLog] = useState<SprintLogRow[]>([]);
  const [dbMissing, setDbMissing] = useState(false);

  // run state
  const [phase, setPhase] = useState<Phase>('idle');
  const [queue, setQueue] = useState<SprintItem[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [lockBoard, setLockBoard] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [finalMistakes, setFinalMistakes] = useState(0);

  const runTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── load settings from localStorage ──
  useEffect(() => {
    try {
      const t = localStorage.getItem('sprint-time');
      if (t) {
        const n = parseInt(t, 10);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if ([60, 180, 300].includes(n)) setTimeSec(n);
      }
      const op = localStorage.getItem('sprint-openings');
      if (op) {
        const arr = JSON.parse(op);
        if (Array.isArray(arr)) setSelectedOpenings(new Set(arr));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('sprint-time', String(timeSec)); } catch { /* ignore */ }
  }, [timeSec]);

  useEffect(() => {
    try { localStorage.setItem('sprint-openings', JSON.stringify([...selectedOpenings])); } catch { /* ignore */ }
  }, [selectedOpenings]);

  // ── load data ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (demo) {
        // demo mode: build from DEMO_LINES
        const ops = DEMO_OPENINGS;
        const lines: SprintLine[] = DEMO_LINES.map(l => {
          const moves = toMoves(l.sans);
          let prog: LessonProg | null = null;
          if (l.id === 'L1' || l.id === 'S1') prog = { mastery: 4, next_review: new Date(Date.now() + 20 * 86400000).toISOString() };
          else if (l.id === 'L2' || l.id === 'L3') prog = { mastery: 2, next_review: new Date(Date.now() - 86400000).toISOString() };
          return { id: l.id, moves, myColor: l.myColor, prog };
        });
        const lineOp = new Map<string, { id: string; name: string }>();
        for (const l of DEMO_LINES) lineOp.set(l.id, { id: l.openingId, name: l.openingName });
        setOpenings(ops);
        setLinesData(lines);
        setLineOpening(lineOp);
        setRecentLog(DEMO_LOG);
        setSelectedOpenings(prev => prev.size === 0 ? new Set(ops.map(o => o.id)) : prev);
        return;
      }

      // live: load openings + opening_lines + line_progress + line_move_progress + sprint_log
      try {
        const { data: ops, error: opErr } = await supabase
          .from('openings')
          .select('id, name, color')
          .order('created_at', { ascending: true });
        if (opErr) throw opErr;

        const openingsArr = (ops ?? []) as OpeningRow[];
        const opIds = openingsArr.map(o => o.id);

        let linesArr: OpeningLineRow[] = [];
        let progArr: LineProgressRow[] = [];
        let moveProgArr: LineMoveProgRow[] = [];
        if (opIds.length) {
          const { data: ls } = await supabase
            .from('opening_lines')
            .select('id, opening_id, moves')
            .in('opening_id', opIds);
          linesArr = (ls ?? []) as OpeningLineRow[];
          const lineIds = linesArr.map(l => l.id);
          if (lineIds.length) {
            const { data: progs } = await supabase
              .from('line_progress')
              .select('line_id, mastery, next_review, correct_count, incorrect_count')
              .in('line_id', lineIds);
            progArr = (progs ?? []) as LineProgressRow[];
            const { data: mps } = await supabase
              .from('line_move_progress')
              .select('line_id, move_index, incorrect_count')
              .in('line_id', lineIds);
            moveProgArr = (mps ?? []) as LineMoveProgRow[];
          }
        }

        const progByLine = new Map(progArr.map(p => [p.line_id, p]));
        const lineOp = new Map<string, { id: string; name: string }>();
        const opColor = new Map(openingsArr.map(o => [o.id, o.color] as const));
        const opCounts = new Map<string, number>();

        const sessionRandom = Math.random() < 0.5 ? 'w' : 'b';
        const linesOut: SprintLine[] = [];
        for (const l of linesArr) {
          const op = openingsArr.find(o => o.id === l.opening_id);
          if (!op) continue;
          const color = opColor.get(op.id) || 'white';
          const myColor: 'w' | 'b' = color === 'white' ? 'w' : color === 'black' ? 'b' : (sessionRandom as 'w' | 'b');
          lineOp.set(l.id, { id: op.id, name: op.name });
          opCounts.set(op.id, (opCounts.get(op.id) ?? 0) + 1);
          const prog = progByLine.get(l.id) ?? null;
          linesOut.push({ id: l.id, moves: l.moves, myColor, prog });
        }
        const openingsInfo: OpeningInfo[] = openingsArr.map(o => ({ id: o.id, name: o.name, lineCount: opCounts.get(o.id) ?? 0 }));

        const hard = new Set<string>();
        for (const mp of moveProgArr) {
          if (mp.incorrect_count > 0) hard.add(`${mp.line_id}:${mp.move_index}`);
        }

        // sprint_log
        let logRows: SprintLogRow[] = [];
        try {
          const { data: lg, error: lgErr } = await supabase
            .from('sprint_log')
            .select('played_at, seconds, score, mistakes, positions')
            .order('played_at', { ascending: false })
            .limit(6);
          if (lgErr && (lgErr.code === '42P01' || /does not exist/i.test(lgErr.message))) {
            setDbMissing(true);
          }
          logRows = (lg ?? []) as SprintLogRow[];
        } catch { /* ignore */ }

        if (cancelled) return;
        setOpenings(openingsInfo);
        setLinesData(linesOut);
        setLineOpening(lineOp);
        setHardKeys(hard);
        setRecentLog(logRows);
        setSelectedOpenings(prev => prev.size === 0 ? new Set(openingsInfo.map(o => o.id)) : prev);
      } catch {
        if (!cancelled) setDbMissing(true);
      }
    })();
    return () => { cancelled = true; };
  }, [demo]);

  // ── items derived ──
  const activeLines = useMemo(
    () => linesData.filter(L => {
      const op = lineOpening.get(L.id);
      return op ? selectedOpenings.has(op.id) : false;
    }),
    [linesData, lineOpening, selectedOpenings],
  );

  const [nowMs, setNowMs] = useState<number>(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, []);

  const itemsPool = useMemo(
    () => sprintItems(activeLines, nowMs || 0, hardKeys),
    [activeLines, hardKeys, nowMs],
  );

  // ── timer effect ──
  useEffect(() => {
    if (phase !== 'run') return;
    runTimerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) return 0;
        return t - 1;
      });
    }, 1000);
    return () => { if (runTimerRef.current) clearInterval(runTimerRef.current); };
  }, [phase]);

  const endRun = useCallback(async (finScore: number, finMistakes: number, finPositions: number) => {
    if (runTimerRef.current) clearInterval(runTimerRef.current);
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    setFinalScore(finScore);
    setFinalMistakes(finMistakes);
    setPhase('end');
    if (!demo && !dbMissing) {
      try {
        await supabase.from('sprint_log').insert({
          seconds: timeSec,
          score: finScore,
          mistakes: finMistakes,
          positions: finPositions,
        });
        // refresh log
        const { data: lg } = await supabase
          .from('sprint_log')
          .select('played_at, seconds, score, mistakes, positions')
          .order('played_at', { ascending: false })
          .limit(6);
        setRecentLog((lg ?? []) as SprintLogRow[]);
      } catch { /* ignore */ }
    }
  }, [demo, dbMissing, timeSec]);

  // end when time runs out
  useEffect(() => {
    if (phase === 'run' && timeLeft === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      endRun(score, 3 - lives, queueIdx);
    }
  }, [phase, timeLeft, score, lives, queueIdx, endRun]);

  // ── record mistake to line_move_progress ──
  const recordMistake = useCallback(async (lineId: string, moveIndex: number) => {
    if (demo || dbMissing) return;
    try {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from('line_move_progress')
        .select('id, incorrect_count')
        .eq('line_id', lineId)
        .eq('move_index', moveIndex)
        .maybeSingle();
      if (data) {
        const row = data as { id: string; incorrect_count: number };
        await supabase
          .from('line_move_progress')
          .update({ incorrect_count: row.incorrect_count + 1, last_missed_at: now })
          .eq('id', row.id);
      } else {
        await supabase
          .from('line_move_progress')
          .insert({ line_id: lineId, move_index: moveIndex, incorrect_count: 1, last_missed_at: now });
      }
    } catch { /* ignore */ }
  }, [demo, dbMissing]);

  // ── build queue on start ──
  const buildQueue = useCallback((): SprintItem[] => {
    const pool = itemsPool;
    if (!pool.length) return [];
    if (demo) {
      // SPRINT.md §5: first 5 are fixed, then sprintOrder with rng(1)
      const byKey = new Map<string, SprintItem>();
      for (const it of pool) byKey.set(`${it.lineId}:${it.ply}`, it);
      const fixed: SprintItem[] = [];
      for (const k of DEMO_FIXED_KEYS) {
        const it = byKey.get(`${k.lineId}:${k.ply}`);
        if (it) fixed.push(it);
      }
      const rest = pool.filter(it => !DEMO_FIXED_KEYS.some(k => k.lineId === it.lineId && k.ply === it.ply));
      const extra = sprintOrder(rest, rng(1));
      return [...fixed, ...extra];
    }
    return sprintOrder(pool);
  }, [itemsPool, demo]);

  const startRun = useCallback(() => {
    const q = buildQueue();
    if (!q.length) return;
    setQueue(q);
    setQueueIdx(0);
    setScore(0);
    setStreak(0);
    setLives(3);
    setLog([]);
    setArrows([]);
    setLockBoard(false);
    setTimeLeft(timeSec);
    setPhase('run');
  }, [buildQueue, timeSec]);

  // ── advance to next or end ──
  const advanceIdx = useCallback((newIdx: number, newLives: number, newScore: number) => {
    if (newLives <= 0) {
      endRun(newScore, 3 - newLives, newIdx);
      return;
    }
    if (newIdx >= queue.length) {
      // queue done — reshuffle
      const q = sprintOrder(itemsPool, demo ? rng(1 + newIdx) : Math.random);
      setQueue(q);
      setQueueIdx(0);
    } else {
      setQueueIdx(newIdx);
    }
  }, [queue.length, itemsPool, demo, endRun]);

  const currentItem = queue[queueIdx] ?? null;

  const handleMove = useCallback((m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }): boolean => {
    if (phase !== 'run' || !currentItem || lockBoard) return false;
    const ok = sprintCheck(currentItem, m.from, m.to);
    const openingName = lineOpening.get(currentItem.lineId)?.name ?? '';
    if (ok) {
      const newScore = score + 1;
      const newStreak = streak + 1;
      const newLog: LogEntry = {
        san: currentItem.san,
        ok: true,
        opening: openingName,
        numSan: numSanOf(currentItem),
      };
      setScore(newScore);
      setStreak(newStreak);
      setLog(prev => [newLog, ...prev].slice(0, 5));
      setLockBoard(true);
      nextTimerRef.current = setTimeout(() => {
        setLockBoard(false);
        setArrows([]);
        advanceIdx(queueIdx + 1, lives, newScore);
      }, 150);
      return false; // we don't actually apply, just advance
    }
    // wrong move
    const newLives = lives - 1;
    const played = m.from + m.to;
    const newLog: LogEntry = {
      san: currentItem.san,
      ok: false,
      played,
      opening: openingName,
      numSan: numSanOf(currentItem),
    };
    const arr: BoardArrow[] = [
      { from: m.from, to: m.to, color: '#C2453A', role: 'played' },
      { from: currentItem.from as Square, to: currentItem.to as Square, color: '#5E8C35', style: 'dashed', role: 'best' },
    ];
    setLives(newLives);
    setStreak(0);
    setArrows(arr);
    setLog(prev => [newLog, ...prev].slice(0, 5));
    setLockBoard(true);
    recordMistake(currentItem.lineId, currentItem.ply);
    nextTimerRef.current = setTimeout(() => {
      setLockBoard(false);
      setArrows([]);
      advanceIdx(queueIdx + 1, newLives, score);
    }, 900);
    return false;
  }, [phase, currentItem, lockBoard, score, streak, lives, queueIdx, lineOpening, recordMistake, advanceIdx]);

  // ── key shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (phase === 'idle') { e.preventDefault(); startRun(); }
        else if (phase === 'end') { e.preventDefault(); startRun(); }
      } else if (e.key === 'Escape') {
        if (phase === 'run') { e.preventDefault(); endRun(score, 3 - lives, queueIdx); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, startRun, endRun, score, lives, queueIdx]);

  // ── stats ──
  const record = useMemo(() => {
    const matching = recentLog.filter(l => l.seconds === timeSec);
    return matching.reduce((m, l) => Math.max(m, l.score), 0);
  }, [recentLog, timeSec]);

  const totalRuns = recentLog.length;
  const totalCorrect = recentLog.reduce((s, l) => s + l.score, 0);
  const totalAnswers = recentLog.reduce((s, l) => s + l.positions, 0);
  const accuracy = totalAnswers ? Math.round(100 * totalCorrect / totalAnswers) : (demo ? 88 : 0);

  // ── UI ──
  const myColor = currentItem ? currentItem.myColor : 'w';
  const fen = currentItem?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const openingName = currentItem ? (lineOpening.get(currentItem.lineId)?.name ?? '') : '';

  // compute last-move from the previous half-move (ply - 1) for highlighting
  const lastMove: { from: Square; to: Square } | null = useMemo(() => {
    if (!currentItem) return null;
    const L = linesData.find(l => l.id === currentItem.lineId);
    if (!L || currentItem.ply < 1) return null;
    const prev = L.moves[currentItem.ply - 1];
    return { from: prev.from as Square, to: prev.to as Square };
  }, [currentItem, linesData]);

  // session panel content
  const sessionStats = [
    { value: record, label: 'рекорд', color: '#81B64C' },
    { value: totalRuns, label: runsPlural(totalRuns), color: 'var(--ivory)' },
    { value: accuracy, label: 'точность %', color: 'var(--ivory)' },
  ];

  const isNarrowFooter = S < 500;
  void isNarrowFooter;

  const timeControls = (
    <div data-ui="sprint-time" style={{ display: 'flex', gap: 6 }}>
      {[60, 180, 300].map(t => (
        <button
          key={t}
          onClick={() => setTimeSec(t)}
          disabled={phase === 'run'}
          style={{
            flex: 1, height: 32,
            borderRadius: 8,
            border: '1px solid var(--hairline)',
            background: t === timeSec ? 'rgba(129,182,76,.15)' : 'transparent',
            color: t === timeSec ? '#81B64C' : 'var(--ivory)',
            cursor: phase === 'run' ? 'not-allowed' : 'pointer',
            fontSize: 13,
          }}
        >
          {t === 60 ? '1 мин' : t === 180 ? '3 мин' : '5 мин'}
        </button>
      ))}
    </div>
  );

  const openingsList = (
    <div data-ui="sprint-openings" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 10px' }}>
      {openings.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '10px 10px' }}>
          Добавь дебюты — появятся позиции для спринта.
        </div>
      )}
      {openings.map(o => {
        const active = selectedOpenings.has(o.id);
        return (
          <label key={o.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 10px', gap: 8, borderRadius: 8,
            background: active ? 'rgba(129,182,76,.08)' : 'transparent',
            cursor: 'pointer', userSelect: 'none',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={active}
                onChange={() => {
                  setSelectedOpenings(prev => {
                    const next = new Set(prev);
                    if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                    return next;
                  });
                }}
                disabled={phase === 'run'}
                style={{ accentColor: '#81B64C' }}
              />
              <span style={{ fontSize: 13, color: 'var(--ivory)' }}>{o.name}</span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{o.lineCount}</span>
          </label>
        );
      })}
    </div>
  );

  const runsList = (
    <div data-ui="session-list" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 10px' }}>
      {recentLog.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 10px' }}>Пока нет забегов</div>
      )}
      {recentLog.slice(0, 5).map((r, i) => {
        const timeStr = r.seconds === 60 ? '1 мин' : r.seconds === 180 ? '3 мин' : '5 мин';
        const isRec = r.score === record && record > 0;
        return (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 10px', borderRadius: 8,
            background: 'transparent', fontSize: 13,
          }}>
            <span style={{ color: 'var(--muted)' }}>
              {dayLabel(r.played_at)} · {timeStr}
            </span>
            <span style={{ color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
              {r.score} {isRec && <span style={{ color: '#81B64C' }}>★</span>}
            </span>
          </div>
        );
      })}
    </div>
  );

  const session = (
    <SessionPanel
      title="Дебютный спринт"
      stats={sessionStats}
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Время</div>
          {timeControls}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Дебюты</div>
          {openingsList}
        </div>
      }
      listLabel="Последние забеги"
      list={runsList}
    />
  );

  // Right panel
  const chipStyle: React.CSSProperties = {
    fontSize: 12, padding: '4px 10px', borderRadius: 999,
    border: '1px solid var(--hairline)', color: 'var(--muted)', background: 'var(--surface)',
  };

  let panelBody: React.ReactNode;
  let panelTitle = 'Дебютный спринт';
  let panelActions: React.ReactNode = null;
  let panelProgress: { current: number; total: number } | undefined;
  let panelChips: React.ReactNode = null;
  const breadcrumb = phase === 'run' ? 'Тренироваться · Дебютный спринт' : 'Тренироваться · Спринт';

  if (phase === 'idle') {
    panelActions = (
      <button
        data-ui="sprint-start"
        onClick={startRun}
        disabled={itemsPool.length === 0}
        style={{
          height: 44, border: 'none', borderRadius: 'var(--radius-btn)',
          background: '#81B64C', color: '#fff', fontSize: 15, fontWeight: 600,
          cursor: itemsPool.length ? 'pointer' : 'not-allowed', opacity: itemsPool.length ? 1 : .5,
        }}
      >
        Старт <span style={{ opacity: .8, marginLeft: 8, fontSize: 12 }}>Enter</span>
      </button>
    );
    panelBody = (
      <div style={{ padding: '14px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 15, color: 'var(--ivory)', lineHeight: 1.5 }}>
          Позиции из твоих линий, ход — твой. Ошибка — минус жизнь, три ошибки — конец забега.
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
          Позиций: {itemsPool.length} из {[...selectedOpenings].length} {plural([...selectedOpenings].length, 'дебюта', 'дебютов', 'дебютов')}
        </div>
        {dbMissing && (
          <div data-ui="db-missing" style={{ fontSize: 13, color: 'var(--muted)', padding: 10, background: 'rgba(255,255,255,.03)', borderRadius: 8, border: '1px solid var(--hairline)' }}>
            Прогресс не сохраняется: выполни supabase/34-pages2.sql
          </div>
        )}
      </div>
    );
  } else if (phase === 'run') {
    panelTitle = formatTime(timeLeft);
    panelChips = (
      <>
        {openingName && <span style={chipStyle}>{openingName}</span>}
        <span style={chipStyle}>ход {myColor === 'w' ? 'белых' : 'чёрных'}</span>
        <span style={chipStyle}>твой ход из линии</span>
      </>
    );
    panelActions = (
      <button
        data-ui="sprint-stop"
        onClick={() => endRun(score, 3 - lives, queueIdx)}
        style={{
          height: 42, border: '1px solid var(--hairline)', background: 'transparent',
          color: 'var(--ivory)', borderRadius: 'var(--radius-btn)', fontSize: 14, cursor: 'pointer',
        }}
      >
        Стоп <span style={{ opacity: .6, marginLeft: 8, fontSize: 12 }}>Esc</span>
      </button>
    );

    const cellStyle: React.CSSProperties = {
      padding: '12px 10px', textAlign: 'center',
      border: '1px solid var(--hairline)', borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 4,
    };

    panelBody = (
      <div style={{ padding: '10px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div data-ui="sprint-timer" style={{ fontSize: 56, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ivory)', lineHeight: 1, letterSpacing: '-0.02em' }}>
          {formatTime(timeLeft)}
        </div>
        <div data-ui="sprint-score" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div style={cellStyle}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{score}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pointsPlural(score)}</span>
          </div>
          <div style={cellStyle}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{streak}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>серия</span>
          </div>
          <div style={cellStyle} data-ui="sprint-lives">
            <span style={{ fontSize: 18 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ color: i < lives ? '#C2453A' : 'var(--hairline)', marginRight: 2 }}>♥</span>
              ))}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{lives} из 3</span>
          </div>
        </div>
        <div data-ui="sprint-log" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          {log.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Ходы появятся здесь</div>}
          {log.map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>
                <span style={{ color: e.ok ? '#81B64C' : '#C2453A', marginRight: 8 }}>{e.ok ? '✓' : '✗'}</span>
                <span style={{ color: 'var(--ivory)' }}>{e.numSan}</span>
                {!e.ok && e.played && (
                  <span style={{ color: 'var(--muted)', marginLeft: 8 }}>· ты сыграл {e.played}</span>
                )}
              </span>
              <span style={{ color: 'var(--muted)' }}>{e.opening}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          Ошибка — минус жизнь · три ошибки — конец забега
        </div>
      </div>
    );
    panelProgress = { current: queueIdx, total: queue.length };
  } else {
    // end
    panelTitle = 'Забег окончен';
    const isNewRecord = finalScore > record && !demo;
    const needed = Math.max(0, record - finalScore);
    panelActions = (
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          data-ui="sprint-again"
          onClick={startRun}
          style={{
            flex: 1, height: 44, border: 'none', borderRadius: 'var(--radius-btn)',
            background: '#81B64C', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Ещё раз
        </button>
        <Link
          href="/openings"
          style={{
            flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--hairline)', color: 'var(--ivory)', background: 'transparent',
            borderRadius: 'var(--radius-btn)', fontSize: 14, textDecoration: 'none',
          }}
        >
          К дебютам
        </Link>
      </div>
    );
    const cellStyle: React.CSSProperties = {
      padding: '14px 10px', textAlign: 'center',
      border: '1px solid var(--hairline)', borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 4,
    };
    panelBody = (
      <div data-ui="sprint-result" style={{ padding: '14px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div style={cellStyle}>
            <span style={{ fontSize: 26, fontWeight: 700 }}>{finalScore}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pointsPlural(finalScore)}</span>
          </div>
          <div style={cellStyle}>
            <span style={{ fontSize: 26, fontWeight: 700 }}>{finalMistakes}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{errorsPlural(finalMistakes)}</span>
          </div>
          <div style={cellStyle}>
            <span style={{ fontSize: 26, fontWeight: 700, color: isNewRecord ? '#81B64C' : 'var(--ivory)' }}>{Math.max(record, finalScore)}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>рекорд</span>
          </div>
        </div>
        {isNewRecord && (
          <div style={{ fontSize: 14, color: '#81B64C', fontWeight: 600 }}>Новый рекорд!</div>
        )}
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
          {needed > 0
            ? `До рекорда не хватило ${needed} ${pointsPlural(needed)}. Ошибки попали в «Трудные ходы» тренажёра.`
            : 'Ошибки попали в «Трудные ходы» тренажёра.'}
        </div>
        <div data-ui="sprint-log" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {log.filter(e => !e.ok).length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Без ошибок</div>}
          {log.filter(e => !e.ok).map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>
                <span style={{ color: '#C2453A', marginRight: 8 }}>✗</span>
                <span style={{ color: 'var(--ivory)' }}>{e.numSan}</span>
                {e.played && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>· {e.played}</span>}
              </span>
              <span style={{ color: 'var(--muted)' }}>{e.opening}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <TrainerLayout
      session={session}
      panelAttrs={demo ? { 'data-demo': 'sprint' } : undefined}
      topBar={null}
      bottomBar={null}
      board={
        <Board
          fen={fen}
          orientation={myColor === 'w' ? 'white' : 'black'}
          movableColor={phase === 'run' ? myColor : undefined}
          size={S}
          interactive={phase === 'run' && !lockBoard}
          onMove={phase === 'run' ? handleMove : undefined}
          lastMove={lastMove}
          arrows={arrows}
        />
      }
      panel={
        <TaskPanel
          breadcrumb={breadcrumb}
          progress={panelProgress}
          title={panelTitle}
          chips={panelChips}
          actions={panelActions}
        >
          {panelBody}
        </TaskPanel>
      }
    />
  );
}

export default function SprintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--muted)' }}>Загрузка…</div>}>
      <SprintPageInner />
    </Suspense>
  );
}
