'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useBoardTheme, type AnimationSpeed } from '@/contexts/BoardThemeContext';
import { BOARD_THEMES, PIECE_STYLES, SITE_THEMES } from '@/lib/themes';

export default function ThemePanel() {
  const {
    boardThemeId, pieceStyleId, showNotation, soundEnabled, animationSpeed, siteThemeId,
    setBoardThemeId, setPieceStyleId, setShowNotation, setSoundEnabled, setAnimationSpeed, setSiteThemeId,
    isPanelOpen, closePanel,
  } = useBoardTheme();

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPanelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePanel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPanelOpen, closePanel]);

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        className="fixed top-0 right-0 z-50 h-full w-[320px] bg-[#0E0E0E] border-l border-[#1E1E1E] flex flex-col overflow-y-auto"
        aria-label="Настройки доски"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E1E1E] shrink-0">
          <span className="text-[14px] font-semibold text-[#F5F5F5]">Внешний вид</span>
          <button
            onClick={closePanel}
            className="text-[#606060] hover:text-[#F5F5F5] transition-colors p-1 rounded"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-7 px-5 py-5">

          {/* Site theme */}
          <section>
            <h2 className="text-[11px] font-semibold text-[#505050] uppercase tracking-widest mb-3">
              Тема сайта
            </h2>
            <div className="grid grid-cols-4 gap-1.5">
              {SITE_THEMES.map(theme => {
                const active = theme.id === siteThemeId;
                const isLight = theme.id === 'light';
                return (
                  <button
                    key={theme.id}
                    onClick={() => setSiteThemeId(theme.id)}
                    className={[
                      'flex flex-col items-center gap-1.5 rounded p-1.5 transition-colors',
                      active ? 'bg-[#1E1E1E] ring-1 ring-white/20' : 'hover:bg-[#161616]',
                    ].join(' ')}
                    title={theme.name}
                  >
                    {/* Mini app preview: outer = bg, inner = card */}
                    <div
                      className="w-10 h-7 rounded overflow-hidden relative"
                      style={{ background: theme.bg }}
                    >
                      {/* Top bar */}
                      <div className="absolute top-0 left-0 right-0 h-[6px]" style={{ background: theme.bg, borderBottom: `1px solid ${isLight ? '#D0D0D0' : '#1E1E1E'}` }} />
                      {/* Card block */}
                      <div className="absolute bottom-[3px] left-[3px] right-[3px] rounded-sm" style={{ height: '10px', background: theme.card, border: `1px solid ${isLight ? '#D0D0D0' : '#1E1E1E'}` }} />
                    </div>
                    <span className={[
                      'text-[9px] leading-tight text-center truncate w-full',
                      active ? 'text-[#F5F5F5]' : 'text-[#606060]',
                    ].join(' ')}>
                      {theme.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Board theme */}
          <section>
            <h2 className="text-[11px] font-semibold text-[#505050] uppercase tracking-widest mb-3">
              Тема доски
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {BOARD_THEMES.map(theme => {
                const active = theme.id === boardThemeId;
                return (
                  <button
                    key={theme.id}
                    onClick={() => setBoardThemeId(theme.id)}
                    className={[
                      'flex flex-col items-center gap-1.5 rounded p-1.5 transition-colors',
                      active ? 'bg-[#1E1E1E] ring-1 ring-white/20' : 'hover:bg-[#161616]',
                    ].join(' ')}
                    title={theme.name}
                  >
                    <div className="w-10 h-10 rounded overflow-hidden grid grid-cols-2 grid-rows-2">
                      <div style={{ background: theme.light }} />
                      <div style={{ background: theme.dark }} />
                      <div style={{ background: theme.dark }} />
                      <div style={{ background: theme.light }} />
                    </div>
                    <span className={[
                      'text-[9px] leading-tight text-center truncate w-full',
                      active ? 'text-[#F5F5F5]' : 'text-[#606060]',
                    ].join(' ')}>
                      {theme.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Piece style */}
          <section>
            <h2 className="text-[11px] font-semibold text-[#505050] uppercase tracking-widest mb-3">
              Фигуры
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {PIECE_STYLES.map(style => {
                const active = style.id === pieceStyleId;
                return (
                  <button
                    key={style.id}
                    onClick={() => setPieceStyleId(style.id)}
                    className={[
                      'flex flex-col items-center gap-1.5 rounded p-1.5 transition-colors',
                      active ? 'bg-[#1E1E1E] ring-1 ring-white/20' : 'hover:bg-[#161616]',
                    ].join(' ')}
                    title={style.name}
                  >
                    <div className="w-12 h-12 flex items-center justify-center">
                      {style.baseUrl ? (
                        <img
                          src={`${style.baseUrl}/wQ.svg`}
                          alt={style.name}
                          className="w-10 h-10 object-contain"
                          draggable={false}
                        />
                      ) : (
                        <svg viewBox="0 0 45 45" className="w-10 h-10" xmlns="http://www.w3.org/2000/svg">
                          <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22.5 11.63V6M20 8h5" strokeLinejoin="miter"/>
                            <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#fff" strokeLinecap="butt" strokeLinejoin="miter"/>
                            <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V17s-5.5-3.5-8 1.5c-3 7 6 10.5 6 10.5v7" fill="#fff"/>
                            <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0"/>
                          </g>
                        </svg>
                      )}
                    </div>
                    <span className={[
                      'text-[9px] leading-tight text-center truncate w-full',
                      active ? 'text-[#F5F5F5]' : 'text-[#606060]',
                    ].join(' ')}>
                      {style.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Animation speed */}
          <section>
            <h2 className="text-[11px] font-semibold text-[#505050] uppercase tracking-widest mb-3">
              Скорость анимации
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {(['slow', 'normal', 'fast'] as AnimationSpeed[]).map(speed => {
                const labels: Record<AnimationSpeed, string> = { slow: 'Медленно', normal: 'Норма', fast: 'Быстро' };
                const active = animationSpeed === speed;
                return (
                  <button
                    key={speed}
                    onClick={() => setAnimationSpeed(speed)}
                    className={[
                      'h-9 rounded text-[12px] font-medium transition-colors',
                      active
                        ? 'bg-white text-[#050505]'
                        : 'bg-[#161616] text-[#606060] hover:text-[#A0A0A0] hover:bg-[#1E1E1E]',
                    ].join(' ')}
                  >
                    {labels[speed]}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Options */}
          <section>
            <h2 className="text-[11px] font-semibold text-[#505050] uppercase tracking-widest mb-3">
              Настройки
            </h2>
            <div className="flex flex-col gap-1">
              <Toggle
                label="Показывать координаты"
                value={showNotation}
                onChange={setShowNotation}
              />
              <Toggle
                label="Звук ходов"
                value={soundEnabled}
                onChange={setSoundEnabled}
              />
            </div>
          </section>

        </div>
      </aside>
    </>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between w-full px-3 py-2.5 rounded hover:bg-[#161616] transition-colors group"
    >
      <span className="text-[13px] text-[#A0A0A0] group-hover:text-[#F5F5F5] transition-colors">{label}</span>
      <div className={[
        'w-9 h-5 rounded-full relative transition-colors duration-200 shrink-0',
        value ? 'bg-white/90' : 'bg-[#303030]',
      ].join(' ')}>
        <div className={[
          'absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200 shadow',
          value ? 'translate-x-4 bg-black' : 'translate-x-0.5 bg-[#606060]',
        ].join(' ')} />
      </div>
    </button>
  );
}
