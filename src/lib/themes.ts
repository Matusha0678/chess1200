export type BoardTheme = {
  id: string;
  name: string;
  dark: string;
  light: string;
};

export type PieceStyle = {
  id: string;
  name: string;
  baseUrl: string | null;
};

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'dark',     name: 'Тёмный',   dark: '#3A3A3A', light: '#8A8A8A' },
  { id: 'classic',  name: 'Классика', dark: '#B58863', light: '#F0D9B5' },
  { id: 'green',    name: 'Лесной',   dark: '#538A6E', light: '#FFFFDD' },
  { id: 'ocean',    name: 'Океан',    dark: '#4B7399', light: '#CADBEE' },
  { id: 'purple',   name: 'Аметист',  dark: '#8470A4', light: '#C9B9D8' },
  { id: 'mono',     name: 'Уголь',    dark: '#1A1A1A', light: '#4A4A4A' },
  { id: 'walnut',   name: 'Орех',     dark: '#8B6914', light: '#D9A85C' },
  { id: 'arctic',   name: 'Арктика',  dark: '#6B8FA8', light: '#DEE9F0' },
  { id: 'ruby',     name: 'Рубин',    dark: '#7A2B2B', light: '#D9B4B4' },
  { id: 'olive',    name: 'Оливка',   dark: '#4A5C2E', light: '#C8D6A0' },
  { id: 'cyber',    name: 'Кибер',    dark: '#0D2B1D', light: '#1A5C3A' },
  { id: 'slate',    name: 'Сланец',   dark: '#2D3A4A', light: '#7A8FA0' },
  { id: 'gold',     name: 'Золото',   dark: '#8B7355', light: '#F5DEB3' },
  { id: 'midnight', name: 'Ночь',     dark: '#1A1A2E', light: '#16213E' },
  { id: 'rose',     name: 'Роза',     dark: '#7A4066', light: '#D4A5BD' },
  { id: 'teal',     name: 'Бирюза',   dark: '#2A6B6B', light: '#A0CFCF' },
];

export const PIECE_STYLES: PieceStyle[] = [
  { id: 'default',    name: 'Стандарт',  baseUrl: null },
  { id: 'cburnett',   name: 'Cburnett',  baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett' },
  { id: 'merida',     name: 'Merida',    baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/merida' },
  { id: 'alpha',      name: 'Alpha',     baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/alpha' },
  { id: 'pirouetti',  name: 'Pirouetti', baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/pirouetti' },
  { id: 'chessnut',   name: 'Chessnut',  baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/chessnut' },
  { id: 'chess7',     name: 'Chess7',    baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/chess7' },
  { id: 'horsey',     name: 'Horsey',    baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/horsey' },
  { id: 'california', name: 'California',baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/california' },
  { id: 'anarcandy',  name: 'Anarcandy', baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/anarcandy' },
  { id: 'companion',  name: 'Companion', baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/companion' },
  { id: 'fresca',     name: 'Fresca',    baseUrl: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/fresca' },
];

export const PIECE_KEYS = ['wP','wN','wB','wR','wQ','wK','bP','bN','bB','bR','bQ','bK'] as const;
