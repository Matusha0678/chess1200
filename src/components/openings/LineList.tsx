'use client';

import { useEffect, useRef } from 'react';
import { SessionPanel } from '@/components/trainer/SessionPanel';

export interface LineRow {
  id: string;
  index: number;
  label: string;
  badge: string | null;
  line_class: string | null;
  prog: { mastery: number; next_review: string } | null;
  status: 'new' | 'due' | 'learning' | 'mastered';
  dueText: string;
  isFreshDev: boolean;
}

interface LineListProps {
  openingName: string;
  openingColor: 'white' | 'black' | 'both';
  counts: { mastered: number; due: number; new: number; learning: number };
  mode: 'review' | 'learn' | 'exam' | 'hard' | 'free';
  lines: LineRow[];
  groups: Array<{ label: string; ids: string[] }> | null;
  hardCount: number;
  activeLineId: string | null;
  onModeChange: (mode: 'review' | 'learn' | 'exam') => void;
  onLineClick: (id: string) => void;
  onAddLines: () => void;
  onMenu: () => void;
  onDeleteLine?: (id: string) => void;
}

const LINE_CLASS_COLORS: Record<string, string> = {
  main:      '#81B64C',
  common:    '#5096CC',
  rare:      '#C98424',
  very_rare: '#A04040',
  sharp:     '#E0574A',
};

const LINE_CLASS_LABELS: Record<string, string> = {
  main:      'Главная',
  common:    'Частая',
  rare:      'Редкая',
  very_rare: 'Очень редкая',
  sharp:     'Острая',
};

