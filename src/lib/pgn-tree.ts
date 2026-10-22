import { Chess } from 'chess.js';
import type { ChessMove } from '@/types/openings';

// ── Internal AST ─────────────────────────────────────────────────────────────

interface RawMoveNode {
  san: string;
  variations: RawMoveNode[][];
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

type Token =
  | { type: 'san'; value: string }
  | { type: 'move_num' }
  | { type: 'nag_or_annotation' }
  | { type: 'comment' }
  | { type: 'var_start' }
  | { type: 'var_end' }
  | { type: 'result' };

// SAN regex: castling must come before piece moves (longest match first)
const SAN_RE = /^(O-O-O[+#]?|O-O[+#]?|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?)/;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    // skip whitespace
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }

    // comment {…}
    if (text[i] === '{') {
      const end = text.indexOf('}', i);
      i = end === -1 ? text.length : end + 1;
      tokens.push({ type: 'comment' });
      continue;
    }

    // variation start
    if (text[i] === '(') {
      tokens.push({ type: 'var_start' });
      i++;
      continue;
    }

    // variation end
    if (text[i] === ')') {
      tokens.push({ type: 'var_end' });
      i++;
      continue;
    }

    // NAG  $N
    if (text[i] === '$') {
      // consume digits after $
      let j = i + 1;
      while (j < text.length && /\d/.test(text[j])) j++;
      tokens.push({ type: 'nag_or_annotation' });
      i = j;
      continue;
    }

    // game result tokens  1-0  0-1  1/2-1/2  *
    if (text[i] === '*') {
      tokens.push({ type: 'result' });
      i++;
      continue;
    }
    if (text.startsWith('1-0', i) || text.startsWith('0-1', i)) {
      tokens.push({ type: 'result' });
      i += 3;
      continue;
    }
    if (text.startsWith('1/2-1/2', i)) {
      tokens.push({ type: 'result' });
      i += 7;
      continue;
    }

    // move number  N.  or  N...
    if (/\d/.test(text[i])) {
      let j = i;
      while (j < text.length && /\d/.test(text[j])) j++;
      // consume dots
      while (j < text.length && text[j] === '.') j++;
      tokens.push({ type: 'move_num' });
      i = j;
      continue;
    }

    // annotation symbols (standalone, not part of SAN)
    // Must check BEFORE SAN so that a leading ! or ? is not consumed as SAN
    if (/^[!?]/.test(text[i])) {
      // consume the whole annotation glyph
      let j = i;
      while (j < text.length && /[!?]/.test(text[j])) j++;
      tokens.push({ type: 'nag_or_annotation' });
      i = j;
      continue;
    }

    // SAN move
    const rest = text.slice(i);
    const m = SAN_RE.exec(rest);
    if (m) {
      tokens.push({ type: 'san', value: m[1] });
      i += m[1].length;
      // strip trailing annotation symbols that might have been glued to the SAN
      // (e.g. "Nf3!?" would be captured by SAN_RE only up to "Nf3" since [!?] aren't in the regex)
      continue;
    }

    // unknown character – skip
    i++;
  }

  return tokens;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a sequence of tokens starting at startIdx into RawMoveNodes.
 * Stops at var_end, result, or end of token array.
 *
 * PGN convention: a parenthesised variation that appears AFTER move N is an
 * alternative to move N – it branches from the position BEFORE move N.
 * Therefore variations are attached to the node that PRECEDES them.
 * If a variation appears before any move has been seen yet (very unusual) it
 * is kept in pendingVariations and attached to the first SAN encountered.
 */
function parseMoveSequence(
  tokens: Token[],
  startIdx: number,
): { nodes: RawMoveNode[]; nextIdx: number } {
  const nodes: RawMoveNode[] = [];
  let i = startIdx;

  // Variations that appeared before the first SAN in this sequence
  let pendingVariations: RawMoveNode[][] = [];

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok.type === 'result' || tok.type === 'var_end') {
      break;
    }

    if (tok.type === 'move_num' || tok.type === 'comment' || tok.type === 'nag_or_annotation') {
      i++;
      continue;
    }

