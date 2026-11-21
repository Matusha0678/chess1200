'use client';

import { useRef, useEffect } from 'react';
import { ClassIcon } from '@/components/ClassIcon';
import type { BadgeKind } from '@/components/ClassIcon';
import {
  moveLabel, LABEL_KIND, LABEL_NAME, sanNo, variationText,
  type LessonLine, type LessonMove,
} from '@/lib/lesson';

interface Note {
  id: string;
  lesson_id: string;
  line_order: number;
  ply: number;
  body: string;
  kind: 'note' | 'confused';
}

interface Props {
  line: LessonLine;
  lineIdx: number;
  currentPly: number;
  viewingVariant: boolean;
  variantMoves: LessonMove[];
  variantPly: number;
  variantFromPly: number;
  notes: Note[];
  isDemo: boolean;
  onPlyClick: (ply: number) => void;
  onVariantOpen: (move: LessonMove, basePly: number) => void;
  onVariantClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlay: () => void;
  onNextStep: () => void;
  nextStepTitle: string | null;
  isAutoPlaying: boolean;
  onNoteAdd: (ply: number, lineOrder: number, body: string) => void;
  onConfusedAdd: (ply: number, lineOrder: number) => void;
  hasRichData: boolean;
}

function simpleMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('- ')) {
      return <li key={i} style={{ marginLeft: 16 }} dangerouslySetInnerHTML={{ __html: boldify(line.slice(2)) }} />;
    }
    if (line.trim() === '') return <br key={i} />;
    return <p key={i} style={{ margin: '4px 0' }} dangerouslySetInnerHTML={{ __html: boldify(line) }} />;
  });
}

