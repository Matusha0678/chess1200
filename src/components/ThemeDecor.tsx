'use client';

import { useMemo } from 'react';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { FUN_THEMES } from '@/lib/themes';

type DecorItem = {
  left: number;
  top: number;
  delay: number;
  duration: number;
  size: number;
};

type DecorSpec = {
  count: number;
  durMin: number;
  durMax: number;
  sizeMin: number;
  sizeMax: number;
  /** true → items scattered across the viewport (static-ish); false → start at top:0 (ingress/egress via translateY). */
  scatter: boolean;
};

const SPECS: Record<string, DecorSpec> = {
  pumpkins: { count: 10,  durMin: 28, durMax: 46, sizeMin: 160, sizeMax: 340, scatter: true  },
  snow:     { count: 70,  durMin: 10, durMax: 20, sizeMin: 2,   sizeMax: 5,   scatter: false },
  ufo:      { count: 0,   durMin: 0,  durMax: 0,  sizeMin: 0,   sizeMax: 0,   scatter: false },
  glitch:   { count: 0,   durMin: 0,  durMax: 0,  sizeMin: 0,   sizeMax: 0,   scatter: false },
  easter:   { count: 12,  durMin: 22, durMax: 36, sizeMin: 120, sizeMax: 260, scatter: true  },
  robot:    { count: 0,   durMin: 0,  durMax: 0,  sizeMin: 0,   sizeMax: 0,   scatter: false },
  hearts:   { count: 30,  durMin: 10, durMax: 18, sizeMin: 2,   sizeMax: 4,   scatter: false },
  pirate:   { count: 0,   durMin: 0,  durMax: 0,  sizeMin: 0,   sizeMax: 0,   scatter: false },
  xeno:     { count: 0,   durMin: 0,  durMax: 0,  sizeMin: 0,   sizeMax: 0,   scatter: false },
  sakura:   { count: 22,  durMin: 14, durMax: 24, sizeMin: 6,   sizeMax: 14,  scatter: false },
  leaves:   { count: 24,  durMin: 10, durMax: 22, sizeMin: 2,   sizeMax: 5,   scatter: false },
  stars:    { count: 140, durMin: 3,  durMax: 8,  sizeMin: 1,   sizeMax: 3,   scatter: true  },
  bubbles:  { count: 20,  durMin: 10, durMax: 22, sizeMin: 5,   sizeMax: 18,  scatter: false },
  fire:     { count: 40,  durMin: 4,  durMax: 10, sizeMin: 2,   sizeMax: 5,   scatter: false },
};

function build(spec: DecorSpec): DecorItem[] {
  const { count, durMin, durMax, sizeMin, sizeMax, scatter } = spec;
  return Array.from({ length: count }, (_, i) => ({
    left: ((i * 137) % 100),
    top: scatter ? ((i * 211) % 100) : 0,
    delay: -(((i * 71) % 100) / 100) * durMax,
    duration: durMin + ((i * 53) % 100) / 100 * (durMax - durMin),
    size: sizeMin + ((i * 83) % 100) / 100 * (sizeMax - sizeMin),
  }));
}

export default function ThemeDecor() {
  const { siteThemeId } = useBoardTheme();
  const config = FUN_THEMES[siteThemeId];

  const items = useMemo<DecorItem[]>(() => {
    if (!config) return [];
    const spec = SPECS[config.decor];
    if (!spec || spec.count === 0) return [];
    return build(spec);
  }, [config]);

  if (!config || items.length === 0) return null;

  return (
    <div className="theme-decor" data-decor={config.decor} aria-hidden="true">
      {items.map((it, i) => (
        <span
          key={i}
          className="theme-decor-item"
          style={{
            left: `${it.left}%`,
            top: `${it.top}%`,
            width: `${it.size}px`,
            height: `${it.size}px`,
            animationDelay: `${it.delay.toFixed(2)}s`,
            animationDuration: `${it.duration.toFixed(2)}s`,
          }}
        />
      ))}
    </div>
  );
}
