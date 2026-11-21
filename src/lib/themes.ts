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
  // ── Themed boards matching fun themes ───────────────────────────────────────
  { id: 'th-halloween', name: 'Хэллоуин',  dark: '#4A2410', light: '#D48838' },
  { id: 'th-newyear',   name: 'Новый год', dark: '#3A5A78', light: '#D4E4F0' },
  { id: 'th-alien',     name: 'Alien',     dark: '#1A4020', light: '#80D080' },
  { id: 'th-cyber',     name: 'Cyberpunk', dark: '#4A2868', light: '#E89CD4' },
  { id: 'th-easter',    name: 'Пасха',     dark: '#E898BC', light: '#FFF0F8' },
  { id: 'th-robot',     name: 'Робот',     dark: '#40505E', light: '#90A4B8' },
  { id: 'th-valentine', name: 'Валентин',  dark: '#6A2A48', light: '#F0C0D4' },
  { id: 'th-pirate',    name: 'Пираты',    dark: '#1E324A', light: '#D4B068' },
  { id: 'th-xeno',      name: 'Ксеноморф', dark: '#203820', light: '#90C088' },
  { id: 'th-sakura',    name: 'Сакура',    dark: '#E890B8', light: '#FFEEF4' },
  { id: 'th-autumn',    name: 'Осень',     dark: '#6A3818', light: '#E89860' },
  { id: 'th-galaxy',    name: 'Галактика', dark: '#3A2868', light: '#A890D8' },
  { id: 'th-abyss',     name: 'Глубина',   dark: '#0E485C', light: '#70B4C8' },
  { id: 'th-dragon',    name: 'Дракон',    dark: '#5A1C14', light: '#E86A30' },
  { id: 'th-sakura-dark', name: 'Сакура ночь',    dark: '#3A1024', light: '#D86098' },
  { id: 'th-bloodmoon',   name: 'Кровавая луна',  dark: '#3A0808', light: '#D82820' },
  { id: 'th-icedragon',   name: 'Ледяной дракон', dark: '#12304A', light: '#A0D8F0' },
  { id: 'th-synthwave',   name: 'Синтвейв',       dark: '#2A1448', light: '#FF4FA3' },
];

/** Bundle preset — what board + pieces fit each fun theme. */
export const FUN_THEME_BUNDLES: Record<string, { boardThemeId: string; pieceStyleId: string }> = {
  halloween: { boardThemeId: 'th-halloween', pieceStyleId: 'cc_gothic'    },
  newyear:   { boardThemeId: 'th-newyear',   pieceStyleId: 'cc_icy_sea'   },
  alien:     { boardThemeId: 'th-alien',     pieceStyleId: 'cc_neon'      },
  cyber:     { boardThemeId: 'th-cyber',     pieceStyleId: 'cc_8bit'      },
  easter:    { boardThemeId: 'th-easter',    pieceStyleId: 'cc_bubblegum' },
  robot:     { boardThemeId: 'th-robot',     pieceStyleId: 'cc_metal'     },
  valentine: { boardThemeId: 'th-valentine', pieceStyleId: 'cc_bubblegum' },
  pirate:    { boardThemeId: 'th-pirate',    pieceStyleId: 'cc_vintage'   },
  xeno:      { boardThemeId: 'th-xeno',      pieceStyleId: 'cc_neon'      },
  sakura:    { boardThemeId: 'th-sakura',    pieceStyleId: 'cc_bubblegum' },
  autumn:    { boardThemeId: 'th-autumn',    pieceStyleId: 'cc_wood'      },
  galaxy:    { boardThemeId: 'th-galaxy',    pieceStyleId: 'cc_space'     },
  abyss:     { boardThemeId: 'th-abyss',     pieceStyleId: 'cc_icy_sea'   },
  dragon:    { boardThemeId: 'th-dragon',    pieceStyleId: 'cc_gothic'    },
  'sakura-dark': { boardThemeId: 'th-sakura-dark', pieceStyleId: 'cc_bubblegum' },
  bloodmoon:     { boardThemeId: 'th-bloodmoon',   pieceStyleId: 'cc_gothic'    },
  icedragon:     { boardThemeId: 'th-icedragon',   pieceStyleId: 'cc_icy_sea'   },
  synthwave:     { boardThemeId: 'th-synthwave',   pieceStyleId: 'cc_neon'      },
};

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

export type SiteThemeFamily = 'executive' | 'newspaper' | 'soft' | 'cream' | 'nord' | 'sunset' | 'mono' | 'fun';

