'use client';
import { useEffect } from 'react';

export interface KeyDef {
  key: string;
  desc: string;
}

interface Props {
  keys: KeyDef[];
  onClose: () => void;
}

export function KeyHelpDialog({ keys, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', cursor: 'default' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Горячие клавиши"
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 61,
          width: 'min(380px, calc(100vw - 32px))',
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--hairline)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Горячие клавиши
          </span>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '6px 0 10px' }}>
          {keys.map(({ key, desc }) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 20px', gap: 16,
            }}>
              <span style={{ fontSize: 13, color: 'var(--ivory)' }}>{desc}</span>
              <kbd style={{
                fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
                color: 'var(--muted)',
                background: 'var(--bg)',
                border: '1px solid var(--hairline)',
                borderRadius: 'max(3px, calc(var(--radius-card) - 6px))',
                padding: '2px 8px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>{key}</kbd>
            </div>
          ))}
        </div>
        <div style={{
          borderTop: '1px solid var(--hairline)',
          padding: '8px 20px',
          fontSize: 11, color: 'var(--muted)',
        }}>
          Ctrl+K — открыть поиск
        </div>
      </div>
    </>
  );
}
