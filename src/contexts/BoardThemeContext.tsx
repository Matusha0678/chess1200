'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { BOARD_THEMES, PIECE_STYLES, PIECE_KEYS, type BoardTheme, type PieceStyle } from '@/lib/themes';

type PieceRenderObject = Record<string, (props?: { fill?: string; square?: string; svgStyle?: React.CSSProperties }) => React.JSX.Element>;

export type AnimationSpeed = 'slow' | 'normal' | 'fast';

export const ANIMATION_MS: Record<AnimationSpeed, number> = {
  slow: 500,
  normal: 200,
  fast: 50,
};

interface BoardThemeSettings {
  boardThemeId: string;
  pieceStyleId: string;
  showNotation: boolean;
  soundEnabled: boolean;
  animationSpeed: AnimationSpeed;
  siteThemeId: string;
}

interface BoardThemeContextValue extends BoardThemeSettings {
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  customPieces: PieceRenderObject | undefined;
  animationMs: number;
  setBoardThemeId: (id: string) => void;
  setPieceStyleId: (id: string) => void;
  setShowNotation: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setAnimationSpeed: (s: AnimationSpeed) => void;
  setSiteThemeId: (id: string) => void;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const DEFAULT_SETTINGS: BoardThemeSettings = {
  boardThemeId: 'dark',
  pieceStyleId: 'default',
  showNotation: true,
  soundEnabled: true,
  animationSpeed: 'normal',
  siteThemeId: 'dark',
};

const STORAGE_KEY = 'chess1200-board-settings';

function loadSettings(): BoardThemeSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function buildCustomPieces(baseUrl: string): PieceRenderObject {
  const pieces: PieceRenderObject = {};
  for (const key of PIECE_KEYS) {
    const url = `${baseUrl}/${key}.svg`;
    pieces[key] = () => (
      <img
        src={url}
        alt={key}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        draggable={false}
      />
    );
  }
  return pieces;
}

const BoardThemeContext = createContext<BoardThemeContextValue | null>(null);

export function BoardThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BoardThemeSettings>(DEFAULT_SETTINGS);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Apply site theme to <html> data attribute so CSS overrides kick in
  useEffect(() => {
    document.documentElement.dataset.siteTheme = settings.siteThemeId;
  }, [settings.siteThemeId]);

  // Functional update pattern — no stale closure possible
  const save = useCallback((updater: (prev: BoardThemeSettings) => BoardThemeSettings) => {
    setSettings(prev => {
      const next = updater(prev);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const setBoardThemeId   = useCallback((id: string) => save(p => ({ ...p, boardThemeId: id })), [save]);
  const setPieceStyleId   = useCallback((id: string) => save(p => ({ ...p, pieceStyleId: id })), [save]);
  const setShowNotation   = useCallback((v: boolean) => save(p => ({ ...p, showNotation: v })), [save]);
  const setSoundEnabled   = useCallback((v: boolean) => save(p => ({ ...p, soundEnabled: v })), [save]);
  const setAnimationSpeed = useCallback((s: AnimationSpeed) => save(p => ({ ...p, animationSpeed: s })), [save]);
  const setSiteThemeId    = useCallback((id: string) => save(p => ({ ...p, siteThemeId: id })), [save]);

  const boardTheme = BOARD_THEMES.find(t => t.id === settings.boardThemeId) ?? BOARD_THEMES[0];
  const pieceStyle = PIECE_STYLES.find(p => p.id === settings.pieceStyleId) ?? PIECE_STYLES[0];

  // Memoize customPieces by baseUrl to avoid recreating functions on every render
  const customPiecesRef = useRef<{ url: string; pieces: PieceRenderObject } | null>(null);
  if (pieceStyle.baseUrl) {
    if (!customPiecesRef.current || customPiecesRef.current.url !== pieceStyle.baseUrl) {
      customPiecesRef.current = { url: pieceStyle.baseUrl, pieces: buildCustomPieces(pieceStyle.baseUrl) };
    }
  } else {
    customPiecesRef.current = null;
  }
  const customPieces = customPiecesRef.current?.pieces;

  const animationMs = ANIMATION_MS[settings.animationSpeed];

  return (
    <BoardThemeContext.Provider value={{
      ...settings,
      boardTheme,
      pieceStyle,
      customPieces,
      animationMs,
      setBoardThemeId,
      setPieceStyleId,
      setShowNotation,
      setSoundEnabled,
      setAnimationSpeed,
      setSiteThemeId,
      isPanelOpen,
      openPanel: () => setIsPanelOpen(true),
      closePanel: () => setIsPanelOpen(false),
    }}>
      {children}
    </BoardThemeContext.Provider>
  );
}

export function useBoardTheme() {
  const ctx = useContext(BoardThemeContext);
  if (!ctx) throw new Error('useBoardTheme must be used inside BoardThemeProvider');
  return ctx;
}
