'use client';

import Link from 'next/link';
import { TaskPanel } from '@/components/trainer/TaskPanel';
import {
  sanNo, lineText, evalWhite, explain, kindLabel, plural,
  type PreparedItem, type MomentItem, type Verdict, type MomentKind,
} from '@/lib/masters';

interface Answer {
  ply: number;
  pts: 0 | 1 | 2;
  san: string;
  kind: MomentKind;
}

interface ResultData {
  item: PreparedItem;
  userUci: string;
  userSan: string;
  verdict: Verdict;
  pts: 0 | 1 | 2;
  userCpVal: number | null;
}

interface GuessPanelProps {
  phase: 'overview' | 'watch' | 'ask' | 'result' | 'done';
  game: { white: string; black: string; event: string; year: number | null; result: string };
  moves: { ply: number; san: string; uci: string; color: 'w' | 'b'; comment?: string | null }[];
  moments: MomentItem[];
  currentMomentIdx: number | null;
  answers: Answer[];
  record: number | null;
  resultData: ResultData | null;
  hintShown: string | null;
  side: 'white' | 'black';
  whiteSurname: string;
  blackSurname: string;
  displayPly: number;
  watchPaused: boolean;
  analyzing: { done: number; total: number } | null;
  analysisMissing: boolean;
  isDemo: boolean;
  onStart: () => void;
  onNext: () => void;
  onStop: () => void;
  onPause: () => void;
  onJump: () => void;
  onSkipMoment: () => void;
  onHint: () => void;
  onLinePlay: () => void;
  onAgain: () => void;
  onMoveClick: (displayPly: number) => void;
  onRecalcAnalysis?: () => void;
}

function Chip({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 13,
      background: 'var(--hairline)', color: 'var(--muted)', ...style,
    }}>
      {children}
    </span>
  );
}

function PtsSquare({ pts }: { pts: 0 | 1 | 2 }) {
  const bg = pts === 2 ? 'var(--accent)' : pts === 1 ? '#F0A43A' : 'var(--c-bad)';
  return (
    <span style={{
      display: 'inline-block', width: 20, height: 20, lineHeight: '20px', textAlign: 'center',
      background: bg, color: '#fff', fontSize: 13, fontWeight: 700,
      borderRadius: 3, flexShrink: 0,
    }}>
      {pts}
    </span>
  );
}

