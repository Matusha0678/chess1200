'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Square } from 'chess.js';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Board } from '@/components/board/Board';
import type { BoardArrow } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { SessionPanel } from '@/components/trainer/SessionPanel';
import { TaskPanel } from '@/components/trainer/TaskPanel';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { useStockfish } from '@/hooks/useStockfish';
import {
  toMoves,
  type ChessMove,
} from '@/lib/opening-trainer';
import {
  endPositions,
  moveStats,
  ideaVerdict,
  type EndPosition,
  type MoveStat,
  type ExplorerStats,
  type IdeaLine,
} from '@/lib/ideas';

// ── types ────────────────────────────────────────────────────────────────────

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

interface IdeaProgressRow { idea_key: string; mastery: number; next_review: string; }
interface ExplorerTopGame { id: string; white?: { name: string; rating: number }; black?: { name: string; rating: number }; year?: number; winner?: 'white' | 'black' | null; }

type Mode = 'study' | 'quiz';

// ── demo data (IDEAS.md §5) ──────────────────────────────────────────────────

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

// For L2 end-position (after 10... Be6), demo stats per IDEAS.md §5
const DEMO_STATS_AFTER_BE6: ExplorerStats = {
  moves: [
    { san: 'O-O', uci: 'e1g1', white: 30, draws: 40, black: 20 },
    { san: 'f3', uci: 'f2f3', white: 12, draws: 15, black: 8 },
    { san: 'Rc1', uci: 'a1c1', white: 10, draws: 12, black: 9 },
    { san: 'b3', uci: 'b2b3', white: 2, draws: 3, black: 4 },
  ],
};
const DEMO_STATS_AFTER_OO: ExplorerStats = {
  moves: [
    { san: 'Qa5', uci: 'd8a5', white: 16, draws: 24, black: 12 },
    { san: 'a5', uci: 'a7a5', white: 13, draws: 16, black: 9 },
    { san: 'Rc8', uci: 'f8c8', white: 8, draws: 9, black: 5 },
    { san: 'a6', uci: 'a7a6', white: 6, draws: 5, black: 3 },
  ],
};

const DEMO_PLAN = ['a5', 'f4', 'a4', 'Bd4', 'Qa5', 'Rad1'];

const DEMO_TOP_GAMES = [
  { id: 'demo-1', whiteName: 'Игрок A', whiteRating: 2654, blackName: 'Игрок B', blackRating: 2701, year: 2019, winner: 'black' as const },
  { id: 'demo-2', whiteName: 'Игрок C', whiteRating: 2601, blackName: 'Игрок D', blackRating: 2648, year: 2017, winner: 'white' as const },
  { id: 'demo-3', whiteName: 'Игрок E', whiteRating: 2580, blackName: 'Игрок F', blackRating: 2620, year: 2015, winner: null },
];

// ── helpers ──────────────────────────────────────────────────────────────────

const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

// ── page ─────────────────────────────────────────────────────────────────────

