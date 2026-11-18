'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Chess, type Square } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import type { EvalResult } from '@/hooks/useStockfish';
import { Board } from '@/components/board/Board';
import type { BoardArrow } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { SessionPanel } from '@/components/trainer/SessionPanel';
import { EvalBar } from '@/components/trainer/EvalBar';
import { FeedbackCard } from '@/components/ui/FeedbackCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MoveChip } from '@/components/ui/MoveChip';
import { Kbd } from '@/components/ui/Kbd';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SacPosition {
  id: string;
  fen: string;
  move: string;
  kind: 'real' | 'fake';
  eval_before: number | null;
  eval_after: number | null;
  source: string;
}

interface SacStats {
  total: number;
  correct: number;
  streak: number;
  missedReal: number;
  wrongFake: number;
}

interface PrepProgress {
  done: number;
  total: number;
  saved: number;
  startedAt: number;
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSacrifice(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to   = uci.slice(2, 4);
    const m = chess.moves({ verbose: true }).find(mv => mv.from === from && mv.to === to);
    if (!m) return false;
    const movedVal = PIECE_VALUES[m.piece] ?? 0;
    if (m.captured) {
      const capVal = PIECE_VALUES[m.captured] ?? 0;
      if (movedVal > capVal) return true;
    }
    chess.move({ from, to, promotion: m.promotion });
    const opp = m.color === 'w' ? 'b' : 'w';
    return chess.isAttacked(to as Square, opp);
  } catch { return false; }
}

function findSacrificeCandidates(pgn: string): Array<{ fen: string; uci: string }> {
  const out: Array<{ fen: string; uci: string }> = [];
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    const replay = new Chess();
    for (const m of history) {
      const fen = replay.fen();
      const uci = m.from + m.to;
      if (isSacrifice(fen, uci)) out.push({ fen, uci });
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    }
  } catch {}
  return out;
}

function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const r = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    return r?.san ?? uci;
  } catch { return uci; }
}

