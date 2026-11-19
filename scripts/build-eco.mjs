// scripts/build-eco.mjs — скачивает ECO таблицы из lichess-org/chess-openings (CC0)
// и собирает src/data/eco.json: [{ eco, name, posKey, plies }] по строке на позицию.
// posKey = первые 4 поля FEN (board + side + castling + ep).
// Запуск: node scripts/build-eco.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/eco.json');

const FILES = ['a', 'b', 'c', 'd', 'e'];
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';

async function fetchTsv(letter) {
  const url = `${BASE}/${letter}.tsv`;
  console.log(`→ ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return await res.text();
}

function pgnToPosKey(pgn) {
  // strip move numbers "1." "2." etc., keep SAN tokens
  const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean);
  const chess = new Chess();
  for (const s of sans) {
    try { chess.move(s); } catch { return { posKey: null, plies: 0 }; }
  }
  const posKey = chess.fen().split(' ').slice(0, 4).join(' ');
  return { posKey, plies: sans.length };
}

function parse(text) {
  const out = [];
  const lines = text.split('\n');
  let header = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (!header) { header = cols; continue; }
    const eco = cols[0];
    const name = cols[1];
    const pgn = cols[2];
    if (!eco || !name || !pgn) continue;
    const { posKey, plies } = pgnToPosKey(pgn);
    if (!posKey) continue;
    out.push({ eco, name, posKey, plies });
  }
  return out;
}

async function main() {
  const all = [];
  for (const letter of FILES) {
    const text = await fetchTsv(letter);
    const rows = parse(text);
    console.log(`  ${letter}.tsv → ${rows.length} entries`);
    all.push(...rows);
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(all, null, 0), 'utf8');
  console.log(`\nwrote ${all.length} entries → ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
