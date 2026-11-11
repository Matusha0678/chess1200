'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { BOARD_THEMES, PIECE_STYLES, PIECE_KEYS, type BoardTheme, type PieceStyle } from '@/lib/themes';

type PieceRenderObject = Record<string, (props?: { fill?: string; square?: string; svgStyle?: React.CSSProperties }) => React.JSX.Element>;

interface BoardThemeSettings {
  boardThemeId: string;
  pieceStyleId: string;
  showNotation: boolean;
}

interface BoardThemeContextValue extends BoardThemeSettings {
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  customPieces: PieceRenderObject | undefined;
  setBoardThemeId: (id: string) => void;
  setPieceStyleId: (id: string) => void;
  setShowNotation: (v: boolean) => void;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const DEFAULT_SETTINGS: BoardThemeSettings = {
  boardThemeId: 'dark',
  pieceStyleId: 'default',
  showNotation: true,
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

  const save = useCallback((next: BoardThemeSettings) => {
    setSettings(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const setBoardThemeId  = useCallback((id: string) => save({ ...settings, boardThemeId: id }), [settings, save]);
  const setPieceStyleId  = useCallback((id: string) => save({ ...settings, pieceStyleId: id }), [settings, save]);
  const setShowNotation  = useCallback((v: boolean) => save({ ...settings, showNotation: v }), [settings, save]);

  const boardTheme = BOARD_THEMES.find(t => t.id === settings.boardThemeId) ?? BOARD_THEMES[0];
  const pieceStyle = PIECE_STYLES.find(p => p.id === settings.pieceStyleId) ?? PIECE_STYLES[0];
  const customPieces = pieceStyle.baseUrl ? buildCustomPieces(pieceStyle.baseUrl) : undefined;

  return (
    <BoardThemeContext.Provider value={{
      ...settings,
      boardTheme,
      pieceStyle,
      customPieces,
      setBoardThemeId,
      setPieceStyleId,
      setShowNotation,
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