function cpToPawns(cp: number): string { return (cp / 100).toFixed(2); }

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} сек`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m} мин ${s} сек` : `${m} мин`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h} ч ${mm} мин` : `${h} ч`;
}

function sanitizePlayerFilter(s: string): string {
  return s.replace(/[,()*%_\\]/g, '').trim();
}

// Move number from FEN
function fenMoveNumber(fen: string): number {
  const parts = fen.split(' ');
  return parseInt(parts[5] ?? '1', 10);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SacPage() {
  const { S } = useTrainerGeometry();
  const { getEval, isReady: engineReady } = useStockfish();

  const [positions, setPositions]     = useState<SacPosition[]>([]);
  const [loading, setLoading]         = useState(true);
  const [stats, setStats]             = useState<SacStats>({ total: 0, correct: 0, streak: 0, missedReal: 0, wrongFake: 0 });

  const [current, setCurrent]         = useState<SacPosition | null>(null);
  const [answered, setAnswered]       = useState<{ answer: 'sac' | 'calm'; ok: boolean; eval_before: number | null; eval_after: number | null } | null>(null);
  const [sacMoveApplied, setSacMoveApplied] = useState(false);

  // Filter: 'Tal' or '' for all masters
  const [prepFilter, setPrepFilter]       = useState('Tal');

  // Prepare mode
  const [prepBatchSize] = useState(200);
  const [preparing, setPreparing]         = useState(false);
  const [prepStop, setPrepStop]           = useState(false);
  const [prepProgress, setPrepProgress]   = useState<PrepProgress | null>(null);
  const prepStopRef = useRef(false);

  const [remaining, setRemaining]         = useState<number | null>(null);
  const [scanned, setScanned]             = useState<number | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepFilter]);

  async function loadData() {
    setLoading(true);
    const [posRes, logRes] = await Promise.all([
      supabase.from('sac_positions').select('*').limit(500),
      supabase.from('sac_log').select('answer,ok,played_at').order('played_at', { ascending: false }).limit(200),
    ]);
    const pos = (posRes.data ?? []) as SacPosition[];
    setPositions(pos);

    const logs = (logRes.data ?? []) as Array<{ answer: string; ok: boolean }>;
    let streak = 0;
    for (const l of logs) { if (!l.ok) break; streak++; }
    const missed = logs.filter(l => l.answer === 'calm' && !l.ok).length;
    const wrong  = logs.filter(l => l.answer === 'sac'  && !l.ok).length;
    setStats({
      total: logs.length,
      correct: logs.filter(l => l.ok).length,
      streak, missedReal: missed, wrongFake: wrong,
    });

    if (pos.length > 0) pickRandom(pos);
    setLoading(false);
  }

  async function refreshCounts() {
    const safe = sanitizePlayerFilter(prepFilter);
    const orExpr = safe ? `white.ilike.%${safe}%,black.ilike.%${safe}%` : null;

    const q1 = supabase
      .from('master_games')
      .select('id', { count: 'exact', head: true })
      .is('sac_scanned_at', null);
    const { count: remCount } = await (orExpr ? q1.or(orExpr) : q1);

    const q2 = supabase
      .from('master_games')
      .select('id', { count: 'exact', head: true })
      .not('sac_scanned_at', 'is', null);
    const { count: scannedCount } = await (orExpr ? q2.or(orExpr) : q2);

    setRemaining(remCount ?? 0);
    setScanned(scannedCount ?? 0);
  }

  function pickRandom(pool: SacPosition[]) {
    const idx = Math.floor(Math.random() * pool.length);
    setCurrent(pool[idx]);
    setAnswered(null);
    setSacMoveApplied(false);
  }

  async function handleAnswer(answer: 'sac' | 'calm') {
    if (!current || answered) return;
    const ok = answer === 'sac' ? current.kind === 'real' : current.kind === 'fake';
    setAnswered({ answer, ok, eval_before: current.eval_before, eval_after: current.eval_after });
    if (answer === 'sac') setSacMoveApplied(true);

    setStats(s => ({
      ...s,
      total: s.total + 1,
      correct: ok ? s.correct + 1 : s.correct,
      streak:  ok ? s.streak  + 1 : 0,
      missedReal: (!ok && answer === 'calm') ? s.missedReal + 1 : s.missedReal,
      wrongFake:  (!ok && answer === 'sac')  ? s.wrongFake  + 1 : s.wrongFake,
    }));

    await supabase.from('sac_log').insert({ position_id: current.id, answer, ok });
  }

  // ── Prepare ────────────────────────────────────────────────────────────────

  async function handlePrepare() {
    if (!engineReady) return;
    const safe = sanitizePlayerFilter(prepFilter);
    const orExpr = safe ? `white.ilike.%${safe}%,black.ilike.%${safe}%` : null;

    setPreparing(true);
    setPrepStop(false);
    prepStopRef.current = false;

    const q = supabase
      .from('master_games')
      .select('id,pgn')
      .is('sac_scanned_at', null)
      .limit(prepBatchSize);
    const { data: games, error } = await (orExpr ? q.or(orExpr) : q);

    if (error || !games || games.length === 0) {
      setPreparing(false);
      if (error) console.error(error);
      refreshCounts();
      return;
    }

    const total = games.length;
    const startedAt = Date.now();
    let done = 0, saved = 0;
    setPrepProgress({ done, total, saved, startedAt });

    for (let i = 0; i < games.length; i++) {
      if (prepStopRef.current) break;
      const game = games[i] as { id: string; pgn: string };
      const candidates = findSacrificeCandidates(game.pgn);

      for (const cand of candidates) {
        if (prepStopRef.current) break;

        const evalBefore = await new Promise<EvalResult>(resolve => { getEval(cand.fen, 12, resolve); });

        const afterFen = (() => {
          try {
            const ch = new Chess(cand.fen);
            ch.move({ from: cand.uci.slice(0, 2), to: cand.uci.slice(2, 4) });
            return ch.fen();
          } catch { return null; }
        })();
        if (!afterFen) continue;

        const evalAfter = await new Promise<EvalResult>(resolve => { getEval(afterFen, 12, resolve); });

        const cpBefore = evalBefore.cp ?? (evalBefore.mate != null ? (evalBefore.mate > 0 ? 9999 : -9999) : 0);
        const cpAfter  = -(evalAfter.cp ?? (evalAfter.mate != null ? (evalAfter.mate > 0 ? 9999 : -9999) : 0));
        const delta = cpBefore - cpAfter;

        let kind: 'real' | 'fake' | null = null;
        if (delta <= 30)  kind = 'real';
        if (delta >= 100) kind = 'fake';
        if (!kind) continue;

        await supabase.from('sac_positions').upsert({
          fen: cand.fen, move: cand.uci, kind,
          eval_before: cpBefore, eval_after: cpAfter, source: 'master',
        }, { onConflict: 'fen,move' });
        saved++;
        setPrepProgress({ done, total, saved, startedAt });
      }

      await supabase.from('master_games').update({ sac_scanned_at: new Date().toISOString() }).eq('id', game.id);

      done++;
      setPrepProgress({ done, total, saved, startedAt });
    }

    setPreparing(false);
    refreshCounts();

    const { data: fresh } = await supabase.from('sac_positions').select('*').limit(500);
    if (fresh) {
      setPositions(fresh as SacPosition[]);
      if (fresh.length > 0 && !current) pickRandom(fresh as SacPosition[]);
    }
  }

  function stopPrepare() {
    prepStopRef.current = true;
    setPrepStop(true);
  }

  function explainResult(): string {
    if (!answered || !current) return '';
    const { eval_before, eval_after, ok } = answered;
    if (ok && current.kind === 'real') {
      if (eval_after != null && eval_after > 50) return `Движок подтверждает: позиция лучше на ${cpToPawns(eval_after)} пешки. Жертва работает!`;
      if (eval_after != null && Math.abs(eval_after) <= 50) return 'Компенсация достаточна — позиция примерно равна, но с инициативой.';
      return 'Жертва оправдана — активность фигур перевешивает материал.';
    }
    if (ok && current.kind === 'fake') {
      if (eval_before != null && eval_after != null) {
        const loss = eval_before - eval_after;
        return `Верно — эта жертва теряет около ${cpToPawns(loss)} пешки без компенсации.`;
      }
      return 'Верно — жертва не оправдана.';
    }
    if (!ok && current.kind === 'real')
      return `Ты пропустил жертву! Движок оценивает позицию после жертвы лучше на ${eval_after != null ? cpToPawns(eval_after) : '?'} пешки.`;
    return 'Эта жертва не работает — противник просто забирает материал без достаточной компенсации.';
  }

  // ── Display ────────────────────────────────────────────────────────────────

  const displayFen = (() => {
    if (!current) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (sacMoveApplied) {
      try {
        const ch = new Chess(current.fen);
        ch.move({ from: current.move.slice(0,2), to: current.move.slice(2,4) });
        return ch.fen();
      } catch {}
    }
    return current.fen;
  })();

  if (loading) return (
    <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
  );

  const sideToMove = current?.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const oppSide = sideToMove === 'white' ? 'black' : 'white';
  const correctPct = stats.total > 0 ? Math.round(100 * stats.correct / stats.total) : null;
  const sacSan = current ? uciToSan(current.fen, current.move) : '';
  const moveNum = current ? fenMoveNumber(current.fen) : 1;

  // ETA
  const prepEta: number | null = (() => {
    if (!prepProgress || !preparing || prepProgress.done === 0) return null;
    const elapsed = (Date.now() - prepProgress.startedAt) / 1000;
    const perGame = elapsed / prepProgress.done;
    return Math.max(0, perGame * (prepProgress.total - prepProgress.done));
  })();

  // Board arrows & tints for sacrifice move
  const sacArrows: BoardArrow[] = [];
  const sacTints: Partial<Record<string, string>> = {};
  if (current && !answered) {
    const from = current.move.slice(0, 2) as Square;
    const to   = current.move.slice(2, 4) as Square;
    sacArrows.push({
      from, to,
      color: 'rgba(240,164,58,0.9)',
      style: 'dashed',
      opacity: 0.9,
    });
    sacTints[to] = 'rgba(240,164,58,0.18)';
  }

  // ── Player bars ────────────────────────────────────────────────────────────

  const topBarNode = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
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

  // ── Board node ─────────────────────────────────────────────────────────────

  const boardNode = (
    <Board
      fen={displayFen}
      orientation={sideToMove}
      size={S}
      interactive={false}
      dimmed={!current}
      tints={sacTints as Partial<Record<Square, string>>}
      arrows={sacArrows}
    />
  );

  // ── Eval bar ────────────────────────────────────────────────────────────────

  const evalBarNode = answered && current?.eval_before != null
    ? <EvalBar cp={current.eval_before} orientation={sideToMove} />
    : undefined;

  // ── Filter toggle (Таль / Все мастера) ─────────────────────────────────────

  const filterToggle = (
    <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--hairline)', overflow: 'hidden' }}>
      {(['Таль', 'Все мастера'] as const).map((label, i) => {
        const active = i === 0 ? prepFilter === 'Tal' : prepFilter === '';
        return (
          <button
            key={label}
            onClick={() => setPrepFilter(i === 0 ? 'Tal' : '')}
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
        <span style={{ fontSize: 16 }}>🗄</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)' }}>
          {preparing ? 'Подготовка позиций…' : 'Подготовить позиции'}
        </span>
      </div>
      {preparing && prepProgress && (
        <>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            Партий: {prepProgress.done} / {prepProgress.total} · Позиций: {prepProgress.saved}
            {prepEta != null && ` · ~${formatEta(prepEta)}`}
          </div>
          <ProgressBar value={prepProgress.done} max={prepProgress.total} height={6} />
        </>
      )}
      {!preparing && (
        <div style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
          Обработано: {scanned ?? '—'} · Осталось: {remaining ?? '—'}
        </div>
      )}
      <button
        onClick={preparing ? stopPrepare : handlePrepare}
        disabled={!preparing && (!engineReady || remaining === 0)}
        style={{
          height: 36, fontSize: 13, fontWeight: 600,
          background: preparing ? 'var(--surface-2)' : 'var(--accent)',
          color: preparing ? 'var(--muted)' : '#fff',
          border: preparing ? '1px solid var(--hairline-2)' : 'none',
          cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
          opacity: (!preparing && (!engineReady || remaining === 0)) ? 0.5 : 1,
        }}
      >
        {preparing
          ? (prepStop ? 'Остановка…' : 'Стоп')
          : !engineReady ? 'Движок загружается…'
          : remaining === 0 ? 'Нечего обрабатывать'
          : scanned && scanned > 0 ? `Подготовить ещё ${Math.min(prepBatchSize, remaining ?? prepBatchSize)}`
          : `Подготовить ${Math.min(prepBatchSize, remaining ?? prepBatchSize)}`}
      </button>
    </div>
  );

  // ── Session panel ──────────────────────────────────────────────────────────

  const sessionPanel = (
    <SessionPanel
      title="Сессия"
      stats={[
        { value: correctPct != null ? correctPct : 0, label: 'верных %', color: '#81B64C' },
        { value: stats.streak, label: 'серия', color: 'var(--ivory)' },
        { value: stats.missedReal, label: 'пропустил', color: '#E0574A' },
      ]}
      controls={filterToggle}
      prepBlock={prepBlock}
      listLabel={positions.length > 0 ? 'Позиции' : undefined}
      listRight={positions.length > 0 ? `${positions.length}` : undefined}
      list={
        positions.length === 0 ? (
          <div style={{ padding: '12px 10px', fontSize: 14, color: 'var(--muted)' }}>
            Нет позиций. Запусти подготовку выше.
          </div>
        ) : (
          <>
            {positions.slice(0, 20).map((p, i) => {
              const isCur = current?.id === p.id;
              return (
                <div
                  key={p.id}
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
                  }}
                >
                  {isCur && (
                    <div style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: '#81B64C' }} />
                  )}
                  <div style={{ display: 'grid', placeItems: 'center', fontSize: 13, color: isCur ? '#81B64C' : 'var(--control)', fontWeight: isCur ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {i + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Позиция {i + 1}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--control)', marginTop: 1 }}>
                      {isCur ? 'текущая' : p.source}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: p.kind === 'real' ? '#81B64C' : '#E0574A', fontWeight: 600 }} data-allow-small>
                    {/* Don't show kind until answered */}
                  </div>
                </div>
              );
            })}
          </>
        )
      }
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

  // ── Panel content ──────────────────────────────────────────────────────────

  const panelNode = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div data-ui="panel-header" style={{ padding: '20px 24px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <span>Тренажёр · Жертвы мастеров</span>
          {positions.length > 0 && (
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
              {positions.length} позиций
            </span>
          )}
        </div>
        {stats.total > 0 && (
          <ProgressBar value={stats.correct} max={stats.total} height={4} />
        )}
        <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          {positions.length === 0 && !preparing
            ? 'Нет позиций'
            : preparing
            ? 'Готовлю позиции'
            : answered
            ? (answered.ok ? 'Правильно!' : 'Неверно')
            : 'Жертвовать?'}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 24px' }}>

        {/* Empty state */}
        {positions.length === 0 && !preparing && (
          <div data-ui="sac-empty" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 20 }}>
            <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
              Сначала загрузи партии мастеров, затем запусти подготовку позиций.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { n: '01', text: 'Загрузи партии мастеров через импорт PGN' },
                { n: '02', text: 'Нажми «Подготовить позиции» в левой колонке' },
                { n: '03', text: 'Начни тренировку — реальные или ложные жертвы?' },
              ].map(({ n, text }) => (
                <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{n}</span>
                  <span style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>
            <Link
              href="/masters"
              style={{ display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 20px', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 600, borderRadius: 'var(--radius-btn)', textDecoration: 'none', alignSelf: 'flex-start' }}
            >
              Загрузить партии
            </Link>
          </div>
        )}

        {/* Preparing state */}
        {preparing && prepProgress && (
          <div data-ui="sac-prep-progress" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🗄</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)' }}>Готовлю позиции</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              Партий: <strong style={{ color: 'var(--ivory)' }}>{prepProgress.done}</strong> / {prepProgress.total}
              {' '}· Позиций: <strong style={{ color: 'var(--ivory)' }}>{prepProgress.saved}</strong>
              {prepEta != null && (
                <span style={{ marginLeft: 8 }}>
                  · ~<strong style={{ color: 'var(--ivory)' }}>{formatEta(prepEta)}</strong>
                </span>
              )}
            </div>
            <ProgressBar value={prepProgress.done} max={prepProgress.total} height={8} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[
                { label: 'Партий', value: prepProgress.done },
                { label: 'Позиций', value: prepProgress.saved },
                { label: 'Осталось', value: prepProgress.total - prepProgress.done },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '10px 12px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)', textAlign: 'center' }}>
                  <b style={{ display: 'block', fontSize: 20, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>{value}</b>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
              Держи вкладку открытой — движок работает в этой вкладке
            </div>
          </div>
        )}

        {/* Question state */}
        {!answered && current && !preparing && (
          <>
            <div data-ui="sac-offer" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#F4B45C', letterSpacing: '-0.01em', marginBottom: 8 }}>
                <MoveChip>{sacSan}</MoveChip>
              </div>
              <div style={{ fontSize: 15, color: 'var(--ivory)', lineHeight: 1.5 }}>
                Это возможная жертва материала. Доверься интуиции.
              </div>
            </div>

            <div data-ui="sac-weigh" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, padding: '14px 16px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Ход</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>{sacSan}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Сторона</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>{sideToMove === 'white' ? 'Белые' : 'Чёрные'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Ход №</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>{moveNum}</span>
              </div>
            </div>
          </>
        )}

        {/* Answer state */}
        {answered && current && (
          <>
            <div data-ui="sac-feedback" style={{ marginBottom: 16 }}>
              <FeedbackCard
                variant={answered.ok ? 'success' : 'danger'}
                title={answered.ok ? '✓ Правильно!' : '✗ Неверно'}
              >
                {explainResult()}
              </FeedbackCard>
            </div>

            {answered.eval_before != null && answered.eval_after != null && (
              <div data-ui="sac-gave-got" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--hairline-2)' }}>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Оценка до</span>
                  <b style={{ fontSize: 20, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
                    {cpToPawns(answered.eval_before)}
                  </b>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--hairline-2)' }}>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Оценка после</span>
                  <b style={{ fontSize: 20, color: answered.ok ? '#81B64C' : '#E0574A', fontVariantNumeric: 'tabular-nums' }}>
                    {cpToPawns(answered.eval_after)}
                  </b>
                </div>
              </div>
            )}

            {/* Position counter */}
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Позиция {positions.indexOf(current) + 1} из {positions.length}
              {' '} · {current.kind === 'real' ? 'реальная жертва' : 'ложная жертва'}
            </div>
          </>
        )}
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
                <Kbd>J</Kbd>
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
                <Kbd>K</Kbd>
              </button>
            </div>
          </>
        )}

        {answered && positions.length > 0 && (
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
        )}

        {positions.length === 0 && !preparing && (
          <button
            onClick={handlePrepare}
            disabled={!engineReady}
            style={{
              height: 52, fontSize: 16, fontWeight: 700,
              background: 'var(--accent)', color: '#fff',
              border: 'none', cursor: 'pointer',
              borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
              opacity: !engineReady ? 0.6 : 1,
            }}
          >
            {engineReady ? 'Подготовить позиции' : 'Движок загружается…'}
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
    />
  );
}
