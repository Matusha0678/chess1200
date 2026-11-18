import { Chess } from 'chess.js';
import { createNodeEngine } from './node-engine';
import { quickSac, analyseSac, temptingMoves } from '../src/lib/sac-logic';
import { analyseThreat } from '../src/lib/threat-logic';
import type { SacResult } from '../src/lib/sac-logic';
import type { ThreatResult } from '../src/lib/threat-logic';
import { buildSacRowsForGame } from '../src/lib/sac-prepare';
import { buildThreatRowsForGame } from '../src/lib/threat-prepare';
import type { ThreatAnalysisRow } from '../src/lib/threat-prepare';
import { uciOf } from '../src/lib/see';
import { fenAfterSac, lineSan, lineOutcome } from '../src/lib/sac-text';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const ONLY_STR = arg('--only', '');
const ONLY: string[] | null = ONLY_STR ? ONLY_STR.split(',') : null;

const SAC_TESTS = [
  {
    id: 'S1', name: 'греческая жертва',
    fen: 'r1bq1rk1/pppnbppp/2n1p3/3pP3/3P3P/2NB1N2/PPP2PP1/R1BQK2R w KQ - 0 8',
    move: 'd3h7',
    expect: { isSac: true, type: 'combination', kind: 'works', pattern: 'greek_gift', given: 2 },
  },
  {
    id: 'S2', name: 'Bxh7+, когда конь f6 защищает',
    fen: 'r1bq1rk1/ppp1bppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQK2R w KQ - 0 7',
    move: 'd3h7',
    expect: { isSac: true, kind: 'fails', pattern: 'greek_gift' },
  },
  {
    id: 'S3', name: 'размен Bxc6',
    fen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
    move: 'b5c6',
    expect: { isSac: false },
  },
  {
    id: 'S4', name: 'ход пешкой c4',
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
    move: 'c2c4',
    expect: { isSac: false },
  },
  {
    id: 'S5', name: 'ферзь за ладью с матом',
    fen: 'r3r1k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1',
    move: 'e2e8',
    expect: { isSac: true, type: 'mate', kind: 'works', mate_in: 2, pattern: 'queen' },
  },
  {
    id: 'S6', name: 'запертый слон берёт пешку',
    fen: 'r3k2r/B1p2ppp/1p6/8/8/8/1PP2PPP/3RK2R w - - 0 1',
    move: 'a7b6',
    expect: { isSac: false },
  },
];

const DECOY_TESTS = [
  {
    id: 'D1', name: 'соблазн Bxh7+ в позиции S2',
    fen: 'r1bq1rk1/ppp1bppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQK2R w KQ - 0 7',
    expect: ['d3h7'],
  },
  {
    id: 'D2', name: 'после 1.e4 e5 2.Nf3 Nc6 соблазнов нет',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    expect: [],
  },
];

const THREAT_TESTS = [
  {
    id: 'T1', name: 'вилка Nxc7+',
    fen: 'r3k2r/ppp2pb1/5q2/1N1P2pp/2B1P3/3Q1b2/PP3P2/R3K1R1 b - - 0 20',
    expect: { hasThreat: true, T: 'Nxc7+', targets: ['a8', 'c7'], optional: ['e8'], motif: 'fork', difficulty: 2 },
  },
  {
    id: 'T2', name: 'ферзь под конём (1.e4 d5 2.exd5 Qxd5 3.Nc3)',
    fen: 'rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3',
    expect: { hasThreat: true, T: 'Nxd5', targets: ['d5'], motif: 'hanging', difficulty: 1 },
  },
  {
    id: 'T3', name: 'мат по последней горизонтали',
    fen: '6k1/5ppp/8/8/8/8/r4PPP/4R1K1 b - - 0 1',
    expect: { hasThreat: true, T: 'Re8#', targets: ['g8'], motif: 'back_rank', difficulty: 1 },
  },
  {
    id: 'T4', name: 'нет угрозы (после 1.e4)',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    expect: { hasThreat: false },
  },
];

const GAME_TESTS = [
  {
    id: 'G1', name: 'Морфи — герцог и граф, 1858',
    pgn: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#',
    expectSacs: ['10. Nxb5', '13. Rxd7', '16. Qb8+'],
  },
  {
    id: 'G2', name: 'Андерсен — Дюфрень, 1852 («Вечнозелёная»)',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#',
    expectSacs: ['17. Nf6+', '20. Rxe7+', '21. Qxd7+'],
  },
];

