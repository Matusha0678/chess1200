'use client';

import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';

export interface TrainerLayoutProps {
  session?: React.ReactNode;
  topBar: React.ReactNode;
  board: React.ReactNode;
  evalBar?: React.ReactNode;
  bottomBar: React.ReactNode;
  panel: React.ReactNode;
}

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--hairline)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

export function TrainerLayout({ session, topBar, board, evalBar, bottomBar, panel }: TrainerLayoutProps) {
  const { showLeft, rightWidth } = useTrainerGeometry();

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - var(--topbar-h))',
      overflow: 'hidden',
      padding: 20,
      gap: 20,
      boxSizing: 'border-box',
      background: 'var(--bg)',
      alignItems: 'flex-start',
    }}>

      {/* Left session column */}
      {showLeft && session !== undefined && (
        <div data-ui="session" style={{ width: 280, flexShrink: 0, alignSelf: 'stretch', ...CARD }}>
          {session}
        </div>
      )}

      {/* Board column */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignSelf: 'flex-start',
      }}>
        {/* Top player bar 32px */}
        <div data-ui="player-top" style={{ height: 32, flexShrink: 0, paddingLeft: 32, display: 'flex', alignItems: 'center' }}>
          {topBar}
        </div>

        {/* Eval bar + board */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ width: 24, flexShrink: 0 }}>
            {evalBar}
          </div>
          <div>
            {board}
          </div>
        </div>

        {/* Bottom player bar 32px */}
        <div data-ui="player-bottom" style={{ height: 32, flexShrink: 0, paddingLeft: 32, display: 'flex', alignItems: 'center' }}>
          {bottomBar}
        </div>
      </div>

      {/* Right panel */}
      <div data-ui="panel" style={{ flex: 1, minWidth: 420, alignSelf: 'stretch', ...CARD }}>
        {panel}
      </div>
    </div>
  );
}
