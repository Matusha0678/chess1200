'use client';

export interface TrainerLayoutProps {
  /** Left 280px session column (card). Omit to hide. */
  sessionPanel?: React.ReactNode;
  /** 32px strip above the board — opponent row. */
  topPlayer?: React.ReactNode;
  /** 24px eval bar to the left of the board. Provide to reserve space. */
  evalBar?: React.ReactNode;
  /** The board itself — fills 774×774 container. */
  boardContent: React.ReactNode;
  /** 32px strip below the board — my row. */
  bottomPlayer?: React.ReactNode;
  /** Right flex:1 task panel (card). */
  taskPanel: React.ReactNode;
}

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--hairline)',
  overflow: 'hidden',
};

/**
 * 3-column trainer layout. Dimensions from docs/mockups/README.md:
 * left 280px | board 806px (24px eval + 8px gap + 774px) | right flex:1
 * Padding 20px around, gap 20px between columns.
 * Player strips 32px, board area fills to 774×774.
 */
export function TrainerLayout({
  sessionPanel,
  topPlayer,
  evalBar,
  boardContent,
  bottomPlayer,
  taskPanel,
}: TrainerLayoutProps) {
  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - var(--topbar-h))',
      overflow: 'hidden',
      padding: 20,
      gap: 20,
      boxSizing: 'border-box',
      background: 'var(--bg)',
    }}>

      {/* ── Left: session panel 280px ──────────────────────────────────── */}
      {sessionPanel !== undefined && (
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', ...CARD }}>
          {sessionPanel}
        </div>
      )}

      {/* ── Center: board column 806px ─────────────────────────────────── */}
      <div style={{
        width: 806,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {/* Top player strip 32px */}
        {topPlayer && (
          <div style={{ height: 32, flexShrink: 0, paddingLeft: 32, display: 'flex', alignItems: 'center' }}>
            {topPlayer}
          </div>
        )}

        {/* Board row: evalbar (24px) + 8px gap + board (774px) */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 8 }}>
          {/* Always reserve 24px for eval bar alignment */}
          <div style={{ width: 24, flexShrink: 0, display: 'flex' }}>
            {evalBar}
          </div>
          {/* Board: 806 - 24 - 8 = 774px wide, fills remaining height */}
          <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            {boardContent}
          </div>
        </div>

        {/* Bottom player strip 32px */}
        {bottomPlayer && (
          <div style={{ height: 32, flexShrink: 0, paddingLeft: 32, display: 'flex', alignItems: 'center' }}>
            {bottomPlayer}
          </div>
        )}
      </div>

      {/* ── Right: task panel flex:1 ────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', ...CARD }}>
        {taskPanel}
      </div>
    </div>
  );
}