const BUILD_SAC_TESTS = [
  {
    id: 'P1',
    name: 'buildSacRowsForGame — Opera game: numeric evals + UCI accepted_pv',
    pgn: GAME_TESTS.find(g => g.id === 'G1')!.pgn,
    gameId: 'opera-1858',
    filter: 'all' as const,
    white: 'Morphy',
    black: 'Duke of Brunswick and Count Isouard',
  },
];

const P16 = 'rn1r2k1/pbq2ppp/1p1bp3/2pPN3/4PB2/6PB/PPQ2P1P/R4RK1 w - - 0 16';
const DW = 'r1bq1rk1/pppnbppp/2n1p3/3pP3/3P3P/2NB1N2/PPP2PP1/R1BQK2R w KQ - 0 8';
const DF = 'r1bq1rk1/ppp1bppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQK2R w KQ - 0 7';

const SAC_TEXT_TESTS: Array<{
  id: string;
  kind: 'lineOutcome' | 'lineSan';
  fen?: string;
  sacUci?: string;
  pv: string[];
  cpWhite?: number | null;
  mateWhite?: number | null;
  maxPlies?: number;
  fenStart?: string;
  expect: string | string[];
}> = [
  { id: 'L1', kind: 'lineOutcome', fen: P16, sacUci: 'e5f7', pv: ['c7f7','h3e6','f7e6','d5e6','b8c6','f1d1'], cpWhite: 661, mateWhite: null, expect: 'выигрыш ферзя' },
  { id: 'L2', kind: 'lineOutcome', fen: P16, sacUci: 'e5f7', pv: ['e6e5','f7d8','c7d8','f4e3','b7c8','h3c8'], cpWhite: 566, mateWhite: null, expect: 'выигрыш материала (+3)' },
  { id: 'L3', kind: 'lineOutcome', fen: DW, sacUci: 'd3h7', pv: ['g8h7','f3g5','h7g6','h4h5','g6h6','g5f7'], cpWhite: 706, mateWhite: null, expect: 'перевес +7.1' },
  { id: 'L4', kind: 'lineOutcome', fen: DF, sacUci: 'd3h7', pv: ['f6h7','h2h4','e7b4','f3g5','d8e8','g5h7'], cpWhite: -444, mateWhite: null, expect: 'чёрные отбиваются' },
  { id: 'L5', kind: 'lineOutcome', fen: DW, sacUci: 'd3h7', pv: ['g8h7','f3g5','h7h6','g5f7','h6h7','f7d8','e7d8','h1h3'], cpWhite: null, mateWhite: null, maxPlies: 8, expect: 'выигрыш ферзя' },
  { id: 'LS1', kind: 'lineSan', fenStart: undefined, sacUci: 'e5f7', pv: ['c7f7','h3e6','f7e6','d5e6'], expect: ['Qxf7','Bxe6','Qxe6','dxe6'] },
  { id: 'LS2', kind: 'lineSan', fenStart: undefined, sacUci: 'e5f7', pv: ['c7f7','a1a8','f7e6'], expect: ['Qxf7'] },
];

const T1_FEN = 'r3k2r/ppp2pb1/5q2/1N1P2pp/2B1P3/3Q1b2/PP3P2/R3K1R1 b - - 0 20';

const BUILD_THREAT_TESTS = [
  {
    id: 'Q1',
    name: 'buildThreatRowsForGame — skips opponent-color rows, correct ply',
    gameId: 'q1-test',
    gameColor: 'b' as const,
    rows: [
      // White's row — SKIPPED (gameColor='b')
      { move_number: 10, color: 'w' as const, san: 'Nb5', fen_before: T1_FEN, eval_before: 0, classification: 'mistake' },
      // Black's row — PROCESSED, ply = (10-1)*2+2 = 20
      { move_number: 10, color: 'b' as const, san: 'Qf6', fen_before: T1_FEN, eval_before: 0, classification: 'mistake' },
    ] as ThreatAnalysisRow[],
    expectRowCount: 1,
    expectPly: 20,
  },
];