function MasteryBar({ mastery }: { mastery: number }) {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          style={{
            width: 8, height: 4,
            borderRadius: 2,
            background: i < mastery ? '#81B64C' : 'var(--hairline)',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

function dueColor(text: string): string {
  if (text === 'сегодня') return '#E8A23A';
  if (text === 'освоена') return '#81B64C';
  if (text === 'новая') return '#8FB4DA';
  return 'var(--muted)';
}

function dueBold(text: string): boolean {
  return text === 'сегодня';
}

export function LineList({
  openingName, openingColor, counts, mode, lines, groups, hardCount,
  activeLineId, onModeChange, onLineClick, onAddLines, onMenu, onDeleteLine,
}: LineListProps) {
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeLineId]);

  const colorIcon = openingColor === 'white' ? '♔' : openingColor === 'black' ? '♚' : '♗';

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span
        style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}
        title={openingName}
      >
        {openingName}
      </span>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{colorIcon}</span>
    </div>
  );

  const modesEl = (
    <div data-ui="op-modes" style={{ display: 'flex', gap: 2, background: 'var(--surface-2, rgba(0,0,0,0.3))', borderRadius: 'var(--radius-btn, 6px)', padding: 3 }}>
      {(['learn', 'review', 'exam'] as const).map(m => {
        const labels = { learn: 'Учить', review: 'Повторять', exam: 'Экзамен' };
        const isActive = mode === m;
        return (
          <button
            key={m}
            data-mode={m}
            onClick={() => onModeChange(m)}
            style={{
              flex: 1, padding: '5px 2px',
              border: 'none',
              background: isActive ? 'var(--surface)' : 'transparent',
              color: isActive ? 'var(--ivory)' : 'var(--muted)',
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              cursor: 'pointer', borderRadius: 'var(--radius-btn, 4px)',
              fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {labels[m]}
          </button>
        );
      })}
    </div>
  );

  const hardEl = hardCount > 0 ? (
    <div
      data-ui="op-hard"
      style={{ fontSize: 13, color: '#E8A23A', cursor: 'pointer', padding: '4px 0' }}
      onClick={() => onModeChange('review' as const)}
    >
      Трудные ходы · {hardCount}
    </div>
  ) : null;

  const renderLine = (line: LineRow) => {
    const isActive = line.id === activeLineId;
    return (
      <div
        key={line.id}
        ref={isActive ? activeRef : null}
        data-ui="op-line"
        data-line={line.id}
        data-status={line.status}
        data-active={isActive ? 'true' : undefined}
        data-class={line.line_class ?? undefined}
        onClick={() => onLineClick(line.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px',
          cursor: 'pointer', borderRadius: 6,
          background: isActive ? 'rgba(129,182,76,0.1)' : 'transparent',
          border: isActive ? '1px solid rgba(129,182,76,0.3)' : '1px solid transparent',
          transition: 'background 0.12s',
          position: 'relative',
        }}
      >
        {/* Index */}
        <div style={{
          width: 28, height: 28, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600, color: 'var(--muted)',
          background: 'var(--hairline)', borderRadius: 4,
        }}>
          {line.index + 1}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {line.badge && <span style={{ fontSize: 13, lineHeight: 1 }}>{line.badge}</span>}
            <span style={{ fontSize: 13, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {line.label}
            </span>
            {line.isFreshDev && (
              <span style={{ fontSize: 11, color: '#E8A23A', fontWeight: 600, flexShrink: 0 }}>из партии</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <MasteryBar mastery={line.prog?.mastery ?? 0} />
            <span style={{ fontSize: 12, color: dueColor(line.dueText), fontWeight: dueBold(line.dueText) ? 700 : 400 }}>
              {line.dueText}
            </span>
          </div>
          {line.line_class && LINE_CLASS_COLORS[line.line_class] && (
            <div data-ui="op-line-class" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: LINE_CLASS_COLORS[line.line_class], flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: LINE_CLASS_COLORS[line.line_class] }}>
                {LINE_CLASS_LABELS[line.line_class]}
              </span>
            </div>
          )}
        </div>

        {/* Delete button on hover */}
        {onDeleteLine && (
          <button
            data-ui="op-line-del"
            onClick={e => { e.stopPropagation(); onDeleteLine(line.id); }}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              opacity: 0, background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', fontSize: 16, padding: 4,
            }}
            className="op-line-del-btn"
          >
            ×
          </button>
        )}
      </div>
    );
  };

  const listContent = groups
    ? groups.map(g => (
        <div key={g.label}>
          <div
            data-ui="op-group"
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', padding: '8px 10px 4px', letterSpacing: '0.04em' }}
          >
            {g.label}
          </div>
          {g.ids.map(id => {
            const line = lines.find(l => l.id === id);
            return line ? renderLine(line) : null;
          })}
        </div>
      ))
    : lines.map(renderLine);

  const footer = (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        data-ui="op-add-lines"
        onClick={onAddLines}
        style={{
          flex: 1, height: 32, border: '1px solid var(--hairline)', background: 'transparent',
          color: 'var(--muted)', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-btn, 4px)',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}
      >
        <span>＋</span>
        <span>Добавить линии</span>
      </button>
      <button
        data-ui="op-menu"
        onClick={onMenu}
        style={{
          width: 32, height: 32, border: '1px solid var(--hairline)', background: 'transparent',
          color: 'var(--muted)', fontSize: 16, cursor: 'pointer', borderRadius: 'var(--radius-btn, 4px)',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ⋯
      </button>
    </div>
  );

  return (
    <SessionPanel
      header={header}
      stats={[
        { value: counts.mastered, label: 'освоено', color: '#81B64C' },
        { value: counts.learning, label: 'изучаю', color: '#B088D8' },
        { value: counts.due,      label: 'повторить', color: '#E8A23A' },
        { value: counts.new,      label: 'новых', color: '#8FB4DA' },
      ]}
      controls={
        <div>
          {modesEl}
          {hardEl && <div style={{ marginTop: 8 }}>{hardEl}</div>}
        </div>
      }
      listLabel={`Линии · ${lines.length}`}
      list={listContent}
      footer={footer}
    />
  );
}
