/**
 * Сицилианские дебюты: 3 открытия по 50+ линий каждое.
 *
 * Запуск:
 *   npx tsx scripts/seed-sicilian.ts             # залить/обновить в БД
 *   npx tsx scripts/seed-sicilian.ts --dry-run   # только проверить SAN
 *
 * Идемпотентность: если дебют уже есть — удаляем старые линии и заливаем новые.
 */

import { Chess } from 'chess.js';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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

type Tail = [sans: string, cls: LineClass, badge: string];
const exp = (prefix: string, tails: Tail[]): SeedLine[] =>
  tails.map(([t, c, b]) => ({ sans: `${prefix} ${t}`.replace(/\s+/g, ' ').trim(), class: c, badge: b }));

// =============================================================================
//  1. СИЦИЛИАНСКАЯ: НАЙДОРФ (1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6)
// =============================================================================
const najdorfLines: SeedLine[] = [
  // ── 6.Be3 Английская атака ─────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3', [
    ['e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O',               'common', '📖'],
    ['e5 Nb3 Be6 f3 Nbd7 Qd2 h5 O-O-O Qc7',          'sharp',  '🔥'],
    ['e5 Nb3 Be6 f3 h5 Qd2 Nbd7 O-O-O Rc8',          'sharp',  '⚔️'],
    ['e5 Nb3 Be6 Qd2 Nbd7 f3 h5 O-O-O Qc7',          'common', '📖'],
    ['e5 Nf3 Qc7 a4 Be7 Be2 O-O O-O b5',             'common', '🧠'],
    ['e6 f3 b5 Qd2 Nbd7 g4 h6 O-O-O Bb7',            'sharp',  '🔥'],
    ['e6 f3 b5 g4 h6 Qd2 Nbd7 O-O-O Bb7',            'sharp',  '⚔️'],
    ['e6 f3 b5 Qd2 Bb7 g4 Nfd7 O-O-O Nc6',           'sharp',  '💥'],
    ['Ng4 Bg5 h6 Bh4 g5 Bg3 Bg7 h3 Ne5',             'rare',   '🎲'],
    ['Ng4 Bc1 Nf6 h3 e5 Nf3 Be7 Be2 O-O',            'rare',   '🧠'],
    ['Nbd7 f3 b5 Qd2 Bb7 g4 h6 O-O-O Rc8',           'common', '🧠'],
    ['Nc6 Nxc6 bxc6 e5 dxe5 Qxd8+ Kxd8 f4',          'rare',   '🎲'],
  ]),

  // ── 6.Bg5 Вариант Опоценского + Отравленная пешка ──────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4', [
    ['Be7 Qf3 Qc7 O-O-O Nbd7 g4 b5 Bxf6 Nxf6',       'common', '📖'],
    ['Be7 Qf3 Qc7 O-O-O Nbd7 Be2 b5 Bxf6 gxf6',      'common', '⚔️'],
    ['Be7 Qf3 h6 Bh4 Qc7 O-O-O Nbd7 Be2 Rb8',        'common', '📖'],
    ['Qb6 Qd2 Qxb2 Rb1 Qa3 f5 Nc6 fxe6 fxe6',        'sharp',  '🔥'],
    ['Qb6 Qd2 Qxb2 Nb3 Nc6 Bxf6 gxf6 Be2 Nd4',        'sharp',  '💥'],
    ['Qb6 Qd2 Qxb2 Rb1 Qa3 e5 dxe5 fxe5 Nfd7',       'sharp',  '✨'],
    ['b5 e5 dxe5 fxe5 Qc7 exf6 Qe5+ Be2 Qxg5',       'sharp',  '🎯'],
    ['Nbd7 Qf3 Qc7 O-O-O b5 Bxf6 Nxf6 e5 dxe5',      'sharp',  '🔥'],
    ['Nbd7 Qe2 Qc7 O-O-O b5 e5 Bb7 Qg4 h5',          'sharp',  '⚔️'],
    ['h6 Bh4 Qb6 Qd2 Qxb2 Rb1 Qa3 e5 dxe5',          'sharp',  '🔥'],
  ]),

  // ── 6.Be2 Классика / Опоценский ────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2', [
    ['e5 Nb3 Be7 O-O O-O Be3 Be6 Nd5 Nbd7',          'common', '📖'],
    ['e5 Nb3 Be7 O-O O-O f4 exf4 Bxf4 Nc6',          'common', '⚔️'],
    ['e5 Nb3 Be6 O-O Be7 Be3 O-O f4 exf4',           'common', '📖'],
    ['e5 Nb3 Be7 Bg5 Nbd7 a4 b6 O-O Bb7',            'common', '🧠'],
    ['e6 O-O Be7 f4 O-O Be3 Nc6 a4 Qc7',             'common', '📖'],
    ['e6 O-O Be7 f4 O-O Kh1 Nc6 Be3 Qc7',            'common', '🧠'],
    ['Nbd7 O-O e5 Nb3 Be7 Be3 O-O f3 b5',            'common', '📖'],
    ['Nc6 O-O e5 Nb3 Be7 Be3 O-O Nd5 Nxd5 exd5',     'rare',   '🎲'],
  ]),

  // ── 6.Bc4 Атака Созина-Фишера ──────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bc4', [
    ['e6 Bb3 b5 O-O Be7 Qf3 Qb6 Be3 Nc6 Nxc6',       'common', '📖'],
    ['e6 Bb3 b5 f4 Bb7 e5 dxe5 fxe5 Nfd7',             'sharp',  '🔥'],
    ['e6 Bb3 Nbd7 Bg5 h6 Bxf6 Nxf6 O-O Be7 Qe2',     'common', '⚔️'],
    ['e6 Bb3 b5 O-O Bb7 Re1 Nbd7 Bg5 Be7 Qe2',       'common', '📖'],
    ['e6 Bb3 Be7 Qe2 O-O Be3 b5 Bg5 Nbd7 O-O-O',     'common', '🧠'],
    ['e6 Bb3 b5 Bg5 Be7 Qf3 Qc7 O-O-O Nbd7 g4',      'sharp',  '⚔️'],
    ['e6 Bb3 Nc6 Nxc6 bxc6 O-O Be7 f4 O-O Qf3',      'rare',   '🎲'],
  ]),

  // ── 6.f3 Перспектива Английской атаки / Пёрени ────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 f3', [
    ['e5 Nb3 Be7 Be3 Be6 Qd2 Nbd7 O-O-O O-O g4',     'common', '📖'],
    ['e6 Be3 b5 g4 h6 Qd2 Nbd7 O-O-O Bb7 h4',        'sharp',  '🔥'],
    ['e6 Be3 b5 g4 Nfd7 Qd2 Nb6 O-O-O N8d7 Kb1',     'sharp',  '💥'],
    ['e5 Nb3 Be6 Be3 Nbd7 Qd2 h5 O-O-O Rc8 Kb1',     'sharp',  '⚔️'],
    ['b5 g4 e5 Nf5 g6 Ne3 Bb7 Bg2 Nbd7 Qd2',         'rare',   '🎲'],
  ]),

  // ── 6.f4 ───────────────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 f4', [
    ['e5 Nf3 Nbd7 a4 Qc7 Bd3 Be7 O-O O-O Kh1',       'common', '📖'],
    ['e5 Nb3 Be7 Qf3 Qc7 Bd3 Nbd7 O-O b5 a3',        'common', '⚔️'],
    ['e5 Nf5 g6 Ne3 Bg7 f5 O-O Qd2 Nbd7 g4',         'sharp',  '🔥'],
    ['e6 Qf3 Qc7 Bd3 Nc6 Nxc6 bxc6 O-O Be7 Kh1',    'common', '🧠'],
    ['Nc6 Nxc6 bxc6 e5 Nd7 Qf3 Qc7 Bd3 e6 O-O',      'rare',   '🎲'],
    ['Qc7 Bd3 Nbd7 O-O g6 Be3 Bg7 Qf3 b5 a3',        'common', '📖'],
  ]),

  // ── 6.h3 Атака Адамса ──────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 h3', [
    ['e5 Nde2 h5 g3 Nbd7 Bg2 b5 a4 b4 Nd5',          'common', '📖'],
    ['e6 g4 h6 Bg2 Nc6 Be3 Nxd4 Qxd4 e5 Qd2',        'sharp',  '🔥'],
    ['e5 Nde2 Nbd7 g4 h6 Ng3 Nb6 Be3 Be6 Qf3',       'common', '⚔️'],
    ['Nc6 g4 Nxd4 Qxd4 e5 Qd3 h5 g5 Nd7 Be3',        'rare',   '🧠'],
    ['e5 Nb3 Be7 g4 b5 a3 Bb7 Bg2 Nbd7 Qe2',         'sharp',  '✨'],
  ]),

  // ── 6.g3 Фианкетто ─────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 g3', [
    ['e5 Nde2 Be7 Bg2 Nbd7 O-O O-O a4 b6',           'common', '📖'],
    ['e5 Nb3 Be7 Bg2 Be6 O-O Nbd7 a4 Rc8 Be3',       'common', '🧠'],
    ['Nc6 Bg2 Bd7 Nxc6 Bxc6 O-O g6 Nd5 Bg7 c4',      'rare',   '🎲'],
    ['e6 Bg2 Be7 O-O O-O a4 Nc6 Nb3 b6 Be3',         'common', '📖'],
  ]),

  // ── 6.a4 Анти-Найдорф ──────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 a4', [
    ['Nc6 Be2 e5 Nb3 Be7 O-O O-O Be3 Be6',           'common', '🧠'],
    ['g6 Be2 Bg7 O-O O-O Be3 Nc6 Nb3 Be6',           'common', '📖'],
    ['e5 Nb3 Be7 Be2 O-O O-O Be6 Be3 Nbd7',          'common', '📖'],
    ['e6 Be2 Be7 O-O O-O Be3 Nc6 Nb3 b6 Bf3',        'rare',   '🎲'],
  ]),

  // ── 6.Qf3 Атака Русской ────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Qf3', [
    ['e6 g4 h6 Bg2 Nbd7 Be3 b5 O-O-O Bb7',           'sharp',  '🔥'],
    ['Nbd7 g4 b5 Bg2 Bb7 Be3 Rc8 O-O-O Ne5',         'sharp',  '⚔️'],
    ['e5 Nb3 Nbd7 Bd3 Be7 O-O O-O Bg5 Nb6',          'rare',   '🧠'],
  ]),

  // ── 6.Rg1 + 6.Nb3 редкие ──────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Rg1', [
    ['e5 Nb3 Be7 g4 Nbd7 g5 Nh5 Be3 Nb6',            'rare',   '🎲'],
    ['Nc6 Be3 e5 Nb3 Be7 g4 Be6 Qd2 Rc8',            'rare',   '✨'],
  ]),
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Nb3', [
    ['e5 Be2 Be7 O-O O-O Be3 Be6 a4 Nc6',            'rare',   '🧠'],
    ['e6 Be2 Be7 O-O O-O Be3 Nc6 a4 Qc7',            'rare',   '🎲'],
  ]),
];

