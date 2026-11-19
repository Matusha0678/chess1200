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
  ext?: '.svg' | '.png';
  lowercase?: boolean;
};

export type SiteTheme = {
  id: string;
  name: string;
  bg: string;
  card: string;
};

export const BOARD_THEMES: BoardTheme[] = [
  // Soft-first presets (chess.com palette)
  { id: 'chess-green', name: 'Зелёная',    dark: '#769656', light: '#EEEED2' },
  { id: 'chess-brown', name: 'Коричневая', dark: '#B58863', light: '#F0D9B5' },
  { id: 'chess-grey',  name: 'Серо-синяя', dark: '#8CA2AD', light: '#DEE3E6' },
  // Legacy / advanced
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
  // ── chess.com ──────────────────────────────────────────────────────────────
  { id: 'cc_3d_chesskid',  name: '3D ChessKid',  baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/3d_chesskid',  ext: '.png', lowercase: true },
  { id: 'cc_3d_plastic',   name: '3D Plastic',   baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/3d_plastic',   ext: '.png', lowercase: true },
  { id: 'cc_3d_staunton',  name: '3D Staunton',  baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/3d_staunton',  ext: '.png', lowercase: true },
  { id: 'cc_3d_wood',      name: '3D Wood',      baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/3d_wood',      ext: '.png', lowercase: true },
  { id: 'cc_8bit',         name: '8-Bit',        baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/8_bit',        ext: '.png', lowercase: true },
  { id: 'cc_alpha',        name: 'Alpha (CC)',   baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/alpha',        ext: '.png', lowercase: true },
  { id: 'cc_bases',        name: 'Bases',        baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/bases',        ext: '.png', lowercase: true },
  { id: 'cc_book',         name: 'Book',         baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/book',         ext: '.png', lowercase: true },
  { id: 'cc_bubblegum',    name: 'Bubblegum',    baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/bubblegum',    ext: '.png', lowercase: true },
  { id: 'cc_cases',        name: 'Cases',        baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/cases',        ext: '.png', lowercase: true },
  { id: 'cc_classic',      name: 'Classic (CC)', baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/classic',      ext: '.png', lowercase: true },
  { id: 'cc_club',         name: 'Club',         baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/club',         ext: '.png', lowercase: true },
  { id: 'cc_condal',       name: 'Condal',       baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/condal',       ext: '.png', lowercase: true },
  { id: 'cc_dash',         name: 'Dash',         baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/dash',         ext: '.png', lowercase: true },
  { id: 'cc_game_room',    name: 'Game Room',    baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/game_room',    ext: '.png', lowercase: true },
  { id: 'cc_glass',        name: 'Glass',        baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/glass',        ext: '.png', lowercase: true },
  { id: 'cc_gothic',       name: 'Gothic',       baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/gothic',       ext: '.png', lowercase: true },
  { id: 'cc_graffiti',     name: 'Graffiti',     baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/graffiti',     ext: '.png', lowercase: true },
  { id: 'cc_icy_sea',      name: 'Icy Sea',      baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/icy_sea',      ext: '.png', lowercase: true },
  { id: 'cc_light',        name: 'Light (CC)',   baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/light',        ext: '.png', lowercase: true },
  { id: 'cc_lolz',         name: 'Lolz',         baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/lolz',         ext: '.png', lowercase: true },
  { id: 'cc_luca',         name: 'Luca',         baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/luca',         ext: '.png', lowercase: true },
  { id: 'cc_marble',       name: 'Marble',       baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/marble',       ext: '.png', lowercase: true },
  { id: 'cc_maya',         name: 'Maya',         baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/maya',         ext: '.png', lowercase: true },
  { id: 'cc_metal',        name: 'Metal',        baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/metal',        ext: '.png', lowercase: true },
  { id: 'cc_modern',       name: 'Modern',       baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/modern',       ext: '.png', lowercase: true },
  { id: 'cc_nature',       name: 'Nature',       baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/nature',       ext: '.png', lowercase: true },
  { id: 'cc_neo_wood',     name: 'Neo Wood',     baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/neo_wood',     ext: '.png', lowercase: true },
  { id: 'cc_neon',         name: 'Neon',         baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/neon',         ext: '.png', lowercase: true },
  { id: 'cc_newspaper',    name: 'Newspaper (CC)',baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/newspaper',    ext: '.png', lowercase: true },
  { id: 'cc_ocean',        name: 'Ocean (CC)',   baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/ocean',        ext: '.png', lowercase: true },
  { id: 'cc_sky',          name: 'Sky',          baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/sky',          ext: '.png', lowercase: true },
  { id: 'cc_space',        name: 'Space',        baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/space',        ext: '.png', lowercase: true },
  { id: 'cc_tigers',       name: 'Tigers',       baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/tigers',       ext: '.png', lowercase: true },
  { id: 'cc_tournament',   name: 'Tournament',   baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/tournament',   ext: '.png', lowercase: true },
  { id: 'cc_vintage',      name: 'Vintage',      baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/vintage',      ext: '.png', lowercase: true },
  { id: 'cc_wood',         name: 'Wood (CC)',    baseUrl: 'https://cdn.jsdelivr.net/gh/GiorgioMegrelli/chess.com-boards-and-pieces/pieces/wood',         ext: '.png', lowercase: true },
];

export const PIECE_KEYS = ['wP','wN','wB','wR','wQ','wK','bP','bN','bB','bR','bQ','bK'] as const;

export type SiteThemeFamily = 'newspaper' | 'soft';

export function getSiteThemeFamily(id: string): SiteThemeFamily {
  return id.startsWith('soft') ? 'soft' : 'newspaper';
}

export const SITE_THEMES: SiteTheme[] = [
  // ── Мягкий ──────────────────────────────────────────────────────────────────
  { id: 'soft-dark',  name: 'Мягкий тёмный',  bg: '#302E2B', card: '#262522' },
  { id: 'soft-light', name: 'Мягкий светлый',  bg: '#F3F3F1', card: '#FFFFFF' },
  // ── Газетный (цветовые варианты) ─────────────────────────────────────────────
  { id: 'dark',     name: 'Уголь',      bg: '#050505', card: '#0D0D0D' },
  { id: 'midnight', name: 'Полночь',    bg: '#05070F', card: '#0C0E1A' },
  { id: 'indigo',   name: 'Индиго',     bg: '#030306', card: '#090A11' },
  { id: 'forest',   name: 'Лесной',     bg: '#050A06', card: '#0C1409' },
  { id: 'ocean',    name: 'Морской',    bg: '#030A0B', card: '#071618' },
  { id: 'amethyst', name: 'Аметист',    bg: '#070509', card: '#0F0C15' },
  { id: 'rose',     name: 'Розовый',    bg: '#09040A', card: '#130A14' },
  { id: 'crimson',  name: 'Малиновый',  bg: '#0A0304', card: '#150708' },
  { id: 'amber',    name: 'Янтарь',     bg: '#0A0804', card: '#15110A' },
  { id: 'copper',   name: 'Медь',       bg: '#090601', card: '#130E04' },
  { id: 'slate',    name: 'Сланец',     bg: '#06080C', card: '#0D1018' },
  { id: 'teal',    name: 'Бирюза',     bg: '#020B0C', card: '#061517' },
  { id: 'wine',    name: 'Вино',       bg: '#09020A', card: '#120413' },
  { id: 'jade',    name: 'Нефрит',     bg: '#030809', card: '#071314' },
  { id: 'light',   name: 'Светлый',    bg: '#F8F8F8', card: '#FFFFFF' },
];
