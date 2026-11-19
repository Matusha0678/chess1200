/**
 * Авторские гамбиты: 5 дебютов по 60+ линий с характеристиками и эмодзи.
 *
 * Запуск:
 *   npx tsx scripts/seed-author-gambits.ts             # залить в БД
 *   npx tsx scripts/seed-author-gambits.ts --dry-run   # только проверить SAN
 *
 * Нужны переменные окружения (берутся из .env.local автоматически):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Идемпотентность: если дебют с таким же именем уже есть — пропускаем.
 */

import { Chess } from 'chess.js';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ── Загрузка .env.local ──────────────────────────────────────────────────────
(() => {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
})();

// ── Типы ─────────────────────────────────────────────────────────────────────
type LineClass = 'common' | 'sharp' | 'rare';
type ColorChoice = 'white' | 'black' | 'both';

interface ChessMove {
  san: string;
  from: string;
  to: string;
  fen: string;
  color: 'w' | 'b';
}

interface SeedLine { sans: string; class: LineClass; badge: string; }

interface SeedOpening {
  name: string;
  color: ColorChoice;
  eco: string;
  description: string;
  lines: SeedLine[];
}

// ── Хелпер: prefix + каждый tail = отдельная линия ───────────────────────────
type Tail = [sans: string, cls: LineClass, badge: string];
const exp = (prefix: string, tails: Tail[]): SeedLine[] =>
  tails.map(([t, c, b]) => ({ sans: `${prefix} ${t}`.replace(/\s+/g, ' ').trim(), class: c, badge: b }));

// ── Общая характеристика эмодзи ──────────────────────────────────────────────
// 🔥 — острое пожертвование / тактический бой
// ⚡ — быстрая атака с жертвой
// ⚔️ — ожесточённая рубка
// 📖 — главная теоретическая линия
// 🎯 — ловушка / тактический трюк
// 🛡️ — защитный вариант за соперника
// 🎲 — редкий / экзотический план
// 💥 — королевская охота / мат-ранний
// 🧠 — позиционное выжидание
// ✨ — красивая идея

// =============================================================================
//  1. КОРОЛЕВСКИЙ ГАМБИТ  (1.e4 e5 2.f4)
// =============================================================================
const kingsLines: SeedLine[] = [
  // ── Принятый, 3.Nf3 g5 (классическая защита пешки) ─────────────────────────
  ...exp('e4 e5 f4 exf4 Nf3 g5', [
    ['h4 g4 Ne5 Nf6 Bc4 d5 exd5 Bd6',           'sharp',  '🔥'],
    ['h4 g4 Ne5 Nf6 d4 d6 Nxg4 Nxe4',           'sharp',  '⚡'],
    ['h4 g4 Ng5 h6 Nxf7 Kxf7 d4 d5',            'sharp',  '💥'],
    ['h4 g4 Ng5 d5 d4 h6 Nxf7 Kxf7',            'sharp',  '💥'],
    ['Bc4 Bg7 d4 d6 c3 Nc6 O-O h6',             'common', '📖'],
    ['Bc4 d6 d4 g4 Nfd2 Qh4+ Kf1 f3',           'rare',   '🎲'],
    ['Nc3 Bg7 d4 d6 h4 h6 hxg5 hxg5',           'common', '⚔️'],
    ['d4 g4 Ne5 Qh4+ g3 fxg3 Qxg4 Qxg4',        'sharp',  '✨'],
  ]),

  // ── Принятый, 3.Nf3 d5 (современная защита) ────────────────────────────────
  ...exp('e4 e5 f4 exf4 Nf3 d5', [
    ['exd5 Nf6 Bc4 Nxd5 O-O Be7 d4 O-O',        'common', '📖'],
    ['exd5 Nf6 Bb5+ c6 dxc6 Nxc6 d4 Bd6',       'sharp',  '🎯'],
    ['exd5 Qxd5 Nc3 Qe6+ Be2 c6 O-O Nd7',       'common', '🧠'],
    ['exd5 Nf6 c4 c6 d4 cxd5 Bxf4 Bb4+',        'sharp',  '⚔️'],
  ]),

  // ── Принятый, 3.Nf3 Nf6 (защита Шаллоппа) ──────────────────────────────────
  ...exp('e4 e5 f4 exf4 Nf3 Nf6', [
    ['e5 Nh5 Qe2 Be7 Nc3 d6 d4 dxe5',           'common', '📖'],
    ['e5 Nd5 Nc3 Nxc3 bxc3 c6 d4 d6',           'common', '🧠'],
    ['Nc3 d5 e5 Ne4 Qe2 Bf5 Nxe4 Bxe4',         'rare',   '🎲'],
  ]),

  // ── Принятый, 3.Nf3 Be7 (защита Каннингема) ────────────────────────────────
  ...exp('e4 e5 f4 exf4 Nf3 Be7', [
    ['Bc4 Bh4+ Kf1 d6 d4 Nf6 Nc3 c6',           'sharp',  '⚔️'],
    ['Bc4 Nf6 Nc3 d6 d4 O-O O-O Nc6',           'sharp',  '✨'],
    ['d4 Nf6 Bd3 d6 O-O Nc6 c3 O-O',            'sharp',  '🔥'],
  ]),

  // ── Принятый, 3.Nf3 d6 (защита Фишера) ─────────────────────────────────────
  ...exp('e4 e5 f4 exf4 Nf3 d6', [
    ['d4 g5 h4 g4 Ng5 h6 Nxf7 Kxf7',            'sharp',  '💥'],
    ['Bc4 h6 d4 g5 Nc3 Bg7 O-O Nc6',            'common', '📖'],
    ['Nc3 Nf6 d4 g5 h4 Rg8 Nxg5 h6',            'sharp',  '🔥'],
  ]),

  // ── Принятый, 3.Nf3 Nc6 (защита Розенретера) ───────────────────────────────
  ...exp('e4 e5 f4 exf4 Nf3 Nc6', [
    ['d4 g5 h4 g4 Ng5 h6 Nxf7 Kxf7',            'sharp',  '💥'],
    ['Bc4 Bc5 d4 Bb6 c3 d6 Qb3 Qd7',            'common', '📖'],
  ]),

  // ── Принятый, 3.Bc4 (Бишопс гамбит) ────────────────────────────────────────
  ...exp('e4 e5 f4 exf4 Bc4', [
    ['Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d4',         'sharp',  '🎯'],
    ['d5 Bxd5 Nf6 Nc3 Bb4 Nf3 O-O O-O',         'common', '⚔️'],
    ['Nf6 Nc3 Bb4 Nf3 d6 d4 O-O O-O',           'common', '📖'],
    ['Nc6 Nf3 g5 d4 g4 O-O gxf3 Qxf3',          'sharp',  '✨'],
    ['Be7 Nc3 Bh4+ Kf1 Nf6 Nf3 Bf2 d4',         'rare',   '🎲'],
  ]),

  // ── Принятый, 3.Nc3 (гамбит Мэзона) ────────────────────────────────────────
  ...exp('e4 e5 f4 exf4 Nc3', [
    ['Qh4+ Ke2 d6 Nf3 Bg4 Qe1 Bxf3+ gxf3',      'rare',   '🎲'],
    ['Nf6 e5 Ng4 d4 d6 h3 Nh6 Bxf4',            'sharp',  '🔥'],
    ['Bb4 Nf3 d5 exd5 Qxd5 Qe2+ Qe4 Qxe4+',     'rare',   '🎲'],
  ]),

  // ── Отказанный, 2...d5 (контргамбит Фалькбеера) ────────────────────────────
  ...exp('e4 e5 f4 d5', [
    ['exd5 e4 d3 Nf6 dxe4 Nxe4 Nf3 Bc5',        'common', '📖'],
    ['exd5 e4 Nc3 Nf6 Qe2 Bf5 Nxe4 Nxe4',       'sharp',  '⚔️'],
    ['exd5 exf4 Nf3 Nf6 Bc4 Nxd5 O-O Be7',      'common', '📖'],
    ['exd5 c6 dxc6 Nxc6 Nc3 Nf6 d3 Bc5',        'rare',   '🎲'],
    ['Nf3 dxe4 Nxe5 Nf6 Bc4 Bd6 d4 O-O',        'common', '🧠'],
  ]),

  // ── Отказанный, 2...Bc5 (классический отказ) ───────────────────────────────
  ...exp('e4 e5 f4 Bc5', [
    ['Nf3 d6 Nc3 Nf6 Bc4 Nc6 d3 Bg4',           'common', '📖'],
    ['Nf3 d6 c3 Nf6 fxe5 dxe5 Nxe5 Qd4',        'sharp',  '🎯'],
    ['fxe5 d6 exd6 Bxd6 Nf3 Nc6 Nc3 Nf6',       'common', '⚔️'],
    ['Nc3 d6 Na4 Bb6 Nxb6 axb6 Nf3 Nf6',        'rare',   '🧠'],
    ['Nf3 Nc6 Bc4 Nf6 Nc3 d6 d3 Bg4',           'common', '📖'],
  ]),

  // ── Отказанный, 2...d6 (пассивно) ──────────────────────────────────────────
  ...exp('e4 e5 f4 d6', [
    ['Nf3 Nc6 Bb5 Bd7 d4 exd4 Nxd4 Nf6',        'common', '🧠'],
    ['fxe5 dxe5 Qh5 Qf6 Nf3 Nc6 Bc4 Bc5',       'sharp',  '🔥'],
  ]),

  // ── Отказанный, 2...Nf6 ────────────────────────────────────────────────────
  ...exp('e4 e5 f4 Nf6', [
    ['fxe5 Nxe4 Nf3 Nc6 d4 d6 Bc4 Be7',         'common', '📖'],
    ['fxe5 Nxe4 d3 Nc5 d4 Ne6 Nf3 d6',          'rare',   '🎲'],
  ]),

  // ── Отказанный, 2...Nc6 ────────────────────────────────────────────────────
  ...exp('e4 e5 f4 Nc6', [
    ['Nf3 f5 exf5 e4 Nd4 Nf6 Ne6 Qe7',          'rare',   '🎲'],
    ['fxe5 Nxe5 d4 Nc6 e5 Qh4+ g3 Qe7',         'sharp',  '⚔️'],
  ]),

  // ── Принятый, 3.Nf3 h6 (защита Бекера) ─────────────────────────────────────
  ...exp('e4 e5 f4 exf4 Nf3 h6', [
    ['d4 g5 Nc3 Bg7 h4 g4 Nh2 f3',              'sharp',  '🔥'],
    ['Bc4 d6 d4 g5 Nc3 Bg7 Qd2 Nc6',            'sharp',  '⚔️'],
    ['Nc3 d6 d4 g5 Bc4 Bg7 h3 Nc6',             'common', '📖'],
  ]),

  // ── Принятый, 3.Nf3 Qf6 (защита Карераса) ──────────────────────────────────
  ...exp('e4 e5 f4 exf4 Nf3 Qf6', [
    ['Nc3 Qxc3 dxc3 Bc5 Bxf4 d6 Bd3 Nc6',       'sharp',  '🎯'],
    ['Bc4 Qxb2 Bxb2 Bc5 Nc3 Nc6 d4 d6',         'sharp',  '💥'],
  ]),

  // ── Принятый, 3.Nf3 g5 — атаки h4 (расширение) ─────────────────────────────
  ...exp('e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5', [
    ['Nf6 Bc4 d5 exd5 Bd6 d4 Nh5 O-O',          'sharp',  '⚡'],
    ['Qe7 d4 d6 Nxg4 h5 Nf2 Bg7 Bc4',           'sharp',  '✨'],
    ['h5 Bc4 Nh6 d4 d6 Nd3 f3 gxf3',            'common', '⚔️'],
    ['Qf6 Nc3 Bg7 d4 Nc6 Nxg4 Qg6 Bxf4 d6',     'rare',   '🎲'],
  ]),

  // ── Отказанный, 2...Qf6 (Nordwalde) ────────────────────────────────────────
  ...exp('e4 e5 f4 Qf6', [
    ['fxe5 Qxe5 Nf3 Qe7 Bc4 Nc6 Nc3 d6',        'rare',   '🎲'],
    ['Nc3 Bb4 Nd5 Qd6 Nxb4 Qxb4 c3 Qc5 d4 Nf6', 'rare',   '🧠'],
  ]),

  // ── Отказанный, 2...Qh4+ (пробная защита) ──────────────────────────────────
  ...exp('e4 e5 f4 Qh4+', [
    ['g3 Qe7 fxe5 Qxe5 Nf3 Qe7 Nc3 Nc6',        'rare',   '🎲'],
  ]),

  // ── Чигоринский вариант: 3.Nc3 (альтернатива) с Nf6 ─────────────────────────
  ...exp('e4 e5 f4 exf4 Nc3 Nf6', [
    ['Nf3 Bb4 Bc4 d6 d3 O-O O-O c6',            'common', '🧠'],
    ['e5 Ng4 Nf3 d6 d4 dxe5 Bxf4 Nc6',          'sharp',  '🔥'],
  ]),
];