function PlansPageInner() {
  const params = useSearchParams();
  const demo = params.get('demo') === '1';
  const { S } = useTrainerGeometry();
  const { getMultiPV, isReady: sfReady } = useStockfish();

  const [lines, setLines] = useState<IdeaLine[]>([]);
  const [openingNames, setOpeningNames] = useState<Map<string, string>>(new Map());
  const [idProgress, setIdProgress] = useState<Record<string, IdeaProgressRow>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('study');
  const [statsCache, setStatsCache] = useState<Record<string, ExplorerStats | 'no_token' | 'loading'>>({});
  const [topGames, setTopGames] = useState<Record<string, ExplorerTopGame[]>>({});
  const [enginePlan, setEnginePlan] = useState<Record<string, string[]>>({});
  const [quizFeedback, setQuizFeedback] = useState<{ ok: boolean; text: string; played?: string } | null>(null);
  const [quizArrows, setQuizArrows] = useState<BoardArrow[]>([]);
  const [dbMissing, setDbMissing] = useState(false);
  const [noToken, setNoToken] = useState(false);

  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  // ── Load data ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (demo) {
        const dl: IdeaLine[] = DEMO_LINES.map(l => ({
          id: l.id, moves: toMoves(l.sans), myColor: l.myColor, openingId: l.openingId,
        }));
        const names = new Map<string, string>();
        for (const l of DEMO_LINES) names.set(l.openingId, l.openingName);
        setLines(dl);
        setOpeningNames(names);
        setIdProgress({});
        const dl2 = dl.find(l => l.id === 'L2');
        if (dl2) {
          const ends = endPositions([dl2]);
          if (ends[0]) setActiveKey(ends[0].key);
        }
        return;
      }
      try {
        const { data: ops, error: opErr } = await supabase
          .from('openings').select('id, name, color').order('created_at', { ascending: true });
        if (opErr) throw opErr;
        const opening = (ops ?? []) as OpeningRow[];
        const opIds = opening.map(o => o.id);
        let linesArr: OpeningLineRow[] = [];
        if (opIds.length) {
          const { data: ls } = await supabase
            .from('opening_lines').select('id, opening_id, moves').in('opening_id', opIds);
          linesArr = (ls ?? []) as OpeningLineRow[];
        }
        const names = new Map(opening.map(o => [o.id, o.name]));
        const colorByOp = new Map(opening.map(o => [o.id, o.color]));
        const sessionRand = Math.random() < 0.5 ? 'w' : 'b';

        const out: IdeaLine[] = linesArr.map(l => {
          const c = colorByOp.get(l.opening_id) ?? 'white';
          const myColor: 'w' | 'b' = c === 'white' ? 'w' : c === 'black' ? 'b' : (sessionRand as 'w' | 'b');
          return { id: l.id, moves: l.moves, myColor, openingId: l.opening_id };
        });
        if (cancelled) return;
        setLines(out);
        setOpeningNames(names);

        try {
          const { data: pg, error: pgErr } = await supabase
            .from('idea_progress').select('idea_key, mastery, next_review');
          if (pgErr && (pgErr.code === '42P01' || /does not exist/i.test(pgErr.message))) {
            setDbMissing(true);
          }
          const map: Record<string, IdeaProgressRow> = {};
          for (const r of (pg ?? []) as IdeaProgressRow[]) map[r.idea_key] = r;
          setIdProgress(map);
        } catch { /* ignore */ }
      } catch {
        setDbMissing(true);
      }
    })();
    return () => { cancelled = true; };
  }, [demo]);

  // ── End positions ──
  const ends = useMemo<EndPosition[]>(() => endPositions(lines), [lines]);

  const activeEnd = useMemo(() => ends.find(e => e.key === activeKey) ?? null, [ends, activeKey]);

  // ── Fetch explorer stats for active end ──
  const fetchExplorerFor = useCallback(async (fen: string) => {
    const key = posKey(fen);
    if (demo) {
      setStatsCache(prev => prev[key] ? prev : ({ ...prev, [key]: DEMO_STATS_AFTER_BE6 }));
      return;
    }
    setStatsCache(prev => {
      if (prev[key]) return prev;
      return { ...prev, [key]: 'loading' };
    });
    try {
      const res = await fetch(`/api/lichess/explorer?db=masters&fen=${encodeURIComponent(fen)}`);
      if (res.status === 503) {
        setNoToken(true);
        setStatsCache(prev => ({ ...prev, [key]: 'no_token' }));
        return;
      }
      if (!res.ok) {
        setStatsCache(prev => ({ ...prev, [key]: { moves: [] } as ExplorerStats }));
        return;
      }
      const data = await res.json() as { total?: number; moves: Array<{ san: string; uci: string; white: number; draws: number; black: number }>; topGames?: ExplorerTopGame[] };
      setStatsCache(prev => ({ ...prev, [key]: { moves: data.moves ?? [] } }));
      if (data.topGames) setTopGames(prev => ({ ...prev, [key]: data.topGames! }));
    } catch {
      setStatsCache(prev => ({ ...prev, [key]: { moves: [] } as ExplorerStats }));
    }
  }, [demo]);

  useEffect(() => {
    if (!activeEnd) return;
    void fetchExplorerFor(activeEnd.fen);
  }, [activeEnd, fetchExplorerFor]);

  // ── Engine plan (top UCI move only, so we capture SAN) ──
  useEffect(() => {
    if (!activeEnd) return;
    if (demo) {
      setEnginePlan(prev => (prev[activeEnd.key] ? prev : ({ ...prev, [activeEnd.key]: DEMO_PLAN })));
      return;
    }
    if (!sfReady) return;
    if (enginePlan[activeEnd.key]) return;
    getMultiPV(activeEnd.fen, 14, 1, (pvs) => {
      if (!pvs || !pvs[0]) return;
      const chess = new Chess(activeEnd.fen);
      try {
        const uci = pvs[0].move;
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const prom = uci.length > 4 ? uci[4] : undefined;
        const m = chess.move({ from, to, promotion: (prom ?? 'q') as 'q' | 'r' | 'b' | 'n' });
        if (m) setEnginePlan(prev => ({ ...prev, [activeEnd.key]: [m.san] }));
      } catch { /* ignore */ }
    });
  }, [activeEnd, sfReady, getMultiPV, enginePlan, demo]);

  // ── Quiz move handler ──
  const handleQuizMove = useCallback((m: { from: Square; to: Square }): boolean => {
    if (!activeEnd) return false;
    // We quiz against the stats of the position currently on the board (which may be
    // the opponent reply position). The caller recomputes displayFen before this is used.
    const displayFen = (() => {
      const c = new Chess(activeEnd.fen);
      const sideToMove = c.turn();
      const isOppToMove = sideToMove !== activeEnd.myColor;
      if (!isOppToMove) return activeEnd.fen;
      const stats = statsCache[posKey(activeEnd.fen)];
      if (!stats || stats === 'loading' || stats === 'no_token' || !stats.moves.length) return activeEnd.fen;
      const top = moveStats(stats)[0];
      try {
        c.move({ from: top.uci.slice(0, 2), to: top.uci.slice(2, 4), promotion: 'q' });
        return c.fen();
      } catch { return activeEnd.fen; }
    })();
    const chess = new Chess(displayFen);
    let san: string;
    try {
      const mv = chess.move({ from: m.from, to: m.to, promotion: 'q' });
      san = mv.san;
    } catch {
      return false;
    }
    const stats = statsCache[posKey(displayFen)];
    if (!stats || stats === 'loading' || stats === 'no_token') return false;
    const v = ideaVerdict(stats, san);
    if (v.ok) {
      setQuizFeedback({ ok: true, text: `Так играют ${Math.round(v.share * 100)}% мастеров (${v.games} партий).` });
      setQuizArrows([]);
    } else {
      const top = v.top[0];
      if (top) {
        const chess2 = new Chess(displayFen);
        let bestFrom = '', bestTo = '';
        try {
          const mv = chess2.move({ from: top.uci.slice(0, 2), to: top.uci.slice(2, 4), promotion: 'q' });
          bestFrom = mv.from; bestTo = mv.to;
        } catch { /* ignore */ }
        setQuizArrows([
          { from: m.from, to: m.to, color: '#C2453A', role: 'played' },
          { from: bestFrom as Square, to: bestTo as Square, color: 'var(--accent-press)', style: 'dashed', role: 'best' },
        ]);
      }
      const topList = v.top.map(t => `${t.san} (${Math.round(t.share * 100)}%)`).join(', ');
      setQuizFeedback({ ok: false, text: `${san} мастера почти не играли. Чаще всего: ${topList}.`, played: san });
    }
    return false;
  }, [activeEnd, statsCache]);

  // ── UI ──
  const grouped = useMemo(() => {
    const map = new Map<string, EndPosition[]>();
    for (const e of ends) {
      if (!map.has(e.openingId)) map.set(e.openingId, []);
      map.get(e.openingId)!.push(e);
    }
    return map;
  }, [ends]);

  const statusOf = useCallback((key: string): 'new' | 'due' | 'mastered' | 'learning' => {
    const p = idProgress[`pos:${key}`] ?? null;
    if (!p) return 'new';
    if (Date.parse(p.next_review) <= nowMs) return 'due';
    return p.mastery >= 4 ? 'mastered' : 'learning';
  }, [idProgress, nowMs]);

  const counts = useMemo(() => {
    let mastered = 0, due = 0, fresh = 0;
    for (const e of ends) {
      const s = statusOf(e.key);
      if (s === 'mastered') mastered++;
      else if (s === 'due') due++;
      else if (s === 'new') fresh++;
    }
    if (demo) { mastered = 2; due = 2; fresh = 4; }
    return { mastered, due, fresh };
  }, [ends, statusOf, demo]);

  const sessionStats = [
    { value: counts.mastered, label: 'изучено', color: 'var(--accent)' },
    { value: counts.due, label: 'повторить', color: '#C98424' },
    { value: counts.fresh, label: 'новых', color: 'var(--ivory)' },
  ];

  const modeControls = (
    <div data-ui="idea-modes" style={{ display: 'flex', gap: 6 }}>
      {(['study', 'quiz'] as const).map(m => (
        <button
          key={m}
          onClick={() => {
            setMode(m);
            setQuizFeedback(null);
            setQuizArrows([]);
          }}
          style={{
            flex: 1, height: 30, borderRadius: 8,
            border: '1px solid var(--hairline)',
            background: m === mode ? 'rgba(129,182,76,.15)' : 'transparent',
            color: m === mode ? 'var(--accent)' : 'var(--ivory)',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          {m === 'study' ? 'Изучать' : 'Проверь себя'}
        </button>
      ))}
    </div>
  );

  const list = (
    <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {ends.length === 0 && (
        <div data-ui="idea-empty" style={{ fontSize: 13, color: 'var(--muted)', padding: 10 }}>
          Добавь дебюты — появятся позиции.
        </div>
      )}
      {[...grouped.entries()].map(([openingId, group]) => (
        <div key={openingId}>
          <div style={{ fontSize: 11, color: 'var(--muted)', padding: '10px 10px 2px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {openingNames.get(openingId) ?? '—'} · {group.length}
          </div>
          {group.map(e => {
            const st = statusOf(e.key);
            const dotColor = st === 'mastered' ? 'var(--accent)' : st === 'due' ? '#C98424' : '#3A78C2';
            return (
              <div
                key={e.key}
                data-ui="idea-row"
                data-pos={e.key}
                data-status={st}
                onClick={() => {
                  setActiveKey(e.key);
                  setQuizFeedback(null);
                  setQuizArrows([]);
                }}
                style={{
                  padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                  background: e.key === activeKey ? 'rgba(129,182,76,.10)' : 'transparent',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--ivory)' }}>После {e.last}</span>
                <span style={{ color: dotColor, fontSize: 12 }}>●</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const session = (
    <SessionPanel
      title={`Идеи позиций · ${ends.length}`}
      stats={sessionStats}
      controls={modeControls}
      listLabel="Где кончаются твои линии"
      list={list}
    />
  );

  // ── Right panel ──
  let panelTitle = 'Идеи позиций';
  let panelChips: React.ReactNode = null;
  let panelBody: React.ReactNode = null;
  let panelActions: React.ReactNode = null;
  let fenToShow = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let orientationColor: 'white' | 'black' = 'white';
  let movesTable: MoveStat[] = [];
  let showArrows: BoardArrow[] = [];
  let boardOnMove: ((m: { from: Square; to: Square }) => boolean) | undefined;
  let boardInteractive = false;
  let boardMovable: 'w' | 'b' | undefined;

  if (activeEnd) {
    const myColor = activeEnd.myColor;
    orientationColor = myColor === 'w' ? 'white' : 'black';
    let displayFen = activeEnd.fen;
    const chess = new Chess(activeEnd.fen);
    const sideToMove = chess.turn() as 'w' | 'b';
    const isOppToMove = sideToMove !== myColor;
    const stats = statsCache[posKey(activeEnd.fen)];
    let replySan: string | null = null;
    let replyShare = 0;
    if (isOppToMove && stats && stats !== 'loading' && stats !== 'no_token' && stats.moves.length > 0) {
      const top = moveStats(stats)[0];
      if (top) {
        const c2 = new Chess(activeEnd.fen);
        try {
          c2.move({ from: top.uci.slice(0, 2), to: top.uci.slice(2, 4), promotion: 'q' });
          displayFen = c2.fen();
          replySan = top.san;
          replyShare = top.share;
          void fetchExplorerFor(displayFen);
        } catch { /* ignore */ }
      }
    }
    fenToShow = displayFen;

    const displayStats = statsCache[posKey(displayFen)];
    if (displayStats && displayStats !== 'loading' && displayStats !== 'no_token') {
      movesTable = moveStats(displayStats).slice(0, 4);
    } else if (demo && displayFen !== activeEnd.fen) {
      movesTable = moveStats(DEMO_STATS_AFTER_OO).slice(0, 4);
    }

    if (mode === 'study' && movesTable.length > 0) {
      const colors = ['#3A78C2', 'rgba(58,120,194,0.66)', 'rgba(58,120,194,0.44)'];
      const planArrows: BoardArrow[] = [];
      movesTable.slice(0, 3).forEach((s, i) => {
        const c3 = new Chess(displayFen);
        try {
          const mv = c3.move({ from: s.uci.slice(0, 2), to: s.uci.slice(2, 4), promotion: 'q' });
          planArrows.push({
            from: mv.from as Square, to: mv.to as Square,
            color: colors[i] ?? '#3A78C2',
            role: 'plan',
            label: String(i + 1),
          });
        } catch { /* ignore */ }
      });
      showArrows = planArrows;
    }
    if (mode === 'quiz') {
      showArrows = quizArrows;
      if (!quizFeedback) {
        boardInteractive = true;
        boardMovable = myColor;
        boardOnMove = handleQuizMove;
      }
    }

    panelTitle = mode === 'quiz' && !quizFeedback
      ? 'Сыграй, как мастер'
      : replySan
        ? `Что играть после ${replySan}`
        : `После ${activeEnd.last}`;

    const openingName = openingNames.get(activeEnd.openingId) ?? '—';
    const totalGames = movesTable.reduce((s, m) => s + m.games, 0);
    panelChips = (
      <>
        <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
          {openingName}
        </span>
        <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
          ход {myColor === 'w' ? 'белых' : 'чёрных'}
        </span>
        <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
          {noToken ? 'Stockfish' : `Мастера · ${totalGames} ${totalGames === 1 ? 'партия' : 'партий'}`}
        </span>
        {demo && (
          <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
            демо
          </span>
        )}
      </>
    );

    const games = demo
      ? DEMO_TOP_GAMES
      : (topGames[posKey(displayFen)] ?? []).slice(0, 3).map(g => ({
          id: g.id,
          whiteName: g.white?.name ?? '—',
          whiteRating: g.white?.rating ?? 0,
          blackName: g.black?.name ?? '—',
          blackRating: g.black?.rating ?? 0,
          year: g.year ?? 0,
          winner: (g.winner ?? null) as 'white' | 'black' | null,
        }));

    panelBody = (
      <div style={{ padding: '10px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {replySan && (
          <div data-ui="idea-context" style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5 }}>
            Твоя линия кончается на <b>{activeEnd.last}</b>. Чаще всего отвечают <b>{replySan}</b>
            {replyShare > 0 && <> — {Math.round(replyShare * 100)}% партий</>}.
          </div>
        )}
        {quizFeedback && (
          <div
            data-ui="idea-feedback"
            data-result={quizFeedback.ok ? 'ok' : 'fail'}
            style={{
              padding: 12, borderRadius: 8,
              background: quizFeedback.ok ? 'rgba(129,182,76,.10)' : 'rgba(194,69,58,.10)',
              color: quizFeedback.ok ? 'var(--accent)' : '#C2453A', fontSize: 14,
            }}
          >
            {quizFeedback.played && <span>{quizFeedback.played}: </span>}{quizFeedback.text}
          </div>
        )}
        {noToken && (
          <div data-ui="idea-token" style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,.03)', border: '1px solid var(--hairline)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            Добавь <b>LICHESS_TOKEN</b> — покажем ходы мастеров. В локальной разработке — в <code>.env.local</code>, на проде — в переменных Vercel.
          </div>
        )}
        <div data-ui="idea-moves" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {movesTable.length === 0 && !noToken && !demo && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Загрузка данных мастеров…</div>
          )}
          {movesTable.map((m, i) => (
            <div key={m.san + i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,.02)',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 999,
                background: i < 3 ? '#3A78C2' : 'var(--hairline)',
                color: '#fff', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{i + 1}</span>
              <span style={{ fontSize: 14, color: 'var(--ivory)', minWidth: 60, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{m.san}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {Math.round(m.share * 100)}% · {m.games} {m.games === 1 ? 'партия' : 'партий'}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ display: 'inline-flex', height: 8, width: 72, borderRadius: 4, overflow: 'hidden' }}>
                <span style={{ width: `${m.white}%`, background: '#fff' }} />
                <span style={{ width: `${m.draws}%`, background: '#888' }} />
                <span style={{ width: `${m.black}%`, background: '#222' }} />
              </span>
            </div>
          ))}
        </div>
        <div data-ui="idea-plan">
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>План движка</div>
          <div style={{ fontSize: 13, color: 'var(--ivory)', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
            {(demo ? DEMO_PLAN : (enginePlan[activeEnd.key] ?? [])).join(' ')}
          </div>
        </div>
        <div data-ui="idea-games">
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Партии мастеров</div>
          {games.map(g => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, color: 'var(--ivory)' }}>
              <button style={{ width: 24, height: 24, borderRadius: 999, border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--ivory)', cursor: 'pointer' }}>▶</button>
              <span>
                {g.whiteName} ({g.whiteRating}) — {g.blackName} ({g.blackRating}) · {g.year} ·
                {' '}
                {g.winner === 'white' ? '1–0' : g.winner === 'black' ? '0–1' : '½–½'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );

    const btn: React.CSSProperties = {
      height: 40, border: '1px solid var(--hairline)', background: 'transparent',
      color: 'var(--ivory)', borderRadius: 'var(--radius-btn)', fontSize: 13, cursor: 'pointer',
      padding: '0 16px',
    };
    const primary: React.CSSProperties = { ...btn, background: 'var(--accent)', border: 'none', color: '#fff' };
    panelActions = (
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          data-ui="idea-quiz"
          onClick={() => {
            setMode(mode === 'quiz' ? 'study' : 'quiz');
            setQuizFeedback(null);
            setQuizArrows([]);
          }}
          style={mode === 'quiz' ? primary : btn}
        >
          Проверь себя
        </button>
        <button data-ui="idea-watch" style={btn}>▶ Партия</button>
        <button
          data-ui="idea-next"
          style={btn}
          onClick={() => {
            const i = ends.findIndex(e => e.key === activeKey);
            const next = ends[(i + 1) % ends.length];
            if (next) {
              setActiveKey(next.key);
              setQuizFeedback(null);
              setQuizArrows([]);
            }
          }}
        >
          Дальше {ends.length ? ends.length - 1 - ends.findIndex(e => e.key === activeKey) : ''}
        </button>
      </div>
    );
  } else {
    panelBody = (
      <div data-ui="idea-empty" style={{ padding: '20px 24px', color: 'var(--muted)', fontSize: 14 }}>
        Выбери позицию слева — покажем ходы мастеров и план движка.
      </div>
    );
    panelActions = null;
  }

  return (
    <TrainerLayout
      session={session}
      panelAttrs={demo ? { 'data-demo': 'plans' } : undefined}
      topBar={null}
      bottomBar={
        dbMissing ? (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Прогресс не сохраняется: выполни supabase/34-pages2.sql
          </div>
        ) : null
      }
      board={
        <Board
          fen={fenToShow}
          orientation={orientationColor}
          size={S}
          interactive={boardInteractive}
          movableColor={boardMovable}
          onMove={boardOnMove}
          arrows={showArrows}
        />
      }
      panel={
        <TaskPanel
          breadcrumb="Учиться · Идеи позиций"
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

export default function PlansPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--muted)' }}>Загрузка…</div>}>
      <PlansPageInner />
    </Suspense>
  );
}
