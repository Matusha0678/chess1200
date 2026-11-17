'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';

export interface BoardKeyOptions {
  onPrev?:     () => void;  // ArrowLeft
  onNext?:     () => void;  // ArrowRight
  onFlip?:     () => void;  // F
  onHint?:     () => void;  // Space
  onUndo?:     () => void;  // Z (falls back to onPrev if unset)
  onEngine?:   () => void;  // E
  onNextLine?: () => void;  // N
  onHelp?:     () => void;  // ?
  enabled?:    boolean;     // default true
}

export function useBoardKeys(opts: BoardKeyOptions) {
  const ref = useRef(opts);
  useLayoutEffect(() => { ref.current = opts; }); // keep ref current before any paint

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (ref.current.enabled === false) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      const a = ref.current;
      switch (e.key) {
        case 'ArrowLeft':
          if (a.onPrev)      { e.preventDefault(); a.onPrev(); }
          break;
        case 'ArrowRight':
          if (a.onNext)      { e.preventDefault(); a.onNext(); }
          break;
        case 'f': case 'F':
          if (a.onFlip)      { e.preventDefault(); a.onFlip(); }
          break;
        case ' ':
          if (a.onHint)      { e.preventDefault(); a.onHint(); }
          break;
        case 'z': case 'Z':
          if (a.onUndo)      { e.preventDefault(); a.onUndo(); }
          else if (a.onPrev) { e.preventDefault(); a.onPrev(); }
          break;
        case 'e': case 'E':
          if (a.onEngine)    { e.preventDefault(); a.onEngine(); }
          break;
        case 'n': case 'N':
          if (a.onNextLine)  { e.preventDefault(); a.onNextLine(); }
          break;
        case '?':
          if (a.onHelp)      { e.preventDefault(); a.onHelp(); }
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
