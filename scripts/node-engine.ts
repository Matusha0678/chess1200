import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { Engine, EngineLine } from '../src/lib/engine';

export type { Engine, EngineLine } from '../src/lib/engine';

class NodeEngine implements Engine {
  private p: ReturnType<typeof spawn>;
  private buf = '';
  private lines: string[] = [];
  private waiter: { re: RegExp; resolve: (lines: string[]) => void } | null = null;
  private queue: Array<() => Promise<void>> = [];
  private busy = false;

  constructor(file: string) {
    this.p = spawn(process.execPath, [file], {
      cwd: path.dirname(file),
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    this.p.stdout!.on('data', (d: Buffer) => {
      this.buf += d.toString();
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
    });
  }

  private send(cmd: string): void {
    this.p.stdin!.write(cmd + '\n');
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
    opts: { multipv?: number; depth?: number; searchmoves?: string[] } = {}
  ): Promise<EngineLine[]> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        try {
          resolve(await this._analyse(fen, opts));
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
    { multipv = 1, depth = 18, searchmoves }: { multipv?: number; depth?: number; searchmoves?: string[] } = {}
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
  }
}

export async function createNodeEngine(filePath?: string): Promise<Engine & { quit(): void }> {
  const candidates = [
    path.join(process.cwd(), 'node_modules/stockfish/bin/stockfish-19-lite-single.js'),
    path.join(process.cwd(), 'public/stockfish/stockfish-19-lite-single.js'),
  ];
  const file = filePath || candidates.find(p => fs.existsSync(p));
  if (!file) throw new Error('stockfish-19-lite-single.js not found');
  const engine = new NodeEngine(file);
  await engine.init();
  return engine;
}
