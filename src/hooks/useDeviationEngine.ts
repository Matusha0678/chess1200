'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface DevTopMove {
  uci: string;
  cp?: number;    // centipawns, white's perspective
  mate?: number;
}

export interface DevAnalysisResult {
  moves: DevTopMove[];  // multipv 1 first
}

export function useDeviationEngine() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);

  const callbackRef    = useRef<((r: DevAnalysisResult) => void) | null>(null);
  const latestMovesRef = useRef<Map<number, DevTopMove>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const worker = new Worker('/stockfish/stockfish-19-lite-single.js');

    worker.onmessage = (e: MessageEvent<string>) => {
      const line = e.data;

      if (line === 'uciok') {
        worker.postMessage('isready');
      }

      if (line === 'readyok') {
        setIsReady(true);
      }

      // Collect the latest info line per multipv slot
      if (line.startsWith('info')) {
        const pvMatch   = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (!pvMatch) return;

        const mpvMatch  = line.match(/\bmultipv (\d+)\b/);
        const cpMatch   = line.match(/\bscore cp (-?\d+)\b/);
        const mateMatch = line.match(/\bscore mate (-?\d+)\b/);

        const slot = mpvMatch ? parseInt(mpvMatch[1]) : 1;
        latestMovesRef.current.set(slot, {
          uci:  pvMatch[1],
          cp:   cpMatch   ? parseInt(cpMatch[1])   : undefined,
          mate: mateMatch ? parseInt(mateMatch[1]) : undefined,
        });
      }

      if (line.startsWith('bestmove')) {
        const moves: DevTopMove[] = [];
        const sorted = Array.from(latestMovesRef.current.keys()).sort((a, b) => a - b);
        for (const k of sorted) {
          const m = latestMovesRef.current.get(k);
          if (m) moves.push(m);
        }
        callbackRef.current?.({ moves });
        callbackRef.current = null;
        latestMovesRef.current.clear();
      }
    };

    worker.onerror = console.error;
    worker.postMessage('uci');
    workerRef.current = worker;

    return () => {
      worker.postMessage('quit');
      worker.terminate();
    };
  }, []);

  const analyze = useCallback(
    (fen: string, depth: number, n: number, cb: (r: DevAnalysisResult) => void) => {
      if (!workerRef.current || !isReady) return;
      latestMovesRef.current.clear();
      callbackRef.current = cb;
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`setoption name MultiPV value ${n}`);
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(`go depth ${depth}`);
    },
    [isReady],
  );

  return { analyze, isReady };
}