// =============================================================================
//  2. ГАМБИТ ЭВАНСА  (1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4)
// =============================================================================
const evansLines: SeedLine[] = [
  // ── Принятый 4...Bxb4 5.c3 Ba5 (основной отступ) ───────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5', [
    ['d4 exd4 O-O d6 cxd4 Bb6 Nc3 Na5',         'common', '📖'],
    ['d4 exd4 O-O Nge7 cxd4 d5 exd5 Nxd5',      'common', '📖'],
    ['d4 exd4 O-O Nf6 e5 d5 exf6 dxc4',         'sharp',  '🔥'],
    ['d4 exd4 Qb3 Qf6 e5 Qg6 O-O Nge7',         'sharp',  '⚡'],
    ['d4 exd4 Qb3 Qe7 O-O Bb6 cxd4 d6',         'common', '⚔️'],
    ['d4 d6 Qb3 Qd7 dxe5 Bb6 O-O Na5',          'rare',   '🎲'],
    ['O-O Nf6 d4 exd4 e5 d5 exf6 dxc4',         'sharp',  '✨'],
    ['O-O d6 d4 Bg4 Qb3 Bxf3 Bxf7+ Kf8',        'sharp',  '🎯'],
    ['d4 exd4 Qb3 Qf6 e5 Qg6 Nxd4 Nxd4',        'sharp',  '💥'],
    ['Qa4 Nf6 Nxe5 O-O Nxc6 dxc6 Qxa5 Nxe4',    'rare',   '🧠'],
  ]),

  // ── 5...Be7 (отступ назад) ────────────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Be7', [
    ['d4 Na5 Bxf7+ Kxf7 Nxe5+ Ke8 Qh5+ Kf8',    'sharp',  '🎯'],
    ['d4 Nf6 dxe5 Nxe4 Qd5 Nc5 Bg5 Bxg5',       'sharp',  '⚔️'],
    ['d4 d6 dxe5 Nxe5 Nxe5 dxe5 Qxd8+ Bxd8',    'common', '🧠'],
    ['Qb3 d6 d4 Nf6 dxe5 Nxe4 O-O Na5',         'rare',   '🎲'],
  ]),

  // ── 5...Bc5 (классическое) ────────────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Bc5', [
    ['d4 exd4 e5 d5 Bb5 Ne7 cxd4 Bb6',          'sharp',  '🔥'],
    ['d4 exd4 e5 Nge7 cxd4 Bb6 O-O O-O',        'common', '📖'],
    ['d4 exd4 O-O d6 cxd4 Bb6 Nc3 Nf6',         'common', '📖'],
    ['O-O Nf6 d4 exd4 e5 Ng4 cxd4 Bb6',         'sharp',  '⚡'],
  ]),

  // ── 5...Bf8 (возврат на базу) ─────────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Bf8', [
    ['d4 exd4 cxd4 d6 Nc3 Nf6 O-O Be7',         'rare',   '🧠'],
    ['d4 exd4 Qb3 Qf6 e5 Qg6 cxd4 Nge7',        'rare',   '🎲'],
  ]),

  // ── 5...Bd6 (редкий) ──────────────────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Bd6', [
    ['d4 Qe7 O-O Nf6 Re1 O-O Bg5 h6',           'rare',   '🎲'],
    ['a4 a6 O-O Nf6 d4 exd4 cxd4 O-O',          'rare',   '🧠'],
  ]),

  // ── 5...Ba5 6.d4 exd4 7.O-O (главная табия) ───────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O', [
    ['Nge7 cxd4 d5 exd5 Nxd5 Nc3 Nf6 Ba3',      'common', '📖'],
    ['dxc3 Qb3 Qf6 e5 Qg6 Nxc3 Nge7 Nd5',       'sharp',  '🔥'],
    ['Nf6 e5 d5 exf6 dxc4 Re1+ Be6 fxg7 Rg8',   'sharp',  '💥'],
    ['Bb6 cxd4 Na5 Bb5 Nf6 Bg5 h6 Bh4',         'common', '⚔️'],
    ['d6 Qb3 Qd7 cxd4 Nf6 Ba3 O-O Nc3',         'sharp',  '🎯'],
    ['d6 cxd4 Bb6 Nc3 Nf6 Nd5 Nxd5 exd5',       'common', '📖'],
    ['Nge7 cxd4 d5 exd5 Nxd5 Ba3 Be6 Qb3',      'rare',   '🎲'],
  ]),

  // ── Отказанный 4...Bb6 (Эванс отказанный) ─────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bb6', [
    ['a4 a6 c3 Nf6 d3 d6 O-O O-O',              'common', '🧠'],
    ['a4 a6 Bb2 d6 b5 axb5 axb5 Rxa1',          'rare',   '🎲'],
    ['b5 Na5 Nxe5 Nh6 d4 d6 Bxh6 gxh6',         'sharp',  '⚔️'],
    ['a4 Nf6 a5 Nxa5 Nxe5 Nxc4 Nxc4 O-O',       'sharp',  '✨'],
    ['a4 a6 Nc3 Nf6 Nd5 Nxd5 exd5 Nd4',         'rare',   '🧠'],
    ['Qe2 d6 a4 a6 Nc3 Nf6 O-O O-O',            'common', '📖'],
  ]),

  // ── Отказанный 4...Bd6 ───────────────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bd6', [
    ['a4 a6 Nc3 Nf6 d3 O-O O-O h6',             'rare',   '🧠'],
    ['O-O Nf6 d3 h6 a4 a6 c3 O-O',              'rare',   '🎲'],
    ['b5 Na5 Nxe5 Qg5 d4 Qxg2 Rf1 Nxc4',        'sharp',  '🎯'],
  ]),

  // ── Отказанный 4...Nxb4 (контргамбит) ────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Nxb4', [
    ['c3 Nc6 d4 exd4 cxd4 Bb6 Nc3 Nf6',         'rare',   '🎲'],
    ['c3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6',       'sharp',  '✨'],
  ]),

  // ── Отказанный 4...Bxb4 — быстрое c3+Qb3 ──────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Bc5', [
    ['Qb3 Qf6 d4 exd4 e5 Qg6 cxd4 Bb6',         'sharp',  '🔥'],
    ['d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d6',    'rare',   '🎲'],
  ]),

  // ── Защита Ласкера: 5...Ba5 6.d4 d6 ───────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 d6', [
    ['Qb3 Qd7 dxe5 Bb6 O-O Na5 Qa4 Qxa4',       'common', '📖'],
    ['dxe5 dxe5 Qxd8+ Nxd8 Nxe5 Bb6 Bd5 Nf6',   'sharp',  '⚔️'],
    ['O-O Nf6 Ba3 O-O Qb3 Qd7 Nbd2 Bb6',        'common', '🧠'],
    ['O-O Bb6 a4 a6 a5 Ba7 Nbd2 Nf6 Re1 O-O',   'rare',   '🎲'],
  ]),

  // ── Компрометированная защита (Ba5 → d4 → exd4 → Nxd4 → Bb6 с линиями) ────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 Nxd4 Bb6', [
    ['Nxc6 bxc6 Nd2 Nf6 Nf3 O-O O-O d6',        'common', '📖'],
    ['Nxc6 bxc6 Nd2 d6 Nf3 Nf6 O-O O-O',        'common', '🧠'],
    ['O-O Nf6 Nf5 O-O Bg5 d6 Nd2 Ne5',          'sharp',  '✨'],
    ['Bb2 Nf6 Nxc6 bxc6 Nd2 O-O O-O d6',        'rare',   '🎲'],
  ]),

  // ── Отказанный с Nxe4 (гипергамбит) ──────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bb6 a4 a6 c3', [
    ['d6 d3 Nf6 O-O O-O Nbd2 Be6 Bxe6',         'common', '🧠'],
    ['Nf6 d3 d6 O-O O-O Nbd2 Be6 Bxe6',         'common', '📖'],
  ]),

  // ── Гамбит Моллера: 5...Bc5 с ранним Qb3 ─────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Bc5 d4 exd4 O-O', [
    ['d6 cxd4 Bb6 Nc3 Nf6 Bg5 h6 Bh4',          'common', '📖'],
    ['Nf6 e5 Ng4 cxd4 Bb6 d5 Nce7 h3 Nh6',      'sharp',  '🔥'],
    ['Nge7 cxd4 Bb6 Nc3 O-O Be3 d6 Qd2 Ng6',    'common', '⚔️'],
    ['dxc3 Qb3 Qf6 Nxc3 Nge7 Nd5 Qg6 Bf4',      'sharp',  '🎯'],
  ]),

  // ── Отказанный 4...Nd4 (редкий) ──────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Nd4', [
    ['Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3+',   'sharp',  '✨'],
    ['bxc5 Nxf3+ Qxf3 Qf6 d4 Qxf3 gxf3 d6',     'rare',   '🎲'],
  ]),

  // ── Расширение Ba5 d4 exd4 O-O доп. варианты ─────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O Nf6', [
    ['Nxd4 Nxe4 Nxc6 bxc6 Bd3 Nc5 Bg5 Qe7',     'sharp',  '✨'],
    ['e5 Ne4 Bd3 Nc5 Bb5 O-O Re1 d6',           'common', '📖'],
  ]),
];

// =============================================================================
//  3. ДАТСКИЙ ГАМБИТ  (1.e4 e5 2.d4 exd4 3.c3)
// =============================================================================
const danishLines: SeedLine[] = [
  // ── Принятый 3...dxc3 4.Bc4 cxb2 5.Bxb2 (главный) ─────────────────────────
  ...exp('e4 e5 d4 exd4 c3 dxc3 Bc4 cxb2 Bxb2', [
    ['d5 Bxd5 Nf6 Bxf7+ Kxf7 Qxd8 Bb4+ Qd2',    'sharp',  '🎯'],
    ['Nf6 Nc3 Nc6 Nf3 Bb4 Qc2 d6 O-O-O',        'sharp',  '🔥'],
    ['Nc6 Nf3 Nf6 Nbd2 Bc5 O-O d6 Nb3',         'common', '📖'],
    ['Nc6 Nf3 Bc5 O-O d6 Nbd2 Nf6 Qc2',         'sharp',  '💥'],
    ['Nc6 Nf3 d6 O-O Nf6 Qb3 Qd7 Nbd2',         'common', '⚔️'],
    ['Bb4+ Nc3 Nf6 Nf3 d6 O-O O-O Qc2',         'common', '📖'],
    ['d6 Nf3 Nf6 Nbd2 Be7 Qb3 O-O O-O',         'common', '🧠'],
    ['Qe7 Nc3 c6 Nf3 d6 O-O Bg4 Nd4',           'rare',   '🎲'],
    ['Be7 Nc3 Nf6 Nf3 O-O O-O d6 Qc2',          'common', '📖'],
    ['Qg5 Nf3 Qxg2 Rg1 Qh3 Rxg7 Nf6 Rxf7',      'sharp',  '✨'],
  ]),

  // ── 3...dxc3 4.Nxc3 (гамбит Гёринга-тональность) ──────────────────────────
  ...exp('e4 e5 d4 exd4 c3 dxc3 Nxc3', [
    ['Nc6 Bc4 Nf6 Nf3 Bb4 O-O O-O e5 d5',       'sharp',  '⚡'],
    ['Nc6 Nf3 d6 Bc4 Nf6 O-O Be7 Bg5 O-O',      'common', '📖'],
    ['d6 Bc4 Nf6 Nf3 Be7 O-O O-O Bg5 c6',       'common', '🧠'],
    ['Nf6 e5 Ne4 Nxe4 d5 Bb5+ c6 Ba4 Qh4',      'sharp',  '🔥'],
    ['Bb4 Bc4 d6 Nf3 Nf6 O-O O-O Bg5 Bxc3',     'common', '⚔️'],
    ['Nc6 Nf3 Bc5 Bc4 d6 O-O Nf6 Ng5 O-O',      'sharp',  '🎯'],
  ]),

  // ── Отказанный 3...d5 (Капабланка) ────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 d5', [
    ['exd5 Qxd5 cxd4 Nc6 Nf3 Bg4 Be2 Bb4+',     'common', '📖'],
    ['exd5 Qxd5 cxd4 Nf6 Nc3 Qa5 Bd2 Qf5',      'common', '🧠'],
    ['exd5 Nf6 Bb5+ Bd7 Bxd7+ Nbxd7 cxd4 Nxd5', 'common', '📖'],
    ['exd5 Nf6 Nf3 Nxd5 cxd4 Bb4+ Nc3 O-O',     'sharp',  '⚔️'],
    ['cxd4 Nf6 Nc3 Bb4 Bg5 dxe4 d5 h6',         'rare',   '🎲'],
    ['exd5 c6 Nf3 cxd5 cxd4 Nc6 Nc3 Bb4',       'rare',   '🧠'],
  ]),

  // ── Отказанный 3...Nf6 ────────────────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 Nf6', [
    ['e5 Nd5 cxd4 d6 Nf3 dxe5 Nxe5 Bf5',        'common', '📖'],
    ['e5 Nd5 cxd4 d6 Bc4 Nb6 Bb3 Nc6',          'rare',   '🎲'],
  ]),

  // ── Отказанный 3...Nc6 ────────────────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 Nc6', [
    ['Bc4 d6 Nf3 Nf6 O-O Be7 cxd4 O-O',         'common', '🧠'],
    ['Nf3 Nf6 Nxd4 Bc5 Nxc6 bxc6 e5 Qe7',       'rare',   '🎲'],
    ['cxd4 d5 exd5 Qxd5 Nc3 Bb4 Nf3 Nf6',       'common', '📖'],
  ]),

  // ── Отказанный 3...Qe7 (редкий) ───────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 Qe7', [
    ['cxd4 Qxe4+ Be2 Nf6 Nc3 Qg6 Nf3 Bb4',      'rare',   '🎲'],
    ['Bd3 dxc3 Nxc3 Nc6 Nf3 d6 O-O Nf6',        'rare',   '🧠'],
  ]),

  // ── Контргамбит: 3...b5 ───────────────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 b5', [
    ['Bxb5 dxc3 Nxc3 Nf6 Nf3 Bb4 Bd2 O-O',      'rare',   '🎲'],
  ]),

  // ── 3...d3 (возврат пешки) ────────────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 d3', [
    ['Bxd3 Nc6 Nf3 d6 O-O Nf6 Nbd2 Be7',        'common', '🧠'],
    ['Qxd3 Nf6 Nf3 Nc6 Be2 Be7 O-O O-O',        'rare',   '📖'],
  ]),

  // ── Расширение 3...dxc3 4.Bc4 cxb2 5.Bxb2 Bb4+ ───────────────────────────
  ...exp('e4 e5 d4 exd4 c3 dxc3 Bc4 cxb2 Bxb2 Bb4+', [
    ['Nc3 Nf6 Nf3 O-O O-O d6 Qc2 Bxc3',         'common', '📖'],
    ['Nc3 Nc6 Nf3 d6 O-O Nf6 Qc2 Bxc3',         'common', '🧠'],
    ['Kf1 Nf6 Nf3 d6 Qd4 Nc6 Qd3 O-O',          'sharp',  '🎯'],
    ['Nd2 Nc6 Nf3 Nf6 O-O O-O a3 Bxd2',         'common', '⚔️'],
    ['Kf1 Nc6 Nf3 d6 h3 Nf6 Qd4 O-O',           'rare',   '🎲'],
  ]),

  // ── Шведский вариант: 3...dxc3 4.Bc4 Nc6 ─────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 dxc3 Bc4 Nc6', [
    ['Nf3 d6 O-O Nf6 Qb3 Qd7 Nxc3 Be7',         'common', '📖'],
    ['Nf3 Bc5 Nxc3 d6 O-O Nf6 Bg5 h6',          'common', '⚔️'],
    ['Nxc3 Nf6 Nf3 Bb4 O-O d6 Bg5 Bxc3',        'sharp',  '🔥'],
    ['Nxc3 d6 Nf3 Nf6 O-O Be7 Qb3 O-O',         'common', '🧠'],
  ]),

  // ── 3...dxc3 4.Nxc3 с Nc6/Nf6 расширение ─────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 dxc3 Nxc3 Nc6', [
    ['Bc4 Bb4 Nf3 d6 O-O Nf6 Bg5 O-O',          'common', '📖'],
    ['Bc4 Nf6 Nf3 Bb4 O-O O-O e5 d5',           'sharp',  '✨'],
    ['Nf3 Bc5 Bc4 Nf6 Ng5 O-O Nxf7 Rxf7',       'sharp',  '🎯'],
    ['Bc4 d6 Nf3 Nf6 Qb3 Qe7 O-O Be6',          'common', '🧠'],
    ['Nf3 Nf6 Bc4 Bc5 O-O d6 Bg5 h6',           'common', '📖'],
  ]),

  // ── 3...d5 расширение (Капабланка-защита развёрнутая) ────────────────────
  ...exp('e4 e5 d4 exd4 c3 d5 exd5 Qxd5 cxd4', [
    ['Nc6 Nf3 Bg4 Nc3 Bb4 Be2 Bxf3 Bxf3',       'common', '📖'],
    ['Nf6 Nc3 Qa5 Nf3 Nc6 Be2 Bb4 O-O',         'common', '⚔️'],
    ['Bb4+ Nc3 Nc6 Nf3 Nf6 Be2 O-O O-O',        'common', '🧠'],
    ['Nc6 Nf3 Nf6 Nc3 Qa5 Bd2 Bb4 d5',          'rare',   '🎲'],
    ['Nf6 Nf3 Bg4 Be2 Nc6 Nc3 Qa5 O-O',         'common', '📖'],
  ]),

  // ── Отказанный с 3...c5 ───────────────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 c5', [
    ['Bc4 Nc6 Nf3 d6 cxd4 cxd4 Nxd4 Nf6',       'rare',   '🎲'],
    ['cxd4 cxd4 Nc3 Nf6 Nf3 Nc6 Bc4 Bb4',       'common', '🧠'],
  ]),

  // ── Отказанный 3...Be7 (пассивно) ────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 Be7', [
    ['cxd4 d6 Nc3 Nf6 Nf3 O-O Bd3 Nc6',         'common', '📖'],
    ['Bc4 d6 Nf3 Nf6 O-O O-O cxd4 Nc6',         'common', '🧠'],
  ]),

  // ── Отказанный 3...Qf6 (странное) ─────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 Qf6', [
    ['Nf3 dxc3 Nxc3 Bb4 Bc4 Bxc3+ bxc3 d6',     'rare',   '🎲'],
  ]),

  // ── Отказанный 3...Bc5 (развитие) ─────────────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 Bc5', [
    ['cxd4 Bb4+ Nc3 Nf6 Nf3 d6 Bc4 O-O',        'common', '🧠'],
    ['Bc4 d6 cxd4 Bb6 Nc3 Nf6 Nf3 O-O',         'common', '📖'],
  ]),

  // ── Расширение 3.dxc3 4.Bc4 с развитием ─────────────────────────────────
  ...exp('e4 e5 d4 exd4 c3 dxc3 Bc4 Nf6', [
    ['Nxc3 d6 Nf3 Be7 O-O O-O Qb3 Qd7',         'common', '📖'],
    ['e5 d5 Bb3 Bg4 Nxc3 Nc6 Nf3 Be7',          'sharp',  '🔥'],
  ]),
];

