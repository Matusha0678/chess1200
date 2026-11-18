export interface EngineLine {
  move: string;
  pv: string[];
  cp: number | null;
  mate: number | null;
}

export interface Engine {
  analyse(
    fen: string,
    opts?: { multipv?: number; depth?: number; searchmoves?: string[] }
  ): Promise<EngineLine[]>;
}

// ── Utility functions ──────────────────────────────────────────────────────

export function isMateFor(line: EngineLine, side: 'w' | 'b'): boolean {
  return line.mate !== null && Math.sign(line.mate) === (side === 'w' ? 1 : -1);
}

/** Score in pawns for side. Mate in N = ±(100-N) so mate distances can be compared. */
export function forSide(line: EngineLine, side: 'w' | 'b'): number {
  const pawnsWhite =
    line.mate !== null
      ? Math.sign(line.mate) * (100 - Math.abs(line.mate))
      : (line.cp ?? 0) / 100;
  return (side === 'w' ? 1 : -1) * pawnsWhite;
}

/** Win probability 0..1 for side. */
export function wp(line: EngineLine, side: 'w' | 'b'): number {
  if (line.mate !== null) return isMateFor(line, side) ? 1 : 0;
  const cp = side === 'w' ? (line.cp ?? 0) : -(line.cp ?? 0);
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

/** Format evaluation as "+6.62" or "M2" or "−M3". */
export function fmtEval(line: EngineLine, side: 'w' | 'b'): string {
  if (line.mate !== null) {
    return `${isMateFor(line, side) ? '' : '−'}M${Math.abs(line.mate)}`;
  }
  return forSide(line, side).toFixed(2);
}

// ── Browser Engine (Web Worker) ────────────────────────────────────────────

class BrowserEngine implements Engine {
  private worker: Worker;
  private buf = '';
  private lines: string[] = [];
  private waiter: { re: RegExp; resolve: (lines: string[]) => void } | null = null;
  private queue: Array<() => Promise<void>> = [];
  private busy = false;

  constructor() {
    this.worker = new Worker('/stockfish/stockfish-19-lite-single.js');
    this.worker.onmessage = (e: MessageEvent) => {
      const data: string = typeof e.data === 'string' ? e.data : String(e.data);
      this.buf += data + '\n';
      let i: number;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const l = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.lines.push(l);
        if (this.waiter && this.waiter.re.test(l)) {
          const w = this.waiter;
          this.waiter = null;
          w.resolve(this.lines);
          this.lines = [];
        }
      }
    };
  }

  private send(cmd: string): void {
    this.worker.postMessage(cmd);
  }

  private until(re: RegExp): Promise<string[]> {
    return new Promise(resolve => {
      this.waiter = { re, resolve };
    });
  }

  async init(): Promise<void> {
    this.send('uci');
    await this.until(/^uciok/);
    this.send('setoption name Skill Level value 20');
    this.send('setoption name Hash value 32');
  }

  async analyse(
    fen: string,
    { multipv = 1, depth = 18, searchmoves }: { multipv?: number; depth?: number; searchmoves?: string[] } = {}
  ): Promise<EngineLine[]> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        try {
          resolve(await this._analyse(fen, { multipv, depth, searchmoves }));
        } catch (e) {
          reject(e);
        }
      };
      this.queue.push(run);
      this._drain();
    });
  }

  private async _drain(): Promise<void> {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const task = this.queue.shift()!;
    await task();
    this.busy = false;
    this._drain();
  }

  private async _analyse(
    fen: string,
    { multipv = 1, depth = 18, searchmoves }: { multipv?: number; depth?: number; searchmoves?: string[] }
  ): Promise<EngineLine[]> {
    this.send('ucinewgame');
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send('isready');
    await this.until(/^readyok/);
    this.send(`position fen ${fen}`);
    this.send(
      `go depth ${depth}` + (searchmoves && searchmoves.length ? ` searchmoves ${searchmoves.join(' ')}` : '')
    );
    const out = await this.until(/^bestmove/);

    const stm = fen.split(' ')[1] as 'w' | 'b';
    const last: Record<number, { d: number; l: string }> = {};
    for (const l of out) {
      if (!l.startsWith('info ') || !l.includes(' pv ') || / (upper|lower)bound /.test(l)) continue;
      const dm = l.match(/ depth (\d+)/);
      if (!dm) continue;
      const d = Number(dm[1]);
      const km = l.match(/ multipv (\d+)/);
      const k = km ? Number(km[1]) : 1;
      if (!last[k] || d >= last[k].d) last[k] = { d, l };
    }

    return Object.keys(last)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => {
        const l = last[Number(k)].l;
        const sc = l.match(/score (cp|mate) (-?\d+)/);
        const sgn = stm === 'w' ? 1 : -1;
        const pv = l.split(' pv ')[1].trim().split(/\s+/);
        return {
          move: pv[0],
          pv,
          cp: sc && sc[1] === 'cp' ? sgn * Number(sc[2]) : null,
          mate: sc && sc[1] === 'mate' ? sgn * Number(sc[2]) : null,
        };
      });
  }

  quit(): void {
    this.send('quit');
    this.worker.terminate();
  }
}

export async function createBrowserEngine(): Promise<Engine & { quit(): void; init(): Promise<void> }> {
  const engine = new BrowserEngine();
  await engine.init();
  return engine;
}
