'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import { Board } from '@/components/board/Board';
import { EvalBar } from '@/components/trainer/EvalBar';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';

// ── Types ─────────────────────────────────────────────────────────────────────

type EvalChoice = 'white' | 'equal' | 'black';
type Factor = 'material' | 'king_safety' | 'activity' | 'pawn_structure' | 'center';

const FACTOR_LABEL: Record<Factor, string> = {
  material:       'Материал',
  king_safety:    'Безопасность короля',
  activity:       'Активность фигур',
  pawn_structure: 'Пешечная структура',
  center:         'Центр и пространство',
};

const FACTORS: Factor[] = ['material', 'king_safety', 'activity', 'pawn_structure', 'center'];

type Mode = 'my_games' | 'masters' | 'all';
type Phase = 'question' | 'result';

interface PositionRow {
  fen: string;
  source: 'my_games' | 'masters';
}

interface Stats {
  total: number;
  correct: number;
  byFactor: Record<Factor, { total: number; correct: number }>;
}

// ── Material helpers ──────────────────────────────────────────────────────────

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function computeFactors(fen: string): Record<Factor, number> {
  const chess = new Chess(fen);
  const board = chess.board();
  const turn = chess.turn();

  let matW = 0, matB = 0;
  for (const row of board) {
    for (const sq of row) {
      if (!sq || sq.type === 'k') continue;
      const v = PIECE_VALUE[sq.type] ?? 0;
      if (sq.color === 'w') matW += v;
      else matB += v;
    }
  }
  const materialAdv = matW - matB;

  function kingFile(color: 'w' | 'b'): number {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq && sq.type === 'k' && sq.color === color) return c;
    }
    return 4;
  }
  function countPawnsNearKing(color: 'w' | 'b'): number {
    const kf = kingFile(color);
    let cnt = 0;
    for (const row of board) {
      for (let c = 0; c < 8; c++) {
        const sq = row[c];
        if (!sq || sq.type !== 'p') continue;
        if (sq.color === color && Math.abs(c - kf) <= 1) cnt++;
      }
    }
    return cnt;
  }
  const kingSafetyAdv = countPawnsNearKing('w') - countPawnsNearKing('b');

  const myMoves = chess.moves({ verbose: false }).length;
  const activityAdv = turn === 'w' ? myMoves / 10 : -myMoves / 10;

  function pawnFiles(color: 'w' | 'b'): number[] {
    const files: number[] = [];
    for (const row of board) for (let c = 0; c < 8; c++) {
      const sq = row[c];
      if (sq && sq.type === 'p' && sq.color === color) files.push(c);
    }
    return files;
  }
  function structurePenalty(files: number[]): number {
    let penalty = 0;
    const counts: number[] = new Array(8).fill(0);
    for (const f of files) counts[f]++;
    for (let f = 0; f < 8; f++) {
      if (counts[f] > 1) penalty += counts[f] - 1;
      if (counts[f] > 0 && counts[f - 1] === 0 && counts[f + 1] === 0) penalty++;
    }
    return penalty;
  }
  const pawnAdv = structurePenalty(pawnFiles('b')) - structurePenalty(pawnFiles('w'));

  const CENTER_SQ = ['d4','d5','e4','e5'];
  let centerW = 0, centerB = 0;
  for (const sq of CENTER_SQ) {
    if (chess.isAttacked(sq as Parameters<typeof chess.isAttacked>[0], 'w')) centerW++;
    if (chess.isAttacked(sq as Parameters<typeof chess.isAttacked>[0], 'b')) centerB++;
  }
  const centerAdv = centerW - centerB;

  return {
    material:       materialAdv,
    king_safety:    kingSafetyAdv,
    activity:       activityAdv,
    pawn_structure: pawnAdv,
    center:         centerAdv,
  };
}

function cpToChoice(cp: number): EvalChoice {
  if (cp >= 70)  return 'white';
  if (cp <= -70) return 'black';
  return 'equal';
}