// =============================================================================
//  4. ВЕНСКИЙ ГАМБИТ  (1.e4 e5 2.Nc3 Nf6 3.f4)
// =============================================================================
const viennaLines: SeedLine[] = [
  // ── Принятый 3...exf4 4.e5 ────────────────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 exf4 e5', [
    ['Ng4 Nf3 d6 h3 Nh6 d4 dxe5 Nxe5',          'common', '📖'],
    ['Ng4 Nf3 d6 d4 Nc6 Bb5 Bd7 O-O',           'common', '⚔️'],
    ['Ng4 d4 d6 Nf3 g5 h3 Nh6 exd6',            'sharp',  '🔥'],
    ['Ng4 Nf3 Nc6 d4 d6 Bb5 Bd7 O-O',           'common', '📖'],
    ['Nd5 Nxd5 d6 Nf3 dxe5 Nxe5 Nc6 Bb5',       'sharp',  '⚡'],
    ['Nd5 Nf3 d6 Nxd5 dxe5 Bc4 Be7 O-O',        'sharp',  '✨'],
    ['Nd5 d4 d6 Qf3 dxe5 dxe5 Nc6 Bb5',         'sharp',  '🔥'],
    ['Nh5 d4 d6 Nf3 dxe5 Nxe5 Qh4+ g3',         'rare',   '🎲'],
    ['Ne4 Nf3 Nxc3 bxc3 d6 d4 dxe5 Nxe5',       'common', '🧠'],
  ]),

  // ── Принятый 3...exf4 4.Nf3 (вместо e5) ──────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 exf4 Nf3', [
    ['d5 exd5 Nxd5 Nxd5 Qxd5 d4 Nc6 Bc4',       'common', '📖'],
    ['d6 d4 Be7 Bxf4 O-O Bc4 Nc6 Qe2',          'common', '⚔️'],
    ['Be7 Bc4 d6 d4 O-O O-O c6 Bxf4',           'common', '🧠'],
    ['Nc6 d4 d5 exd5 Nxd5 Nxd5 Qxd5 Bxf4',      'sharp',  '🔥'],
  ]),

  // ── 3...d6 (защита Пинкуса) ──────────────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 d6', [
    ['Nf3 Nc6 Bb5 Bd7 d3 a6 Bxc6 Bxc6',         'common', '🧠'],
    ['fxe5 dxe5 Nf3 Nc6 Bc4 Bc5 d3 Bg4',        'common', '📖'],
    ['Nf3 exf4 d4 Bg4 Bxf4 Be7 Bc4 O-O',        'sharp',  '⚔️'],
  ]),

  // ── 3...d5 (контргамбит Венский) ─────────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 d5', [
    ['fxe5 Nxe4 Nf3 Bc5 Qe2 Bf5 Nxe4 Bxe4',     'sharp',  '✨'],
    ['fxe5 Nxe4 Nxe4 dxe4 Nf3 Nc6 Qe2 Qd5',     'common', '📖'],
    ['fxe5 Nxe4 d3 Qh4+ g3 Nxg3 Nf3 Qh3',       'sharp',  '🎯'],
    ['exd5 e4 d3 Nxd5 Nxd5 Qxd5 dxe4 Qxe4+',    'sharp',  '🔥'],
    ['exd5 exf4 Qf3 Bd6 Qxf4 O-O Bc4 Nbd7',     'rare',   '🎲'],
  ]),

  // ── 3...Nc6 (гамбит Гампе-Аллгайера) ─────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 Nc6', [
    ['fxe5 Nxe5 d4 Nc6 e5 Nd5 Nxd5 Qh4+',       'sharp',  '⚔️'],
    ['Nf3 exf4 d4 g5 Bc4 Bg7 O-O d6',           'sharp',  '🔥'],
    ['Bb5 exf4 Nf3 Bc5 d4 Bb6 O-O O-O',         'common', '🧠'],
  ]),

  // ── 3...Bb4 (связка) ─────────────────────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 Bb4', [
    ['fxe5 Nxe4 Qf3 Nxc3 bxc3 Bxc3+ Kd1 Ba5',   'rare',   '🎲'],
    ['Nf3 exf4 e5 Ng4 d4 Ne3 Bxe3 fxe3',        'sharp',  '✨'],
  ]),

  // ── 3...Bc5 (пассивное) ──────────────────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 Bc5', [
    ['fxe5 Nxe4 Nxe4 d5 d4 dxe4 dxc5 Qxd1+',    'common', '📖'],
    ['Nf3 d6 Bb5+ c6 Ba4 exf4 d4 Bb6',          'common', '🧠'],
  ]),

  // ── 3...h6 (редкое) ──────────────────────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 h6', [
    ['Nf3 Nc6 Bb5 d6 d3 a6 Bxc6+ bxc6',         'rare',   '🧠'],
  ]),

  // ── 3...c5 (редкое) ──────────────────────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 c5', [
    ['Nf3 Nc6 Bb5 d6 O-O a6 Bxc6+ bxc6',        'rare',   '🎲'],
  ]),

  // ── 3...Qe7 (редкое — защита ферзём) ─────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 Qe7', [
    ['fxe5 Qxe5 Nf3 Qe7 d4 d6 Bc4 Nbd7',        'rare',   '🎲'],
  ]),

  // ── Главная атака Венского: 3...exf4 4.e5 Ng4 5.d4 (расширение) ──────────
  ...exp('e4 e5 Nc3 Nf6 f4 exf4 e5 Ng4 d4', [
    ['d6 Nf3 Nc6 Bb5 Bd7 Bxc6 Bxc6',            'common', '📖'],
    ['d6 Nf3 Nc6 Bb5 Bd7 Bxc6 Bxc6 O-O',        'sharp',  '🔥'],
    ['Nc6 Nf3 Ngxe5 dxe5 Nxe5 Bxf4 Nxf3+ Qxf3', 'common', '⚔️'],
    ['Nc6 Bxf4 d6 Nf3 dxe5 dxe5 Bb4 Qd3',       'sharp',  '✨'],
    ['d6 Nf3 dxe5 dxe5 Nc6 Bxf4 Be7 Nd5',       'common', '🧠'],
  ]),

  // ── Главная линия Nd5 ────────────────────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 exf4 e5 Nd5 Nf3', [
    ['d6 Nxd5 dxe5 Nxf4 Nc6 Bb5 Bd7 Bxc6',      'sharp',  '🎯'],
    ['Be7 Nxd5 d6 exd6 Bxd6 d4 O-O Bxf4',       'common', '📖'],
    ['Nc6 Nxd5 d6 Bb5 Bd7 Qe2 Qe7 Bxc6',        'common', '⚔️'],
    ['d6 Bc4 Nxc3 bxc3 dxe5 Nxe5 Qe7 Qe2',      'sharp',  '✨'],
  ]),

  // ── 3...exf4 4.Nf3 Be7 (главная позиционная) ──────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 exf4 Nf3 Be7', [
    ['d4 O-O Bxf4 Nc6 Bc4 d6 O-O Bg4',          'common', '📖'],
    ['Bc4 O-O O-O d6 d3 c6 Qe1 b5',             'common', '🧠'],
    ['d4 d6 Bxf4 Nc6 Bc4 O-O O-O Bg4',          'common', '⚔️'],
  ]),

  // ── 3...d6 расширение ────────────────────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 d6 Nf3', [
    ['Nbd7 d4 exf4 Bxf4 g6 Bc4 Bg7 O-O',        'common', '📖'],
    ['Nc6 Bb5 Bd7 d3 a6 Bxc6 Bxc6 fxe5',        'common', '🧠'],
    ['Be7 fxe5 dxe5 d3 Nc6 Bg5 Bg4 h3',         'common', '⚔️'],
  ]),

  // ── Главная атака Венского против 3...d5 — расширение ─────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3', [
    ['Bc5 Qe2 Bf5 Nxe4 Bxe4 d3 Bxf3 gxf3',      'sharp',  '✨'],
    ['Nc6 d4 Bg4 Be2 Bxf3 Bxf3 Qh4+ Kf1',       'sharp',  '🎯'],
    ['Be7 d4 O-O Bd3 f5 exf6 Nxf6 O-O',         'common', '📖'],
    ['Bf5 Qe2 Nxc3 bxc3 Qd7 d4 Nc6 Bb2',        'common', '⚔️'],
    ['Nxc3 bxc3 c5 d4 cxd4 cxd4 Bc5 Bb2',       'common', '🧠'],
  ]),

  // ── Гамбит Яничека-Гампе (3.Nc3 Nc6 альт) ────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 Nc6 Nf3', [
    ['exf4 d4 Bb4 Bxf4 O-O Bd3 Re8 O-O',        'common', '📖'],
    ['d6 Bb5 Bd7 d3 a6 Bxc6 Bxc6 O-O',          'common', '🧠'],
    ['Bb4 fxe5 Nxe4 Qe2 Nxc3 bxc3 Bxc3 Rb1',    'sharp',  '✨'],
  ]),

  // ── 3...Bc5 (пассивное) расширение ───────────────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 Bc5 Nf3', [
    ['d6 Bb5+ c6 Ba4 exf4 d4 Bb6 Bxf4',         'common', '📖'],
    ['Nc6 Bb5 a6 Bxc6 dxc6 d3 Bg4 h3',          'common', '🧠'],
    ['O-O fxe5 Nxe4 Nxe4 d5 d3 Nc6 Nxc5',       'rare',   '🎲'],
  ]),

  // ── Расширение 3.f4 exf4 с b3/d3 позиционной ────────────────────────────
  ...exp('e4 e5 Nc3 Nf6 f4 exf4 d4', [
    ['d5 e5 Ne4 Nxe4 dxe4 Bxf4 Nc6 Nf3',        'common', '📖'],
    ['Nc6 e5 Ng4 Bxf4 Bb4 h3 Nh6 Nf3',          'sharp',  '🔥'],
    ['Bb4 e5 Ne4 Qd3 Nxc3 bxc3 Bxc3+ Bd2',      'sharp',  '✨'],
  ]),
];