export function getSiteThemeFamily(id: string): SiteThemeFamily {
  if (id === 'executive' || id === 'executive-light') return 'executive';
  if (id.startsWith('soft'))   return 'soft';
  if (id.startsWith('cream'))  return 'cream';
  if (id.startsWith('nord'))   return 'nord';
  if (id.startsWith('sunset')) return 'sunset';
  if (id.startsWith('mono'))   return 'mono';
  if (FUN_THEME_IDS.has(id))   return 'fun';
  return 'newspaper';
}

export const FUN_THEME_IDS = new Set([
  'halloween',
  'newyear',
  'alien',
  'cyber',
  'easter',
  'robot',
  'valentine',
  'pirate',
  'xeno',
  'sakura',
  'autumn',
  'galaxy',
  'abyss',
  'dragon',
  'sakura-dark',
  'bloodmoon',
  'icedragon',
  'synthwave',
]);

export type FunThemeConfig = {
  /** Emoji shown in the top-bar logo slot. */
  logo: string;
  /** Decorations floating in the shell background. */
  decor: 'pumpkins' | 'snow' | 'ufo' | 'glitch' | 'easter' | 'robot' | 'hearts' | 'pirate' | 'xeno'
       | 'sakura' | 'leaves' | 'stars' | 'bubbles' | 'fire';
  /** Human-readable Russian label. */
  label: string;
  /** One-line description. */
  desc: string;
};

export const FUN_THEMES: Record<string, FunThemeConfig> = {
  halloween: { logo: '🎃', decor: 'pumpkins', label: 'Хэллоуин',  desc: 'Тыквы и кислотный оранж' },
  newyear:   { logo: '⛄', decor: 'snow',     label: 'Новый год',  desc: 'Снег и ёлка'             },
  alien:     { logo: '👽', decor: 'ufo',      label: 'Alien',     desc: 'Ядовитый неон'           },
  cyber:     { logo: '⚡', decor: 'glitch',   label: 'Cyberpunk',  desc: 'Розовый и голубой неон'  },
  easter:    { logo: '🐣', decor: 'easter',   label: 'Пасха',     desc: 'Пастель, яйца и зайцы'   },
  robot:     { logo: '🤖', decor: 'robot',    label: 'Робот',     desc: 'Хром и шестерни'         },
  valentine: { logo: '💗', decor: 'hearts',   label: 'Валентин',  desc: 'Сердца и розы'           },
  pirate:    { logo: '☠',  decor: 'pirate',   label: 'Пираты',    desc: 'Череп и золото'          },
  xeno:      { logo: '👁', decor: 'xeno',     label: 'Ксеноморф', desc: 'Биомех и кислотная слизь'},
  sakura:    { logo: '🌸', decor: 'sakura',   label: 'Сакура',    desc: 'Падающие лепестки'       },
  autumn:    { logo: '🍁', decor: 'leaves',   label: 'Осень',     desc: 'Янтарь и листопад'       },
  galaxy:    { logo: '🌌', decor: 'stars',    label: 'Галактика', desc: 'Звёздная туманность'     },
  abyss:     { logo: '🫧', decor: 'bubbles',  label: 'Глубина',   desc: 'Пузыри из бездны'        },
  dragon:    { logo: '🐉', decor: 'fire',     label: 'Дракон',    desc: 'Пламя и угли'            },
  'sakura-dark': { logo: '🌸', decor: 'sakura',   label: 'Сакура ночь',    desc: 'Тёмная вишня'            },
  bloodmoon:     { logo: '🩸', decor: 'pumpkins', label: 'Кровавая луна',  desc: 'Красный туман'           },
  icedragon:     { logo: '❄',  decor: 'snow',     label: 'Ледяной дракон', desc: 'Снег и голубое пламя'    },
  synthwave:     { logo: '◢',  decor: 'glitch',   label: 'Синтвейв',       desc: '80-е: розовый и cyan'    },
};

