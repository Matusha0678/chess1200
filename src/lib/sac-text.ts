// src/lib/sac-text.ts — чистые функции для текстового вывода жертв.
// Нет импортов из Next.js или React.

import { Chess } from 'chess.js';

/** Позиция после жертвы. */
export function fenAfterSac(fen: string, sacUci: string): string {
  try {
    const ch = new Chess(fen);
    ch.move({
      from: sacUci.slice(0, 2),
      to: sacUci.slice(2, 4),
      promotion: (sacUci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n',
    });
    return ch.fen();
  } catch {
    return fen;
  }
}

/** Ходы в SAN по порядку от fenStart. На первом невозможном ходе — стоп. */
export function lineSan(fenStart: string, pv: string[]): string[] {
  const result: string[] = [];
  let curFen = fenStart;
  for (const uci of pv) {
    if (!uci || uci.length < 4) break;
    try {
      const ch = new Chess(curFen);
      const mv = ch.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n',
      });
      if (!mv) break;
      result.push(mv.san);
      curFen = ch.fen();
    } catch {
      break;
    }
  }
  return result;
}

// Ценность фигур: P=1, N=3, B=3, R=5, Q=9.
const PIECE_VAL: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

function materialBalance(ch: Chess, side: 'w' | 'b'): number {
  let mine = 0, opp = 0;
  for (const row of ch.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const v = PIECE_VAL[cell.type] ?? 0;
      if (cell.color === side) mine += v;
      else opp += v;
    }
  }
  return mine - opp;
}

/** Итог варианта. fenBefore — позиция до жертвы (ход S); pv — ходы UCI после жертвы;
 *  cpWhite и mateWhite — как у движка (за белых). maxPlies по умолчанию 6. */
export function lineOutcome(
  fenBefore: string,
  sacUci: string,
  pv: string[],
  cpWhite: number | null,
  mateWhite: number | null,
  maxPlies = 6,
): string {
  // Определяем сторону S
  const chBefore = new Chess(fenBefore);
  const S = chBefore.turn(); // 'w' или 'b'
  const opp: 'w' | 'b' = S === 'w' ? 'b' : 'w';

  // 1. Мат за S
  if (mateWhite !== null) {
    const mateForS = S === 'w' ? mateWhite > 0 : mateWhite < 0;
    if (mateForS) return `мат в ${Math.abs(mateWhite)} ходов`;
  }

  // 2. Сыграть жертву и до maxPlies ходов
  const fenAfter = fenAfterSac(fenBefore, sacUci);
  if (fenAfter === fenBefore) {
    // Жертва не сыграна — переходим к оценке
  } else {
    // Баланс материала до жертвы
    const balanceBefore = materialBalance(chBefore, S);

    // Проходим pv
    // Ходы в pv: pv[0] — ответ соперника (opp), pv[1] — ход S, pv[2] — opp, ...
    let lastOppFen: string | null = null;

    // Определяем, чей ход сейчас в fenAfter
    const chAfter0 = new Chess(fenAfter);
    // После жертвы ход перешёл к opp (они должны взять или сделать ход)
    // pv[0] = opp, pv[1] = S, pv[2] = opp, ...
    const curChess = chAfter0;
    const limit = Math.min(pv.length, maxPlies);

    for (let i = 0; i < limit; i++) {
      const uci = pv[i];
      if (!uci || uci.length < 4) break;
      try {
        const mv = curChess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n',
        });
        if (!mv) break;
        // Это был ход opp (i=0,2,4...) или S (i=1,3,5...)?
        // В fenAfter ход opp, т.е. pv[0] = opp, pv[1] = S, etc.
        const isOppMove = i % 2 === 0;
        if (isOppMove) {
          lastOppFen = curChess.fen();
        }
      } catch {
        break;
      }
    }

    if (lastOppFen !== null) {
      const chLast = new Chess(lastOppFen);
      const balanceAfter = materialBalance(chLast, S);
      const delta = balanceAfter - balanceBefore;

      // 3. S взял ферзя соперника, свой ферзь цел, Δ ≥ 2 → «выигрыш ферзя»
      if (delta >= 2) {
        // Проверяем: в исходной позиции был ферзь opp? Его нет в lastOppFen?
        // И ферзь S есть в lastOppFen?
        let oppQueenBefore = false;
        let myQueenAfter = false;
        let oppQueenAfter = false;
        for (const row of chBefore.board()) {
          for (const cell of row) {
            if (cell?.type === 'q' && cell.color === opp) oppQueenBefore = true;
          }
        }
        for (const row of chLast.board()) {
          for (const cell of row) {
            if (cell?.type === 'q' && cell.color === S) myQueenAfter = true;
            if (cell?.type === 'q' && cell.color === opp) oppQueenAfter = true;
          }
        }
        if (oppQueenBefore && !oppQueenAfter && myQueenAfter) {
          return 'выигрыш ферзя';
        }
        // 4. Δ ≥ 2 → «выигрыш материала (+Δ)»
        return `выигрыш материала (+${delta})`;
      }
    }
  }

  // 5. Оценка за S ≥ +1.5
  if (cpWhite !== null) {
    const cpForS = S === 'w' ? cpWhite : -cpWhite;
    if (cpForS >= 150) {
      const v = cpForS / 100;
      return `перевес +${v.toFixed(1)}`;
    }
  }

  // 6. Иначе — соперник отбивается
  return opp === 'w' ? 'белые отбиваются' : 'чёрные отбиваются';
}