// =============================================================================
//  5. ГАМБИТ СМИТА-МОРРА  (1.e4 c5 2.d4 cxd4 3.c3)
// =============================================================================
const smithMorraLines: SeedLine[] = [
  // ── Принятый 3...dxc3 4.Nxc3 Nc6 5.Nf3 d6 6.Bc4 (классика) ───────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4', [
    ['e6 O-O Nf6 Qe2 Be7 Rd1 e5 h3',            'common', '📖'],
    ['e6 O-O a6 Qe2 Nge7 Rd1 h6 Bf4',           'common', '⚔️'],
    ['e6 O-O Nf6 Qe2 a6 Rd1 Qc7 Bb3',           'common', '🧠'],
    ['Nf6 e5 dxe5 Qxd8+ Nxd8 Nb5 Rb8 Nxa7',     'sharp',  '🎯'],
    ['a6 O-O e6 Qe2 Nf6 Rd1 Qc7 Bg5',           'common', '📖'],
    ['Bg4 O-O Nf6 h3 Bxf3 Qxf3 e6 Rd1',         'common', '⚔️'],
    ['Nf6 e5 dxe5 Qxd8+ Kxd8 Ng5 Ke8 Nxf7',     'sharp',  '💥'],
    ['e6 O-O Nf6 Bg5 Be7 Qe2 O-O Rfd1',         'common', '📖'],
    ['Qc7 O-O Nf6 Qe2 e6 Rd1 a6 Bf4',           'common', '🧠'],
    ['e6 O-O Nf6 Qe2 Be7 Rd1 O-O Bg5',          'common', '📖'],
  ]),

  // ── 4...Nc6 5.Nf3 e6 6.Bc4 (сибирка-подобная) ─────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 e6 Bc4', [
    ['Qc7 O-O Nf6 Qe2 a6 Rd1 b5 Bb3',           'common', '📖'],
    ['a6 O-O Nge7 Bg5 f6 Be3 Ng6 Qd2',          'common', '🧠'],
    ['Nge7 O-O a6 Bg5 h6 Be3 Ng6 Qd2',          'sharp',  '⚔️'],
    ['d6 O-O Nf6 Qe2 Be7 Rd1 O-O Bf4',          'common', '📖'],
  ]),

  // ── 4...a6 (защита Петроффа против Моррро) ───────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 a6', [
    ['Nf3 e6 Bc4 Nc6 O-O d6 Qe2 Nf6',           'common', '📖'],
    ['Bc4 e6 Nf3 d6 O-O Nc6 Qe2 Nf6',           'common', '🧠'],
    ['Nf3 b5 Bd3 Bb7 O-O Nc6 Qe2 Nf6',          'rare',   '🎲'],
  ]),

  // ── 4...g6 (дракон-подобная) ─────────────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 g6', [
    ['Nf3 Bg7 Bc4 Nc6 O-O d6 Qe2 Nf6',          'common', '📖'],
    ['Nf3 Bg7 e5 d5 Bb5+ Nd7 e6 fxe6',          'sharp',  '🔥'],
    ['Nf3 Bg7 Bc4 d6 e5 dxe5 Nxe5 Qc7',         'sharp',  '⚔️'],
    ['Nf3 Nc6 Bc4 Bg7 O-O d6 Qe2 Nf6',          'common', '🧠'],
  ]),

  // ── 4...Nf6 (натуральное) ────────────────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nf6', [
    ['Nf3 d6 Bc4 Nc6 O-O e6 Qe2 Be7',           'sharp',  '✨'],
    ['e5 Nd5 Bc4 Nb6 Bb3 Nc6 Nf3 e6',           'common', '📖'],
    ['Nf3 e6 Bc4 Nc6 O-O d6 Qe2 Be7',           'common', '📖'],
    ['Nf3 Nc6 Bc4 d6 O-O e6 Qe2 Be7',           'rare',   '🎲'],
  ]),

  // ── 4...e6 (быстрое e6) ──────────────────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 e6', [
    ['Nf3 a6 Bc4 Nc6 O-O Nge7 Bg5 f6',          'common', '📖'],
    ['Nf3 d6 Bc4 Nc6 O-O a6 Qe2 Nf6',           'common', '🧠'],
    ['Bc4 Nc6 Nf3 a6 O-O Nge7 Bg5 h6',          'common', '⚔️'],
  ]),

  // ── 4...d6 (напрямую) ────────────────────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 d6', [
    ['Nf3 Nc6 Bc4 a6 O-O e6 Qe2 Nf6',           'common', '📖'],
    ['Nf3 Nf6 Bc4 Nc6 O-O e6 Qe2 Be7',          'common', '🧠'],
    ['Bc4 a6 Nf3 Nc6 O-O e6 Qe2 Nf6',           'common', '📖'],
  ]),

  // ── Отказанный 3...Nf6 ───────────────────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 Nf6', [
    ['e5 Nd5 cxd4 d6 Nf3 dxe5 Nxe5 Nc6',        'common', '📖'],
    ['e5 Nd5 Qxd4 e6 Nf3 Nc6 Qe4 d6',           'rare',   '🧠'],
    ['cxd4 Nxe4 Nc3 Nxc3 bxc3 d6 Bd3 e6',       'rare',   '🎲'],
  ]),

  // ── Отказанный 3...d5 (центральный встречный) ───────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 d5', [
    ['exd5 Qxd5 cxd4 e6 Nf3 Nf6 Nc3 Qa5',       'common', '📖'],
    ['exd5 Qxd5 cxd4 Nc6 Nf3 Bg4 Be2 Nf6',      'common', '🧠'],
    ['exd5 Nf6 Bb5+ Nbd7 cxd4 a6 Bxd7+ Qxd7',   'common', '⚔️'],
    ['exd5 Qxd5 cxd4 g6 Nf3 Bg7 Nc3 Qa5',       'rare',   '🎲'],
  ]),

  // ── Отказанный 3...d3 (Alapin-like) ─────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 d3', [
    ['Bxd3 Nc6 Nf3 d6 O-O Nf6 h3 g6',           'common', '🧠'],
    ['Qxd3 Nc6 Nf3 g6 Nbd2 Bg7 Be2 d6 O-O Nf6', 'rare',   '📖'],
  ]),

  // ── Отказанный 3...Nc6 ──────────────────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 Nc6', [
    ['cxd4 d6 Nc3 Nf6 Nf3 g6 Be2 Bg7',          'common', '📖'],
    ['Nf3 Nf6 e5 Nd5 cxd4 d6 Bc4 Nb6',          'rare',   '🧠'],
  ]),

  // ── Главная ветка 6.Bc4 e6 с углублением ────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4 e6 O-O', [
    ['Nf6 Qe2 Be7 Rd1 O-O Bg5 h6 Bh4',          'common', '📖'],
    ['a6 Qe2 Nf6 Rd1 Qc7 Bf4 Bd7 Rac1',         'common', '⚔️'],
    ['Nge7 Bf4 Ng6 Bg3 Be7 Nd4 O-O Qe2',        'common', '🧠'],
    ['Be7 Qe2 Nf6 Rd1 e5 Bg5 O-O Rac1',         'common', '📖'],
    ['Qc7 Bb3 Nf6 Qe2 Be7 Rd1 O-O Bg5',         'common', '✨'],
  ]),

  // ── Главная атакующая: Bc4+Qe2+Rd1 с e5 ─────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 e6 Bc4 Nf6 e5', [
    ['Ng4 Qe2 Qc7 h3 Nh6 Bf4 Be7 Rd1',          'sharp',  '🔥'],
    ['Nd5 Nxd5 exd5 Bxd5 Be7 Qe2 O-O O-O',      'sharp',  '✨'],
    ['Nd5 Nxd5 exd5 Bxd5 Nb4 Qe2 d6 Bb3',       'sharp',  '🎯'],
  ]),

  // ── Сибирский вариант (защитный) ────────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 e6 Bc4 Qc7 O-O', [
    ['a6 Qe2 Nf6 Rd1 b5 Bb3 Bb7 Bg5',           'common', '📖'],
    ['Nf6 Qe2 a6 Rd1 d6 Bg5 Bd7 Rac1',          'common', '🧠'],
    ['Bc5 e5 Nge7 Bf4 O-O Nb5 Qb8 Nd6',         'sharp',  '⚔️'],
  ]),

  // ── Таймановская схема: с ранним a6 b5 ───────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 e6 Bc4 a6', [
    ['O-O b5 Bd3 Bb7 Qe2 Nge7 Rd1 Ng6',         'common', '📖'],
    ['O-O Qc7 Qe2 Nge7 Rd1 Ng6 Bg5 Be7',        'common', '⚔️'],
    ['O-O Nge7 Bg5 h6 Bh4 Ng6 Bg3 b5',          'common', '🧠'],
  ]),

  // ── Защита Рубинштейна (быстрое Nf6): 4...Nf6 5.e5 ──────────────────────
  ...exp('e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nf6 e5', [
    ['Ng4 Nf3 Nc6 Bb5 e6 h3 Nh6 Nd4',           'sharp',  '🔥'],
    ['Nh5 Nf3 d6 Bc4 g6 O-O Bg7 Re1',           'sharp',  '✨'],
    ['Nd5 Nxd5 e6 Nf3 exd5 Bc4 d4 O-O',         'sharp',  '🎯'],
  ]),

  // ── Отказ — разветвление 3...d5 ─────────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 d5 exd5', [
    ['Nf6 Bc4 Nxd5 Nf3 e6 cxd4 Nc6 O-O',        'common', '📖'],
    ['Qxd5 cxd4 e5 Nc3 Bb4 Bd2 Bxc3 Bxc3',      'common', '⚔️'],
    ['Nf6 Qa4+ Nbd7 Nf3 g6 Bc4 Bg7 O-O',        'rare',   '🎲'],
  ]),

  // ── Отказ — 3...a6 ──────────────────────────────────────────────────────
  ...exp('e4 c5 d4 cxd4 c3 a6', [
    ['cxd4 d5 e5 Nc6 Nf3 Bg4 Bb5 Qb6',          'rare',   '🧠'],
    ['Nf3 Nc6 Bc4 d6 cxd4 Nf6 O-O e6',          'common', '📖'],
  ]),
];

// =============================================================================
//  6. ГАМБИТ ЭНГЛУНДА  (1.d4 e5) — за чёрных
// =============================================================================
const englundLines: SeedLine[] = [
  // ── Главная линия — комплекс Энглунда: 3...Qe7 ──────────────────────────
  ...exp('d4 e5 dxe5 Nc6 Nf3 Qe7', [
    ['Bf4 Qb4+ Bd2 Qxb2 Bc3 Bb4 Qd2 Bxc3',       'sharp', '🎯'],
    ['Bf4 Qb4+ Bd2 Qxb2 Bc3 Nb4 Nbd2 Nxc2+',     'sharp', '💥'],
    ['Bf4 Qb4+ Bd2 Qxb2 Nc3 Bb4 Rb1 Qa3',        'sharp', '🔥'],
    ['Bf4 Qb4+ Bd2 Qxb2 Nc3 Bb4 Nd5 Bxd2+',      'sharp', '⚔️'],
    ['Bf4 Qb4+ Nc3 Qxb2 Nd5 Kd8 Rb1 Qxa2',       'sharp', '✨'],
    ['Bf4 Qb4+ c3 Qxb2 Qd2 Qxd2+ Nbxd2 Nxe5',    'common','📖'],
    ['Bf4 Qb4+ Qd2 Qxb2 Qc3 Qxc3+ Nxc3 d6',      'common','🧠'],
    ['Nc3 Nxe5 Nxe5 Qxe5 Bf4 Qa5 e3 d6',         'common','📖'],
    ['a3 d6 exd6 cxd6 Nc3 Nf6 Bg5 h6',           'common','🧠'],
    ['e3 Nxe5 Nxe5 Qxe5 Bd3 Qd6 O-O Nf6',        'common','📖'],
    ['g3 Nxe5 Nxe5 Qxe5 Bg2 d6 O-O Nf6',         'common','🧠'],
    ['Bg5 Qb4+ Nc3 Qxb2 Rb1 Qa3 Rxb7 Qxc3+',     'sharp', '💥'],
    ['Nbd2 Nxe5 Nxe5 Qxe5 Nf3 Qd5 e3 Nf6',       'common','⚔️'],
    ['Qd5 Nxe5 Qxe5 Qxe5 Nxe5 d6 Nc3 Nf6',       'common','🧠'],
    ['Qd3 Nxe5 Nxe5 Qxe5 Nc3 Bb4 Bd2 Nf6',       'common','📖'],
  ]),

  // ── 4.Bf4 Qb4+ 5.Bd2 Qxb2 6.Bc3 с ветками ───────────────────────────────
  ...exp('d4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Qb4+ Bd2 Qxb2 Bc3', [
    ['Bb4 a3 Bxc3+ Nxc3 Qxc3+ Qd2 Qxd2+ Nxd2',   'common','📖'],
    ['Bb4 Qd2 Nxe5 Nxe5 Bxc3 Nxc3 Qxc3 Qxc3',    'sharp', '🎯'],
    ['Nxe5 Nxe5 Qxc3 Nxc3 d6 Nd3 Nf6 e3',        'sharp', '⚡'],
    ['Nf6 Nbd2 d6 e3 Nxe5 Nxe5 dxe5 Bxe5',       'sharp', '🔥'],
    ['Bb4 e3 Nxe5 Nxe5 Qxc3+ Nxc3 Bxc3+ Qd2',    'sharp', '⚔️'],
  ]),

  // ── 4.Bf4 Qb4+ 5.Bd2 Qxb2 6.Nc3 (Rb1 Qa3 — ловушка Энглунда) ────────────
  ...exp('d4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Qb4+ Bd2 Qxb2 Nc3', [
    ['Bb4 Rb1 Qa3 Rb3 Qa5 Nd5 Bd6 Nxc7+',        'sharp', '🎯'],
    ['Bb4 a3 Bxc3 Bxc3 d6 Qd2 dxe5 Nxe5 Nxe5 Bxe5', 'sharp', '💥'],
    ['Bb4 a3 Bxc3 Bxc3 Nxe5 Nxe5 Qxc3+ Qd2',     'common','📖'],
    ['Bb4 Nd5 Bxd2+ Nxd2 Qa3 Rb1 Qxa2 Nxc7+',    'sharp', '✨'],
  ]),

  // ── 4.Bf4 Nxe5 (прямой размен) ──────────────────────────────────────────
  ...exp('d4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Nxe5', [
    ['Bxe5 Qxe5 e3 d6 Nc3 Nf6 Qd2 Be7',          'common','📖'],
    ['Bxe5 Qxe5 Qd4 Qxd4 Nxd4 c6 Nc3 Nf6',       'common','🧠'],
    ['Nxe5 Qxe5 Qd2 Nf6 Nc3 Bb4 O-O-O O-O',      'sharp', '⚔️'],
    ['Nxe5 Qxe5 Nc3 Bb4 Qd2 Nf6 e3 O-O',         'common','📖'],
  ]),

  // ── Зильберминтс: 3...f6 ────────────────────────────────────────────────
  ...exp('d4 e5 dxe5 Nc6 Nf3 f6', [
    ['exf6 Nxf6 Nc3 d5 Bg5 Bg4 e3 Bxf3',         'sharp', '🔥'],
    ['exf6 Nxf6 Bg5 Bd6 e3 O-O Be2 h6',          'common','📖'],
    ['exf6 Nxf6 Bf4 d6 e3 Bg4 Be2 Bxf3',         'common','🧠'],
    ['e4 fxe5 Nxe5 Nxe5 Qh5+ g6 Qxe5+ Qe7',      'sharp', '💥'],
    ['Bf4 fxe5 Bxe5 Nxe5 Nxe5 Qf6 Nf3 Nh6',      'sharp', '⚔️'],
    ['Nd4 fxe5 Nxc6 bxc6 e3 d5 Be2 Nf6',         'rare',  '🎲'],
  ]),

  // ── Защита Хартлауба-Чарлика: 3...Nge7 ──────────────────────────────────
  ...exp('d4 e5 dxe5 Nc6 Nf3 Nge7', [
    ['Bf4 Ng6 Bg3 Qe7 e3 Ncxe5 Nxe5 Qxe5',       'common','📖'],
    ['Nc3 Ng6 Bg5 Be7 Bxe7 Qxe7 e3 Ncxe5',       'common','🧠'],
    ['Bg5 Ng6 e4 h6 Bh4 Qe7 Nc3 Ncxe5',          'rare',  '🎲'],
  ]),

  // ── Защита Фельбекера: 2...d6 ───────────────────────────────────────────
  ...exp('d4 e5 dxe5 d6', [
    ['exd6 Bxd6 Nf3 Nf6 Nc3 O-O Bg5 Nc6',        'common','📖'],
    ['exd6 Bxd6 g3 Nf6 Bg2 O-O Nf3 Nc6',         'common','🧠'],
    ['exd6 Bxd6 Nc3 Nf6 Nf3 Nc6 Bg5 h6',         'common','📖'],
    ['Nf3 dxe5 Qxd8+ Kxd8 Nxe5 Nd7 Nd3 Nc5',     'common','⚔️'],
    ['e4 dxe5 Qxd8+ Kxd8 Nc3 c6 Bg5+ f6',        'rare',  '🎲'],
  ]),

  // ── Гамбит Соллера: 2...f6 (сразу жертва) ───────────────────────────────
  ...exp('d4 e5 dxe5 f6', [
    ['exf6 Nxf6 Nc3 d5 Bg5 Bf5 e3 Bd6',          'sharp', '🔥'],
    ['exf6 Nxf6 Nf3 d5 g3 Bd6 Bg2 O-O',          'common','📖'],
    ['e4 fxe5 Nf3 Nc6 Bc4 Nf6 Nc3 Bb4',          'sharp', '⚔️'],
    ['Nf3 fxe5 Nxe5 Qe7 Nf3 Nf6 Nc3 d6 e3 Nc6',  'common','🧠'],
  ]),

  // ── Отказ 2.e4 (становится обычный открытый дебют) ──────────────────────
  ...exp('d4 e5 e4', [
    ['exd4 Qxd4 Nc6 Qe3 Nf6 Nc3 Bb4 Bd2',        'common','📖'],
    ['Nc6 Nf3 exd4 Nxd4 Nf6 Nc3 Bb4 Bd2',        'common','🧠'],
    ['Nf6 Nc3 exd4 Qxd4 Nc6 Qd3 d6 Nf3',         'common','📖'],
  ]),

  // ── Отказ 2.c4 (английский переход) ─────────────────────────────────────
  ...exp('d4 e5 c4', [
    ['exd4 Qxd4 Nc6 Qd1 Nf6 Nc3 d5 cxd5',        'common','📖'],
    ['Nf6 Nc3 Nc6 Nf3 Bb4 Bg5 exd4 Nxd4',        'rare',  '🎲'],
    ['Nc6 d5 Nce7 Nc3 Ng6 e4 d6 h4',             'common','🧠'],
  ]),

  // ── Отказ 2.Nf3 (игнор) ─────────────────────────────────────────────────
  ...exp('d4 e5 Nf3', [
    ['e4 Ng5 d5 Nxe4 Nc6 Bg5 Qd6 Bf4',           'rare',  '🧠'],
    ['exd4 Nxd4 Nc6 Nf3 Nf6 Nc3 d5 Bg5',         'common','📖'],
    ['Nc6 dxe5 Nxe5 Nxe5 Qf6 Nd3 Qxb2 Nc3',      'sharp', '🔥'],
  ]),

  // ── Расширение 4.Bf4 Qb4+ 5.Bd2 Qxb2 6.Bc3 Bb4 (главная табия) ──────────
  ...exp('d4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Qb4+ Bd2 Qxb2 Bc3 Bb4', [
    ['Qd2 Bxc3 Qxc3 Qxc3+ Nxc3 Nxe5 Nxe5 d6',    'common','📖'],
    ['a3 Bxc3+ Nxc3 Nxe5 Nxe5 Qxc3+ Qd2 Qxa1',   'sharp', '⚔️'],
    ['Nbd2 Nxe5 Nxe5 Qxc3 Nd3 Qxa1 Qxa1 Bxd2+',  'sharp', '🔥'],
  ]),

  // ── Глубокое 3...Qe7 4.Qd5 расширение ────────────────────────────────────
  ...exp('d4 e5 dxe5 Nc6 Nf3 Qe7 Qd5', [
    ['Nxe5 Qxe5 Qxe5 Nxe5 d6 Nd3 Nf6 e3',        'common','📖'],
    ['f6 exf6 Nxf6 Qd3 d5 Bg5 Bd7 Nbd2',         'common','🧠'],
  ]),
];