// =============================================================================
//  2. СИЦИЛИАНСКАЯ: УСКОРЕННЫЙ ДРАКОН (1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 g6)
// =============================================================================
const accDragonLines: SeedLine[] = [
  // ── 6.Be3 (главная атакующая) ──────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3', [
    ['Nf6 Bc4 Qa5 O-O O-O Bb3 d6 h3 Bd7',            'common', '📖'],
    ['Nf6 Bc4 O-O Bb3 d6 h3 Na5 f4 Nxb3',            'common', '⚔️'],
    ['Nf6 f3 O-O Qd2 d6 O-O-O Bd7 g4 Rc8',           'sharp',  '🔥'],
    ['Nf6 Qd2 d6 O-O-O Nxd4 Bxd4 Be6 Kb1 Qa5',       'sharp',  '💥'],
    ['Nf6 Be2 O-O O-O d6 f4 Bd7 Nb3 Rc8',            'common', '🧠'],
    ['d6 Bc4 Nf6 Bb3 O-O h3 Bd7 Qd2 Rc8',            'common', '📖'],
    ['Nxd4 Bxd4 Bxd4 Qxd4 Nf6 Bc4 O-O O-O d6',       'rare',   '🎲'],
  ]),

  // ── 6.Nxc6 Разменный ───────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Nxc6', [
    ['bxc6 e5 Nh6 Bc4 O-O O-O d6 Re1 dxe5',          'common', '📖'],
    ['bxc6 Bd3 Nh6 O-O O-O f4 d6 h3 Nf5',            'common', '🧠'],
    ['bxc6 Qd4 Nf6 e5 Nd5 Bc4 Nb6 Bb3 d6',           'rare',   '🎲'],
    ['dxc6 Qxd8+ Kxd8 Bg5+ f6 Be3 Nh6 O-O-O',        'rare',   '✨'],
  ]),

  // ── 6.Be2 ──────────────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be2', [
    ['Nf6 O-O O-O Be3 d6 f4 Bd7 Nb3 Rc8',            'common', '📖'],
    ['Nf6 O-O d6 Be3 O-O f4 Bd7 Nb3 Rc8',            'common', '⚔️'],
    ['d6 O-O Nf6 Be3 O-O Qd2 Bd7 Nb3 Rc8',           'common', '🧠'],
  ]),

  // ── 6.Bc4 Атака Фишера ─────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Bc4', [
    ['Nf6 Nxc6 bxc6 e5 Nd5 Bxd5 cxd5 Qxd5 O-O',      'sharp',  '💥'],
    ['e6 Nxc6 bxc6 O-O Ne7 Bg5 h6 Be3 O-O',          'rare',   '🧠'],
    ['Nf6 Nxc6 dxc6 Qxd8+ Kxd8 Be3 Kc7 O-O-O',       'rare',   '🎲'],
  ]),

  // ── 6.f3 Анти-Дракон ───────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 f3', [
    ['Nf6 Be3 O-O Qd2 d6 O-O-O Bd7 Kb1 Rc8',         'sharp',  '🔥'],
    ['Nf6 Be3 d6 Qd2 O-O O-O-O Bd7 g4 Rc8',          'sharp',  '⚔️'],
    ['d6 Be3 Nf6 Qd2 O-O O-O-O Bd7 h4 h5',           'sharp',  '💥'],
  ]),

  // ── 6.Nb3 ──────────────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Nb3', [
    ['Nf6 Be2 O-O O-O d6 Be3 Be6 f4 Na5',            'rare',   '🧠'],
    ['d6 Be2 Nf6 O-O O-O Be3 Be6 f4 Rc8',            'rare',   '🎲'],
  ]),

  // ── 5.c4 Мароци (главный ответ против УД) ─────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4', [
    ['Nf6 Nc3 d6 Be2 Nxd4 Qxd4 Bg7 Be3 O-O',         'common', '📖'],
    ['Nf6 Nc3 d6 Be2 Bg7 Be3 O-O O-O Bd7',           'common', '⚔️'],
    ['Nf6 Nc3 Bg7 Be3 O-O Be2 d6 O-O Bd7',           'common', '📖'],
    ['Nf6 Nc3 Nxd4 Qxd4 d6 Be2 Bg7 Be3 O-O',         'common', '🧠'],
    ['Bg7 Be3 Nf6 Nc3 O-O Be2 d6 O-O Bd7',           'common', '📖'],
    ['Bg7 Nc3 Nf6 Be2 O-O O-O d6 Be3 Bd7',           'common', '🧠'],
    ['Nf6 Nc3 d6 f3 Bg7 Be3 O-O Qd2 Nxd4',           'rare',   '🎲'],
    ['Nf6 Nc3 Bg7 Be2 O-O Be3 d6 f3 Bd7',            'common', '✨'],
    ['Nf6 Nc3 d6 Be2 Bg7 O-O O-O Be3 Bd7',           'common', '📖'],
    ['Nf6 Nc3 Bg7 Be3 d6 Be2 O-O f3 Bd7',            'rare',   '🧠'],
  ]),

  // ── 5.Be3 Гипер-УД ─────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Be3', [
    ['Bg7 Nc3 Nf6 Bc4 O-O Bb3 d6 h3 Bd7',            'common', '📖'],
    ['Bg7 c4 Nf6 Nc3 O-O Be2 d6 O-O Bd7',            'common', '⚔️'],
    ['Nf6 Nc3 Bg7 Bc4 O-O Bb3 d6 f3 Bd7',            'common', '🧠'],
  ]),

  // ── 5.Nxc6 Ранний размен ───────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nxc6', [
    ['bxc6 Qd4 Nf6 Nc3 Bg7 Bg5 O-O O-O-O d6',        'rare',   '🎲'],
    ['bxc6 Nc3 Bg7 Bc4 Nf6 Qe2 O-O O-O d6',          'rare',   '🧠'],
    ['dxc6 Qxd8+ Kxd8 Nc3 Bg7 Bg5+ f6 Be3 Kc7',      'rare',   '🎲'],
  ]),

  // ── 5.Nb3 ──────────────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nb3', [
    ['Bg7 Nc3 Nf6 Be2 O-O O-O d6 Be3 Bd7',           'rare',   '🧠'],
    ['Bg7 Be2 Nf6 Nc3 O-O O-O d6 Be3 Bd7',           'rare',   '🎲'],
  ]),

  // ── Мароци углублённый с Nxd4 ──────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6 Be2 Nxd4 Qxd4 Bg7', [
    ['Be3 O-O Qd2 Be6 Rc1 Qa5 f3 Rfc8',              'common', '📖'],
    ['Be3 O-O Qd2 Nd7 Rc1 Nc5 b3 a5',                'common', '⚔️'],
    ['Be3 O-O Qd3 Be6 O-O Qa5 Rab1 Rac8',            'common', '🧠'],
    ['Be3 O-O Qd3 a5 O-O Be6 Rab1 Nd7',              'rare',   '✨'],
    ['Bg5 h6 Be3 O-O Qd2 Be6 Rc1 Qa5',               'common', '📖'],
  ]),

  // ── Гургенидзе-стиль с ранним O-O ──────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 O-O', [
    ['Bb3 Na5 f3 d6 Qd2 Bd7 O-O-O Rc8',              'sharp',  '🔥'],
    ['Bb3 d6 f3 Bd7 Qd2 Rc8 O-O-O Ne5',              'sharp',  '⚔️'],
    ['Bb3 d6 f3 Bd7 Qd2 Nxd4 Bxd4 b5',               'sharp',  '💥'],
    ['f3 d6 Qd2 Bd7 O-O-O Rc8 Bb3 Ne5',              'sharp',  '🔥'],
  ]),

  // ── Югослав-стиль против УД (6.Be3 Nf6 7.f3) ──────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 f3', [
    ['O-O Qd2 d6 O-O-O Bd7 Kb1 Rc8 h4 h5',           'sharp',  '🔥'],
    ['d6 Qd2 O-O O-O-O Bd7 g4 Rc8 Kb1 Ne5',          'sharp',  '⚔️'],
    ['O-O Qd2 d6 O-O-O Nxd4 Bxd4 Be6 h4 Qa5',        'sharp',  '💥'],
  ]),

  // ── 6.Bg5 ──────────────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Bg5', [
    ['Nf6 Nxc6 bxc6 e5 Ng8 Bf4 h6 Nd5 Rb8',          'rare',   '🎲'],
    ['Nf6 Nb3 d6 Qd2 Be6 O-O-O Rc8 Kb1 a6',          'rare',   '🧠'],
  ]),

  // ── Мароци: с Bg7 рано ────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Bg7 Nc3 Nf6 Be3 O-O', [
    ['Be2 d6 O-O Bd7 Qd2 Nxd4 Bxd4 Bc6',             'common', '📖'],
    ['Be2 d6 f3 Nxd4 Bxd4 Bd7 Qd2 Bc6',              'common', '🧠'],
    ['f3 d6 Be2 Nxd4 Bxd4 Bd7 Qd2 Bc6',              'common', '⚔️'],
  ]),
];

