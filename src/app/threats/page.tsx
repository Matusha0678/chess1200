'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import { findThreats, threatExplanation } from '@/lib/threats';
import type { Threat } from '@/lib/threats';
import { Board } from '@/components/board/Board';
import type { BoardArrow } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { SessionPanel } from '@/components/trainer/SessionPanel';
import { FeedbackCard } from '@/components/ui/FeedbackCard';
import { Kbd } from '@/components/ui/Kbd';
import { ProgressBar } from '@/components/ui/ProgressBar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  fen: string;
  myColor: 'w' | 'b';
  game_id?: string | null;
}

type Phase = 'loading' | 'marking' | 'revealed' | 'defensive' | 'done';

interface SessionScore {
  found: number;
  missed: number;
  falseAlarms: number;
  xp: number;
  streak: number;
}

const BLITZ_SECONDS = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function colorOf(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] as 'w' | 'b';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ThreatsPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<Position[]>([]);
  const [posIdx, setPosIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [marked, setMarked] = useState<Set<Square>>(new Set());
  const [threats, setThreats] = useState<Threat[]>([]);
  const [score, setScore] = useState<SessionScore>({ found: 0, missed: 0, falseAlarms: 0, xp: 0, streak: 0 });
  const [defensiveMoveResult, setDefensiveMoveResult] = useState<'correct' | 'wrong' | null>(null);
  const [blitzMode, setBlitzMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(BLITZ_SECONDS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [oppName, setOppName] = useState('Соперник');

  const { S } = useTrainerGeometry();

  const { getBestMove, startAnalysis, stopAnalysis, isReady } = useStockfish();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const posStartRef = useRef<number>(Date.now());
  const lastEvalRef = useRef<number>(0);

  // load player username once
  useEffect(() => {
    supabase.from('games_sync_state').select('username').eq('id', 1).maybeSingle()
      .then(({ data }) => {
        if (data) setPlayerName((data as { username: string }).username);
      });
  }, []);

  // ── Load positions ──────────────────────────────────────────────────────────

  useEffect(() => {
    void loadPositions();
  }, []);

  async function loadPositions() {
    setLoadError(null);

    const { data: gaRows } = await supabase
      .from('game_analysis')
      .select('fen_before, color, game_id')
      .order('created_at', { ascending: false })
      .limit(60);

    const { data: mcRows } = await supabase
      .from('mistake_cards')
      .select('fen_before, game_id')
      .order('created_at', { ascending: false })
      .limit(60);

    const seen = new Set<string>();
    const pool: Position[] = [];

    for (const row of gaRows ?? []) {
      if (!row.fen_before || seen.has(row.fen_before)) continue;
      seen.add(row.fen_before);
      const myColor = (row.color ?? 'w') as 'w' | 'b';
      pool.push({ fen: row.fen_before, myColor, game_id: (row as { game_id?: string | null }).game_id });
    }

    for (const row of mcRows ?? []) {
      if (!row.fen_before || seen.has(row.fen_before)) continue;
      seen.add(row.fen_before);
      const myColor = colorOf(row.fen_before);
      pool.push({ fen: row.fen_before, myColor, game_id: row.game_id });
    }

    if (pool.length === 0) {
      setLoadError('Нет позиций для тренировки. Сначала проанализируй партии в разделе Партии.');
      return;
    }

    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    setPositions(pool);
    setPosIdx(0);
    setPhase('marking');
    posStartRef.current = Date.now();
  }

  // load opp name when position changes
  useEffect(() => {
    const pos = positions[posIdx];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!pos?.game_id) { setOppName('Соперник'); return; }
    supabase
      .from('games')
      .select('opp_name')
      .eq('id', pos.game_id)
      .maybeSingle()
      .then(({ data }) => {
        setOppName((data as { opp_name: string } | null)?.opp_name ?? 'Соперник');
      });
  }, [posIdx, positions]);

  // ── Blitz timer ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!blitzMode || phase !== 'marking') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeLeft(BLITZ_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          void reveal();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blitzMode, posIdx, phase]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'Enter' || e.key === 'e' || e.key === 'E') && phase === 'marking') {
        e.preventDefault();
        void reveal();
      }
      if ((e.key === 'n' || e.key === 'N') && phase === 'marking') {
        e.preventDefault();
        void reveal();
      }
      if (e.key === ' ' && (phase === 'revealed' || phase === 'defensive')) {
        e.preventDefault();
        nextPosition();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, posIdx]);

  // ── Current position ─────────────────────────────────────────────────────────

  const pos = positions[posIdx];

  // ── Mark / unmark squares ────────────────────────────────────────────────────

  function handleSquareClick(sq: Square) {
    if (phase !== 'marking') return;
    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(sq)) next.delete(sq);
      else next.add(sq);
      return next;
    });
  }

  // ── Reveal threats ───────────────────────────────────────────────────────────

  async function reveal() {
    if (!pos) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const computed = findThreats(pos.fen, pos.myColor);
    setThreats(computed);

    const timeTaken = Date.now() - posStartRef.current;

    const threatenedSquares = new Set(computed.map(t => t.square));
    let found = 0;
    let falseAlarms = 0;

    for (const sq of marked) {
      if (threatenedSquares.has(sq)) found++;
      else falseAlarms++;
    }
    const missed = computed.filter(t => !marked.has(t.square)).length;

    const roundXp = found * 15 - missed * 5 - falseAlarms * 5;
    const xpGain = Math.max(0, roundXp);

    setScore(prev => ({
      found: prev.found + found,
      missed: prev.missed + missed,
      falseAlarms: prev.falseAlarms + falseAlarms,
      xp: prev.xp + xpGain,
      streak: found > 0 && missed === 0 && falseAlarms === 0
        ? prev.streak + 1
        : 0,
    }));

    await supabase.from('threat_log').insert({
      fen: pos.fen,
      found,
      missed,
      false_alarms: falseAlarms,
      time_taken_ms: timeTaken,
    });

    setPhase(computed.length > 0 ? 'revealed' : 'done');
  }

  // ── Defensive move phase ─────────────────────────────────────────────────────

  function startDefensivePhase() {
    setDefensiveMoveResult(null);
    setPhase('defensive');
    if (pos) {
      lastEvalRef.current = 0;
      startAnalysis(pos.fen, info => {
        if (info.cp !== undefined) lastEvalRef.current = info.cp;
      });
    }
  }

  const handleDefensiveMove = useCallback(({ from, to }: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }): boolean => {
    if (phase !== 'defensive' || !pos) return false;

    const chess = new Chess(pos.fen);
    let moveResult;
    try {
      moveResult = chess.move({ from, to, promotion: 'q' });
    } catch {
      return false;
    }
    if (!moveResult) return false;

    const newFen = chess.fen();
    stopAnalysis();

    getBestMove(newFen, 10, () => {
      const evalBefore = lastEvalRef.current;
      startAnalysis(newFen, info => {
        if (info.cp !== undefined) {
          const evalAfter = info.cp;
          const myColor = pos.myColor;
          const improvement = myColor === 'w'
            ? evalAfter - evalBefore
            : evalBefore - evalAfter;

          stopAnalysis();
          setDefensiveMoveResult(improvement >= -50 ? 'correct' : 'wrong');
        }
      });
    });

    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pos]);

  // ── Next position ────────────────────────────────────────────────────────────

  function nextPosition() {
    stopAnalysis();
    const next = posIdx + 1;
    if (next >= positions.length) {
      setPhase('done');
      return;
    }
    setPosIdx(next);
    setMarked(new Set());
    setThreats([]);
    setDefensiveMoveResult(null);
    posStartRef.current = Date.now();
    setPhase('marking');
  }

  // ── Board tints ──────────────────────────────────────────────────────────────

  function buildTints(): Partial<Record<Square, string>> {
    const tints: Partial<Record<Square, string>> = {};

    if (phase === 'marking') {
      for (const sq of marked) {
        tints[sq] = 'rgba(255,200,0,0.45)';
      }
    }

    if (phase === 'revealed' || phase === 'defensive') {
      const threatenedSquares = new Set(threats.map(t => t.square));
      for (const sq of marked) {
        if (threatenedSquares.has(sq)) {
          tints[sq] = 'rgba(80,200,80,0.5)';
        } else {
          tints[sq] = 'rgba(255,100,100,0.4)';
        }
      }
      for (const threat of threats) {
        if (!marked.has(threat.square)) {
          tints[threat.square] = 'rgba(255,80,80,0.55)';
        }
        for (const atk of threat.attackers) {
          if (!tints[atk]) {
            tints[atk] = 'rgba(255,160,0,0.35)';
          }
        }
      }
    }

    return tints;
  }

  // ── Build threat arrows ───────────────────────────────────────────────────────

  function buildArrows(): BoardArrow[] {
    if (phase !== 'revealed' && phase !== 'defensive') return [];
    const arrows: BoardArrow[] = [];
    for (const threat of threats) {
      for (const atk of threat.attackers) {
        arrows.push({
          from: atk as Square,
          to: threat.square,
          color: 'rgba(220,50,50,0.75)',
          style: 'solid',
          opacity: 0.75,
        });
      }
    }
    return arrows;
  }

  // ── Restart ───────────────────────────────────────────────────────────────────

  function handleRestart() {
    setScore({ found: 0, missed: 0, falseAlarms: 0, xp: 0, streak: 0 });
    setPositions([]);
    setPhase('loading');
    void loadPositions();
  }

  // ── Done screen ───────────────────────────────────────────────────────────────

  // ── Session panel (shared across all states) ──────────────────────────────

  const sessionPanelShared = (
    <SessionPanel
      title="Сессия"
      rightNote={positions.length > 0 ? `осталось ${Math.max(0, positions.length - posIdx)}` : undefined}
      stats={[
        { value: score.found, label: 'нашёл', color: '#81B64C' },
        { value: score.missed, label: 'пропустил', color: '#E0574A' },
        { value: score.falseAlarms, label: 'лишних', color: '#F4B45C' },
      ]}
      list={<></>}
    />
  );

  if (phase === 'done') {
    return (
      <TrainerLayout
        session={sessionPanelShared}
        topBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Соперник</span>}
        board={
          <Board
            fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            orientation="white"
            size={S}
            interactive={false}
          />
        }
        bottomBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Ты</span>}
        panel={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div data-ui="panel-header" style={{ padding: '20px 24px 18px', flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Тренировка · Угрозы</div>
              <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
                Итоги сессии
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              <div data-ui="threat-task" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Найдено', value: score.found, color: '#81B64C' },
                  { label: 'Пропущено', value: score.missed, color: '#E0574A' },
                  { label: 'Ложных', value: score.falseAlarms, color: '#F4B45C' },
                  { label: 'XP', value: `+${score.xp}`, color: 'var(--ivory)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '12px 16px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)' }}>
                    <b style={{ display: 'block', fontSize: 24, color, fontVariantNumeric: 'tabular-nums' }}>{value}</b>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
                  </div>
                ))}
              </div>
              <div data-ui="threat-rules" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, minHeight: 20 }}>
                {score.streak > 2 ? `Серия точных ответов: ${score.streak}` : ''}
              </div>
              <div data-ui="threat-marked" style={{ fontSize: 13, color: 'var(--muted)', minHeight: 20 }}>{'\xa0'}</div>
            </div>
            <div data-ui="panel-actions" style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleRestart}
                style={{
                  height: 52, fontSize: 18, fontWeight: 700,
                  background: '#81B64C', boxShadow: '0 4px 0 #5E8C35',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
                }}
              >
                Начать заново
              </button>
            </div>
          </div>
        }
      />
    );
  }

  // ── Loading / error ───────────────────────────────────────────────────────────

  if (phase === 'loading' || loadError) {
    return (
      <TrainerLayout
        session={sessionPanelShared}
        topBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Соперник</span>}
        board={
          <Board
            fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            orientation="white"
            size={S}
            interactive={false}
          />
        }
        bottomBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Ты</span>}
        panel={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div data-ui="panel-header" style={{ padding: '20px 24px 18px', flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Тренировка · Угрозы</div>
              <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
                {loadError ? 'Ошибка' : 'Загрузка…'}
              </div>
            </div>
            <div style={{ flex: 1, padding: '0 24px' }}>
              <div data-ui="threat-task" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 15, color: 'var(--ivory)', lineHeight: 1.5 }}>
                  {loadError ?? 'Загружаем позиции…'}
                </div>
              </div>
              <div data-ui="threat-rules" style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {loadError ? 'Нужно сначала проанализировать партии' : 'Подготовка…'}
                </div>
              </div>
              <div data-ui="threat-marked" style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
                Нет отметок
              </div>
              {loadError && (
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={() => router.push('/games/analyze')}
                    style={{ height: 44, padding: '0 20px', fontSize: 15, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit' }}
                  >
                    Анализ партий
                  </button>
                </div>
              )}
            </div>
            <div data-ui="panel-actions" style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{loadError ? 'Загрузите данные, чтобы начать' : 'Загрузка…'}</div>
            </div>
          </div>
        }
      />
    );
  }

  // ── Normal render ─────────────────────────────────────────────────────────────

  const boardOrientation: 'white' | 'black' = pos?.myColor === 'w' ? 'white' : 'black';
  const isWhite = boardOrientation === 'white';

  const boardNode = (
    <Board
      fen={pos?.fen ?? 'start'}
      orientation={boardOrientation}
      size={S}
      interactive={phase === 'defensive'}
      onMove={phase === 'defensive' ? handleDefensiveMove : undefined}
      onSquareClick={phase === 'marking' ? handleSquareClick : undefined}
      tints={buildTints()}
      arrows={buildArrows()}
    />
  );

  // ── Session list items ─────────────────────────────────────────────────────

  const sessionList = (
    <>
      {positions.map((p, i) => {
        const isCur = i === posIdx;
        const isDone = i < posIdx;
        return (
          <div key={p.fen + i} style={{
            display: 'grid',
            gridTemplateColumns: '26px 1fr',
            alignItems: 'center',
            gap: 8,
            height: 50,
            padding: '0 10px',
            borderRadius: 10,
            position: 'relative',
            background: isCur ? 'var(--track)' : 'transparent',
            opacity: isDone ? 0.5 : 1,
          }}>
            {isCur && (
              <div style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: '#81B64C' }} />
            )}
            <div style={{ display: 'grid', placeItems: 'center', fontSize: 13, color: isCur ? '#81B64C' : 'var(--control)', fontWeight: isCur ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
              {isDone ? <span style={{ color: '#81B64C', fontSize: 15 }}>✓</span> : <span>{i + 1}</span>}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: isDone ? 'var(--control)' : 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Позиция {i + 1}
              </div>
              <div style={{ fontSize: 13, color: 'var(--control)', marginTop: 1 }}>
                {/* Don't reveal threat type until answered */}
                {isDone ? 'проверено' : isCur ? 'текущая' : 'ожидает'}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );

  // ── Blitz mode toggle ───────────────────────────────────────────────────────

  const blitzToggle = (
    <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--hairline)', overflow: 'hidden' }}>
      {(['Обычный', 'Блиц 60с'] as const).map((label, i) => {
        const active = i === 0 ? !blitzMode : blitzMode;
        return (
          <button
            key={label}
            onClick={() => setBlitzMode(i === 1)}
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

  // Per-position result for revealed
  const foundCount = [...marked].filter(sq => threats.some(t => t.square === sq)).length;
  const missedCount = threats.filter(t => !marked.has(t.square)).length;

  // ── Player bars ────────────────────────────────────────────────────────────

  const topBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--track)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>{isWhite ? '♟' : '♙'}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>{oppName}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{isWhite ? 'чёрные' : 'белые'}</span>
      </div>
    </div>
  );

  const bottomBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--track)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>{isWhite ? '♙' : '♟'}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>{playerName || 'ты'}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{isWhite ? 'ты · белые' : 'ты · чёрные'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {blitzMode && phase === 'marking' && (
          <>
            <div style={{ width: 80, height: 3, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: timeLeft < 10 ? '#E0574A' : 'var(--ivory)', width: `${(timeLeft / BLITZ_SECONDS) * 100}%`, transition: 'width 1s linear' }} />
            </div>
            <span data-allow-small style={{ fontSize: 13, color: timeLeft < 10 ? '#E0574A' : 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {timeLeft}с
            </span>
          </>
        )}
        {phase !== 'marking' && (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>твой ход</span>
        )}
      </div>
    </div>
  );

  // ── Panel content ──────────────────────────────────────────────────────────

  const isRevealed = phase === 'revealed' || phase === 'defensive';

  const panelNode = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div data-ui="panel-header" style={{ padding: '20px 24px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <span>Тренировка · Проверка угроз</span>
          {positions.length > 0 && (
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
              {posIdx + 1} / {positions.length}
            </span>
          )}
        </div>
        <ProgressBar value={posIdx} max={positions.length} height={4} />
        <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          {phase === 'marking' ? 'Что хочет соперник?' : phase === 'defensive' ? 'Защитись' : 'Результат'}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 24px' }}>

        {/* Phase: marking */}
        {phase === 'marking' && (
          <>
            <div data-ui="threat-task" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, color: 'var(--ivory)', lineHeight: 1.5, marginBottom: 6 }}>
                Кликни на свои фигуры, которым угрожает опасность.
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Шах, зевок фигуры, вилка</div>
            </div>

            <div data-ui="threat-rules" style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                Клик по фигуре — отметить · ещё клик — снять
              </div>
            </div>

            <div data-ui="threat-marked" style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: marked.size > 0 ? 'var(--ivory)' : 'var(--muted)' }}>
              {marked.size > 0
                ? `Отмечено: ${[...marked].join(', ')}`
                : 'Нет отметок — кликни на фигуру'}
            </div>
          </>
        )}

        {/* Phase: revealed */}
        {isRevealed && (
          <>
            {/* Feedback card */}
            <div data-ui="threat-card" style={{ marginBottom: 16 }}>
              {threats.length === 0 ? (
                <FeedbackCard variant="success" title={marked.size === 0 ? 'Верно! Угроз нет' : 'Угроз нет'}>
                  {marked.size > 0 ? 'Соперник не угрожает ничему серьёзному.' : 'Позиция в порядке — прямых угроз нет.'}
                </FeedbackCard>
              ) : (
                <FeedbackCard
                  variant={missedCount === 0 && foundCount === threats.length ? 'success' : missedCount > 0 ? 'danger' : 'warning'}
                  title={
                    missedCount === 0 && foundCount === threats.length
                      ? `Нашёл ${foundCount} из ${threats.length}`
                      : missedCount > 0
                      ? `Пропустил ${missedCount}`
                      : `Лишних: ${marked.size - foundCount}`
                  }
                >
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap', marginTop: 4 }}>
                    <span>Нашёл: <strong style={{ color: '#81B64C' }}>{foundCount}</strong></span>
                    <span>Пропустил: <strong style={{ color: missedCount > 0 ? '#E0574A' : 'var(--ivory)' }}>{missedCount}</strong></span>
                  </div>
                </FeedbackCard>
              )}
            </div>

            {/* Threat list */}
            {threats.length > 0 && (
              <div data-ui="threat-marks" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {threats.map((t, i) => (
                  <div key={i} style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#F4B45C' }}>
                        {t.type === 'check' ? 'Шах' : t.type === 'hanging' ? 'Зевок' : 'Вилка'}
                      </span>
                      <span style={{ fontSize: 13, color: marked.has(t.square) ? '#81B64C' : '#E0574A', fontWeight: 600 }}>
                        {marked.has(t.square) ? '✓ Нашёл' : '✗ Пропустил'}
                      </span>
                    </div>
                    <span style={{ fontSize: 14, color: 'var(--ivory)' }}>
                      {pos ? threatExplanation(t, pos.fen) : ''}
                    </span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                        Клетка: <strong style={{ color: 'var(--ivory)' }}>{t.square.toUpperCase()}</strong>
                      </span>
                      {t.attackers.length > 0 && (
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                          Атакует: <strong style={{ color: 'var(--ivory)' }}>{t.attackers.map(a => a.toUpperCase()).join(', ')}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Defensive phase result */}
            {phase === 'defensive' && (
              <div data-ui="threat-defense" style={{ marginBottom: 16 }}>
                {defensiveMoveResult === 'correct' && (
                  <FeedbackCard variant="success" title="Угроза нейтрализована!">
                    Хороший ход — позиция улучшилась.
                  </FeedbackCard>
                )}
                {defensiveMoveResult === 'wrong' && (
                  <FeedbackCard variant="danger" title="Угроза не снята">
                    Попробуй другой ход.
                  </FeedbackCard>
                )}
                {!defensiveMoveResult && (
                  <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, fontSize: 14, color: 'var(--ivory)' }}>
                    Сделай ход, который нейтрализует угрозу.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: actions */}
      <div data-ui="panel-actions" style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {phase === 'marking' && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => void reveal()}
                style={{
                  flex: 1, height: 52, fontSize: 18, fontWeight: 700,
                  background: '#81B64C', boxShadow: '0 4px 0 #5E8C35',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}
              >
                {marked.size === 0 ? 'Угроз нет' : 'Проверить'}
                <Kbd>{marked.size === 0 ? 'N' : 'Enter'}</Kbd>
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--control)' }}>
              Клик по фигуре — отметить · Enter — проверить · N — угроз нет
            </div>
          </>
        )}

        {phase === 'revealed' && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              {threats.length > 0 && isReady && (
                <button
                  onClick={startDefensivePhase}
                  style={{
                    flex: 1, height: 44, fontSize: 15, fontWeight: 600,
                    background: 'var(--surface-2)', border: '1px solid var(--hairline-2)',
                    color: 'var(--ivory)', cursor: 'pointer',
                    borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  Подсказка защиты
                  <Kbd>H</Kbd>
                </button>
              )}
              <button
                onClick={() => router.push(`/play?fen=${encodeURIComponent(pos?.fen ?? '')}&color=${pos?.myColor ?? 'w'}&level=10&mode=free`)}
                style={{
                  height: 44, padding: '0 16px', fontSize: 15, fontWeight: 600,
                  background: 'var(--surface-2)', border: '1px solid var(--hairline-2)',
                  color: 'var(--ivory)', cursor: 'pointer',
                  borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
                }}
              >
                Сыграть отсюда
              </button>
            </div>
            <button
              onClick={nextPosition}
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
          </>
        )}

        {phase === 'defensive' && (
          <button
            onClick={nextPosition}
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
      </div>
    </div>
  );

  // ── Session panel ──────────────────────────────────────────────────────────

  const sessionPanel = (
    <SessionPanel
      title="Сессия"
      rightNote={positions.length > 0 ? `осталось ${Math.max(0, positions.length - posIdx)}` : undefined}
      stats={[
        { value: score.found, label: 'нашёл', color: '#81B64C' },
        { value: score.missed, label: 'пропустил', color: '#E0574A' },
        { value: score.falseAlarms, label: 'лишних', color: '#F4B45C' },
      ]}
      controls={blitzToggle}
      listLabel="Позиции"
      listRight={positions.length > 0 ? `${posIdx + 1} / ${positions.length}` : undefined}
      list={sessionList}
      footer={
        <button
          onClick={handleRestart}
          style={{
            width: '100%', height: 44, fontSize: 15, fontWeight: 600,
            background: 'var(--surface-2)', border: '1px solid var(--hairline-2)',
            color: 'var(--ivory)', cursor: 'pointer', fontFamily: 'inherit',
            borderRadius: 'var(--radius-btn)',
          }}
        >
          Начать заново
        </button>
      }
    />
  );

  return (
    <TrainerLayout
      session={sessionPanel}
      topBar={topBar}
      board={boardNode}
      bottomBar={bottomBar}
      panel={panelNode}
    />
  );
}
