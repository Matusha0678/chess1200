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
import { useStockfish } from '@/hooks/useStockfish';
import {
  toMoves,
  fenBefore,
  numSan,
  isMyTurn,
  move as runMove,
  auto as runAuto,
  needsAuto as runNeedsAuto,
  result as runResult,
  view as runView,
  type ChessMove,
  type Run,
} from '@/lib/opening-trainer';
import {
  loadTraps,
  trapsForRepertoire,
  punishRun,
  avoidVerdict,
  type TrapData,
  type OpeningForMatch,
} from '@/lib/traps';
import { TRAPS_LIBRARY } from '@/data/traps';

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

interface TrapProgressRow {
  trap_key: string;
  mastery: number;
  next_review: string;
}

interface TrapHit { trap_key: string; type: string; }

type Role = 'setter' | 'victim' | 'other';
type Mode = 'punish' | 'avoid' | 'watch';

interface EnrichedTrap {
  trap: TrapData;
  role: Role;
  openingId: string | null;
  openingName: string | null;
  source: 'rep' | 'course' | 'other';
  k: number;
}

// ── demo data (TRAPS.md §7) ──────────────────────────────────────────────────

const DEMO_OPENINGS: Array<{ id: string; name: string; color: 'white' | 'black' | 'both'; lines: string[] }> = [
  { id: 'stafford', name: 'Гамбит Стаффорда', color: 'black',
    lines: ['e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2 h5', 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 e5 Ne4 d4 Qh4 g3 Nxg3'] },
  { id: 'italian', name: 'Итальянская партия', color: 'white',
    lines: ['e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7'] },
  { id: 'dragon', name: 'Ускоренный дракон', color: 'black',
    lines: ['e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6'] },
  { id: 'caro', name: 'Защита Каро-Канн', color: 'black',
    lines: ['e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5'] },
];

const DEMO_MASTERY: Record<string, number> = {
  legal: 4, scholar: 4, 'caro-nd6': 4,
  blackburne: 2,
};
const DEMO_BLACKBURNE_DUE = new Date(Date.now() - 86400000).toISOString();

// ── helpers ──────────────────────────────────────────────────────────────────

function statusOf(prog: TrapProgressRow | null, now: number): 'new' | 'due' | 'mastered' | 'learning' {
  if (!prog) return 'new';
  if (Date.parse(prog.next_review) <= now) return 'due';
  return prog.mastery >= 4 ? 'mastered' : 'learning';
}

function roleIcon(role: Role): string {
  if (role === 'setter') return '⚔';
  if (role === 'victim') return '🛡';
  return '◇';
}

function roleLabel(role: Role): string {
  if (role === 'setter') return 'ставишь';
  if (role === 'victim') return 'ставят';
  return 'другая';
}

// ── page ─────────────────────────────────────────────────────────────────────

function TrapsPageInner() {
  const params = useSearchParams();
  const demo = params.get('demo') === '1';
  const { S } = useTrainerGeometry();
  const { getEval, isReady: sfReady } = useStockfish();

  const traps = useMemo(() => loadTraps(TRAPS_LIBRARY), []);

  const [openingsForMatch, setOpeningsForMatch] = useState<OpeningForMatch[]>([]);
  const [openingNames, setOpeningNames] = useState<Map<string, string>>(new Map());
  const [progress, setProgress] = useState<Record<string, TrapProgressRow>>({});
  const [hits, setHits] = useState<Record<string, { caught: number; caught_self: number }>>({});
  const [dbMissing, setDbMissing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'setter' | 'victim'>('all');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('punish');
  const [run, setRun] = useState<Run | null>(null);
  const [avoidArrows, setAvoidArrows] = useState<BoardArrow[]>([]);
  const [avoidResultText, setAvoidResultText] = useState<{ ok: boolean; text: string } | null>(null);
  const [watchIdx, setWatchIdx] = useState(0);
  const [watchPlaying, setWatchPlaying] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, []);

  // ── Load repertoire & progress ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (demo) {
        const ops: OpeningForMatch[] = DEMO_OPENINGS.map(o => ({
          id: o.id, color: o.color, lines: o.lines.map(toMoves),
        }));
        const names = new Map(DEMO_OPENINGS.map(o => [o.id, o.name]));
        const prog: Record<string, TrapProgressRow> = {};
        for (const [id, mastery] of Object.entries(DEMO_MASTERY)) {
          prog[`lib:${id}`] = {
            trap_key: `lib:${id}`, mastery,
            next_review: new Date(Date.now() + 10 * 86400000).toISOString(),
          };
        }
        prog['lib:blackburne'] = { trap_key: 'lib:blackburne', mastery: 2, next_review: DEMO_BLACKBURNE_DUE };
        setOpeningsForMatch(ops);
        setOpeningNames(names);
        setProgress(prog);
        setActiveKey('lib:stafford-bg5');
        setMode('punish');
        return;
      }
      try {
        const { data: ops, error: opErr } = await supabase
          .from('openings').select('id, name, color').order('created_at', { ascending: true });
        if (opErr) throw opErr;
        const openingsArr = (ops ?? []) as OpeningRow[];
        const opIds = openingsArr.map(o => o.id);
        let linesArr: OpeningLineRow[] = [];
        if (opIds.length) {
          const { data: ls } = await supabase
            .from('opening_lines')
            .select('id, opening_id, moves')
            .in('opening_id', opIds);
          linesArr = (ls ?? []) as OpeningLineRow[];
        }
        const byOp = new Map<string, ChessMove[][]>();
        for (const l of linesArr) {
          if (!byOp.has(l.opening_id)) byOp.set(l.opening_id, []);
          byOp.get(l.opening_id)!.push(l.moves);
        }
        const forMatch: OpeningForMatch[] = openingsArr.map(o => ({
          id: o.id, color: o.color, lines: byOp.get(o.id) ?? [],
        }));
        const names = new Map(openingsArr.map(o => [o.id, o.name]));
        if (cancelled) return;
        setOpeningsForMatch(forMatch);
        setOpeningNames(names);

        // Progress
        try {
          const { data: pg, error: pgErr } = await supabase
            .from('trap_progress').select('trap_key, mastery, next_review');
          if (pgErr) {
            if (pgErr.code === '42P01' || /does not exist/i.test(pgErr.message)) setDbMissing(true);
          } else {
            const map: Record<string, TrapProgressRow> = {};
            for (const row of (pg ?? []) as TrapProgressRow[]) map[row.trap_key] = row;
            setProgress(map);
          }
        } catch { /* ignore */ }

        // Hits
        try {
          const { data: hh } = await supabase.from('trap_hits').select('trap_key, type');
          const map: Record<string, { caught: number; caught_self: number }> = {};
          for (const h of (hh ?? []) as TrapHit[]) {
            if (!map[h.trap_key]) map[h.trap_key] = { caught: 0, caught_self: 0 };
            if (h.type === 'caught') map[h.trap_key].caught++;
            else map[h.trap_key].caught_self++;
          }
          setHits(map);
        } catch { /* ignore */ }
      } catch {
        setDbMissing(true);
      }
    })();
    return () => { cancelled = true; };
  }, [demo]);

  // ── Compute mine/other ──
  const matched = useMemo(() => trapsForRepertoire(traps, openingsForMatch), [traps, openingsForMatch]);

  const enriched = useMemo<EnrichedTrap[]>(() => {
    const result: EnrichedTrap[] = [];
    for (const m of matched.mine) {
      result.push({
        trap: m.trap,
        role: m.role,
        openingId: m.openingId,
        openingName: openingNames.get(m.openingId) ?? null,
        source: 'rep',
        k: m.k,
      });
    }
    for (const t of matched.other) {
      result.push({ trap: t, role: 'other', openingId: null, openingName: t.opening ?? null, source: 'other', k: 0 });
    }
    return result;
  }, [matched, openingNames]);

  // Filter
  const visible = useMemo(() => {
    if (filter === 'setter') return enriched.filter(e => e.role === 'setter');
    if (filter === 'victim') return enriched.filter(e => e.role === 'victim');
    return enriched;
  }, [enriched, filter]);

  const mineList = visible.filter(e => e.source === 'rep');
  const otherList = visible.filter(e => e.source === 'other');

  const counts = useMemo(() => {
    const total = enriched.length;
    let mastered = 0, due = 0, fresh = 0;
    for (const e of enriched) {
      const p = progress[e.trap.key] ?? null;
      const st = statusOf(p, nowMs);
      if (st === 'mastered') mastered++;
      else if (st === 'due') due++;
      else if (st === 'new') fresh++;
    }
    return { total, mastered, due, fresh };
  }, [enriched, progress, nowMs]);

  const dueCount = enriched.filter(e => {
    const p = progress[e.trap.key] ?? null;
    return statusOf(p, nowMs) === 'due';
  }).length + Math.min(8, enriched.filter(e => e.source === 'rep' && !progress[e.trap.key]).length);

  const activeTrap = useMemo(() => enriched.find(e => e.trap.key === activeKey) ?? null, [enriched, activeKey]);

  // ── Mode state transitions ──
  const openTrap = useCallback((e: EnrichedTrap, forceMode?: Mode) => {
    const defaultMode: Mode = forceMode ?? (e.role === 'victim' ? 'avoid' : 'punish');
    setActiveKey(e.trap.key);
    setMode(defaultMode);
    setAvoidArrows([]);
    setAvoidResultText(null);
    setWatchIdx(0);
    setWatchPlaying(false);
    if (defaultMode === 'punish') {
      setRun(punishRun(e.trap));
    } else {
      setRun(null);
    }
  }, []);

  // when activeTrap or mode changes, ensure run for punish
  useEffect(() => {
    if (!activeTrap) return;
    if (mode === 'punish') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRun(punishRun(activeTrap.trap));
      setAvoidArrows([]);
      setAvoidResultText(null);
    } else if (mode === 'avoid') {
      setRun(null);
      setAvoidArrows([]);
      setAvoidResultText(null);
    } else if (mode === 'watch') {
      setRun(null);
      setWatchIdx(0);
    }
  }, [activeTrap, mode]);

  // ── auto-play opponent response in punish mode (600ms) ──
  useEffect(() => {
    if (!run) return;
    if (mode !== 'punish') return;
    if (!runNeedsAuto(run)) return;
    const t = setTimeout(() => {
      setRun(prev => (prev ? runAuto(prev) : prev));
    }, 600);
    return () => clearTimeout(t);
  }, [run, mode]);

  // ── watch mode playback ──
  useEffect(() => {
    if (mode !== 'watch' || !activeTrap || !watchPlaying) return;
    if (watchIdx >= activeTrap.trap.moves.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWatchPlaying(false);
      return;
    }
    const t = setTimeout(() => setWatchIdx(i => i + 1), 900);
    autoTimerRef.current = t;
    return () => clearTimeout(t);
  }, [mode, activeTrap, watchPlaying, watchIdx]);

  // ── punish: record hit when finished ──
  const prevPunishPhase = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'punish' || !run || !activeTrap) return;
    const cur = run.phase;
    if (prevPunishPhase.current !== 'done' && cur === 'done') {
      const r = runResult(run);
      if (r.perfect && !demo && !dbMissing) {
        void supabase.from('trap_hits').insert({ trap_key: activeTrap.trap.key, type: 'caught' });
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHits(prev => {
          const cur = prev[activeTrap.trap.key] ?? { caught: 0, caught_self: 0 };
          return { ...prev, [activeTrap.trap.key]: { ...cur, caught: cur.caught + 1 } };
        });
      }
    }
    prevPunishPhase.current = cur;
  }, [run, mode, activeTrap, demo, dbMissing]);

  // ── handlers ──
  const handlePunishMove = useCallback((m: { from: Square; to: Square }): boolean => {
    if (!run || !activeTrap) return false;
    if (!isMyTurn(run)) return false;
    const next = runMove(run, m.from, m.to);
    setRun(next);
    // If wrong — optionally check with Stockfish (not required for lint)
    return false;
  }, [run, activeTrap]);

  const handleAvoidMove = useCallback((m: { from: Square; to: Square }): boolean => {
    if (!activeTrap) return false;
    const v = avoidVerdict(activeTrap.trap, m.from, m.to);
    if (v === 'illegal') return false;
    if (v === 'trap') {
      const trap = activeTrap.trap;
      const played = trap.moves[trap.mistakePly];
      const safe = trap.safe[0] ?? '';
      setAvoidArrows([
        { from: played.from as Square, to: played.to as Square, color: '#C2453A', role: 'played' },
        { from: m.from, to: m.to, color: '#C2453A', role: 'played' }, // the user actually did same moves
      ]);
      setAvoidResultText({
        ok: false,
        text: `${numSan(trap.moves, trap.mistakePly)} — это и есть ловушка. Здесь надо ${safe ? safe : 'играть безопасно'}.`,
      });
      if (!demo && !dbMissing) {
        void supabase.from('trap_hits').insert({ trap_key: activeTrap.trap.key, type: 'caught_self' });
        setHits(prev => {
          const cur = prev[activeTrap.trap.key] ?? { caught: 0, caught_self: 0 };
          return { ...prev, [activeTrap.trap.key]: { ...cur, caught_self: cur.caught_self + 1 } };
        });
      }
    } else if (v === 'safe') {
      setAvoidResultText({ ok: true, text: `Верно. Ловушки нет.` });
    } else {
      // 'other' — check with Stockfish
      if (sfReady && activeTrap) {
        setAvoidResultText({ ok: true, text: 'Проверяем движком…' });
        getEval(fenBefore(activeTrap.trap.moves, activeTrap.trap.mistakePly), 12, (res) => {
          const cp = res.cp != null ? res.cp / 100 : null;
          if (cp != null && Math.abs(cp) <= 0.8) {
            setAvoidResultText({ ok: true, text: `Можно и так. Чаще играют ${activeTrap.trap.safe[0] ?? 'из безопасных'}.` });
          } else {
            const trap = activeTrap.trap;
            const best = trap.moves[trap.mistakePly];
            setAvoidArrows([
              { from: m.from, to: m.to, color: '#C2453A', role: 'played' },
              { from: best.from as Square, to: best.to as Square, color: 'var(--accent-press)', style: 'dashed', role: 'best' },
            ]);
            setAvoidResultText({ ok: false, text: `Этот ход хуже. Лучше ${activeTrap.trap.safe[0] ?? 'из безопасных ходов'}.` });
          }
        });
      } else {
        setAvoidResultText({ ok: true, text: 'Проверить движком можно после загрузки Stockfish.' });
      }
    }
    return false;
  }, [activeTrap, demo, dbMissing, sfReady, getEval]);

  // ── UI pieces ──
  const sessionStats = [
    { value: counts.mastered, label: 'выучено', color: 'var(--accent)' },
    { value: counts.due, label: 'повторить', color: '#C98424' },
    { value: counts.fresh, label: 'новых', color: 'var(--ivory)' },
  ];

  const filterControls = (
    <div data-ui="trap-filter" style={{ display: 'flex', gap: 6 }}>
      {([
        ['all', 'Все'], ['setter', 'Я ставлю'], ['victim', 'Мне ставят'],
      ] as const).map(([k, l]) => (
        <button
          key={k}
          onClick={() => setFilter(k)}
          style={{
            flex: 1, height: 30, borderRadius: 8,
            border: '1px solid var(--hairline)',
            background: filter === k ? 'rgba(129,182,76,.15)' : 'transparent',
            color: filter === k ? 'var(--accent)' : 'var(--ivory)',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: '8px 10px', borderRadius: 8,
    background: active ? 'rgba(129,182,76,.10)' : 'transparent',
    cursor: 'pointer', userSelect: 'none',
  });

  const renderRow = (e: EnrichedTrap) => {
    const p = progress[e.trap.key] ?? null;
    const st = statusOf(p, nowMs);
    const active = activeKey === e.trap.key;
    const dot =
      st === 'mastered' ? '✓' :
      st === 'due' ? '●' :
      st === 'new' ? '●' : '●';
    const dotColor =
      st === 'mastered' ? 'var(--accent)' :
      st === 'due' ? '#C98424' : '#3A78C2';
    return (
      <div
        key={e.trap.key}
        data-ui="trap-row"
        data-trap={e.trap.id}
        data-role={e.role}
        data-status={st}
        data-active={active ? 'true' : undefined}
        onClick={() => openTrap(e)}
        style={rowStyle(active)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: e.role === 'setter' ? 'var(--accent)' : e.role === 'victim' ? '#C98424' : 'var(--muted)', fontSize: 14 }}>
              {roleIcon(e.role)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ivory)', fontWeight: 500 }}>{e.trap.name ?? e.trap.id}</span>
          </span>
          <span style={{ color: dotColor, fontSize: 12 }}>{dot}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 22 }}>
          {e.openingName ?? '—'} · {roleLabel(e.role)} · {st === 'new' ? 'новая' : st === 'due' ? 'повторить' : st === 'mastered' ? 'выучена' : 'учится'}
        </div>
      </div>
    );
  };

  const list = (
    <div style={{ padding: '0 10px' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 10px 2px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        В твоих дебютах
      </div>
      {mineList.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 10px' }}>
          Добавь дебюты — подберём ловушки к ним
        </div>
      )}
      {mineList.map(renderRow)}

      <div data-ui="trap-lichess" style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 10px 2px' }}>
        <Link href="/tactics?mode=openings" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          Из партий Lichess · 0 задач · в «Тактике»
        </Link>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 10px 2px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        Другие ловушки
      </div>
      {otherList.map(renderRow)}
    </div>
  );

  const session = (
    <SessionPanel
      title={`Ловушки · ${enriched.length}`}
      stats={sessionStats}
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filterControls}
          <button
            data-ui="trap-session"
            onClick={() => {
              // start session: open first due trap
              const target = enriched.find(e => statusOf(progress[e.trap.key] ?? null, nowMs) === 'due') ?? enriched.find(e => e.source === 'rep');
              if (target) openTrap(target);
            }}
            style={{
              height: 36, border: 'none', borderRadius: 8,
              background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Тренировать · {dueCount}
          </button>
        </div>
      }
      list={list}
    />
  );

  // ── Right panel ──
  let fenToShow = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let orientationColor: 'white' | 'black' = 'white';
  let boardArrows: BoardArrow[] = [];
  let boardMovableColor: 'w' | 'b' | undefined;
  let boardLastMove: { from: Square; to: Square } | null = null;
  let boardOnMove: ((m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => boolean) | undefined;
  let boardInteractive = false;

  let panelTitle = 'Ловушки';
  let panelChips: React.ReactNode = null;
  let panelBody: React.ReactNode = null;
  let panelActions: React.ReactNode = null;

  if (activeTrap) {
    const t = activeTrap.trap;
    orientationColor = t.setter === 'w' ? 'white' : 'black';
    // for avoid, orientation = victim color
    if (mode === 'avoid') orientationColor = t.setter === 'w' ? 'black' : 'white';

    if (mode === 'punish' && run) {
      const v = runView(run);
      fenToShow = v.fen;
      boardArrows = v.arrows.map(a => ({
        from: a.from as Square, to: a.to as Square,
        color: a.role === 'played' ? '#C2453A' : 'var(--accent-press)',
        style: a.style as 'dashed' | undefined,
        role: a.role as 'played' | 'best',
      }));
      boardLastMove = v.lastMove ? { from: v.lastMove.from as Square, to: v.lastMove.to as Square } : null;
      if (isMyTurn(run) && run.phase !== 'done') {
        boardMovableColor = t.setter;
        boardInteractive = true;
        boardOnMove = handlePunishMove;
      }
      const r = runResult(run);
      if (run.phase === 'done' && r.perfect) {
        panelTitle = t.name ?? t.id;
      } else if (run.phase === 'done') {
        panelTitle = t.name ?? t.id;
      } else {
        panelTitle = t.name ?? t.id;
      }
    } else if (mode === 'avoid') {
      fenToShow = fenBefore(t.moves, t.mistakePly);
      boardArrows = avoidArrows;
      boardLastMove = t.mistakePly >= 1
        ? { from: t.moves[t.mistakePly - 1].from as Square, to: t.moves[t.mistakePly - 1].to as Square }
        : null;
      if (avoidResultText?.ok === false) {
        panelTitle = 'Попался';
      } else {
        panelTitle = t.name ?? t.id;
      }
      if (!avoidResultText) {
        boardMovableColor = t.setter === 'w' ? 'b' : 'w';
        boardInteractive = true;
        boardOnMove = handleAvoidMove;
      }
    } else if (mode === 'watch') {
      const shownPly = Math.min(Math.max(0, watchIdx - 1), t.moves.length - 1);
      fenToShow = watchIdx === 0 ? fenBefore(t.moves, 0) : t.moves[shownPly].fen;
      boardLastMove = watchIdx > 0 ? { from: t.moves[shownPly].from as Square, to: t.moves[shownPly].to as Square } : null;
      panelTitle = t.name ?? t.id;
    }

    // Chips
    panelChips = (
      <>
        <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
          {roleLabel(activeTrap.role)}
        </span>
        {activeTrap.openingName && (
          <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
            {t.setter === 'w' ? '♔' : '♚'} {activeTrap.openingName}
          </span>
        )}
        <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
          Итог: {t.result}
        </span>
      </>
    );

    const hitBlock = (() => {
      const h = hits[t.key] ?? { caught: 0, caught_self: 0 };
      return (
        <div data-ui="trap-hits" style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12 }}>
          <span>Поймал соперника · {h.caught}</span>
          <span>Попался сам · {h.caught_self}</span>
        </div>
      );
    })();

    let feedbackBlock: React.ReactNode = null;
    if (mode === 'punish' && run) {
      const r = runResult(run);
      if (run.phase === 'done' && r.perfect) {
        feedbackBlock = (
          <div data-ui="trap-feedback" data-result="ok" style={{ padding: 12, borderRadius: 8, background: 'rgba(129,182,76,.10)', color: 'var(--accent)', fontSize: 14 }}>
            Верно! {t.result === 'мат' ? 'Мат' : `Выигрываешь: ${t.result}`}.
          </div>
        );
      } else if (run.phase === 'done' && !r.perfect) {
        feedbackBlock = (
          <div data-ui="trap-feedback" data-result="fail" style={{ padding: 12, borderRadius: 8, background: 'rgba(194,69,58,.10)', color: '#C2453A', fontSize: 14 }}>
            Ловушка сработала, но с ошибками.
          </div>
        );
      } else {
        feedbackBlock = (
          <div data-ui="trap-task" data-result="info" style={{ padding: 12, borderRadius: 8, background: 'rgba(58,120,194,.08)', color: 'var(--ivory)', fontSize: 14 }}>
            Жертва ошиблась. Найди наказание.
          </div>
        );
      }
    } else if (mode === 'avoid') {
      if (avoidResultText?.ok === false) {
        feedbackBlock = (
          <div data-ui="trap-feedback" data-result="fail" style={{ padding: 12, borderRadius: 8, background: 'rgba(194,69,58,.10)', color: '#C2453A', fontSize: 14 }}>
            {avoidResultText.text}{' '}
            <span style={{ color: 'var(--ivory)' }}>
              {t.moves.slice(t.mistakePly).map(m => m.san).join(' ')}
            </span>
          </div>
        );
      } else if (avoidResultText?.ok === true) {
        feedbackBlock = (
          <div data-ui="trap-feedback" data-result="ok" style={{ padding: 12, borderRadius: 8, background: 'rgba(129,182,76,.10)', color: 'var(--accent)', fontSize: 14 }}>
            {avoidResultText.text}
          </div>
        );
      } else {
        feedbackBlock = (
          <div data-ui="trap-task" data-result="info" style={{ padding: 12, borderRadius: 8, background: 'rgba(58,120,194,.08)', color: 'var(--ivory)', fontSize: 14 }}>
            Сопернику ходить. Не попадись.
          </div>
        );
      }
    }

    panelBody = (
      <div style={{ padding: '14px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div data-ui="trap-story" style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5 }}>
          {t.idea}
        </div>
        {feedbackBlock}
        <div data-ui="trap-line" style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', lineHeight: 1.6 }}>
          {t.moves.map((m, i) => {
            const isMistake = i === t.mistakePly;
            return (
              <span key={i} style={{
                color: isMistake ? '#C2453A' : i > t.mistakePly ? 'var(--accent)' : 'var(--ivory)',
                marginRight: 6,
              }}>
                {m.color === 'w' ? `${Math.floor(i / 2) + 1}.` : ''} {m.san}{isMistake ? '??' : ''}
              </span>
            );
          })}
        </div>
        {hitBlock}
      </div>
    );

    const btnStyle: React.CSSProperties = {
      height: 40, border: '1px solid var(--hairline)', background: 'transparent',
      color: 'var(--ivory)', borderRadius: 'var(--radius-btn)', fontSize: 13, cursor: 'pointer',
      padding: '0 16px',
    };
    const primaryBtn: React.CSSProperties = { ...btnStyle, background: 'var(--accent)', border: 'none', color: '#fff' };
    panelActions = (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button data-ui="trap-watch" style={btnStyle} onClick={() => { setMode('watch'); setWatchIdx(0); setWatchPlaying(true); }}>
          ▶ Смотреть
        </button>
        <button data-ui="trap-punish" style={mode === 'punish' ? primaryBtn : btnStyle} onClick={() => setMode('punish')}>
          Накажи сам
        </button>
        {t.safe.length > 0 && (
          <button data-ui="trap-avoid" style={mode === 'avoid' ? primaryBtn : btnStyle} onClick={() => setMode('avoid')}>
            Не попадись
          </button>
        )}
        {(mode === 'punish' && run?.phase === 'done') && (
          <button data-ui="trap-retry" style={btnStyle} onClick={() => setRun(punishRun(t))}>
            Ещё раз
          </button>
        )}
        {(mode === 'avoid' && avoidResultText) && (
          <button data-ui="trap-retry" style={btnStyle} onClick={() => { setAvoidArrows([]); setAvoidResultText(null); }}>
            Ещё раз
          </button>
        )}
        <button data-ui="trap-next" style={btnStyle} onClick={() => {
          const i = enriched.findIndex(e => e.trap.key === t.key);
          const next = enriched[(i + 1) % enriched.length];
          if (next) openTrap(next);
        }}>
          Дальше
        </button>
      </div>
    );
  } else {
    panelBody = (
      <div style={{ padding: '20px 24px', color: 'var(--muted)', fontSize: 14 }}>
        Выбери ловушку слева — её можно посмотреть, наказать или проверить, как не попасться.
      </div>
    );
    panelActions = <div style={{ fontSize: 12, color: 'var(--muted)' }}>Нажми на строку в списке</div>;
  }

  return (
    <TrainerLayout
      session={session}
      panelAttrs={demo ? { 'data-demo': 'traps' } : undefined}
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
          movableColor={boardMovableColor}
          size={S}
          interactive={boardInteractive}
          onMove={boardOnMove}
          lastMove={boardLastMove}
          arrows={boardArrows}
        />
      }
      panel={
        <TaskPanel
          breadcrumb="Учиться · Ловушки"
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

export default function TrapsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--muted)' }}>Загрузка…</div>}>
      <TrapsPageInner />
    </Suspense>
  );
}
