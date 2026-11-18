'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  style?: React.CSSProperties;
}

export function Dropdown({ value, onChange, options, style }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);
  const focusedIdx = options.findIndex(o => o.value === value);

  // openDropdown initializes focused to the currently-selected item
  const openDropdown = useCallback(() => {
    setFocused(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  }, [options, value]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, options.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(options[focused]?.value ?? value);
      close();
    }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', flex: 1, ...style }}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => { if (open) close(); else openDropdown(); }}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%', height: 38, borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--hairline-2)',
          color: '#DDD9D4', fontSize: 14, padding: '0 32px 0 12px',
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', textAlign: 'left',
          outline: 'none',
        }}
        onFocus={e => (e.currentTarget.style.boxShadow = 'inset 0 0 0 2px var(--accent)')}
        onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? '—'}
        </span>
        <svg
          viewBox="0 0 24 24" width={14} height={14}
          style={{ position: 'absolute', right: 10, top: '50%', transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)', pointerEvents: 'none', color: 'var(--faint)', transition: 'transform .15s' }}
          fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
            background: 'var(--surface)', border: '1px solid var(--hairline)',
            borderRadius: 10, boxShadow: 'var(--shadow-card)',
            overflow: 'hidden', maxHeight: 320, overflowY: 'auto',
          }}
        >
          {options.map((opt, i) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onMouseEnter={() => setFocused(i)}
              onMouseDown={e => { e.preventDefault(); onChange(opt.value); close(); }}
              style={{
                height: 36, display: 'flex', alignItems: 'center',
                padding: '0 12px', fontSize: 14, cursor: 'pointer',
                color: opt.value === value ? 'var(--accent)' : 'var(--ivory)',
                background: i === focused ? 'var(--surface-2)' : 'transparent',
                fontWeight: opt.value === value ? 600 : 400,
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