// =============================================================================
//  7. ЛАТВИЙСКИЙ ГАМБИТ  (1.e4 e5 2.Nf3 f5) — за чёрных
// =============================================================================
const latvianLines: SeedLine[] = [
  // ── Принятый 3.exf5 e4 (главный путь) ───────────────────────────────────
  ...exp('e4 e5 Nf3 f5 exf5 e4', [
    ['Ne5 Nf6 Bc4 d5 Bb3 Bd6 d4 O-O',            'sharp', '🔥'],
    ['Ne5 Nf6 d4 d6 Nc4 Bxf5 Nc3 Nc6',           'sharp', '⚔️'],
    ['Ne5 Qf6 d4 d6 Nc4 Qxf5 Nc3 Nf6',           'common','📖'],
    ['Ne5 Nf6 Nc3 d5 d3 d4 Nb1 Bxf5',            'sharp', '✨'],
    ['Ne5 Qe7 Nc4 d5 Nca3 Bxf5 Nc3 Nf6',         'common','🧠'],
    ['Qe2 Qe7 Nd4 Nc6 Nb5 Kd8 Qh5 g6',           'sharp', '💥'],
    ['Qe2 d5 d3 Nf6 dxe4 Nxe4 Nc3 Bxf5',         'common','📖'],
    ['Nd4 Nf6 d3 c5 Nb3 d5 Nc3 d4',              'common','🧠'],
    ['Nd4 Qf6 d3 Nc6 Nxc6 bxc6 Nc3 d5 dxe4 dxe4', 'sharp','⚔️'],
    ['Nd4 Nf6 Nc3 c5 Ndb5 d5 d3 a6',             'common','📖'],
  ]),

  // ── Принятый 3.exf5 с другими откликами ─────────────────────────────────
  ...exp('e4 e5 Nf3 f5 exf5', [
    ['Nf6 Nc3 d6 d4 e4 Ne5 Bxf5 Bc4 Bd7',        'common','🧠'],
    ['d6 Nc3 Nf6 d4 e4 Ne5 dxe5 dxe5',           'sharp', '🔥'],
    ['Qe7 Nc3 Nf6 d4 e4 Ne5 d6 Bc4 Bxf5',        'common','📖'],
    ['d5 d4 e4 Ne5 Nf6 Nc3 Bxf5 Nc4 Bd6',        'common','⚔️'],
  ]),

  // ── Принятый 3.Nxe5 (лобовое) ───────────────────────────────────────────
  ...exp('e4 e5 Nf3 f5 Nxe5', [
    ['Qf6 Nc4 fxe4 Nc3 Qg6 d3 Nf6 dxe4',         'sharp', '🔥'],
    ['Qf6 Nc4 fxe4 Nc3 Qf7 Ne3 Nf6 d3',          'sharp', '⚔️'],
    ['Qf6 d4 d6 Nc4 fxe4 Nc3 Qg6 d5',            'common','📖'],
    ['Qf6 d4 fxe4 Nc4 Qf7 Nc3 Nf6 Ne3',          'sharp', '✨'],
    ['Qf6 Ng4 fxe4 Nc3 Qf7 d3 Nf6 dxe4',         'common','🧠'],
    ['Qe7 d4 fxe4 Bg5 Qf7 c4 d6 Nd3',            'common','📖'],
    ['Qe7 Nc4 fxe4 Nc3 d5 Qe2 Nf6 Nxe4',         'sharp', '🎯'],
    ['Nc6 d4 fxe4 Nc3 Nf6 Bg5 Be7 d5',           'sharp', '💥'],
    ['Nc6 Nxc6 dxc6 d3 Nf6 Bg5 Bc5 Nc3 O-O',     'rare',  '🎲'],
  ]),

  // ── Отказ 3.d4 (солидно) ────────────────────────────────────────────────
  ...exp('e4 e5 Nf3 f5 d4', [
    ['fxe4 Nxe5 Nf6 Bg5 d6 Nc4 Be7 Bxf6',        'common','📖'],
    ['fxe4 Nxe5 Qf6 Nc3 c6 Nc4 d5 Ne3',          'common','🧠'],
    ['Nc6 Bb5 fxe4 Nxe5 Nxe5 dxe5 Qh4+ g3',      'sharp', '🔥'],
    ['fxe4 Nxe5 d6 Nc4 Nf6 Bg5 Be7 Nc3',         'sharp', '⚔️'],
    ['exd4 Nxd4 fxe4 Nc3 Nf6 Bg5 Be7 Qd2',       'rare',  '🎲'],
  ]),

  // ── Отказ 3.d3 (пассивно) ──────────────────────────────────────────────
  ...exp('e4 e5 Nf3 f5 d3', [
    ['fxe4 dxe4 Nf6 Nc3 Bb4 Bd2 O-O Bd3',        'common','🧠'],
    ['Nc6 exf5 e4 Nd4 Nxd4 dxe4 d6 Nc3',         'common','📖'],
  ]),

  // ── Отказ 3.Nc3 (конкретно) ─────────────────────────────────────────────
  ...exp('e4 e5 Nf3 f5 Nc3', [
    ['fxe4 Nxe4 Nf6 Nxf6+ Qxf6 d4 d6 Bd3',       'common','📖'],
    ['Nf6 exf5 e4 Ne5 d6 Nc4 Bxf5 d3',           'common','🧠'],
  ]),

  // ── Принятый 3.exf5 e4 4.Ne5 с углублением ──────────────────────────────
  ...exp('e4 e5 Nf3 f5 exf5 e4 Ne5 Nf6', [
    ['Bc4 d5 Bb3 Bd6 d4 O-O Bg5 c6',             'common','📖'],
    ['Bc4 Qe7 d4 c6 O-O d5 Bb3 Qxe5',            'sharp', '🔥'],
    ['Nc4 d5 Nca3 Bxf5 d3 Bd6 Nc3 O-O',          'common','⚔️'],
    ['d3 d6 Nc4 Bxf5 dxe4 Nxe4 Nc3 Nxc3',        'common','🧠'],
  ]),

  // ── Расширение: 3.Nxe5 Qf6 4.d4 ─────────────────────────────────────────
  ...exp('e4 e5 Nf3 f5 Nxe5 Qf6 d4', [
    ['d6 Nc4 fxe4 Nc3 Qf7 Ne3 Nf6 d5',           'sharp', '🎯'],
    ['Nc6 Nxc6 dxc6 Nc3 fxe4 Bc4 Qf7 Nxe4',      'common','📖'],
    ['fxe4 Bc4 Nc6 Nxc6 dxc6 Nc3 Bc5 O-O',       'sharp', '✨'],
    ['Nc6 Nxc6 bxc6 Nc3 Qe7 Bg5 Nf6 Qd2',        'common','🧠'],
  ]),

  // ── Главная линия 3.Nxe5 Qf6 4.Nc4 fxe4 ─────────────────────────────────
  ...exp('e4 e5 Nf3 f5 Nxe5 Qf6 Nc4 fxe4', [
    ['Nc3 Qf7 d3 Nf6 dxe4 Be7 Bg5 h6',           'common','📖'],
    ['Ne3 Nc6 d3 Bc5 dxe4 Nge7 Nc3 O-O',         'common','⚔️'],
    ['Nc3 Qg6 d3 Nf6 dxe4 Nxe4 Nxe4 Qxe4+',      'sharp', '🔥'],
  ]),

  // ── Углубление: 3.exf5 e4 Ne5 Nf6 с развитием ──────────────────────────
  ...exp('e4 e5 Nf3 f5 exf5 e4 Ne5 Nf6 Bc4', [
    ['d5 Bb3 Bd6 d4 O-O Nc3 c6 O-O',             'sharp', '🔥'],
    ['d5 Bb3 Bd6 d4 O-O O-O Nbd7 Bg5',           'common','📖'],
    ['Qe7 d4 d6 Nd3 Bxf5 Nc3 Nc6 O-O',           'sharp', '💥'],
    ['c6 Nc3 d5 Bb3 Bxf5 d3 Bd6 O-O',            'common','🧠'],
    ['d6 Nd3 Bxf5 Nc3 Nc6 O-O Qd7 Re1',          'common','⚔️'],
  ]),

  // ── Углубление 3.Nxe5 Nc6 ──────────────────────────────────────────────
  ...exp('e4 e5 Nf3 f5 Nxe5 Nc6 d4', [
    ['Nxe5 dxe5 fxe4 Nc3 Qh4+ g3 Qe7 Nxe4',      'sharp', '🎯'],
    ['Nxe5 dxe5 d6 Nc3 fxe4 Bb5+ c6 Nxe4',       'common','📖'],
    ['fxe4 Bb5 Nxe5 dxe5 Nf6 Nc3 Bc5 Bg5',       'sharp', '⚔️'],
    ['Qh4 g3 Qh3 Bg2 Qg4 Qxg4 fxg4 Nxc6',        'common','🧠'],
  ]),

  // ── Углубление 3.Nc3 отказ ─────────────────────────────────────────────
  ...exp('e4 e5 Nf3 f5 Nc3 fxe4', [
    ['Nxe4 d5 Nxe5 dxe4 Qh5+ g6 Nxg6 Nf6',       'sharp', '💥'],
    ['Nxe4 Nf6 Nxf6+ gxf6 d4 d6 Bc4 Nc6',        'common','📖'],
    ['Nxe5 Nf6 d4 d6 Nc4 Nc6 Bg5 Be7',           'common','🧠'],
    ['Nxe4 Nc6 Nxe5 Nxe5 d4 Nc6 Bc4 Nf6',        'sharp', '✨'],
  ]),
];

