'use client';

import { useState } from 'react';
import { ClassIcon } from '@/components/ClassIcon';
import type { BadgeKind } from '@/components/ClassIcon';
import { puzzleVerdict, choiceVerdict, puzzleMove, type QuizItem } from '@/lib/lesson';
import type { BoardArrow } from '@/components/board/Board';
import type { Square } from 'chess.js';

interface QuizResult {
  itemIdx: number;
  result: 'ok' | 'fail' | 'skip';
}

interface Props {
  items: QuizItem[];
  stepTitle: string;
  onNextStep: () => void;
  nextStepTitle: string | null;
  onBoardArrows?: (arrows: BoardArrow[]) => void;
  onQuizFen?: (fen: string | null) => void;
  currentQuizIdx: number;
  onQuizIdxChange: (idx: number) => void;
  quizResults: QuizResult[];
  onQuizResult: (result: QuizResult) => void;
}

export function QuizPanel({
  items, stepTitle,
  onNextStep, nextStepTitle,
  onBoardArrows, onQuizFen,
  currentQuizIdx, onQuizIdxChange,
  quizResults, onQuizResult,
}: Props) {
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [selfJudge, setSelfJudge] = useState<'knew' | 'didnt' | null>(null);

  const item = items[currentQuizIdx];
  if (!item) return null;

  const existingResult = quizResults.find(r => r.itemIdx === currentQuizIdx);
  const answered = existingResult !== null && existingResult !== undefined;

  const isLastItem = currentQuizIdx === items.length - 1;

  const handleChoiceAnswer = (key: string) => {
    if (answered) return;
    setChosenKey(key);
    const v = choiceVerdict(item, key);
    onQuizResult({ itemIdx: currentQuizIdx, result: v.result });
    if (onBoardArrows) onBoardArrows([]);
  };

  const handleReveal = () => {
    setRevealed(true);
  };

  const handleSelfJudge = (knew: boolean) => {
    setSelfJudge(knew ? 'knew' : 'didnt');
    onQuizResult({ itemIdx: currentQuizIdx, result: knew ? 'ok' : 'fail' });
  };

  const handleNext = () => {
    if (isLastItem) {
      onNextStep();
    } else {
      setChosenKey(null);
      setRevealed(false);
      setSelfJudge(null);
      if (onBoardArrows) onBoardArrows([]);
      const nextIdx = currentQuizIdx + 1;
      onQuizIdxChange(nextIdx);
      const nextItem = items[nextIdx];
      if (nextItem && onQuizFen) {
        onQuizFen(nextItem.fen ?? null);
      }
    }
  };

  // Puzzle move for board
  const puzzleAns = item.type === 'puzzle' || item.fen ? puzzleMove(item) : null;
  const isPuzzle = !!(puzzleAns || item.fen);
  const isReveal = item.type === 'reveal' || (!puzzleAns && !!item.fen);

  const correctKeys = Object.keys(item.options ?? {});
  const feedbackResult = existingResult?.result ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div data-ui="lesson-quiz" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Question header */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            {isPuzzle ? 'Задача на доске' : 'Вопрос'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ivory)', lineHeight: 1.4 }}>
            {item.question}
          </div>
        </div>

        {/* Choice options */}
        {(item.type === 'choice' || (!isPuzzle && item.options)) && item.options && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(item.options).map(([key, text]) => {
              let bg = 'var(--track, #2A2A2A)';
              let border = '1px solid var(--hairline)';
              let color = 'var(--ivory)';

              if (answered || chosenKey) {
                if (key === item.answer) {
                  bg = 'rgba(129,182,76,0.15)';
                  border = '1px solid rgba(129,182,76,0.5)';
                  color = '#81B64C';
                } else if (key === chosenKey && key !== item.answer) {
                  bg = 'rgba(220,60,60,0.12)';
                  border = '1px solid rgba(220,60,60,0.4)';
                  color = 'var(--muted)';
                }
              }

              return (
                <button
                  key={key}
                  data-ui="lesson-option"
                  data-key={key}
                  onClick={() => handleChoiceAnswer(key)}
                  disabled={answered}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', textAlign: 'left',
                    background: bg, border, color,
                    borderRadius: 'var(--radius-btn, 8px)',
                    cursor: answered ? 'default' : 'pointer',
                    fontSize: 14, lineHeight: 1.4,
                  }}
                >
                  <span style={{
                    width: 24, height: 24, flexShrink: 0,
                    background: 'rgba(255,255,255,0.1)', borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                  }}>
                    {key}
                  </span>
                  {text}
                </button>
              );
            })}
          </div>
        )}

        {/* Puzzle: reveal mode */}
        {isReveal && !answered && !revealed && (
          <button
            onClick={handleReveal}
            style={{ padding: '10px 0', background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', color: 'var(--ivory)', cursor: 'pointer', fontSize: 14 }}
          >
            Показать ответ
          </button>
        )}
        {isReveal && (revealed || answered) && (
          <div style={{ padding: '12px 14px', background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)' }}>
            <div style={{ fontSize: 14, color: 'var(--ivory)' }}>{item.answer}</div>
            {!answered && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => handleSelfJudge(true)} style={{ flex: 1, padding: '7px 0', background: 'rgba(129,182,76,0.15)', border: '1px solid rgba(129,182,76,0.4)', borderRadius: 6, cursor: 'pointer', color: '#81B64C', fontSize: 13 }}>Я знал</button>
                <button onClick={() => handleSelfJudge(false)} style={{ flex: 1, padding: '7px 0', background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 6, cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>Не знал</button>
              </div>
            )}
          </div>
        )}

        {/* Feedback */}
        {feedbackResult && (
          <div
            data-ui="lesson-quiz-feedback"
            data-result={feedbackResult}
            style={{
              padding: '12px 14px',
              background: feedbackResult === 'ok' ? 'rgba(129,182,76,0.1)' : 'rgba(220,60,60,0.1)',
              border: `1px solid ${feedbackResult === 'ok' ? 'rgba(129,182,76,0.35)' : 'rgba(220,60,60,0.35)'}`,
              borderRadius: 'var(--radius-btn, 8px)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: feedbackResult === 'ok' ? '#81B64C' : '#E05050', marginBottom: 4 }}>
              {feedbackResult === 'ok' ? 'Верно.' : `Верный ответ — ${item.answer}.`}
            </div>
            {item.why && <div style={{ fontSize: 13, color: 'var(--ivory)', lineHeight: 1.5 }}>{item.why}</div>}
          </div>
        )}

        {/* Question list */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {items.map((_, qi) => {
            const r = quizResults.find(res => res.itemIdx === qi);
            const isCur = qi === currentQuizIdx;
            let bg = 'var(--track, #2A2A2A)';
            let borderColor = 'var(--hairline)';
            if (r?.result === 'ok') { bg = 'rgba(129,182,76,0.2)'; borderColor = 'rgba(129,182,76,0.5)'; }
            else if (r?.result === 'fail') { bg = 'rgba(220,60,60,0.15)'; borderColor = 'rgba(220,60,60,0.4)'; }
            if (isCur) borderColor = '#81B64C';
            return (
              <div
                key={qi}
                onClick={() => { onQuizIdxChange(qi); if (onQuizFen) onQuizFen(items[qi].fen ?? null); }}
                style={{
                  width: 24, height: 24,
                  background: bg, border: `2px solid ${borderColor}`,
                  borderRadius: 4, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                  color: r?.result === 'ok' ? '#81B64C' : r?.result === 'fail' ? '#E05050' : 'var(--muted)',
                }}
              >
                {r?.result === 'ok' ? '✓' : r?.result === 'fail' ? '✗' : qi + 1}
              </div>
            );
          })}
          <span style={{ fontSize: 13, color: 'var(--muted)', alignSelf: 'center', marginLeft: 6 }}>
            {items[0]?.type === 'puzzle' || items[0]?.fen ? 'на доске' : 'выбор'}
          </span>
        </div>

        {/* Chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, padding: '3px 8px', background: 'var(--track, #2A2A2A)', color: 'var(--muted)', borderRadius: 4 }}>
            вопрос {currentQuizIdx + 1} из {items.length}
          </span>
          {quizResults.filter(r => r.result === 'ok').length > 0 && (
            <span style={{ fontSize: 13, padding: '3px 8px', background: 'rgba(129,182,76,0.12)', color: '#81B64C', borderRadius: 4 }}>
              {quizResults.filter(r => r.result === 'ok').length} верно
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
        <button
          data-ui="lesson-quiz-next"
          onClick={handleNext}
          disabled={!answered && !selfJudge}
          style={{
            width: '100%', padding: '10px 0', fontSize: 15, fontWeight: 600,
            color: (answered || selfJudge) ? '#fff' : 'var(--muted)',
            background: (answered || selfJudge) ? '#81B64C' : 'var(--track, #2A2A2A)',
            border: `1px solid ${(answered || selfJudge) ? '#81B64C' : 'var(--hairline)'}`,
            borderRadius: 'var(--radius-btn, 8px)', cursor: (answered || selfJudge) ? 'pointer' : 'default',
          }}
        >
          {!answered && !selfJudge
            ? 'Пропустить вопрос'
            : isLastItem
              ? (nextStepTitle ? `Дальше: ${nextStepTitle}` : 'Завершить')
              : 'Следующий вопрос'}
        </button>
      </div>
    </div>
  );
}
