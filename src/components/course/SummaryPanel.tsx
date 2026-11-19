'use client';

interface Props {
  summaryMd: string;
  lessonTitle: string;
  linesTotal: number;
  linesDone: number;
  quizCorrect: number;
  quizTotal: number;
  playFirstTry: number;
  playTotal: number;
  testResult?: { score: number; max: number } | null;
  allStepsDone: boolean;
  onTest: () => void;
  onNextLesson: () => void;
  onPlayFrom: () => void;
  nextLessonTitle: string | null;
}

function simpleMarkdown(md: string): React.ReactNode {
  if (!md.trim()) return null;
  return md.split('\n').map((line, i) => {
    if (line.startsWith('- ')) return <li key={i} style={{ marginLeft: 16 }} dangerouslySetInnerHTML={{ __html: boldify(line.slice(2)) }} />;
    if (line.trim() === '') return <br key={i} />;
    return <p key={i} style={{ margin: '4px 0' }} dangerouslySetInnerHTML={{ __html: boldify(line) }} />;
  });
}
function boldify(t: string) { return t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }

export function SummaryPanel({
  summaryMd, lessonTitle,
  linesTotal, linesDone,
  quizCorrect, quizTotal,
  playFirstTry, playTotal,
  testResult, allStepsDone,
  onTest, onNextLesson, onPlayFrom,
  nextLessonTitle,
}: Props) {
  const testPassed = testResult ? (testResult.max > 0 && (testResult.score / testResult.max) >= 0.8) : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {allStepsDone && (
          <span style={{ fontSize: 13, padding: '3px 8px', background: 'rgba(129,182,76,0.12)', color: '#81B64C', borderRadius: 4, alignSelf: 'flex-start' }}>
            все шаги пройдены
          </span>
        )}

        {/* Summary text */}
        {summaryMd && (
          <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ivory)' }}>
            {simpleMarkdown(summaryMd)}
          </div>
        )}

        {/* Stats */}
        <div data-ui="lesson-end" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, border: '1px solid var(--hairline)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '12px 10px', textAlign: 'center', borderRight: '1px solid var(--hairline)' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: linesDone === linesTotal ? '#81B64C' : 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>{linesDone}/{linesTotal}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>линии</div>
          </div>
          <div style={{ padding: '12px 10px', textAlign: 'center', borderRight: '1px solid var(--hairline)' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
              {playTotal > 0 ? `${playFirstTry}/${playTotal}` : '—'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>сам, с 1-й</div>
          </div>
          <div style={{ padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
              {quizTotal > 0 ? `${quizCorrect}/${quizTotal}` : '—'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>проверка</div>
          </div>
        </div>

        {/* Test result or note */}
        {testPassed ? (
          <div style={{ padding: '10px 14px', background: 'rgba(129,182,76,0.1)', border: '1px solid rgba(129,182,76,0.35)', borderRadius: 8, fontSize: 14, color: '#81B64C', fontWeight: 600 }}>
            Урок пройден ✓ · тест {testResult!.score}/{testResult!.max}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Урок засчитан, когда тест сдан на <strong>80%</strong> и выше.
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {testPassed ? (
          <>
            {nextLessonTitle && (
              <button
                onClick={onNextLesson}
                data-ui="lesson-next-lesson"
                style={{ width: '100%', padding: '10px 0', fontSize: 15, fontWeight: 600, color: '#fff', background: '#81B64C', border: 'none', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer' }}
              >
                Следующий урок →
              </button>
            )}
            <button
              onClick={onTest}
              data-ui="lesson-test"
              style={{ width: '100%', padding: '8px 0', fontSize: 14, color: 'var(--ivory)', background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer' }}
            >
              Пройти тест ещё раз
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onTest}
              data-ui="lesson-test"
              style={{ width: '100%', padding: '10px 0', fontSize: 15, fontWeight: 600, color: '#fff', background: '#81B64C', border: 'none', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer' }}
            >
              Пройти тест
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {nextLessonTitle && (
                <button
                  onClick={onNextLesson}
                  data-ui="lesson-next-lesson"
                  style={{ flex: 1, padding: '8px 0', fontSize: 13, color: 'var(--ivory)', background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer' }}
                >
                  Следующий урок ›
                </button>
              )}
              <button
                onClick={onPlayFrom}
                data-ui="lesson-play-from"
                style={{ flex: 1, padding: '8px 0', fontSize: 13, color: 'var(--ivory)', background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer' }}
              >
                Играть отсюда
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