export const SITE_THEMES: SiteTheme[] = [
  // ── Executive (графит + золото, флагман) ───────────────────────────────────
  { id: 'executive',       name: 'Executive',        bg: '#0F0F11', card: '#17171A' },
  { id: 'executive-light', name: 'Executive Light',  bg: '#F4EFE6', card: '#FFFAF1' },
  // ── Мягкий (chess.com style) ───────────────────────────────────────────────
  { id: 'soft-dark',  name: 'Мягкий тёмный',  bg: '#302E2B', card: '#262522' },
  { id: 'soft-light', name: 'Мягкий светлый',  bg: '#F3F3F1', card: '#FFFFFF' },
  // ── Крем (тёплый светлый, сепия) ───────────────────────────────────────────
  { id: 'cream',      name: 'Крем',           bg: '#F5EFE0', card: '#FFFAEE' },
  { id: 'cream-dark', name: 'Сепия',          bg: '#1E1A14', card: '#2A2520' },
  // ── Nord (холодный сине-серый) ─────────────────────────────────────────────
  { id: 'nord',       name: 'Nord',           bg: '#2E3440', card: '#3B4252' },
  { id: 'nord-light', name: 'Nord Light',     bg: '#ECEFF4', card: '#FFFFFF' },
  // ── Закат (тёплые градиенты) ──────────────────────────────────────────────
  { id: 'sunset',     name: 'Закат',          bg: '#1A0F1A', card: '#2A1820' },
  { id: 'sunset-warm',name: 'Персик',         bg: '#FDF2E9', card: '#FFFFFF' },
  // ── Моно (чисто-серый минимализм) ──────────────────────────────────────────
  { id: 'mono-dark',  name: 'Моно тёмный',    bg: '#1A1A1A', card: '#242424' },
  { id: 'mono-light', name: 'Моно светлый',   bg: '#EEEEEE', card: '#F8F8F8' },
  // ── Пасхалки ───────────────────────────────────────────────────────────────
  { id: 'halloween',  name: 'Хэллоуин',       bg: '#120806', card: '#1C0D08' },
  { id: 'newyear',    name: 'Новый год',      bg: '#040F17', card: '#0A1A26' },
  { id: 'alien',      name: 'Alien',          bg: '#050A05', card: '#0A160A' },
  { id: 'cyber',      name: 'Cyberpunk',      bg: '#08051A', card: '#120828' },
  { id: 'easter',     name: 'Пасха',          bg: '#FFF7EC', card: '#FFFFFF' },
  { id: 'robot',      name: 'Робот',          bg: '#0E1217', card: '#181E25' },
  { id: 'valentine',  name: 'Валентин',       bg: '#140608', card: '#230A10' },
  { id: 'pirate',     name: 'Пираты',         bg: '#060A14', card: '#0E1626' },
  { id: 'xeno',       name: 'Ксеноморф',      bg: '#060805', card: '#0D1008' },
  { id: 'sakura',     name: 'Сакура',         bg: '#FFF4F3', card: '#FFFFFF' },
  { id: 'autumn',     name: 'Осень',          bg: '#180C04', card: '#241406' },
  { id: 'galaxy',     name: 'Галактика',      bg: '#0A0520', card: '#140A2E' },
  { id: 'abyss',      name: 'Глубина',        bg: '#04141A', card: '#0A2530' },
  { id: 'dragon',     name: 'Дракон',         bg: '#180608', card: '#260A0C' },
  { id: 'sakura-dark',name: 'Сакура ночь',    bg: '#0A0608', card: '#180A12' },
  { id: 'bloodmoon',  name: 'Кровавая луна',  bg: '#0A0202', card: '#1A0404' },
  { id: 'icedragon',  name: 'Ледяной дракон', bg: '#020A12', card: '#061828' },
  { id: 'synthwave',  name: 'Синтвейв',       bg: '#0A0426', card: '#140636' },
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
  { id: 'carbon',  name: 'Карбон',     bg: '#08090A', card: '#111315' },
  { id: 'emerald', name: 'Изумруд',    bg: '#021008', card: '#061A10' },
  { id: 'cobalt',  name: 'Кобальт',    bg: '#02060F', card: '#061024' },
  { id: 'violet',  name: 'Фиалка',     bg: '#08030F', card: '#120620' },
  { id: 'rust',    name: 'Ржавчина',   bg: '#0A0603', card: '#180D06' },
  { id: 'dracula', name: 'Dracula',    bg: '#0B0812', card: '#140A1E' },
  { id: 'tokyo',   name: 'Tokyo',      bg: '#07081A', card: '#0E1030' },
  { id: 'monokai', name: 'Monokai',    bg: '#0F0C08', card: '#1A1510' },
  { id: 'matrix',  name: 'Matrix',     bg: '#020604', card: '#06110A' },
  { id: 'mint',    name: 'Мята',       bg: '#050C0A', card: '#0C1A16' },
  { id: 'peach',   name: 'Персик',     bg: '#0E0604', card: '#1A0C08' },
  { id: 'mocha',   name: 'Мокко',      bg: '#0A0603', card: '#140B06' },
  { id: 'arctic2', name: 'Айсберг',    bg: '#02090C', card: '#061620' },
  { id: 'plum',    name: 'Слива',      bg: '#09040C', card: '#130818' },
  { id: 'steel',   name: 'Сталь',      bg: '#0A0C0F', card: '#141820' },
  { id: 'light',   name: 'Светлый',    bg: '#F8F8F8', card: '#FFFFFF' },
];