function factorToChoice(val: number): EvalChoice {
  if (val > 0.3) return 'white';
  if (val < -0.3) return 'black';
  return 'equal';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EvaluatePage() {
  const { S } = useTrainerGeometry();
  const { getEval, isReady } = useStockfish();

  const [mode,     setMode]     = useState<Mode>('all');
  const [phase,    setPhase]    = useState<Phase>('question');
  const [loading,  setLoading]  = useState(true);
  const [fen,      setFen]      = useState('');
  const [myEval,   setMyEval]   = useState<EvalChoice | null>(null);
  const [myFactors,setMyFactors]= useState<Factor[]>([]);
  const [engineCp, setEngineCp] = useState<number | null>(null);
  const [analyzing,setAnalyzing]= useState(false);
  const [stats,    setStats]    = useState<Stats>({ total: 0, correct: 0, byFactor: Object.fromEntries(FACTORS.map(f => [f, { total: 0, correct: 0 }])) as Stats['byFactor'] });
  const [sqlMissing, setSqlMissing] = useState(false);
  const [factors,  setFactors]  = useState<Record<Factor, number> | null>(null);

  const posQueueRef = useRef<PositionRow[]>([]);

  const fetchPositions = useCallback(async () => {
    const positions: PositionRow[] = [];

    if (mode === 'my_games' || mode === 'all') {
      const { data } = await supabase.from('games').select('pgn').limit(20);
      for (const game of (data ?? []) as Array<{ pgn: string }>) {
        try {
          const chess = new Chess();
          chess.loadPgn(game.pgn ?? '');
          const history = chess.history({ verbose: true });
          const eligible = history.filter((_, i) => i >= 11 && i <= 29);
          if (eligible.length === 0) continue;
          const pick = eligible[Math.floor(Math.random() * eligible.length)];
          const replay = new Chess();
          for (const h of history.slice(0, history.indexOf(pick) + 1)) {
            replay.move({ from: h.from, to: h.to, promotion: h.promotion });
          }
          positions.push({ fen: replay.fen(), source: 'my_games' });
        } catch { /* skip */ }
      }
    }

    if (mode === 'masters' || mode === 'all') {
      const { data } = await supabase.from('master_games').select('pgn').limit(10);
      for (const game of (data ?? []) as Array<{ pgn: string }>) {
        try {
          const chess = new Chess();
          chess.loadPgn(game.pgn ?? '');
          const history = chess.history({ verbose: true });
          const eligible = history.filter((_, i) => i >= 11 && i <= 29);
          if (eligible.length === 0) continue;
          const pick = eligible[Math.floor(Math.random() * eligible.length)];
          const replay = new Chess();
          for (const h of history.slice(0, history.indexOf(pick) + 1)) {
            replay.move({ from: h.from, to: h.to, promotion: h.promotion });
          }
          positions.push({ fen: replay.fen(), source: 'masters' });
        } catch { /* skip */ }
      }
    }

    posQueueRef.current = positions.sort(() => Math.random() - 0.5).slice(0, 20);
  }, [mode]);

  async function nextPosition() {
    if (posQueueRef.current.length === 0) {
      await fetchPositions();
    }
    if (posQueueRef.current.length === 0) {
      setLoading(false);
      return;
    }
    const pos = posQueueRef.current.shift()!;
    setFen(pos.fen);
    setMyEval(null);
    setMyFactors([]);
    setEngineCp(null);
    setFactors(computeFactors(pos.fen));
    setPhase('question');
    setLoading(false);
  }

  useEffect(() => {
    void nextPosition();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function handleSubmit() {
    if (!myEval || !fen) return;
    setAnalyzing(true);
    if (isReady) {
      getEval(fen, 12, (result) => {
        const cp = result.cp ?? (result.mate ? (result.mate > 0 ? 9000 : -9000) : 0);
        const turn = fen.split(' ')[1];
        const cpFromWhite = turn === 'w' ? cp : -cp;
        setEngineCp(cpFromWhite);
        setAnalyzing(false);
      });
    } else {
      setAnalyzing(false);
    }
    setPhase('result');

    const engineChoice = engineCp !== null ? cpToChoice(engineCp) : myEval;
    const ok = myEval === engineChoice;
    setStats(prev => {
      const byFactor = { ...prev.byFactor };
      for (const f of myFactors) {
        byFactor[f] = { total: (byFactor[f]?.total ?? 0) + 1, correct: (byFactor[f]?.correct ?? 0) + (ok ? 1 : 0) };
      }
      return { total: prev.total + 1, correct: prev.correct + (ok ? 1 : 0), byFactor };
    });

    try {
      await supabase.from('eval_log').insert({ fen, my_eval: myEval, my_factors: myFactors, engine_cp: engineCp, ok });
    } catch (e) {
      const err = e as { message?: string; code?: string };
      if (err?.message?.includes('does not exist') || err?.code === '42P01') setSqlMissing(true);
    }
  }

  function toggleFactor(f: Factor) {
    setMyFactors(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f].slice(0, 2));
  }

  const engineChoice = engineCp !== null ? cpToChoice(engineCp) : null;
  const turn = fen ? fen.split(' ')[1] as 'w' | 'b' : 'w';

  const panel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Panel header */}
      <div data-ui="panel-header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div data-ui="panel-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>Оцени позицию</div>
        <div data-ui="panel-actions">
          <div className="ui-segmented">
            {(['all', 'my_games', 'masters'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`ui-segment ${mode === m ? 'ui-segment-active' : ''}`}>
                {m === 'all' ? 'Все' : m === 'my_games' ? 'Мои партии' : 'Мастера'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {sqlMissing ? (
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            Таблица <code>eval_log</code> не создана. Выполни <strong>supabase/20-eval-log.sql</strong>.
          </div>
        ) : loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
        ) : !fen ? (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Нет позиций для анализа.</div>
        ) : (
          <>
            {/* Q1 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>1. Кто лучше?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['white', 'equal', 'black'] as EvalChoice[]).map(choice => {
                  const label = choice === 'white' ? 'Белые лучше' : choice === 'equal' ? 'Примерно равно' : 'Чёрные лучше';
                  const isSelected = myEval === choice;
                  const showResult = phase === 'result' && engineChoice !== null;
                  const isCorrect = showResult && choice === engineChoice;
                  const isWrong   = showResult && isSelected && choice !== engineChoice;
                  return (
                    <button
                      key={choice}
                      onClick={() => phase === 'question' && setMyEval(choice)}
                      disabled={phase === 'result'}
                      style={{ height: 36, padding: '0 14px', border: `1px solid ${isCorrect ? 'rgba(100,220,100,0.6)' : isWrong ? 'rgba(220,80,60,0.6)' : isSelected ? 'var(--ivory)' : 'var(--hairline)'}`, background: isCorrect ? 'rgba(100,220,100,0.1)' : isWrong ? 'rgba(220,80,60,0.1)' : isSelected ? 'rgba(255,255,255,0.08)' : 'transparent', color: isCorrect ? 'rgba(100,220,100,0.95)' : isWrong ? 'rgba(220,80,60,0.9)' : 'var(--ivory)', fontSize: 13, cursor: phase === 'question' ? 'pointer' : 'default', fontFamily: 'inherit' }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Q2 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>2. Главный фактор (до 2)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {FACTORS.map(f => {
                  const isSelected = myFactors.includes(f);
                  const fVal = factors?.[f] ?? 0;
                  const fChoice = factorToChoice(fVal);
                  const showResult = phase === 'result';
                  const isCorrect = showResult && isSelected && engineChoice !== null && fChoice === engineChoice;
                  return (
                    <button
                      key={f}
                      onClick={() => phase === 'question' && toggleFactor(f)}
                      disabled={phase === 'result'}
                      style={{ height: 34, padding: '0 12px', border: `1px solid ${isSelected ? 'var(--ivory)' : 'var(--hairline)'}`, background: isCorrect ? 'rgba(100,220,100,0.1)' : isSelected ? 'rgba(255,255,255,0.08)' : 'transparent', color: 'var(--ivory)', fontSize: 13, cursor: phase === 'question' ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span>{FACTOR_LABEL[f]}</span>
                      {showResult && factors && (
                        <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fVal > 0 ? '+' : ''}{fVal.toFixed(1)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit */}
            {phase === 'question' && (
              <button
                onClick={() => void handleSubmit()}
                disabled={!myEval || !isReady}
                style={{ height: 44, padding: '0 24px', background: myEval ? 'var(--ivory)' : 'var(--surface)', color: myEval ? 'var(--ink)' : 'var(--muted)', border: '1px solid var(--hairline)', fontSize: 15, fontWeight: 600, cursor: myEval ? 'pointer' : 'default', fontFamily: 'inherit', alignSelf: 'flex-start' }}
              >
                {!isReady ? 'Загрузка движка…' : 'Ответить'}
              </button>
            )}

            {/* Result */}
            {phase === 'result' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {analyzing && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Анализируем…</div>}
                {engineCp !== null && (
                  <div style={{ padding: '12px 16px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Движок (глубина 12)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: engineChoice === myEval ? 'rgba(100,220,100,0.95)' : 'rgba(220,80,60,0.9)' }}>
                      {engineCp >= 70 ? 'Белые лучше' : engineCp <= -70 ? 'Чёрные лучше' : 'Примерно равно'}
                      <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 8, color: 'var(--muted)' }}>
                        {engineCp > 0 ? '+' : ''}{(engineCp / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => void nextPosition()}
                  style={{ height: 44, padding: '0 24px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}
                >
                  Следующая →
                </button>
              </div>
            )}

            {/* Stats */}
            {stats.total > 0 && (
              <div style={{ padding: '12px 16px', border: '1px solid var(--hairline)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Статистика сессии</div>
                <div style={{ fontSize: 14, color: 'var(--ivory)' }}>
                  Верных оценок: <strong>{stats.correct}</strong> / {stats.total} ({stats.total > 0 ? Math.round(stats.correct / stats.total * 100) : 0}%)
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <TrainerLayout
      topBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>{turn === 'b' ? 'Соперник' : 'Соперник'}</span>}
      board={<Board fen={fen || 'start'} size={S} orientation="white" interactive={false} />}
      evalBar={engineCp !== null ? <EvalBar cp={engineCp} orientation="white" /> : undefined}
      bottomBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>{turn === 'w' ? 'Позиция · белые ходят' : 'Позиция · чёрные ходят'}</span>}
      panel={panel}
    />
  );
}