function check(got: Record<string, unknown>, expect: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(expect)) {
    const g = got[k];
    const same = Array.isArray(v) ? JSON.stringify(g) === JSON.stringify(v) : g === v;
    if (!same) bad.push(`${k}: ждали ${JSON.stringify(v)}, получили ${JSON.stringify(g)}`);
  }
  return bad;
}

const want = (id: string) => !ONLY || ONLY.includes(id);

(async () => {
  const engine = await createNodeEngine();
  const DEPTH = 18;
  console.log(`Глубина ${DEPTH}\n`);
  let pass = 0, total = 0;
  const t0 = Date.now();

  for (const t of SAC_TESTS) {
    if (!want(t.id)) continue;
    total++;
    const r = await analyseSac(engine, t.fen, t.move) as SacResult & Record<string, unknown>;
    const bad = check(r as Record<string, unknown>, t.expect as Record<string, unknown>);
    if (!bad.length) pass++;
    console.log(
      `${bad.length ? '✗' : '✓'} ${t.id} ${t.name}: ${
        r.isSac
          ? `жертва · тип ${r.type} · ${r.kind ?? 'спорно'} · ${r.pattern} · отдал ${r.given}${
              r.mate_in
                ? ` · мат за ${r.mate_in}${r.mate_forced ? '' : ' (если взять)'}`
                : ''
            } · score ${r.score} · ${r.keep ? 'в тренажёр' : `не берём (${r.notKept})`}`
          : `не жертва — ${r.reason}`
      }`
    );
    if (r.best)
      console.log(
        `    лучший ${r.bestSan} ${r.best} · без жертвы ${r.altSan} ${r.alt} · после хода ${r.after}`
      );
    if (r.accepted)
      console.log(
        `    приняли: ${r.accepted}\n    материал по полуходам: ${r.deltas}`
      );
    for (const b of bad) console.log(`    ОШИБКА ${b}`);
  }

  for (const t of DECOY_TESTS) {
    if (!want(t.id)) continue;
    total++;
    const got = temptingMoves(t.fen);
    const ok = JSON.stringify(got) === JSON.stringify(t.expect);
    if (ok) pass++;
    console.log(
      `${ok ? '✓' : '✗'} ${t.id} ${t.name}: ${got.join(', ') || 'нет'}${
        ok ? '' : `\n    ОШИБКА ждали ${t.expect.join(', ') || 'нет'}`
      }`
    );
  }

  for (const t of THREAT_TESTS) {
    if (!want(t.id)) continue;
    total++;
    const r = await analyseThreat(engine, t.fen) as ThreatResult & Record<string, unknown>;
    const bad = check(r as Record<string, unknown>, t.expect as Record<string, unknown>);
    if (!bad.length) pass++;
    console.log(
      `${bad.length ? '✗' : '✓'} ${t.id} ${t.name}: ${
        r.hasThreat
          ? `угроза ${r.T} · цели ${(r.targets as string[]).join(',')}${
              (r.optional as string[]).length ? ` (+можно ${(r.optional as string[]).join(',')})` : ''
            } · ${r.title} · сложность ${r.difficulty}`
          : r.usable === false
          ? `не берём — ${r.reason}`
          : 'угрозы нет'
      }`
    );
    console.log(
      `    сейчас ${r.cur} (за ходящего) · нулевой ход ${r.nul} (за соперника) · gain ${r.gain} · линия ${r.line}`
    );
    for (const b of bad) console.log(`    ОШИБКА ${b}`);
  }

  for (const G of GAME_TESTS) {
    if (!want(G.id)) continue;
    total++;
    const g = new Chess();
    g.loadPgn(G.pgn);
    const hist = g.history({ verbose: true });
    const found: Array<{ label: string; r: SacResult }> = [];
    const rejected: Array<{ label: string; r: SacResult }> = [];
    for (let i = 0; i < hist.length; i++) {
      const m = hist[i];
      const label = `${Math.floor(i / 2) + 1}.${i % 2 ? '..' : ''} ${m.san}`;
      if (!quickSac(m.before, uciOf(m)).ok) continue;
      const r = await analyseSac(engine, m.before, uciOf(m));
      if (r.isSac) found.push({ label, r });
      else rejected.push({ label, r });
    }
    const labels = found.map(x => x.label);
    const ok = !G.expectSacs || JSON.stringify(labels) === JSON.stringify(G.expectSacs);
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} ${G.id} ${G.name}: жертвы — ${labels.join(', ') || 'нет'}`);
    for (const { label, r } of found)
      console.log(
        `    ${label}: тип ${r.type} · ${r.kind ?? 'спорно'} · ${r.pattern} · отдал ${r.given}${
          r.mate_in ? ` · мат за ${r.mate_in}${r.mate_forced ? '' : ' (если взять)'}` : ''
        } · score ${r.score} · ${r.keep ? 'в тренажёр' : `не берём (${r.notKept})`}\n      лучший ${r.bestSan} ${r.best} · без жертвы ${r.altSan} ${r.alt} · после ${r.after}\n      приняли: ${r.accepted}`
      );
    for (const { label, r } of rejected)
      console.log(
        `    отсеяно ${label}: ${r.reason}${
          r.best
            ? `\n      лучший ${r.bestSan} ${r.best} · без жертвы ${r.altSan} ${r.alt} · после ${r.after}\n      приняли: ${r.accepted}`
            : ''
        }`
      );
    if (!ok) console.log(`    ОШИБКА ждали ${G.expectSacs.join(', ')}`);
  }

  for (const t of BUILD_SAC_TESTS) {
    if (!want(t.id)) continue;
    total++;
    const rows = await buildSacRowsForGame(t.pgn, t.gameId, engine, t.filter, t.white, t.black);
    const bad: string[] = [];
    if (rows.length === 0) bad.push('нет строк');
    for (const row of rows) {
      if (typeof row.eval_before !== 'number' && row.eval_before !== null)
        bad.push(`eval_before не число: ${JSON.stringify(row.eval_before)}`);
      if (row.accepted_pv && !/^[a-h][1-8][a-h][1-8]/.test(row.accepted_pv))
        bad.push(`accepted_pv не UCI: ${row.accepted_pv}`);
    }
    if (!bad.length) pass++;
    console.log(
      `${bad.length ? '✗' : '✓'} ${t.id} ${t.name}: ${rows.length} строк` +
      (rows.length ? ` · ходы ${rows.map(r => r.move).join(', ')}` : '')
    );
    for (const b of bad) console.log(`    ОШИБКА ${b}`);
  }

  for (const t of BUILD_THREAT_TESTS) {
    if (!want(t.id)) continue;
    total++;
    const rows = await buildThreatRowsForGame(t.rows, t.gameId, t.gameColor, engine);
    const bad: string[] = [];
    if (rows.length !== t.expectRowCount)
      bad.push(`ожидали ${t.expectRowCount} строк, получили ${rows.length}`);
    if (t.expectPly !== undefined && rows[0]?.ply !== t.expectPly)
      bad.push(`ply: ждали ${t.expectPly}, получили ${rows[0]?.ply}`);
    if (!bad.length) pass++;
    console.log(
      `${bad.length ? '✗' : '✓'} ${t.id} ${t.name}: ${rows.length} строк` +
      (rows.length ? ` · ply ${rows.map(r => r.ply).join(', ')} · has_threat ${rows.map(r => r.has_threat).join(', ')}` : '')
    );
    for (const b of bad) console.log(`    ОШИБКА ${b}`);
  }

  // sac-text.ts тесты (синхронные, без движка)
  for (const t of SAC_TEXT_TESTS) {
    if (!want(t.id)) continue;
    total++;
    let got: string | string[];
    if (t.kind === 'lineOutcome') {
      got = lineOutcome(t.fen!, t.sacUci!, t.pv, t.cpWhite ?? null, t.mateWhite ?? null, t.maxPlies);
    } else {
      const fStart = t.fenStart ?? fenAfterSac(P16, t.sacUci!);
      got = lineSan(fStart, t.pv);
    }
    const ok = JSON.stringify(got) === JSON.stringify(t.expect);
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} ${t.id}: получили ${JSON.stringify(got)}${ok ? '' : ` ожидали ${JSON.stringify(t.expect)}`}`);
  }

  console.log(`\nИтог: ${pass} из ${total} · ${Math.round((Date.now() - t0) / 1000)} с`);
  (engine as unknown as { quit(): void }).quit();
  setTimeout(() => process.exit(pass === total ? 0 : 1), 200);
})();