// =============================================================================
//  8. БУДАПЕШТСКИЙ ГАМБИТ  (1.d4 Nf6 2.c4 e5) — за чёрных
// =============================================================================
const budapestLines: SeedLine[] = [
  // ── Принятый 3.dxe5 Ng4 (главная) ───────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ng4', [
    ['Nf3 Bc5 e3 Nc6 Be2 Ngxe5 Nxe5 Nxe5',       'common','📖'],
    ['Nf3 Nc6 Bf4 Bb4+ Nbd2 Qe7 a3 Bxd2+',       'common','🧠'],
    ['Nf3 Bc5 e3 Nc6 Nc3 Ngxe5 Nxe5 Nxe5',       'common','📖'],
    ['Bf4 Nc6 Nf3 Bb4+ Nbd2 Qe7 a3 Ngxe5',       'common','⚔️'],
    ['Bf4 Nc6 Nf3 Bb4+ Nc3 Qe7 Qd5 f6',          'sharp', '🔥'],
    ['e4 Nxe5 f4 Nec6 Be3 Bb4+ Nc3 Qe7',         'sharp', '🎯'],
    ['e4 Nxe5 Nf3 Nbc6 Nc3 Bb4 Bd3 d6',          'sharp', '⚔️'],
    ['e4 h5 Be2 Bc5 Nc3 d6 h3 Nh6',              'sharp', '✨'],
    ['Qd4 d6 exd6 Nc6 Qd1 Bxd6 Nc3 O-O',         'rare',  '🎲'],
    ['Qd4 Nc6 Qxg4 Ncxe5 Qe4 d6 Nc3 Bf5',        'rare',  '🧠'],
  ]),

  // ── Главная линия 4.Bf4 ─────────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ng4 Bf4', [
    ['Nc6 Nf3 Bb4+ Nbd2 Qe7 a3 Ngxe5 axb4',      'sharp', '🔥'],
    ['g5 Bg3 Bg7 Nf3 Nc6 Nc3 Ngxe5 Nxe5',        'sharp', '💥'],
    ['Bb4+ Nd2 Nc6 Ngf3 Qe7 a3 Ngxe5 axb4',      'common','📖'],
    ['Nc6 Nf3 Bc5 e3 Ngxe5 Nxe5 Nxe5 Nc3',       'common','🧠'],
  ]),

  // ── Главная 4.Nf3 (развитие) ────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ng4 Nf3', [
    ['Bc5 e3 Nc6 Be2 Ngxe5 Nxe5 Nxe5 Nc3',       'common','📖'],
    ['Nc6 Bf4 Bb4+ Nbd2 Qe7 a3 Ngxe5 Nxe5',      'common','📖'],
    ['Bc5 e3 d6 exd6 Bxd6 Nc3 O-O Be2',          'common','🧠'],
    ['Bb4+ Bd2 Bxd2+ Nbxd2 Ngxe5 e3 Nxf3+ Nxf3', 'common','⚔️'],
  ]),

  // ── Фажарович: 3...Ne4 ──────────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ne4', [
    ['Nf3 Nc6 Nbd2 Nxd2 Bxd2 Qe7 a3 Nxe5',       'sharp', '🎯'],
    ['a3 Nc6 Nf3 d6 exd6 Bxd6 g3 O-O',           'common','📖'],
    ['Qc2 d5 exd6 Bxd6 g3 Nc6 Bg2 Qe7',          'sharp', '✨'],
    ['Nd2 Nxd2 Bxd2 Nc6 Nf3 d6 e3 Bf5',          'common','🧠'],
    ['Nf3 Bb4+ Nbd2 Nc6 a3 Nxd2 Bxd2 Bxd2+',     'sharp', '⚔️'],
    ['Qd5 Nc5 Nc3 Nc6 Nf3 d6 exd6 Bxd6',         'common','📖'],
  ]),

  // ── Отказ 3.d5 (пробивка) ───────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 d5', [
    ['Bc5 Nc3 d6 e4 O-O Nf3 Nbd7 Be2',           'common','🧠'],
    ['d6 Nc3 Be7 e4 O-O Nf3 Nbd7 Be2',           'common','📖'],
    ['Nxd5 cxd5 e4 Nd2 Bb4 e3 O-O Nf3',          'sharp', '🔥'],
  ]),

  // ── Отказ 3.e3 (строго) ─────────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 e3', [
    ['exd4 exd4 d6 Nc3 Be7 Nf3 O-O Be2',         'common','📖'],
    ['exd4 exd4 Bb4+ Nc3 d6 Nf3 O-O Bd3',        'common','🧠'],
  ]),

  // ── Углубление главной: 3.dxe5 Ng4 4.Nf3 Bc5 5.e3 Nc6 ───────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ng4 Nf3 Bc5 e3 Nc6', [
    ['Be2 Ngxe5 Nxe5 Nxe5 O-O d6 Nc3 O-O',       'common','📖'],
    ['Nc3 Ngxe5 Nxe5 Nxe5 Be2 O-O O-O d6',       'common','⚔️'],
    ['a3 a5 Nc3 Ngxe5 Nxe5 Nxe5 Be2 O-O',        'common','📖'],
    ['b3 Ngxe5 Nxe5 Nxe5 Bb2 O-O Be2 d6',        'common','🧠'],
  ]),

  // ── Углубление 4.Nf3 Nc6 ───────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ng4 Nf3 Nc6', [
    ['Bf4 Bb4+ Nbd2 Qe7 a3 Ngxe5 axb4 Nxf3+',    'sharp', '🔥'],
    ['Bg5 Be7 Bxe7 Qxe7 Nc3 Ngxe5 Nxe5 Nxe5',    'common','📖'],
    ['e4 Ngxe5 Nxe5 Nxe5 f4 Nec6 Be3 d6',        'sharp', '⚔️'],
  ]),

  // ── 4.Nf3 Bc5 главная линия ────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ng4 Nf3 Bc5 e3', [
    ['Nc6 Be2 Ngxe5 Nxe5 Nxe5 O-O d6 Nc3',       'common','📖'],
    ['Nc6 Nc3 Ngxe5 Nxe5 Nxe5 Be2 O-O O-O',      'common','🧠'],
    ['Nc6 a3 a5 Nc3 Ngxe5 Nxe5 Nxe5 Be2',        'common','📖'],
    ['Nxe5 Nc3 d6 Be2 O-O O-O Nbc6 Nd5',         'common','⚔️'],
    ['O-O Nc3 Nc6 Be2 Ngxe5 Nxe5 Nxe5 O-O',      'common','🧠'],
  ]),

  // ── 4.Bf4 Nc6 углубление ───────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3', [
    ['Bb4+ Nbd2 Qe7 a3 Ngxe5 Nxe5 Nxe5 e3',      'common','📖'],
    ['Bb4+ Nc3 Qe7 Qd5 Bxc3+ bxc3 Qa3 Rc1',      'sharp', '🔥'],
    ['Bc5 e3 Ngxe5 Nxe5 Nxe5 Nc3 O-O Be2',       'common','🧠'],
    ['Qe7 Qd5 Qb4+ Nc3 f6 e6 Qxb2 Qc5',          'sharp', '🎯'],
  ]),

  // ── Углубление Фажаровича ──────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ne4 Nf3', [
    ['Bb4+ Bd2 Nxd2 Nbxd2 Nc6 e3 Qe7 a3',        'common','📖'],
    ['Nc6 a3 d6 exd6 Bxd6 Nbd2 Nxd2 Qxd2',       'common','🧠'],
    ['d5 exd6 Nxd6 g3 Nc6 Bg2 Bf5 O-O',          'sharp', '✨'],
    ['Qe7 Nc3 Nxc3 bxc3 Qxe5 Nd4 Nc6 e3',        'common','⚔️'],
  ]),

  // ── 4.e4 Nxe5 с f4 ─────────────────────────────────────────────────────
  ...exp('d4 Nf6 c4 e5 dxe5 Ng4 e4 Nxe5 f4', [
    ['Nec6 Be3 Bb4+ Nc3 Qh4+ g3 Qe7 Nf3',        'sharp', '🔥'],
    ['Ng6 Nc3 Bb4 Nf3 d6 Bd3 Nc6 O-O',           'common','📖'],
    ['Ng4 h3 Nh6 Nf3 Bc5 Nc3 Nc6 Be3',           'sharp', '⚔️'],
  ]),
];

// =============================================================================
//  9. КОНТРГАМБИТ АЛБИНА  (1.d4 d5 2.c4 e5) — за чёрных
// =============================================================================
const albinLines: SeedLine[] = [
  // ── Принятый 3.dxe5 d4 (главная) ────────────────────────────────────────
  ...exp('d4 d5 c4 e5 dxe5 d4', [
    ['Nf3 Nc6 g3 Bg4 Bg2 Qd7 O-O O-O-O',         'sharp', '🔥'],
    ['Nf3 Nc6 g3 Be6 Bg2 Qd7 O-O O-O-O',         'common','📖'],
    ['Nf3 Nc6 a3 Bg4 e3 dxe3 Qxd8+ Rxd8',        'common','🧠'],
    ['Nf3 Nc6 Nbd2 Bg4 h3 Bxf3 Nxf3 Nge7',       'common','📖'],
    ['Nf3 Nc6 g3 Nge7 Bg2 Ng6 O-O Ngxe5',        'common','⚔️'],
    ['e3 Bb4+ Bd2 dxe3 Bxb4 exf2+ Ke2 fxg1=N+',  'sharp', '🎯'],
    ['e3 Nc6 exd4 Nxd4 Nf3 Bg4 Be2 Nxe2',        'sharp', '✨'],
    ['e4 Nc6 Bd3 Nge7 Nf3 Ng6 O-O Bc5',          'common','📖'],
    ['a3 Nc6 Nf3 Bg4 Nbd2 Qd7 h3 Bxf3',          'rare',  '🎲'],
    ['Nf3 c5 Nbd2 Nc6 g3 Nge7 Bg2 Ng6',          'common','🧠'],
  ]),

  // ── Главная линия 4.Nf3 Nc6 5.g3 (Spraggett) ───────────────────────────
  ...exp('d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3', [
    ['Bg4 Bg2 Qd7 O-O O-O-O Nbd2 h5 Ng5',        'sharp', '🔥'],
    ['Be6 Bg2 Qd7 O-O O-O-O Nbd2 Nf6 Nb3 h6',    'sharp', '💥'],
    ['Nge7 Bg2 Ng6 O-O Ngxe5 Nxe5 Nxe5 Nd2',     'common','📖'],
    ['Bf5 Bg2 Qd7 O-O O-O-O Nbd2 Nge7 Nb3',      'common','⚔️'],
    ['Bg4 Bg2 Qd7 Nbd2 O-O-O h3 Bxf3 Nxf3',      'common','🧠'],
  ]),

  // ── Подрыв 4.Nf3 Nc6 5.a3 (прегамбит) ───────────────────────────────────
  ...exp('d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 a3', [
    ['Bg4 Nbd2 Qd7 h3 Bxf3 Nxf3 O-O-O g3',       'common','📖'],
    ['Nge7 b4 Ng6 Bb2 Bxb4 axb4 Nxb4 Qa4+',      'sharp', '⚔️'],
    ['a5 Bg5 Qd7 Nbd2 Nge7 e3 Ng6 Bh4',          'common','🧠'],
  ]),

  // ── Отказ 3.cxd5 (неправильно) ──────────────────────────────────────────
  ...exp('d4 d5 c4 e5 cxd5', [
    ['exd4 Nf3 Nf6 Nxd4 Nxd5 Nc3 Nxc3 bxc3',     'common','📖'],
    ['Qxd5 Nf3 exd4 Nxd4 Nf6 Nc3 Bb4 Bd2 Bxc3',  'common','🧠'],
  ]),

  // ── Отказ 3.e3 (солидно) ────────────────────────────────────────────────
  ...exp('d4 d5 c4 e5 e3', [
    ['exd4 exd4 dxc4 Bxc4 Nc6 Nf3 Nf6 O-O',      'common','📖'],
    ['exd4 exd4 Nf6 Nc3 Bb4 Nf3 O-O Bd3',        'common','🧠'],
    ['exd4 cxd5 Qxd5 exd4 Nf6 Nf3 Nc6 Nc3',      'common','⚔️'],
  ]),

  // ── Отказ 3.Nf3 (стандарт) ──────────────────────────────────────────────
  ...exp('d4 d5 c4 e5 Nf3', [
    ['e4 Ne5 Nf6 g3 Bd6 Bg2 O-O cxd5 Bxe5',      'sharp', '🔥'],
    ['exd4 Nxd4 dxc4 Qa4+ Nc6 Nxc6 bxc6 Qxc4',   'common','📖'],
    ['dxc4 e3 exd4 Bxc4 dxe3 Bxe3 Nf6 Nc3',      'common','🧠'],
  ]),

  // ── Углубление 4.Nf3 Nc6 5.Nbd2 ─────────────────────────────────────────
  ...exp('d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 Nbd2', [
    ['Bg4 h3 Bxf3 Nxf3 Nge7 g3 Ng6 Bg2',         'common','📖'],
    ['Qe7 g3 Bg4 Bg2 O-O-O h3 Bxf3 Nxf3',        'sharp', '⚔️'],
    ['Nge7 g3 Ng6 Bg2 Ngxe5 Nxe5 Nxe5 O-O',      'common','🧠'],
  ]),

  // ── Углубление 4.e4 (отказ рекапом) ─────────────────────────────────────
  ...exp('d4 d5 c4 e5 dxe5 d4 e4', [
    ['Nc6 Nf3 Bg4 Bd3 Nge7 O-O Ng6 Bf4',         'common','📖'],
    ['Nc6 Bd3 Nge7 Nf3 Ng6 O-O Bc5 Bg5',         'common','🧠'],
    ['Bb4+ Bd2 Bxd2+ Nxd2 Nc6 Ngf3 Nge7 Bd3',    'common','⚔️'],
  ]),

  // ── Главная 5.g3 с Bg4 и углублением ───────────────────────────────────
  ...exp('d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3 Bg4 Bg2', [
    ['Qd7 O-O O-O-O Nbd2 Nge7 Nb3 Ng6 Nfxd4',    'sharp', '🔥'],
    ['Qd7 Nbd2 O-O-O Nb3 Nge7 h3 Bh5 g4',        'sharp', '💥'],
    ['Nge7 O-O Ng6 Nbd2 Ngxe5 Nxe5 Nxe5 Nb3',    'common','📖'],
    ['Qd7 O-O Nge7 b4 Nxb4 Bb2 Nbc6 Nxd4',       'sharp', '⚔️'],
    ['Qd7 Nbd2 Nge7 h3 Bh5 g4 Bg6 Nxd4',         'sharp', '🎯'],
  ]),

  // ── 5.Nf3 Nc6 6.Nbd2 расширение ────────────────────────────────────────
  ...exp('d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 Nbd2', [
    ['Bg4 h3 Bxf3 Nxf3 Nge7 g3 Ng6 Bg2',         'common','📖'],
    ['Nge7 g3 Ng6 Bg2 Ngxe5 Nxe5 Nxe5 O-O',      'common','🧠'],
    ['Nge7 g3 Ng6 Bg2 Bg4 O-O Qd7 h3',           'common','📖'],
    ['Be6 g3 Nge7 Bg2 Ng6 O-O Qd7 Nb3',          'common','⚔️'],
    ['f6 g3 Bg4 Bg2 fxe5 h3 Bxf3 Nxf3',          'rare',  '🎲'],
  ]),

  // ── 5.a3 вариант ───────────────────────────────────────────────────────
  ...exp('d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 a3', [
    ['Nge7 Nbd2 Ng6 h3 Ngxe5 Nxe5 Nxe5 Qc2',     'common','📖'],
    ['Bg4 Nbd2 Qd7 h3 Bxf3 Nxf3 O-O-O g3',       'common','🧠'],
    ['Be6 Nbd2 Nge7 e3 Ng6 exd4 Ncxd4 Nxd4',     'rare',  '🎲'],
    ['Nge7 b4 Ng6 Bb2 Bxb4 axb4 Nxb4 Qa4+',      'sharp', '⚔️'],
  ]),

  // ── Главная 5.Nbd2 c опытом ────────────────────────────────────────────
  ...exp('d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 Nbd2 Qe7 g3', [
    ['Bg4 Bg2 O-O-O h3 Bxf3 Nxf3 Nxe5 Nxe5',     'sharp', '✨'],
    ['Bf5 Bg2 O-O-O Nb3 h5 Bf4 g5 Bd2',          'sharp', '🔥'],
    ['Bg4 Bg2 Nf6 O-O O-O-O h3 Bxf3 Nxf3',       'common','📖'],
  ]),
];

