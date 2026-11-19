'use client';

import { sanNo, type LessonLine, type PlayState } from '@/lib/lesson';

interface Props {
  line: LessonLine;
  lineIdx: number;
  totalLines: number;
  playState: PlayState;
  lastResult: 'ok' | 'fail' | 'info' | 'done' | null;
  lastPlayedMove: { san: string; ply: number } | null;
  onHint: () => void;
  onRestart: () => void;
  onExitPlay: () => void;
  onNextStep: () => void;
  nextStepTitle: string | null;
}

export function PlayPanel({
  line, lineIdx, totalLines,
  playState, lastResult, lastPlayedMove,
  onHint, onRestart, onExitPlay, onNextStep, nextStepTitle,
}: Props) {
  const startFen = line.start_fen ?? null;

  // Expected move
  const expMove = !playState.done && playState.ply < line.moves.length
    ? line.moves[playState.ply]
    : null;

  // Last opponent move (the one before our turn)
  const prevOppPly = playState.ply - 1;
  const prevOppMove = prevOppPly >= 0 && prevOppPly < line.moves.length && line.moves[prevOppPly].color !== playState.color
    ? line.moves[prevOppPly]
    : null;

  const resultBg: Record<string, string> = {
    ok: 'rgba(129,182,76,0.12)',
    fail: 'rgba(220,60,60,0.1)',
    info: 'var(--surface, #1A1A1A)',
    done: 'rgba(129,182,76,0.12)',
  };
  const resultBorder: Record<string, string> = {
    ok: 'rgba(129,182,76,0.35)',
    fail: 'rgba(220,60,60,0.35)',
    info: 'var(--hairline)',
    done: 'rgba(129,182,76,0.35)',
  };

  const result = lastResult ?? 'info';

  let titleText = 'Твой ход';
  if (result === 'ok') titleText = 'Верно';
  else if (result === 'fail') titleText = 'Не тот ход';
  else if (result === 'done') titleText = 'Линия сыграна';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Play card */}
        <div
          data-ui="lesson-play"
          data-result={result}
          style={{
            padding: '14px 16px',
            background: resultBg[result] ?? resultBg.info,
            border: `1px solid ${resultBorder[result] ?? resultBorder.info}`,
            borderRadius: 'var(--radius-btn, 8px)',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)', marginBottom: 6 }}>
            {titleText}
          </div>

          {result === 'ok' && lastPlayedMove && (
            <div style={{ fontSize: 14, color: 'var(--accent)' }}>
              Верно: <strong>{sanNo(startFen, lastPlayedMove.ply, lastPlayedMove.san)}</strong>
            </div>
          )}

          {result === 'fail' && lastPlayedMove && (
            <div>
              <div style={{ fontSize: 14, color: 'var(--ivory)' }}>
                <strong>{sanNo(startFen, lastPlayedMove.ply, lastPlayedMove.san)}</strong> — в линии другой ход. Попробуй ещё раз.
              </div>
              {playState.attempts < 2 && (
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  Ещё одна ошибка — покажем стрелку. H — подсказка сразу.
                </div>
              )}
              {playState.attempts >= 2 && (
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  Сыграй ход по стрелке.
                </div>
              )}
            </div>
          )}

          {result === 'info' && expMove && prevOppMove && (
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              Найди ход {playState.color === 'b' ? 'чёрных' : 'белых'} после <strong>{sanNo(startFen, playState.ply - 1, prevOppMove.san)}</strong>
              <span style={{ display: 'block', marginTop: 4, fontSize: 13 }}>H — подсказка</span>
            </div>
          )}

          {result === 'info' && expMove && !prevOppMove && (
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              Найди первый ход {playState.color === 'b' ? 'чёрных' : 'белых'}
              <span style={{ display: 'block', marginTop: 4, fontSize: 13 }}>H — подсказка</span>
            </div>
          )}

          {result === 'done' && (
            <div style={{ fontSize: 14, color: 'var(--accent)' }}>
              {playState.mistakes
                ? `${playState.firstTry} из ${playState.mine} ходов с первой попытки`
                : 'Без ошибок!'}
            </div>
          )}
        </div>

        {/* Chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, padding: '3px 8px', background: 'rgba(129,182,76,0.15)', color: 'var(--accent)', borderRadius: 4, border: '1px solid rgba(129,182,76,0.3)' }}>
            Сыграй сам
          </span>
          {totalLines > 1 && (
            <span style={{ fontSize: 13, padding: '3px 8px', background: 'var(--track, #2A2A2A)', color: 'var(--muted)', borderRadius: 4 }}>
              Линия {lineIdx + 1} из {totalLines}
            </span>
          )}
          <span style={{ fontSize: 13, padding: '3px 8px', background: 'var(--track, #2A2A2A)', color: 'var(--muted)', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}>
            с первой попытки {playState.firstTry} из {playState.mine}
          </span>
        </div>

      </div>

      {/* Actions */}
      <div data-ui="lesson-play-actions" style={{ padding: '14px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Done: show next step + restart */}
        {result === 'done' && nextStepTitle && (
          <button
            data-ui="lesson-next-step"
            onClick={onNextStep}
            style={{ width: '100%', padding: '10px 0', fontSize: 15, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer' }}
          >
            Дальше: {nextStepTitle}
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-ui="lesson-hint"
            onClick={onHint}
            style={{ flex: 1, height: 40, fontSize: 13, background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer', color: 'var(--ivory)' }}
          >
            Подсказка (H)
          </button>
          <button
            data-ui="lesson-restart"
            onClick={onRestart}
            style={{ flex: 1, height: 40, fontSize: 13, background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer', color: 'var(--ivory)' }}
          >
            Сначала (R)
          </button>
        </div>
        <button
          onClick={onExitPlay}
          style={{ width: '100%', height: 36, fontSize: 13, background: 'none', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer', color: 'var(--muted)' }}
        >
          Esc — выйти из «Сыграй сам»
        </button>
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
          Соперник ходит сам · H — подсказка · Esc — выйти
        </div>
      </div>
    </div>
  );
}