    if (tok.type === 'var_start') {
      // parse the variation recursively
      const { nodes: varNodes, nextIdx } = parseMoveSequence(tokens, i + 1);
      // consume the closing var_end token if present
      i = tokens[nextIdx]?.type === 'var_end' ? nextIdx + 1 : nextIdx;

      if (nodes.length > 0) {
        // Attach to the most-recently-parsed move (it is the alternative to that move)
        nodes[nodes.length - 1].variations.push(varNodes);
      } else {
        // No move parsed yet in this sequence – hold for the first SAN
        pendingVariations.push(varNodes);
      }
      continue;
    }

    if (tok.type === 'san') {
      const node: RawMoveNode = {
        san: tok.value,
        // Flush any pre-move pending variations onto this first node
        variations: pendingVariations,
      };
      pendingVariations = [];
      nodes.push(node);
      i++;
      continue;
    }

    i++;
  }

  return { nodes, nextIdx: i };
}

// ── Line extractor ────────────────────────────────────────────────────────────

/**
 * Strip annotation glyphs that may have slipped into a SAN string.
 * chess.js v1 rejects moves with trailing ! or ?.
 */
function cleanSan(san: string): string {
  return san.replace(/[!?]+$/, '').trim();
}

/**
 * Recursively walk the RawMoveNode tree and collect all leaf-to-root paths.
 *
 * @param nodes   - remaining moves in the current sequence
 * @param chess   - Chess instance representing the position BEFORE nodes[0] is played
 * @param soFar   - moves already played in this path
 */
function getAllLines(
  nodes: RawMoveNode[],
  chess: Chess,
  soFar: ChessMove[],
): ChessMove[][] {
  // Base case: no more moves → this path is a complete line
  if (nodes.length === 0) {
    return soFar.length > 0 ? [soFar] : [];
  }

  const [head, ...tail] = nodes;
  const results: ChessMove[][] = [];

  // --- Process variations (alternatives to head.san) ---
  // Each variation starts from the CURRENT chess position (before head.san)
  for (const varNodes of head.variations) {
    if (varNodes.length === 0) continue;
    // Clone the chess position for this variation branch
    const varChess = new Chess(chess.fen());
    const varLines = getAllLines(varNodes, varChess, soFar);
    results.push(...varLines);
  }

  // --- Process main move (head.san) ---
  const mainChess = new Chess(chess.fen());
  const san = cleanSan(head.san);

  let moveResult;
  try {
    moveResult = mainChess.move(san);
  } catch {
    // Invalid move – skip this branch entirely
    return results;
  }

  if (!moveResult) {
    return results;
  }

  const chessMove: ChessMove = {
    san: moveResult.san,
    from: moveResult.from,
    to: moveResult.to,
    fen: mainChess.fen(),
    color: moveResult.color as 'w' | 'b',
  };

  const newSoFar = [...soFar, chessMove];

  if (tail.length === 0) {
    // End of this sequence → emit the line
    results.push(newSoFar);
  } else {
    const mainLines = getAllLines(tail, mainChess, newSoFar);
    results.push(...mainLines);
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a PGN string and return every distinct line (variation path) as an
 * array of ChessMove objects, each containing the FEN after the move.
 *
 * Supports:
 *  - PGN headers (stripped)
 *  - Variations in parentheses (nested)
 *  - NAGs ($1, $6, …)
 *  - Inline comments {…}
 *  - Annotation glyphs (!, ?, !?, ?!, !!, ??)
 *  - Standard result tokens (1-0, 0-1, 1/2-1/2, *)
 */
export function extractLinesFromPgn(pgn: string): ChessMove[][] {
  // 1. Strip PGN headers (lines that start with '[')
  const moveText = pgn
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('['))
    .join(' ');

  // 2. Tokenize
  const tokens = tokenize(moveText);

  // 3. Parse into AST
  const { nodes } = parseMoveSequence(tokens, 0);

  if (nodes.length === 0) return [];

  // 4. Walk the tree, collecting all lines
  const chess = new Chess();
  return getAllLines(nodes, chess, []);
}
