'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useBoardTheme, type AnimationSpeed } from '@/contexts/BoardThemeContext';
import { BOARD_THEMES, PIECE_STYLES, SITE_THEMES, getSiteThemeFamily, FUN_THEMES, FUN_THEME_BUNDLES } from '@/lib/themes';

type FunPreset = {
  id: string;
  label: string;
  desc: string;
  emoji: string;
  bg: string;
  accent: string;
};

const FUN_PRESETS: FunPreset[] = [
  { id: 'halloween', label: 'Хэллоуин',  desc: FUN_THEMES.halloween.desc, emoji: FUN_THEMES.halloween.logo, bg: '#120806', accent: '#FF7A1F' },
  { id: 'newyear',   label: 'Новый год', desc: FUN_THEMES.newyear.desc,   emoji: FUN_THEMES.newyear.logo,   bg: '#040F17', accent: '#E54848' },
  { id: 'alien',     label: 'Alien',     desc: FUN_THEMES.alien.desc,     emoji: FUN_THEMES.alien.logo,     bg: '#050A05', accent: '#39FF14' },
  { id: 'cyber',     label: 'Cyberpunk', desc: FUN_THEMES.cyber.desc,     emoji: FUN_THEMES.cyber.logo,     bg: '#08051A', accent: '#FF2EC8' },
  { id: 'easter',    label: 'Пасха',     desc: FUN_THEMES.easter.desc,    emoji: FUN_THEMES.easter.logo,    bg: '#FFF7EC', accent: '#FF8AB4' },
  { id: 'robot',     label: 'Робот',     desc: FUN_THEMES.robot.desc,     emoji: FUN_THEMES.robot.logo,     bg: '#0E1217', accent: '#4FC3F7' },
  { id: 'valentine', label: 'Валентин',  desc: FUN_THEMES.valentine.desc, emoji: FUN_THEMES.valentine.logo, bg: '#140608', accent: '#FF5A8A' },
  { id: 'pirate',    label: 'Пираты',    desc: FUN_THEMES.pirate.desc,    emoji: FUN_THEMES.pirate.logo,    bg: '#060A14', accent: '#D4A648' },
  { id: 'xeno',      label: 'Ксеноморф', desc: FUN_THEMES.xeno.desc,      emoji: FUN_THEMES.xeno.logo,      bg: '#060805', accent: '#BFE830' },
  { id: 'sakura',    label: 'Сакура',    desc: FUN_THEMES.sakura.desc,    emoji: FUN_THEMES.sakura.logo,    bg: '#FFF4F3', accent: '#FFB7CE' },
  { id: 'autumn',    label: 'Осень',     desc: FUN_THEMES.autumn.desc,    emoji: FUN_THEMES.autumn.logo,    bg: '#180C04', accent: '#E88A3C' },
  { id: 'galaxy',    label: 'Галактика', desc: FUN_THEMES.galaxy.desc,    emoji: FUN_THEMES.galaxy.logo,    bg: '#0A0520', accent: '#B48AFF' },
  { id: 'abyss',     label: 'Глубина',   desc: FUN_THEMES.abyss.desc,     emoji: FUN_THEMES.abyss.logo,     bg: '#04141A', accent: '#40D0E0' },
  { id: 'dragon',    label: 'Дракон',    desc: FUN_THEMES.dragon.desc,    emoji: FUN_THEMES.dragon.logo,    bg: '#180608', accent: '#FF7030' },
  { id: 'sakura-dark', label: 'Сакура ночь',    desc: FUN_THEMES['sakura-dark'].desc, emoji: FUN_THEMES['sakura-dark'].logo, bg: '#0A0608', accent: '#FF5090' },
  { id: 'bloodmoon',   label: 'Кровавая луна',  desc: FUN_THEMES.bloodmoon.desc,      emoji: FUN_THEMES.bloodmoon.logo,      bg: '#0A0202', accent: '#E82020' },
  { id: 'icedragon',   label: 'Ледяной дракон', desc: FUN_THEMES.icedragon.desc,      emoji: FUN_THEMES.icedragon.logo,      bg: '#020A12', accent: '#80D8FF' },
  { id: 'synthwave',   label: 'Синтвейв',       desc: FUN_THEMES.synthwave.desc,      emoji: FUN_THEMES.synthwave.logo,      bg: '#0A0426', accent: '#FF4FA3' },
];

