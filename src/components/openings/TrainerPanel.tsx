'use client';

import { TaskPanel } from '@/components/trainer/TaskPanel';

interface TrainerPanelProps {
  breadcrumb: string;
  progress?: { current: number; total: number };
  xp?: number;
  title: string;
  chips?: React.ReactNode;
  children: React.ReactNode;
  actions: React.ReactNode;
}

export function TrainerPanel({ breadcrumb, progress, xp, title, chips, children, actions }: TrainerPanelProps) {
  return (
    <TaskPanel
      breadcrumb={breadcrumb}
      progress={progress}
      xp={xp}
      title={title}
      titleSize={22}
      chips={chips}
      actions={actions}
    >
      {children}
    </TaskPanel>
  );
}

// ── Shared styled blocks ──────────────────────────────────────────────────────

const RESULT_BG: Record<string, string> = {
  fail: 'rgba(220,60,50,.1)',
  info: 'rgba(80,130,200,.1)',
  ok:   'rgba(129,182,76,.1)',
  done: 'rgba(230,170,50,.1)',
  hint: 'rgba(230,170,50,.1)',
};
const RESULT_BORDER: Record<string, string> = {
  fail: 'rgba(220,60,50,.4)',
  info: 'rgba(80,130,200,.4)',
  ok:   'rgba(129,182,76,.4)',
  done: 'rgba(230,170,50,.4)',
  hint: 'rgba(230,170,50,.4)',
};

export function FeedbackCard({ result, text, children }: { result: string; text?: string; children?: React.ReactNode }) {
  return (
    <div
      data-ui="op-feedback"
      data-result={result}
      style={{
        margin: '0 24px 12px',
        padding: '12px 14px',
        background: RESULT_BG[result] ?? 'var(--surface)',
        border: `1px solid ${RESULT_BORDER[result] ?? 'var(--hairline)'}`,
        borderRadius: 8,
        fontSize: 14, lineHeight: 1.5, color: 'var(--ivory)',
      }}
    >
      {text && <span dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />}
      {children}
    </div>
  );
}

export function TaskCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-ui="op-task"
      style={{
        margin: '0 24px 12px',
        padding: '12px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 8,
        fontSize: 14, lineHeight: 1.6, color: 'var(--muted)',
      }}
    >
      {children}
    </div>
  );
}

export function GameNoteCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-ui="op-game-note"
      style={{
        margin: '0 24px 12px',
        padding: '10px 14px',
        background: 'rgba(230,170,50,.08)',
        border: '1px solid rgba(230,170,50,.3)',
        borderRadius: 8,
        fontSize: 13, lineHeight: 1.5, color: 'var(--ivory)',
      }}
    >
      {children}
    </div>
  );
}

export function StepsBar({ steps, label }: { steps: Array<{ ply: number; state: string; current: boolean }>; label: string }) {
  return (
    <div data-ui="op-steps" style={{ margin: '0 24px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Твои ходы в линии</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {steps.map((s, i) => {
          let bg = 'var(--hairline)';
          if (s.state === 'ok')   bg = 'var(--accent)';
          if (s.state === 'fail') bg = '#E05050';
          if (s.state === 'hint') bg = 'var(--accent)';
          if (s.state === 'now')  bg = 'var(--muted)';
          return (
            <div
              key={i}
              data-state={s.state}
              style={{
                width: 10, height: 10, borderRadius: 2,
                background: bg,
                boxShadow: s.current ? '0 0 0 2px var(--ivory)' : undefined,
                transition: 'background 0.2s',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function MovesTable({ items }: { items: Array<{ ply: number; text: string; state: string }> }) {
  // Group into move pairs
  const rows: Array<{ no: number; white: { text: string; state: string } | null; black: { text: string; state: string } | null }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const moveNo = Math.floor(item.ply / 2) + 1;
    if (item.ply % 2 === 0) {
      // white
      rows.push({ no: moveNo, white: { text: item.text, state: item.state }, black: null });
    } else {
      // black — append to last row or create new
      const last = rows[rows.length - 1];
      if (last && last.black === null && last.no === moveNo) {
        last.black = { text: item.text, state: item.state };
      } else {
        rows.push({ no: moveNo, white: null, black: { text: item.text, state: item.state } });
      }
    }
  }

  const cellStyle = (state: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: 104, padding: '3px 6px', fontSize: 13,
      fontFamily: 'var(--font-mono, monospace)',
      color: state === 'opp' ? 'var(--muted)' : state === 'future' ? 'var(--hairline)' : 'var(--ivory)',
      fontWeight: state === 'opp' || state === 'future' ? 400 : 600,
      borderRadius: 4,
    };
    if (state === 'now') {
      base.background = 'rgba(129,182,76,.2)';
      base.border = '1px solid rgba(129,182,76,.4)';
    } else if (state === 'fail' || state === 'wrong') {
      base.color = '#E05050';
    } else if (state === 'hint') {
      base.color = 'var(--accent)';
    }
    return base;
  };

  return (
    <div data-ui="op-moves" style={{ margin: '0 24px 12px', overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ width: 34, padding: '2px 6px 2px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {row.no}.
              </td>
              <td style={{ padding: '2px 2px' }}>
                {row.white ? <span style={cellStyle(row.white.state)}>{row.white.text}</span> : null}
              </td>
              <td style={{ padding: '2px 2px' }}>
                {row.black ? <span style={cellStyle(row.black.state)}>{row.black.text}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PanelChip({ children, color, bg }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: 24, padding: '0 10px',
      background: bg ?? 'rgba(255,255,255,0.08)',
      color: color ?? 'var(--muted)',
      fontSize: 12, fontWeight: 500,
      borderRadius: 'var(--radius-btn, 6px)',
      border: '1px solid var(--hairline)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

interface PanelBtnProps {
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  dataUi?: string;
  children: React.ReactNode;
}

export function PanelBtn({ onClick, primary, disabled, dataUi, children }: PanelBtnProps) {
  return (
    <button
      data-ui={dataUi}
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 40, padding: '0 20px',
        background: primary ? 'var(--accent)' : 'transparent',
        border: primary ? 'none' : '1px solid var(--hairline)',
        color: primary ? '#fff' : 'var(--ivory)',
        fontSize: 14, fontWeight: primary ? 700 : 500,
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: 'var(--radius-btn, 6px)',
        fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 6,
        opacity: disabled ? 0.4 : 1,
        transition: 'opacity 0.15s',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}