// =============================================================================
//  10. ГАМБИТ БЛЭКМАРА-ДИМЕРА  (1.d4 d5 2.e4) — за белых
// =============================================================================
const bdgLines: SeedLine[] = [
  // ── Принятый 2...dxe4 3.Nc3 Nf6 4.f3 (главная) ──────────────────────────
  ...exp('d4 d5 e4 dxe4 Nc3 Nf6 f3', [
    ['exf3 Nxf3 Bg4 h3 Bxf3 Qxf3 c6 Bd3',        'sharp', '🔥'],
    ['exf3 Nxf3 e6 Bd3 Be7 O-O O-O Qe1',         'common','📖'],
    ['exf3 Nxf3 g6 Bc4 Bg7 O-O O-O Qe1',         'common','⚔️'],
    ['exf3 Nxf3 Nc6 Bd3 e6 O-O Be7 Qe1',         'common','🧠'],
    ['exf3 Nxf3 Bf5 Bd3 Bxd3 Qxd3 e6 O-O',       'common','📖'],
    ['exf3 Nxf3 Bg4 h3 Bh5 g4 Bg6 Ne5',          'sharp', '💥'],
    ['Bf5 fxe4 Nxe4 Nxe4 Bxe4 Nf3 e6 Bd3',       'common','📖'],
    ['exf3 Nxf3 Nbd7 Bg5 h6 Bh4 c6 Bd3',         'common','🧠'],
    ['Nc6 fxe4 e5 d5 Nd4 Be3 Bc5 Bxd4',          'sharp', '🎯'],
    ['exf3 Qxf3 Nc6 Bb5 Bd7 Bxc6 Bxc6 Qf2',      'common','📖'],
  ]),

  // ── Принятый с Bg4 (Gunderam) ───────────────────────────────────────────
  ...exp('d4 d5 e4 dxe4 Nc3 Nf6 f3 Bf5', [
    ['fxe4 Nxe4 Nxe4 Bxe4 Nf3 e6 Bd3 Bxd3',      'common','📖'],
    ['g4 Bg6 g5 Nfd7 Nxe4 e5 Nf6+ Nxf6',         'sharp', '🔥'],
    ['Bd3 e6 fxe4 Bxe4 Bxe4 Nxe4 Nxe4 Qxd4',     'common','🧠'],
    ['fxe4 Bxe4 Nf3 e6 Bd3 Bxd3 Qxd3 c6',        'common','📖'],
  ]),

  // ── Zeller / Lamb: 4...e3 ───────────────────────────────────────────────
  ...exp('d4 d5 e4 dxe4 Nc3 Nf6 f3 e3', [
    ['Bxe3 e6 Bd3 Be7 Nge2 O-O O-O Nc6',         'common','📖'],
    ['Bxe3 c6 Qd2 Bf5 Bd3 Bxd3 Qxd3 e6',         'common','🧠'],
    ['Bxe3 g6 Qd2 Bg7 O-O-O O-O Bh6 Nbd7',       'common','⚔️'],
  ]),

  // ── 4...c6 (Caro-Kann подобное) ─────────────────────────────────────────
  ...exp('d4 d5 e4 dxe4 Nc3 Nf6 f3 c6', [
    ['fxe4 e5 d5 cxd5 Nxd5 Nxd5 Qxd5 Qe7',       'sharp', '✨'],
    ['fxe4 Bg4 Be2 e6 Bxg4 Nxg4 Qxg4 Qxd4',      'sharp', '⚔️'],
  ]),

  // ── Отказ 2...e6 (French-подобное) ──────────────────────────────────────
  ...exp('d4 d5 e4 e6 Nc3', [
    ['Nf6 e5 Nfd7 f4 c5 Nf3 Nc6 Be3',            'common','📖'],
    ['dxe4 f3 exf3 Nxf3 Nf6 Bd3 Be7 O-O',        'sharp', '🔥'],
    ['Bb4 e5 c6 a3 Bxc3+ bxc3 b6 f4',            'common','🧠'],
    ['Nf6 exd5 exd5 Nf3 Bd6 Bd3 O-O O-O',        'common','📖'],
  ]),

  // ── Отказ 2...c6 (Caro) ─────────────────────────────────────────────────
  ...exp('d4 d5 e4 c6 Nc3', [
    ['dxe4 f3 exf3 Nxf3 Bg4 Bc4 e6 O-O',         'common','📖'],
    ['dxe4 Nxe4 Nf6 Nxf6+ exf6 Nf3 Bd6 Bd3',     'common','🧠'],
    ['Nf6 exd5 cxd5 Nf3 Nc6 Bf4 Bf5 Bd3',        'common','📖'],
  ]),

  // ── Отказ 2...Nf6 (Teichmann) ───────────────────────────────────────────
  ...exp('d4 d5 e4 Nf6', [
    ['e5 Nfd7 f4 c5 Nf3 Nc6 Be3 cxd4',           'common','📖'],
    ['exd5 Nxd5 c4 Nb4 a3 N4c6 d5 Nd4',          'common','⚔️'],
    ['Nc3 dxe4 f3 exf3 Nxf3 Bg4 Bc4 e6',         'sharp', '🔥'],
  ]),

  // ── 4...Bg4 (главная линия Pietrowsky) ──────────────────────────────────
  ...exp('d4 d5 e4 dxe4 Nc3 Nf6 f3 Bg4', [
    ['fxg4 Nxg4 Nh3 e6 Be3 Bd6 Qd2 O-O',         'sharp', '💥'],
    ['Be3 e6 Bd3 Nc6 Nge2 Bb4 O-O Bxc3',         'common','📖'],
    ['fxe4 Bxd1 Nxd1 e6 Bd3 Bb4+ Nc3 Nc6',       'rare',  '🎲'],
  ]),

  // ── Главная 4.f3 exf3 5.Nxf3 с углублением ──────────────────────────────
  ...exp('d4 d5 e4 dxe4 Nc3 Nf6 f3 exf3 Nxf3', [
    ['Bg4 h3 Bxf3 Qxf3 c6 Bd3 e6 Bg5',           'common','📖'],
    ['Bg4 h3 Bh5 Bc4 e6 O-O Bd6 Qe1',            'sharp', '🔥'],
    ['e6 Bg5 Be7 Bd3 O-O Qe2 c6 O-O-O',          'common','🧠'],
    ['g6 Bc4 Bg7 O-O O-O Qe1 Nc6 Qh4',           'sharp', '⚔️'],
    ['Nc6 Bb5 Bg4 Bxc6+ bxc6 h3 Bxf3 Qxf3',      'common','📖'],
    ['Bf5 Bd3 Bxd3 Qxd3 c6 O-O e6 Bg5',          'common','🧠'],
    ['Bg4 Be2 e6 O-O Nc6 h3 Bxf3 Bxf3',          'common','📖'],
    ['c6 Bd3 Bg4 Be3 e6 O-O Bxf3 Rxf3',          'rare',  '🎲'],
    ['Nc6 Bd3 e6 O-O Be7 Qe1 O-O Qh4',           'sharp', '✨'],
    ['e6 Bd3 c5 O-O cxd4 Nxd4 Be7 Bg5',          'sharp', '🎯'],
  ]),

  // ── Углубление 4.f3 Bf5 ────────────────────────────────────────────────
  ...exp('d4 d5 e4 dxe4 Nc3 Nf6 f3 Bf5 fxe4', [
    ['Nxe4 Nxe4 Bxe4 Nf3 e6 Bd3 Bxd3 Qxd3',      'common','📖'],
    ['Bxe4 Nxe4 Nxe4 Nf3 e6 Bd3 Nf6 O-O',        'common','🧠'],
    ['Nxe4 Bd3 Nxc3 Bxf5 Nxd1 Kxd1 e6 Bd3',      'sharp', '⚔️'],
    ['Nxe4 Qf3 Nxc3 bxc3 e6 Bd3 Bxd3 Qxd3',      'common','📖'],
  ]),

  // ── Углубление 2...e6 ─────────────────────────────────────────────────
  ...exp('d4 d5 e4 e6 Nc3 Nf6', [
    ['exd5 exd5 Bg5 Bd6 Bd3 O-O Nge2 Re8',       'common','📖'],
    ['Bg5 Bb4 Nge2 dxe4 a3 Bxc3+ Nxc3 c5',       'common','🧠'],
    ['e5 Nfd7 f4 c5 Nf3 Nc6 Be3 cxd4',           'common','📖'],
    ['exd5 Nxd5 Nxd5 exd5 Bd3 Bd6 Nf3 O-O',      'common','⚔️'],
  ]),

  // ── Углубление 2...c6 ─────────────────────────────────────────────────
  ...exp('d4 d5 e4 c6 Nc3 dxe4 Nxe4', [
    ['Nf6 Nxf6+ exf6 Nf3 Bd6 Bd3 O-O O-O',       'common','📖'],
    ['Bf5 Ng3 Bg6 h4 h6 Nf3 Nf6 Ne5',            'common','🧠'],
    ['Nd7 Nf3 Ngf6 Nxf6+ Nxf6 Bd3 Bg4 c3',       'common','📖'],
    ['Nd7 Bc4 Ngf6 Ng5 e6 Qe2 Nb6 Bb3',          'sharp', '🔥'],
  ]),
];

// =============================================================================
//  11. ГАМБИТ ГЁРИНГА  (1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.c3) — за белых
// =============================================================================
const goeringLines: SeedLine[] = [
  // ── Принятый 4...dxc3 5.Nxc3 (две пешки) ───────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 dxc3 Nxc3', [
    ['d6 Bc4 Be7 O-O Nf6 Qb3 O-O Nd5',           'common','📖'],
    ['d6 Bc4 Nf6 Nd5 Nxd5 exd5 Ne7 Bg5',         'sharp', '🔥'],
    ['Nf6 e5 Ne4 Qd5 Nxc3 bxc3 Nxe5 Qxe5+',      'sharp', '⚔️'],
    ['Bb4 Bc4 d6 O-O Nf6 Qb3 Bxc3 bxc3',         'common','📖'],
    ['Bc5 Bc4 d6 Qb3 Qd7 Ng5 Nh6 f4',            'sharp', '🎯'],
    ['Nf6 Bc4 d6 O-O Be7 Qb3 O-O Nd5',           'common','🧠'],
    ['Bb4 Bc4 Nf6 O-O d6 Bg5 h6 Bxf6',           'common','📖'],
    ['d6 Bc4 Bg4 O-O Nf6 h3 Bxf3 Qxf3',          'common','⚔️'],
    ['Nf6 e5 Ng4 Bc4 Ngxe5 Nxe5 Nxe5 Bxf7+',     'sharp', '💥'],
  ]),

  // ── Принятый 4...dxc3 5.Bc4 (как Датский) ──────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 dxc3 Bc4', [
    ['cxb2 Bxb2 d6 O-O Nf6 Nc3 Be7 Qb3',         'sharp', '🎯'],
    ['Nf6 Nxc3 d6 O-O Be7 Qb3 O-O Nd5',          'common','📖'],
    ['Bb4+ Nxc3 d6 O-O Nf6 Qb3 Qd7 Ng5',         'common','🧠'],
    ['d6 Nxc3 Nf6 O-O Be7 Qb3 O-O Bg5',          'common','📖'],
    ['Be7 Nxc3 d6 O-O Nf6 Qb3 O-O Bg5',          'common','⚔️'],
  ]),

  // ── Отказ 4...d5 (главная) ──────────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 d5', [
    ['exd5 Qxd5 cxd4 Nf6 Nc3 Bb4 Bd2 Bxc3',      'common','📖'],
    ['exd5 Qxd5 cxd4 Bg4 Be2 O-O-O Nc3 Qa5',     'common','🧠'],
    ['exd5 Qxd5 cxd4 Nf6 Nc3 Qa5 Bd2 Bb4',       'common','📖'],
    ['exd5 Qxd5 cxd4 Nf6 Nc3 Bg4 Be2 Bxf3',      'common','⚔️'],
    ['cxd4 Nf6 Nc3 Bb4 exd5 Nxd5 Bd2 Nxc3',      'common','🧠'],
  ]),

  // ── Отказ 4...Nf6 (быстрое развитие) ────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 Nf6', [
    ['e5 Nd5 cxd4 d6 Bb5 Bd7 Nc3 Nxc3',          'common','📖'],
    ['e5 Nd5 Bc4 Nb6 Bb3 d6 Nxd4 Nxd4',          'common','🧠'],
    ['cxd4 Nxe4 Bd3 d5 Nc3 Bb4 Bd2 Bxc3',        'common','📖'],
    ['cxd4 d5 e5 Ne4 Bd3 Bb4+ Nbd2 O-O',         'common','⚔️'],
  ]),

  // ── Главная атака: dxc3 Nxc3 d6 Bc4 Bg4 ─────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 dxc3 Nxc3 d6 Bc4 Bg4', [
    ['O-O Nf6 h3 Bxf3 Qxf3 Be7 Rd1 O-O',         'common','📖'],
    ['h3 Bxf3 Qxf3 Nf6 O-O Be7 Rd1 O-O',         'common','🧠'],
    ['Nd5 Nf6 Nxc7+ Kd7 Nxa8 Qxa8 O-O Nxe4',     'sharp', '💥'],
  ]),

  // ── Главная: dxc3 Nxc3 Bb4 Bc4 ──────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 dxc3 Nxc3 Bb4 Bc4', [
    ['Nf6 e5 d5 exf6 dxc4 Qxd8+ Nxd8 fxg7',      'sharp', '🔥'],
    ['d6 O-O Nf6 Qb3 Qd7 Nd5 Nxd5 Bxd5',         'common','📖'],
    ['Nf6 Bg5 Bxc3+ bxc3 h6 Bxf6 Qxf6 O-O',      'common','⚔️'],
  ]),

  // ── Главная: cxd4 (отказ после Nxd4) ────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 Nxd4', [
    ['Nf6 Nc3 Bb4 Nxc6 bxc6 Bd3 d5 exd5',        'common','📖'],
    ['Nf6 Nxc6 bxc6 e5 Nd5 Bd3 d6 O-O',          'common','🧠'],
  ]),

  // ── Углубление dxc3 Nxc3 d6 Bc4 ────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 dxc3 Nxc3 d6 Bc4', [
    ['Be7 O-O Nf6 Qb3 O-O Nd5 Nxd5 Bxd5',        'common','📖'],
    ['Nf6 Qb3 Qe7 O-O Be6 Bxe6 fxe6 Nd5',        'sharp', '🔥'],
    ['Be6 Bxe6 fxe6 Qb3 Qd7 Ng5 Nd8 O-O',        'common','🧠'],
    ['Bg4 Bxf7+ Kxf7 Ng5+ Ke8 Qb3 Qd7 O-O',      'sharp', '💥'],
    ['Nf6 O-O Be7 Bg5 h6 Bh4 O-O Qb3',           'common','📖'],
    ['a6 O-O Nf6 Bg5 Be7 Qb3 Qd7 Nd5',           'common','⚔️'],
    ['Be7 Qb3 Nf6 Ng5 O-O Bxf7+ Rxf7 Nxf7',      'sharp', '🎯'],
  ]),

  // ── Углубление dxc3 Nxc3 Nf6 ───────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 dxc3 Nxc3 Nf6', [
    ['Bc4 d6 O-O Be7 Bg5 O-O Qb3 h6',            'common','📖'],
    ['e5 Nd5 Qd4 Nxc3 Qxc3 d6 exd6 Bxd6',         'common','🧠'],
    ['Bc4 Bb4 O-O O-O e5 d5 exf6 Qxf6',          'sharp', '✨'],
    ['Bc4 Bc5 O-O d6 Bg5 h6 Bh4 O-O',            'common','📖'],
    ['Bg5 Be7 e5 Ne4 Bxe7 Qxe7 Nxe4 d6',         'rare',  '🎲'],
    ['Qb3 d5 exd5 Na5 Qa4+ c6 dxc6 Nxc6',        'sharp', '⚔️'],
  ]),

  // ── Углубление d5 главная ──────────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 d5 exd5 Qxd5 cxd4', [
    ['Nf6 Nc3 Bg4 Be2 O-O-O O-O Qa5 Nd5',        'common','📖'],
    ['Bg4 Nc3 Bb4 Be2 Bxf3 Bxf3 Nf6 O-O',          'sharp', '🔥'],
    ['Nf6 Nc3 Qa5 Bd2 Qc5 Be2 Be7 O-O',          'common','🧠'],
    ['Nf6 Nc3 Bb4 Bd2 Bxc3 Bxc3 Qa5 Qc2',        'common','📖'],
  ]),

  // ── Углубление Bc4 главная ─────────────────────────────────────────────
  ...exp('e4 e5 Nf3 Nc6 d4 exd4 c3 dxc3 Bc4 Nf6', [
    ['Nxc3 d6 O-O Be7 Qb3 Qd7 Ng5 Ne5',          'common','📖'],
    ['Nxc3 Bc5 Ng5 O-O Bxf7+ Rxf7 Nxf7 Kxf7',    'sharp', '🎯'],
    ['Nxc3 Bb4 O-O O-O e5 Ne4 Qc2 Nxc3',         'sharp', '🔥'],
  ]),
];