function boldify(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function LinePanel({
  line, lineIdx, currentPly,
  viewingVariant, variantMoves, variantPly, variantFromPly,
  notes, isDemo,
  onPlyClick, onVariantOpen, onVariantClose,
  onPrev, onNext, onPlay, onNextStep, nextStepTitle, isAutoPlaying,
  onNoteAdd, onConfusedAdd, hasRichData,
}: Props) {
  const movesRef = useRef<HTMLDivElement>(null);

  // Scroll current move into view
  useEffect(() => {
    if (!movesRef.current) return;
    const sel = movesRef.current.querySelector('[data-current="true"]') as HTMLElement;
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }, [currentPly, viewingVariant, variantPly]);

  const moves = viewingVariant ? variantMoves : line.moves;
  const ply = viewingVariant ? variantPly : currentPly;
  const startFen = line.start_fen ?? null;

  // Current move (1-based ply = move index 0-based)
  const currentMove: LessonMove | null = ply > 0 && ply <= moves.length ? moves[ply - 1] : null;
  const isAtEnd = ply >= moves.length;

  // Notes for current ply in this line
  const currentNotes = notes.filter(n => n.line_order === lineIdx && n.ply === (viewingVariant ? variantFromPly : ply));

  const label = currentMove ? moveLabel(currentMove) : null;
  const badgeKind = label ? LABEL_KIND[label] : null;
  const labelName = label ? LABEL_NAME[label] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Variant bar */}
      {viewingVariant && (
        <div style={{
          padding: '10px 24px', flexShrink: 0,
          background: 'rgba(129,182,76,0.08)',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>
            Вариант · {variantMoves.length > 0 ? variationText(startFen, variantFromPly, variantMoves) : ''} · ход {variantPly} из {variantMoves.length}
          </span>
          <button
            style={{ fontSize: 13, color: 'var(--accent, #81B64C)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            onClick={onVariantClose}
          >
            ← К линии
          </button>
        </div>
      )}

      {/* Scrollable area: comment + moves */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Comment card */}
        <div data-ui="lesson-comment" style={{ padding: '20px 24px', flexShrink: 0 }}>
          {ply === 0 ? (
            /* At start of line */
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Начало линии</div>
              {line.intro_md ? (
                <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ivory)' }}>
                  {simpleMarkdown(line.intro_md)}
                </div>
              ) : (
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>→ первый ход</div>
              )}
            </div>
          ) : (
            /* Move comment */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)' }}>
                  {currentMove ? sanNo(startFen, ply, currentMove.san) : ''}
                </span>
                {badgeKind && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ClassIcon cls={badgeKind as BadgeKind} size={22} />
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{labelName}</span>
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)' }}>
                  ход {currentMove?.color === 'w' ? 'белых' : 'чёрных'}
                </span>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.6, color: currentMove?.comment ? 'var(--ivory)' : 'var(--muted)' }}>
                {currentMove?.comment ?? 'К этому ходу нет комментария.'}
              </div>

              {/* Notes */}
              {currentNotes.length > 0 && (
                <div data-ui="lesson-notes" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {currentNotes.map(note => (
                    <div key={note.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--ivory)' }}>
                      <span style={{ color: note.kind === 'confused' ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, var(--muted))', flexShrink: 0 }}>
                        {note.kind === 'confused' ? '?' : '✎'}
                      </span>
                      <span>{note.body}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Note add buttons */}
              {!isDemo && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  <button
                    data-ui="lesson-note-add"
                    style={{ fontSize: 13, color: 'color-mix(in srgb, var(--accent) 45%, var(--muted))', background: 'none', border: '1px solid rgba(74,144,226,.3)', borderRadius: 4, cursor: 'pointer', padding: '3px 8px' }}
                    onClick={() => {
                      const body = prompt('Заметка к ходу:');
                      if (body?.trim()) onNoteAdd(ply, lineIdx, body.trim());
                    }}
                  >
                    ✎ Заметка к ходу
                  </button>
                  <button
                    data-ui="lesson-confused"
                    style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: 4, cursor: 'pointer', padding: '3px 8px' }}
                    onClick={() => onConfusedAdd(ply, lineIdx)}
                  >
                    ? Не понял
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Variants */}
          {!viewingVariant && currentMove?.variations && currentMove.variations.length > 0 && (
            <div data-ui="lesson-variants" style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--hairline)' }}>
              {currentMove.variations.map((variation, vi) => (
                <div key={vi} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                    Вместо <strong>{sanNo(startFen, ply, currentMove.san)}</strong> можно:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {variationText(startFen, ply, variation)}
                    </span>
                    <button
                      data-ui="lesson-variant-open"
                      style={{ fontSize: 13, color: 'var(--ivory)', background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 4, cursor: 'pointer', padding: '3px 8px', flexShrink: 0 }}
                      onClick={() => onVariantOpen(currentMove, ply)}
                    >
                      Смотреть
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* End of line */}
          {!viewingVariant && isAtEnd && moves.length > 0 && (
            <div data-result="done" style={{
              marginTop: 14, padding: '12px 14px',
              background: 'rgba(129,182,76,0.1)', border: '1px solid rgba(129,182,76,0.3)',
              borderRadius: 'var(--radius-btn, 8px)',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <span>🏁</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>Конец линии.</div>
                {line.outro_md && (
                  <div style={{ fontSize: 13, color: 'var(--ivory)', marginTop: 4, lineHeight: 1.5 }}>
                    {simpleMarkdown(line.outro_md)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Old format notice */}
          {!hasRichData && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
              Стрелки и значки появятся после повторного импорта курса.
            </div>
          )}
        </div>

        {/* Move list */}
        <div data-ui="lesson-moves" ref={movesRef} style={{ padding: '0 24px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Ходы линии</span>
            <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{ply} из {moves.length}</span>
          </div>

          {/* Move grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr', gap: '1px 0' }}>
            {Array.from({ length: Math.ceil(line.moves.length / 2) }, (_, pairIdx) => {
              const wPly = pairIdx * 2 + 1;
              const bPly = pairIdx * 2 + 2;
              const wMove = line.moves[wPly - 1];
              const bMove = line.moves[bPly - 1];
              // If the first move of the game is black, adjust
              // (handle start_fen offset)
              const moveNum = pairIdx + 1;

              return (
                <div key={pairIdx} style={{ display: 'contents' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right', paddingRight: 6, lineHeight: '28px', fontVariantNumeric: 'tabular-nums' }}>
                    {moveNum}.
                  </span>
                  {[wMove, bMove].map((m, ci) => {
                    if (!m) return <div key={ci} />;
                    const mPly = pairIdx * 2 + ci + 1;
                    const mLabel = moveLabel(m);
                    const mBadge = mLabel ? LABEL_KIND[mLabel] : null;
                    const isCurrent = !viewingVariant && mPly === ply;
                    const isFuture = !viewingVariant && mPly > ply;
                    const isOpponent = m.color !== (line.moves[0]?.color === 'b' ? 'b' : 'w');
                    const moveNotes = notes.filter(n => n.line_order === lineIdx && n.ply === mPly);
                    const hasNote = moveNotes.some(n => n.kind === 'note');
                    const hasConfused = moveNotes.some(n => n.kind === 'confused');

                    // Variant row (show below the move)
                    const hasVariant = !!m.variations?.length && !viewingVariant;

                    return (
                      <div key={ci} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div
                          data-ply={mPly}
                          data-ui="lesson-move"
                          data-current={isCurrent ? 'true' : 'false'}
                          onClick={() => onPlyClick(mPly)}
                          style={{
                            height: 28, display: 'flex', alignItems: 'center', gap: 4,
                            padding: '0 4px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            border: isCurrent ? '1px solid var(--accent)' : '1px solid transparent',
                            background: isCurrent ? 'rgba(129,182,76,0.12)' : 'transparent',
                            color: isFuture ? 'var(--muted)' : isOpponent ? 'rgba(255,255,255,0.65)' : 'var(--ivory)',
                            fontSize: 13,
                            fontWeight: isCurrent ? 600 : 400,
                          }}
                        >
                          <span>{m.san}</span>
                          {mBadge && <ClassIcon cls={mBadge as BadgeKind} size={14} />}
                          {hasNote && <span style={{ color: 'color-mix(in srgb, var(--accent) 45%, var(--muted))', fontSize: 13 }}>✎</span>}
                          {hasConfused && <span style={{ color: 'var(--accent)', fontSize: 13 }}>?</span>}
                        </div>
                        {hasVariant && (
                          <div
                            data-ui="lesson-variant"
                            onClick={() => onVariantOpen(m, mPly)}
                            style={{
                              gridColumn: 'span 2',
                              padding: '2px 4px 4px',
                              fontSize: 13, color: 'var(--muted)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                              borderBottom: '1px solid var(--hairline)',
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                              <path d="M18 9a9 9 0 0 1-9 9"/>
                            </svg>
                            {variationText(startFen, mPly, m.variations![0])}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Nav buttons */}
      <div data-ui="lesson-nav" style={{
        padding: '14px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Next step button at end */}
        {isAtEnd && nextStepTitle && !viewingVariant && (
          <button
            data-ui="lesson-next-step"
            onClick={onNextStep}
            style={{
              width: '100%', padding: '10px 0', fontSize: 15, fontWeight: 600,
              color: '#fff', background: 'var(--accent)', border: 'none',
              borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer',
            }}
          >
            Дальше: {nextStepTitle}
          </button>
        )}

        {/* Nav row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            data-ui="lesson-prev"
            onClick={onPrev}
            style={{ width: 44, height: 44, fontSize: 18, background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer', color: 'var(--ivory)' }}
          >
            ‹
          </button>
          <button
            data-ui="lesson-play"
            onClick={onPlay}
            style={{ flex: 1, height: 44, fontSize: 13, background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer', color: 'var(--ivory)' }}
          >
            {isAutoPlaying ? '❚❚ Пауза' : '▶ Авто'}
          </button>
          <button
            data-ui="lesson-next"
            onClick={onNext}
            style={{ width: 44, height: 44, fontSize: 18, background: 'var(--track, #2A2A2A)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 8px)', cursor: 'pointer', color: 'var(--ivory)' }}
          >
            ›
          </button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
          ← → — ходы · Пробел — авто · V — вариант · F — перевернуть
        </div>
      </div>
    </div>
  );
}