export function GuessPanel({
  phase, game, moves, moments, currentMomentIdx, answers, record,
  resultData, hintShown, side, whiteSurname, blackSurname,
  displayPly, watchPaused, analyzing, analysisMissing,
  onStart, onNext, onStop, onPause, onJump, onSkipMoment, onHint, onLinePlay, onAgain,
  onMoveClick, onRecalcAnalysis,
}: GuessPanelProps) {
  const mySurname = side === 'white' ? whiteSurname : blackSurname;
  const momentCount = moments.length;
  const totalPts = answers.reduce((s, a) => s + a.pts, 0);
  const maxPts = answers.length * 2;
  const masterHits = answers.filter(a => a.pts === 2).length;
  const currentMoment = currentMomentIdx != null ? moments[currentMomentIdx] : null;
  const breadcrumb = `Мастера · ${game.event || ''}${game.year ? ` ${game.year}` : ''}`;
  const sacCount = moments.filter(m => m.kind === 'sac').length;

  // For the last move label (shown in ask state)
  const lastMoveSan = displayPly > 0 && moves[displayPly - 1]
    ? sanNo(displayPly, moves[displayPly - 1].san)
    : null;

  // Move list grid — shared across states
  const moveGrid = (
    <div data-ui="master-moves" style={{
      padding: '0 24px 16px', display: 'grid',
      gridTemplateColumns: 'auto 1fr 1fr', gap: '2px 4px',
    }}>
      {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => {
        const wPly = i * 2 + 1;
        const bPly = i * 2 + 2;
        const wMove = moves[wPly - 1];
        const bMove = moves[bPly - 1];
        // In session: hide future moves
        const inSession = phase === 'watch' || phase === 'ask' || phase === 'result';
        const wVisible = !inSession || wPly <= displayPly + 1;
        const bVisible = !inSession || bPly <= displayPly + 1;
        if (!wVisible) return null;
        const wAns = answers.find(a => a.ply === wPly);
        const bAns = answers.find(a => a.ply === bPly);
        const wIsCurrent = inSession && wPly === displayPly + 1 && phase === 'ask';
        const bIsCurrent = inSession && bPly === displayPly + 1 && phase === 'ask';
        return (
          <div key={i} style={{ display: 'contents' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13, padding: '2px 0', alignSelf: 'center' }}>{i + 1}.</span>
            <button
              data-ui="master-move"
              data-ply={wPly}
              onClick={() => onMoveClick(wPly)}
              style={{
                padding: '2px 6px', textAlign: 'left', fontSize: 13, border: 'none',
                background: displayPly === wPly ? 'rgba(129,182,76,.2)' : 'transparent',
                color: wIsCurrent ? 'var(--accent)' : 'var(--ivory)', cursor: 'pointer',
                borderRadius: 3, display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {wIsCurrent ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>?</span>
                : wMove?.san ?? ''}
              {wAns && <PtsSquare pts={wAns.pts} />}
            </button>
            {bMove && bVisible ? (
              <button
                data-ui="master-move"
                data-ply={bPly}
                onClick={() => onMoveClick(bPly)}
                style={{
                  padding: '2px 6px', textAlign: 'left', fontSize: 13, border: 'none',
                  background: displayPly === bPly ? 'rgba(129,182,76,.2)' : 'transparent',
                  color: bIsCurrent ? 'var(--accent)' : 'var(--ivory)', cursor: 'pointer',
                  borderRadius: 3, display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {bIsCurrent ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>?</span>
                  : bMove?.san ?? ''}
                {bAns && <PtsSquare pts={bAns.pts} />}
              </button>
            ) : <span />}
          </div>
        );
      })}
    </div>
  );

  // ── Overview ───────────────────────────────────────────────────────────────
  if (phase === 'overview') {
    const analyzingNow = !!analyzing;
    const startDisabled = analyzingNow;
    const startLabel = analyzingNow
      ? `Готовлю партию · ${analyzing!.done} / ${analyzing!.total}`
      : '▶ Начать';

    const chips = (
      <>
        <Chip>{game.event}{game.year ? ` · ${game.year}` : ''}</Chip>
        <Chip>{game.result}</Chip>
        <Chip>{Math.ceil(moves.length / 2)} ходов</Chip>
      </>
    );

    return (
      <TaskPanel
        breadcrumb={<Link href="/masters" style={{ color: 'var(--muted)', textDecoration: 'none' }}>{breadcrumb}</Link> as React.ReactNode as string}
        title={`${whiteSurname} — ${blackSurname}`}
        chips={chips}
        actions={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              data-ui="master-start"
              onClick={onStart}
              disabled={startDisabled}
              style={{
                padding: '12px 20px', fontSize: 15, fontWeight: 600,
                background: startDisabled ? 'var(--hairline)' : 'var(--accent)',
                color: startDisabled ? 'var(--muted)' : 'var(--accent-contrast, #fff)',
                border: 'none', borderRadius: 'var(--radius-btn, 6px)', cursor: startDisabled ? 'default' : 'pointer',
                maxWidth: 420, alignSelf: 'flex-start', minWidth: 220,
              }}
            >
              {startLabel}
            </button>
            <div data-ui="master-nav" style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              <button onClick={() => onMoveClick(0)} style={navBtnStyle}>⏮</button>
              <button onClick={() => onMoveClick(Math.max(0, displayPly - 1))} style={navBtnStyle}>←</button>
              <button onClick={() => onMoveClick(Math.min(moves.length, displayPly + 1))} style={navBtnStyle}>→</button>
              <button onClick={() => onMoveClick(moves.length)} style={navBtnStyle}>⏭</button>
              <button onClick={() => onRecalcAnalysis?.()} title="Пересчитать анализ" style={navBtnStyle}>↻</button>
            </div>
          </div>
        }
      >
        <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div data-ui="master-setup" style={{
            padding: 16, background: 'var(--bg)', borderRadius: 'var(--radius-card)', border: '1px solid var(--hairline)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
              Угадай ход {mySurname}а
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              Партия идёт сама и останавливается в ключевых моментах. Найди ход, который сыграл {mySurname}.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <span style={{ display: 'inline-block', width: 20, height: 20, background: 'var(--accent)', color: '#fff', textAlign: 'center', lineHeight: '20px', fontSize: 13, fontWeight: 700, borderRadius: 3 }}>2</span>
                <span style={{ color: 'var(--muted)' }}>ход мастера или сильнее</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <span style={{ display: 'inline-block', width: 20, height: 20, background: '#F0A43A', color: '#fff', textAlign: 'center', lineHeight: '20px', fontSize: 13, fontWeight: 700, borderRadius: 3 }}>1</span>
                <span style={{ color: 'var(--muted)' }}>тоже хорошо</span>
              </span>
            </div>
            {momentCount > 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {momentCount} {plural(momentCount, 'ключевой момент', 'ключевых момента', 'ключевых моментов')}
                {sacCount > 0 && ` · ${sacCount} ${plural(sacCount, 'жертва', 'жертвы', 'жертв')}`}
              </div>
            )}
            {analysisMissing && (
              <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                Анализ не сохраняется: выполни supabase/38-masters-analysis.sql
              </div>
            )}
          </div>
          {moveGrid}
        </div>
      </TaskPanel>
    );
  }

  // ── Watch ──────────────────────────────────────────────────────────────────
  if (phase === 'watch') {
    const prevComment = displayPly > 0 ? moves[displayPly - 1] : null;

    return (
      <TaskPanel
        breadcrumb={breadcrumb}
        progress={currentMomentIdx != null ? { current: currentMomentIdx + 1, total: momentCount } : undefined}
        title="Смотри партию"
        chips={
          <>
            <Chip>{side === 'white' ? 'белые' : 'чёрные'}</Chip>
            <Chip>очки {totalPts}</Chip>
          </>
        }
        actions={
          <div data-ui="master-watch-actions" style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onPause}
              style={{ flex: 1, padding: '10px', fontSize: 13, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 6px)', background: 'transparent', color: 'var(--ivory)', cursor: 'pointer' }}
            >
              {watchPaused ? '▶ Продолжить' : '❚❚ Пауза'}
            </button>
            <button
              data-ui="master-jump"
              onClick={onJump}
              style={{ flex: 1, padding: '10px', fontSize: 13, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 6px)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}
            >
              К моменту
            </button>
            <button
              data-ui="master-stop"
              onClick={onStop}
              style={{ padding: '10px 14px', fontSize: 13, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 6px)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
            >
              Стоп
            </button>
          </div>
        }
      >
        <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div data-ui="master-watch" style={{
            padding: 14, background: 'var(--bg)', borderRadius: 'var(--radius-card)', border: '1px solid var(--hairline)',
            fontSize: 13, color: 'var(--muted)', lineHeight: 1.6,
          }}>
            Остановлюсь на ключевом моменте.
            {prevComment?.comment && (
              <div style={{ marginTop: 8, color: 'var(--ivory)', fontStyle: 'italic' }}>
                {prevComment.comment}
              </div>
            )}
          </div>
          {moveGrid}
        </div>
      </TaskPanel>
    );
  }

  // ── Ask ────────────────────────────────────────────────────────────────────
  if (phase === 'ask' && currentMoment) {
    const ply = currentMoment.ply;
    const moveColor = currentMoment.color === 'w' ? 'белых' : 'чёрных';
    const prevComment = displayPly > 0 ? moves[displayPly - 1] : null;

    return (
      <TaskPanel
        breadcrumb={breadcrumb}
        headerRight={`момент ${(currentMomentIdx ?? 0) + 1} / ${momentCount}`}
        progressBar={
          <div style={{ height: 4, borderRadius: 4, background: '#3A3835', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--accent)', borderRadius: 4,
              width: `${Math.max(2, Math.min(100, ((currentMomentIdx ?? 0) + 1) / momentCount * 100))}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        }
        title={`Что сыграет ${mySurname}?`}
        chips={
          <>
            <Chip>ход {Math.ceil(ply / 2)} {moveColor}</Chip>
            <Chip>за {mySurname}а</Chip>
            <Chip>очки {totalPts}</Chip>
          </>
        }
        actions={
          <div data-ui="master-ask-actions" style={{ display: 'flex', gap: 8 }}>
            <button
              data-ui="master-hint"
              onClick={onHint}
              style={{ flex: 1, padding: '10px', fontSize: 13, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 6px)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
            >
              Подсказка (H)
            </button>
            <button
              data-ui="master-skip-moment"
              onClick={onSkipMoment}
              style={{ flex: 1, padding: '10px', fontSize: 13, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 6px)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
            >
              Пропустить (N)
            </button>
            <button
              data-ui="master-stop"
              onClick={onStop}
              style={{ padding: '10px 14px', fontSize: 13, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 6px)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
            >
              Стоп
            </button>
          </div>
        }
      >
        <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            data-ui="master-task"
            data-result="info"
            style={{
              padding: 14, background: 'var(--bg)', borderRadius: 'var(--radius-card)', border: '1px solid var(--hairline)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--ivory)', lineHeight: 1.6 }}>
              Найди ход {moveColor} после{lastMoveSan ? ` ${lastMoveSan}.` : '.'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              Ход на доске. H — подсказка: что за момент (тогда не больше 1 очка).
            </div>
            {hintShown && (
              <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginTop: 4 }}>
                💡 {hintShown}
              </div>
            )}
          </div>
          {prevComment?.comment && (
            <div style={{
              padding: 10, background: 'var(--bg)', borderRadius: 'var(--radius-card)', border: '1px solid var(--hairline)',
              fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5,
            }}>
              {prevComment.comment}
            </div>
          )}
          {moveGrid}
        </div>
      </TaskPanel>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  if (phase === 'result' && resultData && currentMoment) {
    const { item, userSan, verdict, pts, userCpVal } = resultData;
    const ply = item.ply;
    const moveColor = item.color === 'w' ? 'белых' : 'чёрных';

    const titles: Record<Verdict, string> = {
      master: 'Ход мастера!',
      better: 'Сильнее, чем в партии',
      engine: 'Тоже хорошо',
      miss: `${mySurname} сыграл иначе`,
    };

    const userSanNo = sanNo(ply, userSan);
    const masterSanNo = sanNo(ply, item.san);
    const bestMove = item.top[0];
    const pvSanText = (() => {
      const pvItem = item.top.find(t => t.uci.slice(0, 4) === item.uci.slice(0, 4)) ?? bestMove;
      if (!pvItem || !pvItem.pvSan?.length) return null;
      return lineText(ply, pvItem.pvSan.slice(0, 6));
    })();

    const feedbackText = (() => {
      const ew = (cp: number | null) => evalWhite(cp, item.color);
      if (verdict === 'master') return `Так и сыграл ${mySurname}: ${masterSanNo}.`;
      if (verdict === 'better') {
        const userEv = ew(userCpVal);
        const masterEv = ew(item.masterCp);
        return `${userSanNo} — ${userEv}. ${mySurname} сыграл ${masterSanNo}: ${masterEv}.`;
      }
      if (verdict === 'engine') {
        const userEv = ew(userCpVal);
        return `${userSanNo} — почти так же сильно (${userEv}). ${mySurname} сыграл ${masterSanNo}: ${ew(item.masterCp)}.`;
      }
      const userEv = ew(userCpVal);
      const masterEv = ew(item.masterCp);
      return `${userSanNo} — оценка ${userEv}. ${mySurname} сыграл ${masterSanNo}: ${masterEv}.`;
    })();

    const explanations = explain(item);
    const verdictStyle = verdict === 'master' || verdict === 'better' ? 'var(--accent)' : verdict === 'engine' ? '#F0A43A' : 'var(--c-bad)';

    return (
      <TaskPanel
        breadcrumb={breadcrumb}
        headerRight={`момент ${(currentMomentIdx ?? 0) + 1} / ${momentCount}`}
        title={titles[verdict]}
        chips={
          <>
            <Chip>ход {Math.ceil(ply / 2)} {moveColor}</Chip>
            {currentMoment && <Chip>{kindLabel(currentMoment.kind)}</Chip>}
            <PtsSquare pts={pts} />
          </>
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-ui="master-next"
              onClick={onNext}
              style={{
                flex: 1, padding: '12px', fontSize: 14, fontWeight: 600,
                background: 'var(--accent)', color: '#fff', border: 'none',
                borderRadius: 'var(--radius-btn, 6px)', cursor: 'pointer',
              }}
            >
              Дальше (Enter)
            </button>
            {pvSanText && (
              <button
                data-ui="master-line"
                onClick={onLinePlay}
                style={{
                  flex: 1, padding: '12px', fontSize: 13,
                  background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-btn, 6px)', cursor: 'pointer',
                }}
              >
                ▶ Вариант движка
              </button>
            )}
            <button
              data-ui="master-stop"
              onClick={onStop}
              style={{ padding: '12px 14px', fontSize: 13, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 6px)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
            >
              Стоп
            </button>
          </div>
        }
      >
        <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            data-ui="master-feedback"
            data-result={verdict}
            style={{
              padding: 14, background: 'var(--bg)', borderRadius: 'var(--radius-card)',
              border: `1px solid ${verdictStyle}44`,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--ivory)', lineHeight: 1.6 }}>
              {feedbackText}
            </div>
            {explanations.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                {explanations.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {item.comment && (
              <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5, borderTop: '1px solid var(--hairline)', paddingTop: 8, marginTop: 4 }}>
                {item.comment}
              </div>
            )}
          </div>
          {pvSanText && (
            <div data-ui="master-pv" style={{
              padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-card)', border: '1px solid var(--hairline)',
              fontSize: 13, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace',
            }}>
              <span style={{ color: 'var(--ivory)', marginRight: 6 }}>Вариант:</span>{pvSanText}
            </div>
          )}
          {moveGrid}
        </div>
      </TaskPanel>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const newRecord = record != null && totalPts > record;
    const missed = answers.filter(a => a.pts < 2);

    return (
      <TaskPanel
        breadcrumb={breadcrumb}
        title="Партия сыграна"
        chips={
          <>
            <Chip>за {mySurname}а</Chip>
          </>
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-ui="master-again"
              onClick={onAgain}
              style={{
                flex: 1, padding: '12px', fontSize: 14, fontWeight: 600,
                background: 'var(--accent)', color: '#fff', border: 'none',
                borderRadius: 'var(--radius-btn, 6px)', cursor: 'pointer',
              }}
            >
              Ещё раз (Enter)
            </button>
            <button
              onClick={onStop}
              style={{ flex: 1, padding: '12px', fontSize: 13, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 6px)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
            >
              Разбор партии
            </button>
          </div>
        }
      >
        <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div data-ui="master-result" style={{
            padding: 16, background: 'var(--bg)', borderRadius: 'var(--radius-card)', border: '1px solid var(--hairline)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ivory)', lineHeight: 1 }}>{totalPts}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>из {maxPts} очков</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ivory)', lineHeight: 1 }}>{masterHits}/{answers.length}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>как мастер</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: newRecord ? 'var(--accent)' : 'var(--ivory)', lineHeight: 1 }}>
                  {newRecord ? 'Новый рекорд!' : (record ?? '—')}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>рекорд</div>
              </div>
            </div>
            {!newRecord && record != null && totalPts < record && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>До рекорда не хватило {record - totalPts} {plural(record - totalPts, 'очка', 'очков', 'очков')}.</div>
            )}
          </div>

          {missed.length > 0 && (
            <div data-ui="master-log" style={{
              padding: 14, background: 'var(--bg)', borderRadius: 'var(--radius-card)', border: '1px solid var(--hairline)',
            }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Где ты сыграл иначе</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {missed.map(a => (
                  <div key={a.ply} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <PtsSquare pts={a.pts} />
                    <span style={{ color: 'var(--ivory)' }}>{sanNo(a.ply, a.san)}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>{kindLabel(a.kind)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {moveGrid}
        </div>
      </TaskPanel>
    );
  }

  return null;
}

const navBtnStyle: React.CSSProperties = {
  width: 32, height: 32, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
  background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 14,
};