// =============================================================================
//  3. СИЦИЛИАНСКАЯ: ДРАКОН (1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6)
// =============================================================================
const dragonLines: SeedLine[] = [
  // ── 6.Be3 Югославская атака с f3 (главная) ────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3', [
    ['Nc6 Qd2 O-O O-O-O d5 Kb1 Nxd4 Bxd4 Be6',       'sharp',  '🔥'],
    ['Nc6 Qd2 O-O O-O-O Bd7 Kb1 Rc8 h4 h5',          'sharp',  '⚔️'],
    ['Nc6 Qd2 O-O O-O-O Bd7 g4 Rc8 h4 Ne5',          'sharp',  '💥'],
    ['Nc6 Qd2 Bd7 O-O-O Rc8 Kb1 Ne5 h4 Nc4',         'sharp',  '🔥'],
    ['O-O Qd2 Nc6 O-O-O Bd7 g4 Ne5 h4 Nc4',          'sharp',  '✨'],
    ['O-O Qd2 Nc6 O-O-O d5 exd5 Nxd5 Nxc6 bxc6',    'sharp',  '💥'],
    ['O-O Qd2 Nc6 Nxc6 bxc6 e5 Nd7 f4 Qa5',          'sharp',  '🎯'],
    ['a6 Qd2 Nbd7 g4 h5 gxh5 Nxh5 O-O-O Ne5',        'rare',   '🎲'],
    ['Nc6 Qd2 O-O Bc4 Bd7 Bb3 Rc8 h4 Ne5',           'sharp',  '🔥'],
    ['Nc6 Qd2 O-O g4 Be6 O-O-O Nxd4 Bxd4 Qa5',       'sharp',  '⚔️'],
  ]),

  // ── 6.Be3 Bg7 7.Be2 ───────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 Be2', [
    ['Nc6 Nb3 O-O f4 Be6 g4 d5 e5 Ne4',               'sharp',  '🔥'],
    ['Nc6 Nb3 Be6 f4 O-O Qd2 Rc8 Bf3 Na5',           'common', '📖'],
    ['O-O f4 Nc6 Nb3 Be6 Bf3 Rc8 O-O Na5',           'common', '⚔️'],
    ['Nc6 Nb3 O-O O-O Be6 f4 Na5 Nxa5 Qxa5',         'rare',   '🧠'],
  ]),

  // ── 6.Be2 Классический ────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be2 Bg7', [
    ['O-O Nc6 Be3 O-O Nb3 Be6 f4 Na5 Nxa5 Qxa5',     'common', '📖'],
    ['O-O O-O Be3 Nc6 Nb3 Be6 Bf3 Rc8 Nd5',          'common', '⚔️'],
    ['O-O Nc6 Nb3 O-O Be3 Be6 f4 Rc8 f5',            'common', '🧠'],
    ['Be3 Nc6 O-O O-O Nb3 Be6 Bf3 Na5 Nxa5 Qxa5',   'common', '📖'],
    ['O-O O-O Be3 a6 f4 Nc6 Nb3 b5 Bf3',             'rare',   '🎲'],
  ]),

  // ── 6.f4 Атака Левенфиша ──────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 f4', [
    ['Bg7 Nf3 Nc6 Bd3 O-O O-O Bg4 h3 Bxf3',          'common', '📖'],
    ['Bg7 Nf3 O-O Bd3 Nc6 O-O Nd7 Be3 Nb6',          'common', '⚔️'],
    ['Nc6 Nxc6 bxc6 e5 Nd7 exd6 exd6 Bd3 Qe7',       'sharp',  '🔥'],
    ['Bg7 Bb5+ Bd7 Bxd7+ Qxd7 Nf3 O-O O-O Nc6',     'common', '🧠'],
    ['Nc6 Nxc6 bxc6 e5 Nd5 Nxd5 cxd5 Qxd5',           'sharp',  '💥'],
  ]),

  // ── 6.g3 Фианкетто ─────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 g3 Bg7', [
    ['Bg2 O-O O-O Nc6 Nde2 Bd7 h3 Qa5',              'common', '📖'],
    ['Bg2 Nc6 Nde2 O-O O-O Bd7 h3 Rc8',              'common', '🧠'],
    ['Bg2 O-O O-O a6 a4 Nc6 Nb3 Be6',                'rare',   '🎲'],
  ]),

  // ── 6.h3 ───────────────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 h3 Bg7', [
    ['Be3 O-O Qd2 Nc6 g4 Nxd4 Bxd4 Be6 O-O-O',       'sharp',  '🔥'],
    ['Be3 Nc6 Qd2 O-O O-O-O Bd7 g4 Rc8 Kb1',         'sharp',  '⚔️'],
    ['g4 O-O Bg2 Nc6 Be3 Bd7 Qd2 Rc8 O-O-O',         'sharp',  '✨'],
  ]),

  // ── 6.Bc4 (Фишер против Дракона) ──────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Bc4', [
    ['Bg7 Bb3 O-O f3 Nc6 Be3 Bd7 Qd2 Rc8',           'common', '🧠'],
    ['Bg7 Bb3 Nc6 f3 O-O Be3 Bd7 Qd2 Rc8',           'common', '📖'],
    ['Bg7 Bb3 O-O O-O Nc6 h3 Bd7 f4 Na5 Bd5',         'rare',   '🎲'],
  ]),

  // ── 6.Bg5 ──────────────────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Bg5', [
    ['Bg7 Qd2 Nc6 O-O-O Bd7 f3 O-O Kb1 Rc8',         'rare',   '🧠'],
    ['Bg7 Qd2 O-O O-O-O Nc6 Nb3 Be6 f3 Qa5',         'rare',   '🎲'],
  ]),

  // ── Югославская 9.Bc4 (главная) ───────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 Nc6 Qd2 O-O Bc4', [
    ['Bd7 Bb3 Rc8 h4 Ne5 O-O-O Nc4 Bxc4 Rxc4',       'sharp',  '🔥'],
    ['Bd7 Bb3 Rc8 h4 Nxd4 Bxd4 b5 h5 Nxh5',          'sharp',  '💥'],
    ['Bd7 Bb3 Ne5 O-O-O Rc8 Kb1 Nc4 Bxc4 Rxc4',      'sharp',  '✨'],
    ['Nxd4 Bxd4 Be6 Bb3 Qa5 O-O-O b5 Kb1 b4',        'sharp',  '🎯'],
    ['Bd7 h4 Rc8 Bb3 Ne5 O-O-O Nc4 Bxc4 Rxc4',       'sharp',  '⚔️'],
  ]),

  // ── Югославская 9.O-O-O (Китайский вариант) ───────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 Nc6 Qd2 O-O O-O-O', [
    ['d5 Qe1 e5 Nb3 Be6 Nxd5 Nxd5 exd5 Nb4',         'sharp',  '🔥'],
    ['d5 exd5 Nxd5 Nxc6 bxc6 Bd4 Bxd4 Qxd4',         'sharp',  '💥'],
    ['Nxd4 Bxd4 Be6 Kb1 Qc7 h4 Rfc8 h5 Nxh5',        'sharp',  '⚔️'],
    ['Rb8 h4 h5 Bh6 Nxe4 Qe3 Nxc3 Qxc3 Bxh6',        'sharp',  '🎯'],
  ]),

  // ── Dragadorf (Дракон + Найдорф ход a6) ──────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 a6', [
    ['Qd2 Nbd7 g4 h5 gxh5 Nxh5 O-O-O Ne5',           'rare',   '🎲'],
    ['Qd2 b5 g4 h6 h4 Nbd7 O-O-O Bb7 Kb1',           'rare',   '🧠'],
  ]),

  // ── Вариант Солтиса (h5) ──────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 Nc6 Qd2 O-O Bc4 Bd7 Bb3 Rc8 h4 h5', [
    ['O-O-O Ne5 Bg5 Rc5 f4 Nc4 Bxc4 Rxc4 g4',        'sharp',  '🔥'],
    ['O-O-O Ne5 Bh6 Nxf3 Nxf3 Rxc3 Qxc3 Nxe4',       'sharp',  '💥'],
  ]),

  // ── 6.Be3 Be2 O-O f4 ──────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 Be2 O-O f4', [
    ['Nc6 Nb3 Be6 Nd5 Rc8 c3 Na5 Nxa5 Qxa5',         'common', '🧠'],
    ['Nc6 Nb3 b6 Bf3 Bb7 Qd2 Rc8 O-O-O Qd7',         'rare',   '🎲'],
  ]),

  // ── Классический Be2 с Qd2 ────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be2 Bg7 O-O O-O Be3 Nc6', [
    ['Nb3 a5 a4 Nb4 f3 Bd7 Nd4 Rc8',                 'rare',   '🧠'],
    ['Nb3 Be6 f4 Rc8 Bf3 Na5 Nxa5 Qxa5',             'common', '📖'],
    ['Qd2 Be6 Rfd1 Rc8 h3 a6 f3 b5',                 'rare',   '🎲'],
  ]),

  // ── Югославская 9.g4 (Топаловский стиль) ──────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 Nc6 Qd2 O-O g4', [
    ['Be6 O-O-O Nxd4 Bxd4 Qa5 Kb1 Rfc8 h4',          'sharp',  '🔥'],
    ['Be6 O-O-O Nxd4 Bxd4 b5 h4 b4 Nd5',             'sharp',  '💥'],
    ['Be6 h4 Nxd4 Bxd4 Qa5 h5 Rfc8 hxg6 fxg6',       'sharp',  '✨'],
  ]),

  // ── Югославская 9.Bh6 и 9.h4 ─────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 Nc6 Qd2 O-O Bh6', [
    ['Bxh6 Qxh6 Qa5 Nxc6 bxc6 e5 Nd7 f4',            'rare',   '🧠'],
    ['Bxh6 Qxh6 Qa5 Nb3 Qc7 Bd3 Rb8 Qd2',            'rare',   '🎲'],
  ]),
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 Nc6 Qd2 Bd7 h4', [
    ['h5 Bh6 Bxh6 Qxh6 Rc8 O-O-O Ne5 Bb5',           'rare',   '🎲'],
    ['O-O Bh6 Bxh6 Qxh6 Rc8 O-O-O Ne5 Bb5',          'rare',   '🧠'],
  ]),

  // ── Be2 модерн с f4 ───────────────────────────────────────────────────────
  ...exp('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be2 Bg7 O-O O-O f4', [
    ['Nc6 Nb3 Be6 f5 Bd7 Nd5 Nxd5 exd5 Na5',         'common', '🔥'],
    ['Nc6 Nb3 Be6 Bf3 Rc8 g4 Qc7 f5 gxf5',           'sharp',  '⚔️'],
  ]),
];

