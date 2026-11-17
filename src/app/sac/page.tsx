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
  move: string;    // UCI
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
    const moves = chess.moves({ verbose: true });
    const m = moves.find(mv => mv.from === from && mv.to === to);
    if (!m) return false;
    const movedVal = PIECE_VALUES[m.piece] ?? 0;
    // Exchange sacrifice: moved piece > captured, or landing on attacked square
    if (m.captured) {
      const capVal = PIECE_VALUES[m.captured] ?? 0;
      if (movedVal > capVal) return true;
    }
    // Check if destination attacked by an opponent piece after move
    chess.move({ from, to, promotion: m.promotion });
    const opp = m.color === 'w' ? 'b' : 'w';
    return chess.isAttacked(to as Square, opp);
  } catch {
    return false;
  }
}

function findSacrificeCandidates(pgn: string): Array<{ fen: string; uci: string }> {
  const results: Array<{ fen: string; uci: string }> = [];
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    const replay = new Chess();

    for (const m of history) {
      const fen = replay.fen();
      const uci = m.from + m.to;
      if (isSacrifice(fen, uci)) {
        results.push({ fen, uci });
      }
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    }
  } catch {}
  return results;
}

function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const r = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    return r?.san ?? uci;
  } catch { return uci; }
}

function cpToPawns(cp: number): string {
  return (cp / 100).toFixed(2);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SacPage() {
  const { boardTheme, customPieces, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();
  const { getEval, isReady: engineReady } = useStockfish();

  const [tab, setTab]           = useState<'train' | 'prepare'>('train');
  const [positions, setPositions] = useState<SacPosition[]>([]);
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState<SacStats>({ total: 0, correct: 0, streak: 0, missedReal: 0, wrongFake: 0 });

  // Training state
  const [current, setCurrent]   = useState<SacPosition | null>(null);
  const [answered, setAnswered] = useState<{ answer: 'sac' | 'calm'; ok: boolean; eval_before: number | null; eval_after: number | null } | null>(null);
  const [sacMoveApplied, setSacMoveApplied] = useState(false);

  // Preparation state
  const [preparing, setPreparing]   = useState(false);
  const [prepStop, setPrepStop]     = useState(false);
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

    // Compute stats
    const logs = logRes.data ?? [];
    let streak = 0;
    for (const l of logs) {
      if (!l.ok) break;
      streak++;
    }
    const missed = logs.filter((l: { answer: string; ok: boolean }) => l.answer === 'calm' && !l.ok).length;
    const wrong  = logs.filter((l: { answer: string; ok: boolean }) => l.answer === 'sac'  && !l.ok).length;
    setStats({ total: logs.length, correct: logs.filter((l: { ok: boolean }) => l.ok).length, streak, missedReal: missed, wrongFake: wrong });

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

    if (answer === 'sac') {
      // Show the sacrifice move on the board
      setSacMoveApplied(true);
    }

    // Update stats locally
    setStats(s => ({
      ...s,
      total:     s.total + 1,
      correct:   ok ? s.correct + 1 : s.correct,
      streak:    ok ? s.streak + 1 : 0,
      missedReal: (!ok && answer === 'calm') ? s.missedReal + 1 : s.missedReal,
      wrongFake:  (!ok && answer === 'sac')  ? s.wrongFake  + 1 : s.wrongFake,
    }));

    await supabase.from('sac_log').insert({
      position_id: current.id,
      answer,
      ok,
    });
  }

  function nextPosition() {
    pickRandom(positions);
  }

  // ── Prepare mode ─────────────────────────────────────────────────────────

  async function handlePrepare() {
    if (!engineReady) return;
    setPreparing(true);
    setPrepStop(false);
    prepStopRef.current = false;

    // Load master games
    const { data: games } = await supabase.from('master_games').select('id,pgn').limit(500);
    if (!games || games.length === 0) {
      setPreparing(false);
      return;
    }

    const total = games.length;
    setPrepProgress({ done: 0, total, saved: 0 });
    let saved = 0;

    for (let i = 0; i < games.length; i++) {
      if (prepStopRef.current) break;
      const game = games[i] as { id: string; pgn: string };

      const candidates = findSacrificeCandidates(game.pgn);
      for (const cand of candidates) {
        if (prepStopRef.current) break;
        // Evaluate before the sacrifice move
        const evalBefore = await new Promise<EvalResult>(resolve => {
          getEval(cand.fen, 12, resolve);
        });
        // Apply the move and evaluate after
        const afterFen = (() => {
          try {
            const ch = new Chess(cand.fen);
            ch.move({ from: cand.uci.slice(0,2), to: cand.uci.slice(2,4) });
            return ch.fen();
          } catch { return null; }
        })();
        if (!afterFen) continue;
        // Eval after (from the same side's POV — negate since it's opponent's turn)
        const evalAfter = await new Promise<EvalResult>(resolve => {
          getEval(afterFen, 12, resolve);
        });

        const cpBefore = evalBefore.cp ?? (evalBefore.mate != null ? (evalBefore.mate > 0 ? 9999 : -9999) : 0);
        // evalAfter is from opponent's POV, negate
        const cpAfter  = -(evalAfter.cp ?? (evalAfter.mate != null ? (evalAfter.mate > 0 ? 9999 : -9999) : 0));

        const delta = cpBefore - cpAfter; // positive = sacrifice hurts
        let kind: 'real' | 'fake' | null = null;
        if (delta <= 30)  kind = 'real';  // sacrifice doesn't cost much (<= 0.3 pawns)
        if (delta >= 100) kind = 'fake';  // clearly bad (>= 1 pawn loss)
        if (!kind) continue; // ambiguous, skip

        await supabase.from('sac_positions').upsert({
          fen:         cand.fen,
          move:        cand.uci,
          kind,
          eval_before: cpBefore,
          eval_after:  cpAfter,
          source:      'master',
        }, { onConflict: 'fen,move' });
        // Ignore duplicate error — just count successes
        saved++;
        setPrepProgress(p => ({ ...p, saved }));
      }

      setPrepProgress(p => ({ ...p, done: i + 1 }));
    }

    setPreparing(false);
    // Reload positions
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

  // ── Current board FEN ─────────────────────────────────────────────────────

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

  const boardKey = `${boardThemeId}-${pieceStyleId}`;

  // ── Explanation text ──────────────────────────────────────────────────────

  function explainResult(): string {
    if (!answered || !current) return '';
    const { eval_before, eval_after, ok } = answered;
    if (ok && current.kind === 'real') {
      if (eval_after != null && eval_after > 50) return `Движок подтверждает: позиция лучше на ${cpToPawns(eval_after)} пешки. Жертва работает!`;
      if (eval_after != null && Math.abs(eval_after) <= 50) return 'Компенсация достаточна — позиция примерно равна, но с инициативой.';
      return 'Жертва оправдана — активность фигур и атакующий потенциал перевешивают материал.';
    }
    if (ok && current.kind === 'fake') {
      if (eval_before != null && eval_after != null) {
        const loss = eval_before - eval_after;
        return `Верно — эта жертва теряет около ${cpToPawns(loss)} пешки без компенсации.`;
      }
      return 'Верно — жертва не оправдана.';
    }
    if (!ok && current.kind === 'real') return `Ты пропустил жертву! Движок оценивает позицию после жертвы лучше на ${eval_after != null ? cpToPawns(eval_after) : '?'} пешки.`;
    if (!ok && current.kind === 'fake') return 'Эта жертва не работает — противник просто забирает материал без достаточной компенсации.';
    return '';
  }

  if (loading) return (
    <main style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</main>
  );

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 20px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/masters" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Мастера</Link>
        <h1 style={{ margin: '10px 0 4px', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)' }}>
          Жертвовать или нет?
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
          Тренажёр чутья на жертву в стиле Таля
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--hairline)' }}>
        {(['train', 'prepare'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13,
              background: 'transparent',
              color: tab === t ? 'var(--ivory)' : 'var(--muted)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === 'train' ? 'Тренажёр' : 'Подготовить позиции'}
          </button>
        ))}
      </div>

      {/* ── Train tab ── */}
      {tab === 'train' && (
        <>
          {positions.length === 0 ? (
            <div style={{
              padding: '40px 20px', textAlign: 'center',
              border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)',
            }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>♟</div>
              <div style={{ fontSize: 15, color: 'var(--ivory)', marginBottom: 8 }}>Позиций пока нет</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                Сначала загрузи партии мастеров и запусти подготовку позиций.
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <Link href="/masters" style={linkBtnStyle}>Загрузить партии</Link>
                <button onClick={() => setTab('prepare')} style={outlineBtnStyle}>Подготовить позиции</button>
              </div>
            </div>
          ) : current && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,420px) 1fr', gap: 28, alignItems: 'start' }}>
              {/* Board */}
              <div>
                <div style={{ width: '100%', aspectRatio: '1', border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
                  <Chessboard
                    key={boardKey + displayFen}
                    options={{
                      position: displayFen,
                      boardOrientation: current.fen.includes(' w ') ? 'white' : 'black',
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
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                  {current.fen.includes(' w ') ? 'Ход белых' : 'Ход чёрных'}
                  {!answered && ' · ' + (current.fen.includes(' w ') ? 'Белые' : 'Чёрные') + ' могут пойти ' + uciToSan(current.fen, current.move)}
                </div>
              </div>

              {/* Controls */}
              <div>
                {/* Stats row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20,
                }}>
                  {[
                    { label: 'Верных', value: stats.total > 0 ? `${Math.round(100*stats.correct/stats.total)}%` : '—' },
                    { label: 'Серия', value: stats.streak },
                    { label: 'Пропустил', value: stats.missedReal },
                    { label: 'Ложная', value: stats.wrongFake },
                  ].map(s => (
                    <div key={s.label} style={{
                      padding: '10px 12px',
                      background: 'var(--surface)', border: '1px solid var(--hairline)',
                      borderRadius: 'var(--radius-card)', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)' }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Prompt */}
                {!answered && (
                  <div style={{
                    marginBottom: 20, padding: '14px 18px',
                    background: 'var(--surface)', border: '1px solid var(--hairline)',
                    borderRadius: 'var(--radius-card)',
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 6 }}>
                      Стоит ли пойти {uciToSan(current.fen, current.move)}?
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                      Это возможная жертва материала. Выбери своё решение.
                    </div>
                  </div>
                )}

                {/* Buttons */}
                {!answered && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                    <button
                      onClick={() => handleAnswer('sac')}
                      style={{
                        flex: 1, height: 48, borderRadius: 'var(--radius-btn)',
                        background: 'rgba(129,182,76,0.15)', color: '#81B64C',
                        border: '1px solid rgba(129,182,76,0.4)',
                        fontSize: 15, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      ⚡ Жертвую
                    </button>
                    <button
                      onClick={() => handleAnswer('calm')}
                      style={{
                        flex: 1, height: 48, borderRadius: 'var(--radius-btn)',
                        background: 'var(--surface)', color: 'var(--ivory)',
                        border: '1px solid var(--hairline)',
                        fontSize: 15, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      🛡 Играю спокойно
                    </button>
                  </div>
                )}

                {/* Result */}
                {answered && (
                  <div style={{
                    marginBottom: 20, padding: '16px 18px',
                    background: answered.ok ? 'rgba(129,182,76,0.12)' : 'rgba(200,80,80,0.1)',
                    border: `1px solid ${answered.ok ? 'rgba(129,182,76,0.35)' : 'rgba(200,80,80,0.3)'}`,
                    borderRadius: 'var(--radius-card)',
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ivory)', marginBottom: 8 }}>
                      {answered.ok ? '✓ Правильно!' : '✗ Неверно'}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
                      {explainResult()}
                    </div>
                    {answered.eval_before != null && answered.eval_after != null && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                        Оценка до жертвы: {cpToPawns(answered.eval_before)} · После: {cpToPawns(answered.eval_after)}
                      </div>
                    )}
                    <button onClick={nextPosition} style={accentBtnStyle}>
                      Следующая позиция →
                    </button>
                  </div>
                )}

                {/* Source info */}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Позиция {positions.indexOf(current) + 1} из {positions.length} · {current.kind === 'real' ? 'Реальная жертва' : 'Ложная жертва'} (показывается после ответа)
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Prepare tab ── */}
      {tab === 'prepare' && (
        <div style={{ maxWidth: 600 }}>
          <div style={{
            padding: 24, marginBottom: 20,
            background: 'var(--surface)', border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-card)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 8 }}>
              Подготовка позиций
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
              Система сканирует партии мастеров, находит возможные жертвы материала и оценивает их движком (глубина 12).
              Жертвы с оценкой ≤ −0.3 пешки классифицируются как «реальные», с оценкой ≥ −1.0 — как «ложные».
              <br/><br/>
              Текущих позиций в базе: <strong style={{ color: 'var(--ivory)' }}>{positions.length}</strong>
            </div>
            {!preparing ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  onClick={handlePrepare}
                  disabled={!engineReady}
                  style={{ ...accentBtnStyle, opacity: engineReady ? 1 : 0.5 }}
                >
                  {engineReady ? 'Подготовить позиции' : 'Движок загружается…'}
                </button>
                {positions.length > 0 && (
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Запуск добавит новые позиции
                  </span>
                )}
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                    Партий обработано: {prepProgress.done} / {prepProgress.total} · Позиций найдено: {prepProgress.saved}
                  </div>
                  <div style={{
                    height: 6, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: 'var(--accent)',
                      width: prepProgress.total > 0 ? `${100 * prepProgress.done / prepProgress.total}%` : '0%',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
                <button onClick={stopPrepare} style={outlineBtnStyle} disabled={prepStop}>
                  {prepStop ? 'Остановка…' : 'Стоп'}
                </button>
              </div>
            )}
          </div>

          <div style={{
            padding: '14px 18px',
            background: 'var(--surface)', border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-card)',
          }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--ivory)' }}>Нет партий?</strong>{' '}
              Сначала <Link href="/masters" style={{ color: 'var(--accent)', textDecoration: 'none' }}>загрузи партии мастеров</Link> через импорт PGN.
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 700px) {
          .sac-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const accentBtnStyle: React.CSSProperties = {
  height: 38, padding: '0 18px', borderRadius: 'var(--radius-btn)',
  background: 'var(--accent)', color: '#fff', border: 'none',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const outlineBtnStyle: React.CSSProperties = {
  height: 38, padding: '0 18px', borderRadius: 'var(--radius-btn)',
  background: 'transparent', color: 'var(--ivory)',
  border: '1px solid var(--hairline)', fontSize: 14, cursor: 'pointer',
};

const linkBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  height: 38, padding: '0 18px', borderRadius: 'var(--radius-btn)',
  background: 'var(--accent)', color: '#fff',
  fontSize: 14, fontWeight: 600, textDecoration: 'none',
};