type FamilyPreset = {
  id: string;
  label: string;
  bg: string;
  card: string;
  border: string;
  accent: string | null;
  rounded: boolean;
};

const FAMILY_PRESETS: FamilyPreset[] = [
  { id: 'dark',        label: 'Газетный',      bg: '#050505', card: '#141414', border: '#1E1E1E', accent: null,      rounded: false },
  { id: 'light',       label: 'Светлый',       bg: '#F8F8F8', card: '#FFFFFF', border: '#D0D0D0', accent: null,      rounded: false },
  { id: 'soft-dark',   label: 'Мягкий тёмный', bg: '#302E2B', card: '#262522', border: 'transparent', accent: 'var(--accent)', rounded: true  },
  { id: 'soft-light',  label: 'Мягкий светл.', bg: '#F3F3F1', card: '#FFFFFF', border: 'rgba(0,0,0,0.08)', accent: 'var(--accent)', rounded: true },
  { id: 'cream-dark',  label: 'Сепия',         bg: '#1E1A14', card: '#2A2520', border: 'transparent', accent: '#D4A464', rounded: true },
  { id: 'cream',       label: 'Крем',          bg: '#F5EFE0', card: '#FFFAEE', border: 'rgba(140,100,40,0.18)', accent: '#B86B30', rounded: true },
  { id: 'nord',        label: 'Nord',          bg: '#2E3440', card: '#3B4252', border: 'transparent', accent: '#88C0D0', rounded: true },
  { id: 'nord-light',  label: 'Nord Light',    bg: '#ECEFF4', card: '#FFFFFF', border: 'rgba(46,52,64,0.1)', accent: '#5E81AC', rounded: true },
  { id: 'sunset',      label: 'Закат',         bg: '#1A0F1A', card: '#2A1820', border: 'transparent', accent: '#FF8A5C', rounded: true },
  { id: 'sunset-warm', label: 'Персик',        bg: '#FDF2E9', card: '#FFFFFF', border: 'rgba(200,100,40,0.14)', accent: '#E06A3C', rounded: true },
  { id: 'mono-dark',   label: 'Моно тёмный',   bg: '#1A1A1A', card: '#242424', border: '#2A2A2A',  accent: null,      rounded: true },
  { id: 'mono-light',  label: 'Моно светлый',  bg: '#EEEEEE', card: '#F8F8F8', border: '#D0D0D0',  accent: null,      rounded: true },
];

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

          {/* Site theme – family selector */}
          <section>
            <h2 className="text-[11px] font-semibold text-[#505050] uppercase tracking-widest mb-3">
              Стиль
            </h2>
            {/* Family presets */}
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {FAMILY_PRESETS.map(opt => {
                const active = siteThemeId === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSiteThemeId(opt.id)}
                    className={[
                      'flex items-center gap-2 w-full px-2.5 py-2 rounded text-left transition-colors min-w-0',
                      active ? 'bg-[#1E1E1E] ring-1 ring-white/20' : 'hover:bg-[#161616]',
                    ].join(' ')}
                    title={opt.label}
                  >
                    <div
                      className="w-7 h-7 relative shrink-0 overflow-hidden"
                      style={{
                        background: opt.bg,
                        borderRadius: opt.rounded ? 6 : 0,
                        border: `1px solid ${opt.border}`,
                      }}
                    >
                      <div
                        className="absolute bottom-[3px] left-[3px] right-[3px]"
                        style={{
                          height: 8,
                          background: opt.card,
                          borderRadius: opt.rounded ? 3 : 0,
                          border: `1px solid ${opt.border}`,
                        }}
                      />
                      {opt.accent && (
                        <div
                          className="absolute top-[4px] right-[4px] w-[5px] h-[5px] rounded-full"
                          style={{ background: opt.accent }}
                        />
                      )}
                    </div>
                    <span
                      className={[
                        'text-[11px] font-semibold truncate min-w-0',
                        active ? 'text-[#F5F5F5]' : 'text-[#A0A0A0]',
                      ].join(' ')}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Color variants – only for newspaper family (which has 20+ variants) */}
            {getSiteThemeFamily(siteThemeId) === 'newspaper' && (
              <>
                <h3 className="text-[10px] font-semibold text-[#505050] uppercase tracking-widest mb-2">
                  Оттенок
                </h3>
                <div className="grid grid-cols-4 gap-1.5">
                  {SITE_THEMES
                    .filter(t => getSiteThemeFamily(t.id) === 'newspaper')
                    .map(theme => {
                      const active = theme.id === siteThemeId;
                      const isLight = theme.id === 'light';
                      return (
                        <button
                          key={theme.id}
                          onClick={() => setSiteThemeId(theme.id)}
                          className={[
                            'flex flex-col items-center gap-1 rounded p-1 transition-colors min-w-0',
                            active ? 'bg-[#1E1E1E] ring-1 ring-white/20' : 'hover:bg-[#161616]',
                          ].join(' ')}
                          title={theme.name}
                        >
                          <div className="w-full h-6 rounded overflow-hidden relative" style={{ background: theme.bg }}>
                            <div className="absolute top-0 left-0 right-0 h-[5px]" style={{ background: theme.bg, borderBottom: `1px solid ${isLight ? '#D0D0D0' : '#1E1E1E'}` }} />
                            <div className="absolute bottom-[2px] left-[2px] right-[2px] rounded-sm" style={{ height: '9px', background: theme.card, border: `1px solid ${isLight ? '#D0D0D0' : '#1E1E1E'}` }} />
                          </div>
                          <span className={['text-[9px] leading-tight text-center truncate w-full', active ? 'text-[#F5F5F5]' : 'text-[#606060]'].join(' ')}>
                            {theme.name}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </>
            )}
          </section>

          {/* Fun / Easter-egg themes */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold text-[#505050] uppercase tracking-widest">
                Пасхалки
              </h2>
              {FUN_THEME_BUNDLES[siteThemeId] && (
                <button
                  onClick={() => {
                    const b = FUN_THEME_BUNDLES[siteThemeId];
                    setBoardThemeId(b.boardThemeId);
                    setPieceStyleId(b.pieceStyleId);
                  }}
                  className="text-[10px] font-semibold uppercase tracking-wider text-[#A0A0A0] hover:text-[#F5F5F5] border border-[#2A2A2A] hover:border-[#404040] px-2 py-1 rounded transition-colors"
                  title="Поставить доску и фигуры под тему"
                >
                  Подогнать всё
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {FUN_PRESETS.map(opt => {
                const active = siteThemeId === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSiteThemeId(opt.id)}
                    className={[
                      'flex items-center gap-2 w-full px-2.5 py-2 rounded text-left transition-colors min-w-0',
                      active ? 'bg-[#1E1E1E] ring-1 ring-white/20' : 'hover:bg-[#161616]',
                    ].join(' ')}
                    title={opt.desc}
                  >
                    <div
                      className="w-7 h-7 relative shrink-0 rounded flex items-center justify-center text-[16px]"
                      style={{ background: opt.bg, boxShadow: `inset 0 0 0 1px ${opt.accent}44` }}
                      aria-hidden="true"
                    >
                      {opt.emoji}
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className={['text-[11px] font-semibold truncate', active ? 'text-[#F5F5F5]' : 'text-[#A0A0A0]'].join(' ')}>
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-[#606060] truncate">{opt.desc}</span>
                    </div>
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
                          src={`${style.baseUrl}/${style.lowercase ? 'wq' : 'wQ'}${style.ext ?? '.svg'}`}
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