// =============================================================================
//  Сборный массив
// =============================================================================
const openings: SeedOpening[] = [
  {
    name: '🐉 Авторский • Сицилианская: Найдорф',
    color: 'black',
    eco: 'B90',
    description: 'Самая популярная схема сицилианки — 5...a6 с идеей ...e5 или ...e6. Теоретически богатая, остро атакующая.',
    lines: najdorfLines,
  },
  {
    name: '⚡ Авторский • Сицилианская: Ускоренный дракон',
    color: 'black',
    eco: 'B34',
    description: 'За чёрных — ранний g6 без ...d6, против Мароци (5.c4) и других атакующих схем.',
    lines: accDragonLines,
  },
  {
    name: '🔥 Авторский • Сицилианская: Дракон',
    color: 'black',
    eco: 'B70',
    description: 'Классический Дракон с Югославской атакой и другими острыми линиями — одна из самых боевых сицилианок.',
    lines: dragonLines,
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('✗ Нет NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(1);
  }
  const supa = createClient(url, key);

  for (const op of openings) {
    const { data: existing } = await supa
      .from('openings')
      .select('id')
      .eq('name', op.name)
      .maybeSingle();

    const pgnHeader =
      `[Event "Авторский дебют"]\n` +
      `[Site "chess1200"]\n` +
      `[White "chess1200"]\n` +
      `[Black "Автор"]\n` +
      `[ECO "${op.eco}"]\n` +
      `[Opening "${op.name}"]\n` +
      `[Annotator "${op.description}"]\n\n`;
    const pgnBody = op.lines[0].sans + ' *';

    let openingId: string;

    if (existing) {
      // Обновляем: удаляем старые линии, обновляем total_lines
      await supa.from('opening_lines').delete().eq('opening_id', existing.id);
      await supa.from('openings').update({
        total_lines: op.lines.length,
        pgn: pgnHeader + pgnBody,
      }).eq('id', existing.id);
      openingId = existing.id;
      console.log(`↻ ${op.name} — обновляю (${op.lines.length} линий)`);
    } else {
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
        console.error(`✗ Не удалось создать "${op.name}":`, insErr?.message);
        continue;
      }
      openingId = ins.id;
      console.log(`+ ${op.name} — создаю (${op.lines.length} линий)`);
    }

    const rows = op.lines.map((l, i) => ({
      opening_id: openingId,
      line_index: i,
      moves: sansToMoves(l.sans),
      badge: l.badge,
      line_class: l.class,
    }));

    const { error: linesErr } = await supa.from('opening_lines').insert(rows);
    if (linesErr) {
      console.error(`✗ Линии для "${op.name}" не залились:`, linesErr.message);
      continue;
    }

    console.log(`  ✓ ${rows.length} линий залито.`);
  }

  console.log('\n── Готово ──');
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Фатальная ошибка:', e);
    process.exit(1);
  });