// =============================================================================
//  12. ГАМБИТ ФРОМА  (1.f4 e5) — за чёрных против Bird's
// =============================================================================
const fromsLines: SeedLine[] = [
  // ── Принятый 2.fxe5 d6 3.exd6 Bxd6 (главная) ────────────────────────────
  ...exp('f4 e5 fxe5 d6 exd6 Bxd6', [
    ['Nf3 g5 g3 g4 Nh4 Ne7 d4 Nbc6',             'sharp', '🔥'],
    ['Nf3 g5 g3 Nc6 Bg2 h5 d4 h4',               'sharp', '⚔️'],
    ['Nf3 Nf6 d4 Ng4 Qd3 Nc6 Bg5 Qd7 Nc3 h6',    'common','📖'],
    ['Nf3 Nf6 g3 Nc6 Bg2 Bg4 d3 Qd7',            'common','🧠'],
    ['Nf3 Nc6 g3 Bg4 d4 Qf6 Bg2 Nge7',           'common','📖'],
    ['g3 Nf6 Bg2 Nc6 Nf3 Ng4 O-O Nce5',          'sharp', '🎯'],
    ['Nf3 g5 d4 g4 Ne5 Bxe5 dxe5 Qxd1+',         'sharp', '💥'],
    ['Nc3 Nf6 Nf3 Nc6 g3 Bg4 Bg2 Qd7',           'common','⚔️'],
    ['e4 Nf6 Nc3 Nc6 Nf3 Bg4 d4 Bxf3',           'sharp', '✨'],
    ['d4 Nf6 Nc3 Ng4 Nf3 Nc6 h3 Nf6',            'common','📖'],
  ]),

  // ── Главная: g5 variations ─────────────────────────────────────────────
  ...exp('f4 e5 fxe5 d6 exd6 Bxd6 Nf3 g5', [
    ['g3 g4 Nh4 Ne7 d4 Nbc6 Qd3 Nf5',            'sharp', '🔥'],
    ['e4 g4 Ne5 Bxe5 Qxg4 Nf6 Qg3 Rg8',          'sharp', '💥'],
    ['d4 g4 Ng5 f5 e4 h6 Nh3 gxh3',              'sharp', '⚔️'],
    ['e4 Nc6 Bc4 Qe7 d3 Nf6 Nc3 Bg4',            'common','📖'],
    ['g3 Nc6 Bg2 h5 d4 h4 Nxh4 Rxh4',            'sharp', '✨'],
    ['d4 g4 Ne5 Bxe5 dxe5 Qxd1+ Kxd1 Nc6',       'common','🧠'],
  ]),

  // ── Отказ 2.e4 (становится KGA) ─────────────────────────────────────────
  ...exp('f4 e5 e4', [
    ['exf4 Nf3 g5 h4 g4 Ne5 Nf6 d4',             'sharp', '🔥'],
    ['exf4 Nf3 d6 d4 g5 h4 g4 Ng1',              'sharp', '⚔️'],
    ['exf4 Bc4 Qh4+ Kf1 Nf6 Nf3 Qh5 Nc3',        'common','📖'],
    ['d6 fxe5 dxe5 Nf3 Nc6 Nc3 Bc5 Bc4',         'common','🧠'],
  ]),

  // ── Главная: 2.fxe5 Nc6 ────────────────────────────────────────────────
  ...exp('f4 e5 fxe5 Nc6', [
    ['Nf3 g5 d4 g4 Ng5 h6 Nh3 gxh3',             'sharp', '🎯'],
    ['Nf3 f6 exf6 Nxf6 d4 d5 Bf4 Bd6',           'common','📖'],
    ['Nf3 d6 exd6 Bxd6 d4 g5 g3 Nf6',            'common','🧠'],
    ['d4 Qh4+ g3 Qd8 Nf3 d6 e4 dxe5',            'rare',  '🎲'],
  ]),

  // ── Главная: fxe5 d6 Nf3 dxe5 ──────────────────────────────────────────
  ...exp('f4 e5 fxe5 d6 Nf3 dxe5', [
    ['Nxe5 Nf6 Nc3 Bg4 d3 Nc6 Bg5 Qd7',          'common','📖'],
    ['e3 Nc6 Bc4 Bd6 d3 Nf6 O-O O-O',            'common','🧠'],
    ['Nxe5 Nf6 d4 Bd6 Nc3 O-O Bg5 Nbd7',         'common','⚔️'],
  ]),

  // ── Принятый, вариант Lasker: g3 ───────────────────────────────────────
  ...exp('f4 e5 fxe5 d6 exd6 Bxd6 g3', [
    ['Nf6 Bg2 Nc6 Nf3 Bg4 d3 Qd7 Nc3',           'common','📖'],
    ['Nf6 Bg2 h5 d4 h4 Nf3 hxg3 hxg3',           'sharp', '🔥'],
    ['h5 Bg2 Nf6 Nf3 Ng4 d4 Nc6 Nc3',            'sharp', '✨'],
  ]),

  // ── Контр-гамбит Гадинга (через Nf6) ───────────────────────────────────
  ...exp('f4 e5 fxe5 d6 exd6 Nf6', [
    ['dxc7 Qxc7 Nf3 Nc6 d4 Bg4 Nc3 O-O-O',       'sharp', '⚔️'],
    ['dxc7 Qxc7 d4 Nc6 Nc3 Bg4 Nf3 O-O-O',       'common','📖'],
    ['dxc7 Qxc7 Nf3 Nc6 d3 Bg4 Nbd2 Qd7',        'common','🧠'],
  ]),

  // ── Главная fxe5 d6 exd6 Bxd6 Nf3 с развитием ──────────────────────────
  ...exp('f4 e5 fxe5 d6 exd6 Bxd6 Nf3 Nf6', [
    ['d4 Ng4 g3 Nc6 Bg2 Bf5 O-O Qd7',            'common','📖'],
    ['d4 Nc6 Nc3 Bg4 g3 Qd7 Bg2 O-O-O',          'sharp', '🔥'],
    ['e4 O-O Nc3 Nc6 Bc4 Bg4 d3 Nd4',            'sharp', '✨'],
    ['d4 Ng4 Qd3 Nc6 Nc3 Nxh2 Rxh2 Bxh2',        'sharp', '🎯'],
    ['Nc3 Nc6 d4 Bg4 g3 Qd7 Bg2 O-O-O',          'common','🧠'],
    ['g3 Bg4 Bg2 Nc6 d3 Qd7 Nc3 O-O-O',          'common','📖'],
    ['d4 Nc6 Bg5 h6 Bh4 Bg4 Qd3 O-O',            'rare',  '🎲'],
  ]),

  // ── Главная fxe5 d6 Nf3 dxe5 ───────────────────────────────────────────
  ...exp('f4 e5 fxe5 d6 Nf3 dxe5 Nxe5 Nf6', [
    ['d4 Bd6 Nc3 O-O Bg5 Nbd7 e3 Nxe5',          'common','📖'],
    ['d4 Bd6 Nf3 O-O e3 Nc6 Be2 Bg4',            'common','🧠'],
    ['Nc3 Bd6 d4 O-O e3 Nc6 Nxc6 bxc6',          'sharp', '⚔️'],
    ['d4 Bd6 Nc3 O-O Bf4 Nbd7 Nxd7 Nxd7',        'common','📖'],
  ]),

  // ── Главная fxe5 Nc6 ───────────────────────────────────────────────────
  ...exp('f4 e5 fxe5 Nc6 Nf3 g5', [
    ['d4 g4 Nh4 Nxe5 dxe5 d6 exd6 Bxd6',         'sharp', '💥'],
    ['e4 g4 Ng5 h6 Nxf7 Kxf7 Bc4+ d5',           'sharp', '🔥'],
    ['d4 g4 Nfd2 Nxe5 dxe5 d6 exd6 Bxd6',        'common','📖'],
    ['d4 g4 Nfd2 Nxe5 dxe5 d6 exd6 Qxd6',        'common','🧠'],
  ]),

  // ── Углубление 3.Nf3 вместо fxe5 ───────────────────────────────────────
  ...exp('f4 e5 Nf3 exf4', [
    ['e4 Nf6 Nc3 d5 Bb5+ c6 Bc4 Nxe4',           'sharp', '🔥'],
    ['e4 g5 Nc3 Bg7 Bc4 d6 d3 Nc6',              'common','📖'],
    ['d4 Nc6 Bxf4 d6 e3 Nf6 Bd3 Bg4',            'common','🧠'],
  ]),

  // ── Отказ 2.e4 с углублением (KGA переход) ─────────────────────────────
  ...exp('f4 e5 e4 exf4', [
    ['Nf3 g5 h4 g4 Ne5 Nf6 d4 d6',               'sharp', '🔥'],
    ['Nf3 d6 d4 g5 h4 g4 Ng1 h5',                'sharp', '⚔️'],
    ['Bc4 Qh4+ Kf1 Nf6 Nf3 Qh5 Nc3 Nc6',         'common','📖'],
    ['Nc3 Nf6 Nf3 Bb4 Bd3 d6 O-O O-O',           'common','🧠'],
  ]),
];

// =============================================================================
//  Сборный массив
// =============================================================================

// =============================================================================
//  Сборный массив
// =============================================================================
const openings: SeedOpening[] = [
  {
    name: '📚 Авторский • Королевский гамбит',
    color: 'white',
    eco: 'C30',
    description: 'Острый классический гамбит — жертва пешки f4 за атаку на короля.',
    lines: kingsLines,
  },
  {
    name: '📚 Авторский • Гамбит Эванса',
    color: 'white',
    eco: 'C51',
    description: 'Быстрая атака в испанской/итальянской схеме — жертва пешки b4 за темп и центр.',
    lines: evansLines,
  },
  {
    name: '📚 Авторский • Датский гамбит',
    color: 'white',
    eco: 'C21',
    description: 'Две пешки за развитие и диагонали — одна из самых агрессивных схем 1.e4.',
    lines: danishLines,
  },
  {
    name: '📚 Авторский • Венский гамбит',
    color: 'white',
    eco: 'C25',
    description: 'Против e5 через Nc3 и f4 — хорошо работает против неподготовленных соперников.',
    lines: viennaLines,
  },
  {
    name: '📚 Авторский • Гамбит Смита-Морра',
    color: 'white',
    eco: 'B21',
    description: 'Жертва пешки c3 против Сицилианской — опасная инициатива в центре.',
    lines: smithMorraLines,
  },
  {
    name: '📚 Авторский • Гамбит Энглунда',
    color: 'black',
    eco: 'A40',
    description: 'За чёрных против 1.d4 — ранний Qe7 и жертва пешки за быструю атаку по ферзевому флангу.',
    lines: englundLines,
  },
  {
    name: '📚 Авторский • Латвийский гамбит',
    color: 'black',
    eco: 'C40',
    description: 'За чёрных — дерзкая f5 на втором ходу, одна из самых агрессивных схем 1.e4.',
    lines: latvianLines,
  },
  {
    name: '📚 Авторский • Будапештский гамбит',
    color: 'black',
    eco: 'A52',
    description: 'За чёрных против 1.d4 — жертва e-пешки за активную контр-игру и ранний Ng4.',
    lines: budapestLines,
  },
  {
    name: '📚 Авторский • Контргамбит Албина',
    color: 'black',
    eco: 'D08',
    description: 'За чёрных в Ферзевом гамбите — острый ответ e5 с мощным клином на d4.',
    lines: albinLines,
  },
  {
    name: '📚 Авторский • Гамбит Блэкмара-Димера',
    color: 'white',
    eco: 'D00',
    description: 'За белых — жертва e- и f-пешек за открытые линии и атаку, любимец любителей.',
    lines: bdgLines,
  },
  {
    name: '📚 Авторский • Гамбит Гёринга',
    color: 'white',
    eco: 'C44',
    description: 'За белых в Шотландской — жертва двух пешек (c3+d4) за инициативу.',
    lines: goeringLines,
  },
  {
    name: '📚 Авторский • Гамбит Фрома',
    color: 'black',
    eco: 'A02',
    description: 'За чёрных против 1.f4 — жертва e-пешки за быстрое развитие и атаку на короля.',
    lines: fromsLines,
  },
];

// ── Конвертация SAN → ChessMove[] ────────────────────────────────────────────
function sansToMoves(sans: string): ChessMove[] {
  const chess = new Chess();
  const moves: ChessMove[] = [];
  const tokens = sans.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const san = tokens[i];
    let m;
    try {
      m = chess.move(san);
    } catch {
      throw new Error(`illegal SAN at ply ${i + 1}: "${san}" (history: ${moves.map(mv => mv.san).join(' ')})`);
    }
    if (!m) throw new Error(`illegal SAN at ply ${i + 1}: "${san}"`);
    moves.push({
      san: m.san,
      from: m.from,
      to: m.to,
      fen: chess.fen(),
      color: m.color as 'w' | 'b',
    });
  }
  return moves;
}

// ── Основная логика ──────────────────────────────────────────────────────────
async function seed() {
  // 1. Валидация всех SAN-последовательностей.
  console.log('── Валидация SAN ──');
  let validated = 0;
  const bad: Array<{ opening: string; index: number; sans: string; error: string }> = [];
  for (const op of openings) {
    for (const [i, l] of op.lines.entries()) {
      try {
        const mv = sansToMoves(l.sans);
        if (mv.length < 4) throw new Error(`too short (${mv.length} plies)`);
        validated++;
      } catch (e) {
        bad.push({ opening: op.name, index: i, sans: l.sans, error: String(e) });
      }
    }
    const errs = bad.filter(b => b.opening === op.name).length;
    const ok = op.lines.length - errs;
    console.log(`  ${errs === 0 ? '✓' : '✗'} ${op.name}: ${ok}/${op.lines.length} линий`);
  }
  if (bad.length > 0) {
    console.error(`\n✗ Ошибки в ${bad.length} линиях:`);
    for (const b of bad) {
      console.error(`  [${b.opening}] #${b.index}: ${b.sans}\n    → ${b.error}`);
    }
    process.exit(1);
  }
  console.log(`\n✓ Всего валидных линий: ${validated}\n`);

  if (process.argv.includes('--dry-run')) {
    console.log('Dry-run — ничего не заливаем.');
    return;
  }

  // 2. Подключение к Supabase.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('✗ Нет NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (в .env.local или env)');
    process.exit(1);
  }
  const supa = createClient(url, key);

  // 3. Заливка.
  for (const op of openings) {
    const { data: existing } = await supa
      .from('openings')
      .select('id')
      .eq('name', op.name)
      .maybeSingle();

    if (existing) {
      console.log(`• ${op.name} — уже в БД, пропускаю.`);
      continue;
    }

    const pgnHeader =
      `[Event "Авторский дебют"]\n` +
      `[Site "chess1200"]\n` +
      `[White "chess1200"]\n` +
      `[Black "Автор"]\n` +
      `[ECO "${op.eco}"]\n` +
      `[Opening "${op.name}"]\n` +
      `[Annotator "${op.description}"]\n\n`;
    const pgnBody = op.lines[0].sans + ' *';

    const { data: ins, error: insErr } = await supa
      .from('openings')
      .insert({
        name: op.name,
        color: op.color,
        pgn: pgnHeader + pgnBody,
        eco_code: op.eco,
        total_lines: op.lines.length,
      })
      .select('id')
      .single();

    if (insErr || !ins) {
      console.error(`✗ Не удалось создать дебют "${op.name}":`, insErr?.message);
      continue;
    }

    const rows = op.lines.map((l, i) => ({
      opening_id: ins.id,
      line_index: i,
      moves: sansToMoves(l.sans),
      badge: l.badge,
      line_class: l.class,
    }));

    const { error: linesErr } = await supa.from('opening_lines').insert(rows);
    if (linesErr) {
      console.error(`✗ Дебют "${op.name}" создан, но линии не залились:`, linesErr.message);
      continue;
    }

    console.log(`✓ ${op.name}: ${rows.length} линий залито.`);
  }

  console.log('\n── Готово ──');
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Фатальная ошибка:', e);
    process.exit(1);
  });
