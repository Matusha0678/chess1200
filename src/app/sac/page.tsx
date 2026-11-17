'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { useStockfish } from '@/hooks/useStockfish';
import type { EvalResult } from '@/hooks/useStockfish';

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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SacPage() {
  const { boardTheme, customPieces, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();
  const { getEval, isReady: engineReady } = useStockfish();

  const [tab, setTab]                 = useState<'train' | 'prepare'>('train');
  const [positions, setPositions]     = useState<SacPosition[]>([]);
  const [loading, setLoading]         = useState(true);
  const [stats, setStats]             = useState<SacStats>({ total: 0, correct: 0, streak: 0, missedReal: 0, wrongFake: 0 });

  const [current, setCurrent]         = useState<SacPosition | null>(null);
  const [answered, setAnswered]       = useState<{ answer: 'sac' | 'calm'; ok: boolean; eval_before: number | null; eval_after: number | null } | null>(null);
  const [sacMoveApplied, setSacMoveApplied] = useState(false);

  const [preparing, setPreparing]     = useState(false);
  const [prepStop, setPrepStop]       = useState(false);
  const [prepProgress, setPrepProgress] = useState({ done: 0, total: 0, saved: 0 });
  const prepStopRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, []);

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
    setPreparing(true);
    setPrepStop(false);
    prepStopRef.current = false;

    const { data: games } = await supabase.from('master_games').select('id,pgn').limit(500);
    if (!games || games.length === 0) { setPreparing(false); return; }

    const total = games.length;
    setPrepProgress({ done: 0, total, saved: 0 });
    let saved = 0;

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
            ch.move({ from: cand.uci.slice(0,2), to: cand.uci.slice(2,4) });
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
        setPrepProgress(p => ({ ...p, saved }));
      }
      setPrepProgress(p => ({ ...p, done: i + 1 }));
    }

    setPreparing(false);
    const { data: fresh } = await supabase.from('sac_positions').select('*').limit(500);
    if (fresh) {
      setPositions(fresh as SacPosition[]);
      if (fresh.length > 0) pickRandom(fresh as SacPosition[]);
    }
  }

  function stopPrepare() {
    prepStopRef.current = true;
    setPrepStop(true);
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

  const boardKey = `${boardThemeId}-${pieceStyleId}-${current?.id ?? 'empty'}-${sacMoveApplied ? 'applied' : 'base'}`;

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

  if (loading) return (
    <main className="page-wrap">
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
    </main>
  );

  const sideToMove = current?.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const correctPct = stats.total > 0 ? Math.round(100 * stats.correct / stats.total) : null;

  return (
    <main className="page-wrap">
      {/* Header */}
      <div className="page-header">
        <Link href="/masters" className="ui-back">← Мастера</Link>
        <div className="ui-eyebrow">
          <span>Тренажёр</span>
          <span className="ui-eyebrow-line" />
          <span>В стиле Таля</span>
        </div>
        <h1 className="ui-h1">Жертвовать или нет?</h1>
        <p className="ui-sub">Позиции, где у стороны есть возможная жертва материала. Твоя задача — почувствовать, работает ли она.</p>
      </div>

      {/* Tabs */}
      <div className="ui-tabs">
        <button className={`ui-tab ${tab === 'train' ? 'ui-tab-active' : ''}`} onClick={() => setTab('train')}>
          Тренажёр
        </button>
        <button className={`ui-tab ${tab === 'prepare' ? 'ui-tab-active' : ''}`} onClick={() => setTab('prepare')}>
          Подготовить позиции
        </button>
      </div>

      {/* ── Train ── */}
      {tab === 'train' && (
        <>
          {positions.length === 0 ? (
            <div className="ui-card ui-card-lg" style={{ textAlign: 'center', maxWidth: 560 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>♟</div>
              <div style={{ fontSize: 15, color: 'var(--ivory)', marginBottom: 6 }}>Позиций пока нет</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.6 }}>
                Сначала загрузи партии мастеров, затем запусти подготовку позиций.
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href="/masters" className="ui-btn ui-btn-primary">Загрузить партии</Link>
                <button className="ui-btn ui-btn-outline" onClick={() => setTab('prepare')}>Подготовить позиции</button>
              </div>
            </div>
          ) : current && (
            <div className="board-layout">
              {/* Board */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="board-wrap">
                  <Chessboard
                    key={boardKey}
                    options={{
                      position: displayFen,
                      boardOrientation: sideToMove,
                      allowDragging: false,
                      boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
                      darkSquareStyle:  { backgroundColor: boardTheme.dark },
                      lightSquareStyle: { backgroundColor: boardTheme.light },
                      pieces: customPieces,
                      showNotation: true,
                      animationDurationInMs: animationMs,
                    }}
                  />
                </div>
                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                  {sideToMove === 'white' ? 'Ход белых' : 'Ход чёрных'}
                  {!answered && current && <> · предложение: <strong style={{ color: 'var(--ivory)', fontFamily: 'ui-monospace, monospace' }}>{uciToSan(current.fen, current.move)}</strong></>}
                </div>
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Stats */}
                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="stat-value">{correctPct != null ? `${correctPct}%` : '—'}</div>
                    <div className="stat-label">Верных</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{stats.streak}</div>
                    <div className="stat-label">Серия</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{stats.missedReal}</div>
                    <div className="stat-label">Пропустил</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{stats.wrongFake}</div>
                    <div className="stat-label">Ложные</div>
                  </div>
                </div>

                {/* Prompt */}
                {!answered && (
                  <div className="ui-card">
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', marginBottom: 6 }}>
                      Стоит ли пойти <span style={{ fontFamily: 'ui-monospace, monospace' }}>{uciToSan(current.fen, current.move)}</span>?
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                      Это возможная жертва материала. Доверься интуиции.
                    </div>
                  </div>
                )}

                {/* Buttons */}
                {!answered && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="ui-btn ui-btn-lg"
                      style={{
                        flex: 1,
                        background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                        color: 'var(--accent)',
                        borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)',
                      }}
                      onClick={() => handleAnswer('sac')}
                    >
                      ⚡ Жертвую
                    </button>
                    <button
                      className="ui-btn ui-btn-lg ui-btn-ghost"
                      style={{ flex: 1 }}
                      onClick={() => handleAnswer('calm')}
                    >
                      🛡 Спокойно
                    </button>
                  </div>
                )}

                {/* Result */}
                {answered && (
                  <div className={`ui-banner ${answered.ok ? 'ui-banner-success' : 'ui-banner-danger'}`}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ivory)', marginBottom: 8 }}>
                      {answered.ok ? '✓ Правильно!' : '✗ Неверно'}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>
                      {explainResult()}
                    </div>
                    {answered.eval_before != null && answered.eval_after != null && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                        Оценка до: <strong style={{ color: 'var(--ivory)' }}>{cpToPawns(answered.eval_before)}</strong>
                        {' '}· после: <strong style={{ color: 'var(--ivory)' }}>{cpToPawns(answered.eval_after)}</strong>
                      </div>
                    )}
                    <button className="ui-btn ui-btn-primary" onClick={() => pickRandom(positions)}>
                      Следующая позиция →
                    </button>
                  </div>
                )}

                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Позиция {positions.indexOf(current) + 1} из {positions.length}
                  {answered && <> · {current.kind === 'real' ? 'реальная' : 'ложная'} жертва</>}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Prepare ── */}
      {tab === 'prepare' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <div className="ui-card ui-card-lg">
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', marginBottom: 8 }}>
              Подготовка позиций
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65, marginBottom: 18 }}>
              Система сканирует партии мастеров, находит возможные жертвы материала и оценивает их движком (глубина 12).
              Жертвы с потерей оценки ≤ 0.3 пешки — <strong style={{ color: 'var(--ivory)' }}>реальные</strong>,
              ≥ 1.0 пешки — <strong style={{ color: 'var(--ivory)' }}>ложные</strong>.
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
              Текущих позиций в базе: <strong style={{ color: 'var(--ivory)' }}>{positions.length}</strong>
            </div>

            {!preparing ? (
              <button className="ui-btn ui-btn-primary" onClick={handlePrepare} disabled={!engineReady}>
                {engineReady ? 'Подготовить позиции' : 'Движок загружается…'}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Партий: <strong style={{ color: 'var(--ivory)' }}>{prepProgress.done}</strong> / {prepProgress.total}
                  {' '}· Позиций найдено: <strong style={{ color: 'var(--ivory)' }}>{prepProgress.saved}</strong>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{
                    width: prepProgress.total > 0 ? `${100 * prepProgress.done / prepProgress.total}%` : '0%',
                  }} />
                </div>
                <button className="ui-btn ui-btn-outline" onClick={stopPrepare} disabled={prepStop}>
                  {prepStop ? 'Остановка…' : 'Стоп'}
                </button>
              </div>
            )}
          </div>

          <div className="ui-card ui-card-sm" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--ivory)' }}>Нет партий?</strong>{' '}
            Сначала <Link href="/masters" style={{ color: 'var(--accent)' }}>загрузи партии мастеров</Link> через импорт PGN.
          </div>
        </div>
      )}
    </main>
  );
}
